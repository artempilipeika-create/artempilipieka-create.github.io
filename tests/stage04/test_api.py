"""Native Postgres + HTTP order, finance, isolation and restore acceptance."""
from copy import deepcopy
from dataclasses import replace
from uuid import uuid4
from pathlib import Path
import hashlib,json,os
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from backend.v2.db import connect,transaction
from backend.v2.backup import backup,restore
from backend.v2.calculation_math import canonical,hash_value
from backend.v2.files import read_verified
from backend.v2.storage import VolumeStore
from tests.stage03.test_api import settings,api,admin_user,post,publish,setup_import,login,PASSWORD


def order(api,mode='self_prepared'):
    return post(api,'/orders',{'business_name':'SYNTHETIC Stage 4 acceptance','preparation_mode':mode},status=201)

def item(api,release,q='621 PO'):
    return next(i for i in api.get('/api/v2/catalogue/materials',params={'q':q,'release':release}).json()['items'] if i['article']==q)

def request_detail(material,**extra):
    return {'detail_id':'d1','length':'600','width':'400','qty':1,'variant_id':material['variant_id'],
        'rotation':False,'grain':'none','route':'solid','packaging':True,'edges':{},**extra}

def revision(api,o,release,details,version=1,parent=None):
    return post(api,'/orders/'+o['order_id']+'/revisions',{'reason':'Explicit test revision','catalogue_release_id':release,
        'parent_revision_id':parent,'details':details},version,status=201)

def calc(api,o,r):
    return post(api,'/orders/'+o['order_id']+'/calculations',{'revision_id':r['revision_id']},status=201)

def configure(api,o,release,material,edge=None,discounts=None):
    meta={'source':'EXPLICIT SYNTHETIC ACCEPTANCE ONLY','source_date':'2026-09-23','reason':'Approved synthetic fixture, no global activation','synthetic':True}
    defaults=api.get('/api/v2/financial/defaults').json()
    production=api.get('/api/v2/financial/versions/production/'+defaults['production_profile_id']).json()
    policies={'edge_consumption':{'basis':'net'},'cutting_18':{'basis':'estimated_plan_excluding_trim','families':['board','customer'],'include_glue_blanks':True},
              'glue_area':'finished_area','edge_classification':None}
    profile=post(api,'/financial/production-profiles',{**meta,'settings':production['settings'],'policies':policies},status=201)
    discount=post(api,'/financial/discount-profiles',{**meta,**(discounts or {'materials':'0','edge_material':'0','services':'0'})},status=201)
    entries=[{'item_id':material['variant_id'],'kind':'material','amount':'100','unit':'sheet'}]
    if edge: entries.append({'item_id':edge['edge_id'],'kind':'edge','amount':'4','unit':'m'})
    price=post(api,'/financial/price-books',{**meta,'release_id':release,'currency':'BYN','tax_convention':'Synthetic fixture only, no real VAT policy',
        'effective_from':'2026-09-23T00:00:00Z','entries':entries},status=201)
    context={'production_profile_id':profile['id'],'tariff_book_id':defaults['tariff_book_id'],'price_book_id':price['id'],'discount_profile_id':discount['id'],'reason':'Explicit isolated synthetic order fixture'}
    post(api,'/orders/'+o['order_id']+'/financial-context',context,1,status=201)
    return context,meta

def submit(api,o,r,c=None,key=None,version=None,**extra):
    body={'revision_id':r['revision_id'],**extra}
    if c: body['preliminary_calculation_id']=c['calculation_id']
    return api.post('/api/v2/orders/'+o['order_id']+'/submit',json=body,
        headers={'Idempotency-Key':key or uuid4().hex,'If-Match':str(version or r['optimistic_lock_version'])})

