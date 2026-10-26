"""Real isolated Postgres; no orders, notifications or external requests."""
from uuid import uuid4
from tests.stage03.test_api import settings,api,admin_user,login,PASSWORD
from backend.v2.db import transaction
from backend.v2.security import password_hash,grant

def payload(name='Первоначальный'):
    return {'name':name,'request_id':str(uuid4()),'scene':{'module_type':'chest','width':1200,'height':900,'depth':450,'layout':'combo','drawers':3,'base':'plinth','handles':'handles'}}

def test_idempotent_save_conflict_and_minimal_receipts(api,settings,admin_user):
    body=payload();created=api.post('/api/v2/3d-projects',json=body);assert created.status_code==201,created.text
    p=created.json();url='/api/v2/3d-projects/'+p['project_id']
    assert api.post('/api/v2/3d-projects',json=body).json()==p
    assert api.post('/api/v2/3d-projects',json={**body,'name':'Different'}).status_code==409
    update={**payload('После правок'),'version':1};saved=api.patch(url,json=update);assert saved.status_code==200,saved.text
    assert api.patch(url,json=update).json()==saved.json()
    assert api.patch(url,json={**payload('Stale'),'version':1}).status_code==409
    # A lost creation reply replays its original revision, never adopts a newer
    # revision and thereby accidentally permits overwriting another tab.
    assert api.post('/api/v2/3d-projects',json=body).json()['version']==1
    assert api.get(url).json()['version']==2
    with transaction(settings) as c:
        receipts=c.execute('SELECT result FROM mf_3d_project_requests WHERE owner_user_id=%s',(admin_user['user_id'],)).fetchall()
        assert len(receipts)==2 and all('scene' not in r['result'] for r in receipts)

def test_checkpoint_restore_is_atomic_idempotent_and_owner_scoped(api,settings,admin_user):
    p=api.post('/api/v2/3d-projects',json=payload()).json();url='/api/v2/3d-projects/'+p['project_id']
    body={'label':'Первоначальный','version':1,'request_id':str(uuid4())}
    v=api.post(url+'/versions',json=body);assert v.status_code==201,v.text
    assert api.post(url+'/versions',json=body).json()==v.json()
    assert api.post(url+'/versions',json={**body,'request_id':str(uuid4()),'label':'  '}).status_code==422
    update=api.patch(url,json={**payload('После правок клиента'),'version':1});assert update.status_code==200
    route=url+'/versions/'+v.json()['version_id']+'/restore'
    assert api.post(route,json={'version':1,'request_id':str(uuid4())}).status_code==409
    restore={'version':2,'request_id':str(uuid4())};result=api.post(route,json=restore);assert result.status_code==200,result.text
    assert result.json()['name']=='Первоначальный' and result.json()['version']==3
    assert api.post(route,json=restore).json()==result.json()
    versions=api.get(url+'/versions').json()['items'];assert len(versions)==2
    backup=next(v for v in versions if v['kind']=='before_restore');assert backup['name']=='После правок клиента'
    reverted=api.post(url+'/versions/'+backup['version_id']+'/restore',json={'version':3,'request_id':str(uuid4())})
    assert reverted.json()['name']=='После правок клиента'
    other=uuid4();email=other.hex+'@example.invalid'
    with transaction(settings) as c:
        c.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES(%s,%s,%s,now())',(other,email,password_hash(PASSWORD)))
        c.execute("INSERT INTO mf_user_roles VALUES(%s,'client')",(other,))
        grant(c,user_id=other,permission='orders.draft.write',scope='own',actor=admin_user['user_id'])
    login(api,email)
    assert api.get(url+'/versions').status_code==404
    assert api.post(url+'/versions',json=body).status_code==404
    assert api.post(route,json=restore).status_code==404

def test_foreign_checkpoint_and_archived_project_cannot_be_restored(api,admin_user):
    p=api.post('/api/v2/3d-projects',json=payload()).json();q=api.post('/api/v2/3d-projects',json=payload('Other')).json()
    url='/api/v2/3d-projects/'+p['project_id'];other='/api/v2/3d-projects/'+q['project_id']
    v=api.post(url+'/versions',json={'label':'A','version':1,'request_id':str(uuid4())}).json()
    assert api.post(other+'/versions/'+v['version_id']+'/restore',json={'version':1,'request_id':str(uuid4())}).status_code==404
    assert api.delete(url).status_code==204
    assert api.get(url+'/versions').status_code==404
    assert api.post(url+'/versions/'+v['version_id']+'/restore',json={'version':1,'request_id':str(uuid4())}).status_code==404


from tests.test_catalogue_contract import catalogue_contract

def test_all_catalogue_sources_survive_database_save_reopen_and_resize(api, admin_user, catalogue_contract):
    accepted = catalogue_contract['accepted']
    for item in catalogue_contract['defaults']:
        body = {'name':'QA catalogue '+item['bazis_id'], 'request_id':str(uuid4()),
                'scene':{'schema_version':2,'room':{'width':12000,'depth':12000,'height':5000},'items':[item]}}
        created = api.post('/api/v2/3d-projects', json=body)
        assert created.status_code == 201, (item['bazis_id'], created.text)
        project = created.json()
        url = '/api/v2/3d-projects/'+project['project_id']
        opened = api.get(url)
        assert opened.status_code == 200, opened.text
        persisted = opened.json()['scene']['items'][0]
        for key in ('bazis_id','bazis_file','bazis_sha256','body_variant_id','front_variant_id'):
            assert persisted.get(key) == item.get(key), (item['bazis_id'], key)
        # Exercise an old saved generic template with the largest accepted width.
        candidates = [r for r in accepted if r['id']==item['bazis_id'] and r['mode']=='legacy' and r['axis']=='width']
        changed = max(candidates, key=lambda r:r['value'])['item']
        updated = api.patch(url, json={**body,'request_id':str(uuid4()),'version':project['version'],
                                      'scene':{**body['scene'],'items':[changed]}})
        assert updated.status_code == 200, (item['bazis_id'], updated.text)
        saved = api.get(url).json()['scene']['items'][0]
        for key in ('bazis_id','bazis_file','bazis_sha256','width'):
            assert saved.get(key) == changed.get(key), (item['bazis_id'], key)
