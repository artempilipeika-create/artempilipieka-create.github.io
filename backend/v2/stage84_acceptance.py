"""Explicit one-shot staging HTTPS acceptance; never imported by normal serve.

Synthetic actors are retired in finally. No Agent, native, calculate or produce calls.
An interrupted attempt is preserved for inspection, never blindly replayed.
"""
import base64
import json
import os
import secrets
import threading
import time
from io import BytesIO
from uuid import uuid4

import httpx
import uvicorn
from PIL import Image

from .app import create_app
from .config import Settings
from .db import connect, transaction
from .events import record_event
from .files import read_verified
from .security import COOKIE, CLIENT_PERMISSIONS, WebPolicy, digest, grant
from .stage06_operator import verify
from .stage08_operator import gates
from .stage84_operator import checkpoint
from .stage84_scenarios import pdf, oblx
from .startup import prepare
from .storage import VolumeStore, sha256

ORIGIN='https://martin-forest-v2-staging-production.up.railway.app'


def run(settings, *, evidence_transport='actual staging HTTPS'):
    root=settings.storage_root.parent
    path=root/'stage84-live-evidence.json'
    if path.exists():
        print('MF_STAGE84_LIVE='+path.read_text().replace('\n',''),flush=True)
        return
    if not (root/'backups/pre-stage84/manifest.json').exists():
        raise ValueError('Pre-migration backup required')
    attempt=root/'stage84-live-attempt.json'
    # Exclusive creation refuses duplicate or interrupted live acceptance.
    with attempt.open('x') as out:
        out.write(json.dumps({'deployment':settings.instance_id}))
    attempt.chmod(0o600)
    before=verify(settings);gate_before=gates(settings)
    actors={};clients={};responses=[];files=[]
    try:
        with transaction(settings) as db:
            for role in ('admin','owner','foreign','manager'):
                uid=uuid4();actors[role]=uid;token=secrets.token_urlsafe(32)
                actual='client' if role in {'owner','foreign'} else role
                db.execute("INSERT INTO mf_users(user_id,email,password_hash,email_verified_at,display_name) VALUES(%s,%s,'operator-no-password-login',now(),%s)",
                           (uid,'stage84-'+uid.hex+'@example.invalid','Synthetic '+role))
                db.execute('INSERT INTO mf_user_roles VALUES(%s,%s)',(uid,actual))
                perms=([r['permission'] for r in db.execute('SELECT permission FROM mf_permissions')] if role=='admin'
                       else CLIENT_PERMISSIONS if actual=='client' else
                       ('orders.read','files.attachments.read','files.attachments.upload','files.attachments.internal.read','orders.oblx.read'))
                for p in perms:
                    grant(db,user_id=uid,permission=p,scope='all' if role=='admin' else 'own' if actual=='client' else 'assigned',actor=uid)
                db.execute("INSERT INTO mf_sessions(session_id,user_id,token_hash,expires_at) VALUES(%s,%s,%s,now()+interval '30 minutes')",(uuid4(),uid,digest(token)))
                clients[role]=httpx.Client(base_url=ORIGIN,headers={'Origin':ORIGIN},cookies={COOKIE:token},timeout=30)
                record_event(db,settings,actor=uid,action='stage84.synthetic.actor.created',object_type='user',object_id=uid,reason='Temporary manual-files acceptance identity')
        def expect(who,method,path,status,**kw):
            r=clients[who].request(method,'/api/v2'+path,**kw)
            responses.append({'actor':who,'method':method,'path':path,'status':r.status_code,'expected':status})
            if r.status_code!=status: raise ValueError('Unexpected acceptance response: '+json.dumps(responses[-1]))
            return r
        order=expect('owner','POST','/orders',201,json={'business_name':'SYNTHETIC Stage 8.4 manual files','preparation_mode':'manager_assisted'}).json()
        oid=order['order_id'];endpoint='/orders/'+oid+'/attachments'
        expect('admin','POST','/orders/'+oid+'/assign-manager',200,json={'manager_id':str(actors['manager']),'reason':'Stage 8.4 synthetic scoped file acceptance'})
        with connect(settings) as db:
            order_before=db.execute('SELECT * FROM mf_orders WHERE order_id=%s',(oid,)).fetchone()
        def payload(data,name,category='document',visibility='staff_internal'):
            return {'filename':name,'content_base64':base64.b64encode(data).decode(),'category':category,'visibility':visibility,'comment':'SYNTHETIC INTERNAL COMMENT'}
        expect('owner','POST',endpoint,403,json=payload(pdf(),'client.pdf'))
        expect('manager','POST','/orders/'+str(uuid4())+'/attachments',403,json=payload(pdf(),'foreign.pdf'))
        public=expect('manager','POST',endpoint,201,json=payload(pdf(),'drawing.pdf',visibility='client_visible')).json()
        duplicate=expect('manager','POST',endpoint,201,json=payload(pdf(),'drawing.pdf')).json()
        disguised=expect('manager','POST',endpoint,201,json=payload(oblx(),'final.pdf',visibility='client_visible')).json()
        native=expect('manager','POST',endpoint,201,json=payload(oblx(),'ready.oblx','oblx')).json()
        image=BytesIO();Image.new('RGB',(4,4),'green').save(image,format='PNG')
        picture=expect('manager','POST',endpoint,201,json=payload(image.getvalue(),'sketch.png','image')).json()
        for f in (public,duplicate,disguised,native,picture):
            content=expect('manager','GET','/files/'+f['file_id']+'/download',200).content
            files.append({'file_id':f['file_id'],'name':f['name'],'sha256':sha256(content),'size_bytes':len(content),'visibility':f['visibility'],'category':f['category']})
        assert public['file_id']!=duplicate['file_id']
        assert disguised['category']=='oblx' and disguised['visibility']=='production_internal'
        listing=expect('manager','GET',endpoint,200).json()
        assert len(listing['items'])==5
        client_view=expect('owner','GET',endpoint,200)
        assert [f['file_id'] for f in client_view.json()['items']]==[public['file_id']]
        assert not client_view.json()['can_upload'] and 'SYNTHETIC INTERNAL COMMENT' not in client_view.text
        for method,headers in [('GET',{}),('HEAD',{}),('GET',{'Range':'bytes=0-10'})]:
            r=expect('owner',method,'/files/'+public['file_id']+'/download',200,headers=headers)
            assert r.headers['cache-control']=='no-store'
            if method!='HEAD': assert sha256(r.content)==sha256(pdf())
            for f in (duplicate,disguised,native,picture):
                for alias in ('','/download','/preview'):
                    expect('owner',method,'/files/'+f['file_id']+alias,403,headers=headers)
        expect('foreign','GET','/files/'+public['file_id'],403)
        expect('foreign','GET',endpoint,403)
        expect('owner','GET','/orders/'+oid+'/oblx',403)
        expect('manager','GET','/orders/'+oid+'/oblx',404)
        expect('owner','GET','/orders/'+oid+'/files.zip',404)
        expect('owner','GET','/documents/'+native['file_id'],403)
        for route in ('/orders/'+oid+'/history','/account/orders/'+oid,'/account/orders/'+oid+'/timeline'):
            r=expect('owner','GET',route,200)
            assert all(f['file_id'] not in r.text for f in (native,disguised,duplicate))
            assert 'SYNTHETIC INTERNAL COMMENT' not in r.text
        for data,name in ((b'MZ binary','payload.pdf'),(b'alert(1)','script.js'),(pdf(),'../escape.pdf')):
            expect('manager','POST',endpoint,422,json=payload(data,name))
        with transaction(settings) as db:
            db.execute("UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND permission='files.attachments.upload'",(actors['manager'],))
        expect('manager','POST',endpoint,403,json=payload(pdf(),'revoked.pdf'))
        with transaction(settings) as db:
            db.execute("UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND permission='files.attachments.read'",(actors['manager'],))
        expect('manager','GET','/files/'+public['file_id'],403)
        with transaction(settings) as db: db.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(actors['manager'],))
        expect('manager','POST',endpoint,403,json=payload(pdf(),'blocked.pdf'))
        with connect(settings) as db:
            assert order_before==db.execute('SELECT * FROM mf_orders WHERE order_id=%s',(oid,)).fetchone()
            for f in before['private_files']:
                assert sha256(read_verified(db,VolumeStore(settings.storage_root),f['file_id']))==f['sha256']
            for table in ('mf_order_revisions','mf_calculations','mf_documents','mf_production_jobs','mf_final_calculation_candidates'):
                assert not db.execute('SELECT 1 FROM '+table+' WHERE order_id=%s',(oid,)).fetchone()
        result={'deployment':settings.instance_id,'transport':evidence_transport,'order_id':oid,'files':files,'responses':responses,
                'old_private_files_unchanged':len(before['private_files']),'order_unchanged_by_upload':True,'gates_before':gate_before,'gates_after':gates(settings)}
    finally:
        with transaction(settings) as db:
            for uid in actors.values():
                db.execute("UPDATE mf_users SET account_status='disabled' WHERE user_id=%s",(uid,))
                db.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
                db.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
                db.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
                record_event(db,settings,actor=uid,action='stage84.synthetic.actor.retired',object_type='user',object_id=uid,reason='Acceptance identity retired')
        for client in clients.values(): client.close()
    after=verify(settings)
    permitted={'mf_users','mf_user_roles','mf_permission_grants','mf_sessions','mf_orders','mf_manager_assignments','mf_order_attachments','mf_files','mf_audit','mf_outbox','mf_rate_events'}
    changed={t for t in before['tables'] if before['tables'][t]!=after['tables'][t]}
    if changed-permitted: raise ValueError('Unexpected tables changed: '+str(sorted(changed-permitted)))
    result.update(temporary_credentials_retired=True,changed_tables=sorted(changed),before_state=before,after_state=after)
    path.write_text(json.dumps(result,indent=2,default=str));path.chmod(0o600)
    print('MF_STAGE84_LIVE='+json.dumps(result,default=str,separators=(',',':')),flush=True)


