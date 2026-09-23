from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
from io import BytesIO
import json,os
import pytest
from pypdf import PdfReader
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from backend.v2.db import connect,transaction
from backend.v2.security import grant,password_hash
from backend.v2.files import save_private_file,read_verified
from backend.v2.storage import VolumeStore,sha256
from backend.v2.backup import backup,restore
from backend.v2.calculation_math import hash_value
from backend.v2 import document_renderer as renderer
from tests.stage03.test_api import settings,api,admin_user,publish,post,login,PASSWORD
from tests.stage04.test_api import order,item,configure,revision,request_detail,calc,submit


def prepared(api):
    _,release=publish(api);o=order(api);m=item(api,release);ctx,meta=configure(api,o,release,m,discounts={'materials':'10','edge_material':'20','services':'5'})
    r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r)
    return o,r,c,ctx,meta


def document(api,c): return post(api,'/calculations/'+c['calculation_id']+'/documents/preliminary',{},status=201)


def staff(settings,role,order_id,permissions,assigned=False):
    uid=uuid4();email=uid.hex+'@example.invalid'
    with transaction(settings) as c:
        c.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES(%s,%s,%s,now())',(uid,email,password_hash(PASSWORD)))
        c.execute('INSERT INTO mf_user_roles VALUES(%s,%s)',(uid,role))
        for permission in permissions: grant(c,user_id=uid,permission=permission,scope='order',scope_id=order_id,actor=uid)
        if assigned: c.execute('UPDATE mf_orders SET assigned_manager_id=%s WHERE order_id=%s',(uid,order_id))
    return uid,email


def client_order(api,settings,admin_user,complete=True,mode='self_prepared'):
    _,release=publish(api);m=item(api,release);email=uuid4().hex+'@example.invalid'
    u=post(api,'/auth/register',{'email':email,'password':PASSWORD},status=201)
    o=order(api,mode)
    with transaction(settings) as c: c.execute('UPDATE mf_users SET email_verified_at=now() WHERE user_id=%s',(u['user_id'],))
    if mode=='manager_assisted': return o,None,None,email
    if complete:
        login(api,admin_user['email']);configure(api,o,release,m);login(api,email)
    r=revision(api,o,release,[request_detail(m)]);cal=calc(api,o,r)
    return o,r,cal,email


def test_doc01_doc02_atomic_event_version_and_binding(api,settings,admin_user,monkeypatch):
    o,r,c,_,_=prepared(api);d=document(api,c);again=document(api,c);assert d==again
    old=api.get('/api/v2/documents/'+d['file_id']);assert old.status_code==200 and old.headers['content-type']=='application/pdf'
    with connect(settings) as db:
        audits=db.execute("SELECT event_id FROM mf_audit WHERE object_id=%s AND action='document.generated'",(d['file_id'],)).fetchall()
        assert len(audits)==1 and db.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(audits[0]['event_id'],)).fetchone()
        manifest=db.execute('SELECT * FROM mf_files WHERE file_id=%s',(d['file_id'],)).fetchone()
        assert manifest['sha256']==sha256(old.content) and manifest['size_bytes']==len(old.content)
    monkeypatch.setattr(renderer,'VERSION','mf-preliminary-a4-test-v2');new=document(api,c)
    assert new['file_id']!=d['file_id'] and new['document_version']==2
    assert api.get('/api/v2/documents/'+d['file_id']).content==old.content
    listing=api.get('/api/v2/calculations/'+c['calculation_id']+'/documents').json()['items'];assert len(listing)==2
    for statement in ['DELETE FROM mf_documents WHERE file_id=%s',"UPDATE mf_documents SET presentation_snapshot='{}' WHERE file_id=%s"]:
        with pytest.raises(Exception):
            with transaction(settings) as db: db.execute(statement,(d['file_id'],))
    with pytest.raises(Exception):
        with transaction(settings) as db:
            db.execute('INSERT INTO mf_documents SELECT file_id,calculation_id,order_id,%s,template_version,3,presentation_snapshot,presentation_sha256,created_by,created_at FROM mf_documents WHERE file_id=%s',(uuid4(),d['file_id']))


