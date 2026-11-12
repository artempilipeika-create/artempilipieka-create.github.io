import json
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import Scene, FurnitureItem
from tests.test_blanks import board
from tests.stage03.test_api import settings, api, admin_user

ROOT = Path(__file__).resolve().parents[1]

def recipe_scene(recipe):
    script = """import {buildCarcass,placeCarcass} from './backend/v2/cabinet_assets/planner/carcass-model.mjs';
    const b=buildCarcass({recipe:process.argv[1]});
    console.log(JSON.stringify({items:placeCarcass(b,{x:0,z:0,elevation_mm:0,rotation:90})}));"""
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, recipe], cwd=ROOT))

@pytest.mark.parametrize('recipe', ['shelves', 'divided', 'wall', 'base', 'sink', 'cap'])
def test_real_generated_corps_preserve_geometry_edges_and_bindings(recipe):
    data = recipe_scene(recipe)
    saved = Scene.model_validate(data).model_dump(mode='json')
    reopened = Scene.model_validate(saved)
    assert len(reopened.items) == len(data['items'])
    for before, after in zip(data['items'], reopened.items):
        assert after.blank_edge_code == before['blank_edge_code']
        assert after.blank_width_mm == before['blank_width_mm']
        assert after.blank_thickness_mm == before['blank_thickness_mm']
        if before.get('blank_binding'):
            assert after.blank_binding.model_dump() == before['blank_binding']

@pytest.mark.parametrize('thickness', [3, 4])
def test_thin_back_requires_vertical_orientation_and_no_pvc(thickness):
    back=board(width=598,height=2198,depth=thickness,body_height=2198,blank_axis='back',
               blank_length_mm=598,blank_width_mm=2198,blank_thickness_mm=thickness,blank_edge_code='0000')
    assert FurnitureItem.model_validate(back).height == 2198
    for patch in [dict(blank_edge_code='1000'), dict(blank_axis='horizontal'), dict(blank_thickness_mm=5,depth=5)]:
        with pytest.raises(ValidationError): FurnitureItem.model_validate({**back,**patch})

def test_horizontal_rails_do_not_enable_oversized_sheet_depth():
    rail=board(blank_length_mm=564,width=564,blank_width_mm=80,depth=80)
    assert FurnitureItem.model_validate(rail).depth == 80
    with pytest.raises(ValidationError):
        FurnitureItem.model_validate(board(blank_width_mm=2000,depth=2000))

def test_carcass_assets_are_served():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI();app.include_router(router())
    with TestClient(app) as client:
        for name in ('carcass-model.mjs','carcass-ui.mjs'):
            response=client.get('/account/planner/'+name)
            assert response.status_code==200
            assert response.headers['content-type'].startswith('application/javascript')

@pytest.mark.parametrize('recipe', ['shelves','divided','wall','base','sink','cap'])
def test_corpus_database_save_reopen_edge_edit(api, admin_user, recipe):
    data=recipe_scene(recipe)
    created=api.post('/api/v2/3d-projects',json={'name':'QA корпус '+recipe,'scene':data})
    assert created.status_code==201,created.text
    url='/api/v2/3d-projects/'+created.json()['project_id']
    reopened=api.get(url).json()
    assert len(reopened['scene']['items'])==len(data['items'])
    reopened['scene']['items'][0]['blank_edge_code']='1011'
    edited=api.patch(url,json={'name':reopened['name'],'scene':reopened['scene'],'version':reopened['version']})
    assert edited.status_code==200,edited.text
    final=api.get(url).json()['scene']['items']
    assert final[0]['blank_edge_code']=='1011'
    for before,after in zip(data['items'],final):
        assert after['blank_binding']==before.get('blank_binding')


def test_default_hdf_is_exact_original_catalogue_identity():
    from backend.v2.catalogue_model import fingerprint, stable
    raw=(ROOT/'data.js').read_text()
    catalogue=json.loads(raw[raw.index('{'):].strip().rstrip(';'))
    original=next(m for m in catalogue['materials'] if m['id']=='M1:2141')
    assert original['name']=='ЛХДФ 3ММ Белый, 2800х2070 мм'
    assert original['thickness']==3
    identity=dict(kind='material',article=None,manufacturer=None,decor=None,structure=None,
                  thickness='3',length='2800',width='2070',articleless_name=original['name'])
    expected=stable('master.u2','variant',fingerprint(identity))
    script="import {CARCASS_BACK_MATERIAL_ID} from './backend/v2/cabinet_assets/planner/carcass-model.mjs'; console.log(CARCASS_BACK_MATERIAL_ID)"
    actual=subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT,text=True).strip()
    assert actual==expected
