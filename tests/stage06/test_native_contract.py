"""Synthetic signed adapter reports only. These tests NEVER establish BAZIS PASS."""
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from uuid import uuid4
import base64,json,os
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
from psycopg import sql
from psycopg.types.json import Jsonb
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from backend.v2.db import connect,transaction
from backend.v2.oblx_exporter import PREVIEW,identity
from backend.v2.calculation_math import hash_value,canonical,plain
from backend.v2.production_models import Result
from backend.v2.native_result import statement
from backend.v2.backup import backup,restore
from backend.v2.stage06_operator import verify
from tests.stage03.test_api import settings,api,admin_user,post,login
from tests.stage04.test_api import revision,request_detail,item
from tests.stage05.test_api import staff
from .support import ready,job,Agent,fake_result,expire,cancel_open

KEY=Ed25519PrivateKey.generate()
VERSION='SYNTHETIC-PARSER-CONTRACT-ONLY'
CAPS=['protocol:mf-v2','purpose:calculate','purpose:produce','export:mf-server-oblx-v1','profile:mf-oblx-preview-v1',
      'result:mf-native-result-v1','executor:native','bazis:'+VERSION]

@pytest.fixture(autouse=True)
def native_test_boundary(monkeypatch,settings):
    monkeypatch.setenv('MF_STAGING_AGENT_API','enabled');yield;cancel_open(settings)


def enroll_test_attestor(settings,admin):
    # Only test-local DB seeding, no operator/API bypass to calibration in application code.
    evidence={'test_only':True,'native_BAZIS':'NOT VERIFIED','purpose':'exercise cryptographic contract'}
    with transaction(settings) as c:
        c.execute('''INSERT INTO mf_bazis_calibrations(calibration_id,profile_version,profile_sha256,bazis_version,result_format,
            attestor_public_key,evidence,evidence_sha256,approved_by) VALUES(%s,%s,%s,%s,'mf-native-result-v1',%s,%s,%s,%s)
            ON CONFLICT(profile_version) DO NOTHING''',
            (uuid4(),PREVIEW['version'],hash_value(PREVIEW),VERSION,base64.b64encode(KEY.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)).decode(),
             Jsonb(evidence),hash_value(evidence),admin['user_id']))


def native_body(settings,lease):
    body=fake_result(lease);body.update(execution='native',bazis_version=VERSION)
    with connect(settings) as c:
        j=c.execute('SELECT * FROM mf_production_jobs WHERE job_id=%s',(lease['job_id'],)).fetchone()
    materials={};parts=[]
    for p in j['manifest']['manufacturing']['parts']:
        b=p['blank'];key=p['material_key']+':'+p['supply_source']
        materials[key]={'material_key':key,'identity_sha256':p['material']['identity_sha256'],'native_mapping_id':'SYNTHETIC-'+key,
            'local_catalogue_version':'SYNTHETIC-ONLY','sheet_count':2,'cut_metres':'5','cut_basis':'excluding_trim'}
        parts.append({'detail_id':b['detail_id'],'material_key':key,'length':b['length'],'width':b['width'],'qty':b['qty'],
            'grain':p['grain'],'rotation_allowed':p['rotation_allowed'],
            'edges':{s:e['edge']['identity_sha256'] if e['edge'] else None for s,e in b['edges'].items()}})
    report={**{k:lease[k] for k in ('job_id','run_id','order_id','revision_id','calculation_id')},'input_manifest_hash':lease['manifest_sha256'],
        'schema':'mf-native-result-v1','bazis_version':VERSION,'fatal_errors':[],'status':'succeeded','manufacturing_sha256':j['input_hash'],
        'materials':list(materials.values()),'parts':parts,'warnings':['SYNTHETIC CONTRACT TEST; not native evidence']}
    data=canonical(report).encode()
    body['artifacts']=[{'artifact_id':str(uuid4()),'kind':kind,'sha256':hash_value(report),'size_bytes':len(data),'content_base64':base64.b64encode(data).decode()} for kind in ('result_summary','cutting_output')]
    body['native_signature']=base64.b64encode(KEY.sign(canonical(statement(Result.model_validate(body))).encode())).decode()
    return body


def register_test_mapping(settings,admin,r):
    with transaction(settings) as db:
        rev=db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(r['revision_id'],)).fetchone()['content']
        cal=db.execute('SELECT calibration_id FROM mf_bazis_calibrations WHERE profile_version=%s',(PREVIEW['version'],)).fetchone()['calibration_id']
        for d in rev['details']:
            m=identity(d['material'],'material');key=m['variant_id']+':'+d['supply_source']
            db.execute("INSERT INTO mf_bazis_material_mappings VALUES(%s,%s,%s,'SYNTHETIC-ONLY',%s,now()) ON CONFLICT DO NOTHING",
                (cal,m['identity_sha256'],'SYNTHETIC-'+key,admin['user_id']))


