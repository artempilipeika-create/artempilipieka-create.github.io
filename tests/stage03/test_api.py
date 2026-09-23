"""Real Postgres and ASGI acceptance; synthetic workbooks and identities only."""
import base64
import hashlib
import os
from uuid import uuid4
from dataclasses import replace
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from backend.v2.config import Settings
from backend.v2.db import connect,transaction
from backend.v2.migrate import migrate
from backend.v2.app import create_app
from backend.v2.security import WebPolicy,password_hash,grant
from backend.v2.backup import backup,restore
from backend.v2.files import read_verified
from backend.v2.storage import VolumeStore
from .support import master,parts,part,template

PASSWORD='Synthetic-Stage03-Test-Only-!'

@pytest.fixture(scope='module')
def settings(tmp_path_factory):
    dsn=os.environ.get('MF_TEST_DATABASE_URL')
    if not dsn: pytest.skip('Requires isolated native Postgres')
    info=conninfo_to_dict(dsn)
    assert info['host'] in {'postgres','localhost','127.0.0.1'} and info['dbname'].startswith('mf_staging_')
    root=tmp_path_factory.mktemp('private03');base=Settings(dsn,info['host'],info['dbname'],root/'source','mf.staging.ci','ci')
    name='mf_staging_stage03_'+uuid4().hex[:10]
    with connect(base,autocommit=True) as c: c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    s=replace(base,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name)
    migrate(s);return s

@pytest.fixture
def api(settings):
    policy=WebPolicy('https://testserver',Fernet.generate_key(),network_auth_per_hour=100000,network_emails_per_hour=100000)
    with TestClient(create_app(settings,policy),base_url=policy.origin,headers={'Origin':policy.origin,'Content-Type':'application/json'}) as client:
        yield client

@pytest.fixture
def admin_user(api,settings):
    uid=uuid4();email=uid.hex+'@example.invalid'
    with transaction(settings) as c:
        c.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES(%s,%s,%s,now())',(uid,email,password_hash(PASSWORD)))
        c.execute("INSERT INTO mf_user_roles VALUES(%s,'admin')",(uid,))
        for p in c.execute('SELECT permission FROM mf_permissions').fetchall(): grant(c,user_id=uid,permission=p['permission'],scope='all',actor=uid)
    login(api,email);return {'user_id':str(uid),'email':email}

def login(api,email):
    api.cookies.clear();r=api.post('/api/v2/auth/login',json={'email':email,'password':PASSWORD});assert r.status_code==200,r.text

def payload(data,filename='synthetic.xlsx',**extra):
    return {'filename':filename,'content_base64':base64.b64encode(data).decode(),**extra}

def post(api,url,body,version=None,status=200):
    r=api.post('/api/v2'+url,json=body,headers={'If-Match':str(version)} if version else {})
    assert r.status_code==status,r.text
    return r.json()

def publish(api,data=None,namespace=None):
    before=api.get('/api/v2/catalogue/releases').json()['active_release']
    result=post(api,'/catalogue/imports',payload(data or master(),source_namespace=namespace or 'test.'+uuid4().hex),status=201)
    release=post(api,'/catalogue/imports/'+result['import_id']+'/publish',
                 {'reason':'Synthetic approved test','accept_review_exclusion':True,'expected_active_release':before})['release_id']
    return result,release

def setup_import(api,qty=0,**kw):
    order=post(api,'/orders',{'business_name':'Synthetic Stage3','preparation_mode':'self_prepared'},status=201)
    t=post(api,'/import-templates',{'name':'Synthetic','definition':template()},status=201)
    p=post(api,'/imports/preview',payload(parts([part(qty=qty,**kw)]),order_id=order['order_id'],
               template_revision_id=t['template_revision_id'],selected_sheets=['Parts']),status=201)
    return order,t,p

