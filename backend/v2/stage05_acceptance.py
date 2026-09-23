"""Explicit one-shot staging HTTP acceptance via ASGI, synthetic fixtures only."""
from pathlib import Path
from uuid import uuid4
import json,os,secrets
from fastapi.testclient import TestClient
from .app import create_app
from .security import WebPolicy
from .db import connect,transaction
from .mail import FakeCollector,confirm
from .files import read_verified,save_private_file
from .storage import VolumeStore,sha256
from .calculation_math import hash_value


def run(settings):
    path=settings.storage_root.parent/'stage05-live-evidence.json'
    if path.exists():
        print('MF_STAGE05_LIVE='+path.read_text(),flush=True);return
    policy=WebPolicy.from_env();email=os.environ.get('MF_STAGE03_OPERATOR_EMAIL','');password=os.environ.get('MF_STAGE03_OPERATOR_PASSWORD','')
    if not email.endswith('@example.invalid') or len(password)<32: raise ValueError('Explicit synthetic operator required')
    with connect(settings) as db:
        active=str(db.execute('SELECT release_id FROM mf_catalogue_active').fetchone()['release_id'])
        assert active=='e6db8155-91a6-4f15-9b89-ce2194b43373'
        old={str(c['calculation_id']):hash_value(c['result']) for c in db.execute('SELECT * FROM mf_calculations')}
        context=db.execute('SELECT * FROM mf_order_financial_contexts WHERE order_id=%s ORDER BY created_at DESC LIMIT 1',('d2c6de29-1bad-411c-8c2a-6119851d66e1',)).fetchone()
        old_calcs=[str(c['calculation_id']) for c in db.execute('SELECT calculation_id FROM mf_calculations ORDER BY created_at')]
    with TestClient(create_app(settings,policy),base_url=policy.origin,headers={'Origin':policy.origin,'Content-Type':'application/json'}) as api:
        def post(url,body,status=200,**headers):
            r=api.post('/api/v2'+url,json=body,headers=headers)
            if r.status_code!=status: raise ValueError(url+' '+str(r.status_code)+' '+r.text[:150])
            return r.json()
        def login(e,p):
            api.cookies.clear();post('/auth/login',{'email':e,'password':p})
        login(email,password);old_documents=[]
        for ident in old_calcs:
            doc=post('/calculations/'+ident+'/documents/preliminary',{},201)
            data=api.get('/api/v2/documents/'+doc['file_id']);assert data.status_code==200
            old_documents.append({**doc,'sha256':sha256(data.content),'size':len(data.content)})
        client_email='stage05-'+uuid4().hex+'@example.invalid';client_password=secrets.token_urlsafe(36)
        user=post('/auth/register',{'email':client_email,'password':client_password},201)
        with connect(settings) as db: delivery=db.execute('SELECT d.delivery_id FROM mf_email_deliveries d JOIN mf_email_verifications v USING(verification_id) WHERE v.user_id=%s ORDER BY d.created_at DESC LIMIT 1',(user['user_id'],)).fetchone()['delivery_id']
        fid=FakeCollector().collect(settings,policy,delivery)
        with transaction(settings) as db:
            payload=json.loads(read_verified(db,VolumeStore(settings.storage_root),fid));confirm(db,settings,payload['url'].split('#token=')[1])
        assert api.patch('/api/v2/account/profile',json={'display_name':'Тестовый клиент Александра Ąžuolas','company_name':'Синтетическая проверка Stage 5'}).status_code==200
        o=post('/orders',{'business_name':'STAGE 5 SYNTHETIC · кабинет и private PDF','preparation_mode':'self_prepared'},201)
        manager=post('/orders',{'business_name':'STAGE 5 SYNTHETIC · ожидание менеджера','preparation_mode':'manager_assisted'},201)
        assert api.get('/api/v2/account/orders/'+manager['order_id']).json()['calculation_label']=='Расчёт после обработки менеджером'
        login(email,password)
        post('/orders/'+o['order_id']+'/financial-context',{**{k:str(context[k]) if context[k] else None for k in ('production_profile_id','tariff_book_id','price_book_id','discount_profile_id')},'reason':'Explicit existing synthetic Stage4 context for Stage5 fixture'},201,**{'If-Match':'1'})
        login(client_email,client_password)
        r=post('/orders/'+o['order_id']+'/revisions',{'reason':'Stage5 synthetic immutable revision','catalogue_release_id':active,
          'details':[{'detail_id':'stage05-detail','length':'600','width':'400','qty':3,'variant_id':'33a8c06b-5b98-5bbc-83be-b977abbe68e5',
          'rotation':False,'grain':'none','route':'glued_18_18','packaging':True,'edges':{}}]},201,**{'If-Match':'1'})
        calc=post('/orders/'+o['order_id']+'/calculations',{'revision_id':r['revision_id']},201)
        assert calc['total']=='111.02'
        doc=post('/calculations/'+calc['calculation_id']+'/documents/preliminary',{},201)
        assert post('/calculations/'+calc['calculation_id']+'/documents/preliminary',{},201)==doc
        view=api.get('/api/v2/account/orders/'+o['order_id']).json();assert view['amount']==calc['total']==view['calculation']['amount']
        source=save_private_file(settings,VolumeStore(settings.storage_root),actor=user['user_id'],data=b'Stage5 synthetic source file',name='stage05-source.txt',kind='source',mime='text/plain',order_id=o['order_id'])
        internal=save_private_file(settings,VolumeStore(settings.storage_root),actor=user['user_id'],data=b'SYNTHETIC DENY FIXTURE ONLY - NOT XML',name='ordinary.pdf',kind='oblx',mime='application/pdf',order_id=o['order_id'],revision_id=r['revision_id'])
        denied=[]
        for suffix in ['/documents/'+str(internal),'/files/'+str(internal),'/files/'+str(internal)+'/download','/files/'+str(internal)+'/preview','/orders/'+o['order_id']+'/oblx']:
            for method in ('GET','HEAD'):
                assert api.request(method,'/api/v2'+suffix,headers={'Range':'bytes=0-9'}).status_code==403
                denied.append(method+' '+suffix)
        docs=api.get('/api/v2/account/orders/'+o['order_id']+'/documents').json()['items']
        assert str(source) in str(docs) and doc['file_id'] in str(docs) and str(internal) not in str(docs)
        assert api.get('/api/v2/account/orders/d2c6de29-1bad-411c-8c2a-6119851d66e1').status_code==403
        pdf=api.get('/api/v2/documents/'+doc['file_id']);assert pdf.status_code==200 and pdf.headers['x-content-sha256']==sha256(pdf.content)
        for suffix in ['', '/download','/preview']:
            assert api.get('/api/v2/files/'+doc['file_id']+suffix).content==pdf.content
        assert api.head('/api/v2/documents/'+doc['file_id']).status_code==200
        assert api.get('/api/v2/documents/'+doc['file_id'],headers={'Range':'bytes=0-9'}).content==pdf.content
        # Source added after the calculated revision: verify existing stale-draft gate, not bypass it.
        stale=api.post('/api/v2/orders/'+o['order_id']+'/submit',json={'revision_id':r['revision_id'],'preliminary_calculation_id':calc['calculation_id']},headers={'If-Match':str(r['optimistic_lock_version']),'Idempotency-Key':uuid4().hex})
        assert stale.status_code==412
        updated=post('/orders/'+o['order_id']+'/revisions',{'reason':'Explicit revision includes new source file','parent_revision_id':r['revision_id'],'catalogue_release_id':active,
          'details':[{'detail_id':'stage05-detail','length':'600','width':'400','qty':3,'variant_id':'33a8c06b-5b98-5bbc-83be-b977abbe68e5',
          'rotation':False,'grain':'none','route':'glued_18_18','packaging':True,'edges':{}}]},201,**{'If-Match':str(r['optimistic_lock_version'])})
        updated_calc=post('/orders/'+o['order_id']+'/calculations',{'revision_id':updated['revision_id']},201)
        updated_doc=post('/calculations/'+updated_calc['calculation_id']+'/documents/preliminary',{},201)
        submitted=post('/orders/'+o['order_id']+'/submit',{'revision_id':updated['revision_id'],'preliminary_calculation_id':updated_calc['calculation_id']},
          **{'If-Match':str(updated['optimistic_lock_version']),'Idempotency-Key':uuid4().hex})
        assert submitted['workflow_status']=='submitted'
        assert api.get('/api/v2/documents/'+doc['file_id']).content==pdf.content
        evidence={'old_documents':old_documents,'client_document':{**doc,'sha256':sha256(pdf.content),'size':len(pdf.content)},
           'client_order':o['order_id'],'manager_assisted_order':manager['order_id'],'calculation_total':calc['total'],
           'same_financial_projection':True,'document_idempotent':True,'client_own_oblx_http_denials':denied,'source_and_pdf_only_listing':True,
           'cross_client_denied':True,'sha_verified':True,'head_range_and_aliases_verified':True,'stale_submit_gate_preserved':True,'active_release':active}
        login(email,password)
        with connect(settings) as db:
            for ident,digest in old.items(): assert hash_value(db.execute('SELECT result FROM mf_calculations WHERE calculation_id=%s',(ident,)).fetchone()['result'])==digest
            assert db.execute('SELECT count(*) n FROM mf_production_jobs').fetchone()['n']==1
        evidence['canonical_submit_passed']=True;evidence['new_revision_document']=updated_doc;evidence['stage4_snapshots_unchanged']=True;evidence['new_production_jobs']=0
    path.write_text(json.dumps(evidence,indent=2));print('MF_STAGE05_LIVE='+json.dumps(evidence,separators=(',',':')),flush=True)
