"""Explicit one-shot staging acceptance, synthetic order and fake external Agent only."""
from datetime import datetime,timezone
from uuid import uuid4
import json,os,secrets,time,urllib.request,urllib.error
from fastapi.testclient import TestClient
from .db import transaction,connect
from .security import grant,digest,COOKIE,CLIENT_PERMISSIONS,WebPolicy
from .events import record_event
from .calculation_models import RevisionRequest,SubmitRequest
from .production_models import JobRequest
from . import order_revisions,calculation_service,production_service,agent_auth
from .calculation_math import plain,hash_value
from .app import create_app
from .files import read_verified
from .storage import VolumeStore

CAPS=['protocol:mf-v2','purpose:calculate','export:mf-server-oblx-v1','profile:mf-oblx-preview-v1','result:mf-native-result-v1','executor:fake']
SOURCE_CALC='537e764a-03eb-4b7d-9ea9-305d249bff27'


def prepare(settings):
    if not os.environ.get('RAILWAY_PROJECT_ID')=='6d754ad4-ba7b-45f8-8c5e-356387e7de06': raise ValueError('Explicit preview project required')
    path=settings.storage_root.parent/'stage06-acceptance-private.json'
    if path.exists(): return json.loads(path.read_text())
    if os.environ.get('MF_AGENT_TRANSPORT')!='disabled' or os.environ.get('MF_OUTBOX_DISPATCH')!='disabled': raise ValueError('Legacy transport must stay disabled')
    with transaction(settings) as c:
        if c.execute('SELECT 1 FROM mf_bazis_calibrations LIMIT 1').fetchone(): raise ValueError('Live native calibration must remain absent')
        old_pdfs={str(r['file_id']):r['sha256'] for r in c.execute("SELECT file_id,sha256 FROM mf_files WHERE kind='preliminary_pdf'")}
        before_counts={t:c.execute('SELECT count(*) n FROM '+t).fetchone()['n'] for t in ('mf_orders','mf_production_jobs','mf_files','mf_calculations')}
        source=c.execute('SELECT * FROM mf_calculations WHERE calculation_id=%s',(SOURCE_CALC,)).fetchone()
        if not source or not source['result']['synthetic'] or source['completeness']!='complete': raise ValueError('Known Stage 4 synthetic source required')
        admin,client=uuid4(),uuid4()
        for uid,role in [(admin,'admin'),(client,'client')]:
            c.execute("INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES(%s,%s,'synthetic-operator-no-login',now())",
                (uid,'stage06-'+role+'-'+uid.hex+'@example.invalid'))
            c.execute('INSERT INTO mf_user_roles VALUES(%s,%s)',(uid,role))
        for perm in ('orders.read','orders.revision.create','orders.submit','calculations.create','production.calculate.enqueue','production.jobs.read',
                     'production.final.create','production.jobs.cancel','production.agents.manage','orders.oblx.read','files.preliminary_pdf.read'):
            grant(c,user_id=admin,permission=perm,scope='all',actor=admin)
        for perm in CLIENT_PERMISSIONS: grant(c,user_id=client,permission=perm,scope='own',actor=admin)
        oid=str(uuid4())
        o=c.execute("INSERT INTO mf_orders(order_id,business_name,owner_user_id,preparation_mode) VALUES(%s,'SYNTHETIC Stage 6 transport acceptance',%s,'self_prepared') RETURNING *",(oid,client)).fetchone()
        c.execute('INSERT INTO mf_order_financial_contexts VALUES(%s,%s,%s,%s,%s,%s,%s,%s,now())',
            (uuid4(),oid,source['production_profile_id'],source['tariff_book_id'],source['price_book_id'],source['discount_profile_id'],admin,'Reuse accepted synthetic version references for isolated transport test'))
        material=source['input_snapshot']['revision']['details'][0]['material']
        body=RevisionRequest.model_validate({'reason':'Isolated Stage 6 synthetic 18+18 fixture','catalogue_release_id':str(source['catalogue_release_id']),
            'details':[{'detail_id':'stage06-glued','length':'600','width':'400','qty':3,'variant_id':material['variant_id'],
                'rotation':False,'grain':'none','route':'glued_18_18','packaging':True,'edges':{}}]})
        revision=order_revisions.create(c,settings,admin,o,body);calculation=calculation_service.create(c,settings,admin,oid,revision['revision_id'])
        if calculation['completeness']!='complete': raise ValueError('Synthetic fixture unexpectedly incomplete')
        order_revisions.submit(c,settings,admin,oid,SubmitRequest(revision_id=revision['revision_id'],preliminary_calculation_id=calculation['calculation_id']),
            'stage06-'+uuid4().hex,str(revision['optimistic_lock_version']))
        user=c.execute('SELECT * FROM mf_users WHERE user_id=%s',(admin,)).fetchone();user['roles']={'admin'}
        record_event(c,settings,actor=admin,action='stage06.synthetic.created',object_type='order',object_id=oid,reason='No production data or native execution')
    j=production_service.create(settings,user,oid,JobRequest(revision_id=revision['revision_id'],calculation_id=calculation['calculation_id'],purpose='calculate',reason='Explicit fake transport acceptance'),'stage06-'+uuid4().hex)
    credential=agent_auth.issue(settings,admin,CAPS)
    session=secrets.token_urlsafe(32)
    with transaction(settings) as c:
        c.execute("INSERT INTO mf_sessions(session_id,user_id,token_hash,expires_at) VALUES(%s,%s,%s,now()+interval '15 minutes')",(uuid4(),client,digest(session)))
        p=c.execute('SELECT * FROM mf_job_packages WHERE job_id=%s',(j['job_id'],)).fetchone()
        blank=p['manifest']['manufacturing']['parts'][0]['blank']
        assert (blank['length'],blank['width'],blank['qty'])==('620','420',6)
    # Active owner exercises the actual download middleware and fresh role policy.
    policy=WebPolicy.from_env();denied=[]
    with TestClient(create_app(settings,policy),base_url=policy.origin,cookies={COOKIE:session}) as browser:
        for fid in (p['oblx_file_id'],p['manifest_file_id']):
            for route in ['/production-jobs/'+j['job_id']+'/artifacts/'+str(fid),'/files/'+str(fid),'/files/'+str(fid)+'/download',
                          '/files/'+str(fid)+'/preview','/documents/'+str(fid)]:
                for method in ('GET','HEAD'):
                    r=browser.request(method,'/api/v2'+route,headers={'Range':'bytes=0-10'})
                    assert r.status_code==403;denied.append({'method':method,'route':route,'status':r.status_code})
        for route in ['/account/orders/'+oid,'/account/orders/'+oid+'/documents','/account/orders/'+oid+'/timeline','/orders/'+oid+'/history']:
            r=browser.get('/api/v2'+route);assert r.status_code==200 and j['job_id'] not in r.text and str(p['oblx_file_id']) not in r.text
    private=plain({'operator_id':admin,'client_id':client,'credential':credential,'job_id':j['job_id'],'order_id':oid,'revision_id':revision['revision_id'],
        'calculation_id':calculation['calculation_id'],'before_counts':before_counts,'stage5_pdf_sha':old_pdfs,'client_denied':denied,
        'fixture':{'finished':'600x400 qty=3','child_blanks':'620x420 qty=6','native':'NOT VERIFIED'}})
    path.write_text(json.dumps(private,indent=2));path.chmod(0o600)
    print('MF_STAGE06_ACCEPTANCE_PREPARED='+json.dumps({k:private[k] for k in ('job_id','order_id','revision_id','calculation_id','fixture')}),flush=True)
    return private


