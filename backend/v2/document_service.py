"""Immutable private documents. Serialized generation, fresh authorization, SHA-verified bytes."""
from datetime import datetime,timezone
from uuid import uuid4
import re,subprocess
from psycopg.types.json import Jsonb
from fastapi import Response
from urllib.parse import quote
from . import document_renderer as renderer,document_projection as projection
from .db import transaction
from .domain_api import require
from .security import error,identity
from .rbac import allowed
from .events import record_event
from .storage import VolumeStore
from .files import save_private_file,read_verified
from .calculation_math import hash_value,plain
from .calculation_service import get


def authorize(conn,user,order_id,generate=False):
    require(conn,user,'orders.read',order_id=order_id)
    require(conn,user,'files.preliminary_pdf.read',order_id=order_id,file_kind='preliminary_pdf')
    if 'manager' in user['roles']:
        assigned=conn.execute('SELECT assigned_manager_id FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone()
        if assigned['assigned_manager_id']!=user['user_id']: error(403,'PERMISSION_DENIED')
    if user['roles']=={'accounting'} or generate:
        require(conn,user,'orders.prices.read',order_id=order_id)
    if generate:
        require(conn,user,'documents.generate',order_id=order_id)
        require(conn,user,'calculations.read',order_id=order_id)


def presentation(conn,c):
    o=conn.execute('SELECT * FROM mf_orders WHERE order_id=%s',(c['order_id'],)).fetchone()
    owner=conn.execute('SELECT display_name,company_name FROM mf_users WHERE user_id=%s',(o['owner_user_id'],)).fetchone()
    rev=conn.execute('SELECT revision_number FROM mf_order_revisions WHERE revision_id=%s',(c['revision_id'],)).fetchone()
    return projection.project(c,number=o['display_number'],name=o['business_name'],customer=' · '.join(v for v in owner.values() if v),
      revision_number=rev['revision_number'],date=c['created_at'])


def dto(row):
    return plain({k:row[k] for k in ('file_id','calculation_id','revision_id','template_version','document_version','created_at')})


def generate(settings,request,calculation_id):
    with transaction(settings) as conn:
        user=identity(conn,request);c=get(conn,calculation_id);authorize(conn,user,c['order_id'],generate=True)
        from .cabinet_service import visible
        if 'client' in user['roles'] and not visible(conn,c['order_id'],direct=True): error(404,'ORDER_NOT_FOUND')
        conn.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,5))',(str(calculation_id),))
        previous=conn.execute('SELECT * FROM mf_documents WHERE calculation_id=%s AND template_version=%s',(calculation_id,renderer.VERSION)).fetchone()
        if previous:
            read_verified(conn,VolumeStore(settings.storage_root),previous['file_id'])
            return dto(previous)
        template_hash=renderer.ASSET_HASH
        conn.execute('INSERT INTO mf_document_templates(template_version,renderer_version,asset_sha256) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',
                     (renderer.VERSION,renderer.RENDERER,template_hash))
        template=conn.execute('SELECT * FROM mf_document_templates WHERE template_version=%s',(renderer.VERSION,)).fetchone()
        if template['asset_sha256']!=template_hash or template['renderer_version']!=renderer.RENDERER: error(409,'DOCUMENT_TEMPLATE_VERSION_REQUIRED')
        view=presentation(conn,c)
        view['date']=datetime.now(timezone.utc).date().isoformat()
        try: data=renderer.bounded_render(view)
        except (ValueError,TimeoutError,subprocess.TimeoutExpired): error(422,'DOCUMENT_RENDER_LIMIT')
        number=conn.execute('SELECT count(*) n FROM mf_documents WHERE calculation_id=%s',(calculation_id,)).fetchone()['n']+1
        # File manifest + bytes survive even an interrupted final binding; unbound PDFs never appear in documents.
        fid=save_private_file(settings,VolumeStore(settings.storage_root),actor=user['user_id'],data=data,
            name='Martin_Forest_Preliminary_'+safe_number(view['order_number'])+'.pdf',kind='preliminary_pdf',mime='application/pdf',
            order_id=c['order_id'],revision_id=c['revision_id'])
        row=conn.execute('''INSERT INTO mf_documents(file_id,calculation_id,order_id,revision_id,template_version,document_version,
            presentation_snapshot,presentation_sha256,created_by) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''',
          (fid,calculation_id,c['order_id'],c['revision_id'],renderer.VERSION,number,Jsonb(view),hash_value(view),user['user_id'])).fetchone()
        record_event(conn,settings,actor=user['user_id'],action='document.generated',object_type='document',object_id=fid,version=number,reason='Immutable preliminary document from calculation snapshot')
        if number>1: record_event(conn,settings,actor=user['user_id'],action='document.version.created',object_type='document',object_id=fid,version=number,reason='New template version; prior artifact retained')
        return dto(row)


def safe_number(number):
    return number if re.fullmatch(r'MF-[0-9]{1,12}',number or '') else 'Order'


def download(conn,settings,user,file_id,head=False,inline=False):
    f=conn.execute('SELECT * FROM mf_files WHERE file_id=%s',(file_id,)).fetchone()
    if not f: error(404,'DOCUMENT_NOT_FOUND')
    if f['kind']!='preliminary_pdf' or f['classification']!='private': error(403,'PERMISSION_DENIED')
    authorize(conn,user,f['order_id'])
    row=conn.execute('SELECT * FROM mf_documents WHERE file_id=%s',(file_id,)).fetchone()
    if not row: error(404,'DOCUMENT_NOT_FOUND')
    from .cabinet_service import visible
    if 'client' in user['roles'] and not visible(conn,f['order_id'],direct=True): error(404,'ORDER_NOT_FOUND')
    try: data=read_verified(conn,VolumeStore(settings.storage_root),file_id)
    except (ValueError,OSError): error(409,'DOCUMENT_INTEGRITY_FAILED')
    if user['roles']!={'client'}:
        record_event(conn,settings,actor=user['user_id'],action='document.staff.downloaded',object_type='document',object_id=file_id,reason='Authorized sensitive document access')
    filename='Martin_Forest_Предварительный_расчёт_'+safe_number(row['presentation_snapshot']['order_number'])+'.pdf'
    return Response(b'' if head else data,media_type='application/pdf',headers={'Content-Length':str(len(data)),
      'Content-Disposition':('inline' if inline else 'attachment')+"; filename=Martin_Forest_Preliminary.pdf; filename*=UTF-8''"+quote(filename),
      'X-Content-SHA256':f['sha256'],'Accept-Ranges':'none'})