def test_ord01_ord02_submit_repeat_changed_body_and_stale(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release);configure(api,o,release,m)
    r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r);assert c['completeness']=='complete'
    key=uuid4().hex;a=submit(api,o,r,c,key=key);assert a.status_code==200,a.text
    b=submit(api,o,r,c,key=key);assert b.json()==a.json()
    assert submit(api,o,r,c,key=key,comment='Different body').status_code==409
    with connect(settings) as db:
        assert db.execute('SELECT count(*) n FROM mf_submission_receipts WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==1
        assert db.execute('SELECT count(*) n FROM mf_production_jobs WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0
        receipt=db.execute('SELECT request_snapshot FROM mf_submission_receipts WHERE order_id=%s',(o['order_id'],)).fetchone()['request_snapshot']
        assert receipt['preliminary_calculation_id']==c['calculation_id']
    other=order(api);rr=revision(api,other,release,[request_detail(m)]);cc=calc(api,other,rr)
    assert submit(api,other,rr,cc,version=1).status_code==412

def test_ord03_ord04_manager_child_immutable_approval_reset(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release);configure(api,o,release,m)
    r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r);submitted=submit(api,o,r,c).json()
    with connect(settings) as db: before=canonical(db.execute('SELECT * FROM mf_order_revisions WHERE revision_id=%s',(r['revision_id'],)).fetchone())
    # Synthetic previous approval pointer only, never a production run/final price.
    with transaction(settings) as db: db.execute('UPDATE mf_orders SET approved_revision_id=%s WHERE order_id=%s',(r['revision_id'],o['order_id']))
    changed=revision(api,o,release,[request_detail(item(api,release,'621 PE'))],submitted['optimistic_lock_version'],r['revision_id'])
    with connect(settings) as db:
        after=canonical(db.execute('SELECT * FROM mf_order_revisions WHERE revision_id=%s',(r['revision_id'],)).fetchone())
        assert before==after
        current=db.execute('SELECT * FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()
        assert current['approved_revision_id'] is None and current['workflow_status']=='review'
        assert str(current['active_revision_id'])==changed['revision_id']
    for statement in ["UPDATE mf_order_revisions SET content='{}' WHERE revision_id=%s",'DELETE FROM mf_order_revisions WHERE revision_id=%s']:
        with pytest.raises(Exception):
            with transaction(settings) as db: db.execute(statement,(r['revision_id'],))

def test_cal10_ord05_old_financial_bytes_survive_all_version_changes(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release);ctx,meta=configure(api,o,release,m)
    r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r);url='/api/v2/calculations/'+c['calculation_id'];before=api.get(url).content
    oldtariff=api.get('/api/v2/financial/versions/tariff/'+ctx['tariff_book_id']).json()
    entries=[{'operation':e['operation'],'amount':'9.99','currency':'BYN'} for e in oldtariff['entries']]
    t=post(api,'/financial/tariff-books',{**meta,'supersedes':ctx['tariff_book_id'],'effective_from':'2026-09-23T00:00:00Z','entries':entries},status=201)
    p=post(api,'/financial/price-books',{**meta,'supersedes':ctx['price_book_id'],'release_id':release,'currency':'BYN','tax_convention':'Synthetic',
      'effective_from':'2026-09-23T00:00:00Z','entries':[{'item_id':m['variant_id'],'kind':'material','amount':'999','unit':'sheet'}]},status=201)
    d=post(api,'/financial/discount-profiles',{**meta,'supersedes':ctx['discount_profile_id'],'materials':'10','edge_material':'20','services':'5'},status=201)
    prof=api.get('/api/v2/financial/versions/production/'+ctx['production_profile_id']).json();prof['settings']['kerf_mm']='5'
    pp=post(api,'/financial/production-profiles',{**meta,'supersedes':ctx['production_profile_id'],'settings':prof['settings'],'policies':prof['policies']},status=201)
    post(api,'/orders/'+o['order_id']+'/financial-context',{**ctx,'tariff_book_id':t['id'],'price_book_id':p['id'],'discount_profile_id':d['id'],'production_profile_id':pp['id']},r['optimistic_lock_version'],status=201)
    publish(api)
    newer=post(api,'/calculations/'+c['calculation_id']+'/recalculate',{'reason':'Explicit newer commercial versions'},status=201)
    assert newer['calculation_id']!=c['calculation_id'] and newer['total']!=c['total']
    assert newer['production_profile_id']==c['production_profile_id'] # revision pins geometry; new revision required to change it
    assert api.get(url).content==before
    with pytest.raises(Exception):
        with transaction(settings) as db: db.execute("UPDATE mf_calculations SET result='{}' WHERE calculation_id=%s",(c['calculation_id'],))
    with pytest.raises(Exception):
        with transaction(settings) as db: db.execute('INSERT INTO mf_calculation_lines SELECT %s,calculation_id,999,category,operation,state,quantity,unit,unit_price,gross,snapshot FROM mf_calculation_lines WHERE calculation_id=%s LIMIT 1',(uuid4(),c['calculation_id']))
    with pytest.raises(Exception):
        with transaction(settings) as db: db.execute("INSERT INTO mf_tariff_entries SELECT %s,book_id,'illegal','{}',1,'BYN','m',NULL FROM mf_tariff_entries WHERE book_id=%s LIMIT 1",(uuid4(),ctx['tariff_book_id']))

def test_ord06_manager_assisted_problematic_raw_persisted_no_autocalc(api,settings,admin_user):
    publish(api);o,t,p=setup_import(api,qty=0,article='UNKNOWN')
    # Explicitly choose the manager-assisted flow before submitting raw evidence.
    q=api.patch('/api/v2/orders/'+o['order_id']+'/draft',json={'business_name':'Synthetic problematic manager request','preparation_mode':'manager_assisted'},headers={'If-Match':'1'})
    assert q.status_code==200
    applied=post(api,'/imports/'+p['import_id']+'/confirm',{'mode':'add'},2)
    response=api.post('/api/v2/orders/'+o['order_id']+'/submit',json={'comment':'Please inspect unresolved source rows and prepare the order'},
        headers={'Idempotency-Key':uuid4().hex,'If-Match':str(applied['optimistic_lock_version'])})
    assert response.status_code==200,response.text
    assert response.json()['calculation_state']=='calculation_not_available'
    with connect(settings) as db:
        revision=db.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(response.json()['revision_id'],)).fetchone()['content']
        assert revision['source_evidence']['draft_rows'][0]['snapshot']['values']['qty']==0
        assert revision['source_evidence']['draft_rows'][0]['snapshot']['errors']
        assert db.execute('SELECT count(*) n FROM mf_calculations WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0
        assert db.execute('SELECT count(*) n FROM mf_production_jobs WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0

def test_ord07_unapproved_master_incomplete_submit_review_and_final_gate(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release)
    r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r)
    assert c['completeness']=='incomplete' and c['total'] is None
    a=submit(api,o,r,c);assert a.status_code==200,a.text
    review=post(api,'/orders/'+o['order_id']+'/review',{'reason':'Review incomplete preliminary'},a.json()['optimistic_lock_version'])
    assert review['workflow_status']=='review'
    gate=api.post('/api/v2/calculations/'+c['calculation_id']+'/fix',json={'reason':'Attempt before verified run'})
    assert gate.status_code==409 and gate.json()['detail']['code']=='BAZIS_RUN_REQUIRED'
    assert api.post('/api/v2/orders/'+o['order_id']+'/approve',json={}).status_code==409
    assert api.get('/api/v2/calculations/'+c['calculation_id']+'/pdf').status_code==404

def test_client_financial_injection_foreign_scope_and_block_revoke(api,settings,admin_user):
    _,release=publish(api);m=item(api,release)
    email=uuid4().hex+'@example.invalid';user=post(api,'/auth/register',{'email':email,'password':PASSWORD},status=201)
    o=order(api);r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r)
    assert submit(api,o,r,c).status_code==403
    for key in ('preliminaryTotal','material_price','edge_price','discounts','tariff'):
        bad=api.post('/api/v2/orders/'+o['order_id']+'/calculations',json={'revision_id':r['revision_id'],key:'0'})
        assert bad.status_code==422
    assert api.post('/api/v2/orders/'+o['order_id']+'/discount-overrides',json={'profile_id':str(uuid4()),'reason':'Client override attempt'}).status_code==403
    assert api.get('/api/v2/financial/defaults').status_code==403
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.get('/api/v2/calculations/'+c['calculation_id']).status_code==403
    assert api.post('/api/v2/calculations/'+c['calculation_id']+'/recalculate',json={'reason':'Foreign attempt'}).status_code==403
    login(api,email)
    with transaction(settings) as db: db.execute("UPDATE mf_users SET account_status='blocked' WHERE user_id=%s",(user['user_id'],))
    assert api.get('/api/v2/calculations/'+c['calculation_id']).status_code==200
    assert api.post('/api/v2/orders/'+o['order_id']+'/calculations',json={'revision_id':r['revision_id']}).status_code==403
    with transaction(settings) as db: db.execute('UPDATE mf_sessions SET revoked_at=now() WHERE user_id=%s',(user['user_id'],))
    assert api.get('/api/v2/calculations/'+c['calculation_id']).status_code==401

