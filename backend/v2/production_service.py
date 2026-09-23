"""Staging jobs, immutable per-run packages and admission. No production transport."""
from uuid import uuid4
from psycopg.types.json import Jsonb
from . import oblx_exporter
from .calculation_math import hash_value,canonical,plain
from .db import transaction
from .events import record_event
from .files import save_private_file,read_verified
from .storage import VolumeStore
from .security import error,verified
from .domain_api import require


def staff(c,user,permission,order_id,job_id=None):
    if not user['roles'] or user['roles'] & {'client','service_agent','viewer'}: error(403,'PERMISSION_DENIED')
    require(c,user,permission,order_id=order_id,job_id=job_id)
    if user['roles']=={'manager'}:
        o=c.execute('SELECT assigned_manager_id FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone()
        if not o or o['assigned_manager_id']!=user['user_id']: error(403,'MANAGER_ASSIGNMENT_REQUIRED')
    verified(user)


def job(c,settings,jid):
    r=c.execute('SELECT * FROM mf_production_jobs WHERE job_id=%s AND namespace=%s AND schema_version=6 FOR NO KEY UPDATE',
                (jid,settings.namespace)).fetchone()
    if not r: error(404,'JOB_NOT_FOUND')
    return r


def profile(c,actor,version):
    if version!=oblx_exporter.PREVIEW['version']: error(409,'EXPORT_PROFILE_UNSUPPORTED')
    p=oblx_exporter.PREVIEW;digest=hash_value(p)
    calibration=c.execute('SELECT calibration_id FROM mf_bazis_calibrations WHERE profile_version=%s AND profile_sha256=%s',(version,digest)).fetchone()
    c.execute('''INSERT INTO mf_bazis_export_profiles(version,snapshot,sha256,calibration_id,created_by)
        VALUES(%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',(version,Jsonb(p),digest,calibration['calibration_id'] if calibration else None,actor))
    r=c.execute('SELECT * FROM mf_bazis_export_profiles WHERE version=%s',(version,)).fetchone()
    if r['sha256']!=digest or r['snapshot']!=p: error(409,'EXPORT_PROFILE_DRIFT')
    return r


def check_current(c,j,produce=False):
    o=c.execute('SELECT * FROM mf_orders WHERE order_id=%s FOR NO KEY UPDATE',(j['order_id'],)).fetchone()
    if not o or o['active_revision_id']!=j['revision_id']: error(409,'STALE_REVISION')
    if o['workflow_status'] in ('cancelled','issued','ready','in_production'): error(409,'WORKFLOW_STATE_DENIED')
    if produce:
        if o['workflow_status']!='approved' or o['approved_revision_id']!=j['revision_id'] or not j['final_candidate_id'] or o['approved_final_candidate_id']!=j['final_candidate_id']:
            error(409,'APPROVED_FINAL_REQUIRED')
        final=c.execute('''SELECT f.* FROM mf_final_calculation_candidates f
          JOIN mf_job_results r USING(result_id) WHERE candidate_id=%s AND f.order_id=%s AND f.revision_id=%s
          AND f.preliminary_calculation_id=%s AND r.verified''',
          (j['final_candidate_id'],j['order_id'],j['revision_id'],j['calculation_id'])).fetchone()
        approvals=c.execute('SELECT phase FROM mf_final_approvals WHERE candidate_id=%s',(j['final_candidate_id'],)).fetchall()
        if not final or {a['phase'] for a in approvals}!={'manager_review','customer_confirmation'}: error(409,'APPROVED_FINAL_REQUIRED')
        original=c.execute('SELECT input_hash,export_profile_version FROM mf_production_jobs WHERE job_id=%s',(final['job_id'],)).fetchone()
        if original['input_hash']!=j['input_hash'] or original['export_profile_version']!=j['export_profile_version']: error(409,'APPROVED_PACKAGE_MISMATCH')
        if c.execute("SELECT 1 FROM mf_production_jobs WHERE order_id=%s AND revision_id=%s AND purpose='produce' AND schema_version=6 AND job_id<>%s AND status NOT IN ('failed','cancelled')",
                     (j['order_id'],j['revision_id'],j['job_id'])).fetchone(): error(409,'PRODUCE_ALREADY_EXISTS')
    return o


def artifact(settings,j,data,name,kind='internal',mime='application/json'):
    return save_private_file(settings,VolumeStore(settings.storage_root),actor=j['created_by'],data=data,name=name,kind=kind,mime=mime,
                             order_id=j['order_id'],revision_id=j['revision_id'],job_id=j['job_id'])


def package(c,settings,j,run_id):
    existing=c.execute('SELECT * FROM mf_job_packages WHERE run_id=%s',(run_id,)).fetchone()
    if existing: return existing
    source=j['manifest'];data=oblx_exporter.export(source['manufacturing'],source['display_number'])
    fid=artifact(settings,j,data,'input.oblx','oblx','application/xml')
    f=c.execute('SELECT file_id,kind,classification,sha256,size_bytes,mime_type FROM mf_files WHERE file_id=%s',(fid,)).fetchone()
    manifest=plain({'schema_version':2,'environment':'staging','namespace':settings.namespace,
        'order_id':j['order_id'],'revision_id':j['revision_id'],'calculation_id':j['calculation_id'],
        'job_id':j['job_id'],'run_id':run_id,'purpose':j['purpose'],'display_number':source['display_number'],
        'input_hash':j['input_hash'],'input_hashes':source['input_hashes'],'manufacturing':source['manufacturing'],
        'production_profile_version':j['production_profile_version'],'required_capabilities':j['required_capabilities'],
        'native_calibration':source['native_calibration'],'files':[f]})
    mid=artifact(settings,j,canonical(manifest).encode(),'manifest.json')
    row=c.execute('''INSERT INTO mf_job_packages(package_id,job_id,run_id,manifest,manifest_sha256,manifest_file_id,oblx_file_id)
        VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING *''',(uuid4(),j['job_id'],run_id,Jsonb(manifest),hash_value(manifest),mid,fid)).fetchone()
    record_event(c,settings,actor=j['created_by'],action='job.package.created',object_type='job',object_id=j['job_id'],reason='Immutable job-bound private package')
    return row


def create(settings,user,order_id,body,key):
    if not key or not 8<=len(key)<=128: error(428,'IDEMPOTENCY_KEY_REQUIRED')
    request_sha=hash_value(body.model_dump());permission='production.calculate.enqueue' if body.purpose=='calculate' else 'production.release'
    with transaction(settings) as c:
        c.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,6))',(order_id,))
        staff(c,user,permission,order_id)
        old=c.execute('SELECT * FROM mf_production_jobs WHERE order_id=%s AND created_by=%s AND request_key=%s',
                      (order_id,user['user_id'],key)).fetchone()
        if old:
            if old['request_sha256']!=request_sha: error(409,'IDEMPOTENCY_BODY_CONFLICT')
            jid=old['job_id']
        else:
            r=c.execute('SELECT * FROM mf_order_revisions WHERE revision_id=%s AND order_id=%s',(body.revision_id,order_id)).fetchone()
            calc=c.execute('''SELECT c.* FROM mf_calculations c JOIN mf_calculation_seals s USING(calculation_id)
               WHERE calculation_id=%s AND revision_id=%s AND order_id=%s''',(body.calculation_id,body.revision_id,order_id)).fetchone()
            if body.purpose=='produce' and not body.final_candidate_id: error(409,'APPROVED_FINAL_REQUIRED')
            if not r or not calc or r['schema_version']!=4 or r['immutable_at'] is None: error(409,'IMMUTABLE_REVISION_REQUIRED')
            p=profile(c,user['user_id'],body.export_profile_version)
            try: manufacturing=oblx_exporter.manufacturing_input(r,calc,p['snapshot'])
            except ValueError as exc: error(409,str(exc))
            o=c.execute('SELECT display_number FROM mf_orders WHERE order_id=%s',(order_id,)).fetchone()
            inputs={'revision':r['content_hash'],'calculation':calc['input_hash'],
                'price_tariff_snapshot':hash_value({k:calc['input_snapshot'][k] for k in ('prices','tariffs','discount')}),
                'manufacturing':hash_value(manufacturing)}
            calibration=c.execute('SELECT * FROM mf_bazis_calibrations WHERE calibration_id=%s',(p['calibration_id'],)).fetchone() if p['calibration_id'] else None
            if calibration:
                mappings={}
                for part in manufacturing['parts']:
                    signature=part['material']['identity_sha256']
                    mapping=c.execute('SELECT identity_sha256,native_mapping_id,local_catalogue_version FROM mf_bazis_material_mappings WHERE calibration_id=%s AND identity_sha256=%s',
                        (calibration['calibration_id'],signature)).fetchone()
                    if not mapping: error(409,'NATIVE_MATERIAL_MAPPING_REQUIRED')
                    mappings[signature]=mapping
                manufacturing['native_mappings']=mappings
                inputs['manufacturing']=hash_value(manufacturing)
            required=['protocol:mf-v2','purpose:'+body.purpose,'export:'+oblx_exporter.VERSION,'profile:'+p['version'],
                'result:mf-native-result-v1','executor:native' if calibration else 'executor:fake']
            if calibration: required.append('bazis:'+calibration['bazis_version'])
            if body.purpose=='produce' and not calibration: error(409,'BAZIS_CALIBRATION_REQUIRED')
            jid=uuid4();j={'job_id':jid,'order_id':order_id,'revision_id':body.revision_id,'calculation_id':body.calculation_id,
                'purpose':body.purpose,'final_candidate_id':body.final_candidate_id,'input_hash':hash_value(manufacturing),'export_profile_version':p['version']}
            check_current(c,j,body.purpose=='produce')
            c.execute('''INSERT INTO mf_production_jobs(job_id,order_id,revision_id,purpose,namespace,schema_version,status,input_hash,manifest,
                required_capabilities,created_by,calculation_id,production_profile_version,catalogue_release_id,export_profile_version,
                price_snapshot_sha256,request_key,request_sha256,final_candidate_id,admission_reason)
                VALUES(%s,%s,%s,%s,%s,6,'created',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                (jid,order_id,r['revision_id'],body.purpose,settings.namespace,j['input_hash'],
                 Jsonb(plain({'manufacturing':manufacturing,'input_hashes':inputs,'display_number':o['display_number'],
                     'native_calibration':'verified' if calibration else 'NOT VERIFIED'})),Jsonb(required),user['user_id'],
                 calc['calculation_id'],r['production_profile_id'],r['catalogue_release_id'],p['version'],inputs['price_tariff_snapshot'],key,request_sha,
                 body.final_candidate_id,body.reason))
            record_event(c,settings,actor=user['user_id'],action='job.created',object_type='job',object_id=jid,reason=body.reason)
    # Registered private bytes precede admission. An interrupted build stays created.
    with transaction(settings) as c:
        j=job(c,settings,jid);staff(c,user,permission,order_id)
        if j['status']=='created':
            check_current(c,j,j['purpose']=='produce')
            package(c,settings,j,uuid4())
            c.execute("UPDATE mf_production_jobs SET status='admitted',admitted_at=now() WHERE job_id=%s",(jid,))
            record_event(c,settings,actor=user['user_id'],action='job.'+j['purpose']+'.admitted',object_type='job',object_id=jid,reason=body.reason)
            j=job(c,settings,jid)
        return dto(c,j,user)


def dto(c,j,user):
    # No credential/lease digest, token, storage key, raw customer data or Windows path.
    out={k:j[k] for k in ('job_id','order_id','revision_id','calculation_id','purpose','status','result_state','created_at','admitted_at')}
    if user['roles']=={'admin'}:
        out.update({k:j[k] for k in ('namespace','schema_version','current_run_id','fencing','physical_started')})
    if user['roles'] & {'manager','accounting','admin'}:
        out['final_candidates']=c.execute('SELECT candidate_id,revision_id,created_at FROM mf_final_calculation_candidates WHERE job_id=%s',(j['job_id'],)).fetchall()
    return plain(out)


def cancel(c,settings,j,user,reason):
    staff(c,user,'production.jobs.cancel',j['order_id'],j['job_id'])
    if j['status'] in ('succeeded','cancelled','failed'): error(409,'TERMINAL_JOB')
    status='uncertain' if j['purpose']=='produce' and j['status'] in ('leased','running','result_uploaded','uncertain') else 'cancelled'
    c.execute('UPDATE mf_production_jobs SET status=%s,lease_expires_at=now() WHERE job_id=%s',(status,j['job_id']))
    if j['current_run_id']: c.execute('UPDATE mf_job_runs SET status=%s,completed_at=now() WHERE run_id=%s',(status,j['current_run_id']))
    record_event(c,settings,actor=user['user_id'],action='job.'+status,object_type='job',object_id=j['job_id'],reason=reason)
    return {'job_id':str(j['job_id']),'status':status}


def reconcile(c,settings,j,user,body):
    staff(c,user,'production.jobs.reconcile',j['order_id'],j['job_id'])
    if j['status']!='uncertain' or j['current_run_id']!=body.run_id: error(409,'UNCERTAIN_RUN_REQUIRED')
    for fid in body.evidence_file_ids:
        f=c.execute("SELECT 1 FROM mf_files WHERE file_id=%s AND job_id=%s AND classification='internal' AND status='ready'",(fid,j['job_id'])).fetchone()
        if not f: error(409,'JOB_RECONCILIATION_EVIDENCE_REQUIRED')
        read_verified(c,VolumeStore(settings.storage_root),fid)
    c.execute('INSERT INTO mf_job_reconciliations VALUES(%s,%s,%s,%s,%s,%s,%s,now())',
       (uuid4(),j['job_id'],body.run_id,body.decision,Jsonb(plain(body.evidence_file_ids)),user['user_id'],body.reason))
    status='uncertain' if body.decision=='retain_uncertain' else 'cancelled'
    c.execute('UPDATE mf_production_jobs SET status=%s WHERE job_id=%s',(status,j['job_id']))
    c.execute('UPDATE mf_job_runs SET status=%s,completed_at=now() WHERE run_id=%s',(status,body.run_id))
    record_event(c,settings,actor=user['user_id'],action='job.reconciled',object_type='job',object_id=j['job_id'],reason=body.reason)
    return {'status':status,'automatic_retry':False,'new_produce_requires_new_authorization':True}