def run_external(settings):
    from agent.runner import Transport,run_once,ORIGIN
    private=json.loads((settings.storage_root.parent/'stage06-acceptance-private.json').read_text())
    evidence_path=settings.storage_root.parent/'stage06-live-evidence.json'
    if evidence_path.exists(): raise ValueError('Acceptance already complete')
    class Capture(Transport):
        def request(self,method,path,body=None,lease=None):
            data=super().request(method,path,body,lease)
            if path.endswith('/jobs/pull'):
                claims=json.loads(data)['jobs']
                if claims: self.lease=claims[0]
            if path.endswith('/results'): self.result_body=body
            return data
    client=Capture(private['credential']['credential'])
    outcome=run_once(client,settings.storage_root.parent/'mf-staging-agent',CAPS,settings.namespace)
    if outcome['job_id']!=private['job_id'] or outcome['verified']: raise ValueError('Unexpected staging result')
    repeat=json.loads(client.request('POST','/api/v2/agent/jobs/'+private['job_id']+'/results',client.result_body,client.lease))
    assert repeat['result_id']==outcome['result_id'] and repeat['verified'] is False
    changed={**client.result_body,'bazis_version':'DIFFERENT_FAKE_PAYLOAD'}
    try: client.request('POST','/api/v2/agent/jobs/'+private['job_id']+'/results',changed,client.lease)
    except urllib.error.HTTPError as exc:
        assert exc.code==409
        assert json.loads(exc.read())['detail']['code']=='RESULT_ID_CONFLICT'
    else: raise ValueError('Result conflict not rejected')
    with transaction(settings) as c:
        user=c.execute('SELECT * FROM mf_users WHERE user_id=%s',(private['operator_id'],)).fetchone();user['roles']={'admin'}
    from .production_final import create
    try:
        with transaction(settings) as c:
            create(c,settings,production_service.job(c,settings,private['job_id']),user,'Fake result must never finalize')
    except Exception as exc:
        from fastapi import HTTPException
        assert isinstance(exc,HTTPException) and exc.detail['code']=='BAZIS_RUN_REQUIRED'
    else: raise ValueError('Fake finalized')
    agent_auth.revoke(settings,private['operator_id'],private['credential']['agent_id'])
    with transaction(settings) as c:
        for uid in (private['operator_id'],private['client_id']):
            c.execute("UPDATE mf_users SET account_status='disabled' WHERE user_id=%s",(uid,))
            c.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            c.execute('UPDATE mf_permission_grants SET revoked_at=now() WHERE user_id=%s AND revoked_at IS NULL',(uid,))
            c.execute("DELETE FROM mf_user_roles WHERE user_id=%s AND role='admin'",(uid,))
        current={str(r['file_id']):r['sha256'] for r in c.execute("SELECT file_id,sha256 FROM mf_files WHERE kind='preliminary_pdf'")}
        assert current==private['stage5_pdf_sha']
        for fid in current: read_verified(c,VolumeStore(settings.storage_root),fid)
        assert c.execute("SELECT count(*) n FROM mf_production_jobs WHERE schema_version=6 AND purpose='produce'").fetchone()['n']==0
        assert not c.execute('SELECT 1 FROM mf_bazis_calibrations').fetchone()
    evidence={k:v for k,v in private.items() if k not in ('credential','operator_id','client_id')}
    evidence.update(agent_id=private['credential']['agent_id'],external_https_roundtrip=outcome,result_repeat_idempotent=True,result_conflict_rejected=True,
        final_gate='BAZIS_RUN_REQUIRED',credentials_retired=True,stage5_pdfs_unchanged=True,production_jobs_created=0,
        native_calibration='NOT VERIFIED',legacy_transport='disabled',dispatch='disabled')
    evidence_path.write_text(json.dumps(evidence,indent=2));evidence_path.chmod(0o600)
    # Revoke and remove the now-useless plaintext credential; audit retains only identity.
    (settings.storage_root.parent/'stage06-acceptance-private.json').unlink()
    print('MF_STAGE06_LIVE='+json.dumps(evidence,separators=(',',':')),flush=True)
    return evidence


def main():
    """Temporary explicit start command; normal serve never runs this acceptance."""
    import threading,traceback,uvicorn
    from .config import Settings
    from .startup import prepare as migrate_checked
    settings=Settings.from_env();migrate_checked(settings);prepare(settings)
    policy=WebPolicy.from_env()
    def worker():
        from agent.runner import ORIGIN
        try:
            ready=False
            for _ in range(45):
                try:
                    with urllib.request.urlopen(ORIGIN+'/health',timeout=5) as response:
                        state=json.load(response)
                        ready=str(state.get('stage'))=='6'
                except (OSError,ValueError): pass
                if ready: break
                time.sleep(2)
            if not ready: raise RuntimeError('New Stage 6 HTTP deployment did not become ready')
            run_external(settings)
        except Exception:
            # Traceback contains no request headers, token or credential file contents.
            print('MF_STAGE06_ACCEPTANCE_FAILED',flush=True);traceback.print_exc()
    threading.Thread(target=worker,daemon=True).start()
    uvicorn.run(create_app(settings,policy),host='0.0.0.0',port=int(os.environ.get('PORT','8000')),access_log=False,proxy_headers=False)


if __name__=='__main__': main()
