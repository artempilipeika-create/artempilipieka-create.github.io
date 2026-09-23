import base64,json,time
from datetime import datetime,timezone
from uuid import uuid4
from fastapi.testclient import TestClient
from backend.v2 import agent_auth
from backend.v2.calculation_math import hash_value,canonical
from backend.v2.db import connect,transaction
from tests.stage03.test_api import post
from tests.stage04.test_api import submit
from tests.stage05.test_api import prepared

FAKE_CAPS=['protocol:mf-v2','purpose:calculate','export:mf-server-oblx-v1','profile:mf-oblx-preview-v1','result:mf-native-result-v1','executor:fake']


def ready(api):
    o,r,c,ctx,meta=prepared(api)
    sent=submit(api,o,r,c);assert sent.status_code==200,sent.text
    return o,r,c,sent.json()


def job(api,o,r,c,purpose='calculate',candidate=None,status=201,key=None):
    body={'revision_id':r['revision_id'],'calculation_id':c['calculation_id'],'purpose':purpose,'reason':'Synthetic Stage 6 authorized request'}
    if candidate: body['final_candidate_id']=candidate
    response=api.post('/api/v2/orders/'+o['order_id']+'/production-jobs',json=body,headers={'Idempotency-Key':key or uuid4().hex})
    assert response.status_code==status,response.text
    return response.json()


class Agent:
    def __init__(self,api,settings,admin,caps=None):
        self.caps=caps or FAKE_CAPS
        self.credential=agent_auth.issue(settings,admin['user_id'],self.caps)
        self.client=TestClient(api.app,base_url='https://testserver')

    def headers(self,lease=None,**extra):
        h={'Authorization':'Bearer '+self.credential['credential'],'X-MF-Request-ID':str(uuid4()),'X-MF-Timestamp':str(int(time.time()))}
        if lease: h.update({'X-MF-Lease':lease['lease_token'],'X-MF-Fencing':str(lease['fencing'])})
        h.update(extra);return h

    def request(self,method,path,body=None,lease=None,**headers):
        return self.client.request(method,'/api/v2/agent'+path,json=body,headers=self.headers(lease,**headers))

    def pull(self,purpose='calculate'):
        r=self.request('POST','/jobs/pull',{'capabilities':self.caps,'purpose':purpose});assert r.status_code==200,r.text
        return r.json()['jobs']

    def event(self,lease,kind='started',event_id=None,**extra):
        payload={'type':kind,'progress_percent':None,'code':None}
        body={'event_id':event_id or str(uuid4()),'run_id':lease['run_id'],'occurred_at':datetime.now(timezone.utc).isoformat(),
              **payload,'payload_hash':hash_value(payload),**extra}
        r=self.request('POST','/jobs/'+lease['job_id']+'/events',body,lease)
        return r,body

    def result(self,lease,body=None):
        body=body or fake_result(lease)
        r=self.request('POST','/jobs/'+lease['job_id']+'/results',body,lease)
        return r,body


def fake_result(lease):
    data=canonical({'execution':'fake','native_verified':False}).encode()
    return {**{k:lease[k] for k in ('job_id','run_id','order_id','revision_id','calculation_id')},'result_id':str(uuid4()),
       'input_manifest_hash':lease['manifest_sha256'],'bazis_version':'NOT_EXECUTED','started_at':datetime.now(timezone.utc).isoformat(),
       'completed_at':datetime.now(timezone.utc).isoformat(),'status':'succeeded','execution':'fake','native_signature':None,
       'artifacts':[{'artifact_id':str(uuid4()),'kind':'result_summary','sha256':agent_auth.digest(data.decode()),
          'size_bytes':len(data),'content_base64':base64.b64encode(data).decode()}]}


def expire(settings,lease):
    with transaction(settings) as c:
        c.execute("UPDATE mf_production_jobs SET lease_expires_at=now()-interval '1 second' WHERE job_id=%s",(lease['job_id'],))
        c.execute("UPDATE mf_job_runs SET expires_at=now()-interval '1 second' WHERE run_id=%s",(lease['run_id'],))


def cancel_open(settings):
    # Test isolation only; never imported by the deployed operator acceptance.
    with transaction(settings) as c:
        c.execute("UPDATE mf_production_jobs SET status='cancelled' WHERE schema_version=6 AND status NOT IN ('cancelled','failed','succeeded')")
