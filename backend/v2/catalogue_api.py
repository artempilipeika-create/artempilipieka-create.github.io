"""Stage 3 API. Uses the same fresh sessions, explicit grants and scoped draft locks."""
import base64
import binascii
from datetime import datetime, timezone
import hashlib
from typing import Literal
from uuid import UUID,uuid4
from fastapi import APIRouter,Request,Response,Query
from pydantic import Field
from psycopg.types.json import Jsonb
from .auth_api import StrictModel
from .db import transaction
from .domain_api import require,admin
from .security import identity,error
from .events import record_event
from .files import save_private_file,read_verified
from .storage import VolumeStore
from .xlsx import read_workbook
from . import catalogue,import_service
from .catalogue_model import matches,safe_item,fingerprint
from .excel_import import parse,validate_template
from .auto import apply_auto,compatible


class Upload(StrictModel):
    filename:str=Field(min_length=1,max_length=255)
    content_base64:str=Field(min_length=1,max_length=28*1024*1024)

class MasterUpload(Upload):
    source_namespace:str=Field(pattern=r'^[a-z0-9][a-z0-9._-]{2,79}$')
    profile:Literal['complete_namespace_v1']='complete_namespace_v1'

class Reason(StrictModel):
    reason:str=Field(min_length=1,max_length=500)

class Publish(Reason):
    accept_review_exclusion:bool=False
    expected_active_release:UUID|None=None

class Template(StrictModel):
    name:str=Field(min_length=1,max_length=100)
    owner_user_id:UUID|None=None
    order_id:str|None=None
    definition:dict
    status:Literal['draft','active','retired']='active'

class ClientUpload(Upload):
    order_id:str=Field(min_length=1,max_length=80)
    template_revision_id:UUID
    catalogue_release:UUID|None=None
    selected_sheets:list[str]=Field(default_factory=list,max_length=50)

class Confirm(StrictModel):
    mode:Literal['add','replace','new_revision']
    exclusions:dict[str,str]=Field(default_factory=dict)

class SelectMaterial(Reason):
    variant_id:UUID|None=None
    custom_customer:dict|None=None

class SelectEdge(Reason):
    side:Literal['L1','L2','W1','W2']
    action:Literal['manual','reset_auto']
    edge_id:UUID|None=None

class Alias(Reason):
    source_value:str=Field(min_length=1,max_length=500)
    source_namespace:str=Field(min_length=1,max_length=80)
    manufacturer:str|None=None
    variant_id:UUID
    source:str=Field(min_length=1,max_length=500)

class Mapping(Reason):
    variant_id:UUID
    edge_id:UUID
    source:str=Field(min_length=1,max_length=500)


def decode(body):
    try:
        data=base64.b64decode(body.content_base64,validate=True)
        workbook=read_workbook(data)
    except (ValueError,binascii.Error): error(422,'INVALID_OR_UNSAFE_XLSX')
    return data,workbook


def release_or_active(conn,requested=None):
    release=requested or catalogue.active(conn)
    if not release or not conn.execute('SELECT 1 FROM mf_catalogue_releases WHERE release_id=%s',(release,)).fetchone():
        error(409,'CATALOGUE_NOT_PUBLISHED')
    return release