def test_doc03_old_pdf_survives_real_catalogue_tariff_discount_changes(api,settings,admin_user):
    o,r,c,ctx,meta=prepared(api);d=document(api,c);url='/api/v2/documents/'+d['file_id'];old=api.get(url).content
    oldtariff=api.get('/api/v2/financial/versions/tariff/'+ctx['tariff_book_id']).json()
    t=post(api,'/financial/tariff-books',{**meta,'supersedes':ctx['tariff_book_id'],'effective_from':'2026-09-23T00:00:00Z','entries':[{'operation':e['operation'],'amount':'9.99','currency':'BYN'} for e in oldtariff['entries']]},status=201)
    discount=post(api,'/financial/discount-profiles',{**meta,'materials':'33','edge_material':'44','services':'55'},status=201)
    _,newrelease=publish(api)
    post(api,'/orders/'+o['order_id']+'/financial-context',{**ctx,'tariff_book_id':t['id'],'discount_profile_id':discount['id'],'reason':'Explicit later synthetic versions'},r['optimistic_lock_version'],status=201)
    assert api.get(url).content==old and document(api,c)==d
    assert api.get('/api/v2/calculations/'+c['calculation_id']).json()['total']==c['total']
    new=post(api,'/calculations/'+c['calculation_id']+'/recalculate',{'reason':'Explicit later calculation'},status=201)
    assert document(api,new)['file_id']!=d['file_id']


def test_doc04_sha_mismatch_all_aliases_and_headers(api,settings,admin_user):
    o,r,c,_,_=prepared(api);d=document(api,c);url='/api/v2/documents/'+d['file_id'];response=api.get(url)
    for name in ['x-robots-tag','cache-control','x-content-type-options','content-disposition']: assert name in response.headers
    assert 'no-store' in response.headers['cache-control'] and 'noindex' in response.headers['x-robots-tag']
    assert d['file_id'] not in response.headers['content-disposition']
    for suffix in ['', '/download','/preview']:
        assert api.get('/api/v2/files/'+d['file_id']+suffix).content==response.content
    assert api.head(url).content==b'' and api.head(url).headers['content-length']==str(len(response.content))
    assert api.get(url,headers={'Range':'bytes=0-10'}).content==response.content
    with connect(settings) as db: f=db.execute('SELECT storage_key FROM mf_files WHERE file_id=%s',(d['file_id'],)).fetchone()
    path=VolumeStore(settings.storage_root).path(f['storage_key']);original=path.read_bytes();path.write_bytes(b'corrupted')
    try:
        assert api.get(url).status_code==409 and api.head(url).status_code==409
    finally: path.write_bytes(original)
    for path in ['/static/'+d['file_id']+'.pdf','/public/'+d['file_id']+'.pdf','/'+f['storage_key']]: assert api.get(path).status_code==404

@pytest.mark.parametrize('role,perms,assigned,expected',[
 ('manager',['orders.read','files.preliminary_pdf.read'],True,200),
 ('manager',['orders.read','files.preliminary_pdf.read'],False,403),
 ('accounting',['orders.read','files.preliminary_pdf.read','orders.prices.read'],False,200),
 ('accounting',['orders.read','files.preliminary_pdf.read'],False,403),
 ('viewer',['orders.read','files.preliminary_pdf.read'],False,200),
 ('viewer',['orders.read'],False,403),
 ('production',['orders.read','files.preliminary_pdf.read'],False,403),
 ('admin',[],False,403),
 ('admin',['orders.read','files.preliminary_pdf.read'],False,200),
 ('service_agent',['orders.read','files.preliminary_pdf.read'],False,403)])
def test_document_roles_current_explicit_permissions(api,settings,admin_user,role,perms,assigned,expected):
    o,r,c,_,_=prepared(api);d=document(api,c);uid,email=staff(settings,role,o['order_id'],perms,assigned)
    if role=='service_agent':
        api.cookies.clear();assert api.post('/api/v2/auth/login',json={'email':email,'password':PASSWORD}).status_code==403;return
    login(api,email);url='/api/v2/documents/'+d['file_id'];assert api.get(url).status_code==expected
    assert api.get('/api/v2/account/orders/'+o['order_id']).status_code==403
    if expected==200:
        with transaction(settings) as db: db.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s',(uid,))
        assert api.head(url).status_code==403


def test_cab01_to08_client_canonical_projection_pdf_submit_history(api,settings,admin_user):
    foreign=order(api);o,r,c,email=client_order(api,settings,admin_user);d=document(api,c)
    detail=api.get('/api/v2/account/orders/'+o['order_id']).json();assert detail['amount']==c['total'] and detail['calculation']['amount']==c['total']
    assert detail['calculation']['discounts'][0]['net']==c['category_totals']['materials']['net']
    assert [v['order_id'] for v in api.get('/api/v2/account/orders').json()['items']]==[o['order_id']]
    assert api.get('/api/v2/account/orders/'+foreign['order_id']).status_code==403
    assert any(x['file_id']==d['file_id'] for x in detail['documents'])
    timeline=api.get('/api/v2/account/orders/'+o['order_id']+'/timeline').json();assert any(x['label'].startswith('Документ сформирован') for x in timeline['items'])
    for key in ('storage_key','job_id','BAZIS','Agent','plan_hash','internalComment','input_hash'): assert key not in json.dumps(detail)+json.dumps(timeline)
    sent=submit(api,o,r,c);assert sent.status_code==200,sent.text
    assert api.get('/api/v2/account/orders/'+o['order_id']).json()['status']=='submitted'
    assert any(x['label']=='Заказ передан на обработку' for x in api.get('/api/v2/account/orders/'+o['order_id']+'/timeline').json()['items'])
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.get('/api/v2/documents/'+d['file_id']).status_code==403
    assert api.get('/api/v2/calculations/'+c['calculation_id']+'/documents').status_code==403


