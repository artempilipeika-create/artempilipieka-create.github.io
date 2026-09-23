"""Lease/fencing protocol; fake staging transport cannot authorize native execution."""
import base64,hmac,secrets
from datetime import datetime,timezone,timedelta
from uuid import uuid4
from psycopg.types.json import Jsonb
from . import agent_auth,native_result,production_service as jobs
from .calculation_math import canonical,hash_value,plain
from .events import record_event
from .security import error
from .storage import sha256

LEASE_SECONDS=120


def expire(c,settings,j,actor):
    if j['status'] not in ('leased','running') or not j['lease_expires_at'] or j['lease_expires_at']>datetime.now(timezone.utc): return False
    status='uncertain' if j['purpose']=='produce' else 'admitted'
    c.execute('UPDATE mf_production_jobs SET status=%s WHERE job_id=%s',(status,j['job_id']))
    c.execute('UPDATE mf_job_runs SET status=%s,completed_at=now() WHERE run_id=%s',('uncertain' if status=='uncertain' else 'expired',j['current_run_id']))
    record_event(c,settings,actor=actor,action='job.lease.'+('uncertain' if status=='uncertain' else 'expired'),object_type='job',object_id=j['job_id'],reason='Lease expired; physical work is never blindly retried')
    return True


def heartbeat(c,settings,agent,body):
    a=agent_auth.current(c,settings,agent);reported=agent_auth.capabilities(body.capabilities)
    if not set(reported)<=set(a['allowed_capabilities']): error(403,'CAPABILITY_NOT_AUTHORIZED')
    c.execute('UPDATE mf_staging_agents SET reported_capabilities=%s,last_heartbeat_at=now() WHERE agent_id=%s',(Jsonb(reported),a['agent_id']))
    return {'agent_id':str(a['agent_id']),'environment':'staging','namespace':settings.namespace,'capabilities':reported}


def pull(c,settings,agent,body):
    heartbeat(c,settings,agent,body);caps=set(body.capabilities)
    if 'purpose:'+body.purpose not in caps: error(403,'PURPOSE_CAPABILITY_REQUIRED')
    # SKIP LOCKED serializes claim and expiry across independent Agent processes.
    rows=c.execute('''SELECT * FROM mf_production_jobs WHERE namespace=%s AND schema_version=6
        AND status IN ('admitted','leased','running') ORDER BY created_at,job_id FOR NO KEY UPDATE SKIP LOCKED LIMIT 100''',(settings.namespace,)).fetchall()
    for j in rows:
        if expire(c,settings,j,agent['actor_user_id']): j=jobs.job(c,settings,j['job_id'])
        if j['status']!='admitted' or j['purpose']!=body.purpose or not set(j['required_capabilities'])<=caps: continue
        # Stale admitted revisions are retained for operator review, never executed.
        o=c.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR NO KEY UPDATE',(j['order_id'],)).fetchone()
        if o['active_revision_id']!=j['revision_id'] or o['workflow_status'] in ('cancelled','ready','issued','in_production'): continue
        jobs.check_current(c,j,j['purpose']=='produce')
        initial=c.execute('SELECT * FROM mf_job_packages WHERE job_id=%s ORDER BY created_at LIMIT 1',(j['job_id'],)).fetchone()
        run_id=initial['run_id'] if j['attempt']==0 else uuid4()
        p=initial if j['attempt']==0 else jobs.package(c,settings,j,run_id)
        token=secrets.token_urlsafe(48);fence=j['fencing']+1;until=datetime.now(timezone.utc)+timedelta(seconds=LEASE_SECONDS)
        c.execute('''INSERT INTO mf_job_runs(run_id,job_id,package_id,fencing,agent_id,lease_digest,expires_at,status)
            VALUES(%s,%s,%s,%s,%s,%s,%s,'leased')''',(run_id,j['job_id'],p['package_id'],fence,agent['agent_id'],agent_auth.digest(token),until))
        c.execute('''UPDATE mf_production_jobs SET status='leased',current_run_id=%s,lease_agent_id=%s,lease_digest=%s,
            lease_expires_at=%s,fencing=%s,attempt=attempt+1 WHERE job_id=%s''',
            (run_id,agent['agent_id'],agent_auth.digest(token),until,fence,j['job_id']))
        eid=uuid4();payload={'fencing':fence}
        c.execute('INSERT INTO mf_job_events(event_id,job_id,event_type,payload,run_id,fencing,occurred_at,payload_hash) VALUES(%s,%s,%s,%s,%s,%s,now(),%s)',
          (eid,j['job_id'],'leased',Jsonb(payload),run_id,fence,hash_value(payload)))
        record_event(c,settings,actor=agent['actor_user_id'],action='job.released' if j['attempt'] else 'job.leased',object_type='job',object_id=j['job_id'],reason='Capability-matched staging lease',version=fence)
        return {'jobs':[plain({'job_id':j['job_id'],'run_id':run_id,'order_id':j['order_id'],'revision_id':j['revision_id'],
            'calculation_id':j['calculation_id'],'purpose':j['purpose'],'lease_token':token,'fencing':fence,'expires_at':until,
            'manifest_sha256':p['manifest_sha256'],'manifest_file_id':p['manifest_file_id'],
            'manifest_url':'/api/v2/agent/jobs/'+str(j['job_id'])+'/artifacts/'+str(p['manifest_file_id'])})]}
    return {'jobs':[]}


