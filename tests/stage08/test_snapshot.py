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


from .test_e2e import evidence


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
