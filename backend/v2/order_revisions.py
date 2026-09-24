"""Immutable content, explicit children, optimistic locks and atomic submit receipts."""
from uuid import uuid4
from datetime import datetime,timezone
from psycopg.types.json import Jsonb
from .calculation_math import plain,hash_value
from . import catalogue,financial_profiles
from .events import record_event
from .security import error


def locked(conn,order_id,expected=None):
    order=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR UPDATE',(order_id,)).fetchone()
    if not order: error(404,'ORDER_NOT_FOUND')
    if expected is not None:
        value=str(expected).strip('"')
        if not value.isdigit(): error(428,'VERSION_REQUIRED')
        if order['optimistic_lock_version']!=int(value): error(412,'REVISION_CONFLICT')
    return order

def evidence(conn,order):
    rows=conn.execute('SELECT * FROM mf_order_draft_rows WHERE order_id=%s ORDER BY draft_row_id',(order['order_id'],)).fetchall()
    imports=conn.execute('SELECT import_id,file_id,template_revision_id,release_id,selected_sheets,summary FROM mf_import_batches WHERE order_id=%s ORDER BY import_id',(order['order_id'],)).fetchall()
    sources=conn.execute("SELECT file_id,sha256,size_bytes,status FROM mf_files WHERE order_id=%s AND kind='source' ORDER BY file_id",(order['order_id'],)).fetchall()
    return plain({'business_name':order['business_name'],'preparation_mode':order['preparation_mode'],'draft_rows':rows,'imports':imports,'sources':sources})

def context(conn,order_id):
    return conn.execute('SELECT * FROM mf_order_financial_contexts WHERE order_id=%s ORDER BY created_at DESC,context_id DESC LIMIT 1',(order_id,)).fetchone()

def released(conn,release,ident,kind):
    if not ident: return None
    row=conn.execute('SELECT snapshot,kind FROM mf_catalogue_items WHERE release_id=%s AND item_id=%s',(release,ident)).fetchone()
    if not row or row['kind']!=kind: error(422,'EXACT_RELEASED_ITEM_REQUIRED')
    from .catalogue_model import safe_item
    return safe_item(row['snapshot'],release)

def _material_choice(conn,release,variant,custom):
    material=released(conn,release,variant,'material') if variant else None
    key=None
    if custom:
        material={'name':custom['name'],'article':custom['article'],'manufacturer':custom['manufacturer'],'length':custom['length'],'width':custom['width'],'thickness':custom['thickness'],'family':'customer','raw_description':custom['name'],'reason':custom['reason']}
        key=custom['key']
    return material,key

def normalize(conn,release,detail):
    d=plain(detail.model_dump());custom=d.pop('custom_customer');variant=d.pop('variant_id');backing=d.pop('glue_backing')
    d['material'],key=_material_choice(conn,release,variant,custom)
    if key: d['customer_material_key']=key
    if backing:
        bcustom=backing.pop('custom_customer');bvariant=backing.pop('variant_id')
        backing['material'],bkey=_material_choice(conn,release,bvariant,bcustom)
        if bkey: backing['customer_material_key']=bkey
        d['glue_backing']=backing
    else: d['glue_backing']=None
    d['edges']={s:{'edge':released(conn,release,e['edge_id'],'edge'),'supply_source':e['supply_source'],'state':'confirmed',
                   'selection_mode':e['selection_mode']} for s,e in d['edges'].items()}
    return d

def from_raw(conn,release,row):
    s=row['snapshot'];v=s['values'];r=s.get('resolution') or {};material=None;customer=None
    if r.get('status') in {'exact_match','confirmed_mapping','manual_override'} and r.get('selected'):
        selected=r['selected'];material=released(conn,release,selected.get('variant_id'),'material')
    elif r.get('status')=='custom_customer':
        customer=r['customer_material'];material={**customer,'family':'customer'}
    grain=v.get('texture');rotation=v.get('rotation')
    # Stage 3 raw flags are not silently interpreted as native orientation.
    grain=grain if grain in {'none','length','width'} else 'unknown'
    rotation=rotation if type(rotation) is bool else False
    edges={}
    for side,e in s.get('edges',{}).items():
        none=e.get('mode')=='manual_override' and e.get('edge_id') is None or e.get('mark')=='none'
        confirmed=bool(e.get('confirmed')) and not e.get('conflict')
        edges[side]={'edge':released(conn,release,e['edge_id'],'edge') if e.get('edge_id') and confirmed else None,
                     'supply_source':'company','state':'confirmed' if none or confirmed else 'unresolved',
                     'selection_mode':e.get('selection_mode','manual')}
    return {'detail_id':row['draft_row_id'],'draft_row_id':row['draft_row_id'],'length':v.get('length'),'width':v.get('width'),'qty':v.get('qty'),
        'name':str(v.get('name') or ''),'comments':str(v.get('comments') or ''),
        'material':material,'supply_source':'customer' if customer else 'company','provided_sheets':customer.get('provided_sheets') if customer else None,'customer_reason':customer.get('reason',r.get('reason')) if customer else r.get('reason'),
        'customer_material_key':customer.get('key',row['draft_row_id']) if customer else None,'rotation':rotation,'grain':grain,'route':'solid','packaging':False,'edges':edges}

