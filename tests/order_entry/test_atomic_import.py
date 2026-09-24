"""One confirm request applies the displayed preview atomically and idempotently."""
from copy import deepcopy
from uuid import uuid4
from backend.v2.db import transaction
from tests.stage03.test_api import settings,api,admin_user,publish,post,setup_import,login,PASSWORD
from tests.stage04.test_api import item,revision,request_detail


def prepared(api):
    _,release=publish(api);o,_,p=setup_import(api,qty=2)
    material=item(api,release)
    edge=next(e for e in api.get('/api/v2/catalogue/edges',params={'release':release,'q':'E-22'}).json()['items'] if e['article']=='E-22')
    row=p['rows'][1]
    choice={'variant_id':material['variant_id'],'edges':{'L1':{'edge_id':edge['edge_id'],'selection_mode':'auto'},'L2':{'edge_id':None,'selection_mode':'manual'}}}
    return o,p,row,material,edge,{'mode':'add','choices':{row['row_id']:choice}}


def test_atomic_material_edges_none_audit_retry_and_reload(api,settings,admin_user):
    o,p,row,m,e,body=prepared(api)
    path='/imports/'+p['import_id']+'/confirm'
    first=post(api,path,body,1);assert post(api,path,body,1)==first
    saved=api.get('/api/v2/orders/'+o['order_id']+'/draft/rows').json()['rows']
    assert len(saved)==1
    s=saved[0]['snapshot'];assert s['resolution']['selected']['variant_id']==m['variant_id']
    assert s['edges']['L1']['edge_id']==e['edge_id'] and s['edges']['L1']['selection_mode']=='auto'
    assert s['edges']['L1']['confirmed'] and s['edges']['L2']['edge_id'] is None and s['edges']['L2']['confirmed']
    assert post(api,'/imports/'+p['import_id']+'/replay',{})['matches_original']
    with transaction(settings) as c:
        actions=[r['action'] for r in c.execute('SELECT action FROM mf_audit WHERE object_id=%s',(row['row_id'],))]
        assert actions.count('import.identity.confirmed')==1 and actions.count('import.edges.confirmed')==1
    changed=deepcopy(body);changed['choices'][row['row_id']]['edges']['L1']['edge_id']=None
    assert api.post('/api/v2'+path,json=changed,headers={'If-Match':'2'}).status_code==409


def test_bad_edge_rolls_back_material_resolution_and_receipt(api,settings,admin_user):
    o,p,row,m,e,body=prepared(api);body['choices'][row['row_id']]['edges']['L1']['edge_id']=str(uuid4())
    before=api.get('/api/v2/imports/'+p['import_id']).json()['rows']
    response=api.post('/api/v2/imports/'+p['import_id']+'/confirm',json=body,headers={'If-Match':'1'})
    assert response.status_code in (404,422)
    assert api.get('/api/v2/imports/'+p['import_id']).json()['rows']==before
    assert api.get('/api/v2/orders/'+o['order_id']+'/draft/rows').json()['rows']==[]
    assert api.get('/api/v2/orders/'+o['order_id']).json()['optimistic_lock_version']==1
    with transaction(settings) as c:
        assert not c.execute('SELECT 1 FROM mf_import_receipts WHERE import_id=%s',(p['import_id'],)).fetchone()


def test_foreign_preview_row_and_client_cannot_change_another_import(api,settings,admin_user):
    o,p,row,m,e,body=prepared(api);_,_,other=setup_import(api,qty=1)
    body['choices'][other['rows'][1]['row_id']]=body['choices'].pop(row['row_id'])
    assert api.post('/api/v2/imports/'+p['import_id']+'/confirm',json=body,headers={'If-Match':'1'}).status_code==422
    assert api.get('/api/v2/orders/'+o['order_id']+'/draft/rows').json()['rows']==[]
    post(api,'/auth/register',{'email':uuid4().hex+'@example.invalid','password':PASSWORD},status=201)
    assert api.post('/api/v2/imports/'+p['import_id']+'/confirm',json=body,headers={'If-Match':'1'}).status_code==403


def test_revision_preserves_auto_and_manual_selection_modes(api,settings,admin_user):
    from tests.stage04.test_api import order
    _,release=publish(api);o=order(api);m=item(api,release)
    d=request_detail(m)
    d['edges']={'L1':{'selection_mode':'auto'},'L2':{'selection_mode':'manual'}}
    rev=revision(api,o,release,[d])
    result=api.get('/api/v2/orders/'+o['order_id']+'/revisions/'+rev['revision_id']).json()
    assert result['details'][0]['edges']['L1']['selection_mode']=='auto'
    assert result['details'][0]['edges']['L2']['selection_mode']=='manual'
