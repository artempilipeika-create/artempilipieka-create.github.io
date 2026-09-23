from copy import deepcopy
from uuid import uuid4
import json,os
import pytest
from backend.v2.db import connect,transaction
from backend.v2.files import read_verified
from backend.v2.storage import VolumeStore
from backend.v2 import agent_auth
from backend.v2.calculation_math import hash_value
from tests.stage03.test_api import settings,api,admin_user,post,login,PASSWORD
from tests.stage05.test_api import staff,client_order,document
from .support import ready,job,Agent,FAKE_CAPS,fake_result,expire,cancel_open


@pytest.fixture(autouse=True)
def agent_enabled(monkeypatch,settings):
    monkeypatch.setenv('MF_STAGING_AGENT_API','enabled');yield;cancel_open(settings)


def test_job01_lease_package_exact_ids_private_and_fresh_permissions(api,settings,admin_user):
    o,r,c,_=ready(api);j=job(api,o,r,c);a=Agent(api,settings,admin_user);lease=a.pull()[0]
    assert lease['job_id']==j['job_id'] and lease['fencing']==1
    res=a.request('GET','/jobs/'+j['job_id']+'/artifacts/'+lease['manifest_file_id'],lease=lease)
    assert res.status_code==200,res.text
    m=res.json();assert hash_value(m)==lease['manifest_sha256']
    for k in ('job_id','run_id','order_id','revision_id','calculation_id'): assert m[k]==lease[k]
    assert all(f['classification']=='internal' for f in m['files']) and 'storage_key' not in res.text
    fid=m['files'][0]['file_id'];blob=a.request('HEAD','/jobs/'+j['job_id']+'/artifacts/'+fid,lease=lease)
    assert blob.status_code==200 and int(blob.headers['content-length'])>0
    with connect(settings) as db:
        stored=db.execute('SELECT lease_digest FROM mf_production_jobs WHERE job_id=%s',(j['job_id'],)).fetchone()['lease_digest']
        assert stored!=lease['lease_token'] and stored==agent_auth.digest(lease['lease_token'])
    agent_auth.revoke(settings,admin_user['user_id'],a.credential['agent_id'])
    assert a.request('GET','/jobs/'+j['job_id']+'/artifacts/'+fid,lease=lease).status_code==401


def test_job02_to05_wrong_expired_released_fence_old_result_rejected(api,settings,admin_user):
    o,r,c,_=ready(api);job(api,o,r,c);a=Agent(api,settings,admin_user);b=Agent(api,settings,admin_user)
    first=a.pull()[0];bad={**first,'lease_token':'bad'};assert a.event(bad)[0].status_code==409
    assert a.event(first)[0].status_code==200;expire(settings,first)
    assert a.result(first)[0].json()['detail']['code']=='LEASE_EXPIRED'
    second=b.pull()[0];assert second['fencing']==first['fencing']+1 and second['run_id']!=first['run_id']
    assert a.result(first)[0].json()['detail']['code']=='STALE_JOB_RESULT'
    with connect(settings) as db:
        assert db.execute('SELECT status FROM mf_job_runs WHERE run_id=%s',(first['run_id'],)).fetchone()['status']=='expired'
        assert db.execute("SELECT count(*) n FROM mf_job_packages WHERE job_id=%s",(first['job_id'],)).fetchone()['n']==2


def test_job06_event_dedupe_one_audit_outbox_and_conflict(api,settings,admin_user):
    o,r,c,_=ready(api);job(api,o,r,c);a=Agent(api,settings,admin_user);lease=a.pull()[0]
    first,body=a.event(lease);assert first.status_code==200
    again=a.request('POST','/jobs/'+lease['job_id']+'/events',body,lease);assert again.json()==first.json()
    changed={**body,'code':'CHANGED'};changed['payload_hash']=hash_value({k:changed[k] for k in ('type','progress_percent','code')})
    assert a.request('POST','/jobs/'+lease['job_id']+'/events',changed,lease).status_code==409
    with connect(settings) as db:
        assert db.execute('SELECT count(*) n FROM mf_job_events WHERE event_id=%s',(body['event_id'],)).fetchone()['n']==1
        audits=db.execute("SELECT event_id FROM mf_audit WHERE object_id=%s AND action='job.event.started'",(lease['job_id'],)).fetchall()
        assert len(audits)==1 and db.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(audits[0]['event_id'],)).fetchone()


