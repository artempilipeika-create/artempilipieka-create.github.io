"""Draft-only application of immutable import evidence; no submission or jobs."""
from datetime import datetime, timezone
from uuid import uuid4
from psycopg.types.json import Jsonb
from . import catalogue
from .catalogue_model import fingerprint, safe_item
from .excel_import import identity_input
from .identity import resolve, conflicts
from .auto import apply_auto
from .events import record_event
from .security import error


def aliases(conn):
    return conn.execute('''SELECT DISTINCT ON(source_namespace,source_value) * FROM mf_identity_aliases
        ORDER BY source_namespace,source_value,version DESC''').fetchall()


def preview(conn,settings,actor,order,file_id,template,release,parsed):
    batch=uuid4(); cat=catalogue.items(conn,release,'material'); approved=aliases(conn)
    conn.execute('INSERT INTO mf_import_batches VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())',
        (batch,order,file_id,template,release,Jsonb(parsed['selected_sheets']),Jsonb(parsed['summary']),actor))
    for original in parsed['rows']:
        row=uuid4()
        conn.execute('INSERT INTO mf_import_rows VALUES (%s,%s,%s,%s,%s)',(row,batch,original['sheet'],original['row'],Jsonb(original)))
        if original['disposition'] in {'valid','problematic'}:
            resolution=resolve(identity_input(original,file_id),cat,release,approved)
            conn.execute('INSERT INTO mf_import_row_resolutions VALUES (%s,%s,1,%s,%s,now())',(uuid4(),row,Jsonb(resolution),actor))
    record_event(conn,settings,actor=actor,action='excel.preview.created',object_type='import',object_id=batch,reason='All selected worksheet rows retained')
    return batch


def rows(conn,batch):
    return conn.execute('''SELECT r.*,x.resolution,x.version AS resolution_version FROM mf_import_rows r
        LEFT JOIN LATERAL(SELECT resolution,version FROM mf_import_row_resolutions WHERE row_id=r.row_id ORDER BY version DESC LIMIT 1)x ON true
        WHERE import_id=%s ORDER BY sheet,row_number''',(batch,)).fetchall()


def manual_resolution(original,selected,actor,reason,custom=None):
    if not reason.strip(): error(422,'OVERRIDE_REASON_REQUIRED')
    result=dict(original)
    result.update(status='custom_customer' if custom is not None else 'manual_override',method='explicit_user_action',
                  selected=selected,reason=reason,confirmed_by=str(actor),confirmed_at=datetime.now(timezone.utc).isoformat(),
                  mapping_id=None,mapping_version=None)
    result['warnings']=conflicts(result['raw'],selected) if selected else []
    if custom is not None: result['customer_material']=custom
    return result


def lock_draft(conn,order,expected):
    row=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR UPDATE',(order,)).fetchone()
    if not row or row['workflow_status']!='draft': error(409,'DRAFT_REQUIRED')
    if not expected or not str(expected).strip('"').isdigit(): error(428,'VERSION_REQUIRED')
    if row['optimistic_lock_version']!=int(str(expected).strip('"')): error(412,'REVISION_CONFLICT')
    return row


def bump(conn,settings,actor,order,reason):
    row=conn.execute('''UPDATE mf_orders SET optimistic_lock_version=optimistic_lock_version+1,updated_at=now()
        WHERE order_id=%s RETURNING optimistic_lock_version''',(order,)).fetchone()
    record_event(conn,settings,actor=actor,action='order.draft.import.changed',object_type='order',object_id=order,
                 version=row['optimistic_lock_version'],reason=reason)
    return row['optimistic_lock_version']