def create(conn,settings,actor,order,body,manager=False):
    if manager and order['workflow_status'] not in {'submitted','review','awaiting_approval','approved'}: error(409,'SUBMITTED_OR_REVIEW_REQUIRED')
    if manager and conn.execute("SELECT 1 FROM mf_production_jobs WHERE order_id=%s AND purpose='produce' AND status IN ('leased','running','result_uploaded','uncertain','succeeded')",(order['order_id'],)).fetchone():
        error(409,'PRODUCTION_RECONCILIATION_REQUIRED')
    if not manager and order['workflow_status']!='draft': error(409,'DRAFT_REQUIRED')
    if body.parent_revision_id!=order['active_revision_id']: error(412,'PARENT_REVISION_CONFLICT')
    ev=evidence(conn,order);active_rows=[r for r in ev['draft_rows'] if r['excluded_reason'] is None]
    pinned={r['release_id'] for r in active_rows}
    release=body.catalogue_release_id or (next(iter(pinned)) if len(pinned)==1 else catalogue.active(conn))
    if release and not conn.execute('SELECT 1 FROM mf_catalogue_release_seals WHERE release_id=%s',(release,)).fetchone(): error(422,'SEALED_CATALOGUE_REQUIRED')
    selected_context=context(conn,order['order_id']);defaults=financial_profiles.current(conn)
    profile_id=body.production_profile_id or (selected_context['production_profile_id'] if selected_context else defaults['production_profile_id'])
    financial_profiles.get(conn,'production',profile_id)
    issues=[]
    if body.details is not None:
        ids=[d.detail_id for d in body.details];links=[]
        for d in body.details:
            if d.draft_row_id: links.append(str(d.draft_row_id))
            if d.glue_backing and d.glue_backing.draft_row_id: links.append(str(d.glue_backing.draft_row_id))
        if len(set(ids))!=len(ids) or len(set(links))!=len(links) or sum(d.qty for d in body.details)>10000: error(422,'DETAIL_IDENTITIES_OR_QUANTITY_LIMIT')
        active_ids={r['draft_row_id'] for r in active_rows}
        if set(links)-active_ids: error(422,'FOREIGN_DRAFT_ROW')
        details=[normalize(conn,release,d) for d in body.details]
        for r in active_rows:
            if r['draft_row_id'] not in links:
                details.append(from_raw(conn,release,r))
                if r['snapshot'].get('errors'): issues.append({'category':'materials','code':'RAW_PROBLEMATIC_ROW_REQUIRES_CORRECTION','state':'invalid'})
    elif manager and body.parent_revision_id:
        parent=get(conn,order['order_id'],body.parent_revision_id)
        if parent['schema_version']!=4: error(409,'EXPLICIT_STAGE4_DETAILS_REQUIRED')
        if str(release)!=str(parent['catalogue_release_id']): error(409,'EXPLICIT_RELEASE_RESELECTION_REQUIRED')
        details=parent['content']['details'];issues=parent['content']['issues']
    else:
        details=[from_raw(conn,release,r) for r in active_rows]
        if any(r['snapshot'].get('errors') for r in active_rows): issues.append({'category':'materials','code':'RAW_PROBLEMATIC_ROW_REQUIRES_CORRECTION','state':'invalid'})
    # Never guess a replacement release for mixed/raw unresolved identity.
    if len(pinned)>1 and body.details is None: issues.append({'category':'materials','code':'MIXED_PINNED_RELEASES','state':'needs_confirmation'})
    content=plain({'schema_version':4,'catalogue_release_id':release,'production_profile_id':profile_id,
        'details':details,'issues':issues,'source_evidence':ev,'draft_evidence_hash':hash_value(ev),'comment':body.comment})
    ident=uuid4();number=conn.execute('SELECT coalesce(max(revision_number),0)+1 AS n FROM mf_order_revisions WHERE order_id=%s',(order['order_id'],)).fetchone()['n']
    conn.execute('''INSERT INTO mf_order_revisions(revision_id,order_id,revision_number,parent_revision_id,created_by,reason,lifecycle,content_hash,content,schema_version,
      submitted_at,immutable_at,catalogue_release_id,production_profile_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,4,%s,%s,%s,%s)''',
      (ident,order['order_id'],number,body.parent_revision_id,actor,body.reason,'review' if manager else 'draft',hash_value(content),Jsonb(content),
       datetime.now(timezone.utc) if manager else None,datetime.now(timezone.utc) if manager else None,release,profile_id))
    result=conn.execute('''UPDATE mf_orders SET active_revision_id=%s,approved_revision_id=NULL,approved_final_candidate_id=NULL,reviewed_final_candidate_id=NULL,workflow_status=%s,optimistic_lock_version=optimistic_lock_version+1,
      updated_at=now() WHERE order_id=%s RETURNING optimistic_lock_version''',(ident,'review' if manager else 'draft',order['order_id'])).fetchone()
    record_event(conn,settings,actor=actor,action='order.revision.created',object_type='order',object_id=order['order_id'],reason=body.reason,version=number)
    return {'order_id':order['order_id'],'revision_id':str(ident),'revision_number':number,'parent_revision_id':plain(body.parent_revision_id),'content_hash':hash_value(content),**result}

