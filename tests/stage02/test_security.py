"""Real ASGI API + native Postgres + private files; exclusively synthetic staging identities."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import timedelta
import hashlib
import json
import os
from pathlib import Path
from uuid import uuid4
import psycopg
import pytest
from fastapi.testclient import TestClient
from cryptography.fernet import Fernet
from backend.v2.app import create_app
from backend.v2.config import Settings
from backend.v2.db import transaction, connect
from backend.v2.migrate import migrate
from backend.v2.security import WebPolicy, grant, password_hash, digest, COOKIE
from backend.v2.mail import FakeCollector
from backend.v2.storage import VolumeStore
from backend.v2.files import read_verified, save_private_file

PASSWORD = 'Synthetic-Test-Only-!23'
HEADERS = {'Origin':'https://testserver','Content-Type':'application/json'}

@pytest.fixture(scope='module')
def settings(tmp_path_factory):
    from psycopg.conninfo import conninfo_to_dict
    dsn = os.environ.get('MF_TEST_DATABASE_URL')
    if not dsn:
        pytest.skip('Requires isolated native Postgres')
    info = conninfo_to_dict(dsn)
    assert info['host'] in {'postgres','localhost','127.0.0.1'} and info['dbname'].startswith('mf_staging_')
    result = Settings(dsn,info['host'],info['dbname'],tmp_path_factory.mktemp('private02'),'mf.staging.ci','ci')
    migrate(result)
    return result

@pytest.fixture
def policy():
    return WebPolicy('https://testserver',Fernet.generate_key(),network_auth_per_hour=10000,network_emails_per_hour=10000)

@pytest.fixture
def api(settings,policy):
    with TestClient(create_app(settings,policy),base_url=policy.origin,headers=HEADERS) as client:
        yield client


def register(api):
    email = uuid4().hex+'@example.invalid'
    r=api.post('/api/v2/auth/register',json={'email':email,'password':PASSWORD})
    assert r.status_code==201,r.text
    return r.json()


def delivery_token(settings,policy,user_id):
    with connect(settings) as conn:
        row=conn.execute('''SELECT delivery_id FROM mf_email_deliveries d JOIN mf_email_verifications v USING(verification_id)
            WHERE v.user_id=%s ORDER BY d.created_at DESC LIMIT 1''',(user_id,)).fetchone()
    fid=FakeCollector().collect(settings,policy,row['delivery_id'])
    with connect(settings) as conn:
        message=json.loads(read_verified(conn,VolumeStore(settings.storage_root),fid))
    assert message['url'].startswith(policy.origin+'/verify-email#token=')
    return message['url'].split('#token=')[1]


def verify(api,settings,policy,uid):
    token=delivery_token(settings,policy,uid)
    assert api.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code==200
    return token


def login(api,email):
    # Simulate an independent browser; keep retained old cookies valid for revocation tests.
    api.cookies.clear()
    r=api.post('/api/v2/auth/login',json={'email':email,'password':PASSWORD})
    assert r.status_code==200,r.text


@pytest.fixture
def admin_user(settings,api):
    # Operator fixture: explicit permissions, never a shipped/default account.
    uid=uuid4();email=uid.hex+'@example.invalid'
    with transaction(settings) as conn:
        conn.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES (%s,%s,%s,now())',(uid,email,password_hash(PASSWORD)))
        conn.execute("INSERT INTO mf_user_roles VALUES (%s,'admin')",(uid,))
        for p in conn.execute('SELECT permission FROM mf_permissions').fetchall():
            grant(conn,user_id=uid,permission=p['permission'],scope='all',actor=uid)
    login(api,email)
    return {'user_id':str(uid),'email':email}


def staff(api,role):
    email=uuid4().hex+'@example.invalid'
    r=api.post('/api/v2/admin/staff',json={'email':email,'password':PASSWORD,'role':role})
    assert r.status_code==201,r.text
    return {**r.json(),'email':email}


def give(api,user,permission,scope='assigned',scope_id=None):
    r=api.post('/api/v2/admin/staff/'+user['user_id']+'/grants',json={'permission':permission,'scope_type':scope,'scope_id':scope_id})
    assert r.status_code==201,r.text
    return r.json()['grant_id']


def draft(api):
    r=api.post('/api/v2/orders',json={'business_name':'Synthetic security draft'})
    assert r.status_code==201,r.text
    return r.json()['order_id']


def authorize_staff_email(settings,uid):
    # Synthetic fixture; registration->sink->confirm is separately tested end-to-end.
    with transaction(settings) as conn:
        conn.execute('UPDATE mf_users SET email_verified_at=now() WHERE user_id=%s',(uid,))


def test_AUTH01_public_registration_rejects_privileges(api,settings):
    for field,value in [('role','admin'),('permissions',['*']),('discounts',100),('email_verified_at','2020-01-01'),('owner_user_id',str(uuid4()))]:
        r=api.post('/api/v2/auth/register',json={'email':uuid4().hex+'@example.invalid','password':PASSWORD,field:value})
        assert r.status_code==422
        assert PASSWORD not in r.text
    u=register(api)
    assert u['roles']==['client'] and not u['email_verified']
    with connect(settings) as conn:
        assert [r['role'] for r in conn.execute('SELECT role FROM mf_user_roles WHERE user_id=%s',(u['user_id'],))]==['client']


def test_AUTH02_03_login_cookie_logout_csrf(api,settings):
    u=register(api)
    cookie=api.cookies.get(COOKIE)
    login(api,u['email'])
    assert api.cookies.get(COOKIE)!=cookie
    assert api.get('/api/v2/auth/me').json()['user_id']==u['user_id']
    for origin in ['https://evil.invalid','null','']:
        assert api.post('/api/v2/auth/logout',json={},headers={'Origin':origin}).status_code==403
    r=api.post('/api/v2/auth/login',json={'email':u['email'],'password':PASSWORD})
    header=r.headers['set-cookie'].lower()
    assert 'httponly' in header and 'secure' in header and 'samesite=lax' in header
    old=api.cookies.get(COOKIE)
    assert api.post('/api/v2/auth/logout',json={}).status_code==204
    assert api.get('/api/v2/auth/me',headers={'Cookie':f'{COOKIE}={old}'}).status_code==401
    with connect(settings) as conn:
        assert conn.execute('SELECT revoked_at FROM mf_sessions WHERE token_hash=%s',(digest(old),)).fetchone()['revoked_at']


def test_EMAIL01_drafts_and_verification_gate(api):
    u=register(api);login(api,u['email']);oid=draft(api)
    r=api.patch(f'/api/v2/orders/{oid}/draft',json={'business_name':'Saved synthetic'},headers={'If-Match':'1'})
    assert r.status_code==200
    assert api.patch(f'/api/v2/orders/{oid}/draft',json={'business_name':'Stale'},headers={'If-Match':'1'}).status_code==412
    for action in ['submit','approve']:
        r=api.post(f'/api/v2/orders/{oid}/{action}',json={})
        assert r.status_code==403 and r.json()['detail']['code']=='EMAIL_NOT_VERIFIED'


def test_EMAIL02_03_sink_confirm_atomic_concurrent(api,settings,policy):
    u=register(api); token=delivery_token(settings,policy,u['user_id'])
    with connect(settings) as conn:
        row=conn.execute('SELECT * FROM mf_email_verifications WHERE user_id=%s',(u['user_id'],)).fetchone()
        assert row['token_hash']==digest(token) and token not in str(row)
        assert token not in str(conn.execute('SELECT * FROM mf_email_deliveries WHERE verification_id=%s',(row['verification_id'],)).fetchone())
    def confirm_once(_):
        with TestClient(create_app(settings,policy),base_url=policy.origin,headers=HEADERS) as other:
            return other.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm_once,range(2)))==[200,400]
    assert api.get('/api/v2/auth/me').json()['email_verified']
    assert api.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code==400
    with connect(settings) as conn:
        assert conn.execute("SELECT count(*) n FROM mf_audit WHERE object_id=%s AND action='email.verified'",(u['user_id'],)).fetchone()['n']==1
    page=api.get('/verify-email?token=ignored')
    assert page.status_code==200 and 'history.replaceState' in page.text and 'no-referrer'==page.headers['referrer-policy']
    assert 'nonce-' in page.headers['content-security-policy']


@pytest.mark.parametrize('state',['expired','revoked'])
def test_EMAIL04_invalid_tokens(api,settings,policy,state):
    u=register(api);token=delivery_token(settings,policy,u['user_id'])
    with transaction(settings) as conn:
        if state=='expired':
            conn.execute("UPDATE mf_email_verifications SET expires_at=now()-interval '1 second' WHERE user_id=%s",(u['user_id'],))
        else:
            conn.execute('UPDATE mf_email_verifications SET revoked_at=now() WHERE user_id=%s',(u['user_id'],))
    assert api.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code==400
    assert not api.get('/api/v2/auth/me').json()['email_verified']


def test_EMAIL05_resend_revoke_cooldown_hour_day(api,settings,policy):
    u=register(api);old=delivery_token(settings,policy,u['user_id'])
    assert api.post('/api/v2/auth/email-verification/request',json={}).status_code==429
    for _ in range(4):
        with transaction(settings) as conn:
            conn.execute("UPDATE mf_email_verifications SET created_at=created_at-interval '61 seconds' WHERE user_id=%s",(u['user_id'],))
        assert api.post('/api/v2/auth/email-verification/request',json={}).status_code==202
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_email_verifications SET created_at=created_at-interval '61 seconds' WHERE user_id=%s",(u['user_id'],))
    assert api.post('/api/v2/auth/email-verification/request',json={}).status_code==429
    assert api.post('/api/v2/auth/email-verification/confirm',json={'token':old}).status_code==400
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_email_verifications SET created_at=now()-interval '2 hours' WHERE user_id=%s",(u['user_id'],))
        for _ in range(15):
            conn.execute('''INSERT INTO mf_email_verifications(verification_id,user_id,email,token_hash,expires_at,created_at)
                VALUES (%s,%s,%s,%s,now(),now()-interval '3 hours')''',(uuid4(),u['user_id'],u['email'],digest(str(uuid4()))))
    assert api.post('/api/v2/auth/email-verification/request',json={}).status_code==429


def test_EMAIL06_change_revokes_old_tokens_and_sessions(api,settings,policy):
    u=register(api);token=delivery_token(settings,policy,u['user_id']);old_cookie=api.cookies.get(COOKIE)
    email=uuid4().hex+'@example.invalid'
    assert api.post('/api/v2/auth/email/change',json={'email':email,'password':PASSWORD}).status_code==200
    assert api.get('/api/v2/auth/me',headers={'Cookie':f'{COOKIE}={old_cookie}'}).status_code==401
    assert api.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code==400
    assert api.get('/api/v2/auth/me').json()['email']==email
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_email_verifications SET created_at=created_at-interval '61 seconds' WHERE user_id=%s",(u['user_id'],))
    assert api.post('/api/v2/auth/email-verification/request',json={}).status_code==202
    verify(api,settings,policy,u['user_id'])


def test_network_limit_and_failed_login_count(settings,policy):
    limited=replace(policy,network_auth_per_hour=1)
    with transaction(settings) as conn:
        conn.execute('DELETE FROM mf_rate_events')
    with TestClient(create_app(settings,limited),base_url=policy.origin,headers=HEADERS) as api:
        assert api.post('/api/v2/auth/login',json={'email':'missing@example.invalid','password':PASSWORD}).status_code==401
        assert api.post('/api/v2/auth/login',json={'email':'missing@example.invalid','password':PASSWORD}).status_code==429
    with transaction(settings) as conn:
        conn.execute('DELETE FROM mf_rate_events')


def test_RBAC01_client_scope_and_blocked_history(api,settings):
    owner=register(api);own=draft(api);other=register(api)
    assert api.get('/api/v2/orders/'+own).status_code==403
    login(api,owner['email'])
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(owner['user_id'],))
    assert api.get('/api/v2/orders/'+own).status_code==200
    assert api.get('/api/v2/orders/'+own+'/history').status_code==200
    assert api.post('/api/v2/orders',json={'business_name':'Forbidden'}).status_code==403
    assert api.post('/api/v2/orders/'+own+'/submit',json={}).status_code==403


def test_RBAC02_03_MANAGER_history_immediate_reassignment(api,settings,admin_user):
    oid=draft(api);m1=staff(api,'manager');m2=staff(api,'manager')
    give(api,m1,'orders.read');give(api,m2,'orders.read')
    assert api.post(f'/api/v2/orders/{oid}/assign-manager',json={'manager_id':m1['user_id'],'reason':'First synthetic assignment'}).status_code==200
    login(api,m1['email']);assert api.get('/api/v2/orders/'+oid).status_code==200
    assert api.put('/api/v2/admin/staff/'+m1['user_id']+'/role',json={'role':'admin'}).status_code==403
    old_cookie=api.cookies.get(COOKIE)
    login(api,admin_user['email'])
    assert api.post(f'/api/v2/orders/{oid}/assign-manager',json={'manager_id':m2['user_id'],'reason':'Synthetic reassignment'}).status_code==200
    history=api.get(f'/api/v2/orders/{oid}/assignments').json()['items']
    assert len(history)==2 and history[0]['to_manager_id']==m1['user_id'] and history[1]['from_manager_id']==m1['user_id']
    assert history[1]['to_manager_id']==m2['user_id'] and history[1]['created_by']==admin_user['user_id']
    assert api.get('/api/v2/orders/'+oid,headers={'Cookie':f'{COOKIE}={old_cookie}'}).status_code==403
    login(api,m2['email']);assert api.get('/api/v2/orders/'+oid).status_code==200


def test_RBAC04_05_06_AUTH04_AUDIT01_admin_staff_scope_revoke_block(api,settings,admin_user):
    oid=draft(api)
    for role in ['accounting','viewer','production']:
        member=staff(api,role)
        gid=give(api,member,'orders.read',scope='order',scope_id=oid)
        login(api,member['email'])
        r=api.get('/api/v2/orders/'+oid)
        if role=='production':
            assert r.status_code==403
        else:
            assert r.status_code==200
            assert not {'customer','business_name','content','manifest','internal_comment','prices'} & r.json().keys()
        cookie=api.cookies.get(COOKIE)
        login(api,admin_user['email'])
        assert api.delete(f"/api/v2/admin/staff/{member['user_id']}/grants/{gid}").status_code==204
        assert api.get('/api/v2/orders/'+oid,headers={'Cookie':f'{COOKIE}={cookie}'}).status_code==403
        assert api.put('/api/v2/admin/staff/'+member['user_id']+'/role',json={'role':'manager'}).status_code==200
        assert api.put('/api/v2/admin/staff/'+member['user_id']+'/state',json={'status':'blocked'}).status_code==200
        assert api.get('/api/v2/auth/me',headers={'Cookie':f'{COOKIE}={cookie}'}).status_code==401
        assert api.put('/api/v2/admin/staff/'+member['user_id']+'/state',json={'status':'active'}).status_code==200
    actions={r['action'] for r in api.get('/api/v2/admin/audit').json()['items']}
    assert {'staff.created','staff.role.changed','permission.granted','permission.revoked','staff.blocked','staff.unblocked'}<=actions


@pytest.fixture
def artifacts(api,settings,admin_user):
    owner=register(api);oid=draft(api)
    revision,job=uuid4(),uuid4()
    with transaction(settings) as conn:
        conn.execute('''INSERT INTO mf_order_revisions(revision_id,order_id,revision_number,created_by,reason,content)
            VALUES (%s,%s,1,%s,'synthetic security',%s)''',(revision,oid,owner['user_id'],psycopg.types.json.Jsonb({'oblx':'SECRET','internalComment':'SECRET','production_mapping':'SECRET','price':999})))
        conn.execute('UPDATE mf_orders SET active_revision_id=%s WHERE order_id=%s',(revision,oid))
        conn.execute('''INSERT INTO mf_production_jobs(job_id,order_id,revision_id,purpose,namespace,created_by)
            VALUES (%s,%s,%s,'calculate',%s,%s)''',(job,oid,revision,settings.namespace,owner['user_id']))
    fid=save_private_file(settings,VolumeStore(settings.storage_root),actor=owner['user_id'],data=b'SYNTHETIC INTERNAL NO EXPORTER',
                         name='innocent.txt',kind='oblx',mime='text/plain',order_id=oid,revision_id=revision,job_id=job)
    return {'owner':owner,'order':oid,'file':str(fid),'job':str(job)}


def test_OBLX01_02_03_08_LEGACY01_clients_cannot_bypass(api,settings,artifacts):
    f=artifacts;root='/api/v2/files/'+f['file']
    with transaction(settings) as conn:
        grant(conn,user_id=f['owner']['user_id'],permission='orders.oblx.read',scope='own',actor=f['owner']['user_id'])
    for route in [root,root+'/download',root+'/preview','/api/v2/orders/'+f['order']+'/oblx','/api/v2/orders/nonexistent/oblx']:
        for method in ['GET','HEAD']:
            r=api.request(method,route+'?mime=text/plain&filename=benign.pdf',headers={'Range':'bytes=0-3'})
            assert r.status_code==403,(route,r.status_code)
    for route in ['/api/orders/'+f['order']+'/oblx','/api/files/'+f['file'], '/api/admin/users', '/api/auth/me',
                  '/api/v2/files/bulk.zip','/api/v2/orders/'+f['order']+'/files.zip','/static/'+f['file'],
                  '/public/'+f['file'],'/download/'+f['file'],'/api/agent/pull']:
        assert api.get(route).status_code in {404,422}
    body=api.get('/api/v2/orders/'+f['order']).text
    assert all(value not in body for value in ['SECRET','oblx','storage_key',f['file'],'internalComment','production_mapping','price'])
    with transaction(settings) as conn:
        with pytest.raises(psycopg.Error):
            with conn.transaction():
                conn.execute("UPDATE mf_files SET kind='source',classification='private' WHERE file_id=%s",(f['file'],))


def test_OBLX04_05_06_07_staff_exact_scope_block_and_revocation(api,settings,policy,admin_user,artifacts):
    f=artifacts
    login(api,admin_user['email'])
    manager=staff(api,'manager');other=staff(api,'manager');production=staff(api,'production')
    give(api,manager,'orders.oblx.read');give(api,other,'orders.oblx.read')
    gid=give(api,production,'orders.oblx.read',scope='job',scope_id=f['job'])
    api.post('/api/v2/orders/'+f['order']+'/assign-manager',json={'manager_id':manager['user_id'],'reason':'Synthetic file review'})
    for role in ['accounting','viewer']:
        member=staff(api,role);give(api,member,'orders.read',scope='order',scope_id=f['order'])
        login(api,member['email']);assert api.get('/api/v2/files/'+f['file']).status_code==403
        login(api,admin_user['email'])
    for u,expected in [(manager,200),(other,403),(production,200)]:
        authorize_staff_email(settings,u['user_id']);login(api,u['email'])
        assert api.get('/api/v2/files/'+f['file']).status_code==expected
        assert api.head('/api/v2/files/'+f['file'],headers={'Range':'bytes=0-1'}).status_code==expected
    # Production grant cannot address another job, even in the same order.
    with transaction(settings) as conn:
        conn.execute('UPDATE mf_permission_grants SET scope_id=%s WHERE grant_id=%s',(str(uuid4()),gid))
    assert api.get('/api/v2/files/'+f['file']).status_code==403
    login(api,manager['email']);old=api.cookies.get(COOKIE);login(api,admin_user['email'])
    api.put('/api/v2/admin/staff/'+manager['user_id']+'/state',json={'status':'blocked'})
    assert api.get('/api/v2/files/'+f['file'],headers={'Cookie':f'{COOKIE}={old}'}).status_code==401
    with connect(settings) as conn:
        assert conn.execute("SELECT count(*) n FROM mf_audit WHERE action='file.accessed' AND object_id=%s",(f['file'],)).fetchone()['n']>=4
        assert conn.execute("SELECT count(*) n FROM mf_production_jobs WHERE status NOT IN ('blocked','cancelled')").fetchone()['n']==0
        assert conn.execute("SELECT count(*) n FROM mf_outbox WHERE status<>'paused'").fetchone()['n']==0


def test_role_change_revokes_grants_and_service_agent_cannot_browser_login(api,settings,admin_user):
    m=staff(api,'manager');gid=give(api,m,'orders.read')
    assert api.post('/api/v2/admin/staff/'+m['user_id']+'/grants',json={'permission':'*','scope_type':'all'}).status_code==422
    assert api.post('/api/v2/admin/staff/'+m['user_id']+'/grants',json={'permission':'orders.read','scope_type':'all'}).status_code==422
    api.put('/api/v2/admin/staff/'+m['user_id']+'/role',json={'role':'viewer'})
    with connect(settings) as conn:
        assert conn.execute('SELECT revoked_at FROM mf_permission_grants WHERE grant_id=%s',(gid,)).fetchone()['revoked_at']
    agent=staff(api,'service_agent')
    assert api.post('/api/v2/auth/login',json={'email':agent['email'],'password':PASSWORD}).status_code==403


def test_email_queue_failure_atomicity_and_no_dispatch(api,settings,policy):
    from backend.v2.mail import queue_verification
    u=register(api)
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_email_verifications SET created_at=created_at-interval '61 seconds' WHERE user_id=%s",(u['user_id'],))
    with pytest.raises(RuntimeError):
        with transaction(settings) as conn:
            user=conn.execute('SELECT * FROM mf_users WHERE user_id=%s FOR UPDATE',(u['user_id'],)).fetchone()
            queue_verification(conn,settings,policy,user,'synthetic')
            raise RuntimeError('Injected rollback')
    with connect(settings) as conn:
        assert conn.execute('SELECT count(*) n FROM mf_email_verifications WHERE user_id=%s',(u['user_id'],)).fetchone()['n']==1
    verify(api,settings,policy,u['user_id'])


def test_operator_cloud_smoke_logic_on_native_postgres(settings,policy):
    from backend.v2.smoke import run
    result=run(settings,policy,restore_copy=False)
    assert all(result['checks'].values()) and len(result['checks'])==7


def test_v9_password_hash_compatible_and_rehashed(api,settings):
    u=register(api)
    salt=b'x'*16
    encoded='pbkdf2_sha256$260000$'+salt.hex()+'$'+hashlib.pbkdf2_hmac('sha256',b'oldpw',salt,260000).hex()
    with transaction(settings) as conn:
        conn.execute('UPDATE mf_users SET password_hash=%s WHERE user_id=%s',(encoded,u['user_id']))
    assert api.post('/api/v2/auth/login',json={'email':u['email'],'password':'oldpw'}).status_code==200
    with connect(settings) as conn:
        assert conn.execute('SELECT password_hash FROM mf_users WHERE user_id=%s',(u['user_id'],)).fetchone()['password_hash'].startswith('pbkdf2_sha256$600000$')
    assert not api.get('/api/v2/auth/me').json()['email_verified']
