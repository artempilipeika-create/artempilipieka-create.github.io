"""Staff job controls and separate v2 Agent protocol. No client manifest projection."""
from datetime import datetime,timezone,timedelta
from uuid import UUID
from fastapi import APIRouter,Request,Response,HTTPException
from .auth_api import StrictModel
from .calculation_models import ReasonRequest
from .production_models import JobRequest,Capabilities,Pull,Event,Result,Reconciliation,FinalApproval
from .db import transaction
from .security import identity,error
from .events import record_event
from .files import read_verified
from .storage import VolumeStore
from . import production_service as jobs,job_transport as transport,agent_auth,production_final

class Empty(StrictModel): pass


def router(settings,policy):
    api=APIRouter(prefix='/api/v2')

    @api.post('/orders/{order_id}/production-jobs',status_code=201)
    def create(order_id:str,body:JobRequest,request:Request):
        with transaction(settings) as c: user=identity(c,request)
        return jobs.create(settings,user,order_id,body,request.headers.get('idempotency-key'))

    @api.get('/production-jobs/{job_id}')
    def read(job_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request)
            if user['roles'] & {'client','service_agent'}: error(403,'PERMISSION_DENIED')
            j=jobs.job(c,settings,job_id);jobs.staff(c,user,'production.jobs.read',j['order_id'],job_id)
            return jobs.dto(c,j,user)

    @api.post('/production-jobs/{job_id}/cancel')
    def cancel(job_id:UUID,body:ReasonRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);return jobs.cancel(c,settings,jobs.job(c,settings,job_id),user,body.reason)

    @api.post('/production-jobs/{job_id}/reconcile')
    def reconcile(job_id:UUID,body:Reconciliation,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);return jobs.reconcile(c,settings,jobs.job(c,settings,job_id),user,body)

    @api.post('/production-jobs/{job_id}/final-calculation',status_code=201)
    def final(job_id:UUID,body:ReasonRequest,request:Request):
        with transaction(settings) as c:
            user=identity(c,request);return production_final.create(c,settings,jobs.job(c,settings,job_id),user,body.reason)

    @api.post('/production-final-calculations/review')
    def review(body:FinalApproval,request:Request):
        with transaction(settings) as c: return production_final.review(c,settings,identity(c,request),body)

    @api.get('/production-final-calculations/{candidate_id}')
    def final_read(candidate_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request)
            if user['roles'] & {'client','production','service_agent','viewer'}: error(403,'PERMISSION_DENIED')
            f=c.execute('SELECT * FROM mf_final_calculation_candidates WHERE candidate_id=%s',(candidate_id,)).fetchone()
            if not f: error(404,'FINAL_CANDIDATE_NOT_FOUND')
            jobs.staff(c,user,'orders.prices.read',f['order_id'])
            # Accounting receives financial projection, no run/native manifests or secrets.
            if user['roles']=={'accounting'}:
                return {k:f[k] for k in ('candidate_id','order_id','revision_id','financial_snapshot','created_at')}
            return production_final.projection(c,f)

    def response(c,fid,request):
        f=c.execute('SELECT * FROM mf_files WHERE file_id=%s',(fid,)).fetchone()
        try: data=read_verified(c,VolumeStore(settings.storage_root),fid)
        except ValueError: error(409,'ARTIFACT_INTEGRITY_MISMATCH')
        return Response(b'' if request.method=='HEAD' else data,media_type=f['mime_type'],headers={
            'Content-Length':str(len(data)),'X-Content-SHA256':f['sha256'],
            'Content-Disposition':'attachment; filename="'+f['original_name']+'"'})

    @api.api_route('/production-jobs/{job_id}/artifacts/{file_id}',methods=['GET','HEAD'])
    def staff_file(job_id:UUID,file_id:UUID,request:Request):
        with transaction(settings) as c:
            user=identity(c,request)
            if user['roles'] & {'client','service_agent'}: error(403,'OBLX_CLIENT_DENIED')
            j=jobs.job(c,settings,job_id);jobs.staff(c,user,'orders.oblx.read',j['order_id'],job_id)
            if not c.execute('SELECT 1 FROM mf_files WHERE file_id=%s AND job_id=%s',(file_id,job_id)).fetchone(): error(404,'JOB_ARTIFACT_NOT_FOUND')
            return response(c,file_id,request)

    def invoke(request,operation,jid=None):
        agent=agent_auth.authenticate(settings,request)
        try:
            with transaction(settings) as c: return operation(c,agent)
        except HTTPException as exc:
            if jid:
                with transaction(settings) as c:
                    # Only audited references/codes, never a token, body, path or raw native log.
                    if c.execute('SELECT 1 FROM mf_production_jobs WHERE job_id=%s AND namespace=%s',(jid,settings.namespace)).fetchone():
                        code=exc.detail.get('code','REJECTED') if isinstance(exc.detail,dict) else 'REJECTED'
                        record_event(c,settings,actor=agent['actor_user_id'],action='job.request.rejected',object_type='job',object_id=jid,reason=code)
            raise

    @api.post('/agent/heartbeat')
    def heartbeat(body:Capabilities,request:Request):
        return invoke(request,lambda c,a:transport.heartbeat(c,settings,a,body))

    @api.post('/agent/jobs/pull')
    def pull(body:Pull,request:Request):
        return invoke(request,lambda c,a:transport.pull(c,settings,a,body))

    @api.post('/agent/jobs/{job_id}/events')
    def event(job_id:UUID,body:Event,request:Request):
        def perform(c,a):
            j,r,_=transport.leased(c,settings,a,job_id,request,body.run_id)
            return transport.event(c,settings,a,j,r,body)
        return invoke(request,perform,job_id)

    @api.post('/agent/jobs/{job_id}/results')
    def result(job_id:UUID,body:Result,request:Request):
        def perform(c,a):
            j,r,p=transport.leased(c,settings,a,job_id,request,body.run_id)
            return transport.result(c,settings,a,j,r,p,body)
        return invoke(request,perform,job_id)

    @api.post('/agent/jobs/{job_id}/renew')
    def renew(job_id:UUID,body:Empty,request:Request):
        def perform(c,a):
            j,r,_=transport.leased(c,settings,a,job_id,request)
            if j['status'] not in ('leased','running'): error(409,'LEASE_NOT_RENEWABLE')
            until=datetime.now(timezone.utc)+timedelta(seconds=transport.LEASE_SECONDS)
            c.execute('UPDATE mf_production_jobs SET lease_expires_at=%s WHERE job_id=%s',(until,job_id))
            c.execute('UPDATE mf_job_runs SET expires_at=%s WHERE run_id=%s',(until,r['run_id']))
            return {'expires_at':until,'fencing':r['fencing']}
        return invoke(request,perform,job_id)

    @api.api_route('/agent/jobs/{job_id}/artifacts/{file_id}',methods=['GET','HEAD'])
    def agent_file(job_id:UUID,file_id:UUID,request:Request):
        def perform(c,a):
            j,r,p=transport.leased(c,settings,a,job_id,request)
            if j['status'] not in ('leased','running') or file_id not in {p['manifest_file_id'],p['oblx_file_id']}: error(403,'JOB_ARTIFACT_SCOPE_DENIED')
            return response(c,file_id,request)
        return invoke(request,perform,job_id)
    return api