def test_catalogue_security_private_source_and_reproducible_cache(api,settings,admin_user):
    result,release=publish(api)
    r=api.get('/api/v2/catalogue/materials',params={'q':'ЛХДФ','release':release}).json()
    assert r['kind']=='candidates' and len(r['items'])>=1 and r['items'][0]['article'] is None
    cache=api.get('/api/v2/catalogue/releases/'+release+'/data.js')
    assert cache.content==api.get('/api/v2/catalogue/releases/'+release+'/data.js').content
    assert cache.headers['x-content-sha256']==hashlib.sha256(cache.content).hexdigest()
    assert hashlib.sha256(cache.content+b'/* manual drift */').hexdigest()!=cache.headers['x-content-sha256']
    for private in ('raw_value','price_entry','source_namespace','storage_key','identity_signature','999'):
        assert private not in cache.text
    report=api.get('/api/v2/catalogue/imports/'+result['import_id']).json();fid=report['file_id']
    assert api.get('/api/v2/files/'+fid+'/download').status_code==403
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.get('/api/v2/catalogue/materials').status_code==200
    assert api.get('/api/v2/catalogue/imports/'+result['import_id']).status_code==403
    assert api.post('/api/v2/catalogue/imports',json=payload(master(),source_namespace='client.illegal')).status_code==403
    assert api.post('/api/v2/catalogue/imports/'+result['import_id']+'/publish',json={'reason':'deny'}).status_code==403
    assert api.get('/api/v2/files/'+fid+'/download').status_code==403

def test_qty_zero_roundtrip_repeat_idempotent_and_audit_atomic(api,settings,admin_user):
    publish(api);order,t,p=setup_import(api)
    assert p['rows'][1]['original']['values']['qty']==0
    applied=post(api,'/imports/'+p['import_id']+'/confirm',{'mode':'add'},1)
    assert post(api,'/imports/'+p['import_id']+'/confirm',{'mode':'add'},1)==applied
    rows=api.get('/api/v2/orders/'+order['order_id']+'/draft/rows').json()['rows']
    assert len(rows)==1 and rows[0]['snapshot']['values']['qty']==0
    assert any(e['field']=='qty' for e in rows[0]['snapshot']['errors'])
    assert api.post('/api/v2/imports/'+p['import_id']+'/confirm',json={'mode':'replace'},headers={'If-Match':'2'}).status_code==409
    with connect(settings) as c:
        audits=c.execute("SELECT event_id FROM mf_audit WHERE object_id=%s AND action='order.draft.import.changed'",(order['order_id'],)).fetchall()
        assert len(audits)==1 and c.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(audits[0]['event_id'],)).fetchone()
        assert c.execute("SELECT count(*) n FROM mf_production_jobs").fetchone()['n']==0

def test_template_replay_after_new_revision_and_cross_client_deny(api,admin_user):
    publish(api);order,t,p=setup_import(api)
    changed=template();changed['edge_dictionary']['0']='present'
    revision=post(api,'/import-templates/'+t['template_id']+'/revisions',{'name':'New','definition':changed},status=201)
    assert revision['version']==2 and post(api,'/imports/'+p['import_id']+'/replay',{})['matches_original']
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.get('/api/v2/imports/'+p['import_id']).status_code==403
    assert api.get('/api/v2/import-templates/'+t['template_id']+'/revisions').status_code==403
    assert api.post('/api/v2/imports/'+p['import_id']+'/confirm',json={'mode':'add'}).status_code==403

def test_manual_auto_none_incompatible_material_survives_reload(api,admin_user):
    _,release=publish(api);order,t,p=setup_import(api,qty=1)
    post(api,'/imports/'+p['import_id']+'/confirm',{'mode':'add'},1)
    row=api.get('/api/v2/orders/'+order['order_id']+'/draft/rows').json()['rows'][0]
    material=next(i for i in api.get('/api/v2/catalogue/materials',params={'release':release,'q':'621 PO'}).json()['items'] if i['article']=='621 PO')
    edges=api.get('/api/v2/catalogue/edges',params={'release':release,'q':'E-'}).json()['items']
    small=next(e for e in edges if e['article']=='E-2');wide=next(e for e in edges if e['article']=='E-22')
    path='/orders/'+order['order_id']+'/draft/rows/'+row['draft_row_id'];version=2
    r=post(api,path+'/material',{'variant_id':material['variant_id'],'reason':'Explicit selection'},version);version=r['optimistic_lock_version']
    selected=r['snapshot']['resolution']
    for side,eid in [('L1',small['edge_id']),('L2',None)]:
        r=post(api,path+'/edges',{'side':side,'action':'manual','edge_id':eid,'reason':'Manual choice'},version);version=r['optimistic_lock_version']
    post(api,'/catalogue/edge-mappings',{'variant_id':material['variant_id'],'edge_id':wide['edge_id'],'reason':'Approved exact mapping','source':'Synthetic'},status=201)
    r=post(api,path+'/auto',{'reason':'Explicit AUTO'},version)
    assert r['snapshot']['resolution']==selected
    assert r['snapshot']['edges']['L1']['edge_id']==small['edge_id'] and r['snapshot']['edges']['L1']['warnings']
    assert r['snapshot']['edges']['L2']['edge_id'] is None and r['snapshot']['edges']['L2']['mode']=='manual_override'
    assert r['snapshot']['edges']['W1']['mode']=='confirmed_database_mapping'
    reloaded=api.get('/api/v2/orders/'+order['order_id']+'/draft/rows').json()['rows'][0]['snapshot']
    assert reloaded==r['snapshot']