def test_job07_job08_result_idempotency_fake_never_final(api,settings,admin_user):
    o,r,c,_=ready(api);job(api,o,r,c);a=Agent(api,settings,admin_user);lease=a.pull()[0];a.event(lease)
    first,body=a.result(lease);assert first.status_code==200 and first.json()['verified'] is False,first.text
    assert a.result(lease,body)[0].json()==first.json()
    changed={**body,'bazis_version':'different'};assert a.result(lease,changed)[0].json()['detail']['code']=='RESULT_ID_CONFLICT'
    gate=api.post('/api/v2/production-jobs/'+lease['job_id']+'/final-calculation',json={'reason':'Fake must not finalize'})
    assert gate.status_code==409 and gate.json()['detail']['code']=='BAZIS_RUN_REQUIRED'
    with connect(settings) as db:
        assert db.execute('SELECT count(*) n FROM mf_job_results WHERE job_id=%s',(lease['job_id'],)).fetchone()['n']==1
        assert not db.execute('SELECT 1 FROM mf_final_calculation_candidates WHERE job_id=%s',(lease['job_id'],)).fetchone()
        assert db.execute('SELECT status FROM mf_production_jobs WHERE job_id=%s',(lease['job_id'],)).fetchone()['status']=='result_uploaded'


def test_job09_calculate_physical_event_and_produce_before_final_denied(api,settings,admin_user):
    o,r,c,_=ready(api);j=job(api,o,r,c);a=Agent(api,settings,admin_user);lease=a.pull()[0];a.event(lease)
    assert a.event(lease,'physical_started')[0].json()['detail']['code']=='CALCULATE_CANNOT_PRODUCE'
    assert job(api,o,r,c,'produce',status=409)['detail']['code']=='APPROVED_FINAL_REQUIRED'
    with connect(settings) as db: assert not db.execute('SELECT physical_started FROM mf_production_jobs WHERE job_id=%s',(j['job_id'],)).fetchone()['physical_started']


def test_agent_capability_mismatch_never_gets_job_and_browser_denied(api,settings,admin_user):
    o,r,c,_=ready(api);j=job(api,o,r,c)
    a=Agent(api,settings,admin_user,['protocol:mf-v2','purpose:calculate','executor:fake'])
    assert a.pull()==[]
    spoof=a.request('POST','/jobs/pull',{'capabilities':FAKE_CAPS,'purpose':'calculate'});assert spoof.status_code==403
    assert api.post('/api/v2/agent/jobs/pull',json={'capabilities':FAKE_CAPS,'purpose':'calculate'}).status_code==403
    assert a.request('POST','/heartbeat',{'capabilities':a.caps},Origin='https://testserver').status_code==403


def test_agent_nonce_replay_timestamp_and_rate_limit(api,settings,admin_user):
    a=Agent(api,settings,admin_user);h=a.headers();body={'capabilities':a.caps}
    first=a.client.post('/api/v2/agent/heartbeat',json=body,headers=h);assert first.status_code==200
    assert a.client.post('/api/v2/agent/heartbeat',json=body,headers=h).json()['detail']['code']=='AGENT_REQUEST_REPLAY'
    assert a.request('POST','/heartbeat',body,**{'X-MF-Timestamp':'1'}).status_code==401
    with transaction(settings) as db:
        for _ in range(120): db.execute('INSERT INTO mf_agent_requests(agent_id,request_id) VALUES(%s,%s)',(a.credential['agent_id'],uuid4()))
    assert a.request('POST','/heartbeat',body).status_code==429