def test_cab04_incomplete_not_zero_and_cab05_manager_without_calculation(api,settings,admin_user):
    o,r,c,email=client_order(api,settings,admin_user,complete=False)
    view=api.get('/api/v2/account/orders/'+o['order_id']).json();assert view['amount'] is None and 'Требует уточнения' in view['calculation_label']
    assert view['calculation']['amount_label']=='РАССЧИТАННАЯ ЧАСТЬ';document(api,c)
    manager=order(api,'manager_assisted');m=api.get('/api/v2/account/orders/'+manager['order_id']).json()
    assert m['calculation_label']=='Расчёт после обработки менеджером' and m['amount'] is None


def test_client_own_oblx_all_document_routes_list_history_head_range(api,settings,admin_user):
    o,r,c,email=client_order(api,settings,admin_user);d=document(api,c)
    with connect(settings) as db: uid=db.execute('SELECT owner_user_id FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()['owner_user_id']
    oblx=save_private_file(settings,VolumeStore(settings.storage_root),actor=uid,data=b'SYNTHETIC INTERNAL TEST',name='safe-looking.pdf',kind='oblx',mime='application/pdf',order_id=o['order_id'],revision_id=r['revision_id'])
    for path in ['/documents/'+str(oblx),'/files/'+str(oblx),'/files/'+str(oblx)+'/download','/files/'+str(oblx)+'/preview','/orders/'+o['order_id']+'/oblx']:
        for method in ['GET','HEAD']:
            assert api.request(method,'/api/v2'+path,headers={'Range':'bytes=0-5'}).status_code==403
    for path in ['/account/orders/'+o['order_id'],'/account/orders/'+o['order_id']+'/documents','/account/orders/'+o['order_id']+'/timeline','/orders/'+o['order_id']+'/history','/calculations/'+c['calculation_id']+'/documents']:
        res=api.get('/api/v2'+path);assert res.status_code==200 and str(oblx) not in res.text and 'OBLX' not in res.text


def test_profile_change_old_doc_frozen_and_ui_security(api,settings,admin_user):
    o,r,c,email=client_order(api,settings,admin_user)
    assert api.patch('/api/v2/account/profile',json={'display_name':'Александра Ąžuolas','company_name':'Мастерская'}).status_code==200
    d=document(api,c);before=api.get('/api/v2/documents/'+d['file_id']).content
    assert 'Александра Ąžuolas' in ' '.join(p.extract_text() for p in PdfReader(BytesIO(before)).pages)
    api.patch('/api/v2/account/profile',json={'display_name':'Другое имя','company_name':'Другая компания'})
    assert api.get('/api/v2/documents/'+d['file_id']).content==before
    ui=api.get('/account');assert ui.status_code==200 and "script-src 'self'" in ui.headers['content-security-policy']
    js=api.get('/account/app.js').text
    assert '/api/v2' in js and 'innerHTML' not in js and 'localStorage' not in js and 'Idempotency-Key' in js and "'/orders/'+o.order_id+'/submit'" in js
    assert api.post('/api/v2/calculations/'+c['calculation_id']+'/documents/preliminary',json={'html':'<script>'}).status_code==422
    assert api.post('/api/v2/calculations/'+c['calculation_id']+'/documents/preliminary',json={},headers={'Origin':'https://evil.invalid'}).status_code==403


def test_stage5_actual_backup_restore_documents_authorization(api,settings,admin_user,tmp_path):
    from backend.v2.stage05_operator import verify
    o,r,c,_,_=prepared(api);d=document(api,c);before=verify(settings)
    manifest=backup(settings,tmp_path/'backup');info=conninfo_to_dict(settings.database_url);name='mf_staging_restore_stage05_'+uuid4().hex[:10]
    with connect(settings,autocommit=True) as db: db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=tmp_path/'restore'/'storage')
    restored=restore(target,tmp_path/'backup');assert verify(target)==before
    output={'restore':restored,'dump_sha256':manifest['database_sha256'],'document_bindings_and_pdf_sha':True,'authorization_metadata':True,'state':before}
    root=Path(os.environ.get('MF_TEST_EVIDENCE_DIR',tmp_path));root.mkdir(parents=True,exist_ok=True)
    (root/'stage05-restore-evidence.json').write_text(json.dumps(output,indent=2))
