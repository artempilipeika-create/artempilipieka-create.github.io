import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import Scene

def scene(fixture=None,**patch):
    item=dict(item_id='a',name='Шкаф',module_type='base_cabinet',width=600,height=820,depth=510,body_height=720,base_height=100,base='legs',worktop_fixture=fixture,**patch)
    return dict(items=[item])

@pytest.mark.parametrize('kind', ['sink','hob'])
def test_visual_fixture_survives_json_roundtrip_without_migration(kind):
    f=dict(kind=kind,width=500,depth=480,offset_x=20,front_offset=65,finish='black',faucet='angled',faucet_finish='chrome')
    saved=Scene(**scene(f)).model_dump(mode='json')
    assert saved['items'][0]['worktop_fixture']==f
    assert Scene(**saved).model_dump(mode='json')==saved
    assert Scene(**scene()).items[0].worktop_fixture is None

@pytest.mark.parametrize('patch', [dict(width=601),dict(offset_x=100),dict(front_offset=5),dict(front_offset=121),dict(width=True),dict(depth=480.5),dict(faucet='unknown'),dict(finish='unknown'),dict(kind='unknown')])
def test_reject_invalid_fixture(patch):
    f=dict(kind='sink',width=500,depth=480,front_offset=60,**{})
    f.update(patch)
    with pytest.raises(ValidationError):Scene(**scene(f))

def test_disabled_worktop_is_rejected():
    with pytest.raises(ValidationError):Scene(**scene(dict(kind='hob',width=580,depth=510),countertopEnabled=False))

def test_new_assets_are_fixed_allowlisted():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI();app.include_router(router());client=TestClient(app)
    for path in ['worktop-fixtures.mjs','worktop-fixture-mesh.mjs','worktop-fixture-ui.mjs','worktop-fixtures.css']:
        r=client.get('/account/planner/'+path);assert r.status_code==200
        assert r.headers['content-type'].startswith('text/css' if path.endswith('.css') else 'application/javascript')
    assert client.get('/account/planner/worktop-fixtures-secret.json').status_code==404
