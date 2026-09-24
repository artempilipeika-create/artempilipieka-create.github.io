"""Manual attachment security, immutable bytes, no production automation; real isolated Postgres."""
import base64
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from unittest.mock import patch
import pytest
from PIL import Image
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from backend.v2.db import transaction,connect
from backend.v2.security import grant,password_hash,CLIENT_PERMISSIONS
from backend.v2.storage import VolumeStore,sha256
from backend.v2.backup import backup,restore
from backend.v2.stage06_operator import verify
from backend.v2.attachment_content import inspect,MAX_SIZE
from tests.stage03.test_api import settings,api,admin_user,login,PASSWORD,payload
from tests.stage03.support import parts,part
from zipfile import ZipFile
from backend.v2.stage84_scenarios import pdf

def office():
 b=BytesIO(parts([part()]))
 with ZipFile(b,'a') as z:z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
 return b.getvalue()

PDF=pdf()
OBLX=Path('tests/stage06/fixtures/four-edges.oblx').read_bytes()

def user(settings,role,perms=()):
 uid=uuid4();email=uid.hex+'@example.invalid'
 with transaction(settings) as c:
  c.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at,display_name) VALUES(%s,%s,%s,now(),%s)',(uid,email,password_hash(PASSWORD),'Synthetic '+role))
  c.execute('INSERT INTO mf_user_roles VALUES(%s,%s)',(uid,role))
  for p in perms:grant(c,user_id=uid,permission=p,scope='own' if role=='client' else 'assigned',actor=uid)
 return {'user_id':uid,'email':email}

@pytest.fixture
def scene(api,settings,admin_user):
 owner=user(settings,'client',CLIENT_PERMISSIONS);foreign=user(settings,'client',CLIENT_PERMISSIONS)
 manager=user(settings,'manager',('orders.read','files.attachments.read','files.attachments.upload','files.attachments.internal.read','orders.oblx.read'))
 oid=str(uuid4());other=str(uuid4())
 with transaction(settings) as c:
  for order,assigned in [(oid,manager['user_id']),(other,None)]:
   c.execute('INSERT INTO mf_orders(order_id,business_name,owner_user_id,assigned_manager_id,preparation_mode) VALUES(%s,%s,%s,%s,%s)',(order,'SYNTHETIC manual attachments',owner['user_id'],assigned,'manager_assisted'))
 login(api,manager['email']);return dict(owner=owner,foreign=foreign,manager=manager,oid=oid,other=other)

def upload(api,s,data=PDF,name='drawing.pdf',category='document',visibility='staff_internal',**extra):
 return api.post('/api/v2/orders/'+s['oid']+'/attachments',json=payload(data,name,category=category,visibility=visibility,comment='INTERNAL STAFF COMMENT',**extra))
def items(api,s):return api.get('/api/v2/orders/'+s['oid']+'/attachments')
def url(fid):return '/api/v2/files/'+fid

def test_assigned_upload_and_metadata(api,scene,settings):
 r=upload(api,scene);assert r.status_code==201,r.text
 f=r.json();assert f['visibility']=='staff_internal' and f['comment']=='INTERNAL STAFF COMMENT'
 assert items(api,scene).json()['items'][0]['file_id']==f['file_id']
 assert api.get(f['download_url']).content==PDF
 with connect(settings) as c:
  row=c.execute('SELECT * FROM mf_files WHERE file_id=%s',(f['file_id'],)).fetchone()
  assert row['kind']=='attachment' and row['sha256']==sha256(PDF) and row['size_bytes']==len(PDF)
  ev=c.execute("SELECT event_id FROM mf_audit WHERE object_id=%s AND action='attachment.ready'",(f['file_id'],)).fetchone()
  assert ev and c.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(ev['event_id'],)).fetchone()

def test_foreign_manager_order_denied(api,scene):
 assert upload(api,{**scene,'oid':scene['other']}).status_code==403

def test_client_staff_upload_denied(api,scene):
 login(api,scene['owner']['email']);assert upload(api,scene).status_code==403

def test_pdf_explicit_visibility_owner_and_foreign(api,scene):
 f=upload(api,scene,visibility='client_visible').json();login(api,scene['owner']['email'])
 r=api.get(f['download_url']);assert r.status_code==200 and r.content==PDF
 assert r.headers['cache-control']=='no-store' and 'attachment;' in r.headers['content-disposition']
 projection=items(api,scene);assert f['file_id'] in projection.text and 'INTERNAL STAFF COMMENT' not in projection.text
 login(api,scene['foreign']['email']);assert api.get(f['download_url']).status_code==403 and items(api,scene).status_code==403

