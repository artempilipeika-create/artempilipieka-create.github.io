import pytest
from pydantic import ValidationError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.three_d_room import Room
from backend.v2.cabinet_ui import router

@pytest.mark.parametrize('kind',['window','radiator','gas_cooker','gas_boiler','water_heater'])
@pytest.mark.parametrize('wall',list('abcd'))
def test_equipment_persists_all_measured_fields(kind,wall):
    f=dict(id='equipment',kind=kind,wall=wall,offset=300,elevation=0 if kind=='gas_cooker' else 900,width=600,height=700,projection=300,label='По замеру',notes='Расположение')
    room=Room(width=3000,depth=2800,height=2700,setup_complete=True,features=[f])
    restored=Room.model_validate_json(room.model_dump_json()).features[0]
    assert {key:getattr(restored,key) for key in f}==f

@pytest.mark.parametrize('changes',[dict(elevation=1),dict(projection=0),dict(width=3001),dict(height=2701),dict(wall='e')])
def test_equipment_rejects_invalid_measurements(changes):
    f=dict(id='cooker',kind='gas_cooker',wall='a',offset=0,elevation=0,width=600,height=850,projection=600)|changes
    with pytest.raises(ValidationError):Room(width=3000,depth=2800,height=2700,features=[f])

def test_equipment_modules_are_on_fixed_routes():
    app=FastAPI();app.include_router(router());client=TestClient(app)
    for name in ['room-equipment.mjs','room-equipment-mesh.mjs']:
        response=client.get('/account/planner/'+name)
        assert response.status_code==200
        assert response.headers['content-type'].startswith('application/javascript')
        assert "default-src 'none'" in response.headers['content-security-policy']