def calculated(api,settings,admin_user):
    enroll_test_attestor(settings,admin_user);o,r,c,sent=ready(api);register_test_mapping(settings,admin_user,r)
    j=job(api,o,r,c);a=Agent(api,settings,admin_user,CAPS)
    lease=a.pull()[0];assert a.event(lease)[0].status_code==200
    response,_=a.result(lease,native_body(settings,lease));assert response.status_code==200,response.text
    assert response.json()['verified'] is True
    return o,r,c,sent,j,a,lease


def candidate(api,j):
    return post(api,'/production-jobs/'+j['job_id']+'/final-calculation',{'reason':'Synthetic signed contract result review'},status=201)


def approve(api,o,r,f):
    post(api,'/production-final-calculations/review',{'candidate_id':f['candidate_id'],'revision_id':r['revision_id'],'reason':'Explicit manager test approval'})
    return post(api,'/orders/'+o['order_id']+'/approve',{'candidate_id':f['candidate_id'],'revision_id':r['revision_id'],
        'reason':'Synthetic customer confirmation recorded by manager'})


def test_final03_to05_signed_contract_candidate_separate_approval_exact_run(api,settings,admin_user):
    o,r,c,_,j,a,lease=calculated(api,settings,admin_user)
    before=api.get('/api/v2/calculations/'+c['calculation_id']).content;f=candidate(api,j)
    assert f['run_id']==lease['run_id'] and f['revision_id']==r['revision_id'] and not f['manager_reviewed'] and not f['customer_confirmed']
    assert f['financial_snapshot']['total']!=c['total']
    assert api.get('/api/v2/calculations/'+c['calculation_id']).content==before
    assert api.get('/api/v2/orders/'+o['order_id']).json()['workflow_status']=='submitted'
    assert job(api,o,r,c,'produce',f['candidate_id'],status=409)['detail']['code']=='APPROVED_FINAL_REQUIRED'
    post(api,'/production-final-calculations/review',{'candidate_id':f['candidate_id'],'revision_id':r['revision_id'],'reason':'Manager exact review'})
    assert api.get('/api/v2/orders/'+o['order_id']).json()['workflow_status']=='awaiting_approval'
    assert api.post('/api/v2/orders/'+o['order_id']+'/approve',json={'candidate_id':f['candidate_id'],'revision_id':str(uuid4()),'reason':'Wrong revision'}).status_code==409
    assert approve(api,o,r,f)['workflow_status']=='approved'
    assert job(api,o,r,c,'produce',f['candidate_id'])['purpose']=='produce'