def test_internal_hidden(api,scene):
 f=upload(api,scene).json();login(api,scene['owner']['email'])
 assert items(api,scene).json()['items']==[] and api.get(f['download_url']).status_code==403

@pytest.mark.parametrize('method,alias,headers',[('GET','',{}),('HEAD','/download',{}),('GET','/preview',{'Range':'bytes=0-10'}),('GET','/download?extension=.pdf',{})])
def test_oblx_hard_deny_aliases(api,scene,method,alias,headers):
 f=upload(api,scene,OBLX,'готово.oblx','oblx','client_visible').json();assert f['visibility']=='production_internal'
 login(api,scene['owner']['email']);assert api.request(method,url(f['file_id'])+alias,headers=headers).status_code==403
 assert f['file_id'] not in items(api,scene).text
 assert api.get('/api/v2/orders/'+scene['oid']+'/oblx').status_code==403
 assert api.get('/api/v2/documents/'+f['file_id']).status_code==403
 assert api.get('/api/v2/orders/'+scene['oid']+'/files.zip').status_code==404

def test_oblx_renamed_pdf_forced_internal(api,scene):
 f=upload(api,scene,OBLX,'финальный.pdf','document','client_visible').json()
 assert f['category']=='oblx' and f['visibility']=='production_internal'
 login(api,scene['owner']['email']);assert api.get(f['download_url']).status_code==403

def test_same_name_immutable_ids(api,scene,settings):
 a=upload(api,scene).json();b=upload(api,scene).json();assert a['file_id']!=b['file_id']
 assert api.get(a['download_url']).content==PDF==api.get(b['download_url']).content
 with pytest.raises(Exception):
  with transaction(settings) as c:c.execute("UPDATE mf_order_attachments SET visibility='client_visible' WHERE file_id=%s",(a['file_id'],))
 with pytest.raises(Exception):
  with transaction(settings) as c:c.execute("UPDATE mf_files SET original_name='fake.pdf' WHERE file_id=%s",(a['file_id'],))

def test_storage_failure_no_ready_binding(api,scene,settings):
 with patch.object(VolumeStore,'put',side_effect=OSError('synthetic failure')): assert upload(api,scene).status_code==503
 assert items(api,scene).json()['items']==[]
 with connect(settings) as c:
  rows=c.execute('SELECT status FROM mf_files WHERE order_id=%s',(scene['oid'],)).fetchall();assert rows and all(r['status']=='failed' for r in rows)

def test_revoke_during_storage_cannot_publish(api,scene,settings):
 real=VolumeStore.put
 def changed(store,key,data):
  real(store,key,data)
  with transaction(settings) as c:c.execute("UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND permission='files.attachments.upload'",(scene['manager']['user_id'],))
 with patch.object(VolumeStore,'put',changed): assert upload(api,scene).status_code==403
 assert items(api,scene).json()['items']==[]

def test_revoked_read_denies_immediately(api,scene,settings):
 f=upload(api,scene).json()
 with transaction(settings) as c:c.execute("UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND permission='files.attachments.read'",(scene['manager']['user_id'],))
 assert api.get(f['download_url']).status_code==403 and items(api,scene).status_code==403

def test_blocked_staff_denied(api,scene,settings):
 with transaction(settings) as c:c.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(scene['manager']['user_id'],))
 assert upload(api,scene).status_code==403

@pytest.mark.parametrize('data,name',[(b'MZ binary','source.pdf'),(b'alert(1)','run.js'),(b'#!/bin/sh\nexit','note.txt'),(b'const x = 1','note.txt'),(b'%PDF-1.4\n/JavaScript\n%%EOF','active.pdf'),(b'PKzip','archive.zip')])
def test_executable_active_archives_rejected(api,scene,data,name):assert upload(api,scene,data,name).status_code==422

@pytest.mark.parametrize('name',['../file.pdf','C:\\pgm\\file.pdf','a\r\nx.pdf','file.exe.pdf','CON.pdf'])
def test_unsafe_filename(api,scene,name):assert upload(api,scene,name=name).status_code==422

def test_size_limit(api,scene):
 assert upload(api,scene,b'x'*(MAX_SIZE+1),'big.txt').status_code==422
 r=api.post('/api/v2/orders/'+scene['oid']+'/attachments',content=b' '* (14*1024*1024+1),headers={'Content-Type':'application/json'})
 assert r.status_code==413