def test_release_rollback_does_not_rewrite_draft_or_immutable_checkpoint(api,settings,admin_user):
    _,old_release=publish(api);order,t,p=setup_import(api,qty=1)
    post(api,'/imports/'+p['import_id']+'/confirm',{'mode':'add'},1)
    before=api.get('/api/v2/orders/'+order['order_id']+'/draft/rows').json()['rows'][0]['snapshot']
    source=post(api,'/imports/preview',payload(parts([part(qty=2)]),order_id=order['order_id'],template_revision_id=t['template_revision_id'],selected_sheets=['Parts']),status=201)
    confirmed=post(api,'/imports/'+source['import_id']+'/confirm',{'mode':'new_revision'},2)
    rid=confirmed['checkpoint_revision_id']
    with connect(settings) as c: checkpoint=c.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(rid,)).fetchone()['content']
    assert checkpoint['draft_rows']==[before]
    publish(api)
    assert api.get('/api/v2/orders/'+order['order_id']+'/draft/rows').json()['catalogue_update_available']
    post(api,'/catalogue/releases/'+old_release+'/activate',{'reason':'Synthetic rollback'})
    with connect(settings) as c: assert c.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(rid,)).fetchone()['content']==checkpoint
    with pytest.raises(Exception):
        with transaction(settings) as c: c.execute("UPDATE mf_order_revisions SET content='{}' WHERE revision_id=%s",(rid,))
    assert api.post('/api/v2/orders/'+order['order_id']+'/submit',json={}).status_code==409

def test_publication_atomic_rollback_and_append_only(api,settings,admin_user):
    from backend.v2 import catalogue
    publish(api)
    before=api.get('/api/v2/catalogue/releases').json()['active_release']
    new=post(api,'/catalogue/imports',payload(master(),source_namespace='rollback.'+uuid4().hex),status=201)
    with pytest.raises(RuntimeError):
        with transaction(settings) as c:
            catalogue.publish(c,settings,admin_user['user_id'],new['import_id'],'Injected fail',True,before)
            raise RuntimeError('fail')
    with connect(settings) as c:
        assert str(catalogue.active(c))==before
        assert not c.execute('SELECT 1 FROM mf_catalogue_releases WHERE import_id=%s',(new['import_id'],)).fetchone()
    with pytest.raises(Exception):
        with transaction(settings) as c: c.execute("UPDATE mf_catalogue_raw_rows SET cells='{}' WHERE import_id=%s",(new['import_id'],))

def test_real_backup_restore_after_stage3(api,settings,admin_user,tmp_path):
    result,release=publish(api)
    manifest=backup(settings,tmp_path/'backup');info=conninfo_to_dict(settings.database_url)
    name='mf_staging_restore_stage03_'+uuid4().hex[:10]
    with connect(settings,autocommit=True) as c: c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=tmp_path/'restore')
    restore(target,tmp_path/'backup')
    with connect(target) as c:
        source=c.execute('SELECT file_id,sha256 FROM mf_catalogue_imports WHERE import_id=%s',(result['import_id'],)).fetchone()
        assert hashlib.sha256(read_verified(c,VolumeStore(target.storage_root),source['file_id'])).hexdigest()==source['sha256']
        assert str(c.execute('SELECT release_id FROM mf_catalogue_active').fetchone()['release_id'])==release
    assert manifest['database_sha256']

