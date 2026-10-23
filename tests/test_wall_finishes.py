from pathlib import Path
import hashlib,json,sys
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import Scene

@pytest.mark.parametrize('kind,thickness',[('skinali',6),('ldsp',16),('ldsp',18),('tile',8),('tile',10),('tile',12)])
def test_save_roundtrip_and_backward_compatibility(kind,thickness):
    saved=Scene(wallPanels=[dict(id='p',kind=kind,thickness=thickness,shape='u')],wallLights=[dict(id='l',brightness=0,enabled=False)]).model_dump(mode='json')
    assert Scene(**saved).model_dump(mode='json')==saved
    assert saved['wallLights'][0]['brightness']==0
    assert Scene().wallPanels==[] and Scene().wallLights==[]

@pytest.mark.parametrize('patch',[dict(thickness=18),dict(width=6000),dict(offset=-1),dict(height=2001),dict(color='url(x)'),dict(tile_width=0),dict(shape='other'),dict(wall='e'),dict(elevation=2600),dict(kind='ldsp',thickness=10),dict(kind='tile',thickness=6),dict(grout=0)])
def test_reject_invalid_panel(patch):
    with pytest.raises(ValidationError):Scene(wallPanels=[dict(id='p',**patch)])

@pytest.mark.parametrize('patch',[dict(width=6000),dict(elevation=2699),dict(brightness=-1),dict(brightness=float('nan')),dict(temperature=6500),dict(mount='milled')])
def test_light_is_bounded_and_wall_only(patch):
    with pytest.raises(ValidationError):Scene(wallLights=[dict(id='l',**patch)])

def test_duplicates_and_render_budgets():
    for field,count in [('wallPanels',17),('wallLights',5)]:
        with pytest.raises(ValidationError):Scene(**{field:[dict(id=str(i)) for i in range(count)]})
        with pytest.raises(ValidationError):Scene(**{field:[dict(id='same')]*2})

def test_original_source_bytes_and_measured_native_geometry():
    root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'scripts'))
    from fr3d_reader import load,child,frame,walk,vals,panelinfo
    p=root/'backend/v2/cabinet_assets/planner'
    sources=json.loads((p/'wall-panel-sources.json').read_text())
    for s in sources:
        f=p/'wall-panel-sources'/s['source_file'];assert hashlib.sha256(f.read_bytes()).hexdigest()==s['source_sha256']
        model=child(load(f),'Model');assert frame(model)["size"]==s['default_size_mm']
        panels=[panelinfo(n,m,path) for n,m,path in walk(model) if vals(n).get('Type')==4002]
        assert len(panels)=={'straight':1,'left':2,'right':2,'u':3}[s['shape']]
        assert all(abs(x['thickness']-6)<.01 for x in panels)

def test_new_assets_and_sources_are_fixed_allowlisted():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI();app.include_router(router());client=TestClient(app)
    for p in ['wall-finishes.mjs','wall-finish-mesh.mjs','wall-finish-ui.mjs','wall-finishes.css','wall-panel-sources.json','wall-panel-sources/Скиналь.Прямая.fr3d']:
        assert client.get('/account/planner/'+p).status_code==200
    assert client.get('/account/planner/wall-panel-sources/private.fr3d').status_code==404
