"""Stage 8 cross-layer software evidence. Synthetic signed result != native BAZIS."""
import json
import os
from pathlib import Path
from backend.v2.db import connect
from backend.v2.calculation_math import hash_value
from backend.v2.files import read_verified
from backend.v2.storage import VolumeStore, sha256
from backend.v2.stage08_scenarios import import_zero, corrected_revision, submit as source_submit
from tests.stage03.test_api import settings, api, admin_user, post, publish
from tests.stage04.test_api import order, item, configure, calc
from tests.stage05.test_api import document
from tests.stage06.support import job, Agent, fake_result, cancel_open
from tests.stage06.test_native_contract import calculated, candidate, approve


def evidence(name, data):
    root=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/stage08'));root.mkdir(parents=True,exist_ok=True)
    (root/(name+'.json')).write_text(json.dumps(data,indent=2,default=str))
    print('MF_STAGE08_EVIDENCE='+json.dumps({'scenario':name,**data},default=str),flush=True)


def test_self_excel_correction_pdf_submit_package_fake_final_closed(api,settings,admin_user,monkeypatch):
    monkeypatch.setenv('MF_STAGING_AGENT_API','enabled')
    _,release=publish(api);o=order(api);material=item(api,release);ctx,_=configure(api,o,release,material)
    source,row,applied=import_zero(api,o,material['article'])
    r=corrected_revision(api,o,release,material,row,applied['optimistic_lock_version'])
    c=calc(api,o,r);assert c['completeness']=='complete'
    d=document(api,c);pdf=api.get('/api/v2/documents/'+d['file_id']);assert pdf.content.startswith(b'%PDF-')
    sent=source_submit(api,o,r,c,r['optimistic_lock_version']);assert sent['production_ready'] is False
    post(api,'/orders/'+o['order_id']+'/review',{'reason':'SYNTHETIC exact source review'},sent['optimistic_lock_version'])
    j=job(api,o,r,c);a=Agent(api,settings,admin_user);lease=a.pull()[0]
    assert lease['order_id']==o['order_id'] and lease['revision_id']==r['revision_id']
    assert a.event(lease)[0].status_code==200
    result,_=a.result(lease);assert result.status_code==200 and not result.json()['verified']
    final=api.post('/api/v2/production-jobs/'+j['job_id']+'/final-calculation',json={'reason':'Fake result must remain closed'})
    assert final.status_code==409 and final.json()['detail']['code']=='BAZIS_RUN_REQUIRED'
    with connect(settings) as db:
        rev=db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(r['revision_id'],)).fetchone()['content']
        assert rev['source_evidence']['draft_rows'][0]['snapshot']['values']['qty']==0
        assert rev['details'][0]['qty']==3 and rev['details'][0]['resolution_reason']
        package=db.execute('SELECT manifest FROM mf_job_packages WHERE job_id=%s',(j['job_id'],)).fetchone()['manifest']
        assert package['manufacturing']['parts'][0]['blank']['qty']==6
        source_file=db.execute('SELECT file_id FROM mf_import_batches WHERE import_id=%s',(source['import_id'],)).fetchone()['file_id']
        assert read_verified(db,VolumeStore(settings.storage_root),source_file).startswith(b'PK')
        events=db.execute('SELECT event_id FROM mf_audit WHERE object_id=%s',(o['order_id'],)).fetchall()
        assert events and all(db.execute('SELECT 1 FROM mf_outbox WHERE event_id=%s',(e['event_id'],)).fetchone() for e in events)
    evidence('self-chain',{'order_id':o['order_id'],'revision_id':r['revision_id'],'calculation_id':c['calculation_id'],
             'document':d['file_id'],'pdf_sha256':sha256(pdf.content),'job_id':j['job_id'],'run_id':lease['run_id'],
             'source_qty':0,'corrected_qty':3,'child_qty':6,'final_gate':'BAZIS_RUN_REQUIRED','native':'NOT VERIFIED'})
    cancel_open(settings)


def test_manager_assisted_raw_intake_child_revision_no_early_job(api,settings,admin_user):
    _,release=publish(api);o=order(api,'manager_assisted');m=item(api,release);configure(api,o,release,m)
    source,row,applied=import_zero(api,o,'UNKNOWN')
    sent=source_submit(api,o,version=applied['optimistic_lock_version'])
    with connect(settings) as db:
        old=db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(sent['revision_id'],)).fetchone()['content']
        assert old['source_evidence']['draft_rows'][0]['snapshot']['values']['qty']==0
    child=corrected_revision(api,o,release,m,row,sent['optimistic_lock_version'],sent['revision_id'])
    c=calc(api,o,child);assert c['completeness']=='complete'
    with connect(settings) as db:
        assert db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(sent['revision_id'],)).fetchone()['content']==old
        current=db.execute('SELECT * FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()
        assert current['approved_revision_id'] is None and current['approved_final_candidate_id'] is None
        assert not db.execute('SELECT 1 FROM mf_production_jobs WHERE order_id=%s',(o['order_id'],)).fetchone()
    evidence('manager-chain',{'order_id':o['order_id'],'original_revision':sent['revision_id'],'child_revision':child['revision_id'],
             'calculation_id':c['calculation_id'],'original_sha256':hash_value(old),'original_unchanged':True,'early_jobs':0})


def test_approved_snapshot_pdf_survives_release_and_commercial_updates(api,settings,admin_user,monkeypatch):
    monkeypatch.setenv('MF_STAGING_AGENT_API','enabled')
    o,r,c,_,j,a,lease=calculated(api,settings,admin_user);f=candidate(api,j);approve(api,o,r,f)
    d=document(api,c);pdf_before=api.get('/api/v2/documents/'+d['file_id']).content
    with connect(settings) as db:
        before={table:db.execute('SELECT to_jsonb(t) data FROM '+table+' t WHERE '+key+'=%s',(ident,)).fetchone()['data']
                for table,key,ident in [('mf_orders','order_id',o['order_id']),('mf_order_revisions','revision_id',r['revision_id']),
                ('mf_calculations','calculation_id',c['calculation_id']),('mf_final_calculation_candidates','candidate_id',f['candidate_id'])]}
    _,release=publish(api)
    other=order(api);ctx,meta=configure(api,other,release,item(api,release),discounts={'materials':'50','edge_material':'25','services':'10'})
    tariff=api.get('/api/v2/financial/versions/tariff/'+ctx['tariff_book_id']).json()
    post(api,'/financial/tariff-books',{**meta,'supersedes':ctx['tariff_book_id'],'effective_from':'2026-09-23T00:00:00Z',
         'entries':[{'operation':e['operation'],'amount':'99.99','currency':'BYN'} for e in tariff['entries']]},status=201)
    with connect(settings) as db:
        for table,key,ident in [('mf_orders','order_id',o['order_id']),('mf_order_revisions','revision_id',r['revision_id']),
                               ('mf_calculations','calculation_id',c['calculation_id']),('mf_final_calculation_candidates','candidate_id',f['candidate_id'])]:
            assert db.execute('SELECT to_jsonb(t) data FROM '+table+' t WHERE '+key+'=%s',(ident,)).fetchone()['data']==before[table]
    assert api.get('/api/v2/documents/'+d['file_id']).content==pdf_before
    evidence('approved-snapshot',{'scope':'SOFTWARE CONTRACT PASS / SYNTHETIC','order_id':o['order_id'],
             'candidate_id':f['candidate_id'],'unchanged_hashes':{k:hash_value(v) for k,v in before.items()},'pdf_sha256':sha256(pdf_before),
             'native':'NOT VERIFIED'})
    cancel_open(settings)