def test_upload_no_workflow_mutations(api,scene,settings):
 with connect(settings) as c: before=c.execute('SELECT * FROM mf_orders WHERE order_id=%s',(scene['oid'],)).fetchone()
 for d,n in [(PDF,'финальный.pdf'),(OBLX,'готово.oblx')]: assert upload(api,scene,d,n,visibility='client_visible').status_code==201
 with connect(settings) as c:
  assert before==c.execute('SELECT * FROM mf_orders WHERE order_id=%s',(scene['oid'],)).fetchone()
  for t in ('mf_order_revisions','mf_calculations','mf_production_jobs','mf_final_calculation_candidates'):
   assert not c.execute('SELECT 1 FROM '+t+' WHERE order_id=%s',(scene['oid'],)).fetchone()

def test_restore_all_manual_files_and_hashes(api,scene,settings,tmp_path):
 assert upload(api,scene).status_code==201;assert upload(api,scene,OBLX,'x.oblx').status_code==201
 before=verify(settings);manifest=backup(settings,tmp_path/'backup');info=conninfo_to_dict(settings.database_url);name='mf_staging_restore84_'+uuid4().hex[:10]
 with connect(settings,autocommit=True) as c:c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
 target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=tmp_path/'restored')
 restore(target,tmp_path/'backup');assert before==verify(target)==verify(settings)
 assert manifest['database_sha256']

def test_supported_passive_content(api,scene):
 b=BytesIO();Image.new('RGB',(3,3),'green').save(b,format='PNG')
 for data,name in [(b.getvalue(),'sketch.png'),(office(),'source.xlsx'),(b'plain note','note.txt'),(b'a,b\n1,2','data.csv')]:assert upload(api,scene,data,name).status_code==201

def test_manifest_disguised_text_is_internal(api,scene):
 f=upload(api,scene,b'{"job_id":"synthetic"}','note.txt','other','client_visible').json()
 assert f['visibility']=='production_internal'
 login(api,scene['owner']['email']);assert api.get(f['download_url']).status_code==403

def test_cross_order_revision_denied(api,scene):
 assert upload(api,scene,revision_id=str(uuid4())).status_code==422

def test_unbound_attachment_inaccessible(api,scene,settings):
 # File identity is not an authorization substitute; no manual binding => no download.
 from backend.v2.storage import new_key
 fid=uuid4()
 with transaction(settings) as c:c.execute("INSERT INTO mf_files(file_id,order_id,kind,classification,original_name,storage_key,sha256,size_bytes,mime_type,created_by,status) VALUES(%s,%s,'attachment','private','orphan.pdf',%s,%s,1,'application/pdf',%s,'ready')",(fid,scene['oid'],new_key(),'0'*64,scene['manager']['user_id']))
 assert api.get(url(str(fid))).status_code==404

def test_manual_oblx_not_legacy_native_result(api,scene):
 f=upload(api,scene,OBLX,'manual.oblx').json()
 assert api.get(f['download_url']).status_code==200
 assert api.get('/api/v2/orders/'+scene['oid']+'/oblx').status_code==404

@pytest.mark.parametrize('role',['viewer','accounting','production'])
def test_staff_role_never_inherits_upload(api,scene,settings,role):
 actor=user(settings,role)
 with transaction(settings) as c:
  for p in ('orders.read','files.attachments.read','files.attachments.upload','files.attachments.internal.read'):
   grant(c,user_id=actor['user_id'],permission=p,scope='order',scope_id=scene['oid'],actor=scene['manager']['user_id'])
 login(api,actor['email']);assert upload(api,scene).status_code==403

def test_rejected_content_does_not_create_manifest(api,scene,settings):
 assert upload(api,scene,b'MZ payload','fake.pdf').status_code==422
 with connect(settings) as c:assert not c.execute('SELECT 1 FROM mf_files WHERE order_id=%s',(scene['oid'],)).fetchone()

def test_verified_office_and_image_formats(api,scene):
 doc=BytesIO()
 with ZipFile(doc,'w') as z:
  z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  z.writestr('word/document.xml','<document/>')
 assert upload(api,scene,doc.getvalue(),'note.docx').status_code==201
 for fmt,ext in [('JPEG','jpg'),('JPEG','jpeg'),('WEBP','webp')]:
  b=BytesIO();Image.new('RGB',(3,3),'green').save(b,format=fmt)
  assert upload(api,scene,b.getvalue(),'sketch.'+ext).status_code==201

def test_plain_xls_with_sector_padding(api,scene):
 data=base64.b64decode(Path('tests/stage84/fixtures/plain.xls.b64').read_text())
 assert inspect(data,'plain.xls')==('xls','application/vnd.ms-excel')
 assert upload(api,scene,data,'plain.xls','source').status_code==201