def main():
    settings=Settings.from_env();policy=WebPolicy.from_env()
    if (os.environ.get('RAILWAY_PROJECT_ID')!='6d754ad4-ba7b-45f8-8c5e-356387e7de06'
        or os.environ.get('RAILWAY_SERVICE_ID')!='9aacf7bf-edd5-4f08-9423-3fbabea59268'
        or policy.origin!=ORIGIN): raise ValueError('Exact isolated staging identity required')
    prepare(settings);gates(settings)
    def worker():
        try:
            healthy=0
            for _ in range(90):
                try:
                    # The new JS marker distinguishes this build from the old healthy deployment.
                    r=httpx.get(ORIGIN+'/account/attachments.js',timeout=5)
                    healthy=healthy+1 if r.status_code==200 and "'Дата и время'" in r.text else 0
                    if healthy>=3: break
                except httpx.HTTPError: healthy=0
                time.sleep(2)
            if healthy<3: raise ValueError('New public runtime not ready; no synthetic data created')
            run(settings)
            print('MF_STAGE84_POST='+json.dumps(checkpoint(settings),default=str,separators=(',',':')),flush=True)
        except Exception:
            import traceback
            print('MF_STAGE84_ACCEPTANCE_FAILED',flush=True);traceback.print_exc()
    threading.Thread(target=worker,daemon=True).start()
    uvicorn.run(create_app(settings,policy),host='0.0.0.0',port=int(os.environ.get('PORT','8000')),access_log=False,proxy_headers=False)


if __name__=='__main__': main()