def leased(c,settings,agent,jid,request,run_id=None):
    agent_auth.current(c,settings,agent);j=jobs.job(c,settings,jid)
    try: fencing=int(request.headers.get('x-mf-fencing',''))
    except ValueError: error(409,'LEASE_REQUIRED')
    token=request.headers.get('x-mf-lease','')
    if (not token or len(token)>128 or j['lease_agent_id']!=agent['agent_id'] or fencing!=j['fencing']
        or not j['lease_digest'] or not hmac.compare_digest(j['lease_digest'],agent_auth.digest(token))): error(409,'STALE_JOB_RESULT')
    if not j['lease_expires_at'] or j['lease_expires_at']<=datetime.now(timezone.utc): error(409,'LEASE_EXPIRED')
    if run_id and j['current_run_id']!=run_id: error(409,'STALE_JOB_RESULT')
    run=c.execute('SELECT * FROM mf_job_runs WHERE run_id=%s',(j['current_run_id'],)).fetchone()
    if not run or run['agent_id']!=agent['agent_id'] or run['fencing']!=fencing: error(409,'STALE_JOB_RESULT')
    p=c.execute('SELECT * FROM mf_job_packages WHERE package_id=%s',(run['package_id'],)).fetchone()
    return j,run,p


def event(c,settings,agent,j,run,body):
    payload={'type':body.type,'progress_percent':body.progress_percent,'code':body.code}
    if hash_value(payload)!=body.payload_hash: error(409,'EVENT_PAYLOAD_HASH_MISMATCH')
    if body.occurred_at.tzinfo is None or abs((datetime.now(timezone.utc)-body.occurred_at).total_seconds())>86400: error(422,'EVENT_TIME_INVALID')
    fullhash=hash_value(body.model_dump())
    old=c.execute('SELECT * FROM mf_job_events WHERE event_id=%s',(body.event_id,)).fetchone()
    if old:
        if old['job_id']!=j['job_id'] or old['run_id']!=run['run_id'] or old['payload_hash']!=fullhash: error(409,'EVENT_ID_CONFLICT')
        return {'event_id':str(body.event_id),'accepted':True}
    if j['status'] not in ('leased','running'): error(409,'EVENT_STATE_DENIED')
    status=j['status'];physical=False
    if body.type=='started':
        if status!='leased': error(409,'ALREADY_STARTED')
        status='running'
    elif body.type=='physical_started':
        if j['purpose']!='produce': error(409,'CALCULATE_CANNOT_PRODUCE')
        if status!='running': error(409,'RUNNING_REQUIRED')
        jobs.check_current(c,j,True);physical=True
        c.execute("UPDATE mf_orders SET workflow_status='in_production',optimistic_lock_version=optimistic_lock_version+1,updated_at=now() WHERE order_id=%s",(j['order_id'],))
    elif body.type in ('failed','cancelled','uncertain'):
        status='uncertain' if j['purpose']=='produce' else ('failed' if body.type=='uncertain' else body.type)
    elif status!='running': error(409,'RUNNING_REQUIRED')
    c.execute('''UPDATE mf_production_jobs SET status=%s,physical_started=physical_started OR %s WHERE job_id=%s''',(status,physical,j['job_id']))
    c.execute('''UPDATE mf_job_runs SET status=%s,physical_started=physical_started OR %s,
        started_at=CASE WHEN %s='started' THEN now() ELSE started_at END,
        completed_at=CASE WHEN %s IN ('failed','cancelled','uncertain') THEN now() ELSE completed_at END WHERE run_id=%s''',
        (status,physical,body.type,status,run['run_id']))
    c.execute('INSERT INTO mf_job_events(event_id,job_id,event_type,payload,run_id,fencing,occurred_at,payload_hash) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
       (body.event_id,j['job_id'],body.type,Jsonb(payload),run['run_id'],run['fencing'],body.occurred_at,fullhash))
    record_event(c,settings,actor=agent['actor_user_id'],action='job.event.'+body.type,object_type='job',object_id=j['job_id'],reason='Accepted bounded v2 Agent event',version=run['fencing'])
    return {'event_id':str(body.event_id),'accepted':True}