def template_access(conn,user,owner,order_id):
    if user['roles']=={'client'} and user['user_id']==owner:
        require(conn,user,'templates.own.manage');return
    if user['roles']=={'admin'}:
        require(conn,user,'templates.manage');return
    if user['roles']=={'manager'} and order_id:
        order=conn.execute('SELECT owner_user_id FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone()
        if order and order['owner_user_id']==owner:
            require(conn,user,'templates.manage',order_id=order_id);return
    error(403,'PERMISSION_DENIED')


def check_template(conn,user,revision,order):
    t=conn.execute('''SELECT r.*,t.owner_user_id FROM mf_import_template_revisions r
        JOIN mf_import_templates t USING(template_id) WHERE template_revision_id=%s''',(revision,)).fetchone()
    if not t: error(404,'TEMPLATE_NOT_FOUND')
    if t['owner_user_id']!=order['owner_user_id']: error(403,'TEMPLATE_SCOPE_DENIED')
    # Old pinned revisions can be replayed even after a later revision retires its template.
    return t


def scoped_import(conn,user,batch,write=False):
    source=conn.execute('SELECT * FROM mf_import_batches WHERE import_id=%s',(batch,)).fetchone()
    if not source: error(404,'IMPORT_NOT_FOUND')
    require(conn,user,'orders.draft.write' if write else 'orders.read',order_id=source['order_id'])
    if user['roles'] not in ({'client'},{'manager'},{'admin'}): error(403,'PERMISSION_DENIED')
    return source


def router(settings,policy):
    api=APIRouter(prefix='/api/v2')

    @api.get('/catalogue/materials')
    def materials(request:Request,q:str='',release:UUID|None=None,offset:int=Query(0,ge=0),limit:int=Query(100,ge=1,le=250)):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'catalogue.read')
            version=release_or_active(conn,release)
            found=[safe_item(i,version) for i in catalogue.items(conn,version,'material') if matches(i,q)]
            return {'kind':'candidates','catalogue_release':version,'items':found[offset:offset+limit],
                    'total':len(found),'next_offset':offset+limit if len(found)>offset+limit else None}

    @api.get('/catalogue/edges')
    def edges(request:Request,q:str='',release:UUID|None=None,offset:int=Query(0,ge=0),limit:int=Query(100,ge=1,le=250)):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'catalogue.read')
            version=release_or_active(conn,release)
            found=[safe_item(i,version) for i in catalogue.items(conn,version,'edge') if matches(i,q)]
            return {'kind':'candidates','items':found[offset:offset+limit],'total':len(found),'catalogue_release':version}

    @api.get('/catalogue/materials/{variant_id}')
    def material(variant_id:UUID,request:Request,release:UUID|None=None):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'catalogue.read')
            return catalogue.get_item(conn,release_or_active(conn,release),variant_id,'material')

    @api.get('/catalogue/releases')
    def releases(request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'catalogue.read')
            return {'active_release':catalogue.active(conn),'items':conn.execute('SELECT release_id,parent_release_id,created_at FROM mf_catalogue_releases ORDER BY created_at DESC LIMIT 100').fetchall()}

    @api.get('/catalogue/releases/{release_id}/data.js')
    def cache(release_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'catalogue.read');release_or_active(conn,release_id)
            data=catalogue.cache_bytes(conn,release_id)
            return Response(data,media_type='application/javascript',headers={'ETag':'"'+hashlib.sha256(data).hexdigest()+'"',
                'X-Catalogue-Release':str(release_id),'X-Content-SHA256':hashlib.sha256(data).hexdigest()})

    @api.post('/catalogue/imports',status_code=201)
    def ingest(body:MasterUpload,request:Request):
        with transaction(settings) as conn:
            user=admin(conn,request,'catalogue.import')
            data,workbook=decode(body)
            # Raw master prices are INTERNAL; never client-downloadable via the general file gateway.
            fid=save_private_file(settings,VolumeStore(settings.storage_root),actor=user['user_id'],data=data,name=body.filename,
                                  kind='internal',mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            return catalogue.ingest(conn,settings,user['user_id'],fid,workbook,body.source_namespace,{'mode':body.profile})

    @api.get('/catalogue/imports/{import_id}')
    def import_report(import_id:UUID,request:Request,offset:int=Query(0,ge=0),limit:int=Query(100,ge=1,le=500)):
        with transaction(settings) as conn:
            admin(conn,request,'catalogue.import')
            row=conn.execute('SELECT * FROM mf_catalogue_imports WHERE import_id=%s',(import_id,)).fetchone()
            if not row: error(404,'IMPORT_NOT_FOUND')
            row['rows']=conn.execute('''SELECT raw_row_id,sheet,row_number,disposition,reason,variant_id,edge_id,duplicate_of
                FROM mf_catalogue_raw_rows WHERE import_id=%s ORDER BY sheet,row_number LIMIT %s OFFSET %s''',(import_id,limit,offset)).fetchall()
            return row

    @api.post('/catalogue/imports/{import_id}/publish')
    def publish(import_id:UUID,body:Publish,request:Request):
        with transaction(settings) as conn:
            user=admin(conn,request,'catalogue.publish')
            return catalogue.publish(conn,settings,user['user_id'],import_id,body.reason,body.accept_review_exclusion,body.expected_active_release)

    @api.post('/catalogue/releases/{release_id}/activate')
    def activate(release_id:UUID,body:Reason,request:Request):
        with transaction(settings) as conn:
            user=admin(conn,request,'catalogue.publish');catalogue.activate(conn,settings,user['user_id'],release_id,body.reason)
            return {'active_release':release_id}

    @api.post('/catalogue/aliases',status_code=201)
    def alias(body:Alias,request:Request):
        with transaction(settings) as conn:
            user=admin(conn,request,'catalogue.mapping.manage');conn.execute('SELECT pg_advisory_xact_lock(%s)',(catalogue.CATALOGUE_LOCK,))
            catalogue.get_item(conn,release_or_active(conn),body.variant_id,'material')
            version=conn.execute('SELECT coalesce(max(version),0)+1 AS n FROM mf_identity_aliases WHERE source_namespace=%s AND source_value=%s',
                                 (body.source_namespace,body.source_value)).fetchone()['n'];aid=uuid4()
            conn.execute('INSERT INTO mf_identity_aliases VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())',
                (aid,body.source_value,body.source_namespace,body.manufacturer,body.variant_id,version,body.reason,body.source,user['user_id'],user['user_id']))
            record_event(conn,settings,actor=user['user_id'],action='catalogue.alias.approved',object_type='alias',object_id=aid,reason=body.reason,version=version)
            return {'alias_id':aid,'version':version}

    @api.post('/catalogue/edge-mappings',status_code=201)
    def mapping(body:Mapping,request:Request):
        with transaction(settings) as conn:
            user=admin(conn,request,'catalogue.mapping.manage');conn.execute('SELECT pg_advisory_xact_lock(%s)',(catalogue.CATALOGUE_LOCK,))
            release=release_or_active(conn);material=catalogue.get_item(conn,release,body.variant_id,'material');edge=catalogue.get_item(conn,release,body.edge_id,'edge')
            if not compatible(material,edge): error(422,'INCOMPATIBLE_EDGE_MAPPING')
            version=conn.execute('SELECT coalesce(max(version),0)+1 AS n FROM mf_material_edge_mappings WHERE variant_id=%s',(body.variant_id,)).fetchone()['n'];mid=uuid4()
            conn.execute('INSERT INTO mf_material_edge_mappings VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now())',
                (mid,body.variant_id,body.edge_id,version,body.reason,body.source,user['user_id'],user['user_id']))
            record_event(conn,settings,actor=user['user_id'],action='catalogue.edge_mapping.approved',object_type='edge_mapping',object_id=mid,reason=body.reason,version=version)
            return {'mapping_id':mid,'version':version}

    def save_template(conn,user,body,template_id=None):
        owner=body.owner_user_id or user['user_id']
        if template_id:
            t=conn.execute('SELECT * FROM mf_import_templates WHERE template_id=%s FOR UPDATE',(template_id,)).fetchone()
            if not t: error(404,'TEMPLATE_NOT_FOUND')
            owner=t['owner_user_id']
        template_access(conn,user,owner,body.order_id)
        try: header_hash=validate_template(body.definition)
        except (ValueError,TypeError,KeyError): error(422,'INVALID_TEMPLATE_DEFINITION')
        if not template_id:
            template_id=uuid4();conn.execute('INSERT INTO mf_import_templates VALUES (%s,%s,\'owner\',%s,%s,now())',
                                           (template_id,owner,body.name,user['user_id']))
        version=conn.execute('SELECT coalesce(max(version),0)+1 AS n FROM mf_import_template_revisions WHERE template_id=%s',(template_id,)).fetchone()['n']
        revision=uuid4()
        # Name/owner are part of the immutable revision envelope, not recognition heuristics.
        definition={**body.definition,'revision_name':body.name}
        conn.execute('INSERT INTO mf_import_template_revisions VALUES (%s,%s,%s,%s,%s,%s,%s,now())',
            (revision,template_id,version,Jsonb(definition),header_hash,body.status,user['user_id']))
        record_event(conn,settings,actor=user['user_id'],action='template.revision.created',object_type='template',object_id=template_id,reason='Immutable template revision',version=version)
        return {'template_id':template_id,'template_revision_id':revision,'version':version}

    @api.post('/import-templates',status_code=201)
    def create_template(body:Template,request:Request):
        with transaction(settings) as conn: return save_template(conn,identity(conn,request),body)

    @api.post('/import-templates/{template_id}/revisions',status_code=201)
    def revise_template(template_id:UUID,body:Template,request:Request):
        with transaction(settings) as conn: return save_template(conn,identity(conn,request),body,template_id)

    @api.get('/import-templates/{template_id}/revisions')
    def templates(template_id:UUID,request:Request,order_id:str|None=None):
        with transaction(settings) as conn:
            user=identity(conn,request);t=conn.execute('SELECT * FROM mf_import_templates WHERE template_id=%s',(template_id,)).fetchone()
            if not t: error(404,'TEMPLATE_NOT_FOUND')
            template_access(conn,user,t['owner_user_id'],order_id)
            return {'template':t,'revisions':conn.execute('SELECT * FROM mf_import_template_revisions WHERE template_id=%s ORDER BY version',(template_id,)).fetchall()}

    @api.post('/imports/preview',status_code=201)
    def preview(body:ClientUpload,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.draft.write',order_id=body.order_id)
            order=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s',(body.order_id,)).fetchone()
            template=check_template(conn,user,body.template_revision_id,order);version=release_or_active(conn,body.catalogue_release)
            data,workbook=decode(body);definition={k:v for k,v in template['definition'].items() if k!='revision_name'}
            try: parsed=parse(workbook,definition,body.selected_sheets)
            except (ValueError,KeyError,TypeError): error(422,'TEMPLATE_OR_SHEET_MISMATCH')
            if parsed['selection_required']: return parsed
            fid=save_private_file(settings,VolumeStore(settings.storage_root),actor=user['user_id'],data=data,name=body.filename,
                                  kind='source',mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',order_id=body.order_id)
            batch=import_service.preview(conn,settings,user['user_id'],body.order_id,fid,body.template_revision_id,version,parsed)
            return {'import_id':batch,'available_sheets':parsed['available_sheets'],'summary':parsed['summary'],'rows':import_service.rows(conn,batch)}

    @api.get('/imports/{import_id}')
    def get_import(import_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);source=scoped_import(conn,user,import_id)
            return {'import':source,'rows':import_service.rows(conn,import_id)}

    @api.post('/imports/{import_id}/replay')
    def replay(import_id:UUID,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);source=scoped_import(conn,user,import_id)
            t=conn.execute('SELECT definition FROM mf_import_template_revisions WHERE template_revision_id=%s',(source['template_revision_id'],)).fetchone()['definition']
            data=read_verified(conn,VolumeStore(settings.storage_root),source['file_id'])
            parsed=parse(read_workbook(data),{k:v for k,v in t.items() if k!='revision_name'},source['selected_sheets'])
            old=[r['original'] for r in import_service.rows(conn,import_id)]
            return {'matches_original':parsed['rows']==old,'original_sha256':fingerprint(old),'replay_sha256':fingerprint(parsed['rows'])}

    @api.post('/imports/{import_id}/rows/{row_id}/resolution')
    def resolution(import_id:UUID,row_id:UUID,body:SelectMaterial,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);source=scoped_import(conn,user,import_id,True)
            conn.execute('SELECT row_id FROM mf_import_rows WHERE row_id=%s AND import_id=%s FOR UPDATE',(row_id,import_id))
            if conn.execute('SELECT 1 FROM mf_import_receipts WHERE import_id=%s',(import_id,)).fetchone(): error(409,'IMPORT_CONFIRMED_EDIT_DRAFT_EXPLICITLY')
            r=next((r for r in import_service.rows(conn,import_id) if r['row_id']==row_id),None)
            if not r or not r['resolution']: error(404,'PART_ROW_NOT_FOUND')
            selected=select(conn,source['release_id'],body)
            value=import_service.manual_resolution(r['resolution'],selected,user['user_id'],body.reason,body.custom_customer)
            conn.execute('INSERT INTO mf_import_row_resolutions VALUES (%s,%s,%s,%s,%s,now())',
                         (uuid4(),row_id,r['resolution_version']+1,Jsonb(value),user['user_id']))
            record_event(conn,settings,actor=user['user_id'],action='import.identity.confirmed',object_type='import_row',object_id=row_id,reason=body.reason)
            return value

    def select(conn,release,body):
        if (body.variant_id is None)==(body.custom_customer is None): error(422,'EXACTLY_ONE_MATERIAL_CHOICE_REQUIRED')
        if body.custom_customer is not None:
            c=body.custom_customer
            if set(c)!={'name','thickness','length','width','ownership_confirmed'} or c.get('ownership_confirmed') is not True:
                error(422,'EXPLICIT_CUSTOMER_OWNERSHIP_REQUIRED')
            from .catalogue_model import dimension
            if not c.get('name') or not all(dimension(c.get(k)) for k in ('thickness','length','width')): error(422,'CUSTOMER_MATERIAL_FEATURES_REQUIRED')
            return None
        return catalogue.get_item(conn,release,body.variant_id,'material')

    @api.post('/imports/{import_id}/confirm')
    def confirm(import_id:UUID,body:Confirm,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);scoped_import(conn,user,import_id,True)
            return import_service.confirm(conn,settings,user['user_id'],import_id,body.mode,body.exclusions,request.headers.get('if-match'))

    @api.get('/orders/{order_id}/draft/rows')
    def draft_rows(order_id:str,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);require(conn,user,'orders.read',order_id=order_id)
            if user['roles'] not in ({'client'},{'manager'},{'admin'}): error(403,'PERMISSION_DENIED')
            current=catalogue.active(conn);rows=conn.execute('SELECT * FROM mf_order_draft_rows WHERE order_id=%s ORDER BY draft_row_id',(order_id,)).fetchall()
            return {'rows':rows,'active_catalogue_release':current,'catalogue_update_available':any(r['release_id']!=current for r in rows if not r['excluded_reason']),
                    'optimistic_lock_version':conn.execute('SELECT optimistic_lock_version FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone()['optimistic_lock_version']}

    def edit(conn,user,order,row_id,request):
        require(conn,user,'orders.draft.write',order_id=order);import_service.lock_draft(conn,order,request.headers.get('if-match'))
        row=conn.execute('SELECT * FROM mf_order_draft_rows WHERE draft_row_id=%s AND order_id=%s',(row_id,order)).fetchone()
        if not row: error(404,'DRAFT_ROW_NOT_FOUND')
        return row

    def save(conn,user,order,row,value,reason):
        conn.execute('UPDATE mf_order_draft_rows SET snapshot=%s,updated_at=now() WHERE draft_row_id=%s',(Jsonb(value),row['draft_row_id']))
        return {'snapshot':value,'optimistic_lock_version':import_service.bump(conn,settings,user['user_id'],order,reason)}

    @api.post('/orders/{order_id}/draft/rows/{row_id}/material')
    def draft_material(order_id:str,row_id:UUID,body:SelectMaterial,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);row=edit(conn,user,order_id,row_id,request);value=row['snapshot']
            value['resolution']=import_service.manual_resolution(value['resolution'],select(conn,row['release_id'],body),user['user_id'],body.reason,body.custom_customer)
            value=auto(conn,row['release_id'],value)
            return save(conn,user,order_id,row,value,body.reason)

    def auto(conn,release,value):
        return apply_auto(value,[safe_item(e,release) for e in catalogue.items(conn,release,'edge')],conn.execute('SELECT * FROM mf_material_edge_mappings').fetchall())

    @api.post('/orders/{order_id}/draft/rows/{row_id}/edges')
    def draft_edge(order_id:str,row_id:UUID,body:SelectEdge,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);row=edit(conn,user,order_id,row_id,request);value=row['snapshot'];state=value['edges'][body.side]
            if body.action=='manual':
                edge=catalogue.get_item(conn,row['release_id'],body.edge_id,'edge') if body.edge_id else None
                state.update(mode='manual_override',edge_id=str(body.edge_id) if body.edge_id else None,snapshot=edge,
                    confirmed=True,confirmed_by=str(user['user_id']),confirmed_at=datetime.now(timezone.utc).isoformat(),reason=body.reason)
                for k in ('mapping_id','mapping_version'): state.pop(k,None)
            else:
                state.update(mode='auto_suggestion',edge_id=None,confirmed=False,conflict=False,mark='present',raw_sku=None)
                for k in ('snapshot','confirmed_by','confirmed_at','reason','mapping_id','mapping_version'): state.pop(k,None)
            value=auto(conn,row['release_id'],value)
            return save(conn,user,order_id,row,value,body.reason)

    @api.post('/orders/{order_id}/draft/rows/{row_id}/auto')
    def draft_auto(order_id:str,row_id:UUID,body:Reason,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);row=edit(conn,user,order_id,row_id,request)
            return save(conn,user,order_id,row,auto(conn,row['release_id'],row['snapshot']),body.reason)

    @api.post('/orders/{order_id}/draft/rows/{row_id}/exclude')
    def exclude(order_id:str,row_id:UUID,body:Reason,request:Request):
        with transaction(settings) as conn:
            user=identity(conn,request);row=edit(conn,user,order_id,row_id,request)
            conn.execute('UPDATE mf_order_draft_rows SET excluded_reason=%s,updated_at=now() WHERE draft_row_id=%s',(body.reason,row_id))
            return {'optimistic_lock_version':import_service.bump(conn,settings,user['user_id'],order_id,body.reason)}

    return api