def get(conn,order_id,revision_id):
    row=conn.execute('SELECT * FROM mf_order_revisions WHERE order_id=%s AND revision_id=%s',(order_id,revision_id)).fetchone()
    if not row: error(404,'REVISION_NOT_FOUND')
    return row

def submit(conn,settings,actor,order_id,body,key,expected):
    order=locked(conn,order_id);request_hash=hash_value(body.model_dump())
    if key:
        receipt=conn.execute('SELECT * FROM mf_submission_receipts WHERE order_id=%s AND actor_id=%s AND idempotency_key=%s',(order_id,actor,key)).fetchone()
        if receipt:
            if receipt['request_hash']!=request_hash: error(409,'IDEMPOTENCY_BODY_CONFLICT')
            return receipt['result']
    if not body.revision_id and not body.comment.strip() and order['preparation_mode']!='manager_assisted': error(409,'PACKAGE_NOT_READY')
    if not key or not 8<=len(key)<=128: error(428,'IDEMPOTENCY_KEY_REQUIRED')
    locked(conn,order_id,expected or '')
    if order['workflow_status']!='draft': error(409,'DRAFT_REQUIRED')
    if order['preparation_mode']=='manager_assisted':
        ev=evidence(conn,order)
        if not any(s['status']=='ready' for s in ev['sources']): error(409,'SOURCE_FILE_REQUIRED')
        from .files import read_verified
        from .storage import VolumeStore
        for source in ev['sources']:
            if source['status']=='ready': read_verified(conn,VolumeStore(settings.storage_root),source['file_id'])
        if not body.revision_id:
            from .calculation_models import RevisionRequest
            body_revision=RevisionRequest(parent_revision_id=order['active_revision_id'],reason='Manager-assisted source submission',comment=body.comment)
            made=create(conn,settings,actor,order,body_revision)
            rid=made['revision_id']
        else: rid=body.revision_id
    else:
        if not body.revision_id or not body.preliminary_calculation_id: error(409,'PRELIMINARY_CALCULATION_REQUIRED')
        rid=body.revision_id
    current=locked(conn,order_id)
    if str(current['active_revision_id'])!=str(rid): error(412,'ACTIVE_REVISION_CONFLICT')
    revision=get(conn,order_id,rid)
    if revision['schema_version']!=4 or revision['lifecycle']!='draft': error(409,'STAGE4_DRAFT_REVISION_REQUIRED')
    if revision['content']['draft_evidence_hash']!=hash_value(evidence(conn,current)): error(412,'DRAFT_CHANGED_SINCE_REVISION')
    calculation=None
    if body.preliminary_calculation_id:
        calculation=conn.execute('SELECT * FROM mf_calculations WHERE calculation_id=%s AND revision_id=%s AND order_id=%s',
          (body.preliminary_calculation_id,rid,order_id)).fetchone()
        if not calculation: error(409,'CALCULATION_REVISION_MISMATCH')
    if order['preparation_mode']=='self_prepared' and calculation['completeness'] in {'invalid','needs_confirmation'} and not body.handoff_problematic:
        error(409,'EXPLICIT_PROBLEMATIC_HANDOFF_REQUIRED')
    # Even an incomplete price calculation may also contain invalid input; inspect reasons, not just top-level state.
    if order['preparation_mode']=='self_prepared' and any(r['state']=='invalid' or r['code'] in {'EXACT_RELEASED_MATERIAL_REQUIRED','EXACT_EDGE_REQUIRED','GRAIN_CONFIRMATION_REQUIRED'} for r in calculation['result']['reasons']) and not body.handoff_problematic:
        error(409,'EXPLICIT_PROBLEMATIC_HANDOFF_REQUIRED')
    conn.execute("UPDATE mf_order_revisions SET lifecycle='submitted',submitted_at=now(),immutable_at=now() WHERE revision_id=%s",(rid,))
    updated=conn.execute("UPDATE mf_orders SET workflow_status='submitted',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE order_id=%s RETURNING optimistic_lock_version",(order_id,)).fetchone()
    result=plain({'order_id':order_id,'revision_id':rid,'workflow_status':'submitted','calculation_id':body.preliminary_calculation_id,
        'calculation_state':calculation['completeness'] if calculation else 'calculation_not_available','production_ready':False,**updated})
    conn.execute('INSERT INTO mf_submission_receipts VALUES(%s,%s,%s,%s,%s,%s,%s,now(),%s)',(uuid4(),order_id,actor,key,request_hash,rid,Jsonb(result),Jsonb(plain(body.model_dump()))))
    record_event(conn,settings,actor=actor,action='order.submitted',object_type='order',object_id=order_id,reason='Immutable manager review handoff; no job created',version=revision['revision_number'])
    return result
