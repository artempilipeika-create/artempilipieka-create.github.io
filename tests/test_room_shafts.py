import pytest
from pydantic import ValidationError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.three_d_room import Room
from backend.v2.cabinet_ui import router

def shaft(**changes):
    return dict(id='shaft',kind='shaft',wall='a',offset=0,elevation=0,width=600,height=2700,projection=350,label='Вентшахта',notes='')|changes

@pytest.mark.parametrize('wall',list('abcd'))
def test_shaft_schema_roundtrip(wall):
    feature=shaft(wall=wall)
    room=Room(width=3000,depth=2800,height=2700,setup_complete=True,features=[feature])
    restored=Room.model_validate_json(room.model_dump_json()).features[0]
    assert {key:getattr(restored,key) for key in feature}==feature

@pytest.mark.parametrize('changes',[{'projection':0},{'elevation':10,'height':2600},{'width':3100},{'height':2800},{'projection':2900}])
def test_shaft_schema_rejects_invalid_envelope(changes):
    with pytest.raises(ValidationError):Room(width=3000,depth=2800,height=2700,features=[shaft(**changes)])

def test_shaft_editor_uses_fixed_asset_route():
    app=FastAPI();app.include_router(router())
    response=TestClient(app).get('/account/planner/shaft-editor.mjs')
    assert response.status_code==200
    assert response.headers['content-type'].startswith('application/javascript')
    assert "default-src 'none'" in response.headers['content-security-policy']
