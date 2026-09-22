"""Explicit operator probe on isolated staging. Random synthetic credentials are revoked in finally."""
from dataclasses import replace
import json
import secrets
from pathlib import Path
from uuid import uuid4
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo
from .app import create_app
from .backup import backup, restore
from .db import transaction, connect
from .events import record_event
from .files import save_private_file, read_verified
from .mail import FakeCollector
from .operator import ADMIN_PERMISSIONS
from .security import WebPolicy, password_hash, grant, COOKIE
from .storage import VolumeStore


def run(settings, policy=None, *, restore_copy=True):
    policy=policy or WebPolicy.from_env()
    password=secrets.token_urlsafe(32)
    users=[];checks={};run_id=uuid4().hex
    admin_id=uuid4();admin_email=run_id+'-admin@example.invalid'
    users.append(admin_id)
    with transaction(settings) as conn:
        conn.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES (%s,%s,%s,now())',
                     (admin_id,admin_email,password_hash(password)))
        conn.execute("INSERT INTO mf_user_roles VALUES (%s,'admin')",(admin_id,))
        for permission in ADMIN_PERMISSIONS:
            grant(conn,user_id=admin_id,permission=permission,scope='all',actor=admin_id)
        record_event(conn,settings,actor=admin_id,action='probe.staff.created',object_type='user',object_id=admin_id,reason='Synthetic Stage 2 probe only')
    try:
        with TestClient(create_app(settings,policy),base_url=policy.origin,
                        headers={'Origin':policy.origin,'Content-Type':'application/json'}) as api:
            def login(email):
                api.cookies.clear()
                assert api.post('/api/v2/auth/login',json={'email':email,'password':password}).status_code==200
            email=run_id+'-client@example.invalid'
            r=api.post('/api/v2/auth/register',json={'email':email,'password':password})
            assert r.status_code==201
            uid=r.json()['user_id'];users.append(uid)
            assert r.json()['roles']==['client']
            checks['registration_client_only']=True
            oid=api.post('/api/v2/orders',json={'business_name':'Stage 2 synthetic '+run_id}).json()['order_id']
            r=api.post('/api/v2/orders/'+oid+'/submit',json={})
            assert r.status_code==403 and r.json()['detail']['code']=='EMAIL_NOT_VERIFIED'
            checks['unverified_draft_submit_gate']=True
            with connect(settings) as conn:
                delivery=conn.execute('''SELECT delivery_id FROM mf_email_deliveries JOIN mf_email_verifications USING(verification_id)
                    WHERE user_id=%s''',(uid,)).fetchone()['delivery_id']
            sink=FakeCollector().collect(settings,policy,delivery)
            with connect(settings) as conn:
                token=json.loads(read_verified(conn,VolumeStore(settings.storage_root),sink))['url'].split('#token=')[1]
            assert api.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code==200
            assert api.post('/api/v2/auth/email-verification/confirm',json={'token':token}).status_code==400
            assert api.get('/api/v2/auth/me').json()['email_verified']
            checks['fake_email_confirm_once']=True
            fid=save_private_file(settings,VolumeStore(settings.storage_root),actor=uid,data=b'SYNTHETIC INTERNAL STAGE 2',
                                  name='synthetic.txt',kind='oblx',mime='text/plain',order_id=oid)
            assert api.get('/api/v2/files/'+str(fid)).status_code==403
            assert api.head('/api/v2/files/'+str(fid),headers={'Range':'bytes=0-1'}).status_code==403
            assert 'oblx' not in api.get('/api/v2/orders/'+oid).text
            assert api.get('/api/orders/'+oid+'/oblx').status_code==404
            checks['client_oblx_legacy_head_range_deny']=True
            login(admin_email)
            staff=[]
            for i in range(2):
                mail=f'{run_id}-manager{i}@example.invalid'
                r=api.post('/api/v2/admin/staff',json={'email':mail,'password':password,'role':'manager'})
                assert r.status_code==201
                mid=r.json()['user_id'];users.append(mid);staff.append((mid,mail))
                for perm in ['orders.read','orders.oblx.read']:
                    assert api.post(f'/api/v2/admin/staff/{mid}/grants',json={'permission':perm,'scope_type':'assigned'}).status_code==201
                with transaction(settings) as conn:
                    conn.execute('UPDATE mf_users SET email_verified_at=now() WHERE user_id=%s',(mid,))
            assert api.post('/api/v2/orders/'+oid+'/assign-manager',json={'manager_id':staff[0][0],'reason':'Probe assignment'}).status_code==200
            login(staff[0][1]);old=api.cookies.get(COOKIE)
            assert api.get('/api/v2/files/'+str(fid)).status_code==200
            login(admin_email)
            assert api.post('/api/v2/orders/'+oid+'/assign-manager',json={'manager_id':staff[1][0],'reason':'Probe reassignment'}).status_code==200
            assert api.get('/api/v2/files/'+str(fid),headers={'Cookie':f'{COOKIE}={old}'}).status_code==403
            assert len(api.get('/api/v2/orders/'+oid+'/assignments').json()['items'])==2
            checks['manager_reassignment_immediate']=True
            login(staff[1][1]);cookie=api.cookies.get(COOKIE)
            assert api.get('/api/v2/files/'+str(fid)).status_code==200
            login(admin_email)
            assert api.put('/api/v2/admin/staff/'+staff[1][0]+'/state',json={'status':'blocked'}).status_code==200
            assert api.get('/api/v2/files/'+str(fid),headers={'Cookie':f'{COOKIE}={cookie}'}).status_code==401
            checks['blocked_staff_old_cookie']=True
            assert api.post('/api/v2/auth/logout',json={}).status_code==204
            assert api.get('/api/v2/auth/me').status_code==401
            checks['logout_revoked']=True
    finally:
        with transaction(settings) as conn:
            for uid in users:
                conn.execute("UPDATE mf_users SET account_status='disabled' WHERE user_id=%s",(uid,))
                conn.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s',(uid,))
                conn.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s',(uid,))
                # Remove the synthetic admin role so real operator bootstrap remains possible.
                conn.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
                record_event(conn,settings,actor=admin_id,action='probe.credentials.revoked',object_type='user',object_id=uid,reason='Probe cleanup')
    evidence={'run_id':run_id,'checks':checks,'order_id':oid,'file_id':str(fid),'synthetic_users_disabled':len(users),
              'agent_transport':'disabled','outbox_dispatch':'disabled'}
    if restore_copy:
        destination=settings.storage_root.parent/'backups'/('stage02-'+run_id)
        manifest=backup(settings,destination)
        name='mf_staging_restore_stage02_'+run_id[:12]
        with connect(settings,autocommit=True) as conn:
            conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        info=conninfo_to_dict(settings.database_url)
        target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,
                       storage_root=settings.storage_root.parent/('restore-stage02-'+run_id)/'storage')
        result=restore(target,destination)
        with connect(target) as conn:
            assert conn.execute('SELECT 1 FROM mf_orders WHERE order_id=%s',(oid,)).fetchone()
            assert read_verified(conn,VolumeStore(target.storage_root),fid)==b'SYNTHETIC INTERNAL STAGE 2'
        evidence['restore']={**result,'source_dump_sha256':manifest['database_sha256'],'destination':str(destination),
                             'restored_private_file_verified':True}
    return evidence
