"""One-shot synthetic staging HTTPS acceptance. Not imported by normal serve.

Uses existing contracts; never enrolls native attestators or creates produce jobs.
Ephemeral operator/browser credentials stay in memory and are retired in finally.
"""
import json
import os
import secrets
import threading
import time
from uuid import uuid4
import httpx
import uvicorn

from .app import create_app
from .config import Settings
from .db import connect, transaction
from .security import COOKIE, CLIENT_PERMISSIONS, WebPolicy, digest, grant
from .stage08_operator import gates, checkpoint
from .stage08_scenarios import post, import_zero, corrected_revision, submit
from .storage import VolumeStore, sha256
from .files import save_private_file, read_verified
from .calculation_math import hash_value, plain
from .events import record_event

ORIGIN='https://martin-forest-v2-staging-production.up.railway.app'


def run(settings):
    root=settings.storage_root.parent;path=root/'stage08-live-evidence.json'
    if path.exists():
        gates(settings)
        print('MF_STAGE08_LIVE='+path.read_text(),flush=True);return
    if not (root/'pre-stage08-evidence.json').exists(): raise ValueError('Pre-stage checkpoint required')
    attempt=root/'stage08-live-attempt.json'
    if attempt.exists(): raise ValueError('Incomplete attempt requires operator inspection; no blind rerun')
    attempt.write_text(json.dumps({'deployment':settings.instance_id}));attempt.chmod(0o600)
    actors={};clients={};responses=[];flows=[]
    gate_before=gates(settings)
    with connect(settings) as db:
        source=db.execute("SELECT * FROM mf_calculations WHERE calculation_id='537e764a-03eb-4b7d-9ea9-305d249bff27'").fetchone()
        if not source or not source['result']['synthetic']: raise ValueError('Accepted synthetic financial context required')
        old_files={str(f['file_id']):f['sha256'] for f in db.execute('SELECT file_id,sha256 FROM mf_files')}
    material=source['input_snapshot']['revision']['details'][0]['material'];release=str(source['catalogue_release_id'])
    try:
        with transaction(settings) as db:
            for role in ('admin','client','foreign','manager','accounting','viewer'):
                uid=uuid4();token=secrets.token_urlsafe(32);actors[role]=uid
                actual='client' if role=='foreign' else role
                db.execute("INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES(%s,%s,'operator-no-password-login',now())",(uid,'stage08-'+uid.hex+'@example.invalid'))
                db.execute('INSERT INTO mf_user_roles VALUES(%s,%s)',(uid,actual))
                perms=[r['permission'] for r in db.execute('SELECT permission FROM mf_permissions')] if role=='admin' else CLIENT_PERMISSIONS if actual=='client' else []
                for permission in perms: grant(db,user_id=uid,permission=permission,scope='all' if role=='admin' else 'own',actor=uid)
                db.execute("INSERT INTO mf_sessions(session_id,user_id,token_hash,expires_at) VALUES(%s,%s,%s,now()+interval '30 minutes')",(uuid4(),uid,digest(token)))
                clients[role]=httpx.Client(base_url=ORIGIN,headers={'Origin':ORIGIN},cookies={COOKIE:token},timeout=60)
                record_event(db,settings,actor=uid,action='stage08.synthetic.actor.created',object_type='user',object_id=uid,reason='Temporary isolated acceptance identity')
        admin=clients['admin'];client=clients['client']
        def expect(who,method,path,status,**kw):
            r=clients[who].request(method,'/api/v2'+path,**kw)
            responses.append({'actor':who,'method':method,'path':path,'status':r.status_code,'expected':status})
            assert r.status_code==status,(who,path,r.status_code,r.text[:200])
            return r
        for mode in ('self_prepared','manager_assisted'):
            o=post(client,'/orders',{'business_name':'SYNTHETIC Stage 8 '+mode,'preparation_mode':mode},status=201)
            oid=o['order_id']
            ctx={k:str(source[k]) for k in ('production_profile_id','tariff_book_id','price_book_id','discount_profile_id')}
            post(admin,'/orders/'+oid+'/financial-context',{**ctx,'reason':'Accepted synthetic version references; no global activation'},1,status=201)
            preview,row,applied=import_zero(client,o,material['article'])
            if mode=='manager_assisted':
                sent=submit(client,o,version=applied['optimistic_lock_version'])
                with connect(settings) as db: original=db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(sent['revision_id'],)).fetchone()['content']
                parent=sent['revision_id'];version=sent['optimistic_lock_version']
            else: parent=None;version=applied['optimistic_lock_version']
            if mode=='manager_assisted':
                with transaction(settings) as db:
                    for permission in ('orders.read','orders.revision.create','orders.review','calculations.create','calculations.read','orders.prices.read','files.preliminary_pdf.read'):
                        grant(db,user_id=actors['manager'],permission=permission,scope='assigned',actor=actors['admin'])
                post(admin,'/orders/'+oid+'/assign-manager',{'manager_id':str(actors['manager']),'reason':'Stage 8 synthetic manager correction'})
                version=expect('manager','GET','/orders/'+oid,200).json()['optimistic_lock_version']
            editor=clients['manager'] if mode=='manager_assisted' else client
            revision=corrected_revision(editor,o,release,material,row,version,parent)
            calculation=post(editor,'/orders/'+oid+'/calculations',{'revision_id':revision['revision_id']},status=201)
            assert calculation['completeness']=='complete'
            doc=post(client,'/calculations/'+calculation['calculation_id']+'/documents/preliminary',{},status=201)
            pdf=expect('client','GET','/documents/'+doc['file_id'],200)
            assert pdf.content.startswith(b'%PDF-')
            if mode=='self_prepared':
                sent=submit(client,o,revision,calculation,revision['optimistic_lock_version'])
                post(admin,'/orders/'+oid+'/review',{'reason':'Stage 8 self prepared synthetic review'},sent['optimistic_lock_version'])
            final=expect('admin','POST','/calculations/'+calculation['calculation_id']+'/fix',409,json={'reason':'Native result absent; must remain closed'})
            assert final.json()['detail']['code']=='BAZIS_RUN_REQUIRED'
            expect('foreign','GET','/orders/'+oid,403)
            expect('foreign','GET','/documents/'+doc['file_id'],403)
            expect('client','GET','/admin/staff',403)
            for role in ('accounting','viewer'):
                expect(role,'GET','/documents/'+doc['file_id'],403)
                with transaction(settings) as db:
                    ids=[grant(db,user_id=actors[role],permission=p,scope='order',scope_id=oid,actor=actors['admin'])
                         for p in ('orders.read','files.preliminary_pdf.read','orders.prices.read')]
                expect(role,'GET','/documents/'+doc['file_id'],200)
                with transaction(settings) as db: db.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE grant_id=ANY(%s)',(ids,))
                expect(role,'GET','/documents/'+doc['file_id'],403)
            oblx=save_private_file(settings,VolumeStore(settings.storage_root),actor=actors['admin'],data=b'<fixture native="NOT VERIFIED"/>',
                                  name='alternate-extension.pdf',kind='oblx',mime='application/xml',order_id=oid,revision_id=revision['revision_id'])
            for route in ('/files/'+str(oblx),'/files/'+str(oblx)+'/download','/files/'+str(oblx)+'/preview','/documents/'+str(oblx)):
                for method in ('GET','HEAD'): expect('client',method,route,403,headers={'Range':'bytes=0-9'})
            for route in ('/account/orders/'+oid,'/account/orders/'+oid+'/documents','/account/orders/'+oid+'/timeline','/orders/'+oid+'/history'):
                projection=expect('client','GET',route,200)
                assert str(oblx) not in projection.text
                assert all(x not in projection.text for x in ('lease_token','storage_key','native_signature','agent_id','internalComment'))
            if mode=='manager_assisted':
                with transaction(settings) as db: db.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(actors['manager'],))
                expect('manager','GET','/orders/'+oid,403)
            with connect(settings) as db:
                rev=db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(revision['revision_id'],)).fetchone()['content']
                assert rev['source_evidence']['draft_rows'][0]['snapshot']['values']['qty']==0
                assert rev['details'][0]['qty']==3 and rev['details'][0]['resolution_reason']
                if parent: assert db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(parent,)).fetchone()['content']==original
                assert not db.execute('SELECT 1 FROM mf_production_jobs WHERE order_id=%s',(oid,)).fetchone()
                fid=db.execute('SELECT file_id FROM mf_import_batches WHERE import_id=%s',(preview['import_id'],)).fetchone()['file_id']
                assert read_verified(db,VolumeStore(settings.storage_root),fid).startswith(b'PK')
                events=db.execute('SELECT event_id FROM mf_audit WHERE object_id=%s',(oid,)).fetchall()
                assert events and all(db.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(e['event_id'],)).fetchone() for e in events)
            flows.append({'mode':mode,'order_id':oid,'original_revision':parent,'revision_id':revision['revision_id'],
                          'calculation_id':calculation['calculation_id'],'document_id':doc['file_id'],'source_file_id':str(fid),
                          'catalogue_release':release,'financial_context':ctx,'pdf_sha256':sha256(pdf.content),
                          'raw_qty':0,'corrected_qty':3,'final_gate':'BAZIS_RUN_REQUIRED','jobs':0})
        # A separate mixed manufacturing input retains the original error row.
        # Unknown service/edge prices remain incomplete; no complete/final claim.
        search={}
        for term in ('ЛХДФ','HDF','U708','U5034','621 PO','621 PE'):
            response=client.get('/api/v2/catalogue/materials',params={'q':term,'release':release})
            assert response.status_code==200
            search[term]=response.json()
        hdf=next(m for m in search['ЛХДФ']['items'] if not m.get('article'))
        edge_response=client.get('/api/v2/catalogue/edges',params={'release':release,'limit':250})
        assert edge_response.status_code==200
        edges=edge_response.json()['items'][:4]
        assert len({e['edge_id'] for e in edges})==4
        mixed=post(client,'/orders',{'business_name':'SYNTHETIC Stage 8 mixed materials','preparation_mode':'self_prepared'},status=201)
        post(admin,'/orders/'+mixed['order_id']+'/financial-context',{**ctx,'reason':'Synthetic mixed manufacturing input'},1,status=201)
        preview,row,applied=import_zero(client,mixed,material['article'])
        extra=[{'detail_id':'ordinary-18','length':'700','width':'300','qty':2,'variant_id':material['variant_id'],
                'grain':'length','rotation':False,'route':'solid','edges':{side:{'edge_id':e['edge_id'],'supply_source':'customer'} for side,e in zip(('L1','L2','W1','W2'),edges)}},
               {'detail_id':'articleless-hdf-customer','length':'500','width':'250','qty':1,'variant_id':hdf['variant_id'],
                'grain':'none','rotation':True,'route':'solid','edges':{},'supply_source':'customer','provided_sheets':1,
                'customer_reason':'Synthetic explicitly customer-owned HDF; no company material charge'}]
        revision=corrected_revision(client,mixed,release,material,row,applied['optimistic_lock_version'],extra=extra)
        calculation=post(client,'/orders/'+mixed['order_id']+'/calculations',{'revision_id':revision['revision_id']},status=201)
        doc=post(client,'/calculations/'+calculation['calculation_id']+'/documents/preliminary',{},status=201)
        pdf=expect('client','GET','/documents/'+doc['file_id'],200);assert pdf.content.startswith(b'%PDF-')
        sent=post(client,'/orders/'+mixed['order_id']+'/submit',{'revision_id':revision['revision_id'],
                  'preliminary_calculation_id':calculation['calculation_id'],'handoff_problematic':True,
                  'comment':'Synthetic explicit manager handoff of unresolved service classification'},
                  revision['optimistic_lock_version'],**{'Idempotency-Key':uuid4().hex})
        assert sent['production_ready'] is False
        post(admin,'/orders/'+mixed['order_id']+'/review',{'reason':'Synthetic mixed-input review; no production release'},sent['optimistic_lock_version'])
        flows.append({'mode':'mixed-self','order_id':mixed['order_id'],'revision_id':revision['revision_id'],
                      'calculation_id':calculation['calculation_id'],'document_id':doc['file_id'],'pdf_sha256':sha256(pdf.content),
                      'calculation_state':calculation['completeness'],'total':calculation['total'],
                      'four_edge_ids':[e['edge_id'] for e in edges],'articleless_hdf_id':hdf['variant_id'],
                      'raw_qty':0,'corrected_qty':3,'jobs':0,'explicit_problematic_handoff':True})
        with connect(settings) as db:
            for fid,expected in old_files.items(): assert sha256(read_verified(db,VolumeStore(settings.storage_root),fid))==expected
        result={'flows':flows,'responses':responses,'old_private_files_unchanged':len(old_files),
                'catalogue_search':{q:{'total':v['total'],'items':[{k:m.get(k) for k in ('variant_id','article','thickness','length','width')} for m in v['items']]} for q,v in search.items()},
                'gates_before':gate_before,'gates_after':gates(settings),'external_email_delivery':'NOT VERIFIED',
                'native':'NOT VERIFIED','transport':'actual staging HTTPS','live_produce_created':0}
    finally:
        with transaction(settings) as db:
            for uid in actors.values():
                db.execute("UPDATE mf_users SET account_status='disabled' WHERE user_id=%s",(uid,))
                db.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
                db.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
                db.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
                record_event(db,settings,actor=uid,action='stage08.synthetic.actor.retired',object_type='user',object_id=uid,reason='Acceptance identity retired')
        for client in clients.values(): client.close()
    result['temporary_credentials_retired']=True
    path.write_text(json.dumps(plain(result),indent=2));path.chmod(0o600)
    print('MF_STAGE08_LIVE='+json.dumps(plain(result),separators=(',',':')),flush=True)


def main():
    settings=Settings.from_env()
    if os.environ.get('RAILWAY_PROJECT_ID')!='6d754ad4-ba7b-45f8-8c5e-356387e7de06': raise ValueError('Staging project required')
    policy=WebPolicy.from_env()
    if policy.origin!=ORIGIN: raise ValueError('Exact staging HTTPS origin required')
    gates(settings)
    def worker():
        try:
            # Server startup is signalled via local HTTP first, then exercise public HTTPS.
            for _ in range(40):
                try:
                    if httpx.get('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health',timeout=2).status_code==200: break
                except httpx.HTTPError: pass
                time.sleep(1)
            run(settings)
            result=checkpoint(settings,'post-stage08')
            print('MF_STAGE08_CHECKPOINT='+json.dumps(result,separators=(',',':'),default=str),flush=True)
        except Exception:
            import traceback
            print('MF_STAGE08_ACCEPTANCE_FAILED',flush=True);traceback.print_exc()
    threading.Thread(target=worker,daemon=True).start()
    uvicorn.run(create_app(settings,policy),host='0.0.0.0',port=int(os.environ.get('PORT','8000')),access_log=False,proxy_headers=False)


if __name__=='__main__': main()