def test_manager_assignment_scope_and_discount_override_reason(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release);ctx,meta=configure(api,o,release,m)
    r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r)
    manager_email=uuid4().hex+'@example.invalid'
    manager=post(api,'/admin/staff',{'email':manager_email,'password':PASSWORD,'role':'manager'},status=201)
    with transaction(settings) as db: db.execute('UPDATE mf_users SET email_verified_at=now() WHERE user_id=%s',(manager['user_id'],))
    for permission in ('calculations.read','calculations.create','discounts.override','orders.revision.create'):
        post(api,'/admin/staff/'+manager['user_id']+'/grants',{'permission':permission,'scope_type':'assigned'},status=201)
    post(api,'/orders/'+o['order_id']+'/assign-manager',{'manager_id':manager['user_id'],'reason':'Assign synthetic review'})
    version=api.get('/api/v2/orders/'+o['order_id']).json()['optimistic_lock_version']
    login(api,manager_email)
    assert api.get('/api/v2/calculations/'+c['calculation_id']).status_code==200
    assert api.post('/api/v2/orders/'+o['order_id']+'/discount-overrides',json={'profile_id':ctx['discount_profile_id'],'reason':' '},headers={'If-Match':str(version)}).status_code==422
    post(api,'/orders/'+o['order_id']+'/discount-overrides',{'profile_id':ctx['discount_profile_id'],'reason':'Scoped approved profile override'},version,status=201)
    login(api,admin_user['email']);post(api,'/orders/'+o['order_id']+'/assign-manager',{'manager_id':None,'reason':'Revoke current assignment'})
    login(api,manager_email)
    assert api.get('/api/v2/calculations/'+c['calculation_id']).status_code==403
    assert api.post('/api/v2/orders/'+o['order_id']+'/discount-overrides',json={'profile_id':ctx['discount_profile_id'],'reason':'Former assignment'},headers={'If-Match':str(version)}).status_code==403