def result(c,settings,agent,j,run,p,body):
    payload_hash=hash_value(body.model_dump())
    old=c.execute('SELECT * FROM mf_job_results WHERE result_id=%s',(body.result_id,)).fetchone()
    if old:
        if old['run_id']!=run['run_id'] or old['job_id']!=j['job_id'] or old['payload_sha256']!=payload_hash: error(409,'RESULT_ID_CONFLICT')
        return {'result_id':str(body.result_id),'accepted':True,'verified':old['verified']}
    if c.execute('SELECT 1 FROM mf_job_results WHERE run_id=%s',(run['run_id'],)).fetchone(): error(409,'RUN_RESULT_ALREADY_EXISTS')
    if j['status']!='running': error(409,'RUNNING_REQUIRED')
    if any(str(getattr(body,k))!=str(j[k]) for k in ('job_id','order_id','revision_id','calculation_id')) or body.input_manifest_hash!=p['manifest_sha256']:
        error(409,'RESULT_INPUT_MISMATCH')
    if body.started_at.tzinfo is None or body.completed_at.tzinfo is None or not run['started_at']:
        error(422,'RESULT_TIME_INVALID')
    now=datetime.now(timezone.utc)
    if body.completed_at<body.started_at or body.completed_at>now+timedelta(seconds=60) or body.started_at<run['created_at']-timedelta(seconds=60): error(422,'RESULT_TIME_INVALID')
    seen=set();decoded=[];total=0
    for a in body.artifacts:
        if a.artifact_id in seen: error(409,'DUPLICATE_ARTIFACT_ID')
        seen.add(a.artifact_id)
        try: data=base64.b64decode(a.content_base64,validate=True)
        except ValueError: error(422,'ARTIFACT_ENCODING_INVALID')
        if sha256(data)!=a.sha256 or len(data)!=a.size_bytes: error(409,'ARTIFACT_HASH_MISMATCH')
        total+=len(data)
        if total>3*1024*1024: error(413,'RESULT_UPLOAD_LIMIT')
        if a.kind=='returned_oblx':
            from .oblx_exporter import inspect
            try: inspect(data)
            except Exception: error(422,'RETURNED_XML_UNSAFE')
        decoded.append((a,data))
    calibration,summary=native_result.verify(c,j,run,p,body,decoded)
    files=[]
    for a,data in decoded:
        kind='oblx' if a.kind=='returned_oblx' else 'internal'
        mime='application/xml' if kind=='oblx' else ('application/json' if a.kind in ('result_summary','cutting_output') else 'application/octet-stream')
        fid=jobs.artifact(settings,j,data,a.kind+('.oblx' if kind=='oblx' else '.json' if mime=='application/json' else '.bin'),kind,mime)
        files.append({'file_id':str(fid),'artifact_id':str(a.artifact_id),'kind':a.kind,'classification':'internal','sha256':a.sha256,'size_bytes':a.size_bytes,'mime_type':mime})
    manifest=plain({**native_result.statement(body),'artifacts':files,'verified':bool(calibration),'native_facts':summary,
        'calibration_id':calibration,'schema_version':2,'fencing':run['fencing']})
    fid=jobs.artifact(settings,j,canonical(manifest).encode(),'result-manifest.json')
    c.execute('''INSERT INTO mf_job_results(result_id,job_id,run_id,payload_sha256,manifest,manifest_file_id,input_manifest_sha256,verified,calibration_id)
       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
       (body.result_id,j['job_id'],run['run_id'],payload_hash,Jsonb(manifest),fid,p['manifest_sha256'],bool(calibration),calibration))
    c.execute("UPDATE mf_production_jobs SET status='result_uploaded',result_state=%s WHERE job_id=%s",('verified' if calibration else 'unverified',j['job_id']))
    c.execute("UPDATE mf_job_runs SET status='result_uploaded',completed_at=now() WHERE run_id=%s",(run['run_id'],))
    if body.status=='failed' and not calibration:
        c.execute("UPDATE mf_production_jobs SET status='failed' WHERE job_id=%s",(j['job_id'],))
        c.execute("UPDATE mf_job_runs SET status='failed' WHERE run_id=%s",(run['run_id'],))
    if calibration:
        c.execute("UPDATE mf_production_jobs SET status='succeeded' WHERE job_id=%s",(j['job_id'],))
        c.execute("UPDATE mf_job_runs SET status='succeeded' WHERE run_id=%s",(run['run_id'],))
    record_event(c,settings,actor=agent['actor_user_id'],action='job.result.accepted',object_type='job',object_id=j['job_id'],reason='Verified native result' if calibration else 'Unverified staging result; final gate remains closed',version=run['fencing'])
    return {'result_id':str(body.result_id),'accepted':True,'verified':bool(calibration)}
