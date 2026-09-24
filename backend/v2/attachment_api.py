"""Manual order file metadata over mf_files, private store and existing file gateway."""
import base64,binascii
from typing import Literal
from uuid import UUID
from urllib.parse import quote
from fastapi import APIRouter,Request,Response,HTTPException
from pydantic import Field
from .auth_api import StrictModel
from .db import transaction
from .security import identity,verified,error,rate_limit
from .domain_api import require
from .rbac import allowed
from .storage import VolumeStore
from .files import save_private_file,read_verified
from .events import record_event
from .attachment_content import inspect,MAX_SIZE,FORMATS

CATEGORIES=['source','drawing','image','document','internal_working','production_internal','oblx','other']
class Upload(StrictModel):
    filename:str=Field(min_length=1,max_length=180)
    content_base64:str=Field(min_length=4,max_length=((MAX_SIZE+2)//3)*4)
    category:Literal['source','drawing','image','document','internal_working','production_internal','oblx','other']
    visibility:Literal['client_visible','staff_internal','production_internal']='staff_internal'
    comment:str=Field(default='',max_length=500)
    revision_id:UUID|None=None


def authorize(c,u,oid,*,upload=False,internal=False):
    require(c,u,'orders.read',order_id=oid)
    if 'client' in u['roles']:
        if upload or internal: error(403,'PERMISSION_DENIED')
        require(c,u,'files.source.read',order_id=oid)
        from .cabinet_service import own
        own(c,u,oid)
    else:
        require(c,u,'files.attachments.upload' if upload else 'files.attachments.read',order_id=oid)
        if upload:
            require(c,u,'files.attachments.read',order_id=oid)
            if u['roles'] not in ({'manager'},{'admin'}): error(403,'PERMISSION_DENIED')
            verified(u)
        if internal: require(c,u,'files.attachments.internal.read',order_id=oid)


def dto(c,u,r):
    result={k:r[k] for k in ('file_id','order_id','revision_id','original_name','size_bytes','mime_type','category','visibility','created_at','status')}
    result['name']=result.pop('original_name');result['download_url']='/api/v2/files/'+str(r['file_id'])+'/download'
    if 'client' in u['roles']: result['uploaded_by']='Сотрудник'
    else:
        actor=c.execute('SELECT display_name FROM mf_users WHERE user_id=%s',(r['created_by'],)).fetchone()
        result.update(uploaded_by=actor['display_name'] or str(r['created_by']),created_by=r['created_by'],comment=r['staff_comment'])
    return result


def attachment(c,fid):
    return c.execute('''SELECT f.*,a.category,a.visibility,a.staff_comment FROM mf_files f
       JOIN mf_order_attachments a USING(file_id) WHERE f.file_id=%s AND f.order_id=a.order_id''',(fid,)).fetchone()


def download(c,settings,u,fid,head=False):
    r=attachment(c,fid)
    if not r or r['status']!='ready': error(404,'FILE_NOT_FOUND')
    internal=r['visibility']!='client_visible' or r['classification']=='internal' or r['kind']=='oblx'
    authorize(c,u,r['order_id'],internal=internal)
    if r['kind']=='oblx':
        require(c,u,'orders.oblx.read',order_id=r['order_id'],file_kind='oblx');verified(u)
    try: data=read_verified(c,VolumeStore(settings.storage_root),fid)
    except (ValueError,OSError): error(409,'FILE_INTEGRITY_FAILED')
    record_event(c,settings,actor=u['user_id'],action='attachment.client.downloaded' if 'client' in u['roles'] else 'attachment.staff.downloaded',
       object_type='file',object_id=fid,reason='Authorized manual attachment download; order '+r['order_id'])
    return Response(b'' if head else data,media_type=r['mime_type'],headers={
       'Content-Length':str(len(data)),'Content-Disposition':"attachment; filename=order-attachment; filename*=UTF-8''"+quote(r['original_name'],safe=''),
       'Accept-Ranges':'none','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"})


def router(settings,policy):
    api=APIRouter(prefix='/api/v2')
    @api.get('/orders/{order_id}/attachments')
    def listing(order_id:str,request:Request):
        with transaction(settings) as c:
            u=identity(c,request);authorize(c,u,order_id);items=[]
            for r in c.execute('''SELECT f.*,a.category,a.visibility,a.staff_comment FROM mf_order_attachments a
               JOIN mf_files f USING(file_id) WHERE a.order_id=%s AND f.order_id=a.order_id AND f.status='ready' ORDER BY f.created_at,f.file_id''',(order_id,)):
                internal=r['visibility']!='client_visible' or r['classification']=='internal' or r['kind']=='oblx'
                if internal and ('client' in u['roles'] or not allowed(c,u['user_id'],'files.attachments.internal.read',order_id=order_id)):continue
                if r['kind']=='oblx' and (not u['email_verified_at'] or not allowed(c,u['user_id'],'orders.oblx.read',order_id=order_id,file_kind='oblx')):continue
                items.append(dto(c,u,r))
            return {'items':items,'can_upload':u['roles'] in ({'manager'},{'admin'}) and bool(u['email_verified_at']) and allowed(c,u['user_id'],'files.attachments.upload',order_id=order_id),
                    'max_size_bytes':MAX_SIZE,'formats':FORMATS}
    @api.post('/orders/{order_id}/attachments',status_code=201)
    def upload(order_id:str,body:Upload,request:Request):
        # Authenticate and charge before content inspection/storage; staff cookie isn't sufficient on its own.
        with transaction(settings) as c:
            u=identity(c,request);authorize(c,u,order_id,upload=True)
            rate_limit(c,'manual-upload:'+str(u['user_id']),maximum=60,seconds=3600)
        try:
            data=base64.b64decode(body.content_base64,validate=True)
            fmt,mime=inspect(data,body.filename)
        except (ValueError,binascii.Error) as e: error(422,str(e) if str(e).isupper() else 'INVALID_ATTACHMENT')
        category,visibility=body.category,body.visibility
        if fmt=='oblx' or category=='oblx':
            if fmt!='oblx': error(422,'INVALID_OBLX')
            category,visibility='oblx','production_internal'
        if category in {'internal_working','production_internal'} and visibility=='client_visible': error(422,'INTERNAL_VISIBILITY_REQUIRED')
        if fmt=='production_internal': category,visibility='production_internal','production_internal'
        kind='oblx' if category=='oblx' else 'attachment'
        classification='private' if visibility=='client_visible' else 'internal'
        def bind(c,fid):
            fresh=identity(c,request);authorize(c,fresh,order_id,upload=True,internal=classification=='internal')
            if kind=='oblx': require(c,fresh,'orders.oblx.read',order_id=order_id,file_kind='oblx')
            if body.revision_id and not c.execute('SELECT 1 FROM mf_order_revisions WHERE revision_id=%s AND order_id=%s',(body.revision_id,order_id)).fetchone(): error(422,'REVISION_ORDER_MISMATCH')
            c.execute('INSERT INTO mf_order_attachments(file_id,order_id,category,visibility,staff_comment) VALUES(%s,%s,%s,%s,%s)',(fid,order_id,category,visibility,body.comment))
            record_event(c,settings,actor=fresh['user_id'],action='attachment.ready',object_type='file',object_id=fid,
                reason='Manual upload; order '+order_id+'; category '+category+'; visibility '+visibility)
        # Validate optional binding BEFORE any durable write; rechecked on ready.
        with transaction(settings) as c:
            fresh=identity(c,request);authorize(c,fresh,order_id,upload=True,internal=classification=='internal')
            if body.revision_id and not c.execute('SELECT 1 FROM mf_order_revisions WHERE revision_id=%s AND order_id=%s',(body.revision_id,order_id)).fetchone(): error(422,'REVISION_ORDER_MISMATCH')
        try:
            fid=save_private_file(settings,VolumeStore(settings.storage_root),actor=u['user_id'],data=data,name=body.filename,kind=kind,mime=mime,
                order_id=order_id,revision_id=body.revision_id,on_ready=bind,classification_override=classification if kind=='attachment' else None)
        except HTTPException: raise
        except Exception: error(503,'ATTACHMENT_STORAGE_FAILED')
        with transaction(settings) as c:
            fresh=identity(c,request);authorize(c,fresh,order_id,internal=classification=='internal')
            return dto(c,fresh,attachment(c,fid))
    return api