def test_atomic_rollback_no_partial_calculation_or_outbox(api,settings,admin_user):
    from backend.v2.calculation_service import create
    _,release=publish(api);o=order(api);m=item(api,release);r=revision(api,o,release,[request_detail(m)])
    with pytest.raises(RuntimeError):
        with transaction(settings) as db:
            made=create(db,settings,admin_user['user_id'],o['order_id'],r['revision_id'])
            raise RuntimeError('Injected rollback')
    with connect(settings) as db:
        for table,key in [('mf_calculations','calculation_id'),('mf_calculation_lines','calculation_id'),('mf_discount_snapshots','calculation_id'),('mf_audit','object_id'),('mf_outbox','aggregate_id')]:
            assert not db.execute(sql.SQL('SELECT 1 FROM {} WHERE {}=%s').format(sql.Identifier(table),sql.Identifier(key)),(made['calculation_id'],)).fetchone()

def test_stage4_real_backup_restore_all_snapshots_and_private_bytes(api,settings,admin_user,tmp_path):
    result,release=publish(api);o=order(api);m=item(api,release);configure(api,o,release,m)
    r=revision(api,o,release,[request_detail(m,route='glued_18_18',qty=3)]);c=calc(api,o,r)
    assert c['total'] is not None
    manifest=backup(settings,tmp_path/'backup');info=conninfo_to_dict(settings.database_url);name='mf_staging_restore_stage04_'+uuid4().hex[:10]
    with connect(settings,autocommit=True) as db: db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    target=replace(settings,database_url=make_conninfo(**{**info,'dbname':name}),database_name=name,storage_root=tmp_path/'separate-restored-bytes')
    restored=restore(target,tmp_path/'backup')
    tables=['mf_order_revisions','mf_calculations','mf_calculation_lines','mf_tariff_books','mf_tariff_entries','mf_discount_snapshots','mf_price_books',
      'mf_sale_price_entries','mf_production_profiles','mf_sheet_estimates','mf_manufacturing_recipes','mf_catalogue_releases','mf_files']
    counts={}
    with connect(settings) as src,connect(target) as dst:
        for table in tables:
            q=sql.SQL('SELECT to_jsonb(t)::text AS row FROM {} t').format(sql.Identifier(table))
            left=sorted(r['row'] for r in src.execute(q));right=sorted(r['row'] for r in dst.execute(q));assert left==right
            counts[table]=len(left)
        restored_calc=dst.execute('SELECT result FROM mf_calculations WHERE calculation_id=%s',(c['calculation_id'],)).fetchone()['result']
        assert restored_calc['manufacturing_recipes'][0]['child_qty']==6
        assert str(dst.execute('SELECT release_id FROM mf_catalogue_active').fetchone()['release_id'])==release
        for f in manifest['files']:
            if f['status']=='ready': assert hashlib.sha256(read_verified(dst,VolumeStore(target.storage_root),f['file_id'])).hexdigest()==f['sha256']
    evidence={'database_sha256':manifest['database_sha256'],'restored_database':name,'private_files':len(manifest['files']),'counts':counts,
      'calculation_fixture':c,'restore':restored,'table_snapshots_match':True,'private_sha_match':True}
    root=Path(os.environ.get('MF_TEST_EVIDENCE_DIR',str(tmp_path)));root.mkdir(parents=True,exist_ok=True)
    (root/'stage04-restore-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))
    print('MF_STAGE04_CI_RESTORE='+json.dumps({k:v for k,v in evidence.items() if k!='calculation_fixture'}))

def test_self_problematic_requires_explicit_handoff_and_changed_draft_rejected(api,settings,admin_user):
    _,release=publish(api);o=order(api);m=item(api,release)
    bad=revision(api,o,release,[request_detail(m,grain='unknown')]);c=calc(api,o,bad)
    blocked=submit(api,o,bad,c)
    assert blocked.status_code==409 and blocked.json()['detail']['code']=='EXPLICIT_PROBLEMATIC_HANDOFF_REQUIRED'
    allowed=submit(api,o,bad,c,handoff_problematic=True)
    assert allowed.status_code==200 and allowed.json()['production_ready'] is False
    o=order(api);r=revision(api,o,release,[request_detail(m)]);c=calc(api,o,r)
    change=api.patch('/api/v2/orders/'+o['order_id']+'/draft',json={'business_name':'Changed after preview','preparation_mode':'self_prepared'},headers={'If-Match':'2'})
    assert change.status_code==200
    rejected=submit(api,o,r,c,version=3)
    assert rejected.status_code==412 and rejected.json()['detail']['code']=='DRAFT_CHANGED_SINCE_REVISION'