def test_client_oblx_new_routes_head_range_alternate_zip_history_denied(api,settings,admin_user):
    o,r,c,email=client_order(api,settings,admin_user)
    from tests.stage04.test_api import submit
    assert submit(api,o,r,c).status_code==200
    login(api,admin_user['email']);j=job(api,o,r,c)
    with connect(settings) as db: p=db.execute('SELECT * FROM mf_job_packages WHERE job_id=%s',(j['job_id'],)).fetchone()
    login(api,email)
    for fid in (p['oblx_file_id'],p['manifest_file_id']):
        for path in ['/production-jobs/'+j['job_id']+'/artifacts/'+str(fid),'/files/'+str(fid),'/files/'+str(fid)+'/download','/files/'+str(fid)+'/preview','/documents/'+str(fid)]:
            for method in ('GET','HEAD'): assert api.request(method,'/api/v2'+path,headers={'Range':'bytes=0-10'}).status_code==403
    for path in ['/production-jobs/'+j['job_id'],'/orders/'+o['order_id']+'/oblx','/orders/'+o['order_id']+'/files.zip']:
        assert api.get('/api/v2'+path).status_code in (403,404)
    for path in ['/account/orders/'+o['order_id'],'/account/orders/'+o['order_id']+'/documents','/account/orders/'+o['order_id']+'/timeline','/orders/'+o['order_id']+'/history']:
        response=api.get('/api/v2'+path);assert response.status_code==200
        assert str(p['oblx_file_id']) not in response.text and j['job_id'] not in response.text and 'manifest' not in response.text
    assert api.get('/public/'+str(p['oblx_file_id'])+'.pdf').status_code==404


def test_job_refs_package_artifacts_immutable(api,settings,admin_user):
    o,r,c,_=ready(api);j=job(api,o,r,c)
    with connect(settings) as db: p=db.execute('SELECT * FROM mf_job_packages WHERE job_id=%s',(j['job_id'],)).fetchone()
    for query,args in [("UPDATE mf_production_jobs SET purpose='produce' WHERE job_id=%s",(j['job_id'],)),
        ("UPDATE mf_job_packages SET manifest='{}' WHERE package_id=%s",(p['package_id'],)),
        ("UPDATE mf_files SET sha256=%s WHERE file_id=%s",('a'*64,p['oblx_file_id']))]:
        with pytest.raises(Exception):
            with transaction(settings) as db: db.execute(query,args)


def test_job_create_idempotency_atomic_admission_and_unsupported_xml(api,settings,admin_user):
    o,r,c,_=ready(api);key=uuid4().hex;a=job(api,o,r,c,key=key);b=job(api,o,r,c,key=key);assert a==b
    response=api.post('/api/v2/orders/'+o['order_id']+'/production-jobs',json={'revision_id':r['revision_id'],'calculation_id':c['calculation_id'],
        'purpose':'calculate','reason':'Different request','oblx':'<Root/>'},headers={'Idempotency-Key':key})
    assert response.status_code==422
    with connect(settings) as db:
        assert db.execute('SELECT count(*) n FROM mf_production_jobs WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==1
        row=db.execute("SELECT event_id FROM mf_audit WHERE object_id=%s AND action='job.calculate.admitted'",(a['job_id'],)).fetchone()
        assert row and db.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(row['event_id'],)).fetchone()


def test_result_native_claim_without_calibration_and_bad_hash_denied(api,settings,admin_user):
    o,r,c,_=ready(api);job(api,o,r,c);a=Agent(api,settings,admin_user);lease=a.pull()[0];a.event(lease)
    body=fake_result(lease);body['execution']='native';body['bazis_version']='FAKE CLAIM'
    assert a.result(lease,body)[0].json()['detail']['code']=='BAZIS_CALIBRATION_REQUIRED'
    body=fake_result(lease);body['artifacts'][0]['sha256']='a'*64
    assert a.result(lease,body)[0].json()['detail']['code']=='ARTIFACT_HASH_MISMATCH'
    with connect(settings) as db:
        assert not db.execute('SELECT 1 FROM mf_job_results WHERE run_id=%s',(lease['run_id'],)).fetchone()
        assert db.execute("SELECT count(*) n FROM mf_audit WHERE object_id=%s AND action='job.request.rejected'",(lease['job_id'],)).fetchone()['n']==2


def test_separate_agent_package_real_http_contract_fake_roundtrip(api,settings,admin_user,tmp_path):
    from agent.runner import run_once
    o,r,c,_=ready(api);j=job(api,o,r,c);a=Agent(api,settings,admin_user)
    class Adapter:
        def request(self,method,path,body=None,lease=None):
            response=a.request(method,path.removeprefix('/api/v2/agent'),body,lease)
            assert response.status_code==200,response.text
            return response.content
    outcome=run_once(Adapter(),tmp_path/'independent-staging-agent',a.caps,settings.namespace)
    assert outcome['claimed'] and outcome['verified'] is False and outcome['job_id']==j['job_id']
    assert (tmp_path/'independent-staging-agent'/'ledger.sqlite3').exists()