def test_final06_new_revision_never_inherits_approval(api,settings,admin_user):
    o,r,c,_,j,a,lease=calculated(api,settings,admin_user);f=candidate(api,j);approve(api,o,r,f)
    current=api.get('/api/v2/orders/'+o['order_id']).json()
    rr=revision(api,o,c['catalogue_release_id'],[request_detail(item(api,c['catalogue_release_id']),qty=2)],current['optimistic_lock_version'],r['revision_id'])
    with connect(settings) as db:
        row=db.execute('SELECT * FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()
        assert row['approved_revision_id'] is None and row['approved_final_candidate_id'] is None and row['reviewed_final_candidate_id'] is None and row['workflow_status']=='review'
    assert job(api,o,r,c,'produce',f['candidate_id'],status=409)['detail']['code']=='STALE_REVISION'
    assert api.post('/api/v2/orders/'+o['order_id']+'/approve',json={'candidate_id':f['candidate_id'],'revision_id':rr['revision_id'],'reason':'No inherited approval'}).status_code==409


def test_job12_job13_physical_disconnect_uncertain_no_blind_retry(api,settings,admin_user):
    o,r,c,_,j,a,lease=calculated(api,settings,admin_user);f=candidate(api,j);approve(api,o,r,f)
    p=job(api,o,r,c,'produce',f['candidate_id']);produce=a.pull('produce')[0]
    assert a.event(produce)[0].status_code==200
    assert a.event(produce,'physical_started')[0].status_code==200
    expire(settings,produce);b=Agent(api,settings,admin_user,CAPS);assert b.pull('produce')==[]
    status=api.get('/api/v2/production-jobs/'+p['job_id']).json();assert status['status']=='uncertain' and status['physical_started']
    with connect(settings) as db:
        assert db.execute('SELECT count(*) n FROM mf_job_runs WHERE job_id=%s',(p['job_id'],)).fetchone()['n']==1
        evidence=db.execute('SELECT manifest_file_id FROM mf_job_packages WHERE run_id=%s',(produce['run_id'],)).fetchone()['manifest_file_id']
    response=post(api,'/production-jobs/'+p['job_id']+'/reconcile',{'run_id':produce['run_id'],'decision':'retain_uncertain',
         'evidence_file_ids':[str(evidence)],'reason':'Synthetic operator review cannot yet establish physical outcome'})
    assert response['status']=='uncertain' and not response['automatic_retry']
    assert b.pull('produce')==[]


def test_native_exit_zero_missing_outputs_signature_wrong_mapping_fatal_rejected(api,settings,admin_user):
    enroll_test_attestor(settings,admin_user);o,r,c,_=ready(api);register_test_mapping(settings,admin_user,r)
    job(api,o,r,c);a=Agent(api,settings,admin_user,CAPS);lease=a.pull()[0];a.event(lease)
    valid=native_body(settings,lease)
    wrong=deepcopy(valid);wrong['native_signature']=base64.b64encode(b'x'*64).decode()
    assert a.result(lease,wrong)[0].json()['detail']['code']=='NATIVE_ATTESTATION_INVALID'
    for mutation,code in [('missing','EXPECTED_RESULT_FILES_REQUIRED'),('mapping','NATIVE_MAPPING_MISMATCH'),('fatal','NATIVE_FATAL_OR_INCOMPLETE'),('run','NATIVE_RUN_MISMATCH')]:
        body=deepcopy(valid)
        if mutation=='missing': body['artifacts']=body['artifacts'][:1]
        else:
            for artifact in body['artifacts']:
                report=json.loads(base64.b64decode(artifact['content_base64']))
                if mutation=='mapping': report['materials'][0]['identity_sha256']='a'*64
                if mutation=='fatal': report['fatal_errors']=['ERROR']
                if mutation=='run': report['run_id']=str(uuid4())
                data=canonical(report).encode();artifact.update(content_base64=base64.b64encode(data).decode(),size_bytes=len(data),sha256=hash_value(report))
        body['native_signature']=base64.b64encode(KEY.sign(canonical(statement(Result.model_validate(body))).encode())).decode()
        result,_=a.result(lease,body);assert result.status_code==409 and result.json()['detail']['code']==code,result.text


def test_stage06_real_restore_jobs_fences_artifacts_results_candidate_audit(api,settings,admin_user,tmp_path):
    o,r,c,_,j,a,lease=calculated(api,settings,admin_user);f=candidate(api,j)
    before=verify(settings);destination=tmp_path/'backup';manifest=backup(settings,destination)
    name='mf_staging_restore_stage06_'+uuid4().hex[:10];info=conninfo_to_dict(settings.database_url)
    with connect(settings,autocommit=True) as db: db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=tmp_path/'restored'/'storage')
    restored=restore(target,destination);assert verify(target)==before
    out={'restore':restored,'dump_sha256':manifest['database_sha256'],'jobs_runs_results_fences_audit_and_files_match':True,
         'final_candidate_count':before['tables']['mf_final_calculation_candidates']['count'],'native_BAZIS':'NOT VERIFIED; signed synthetic contract fixtures only','state':before}
    root=Path(os.environ.get('MF_TEST_EVIDENCE_DIR',tmp_path));root.mkdir(exist_ok=True,parents=True)
    (root/'stage06-restore-evidence.json').write_text(json.dumps(out,indent=2))


def test_final_current_selection_rejects_historical_candidate_same_revision(api,settings,admin_user):
    o,r,c,_,j,a,lease=calculated(api,settings,admin_user);first=candidate(api,j)
    post(api,'/production-final-calculations/review',{'candidate_id':first['candidate_id'],'revision_id':r['revision_id'],'reason':'First exact review'})
    second_job=job(api,o,r,c);second_lease=a.pull()[0];assert a.event(second_lease)[0].status_code==200
    assert a.result(second_lease,native_body(settings,second_lease))[0].status_code==200
    second=candidate(api,second_job)
    post(api,'/production-final-calculations/review',{'candidate_id':second['candidate_id'],'revision_id':r['revision_id'],'reason':'Replace selection with exact second run'})
    old=api.post('/api/v2/orders/'+o['order_id']+'/approve',json={'candidate_id':first['candidate_id'],'revision_id':r['revision_id'],'reason':'Historical approval must not apply'})
    assert old.status_code==409 and old.json()['detail']['code']=='EXACT_REVIEW_REQUIRED'
    approve(api,o,r,second)
    assert job(api,o,r,c,'produce',first['candidate_id'],status=409)['detail']['code']=='APPROVED_FINAL_REQUIRED'
    assert job(api,o,r,c,'produce',second['candidate_id'])['purpose']=='produce'