def confirm(conn,settings,actor,batch,mode,exclusions,expected):
    source=conn.execute('SELECT * FROM mf_import_batches WHERE import_id=%s',(batch,)).fetchone()
    if not source: error(404,'IMPORT_NOT_FOUND')
    request_hash=fingerprint({'mode':mode,'exclusions':exclusions})
    # Serialize repeat/concurrent confirms through the order lock. An identical retry is idempotent.
    order=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR UPDATE',(source['order_id'],)).fetchone()
    receipt=conn.execute('SELECT * FROM mf_import_receipts WHERE import_id=%s',(batch,)).fetchone()
    if receipt:
        if receipt['request_hash']!=request_hash: error(409,'IMPORT_ALREADY_APPLIED_WITH_DIFFERENT_REQUEST')
        return receipt['result']
    lock_draft(conn,source['order_id'],expected)
    originals=rows(conn,batch); row_ids={str(r['row_id']) for r in originals}
    if set(exclusions)-row_ids or any(not isinstance(v,str) or not v.strip() for v in exclusions.values()): error(422,'EXCLUSION_REASON_REQUIRED')
    if mode not in {'add','replace','new_revision'}: error(422,'EXPLICIT_IMPORT_MODE_REQUIRED')
    revision=None
    if mode=='new_revision':
        revision=uuid4()
        snapshots=[r['snapshot'] for r in conn.execute('SELECT snapshot FROM mf_order_draft_rows WHERE order_id=%s ORDER BY draft_row_id',(source['order_id'],))]
        number=conn.execute('SELECT coalesce(max(revision_number),0)+1 AS n FROM mf_order_revisions WHERE order_id=%s',(source['order_id'],)).fetchone()['n']
        content={'stage':3,'draft_rows':snapshots,'note':'Immutable draft checkpoint; no submit/calculation'}
        conn.execute('''INSERT INTO mf_order_revisions(revision_id,order_id,revision_number,parent_revision_id,created_by,reason,lifecycle,
            content_hash,content,immutable_at) VALUES(%s,%s,%s,%s,%s,%s,'draft',%s,%s,now())''',
            (revision,source['order_id'],number,order['active_revision_id'],actor,'Explicit draft checkpoint before new import',fingerprint(content),Jsonb(content)))
        conn.execute('UPDATE mf_orders SET active_revision_id=%s WHERE order_id=%s',(revision,source['order_id']))
    if mode in {'replace','new_revision'}:
        # Do not delete evidence or history. Retired rows remain in the draft ledger with a reason.
        conn.execute("UPDATE mf_order_draft_rows SET excluded_reason='Replaced by explicit import '||%s,updated_at=now() WHERE order_id=%s AND excluded_reason IS NULL",(str(batch),source['order_id']))
    edges=[safe_item(e,source['release_id']) for e in catalogue.items(conn,source['release_id'],'edge')]
    mappings=conn.execute('SELECT * FROM mf_material_edge_mappings').fetchall()
    count=0
    for r in originals:
        original=r['original']
        if original['disposition'] not in {'valid','problematic'}: continue  # Remains in mf_import_rows and full preview report.
        snapshot={**original,'source_row_id':str(r['row_id']),'resolution':r['resolution'],
                  'template_revision_id':str(source['template_revision_id']),'catalogue_release':str(source['release_id'])}
        snapshot=apply_auto(snapshot,edges,mappings)
        exclusion=exclusions.get(str(r['row_id']))
        conn.execute('INSERT INTO mf_order_draft_rows VALUES (%s,%s,%s,%s,%s,%s,%s,now())',
            (uuid4(),source['order_id'],r['row_id'],source['template_revision_id'],source['release_id'],Jsonb(snapshot),exclusion))
        if exclusion: record_event(conn,settings,actor=actor,action='import.row.excluded',object_type='import_row',object_id=r['row_id'],reason=exclusion)
        count+=1
    version=bump(conn,settings,actor,source['order_id'],'Excel '+mode+' applied to draft; invalid quantities preserved')
    result={'order_id':source['order_id'],'rows':count,'optimistic_lock_version':version,'checkpoint_revision_id':str(revision) if revision else None}
    conn.execute('INSERT INTO mf_import_receipts VALUES (%s,%s,%s,%s,%s,%s,now())',
        (batch,source['order_id'],mode,request_hash,Jsonb(result),actor))
    return result
