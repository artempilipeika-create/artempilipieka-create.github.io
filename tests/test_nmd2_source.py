"""Reviewed NMD2 source identity; no native BAZIS runtime or database writes."""
import json, subprocess
from pathlib import Path
from backend.v2.three_d_base import BASE_SOURCE_REVISION as R, refresh_base_source
from backend.v2.three_d_api import FurnitureItem, projection
ROOT=Path(__file__).resolve().parents[1]

def test_browser_server_and_measured_source_agree():
 js="import {BASE_SOURCE_REVISION as r} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';console.log(JSON.stringify(r));"
 assert json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT))==R
 audit=json.loads((ROOT/'tests/fixtures/nmd2-600-20261024.json').read_text())
 assert R['file']==audit['source_file'] and R['current']==audit['source_sha256']

def test_saved_scene_and_roundtrip_refresh_identity_without_touching_user_data():
 data=dict(item_id='nmd2',name='Шкаф у окна',module_type='base_cabinet',bazis_id=R['id'],bazis_sha256=R['previous'],bazis_file='НМД2-600..fr3d',width=800,height=820,depth=550,body_height=720,base_height=100,base='legs',layout='doors',drawers=0,x=125,z=350,rotation=90,production_note='Сохранить запись',shelves=[dict(id='shelf-1',offset_mm=420,enabled=False)])
 saved=FurnitureItem(**data)
 assert saved.bazis_sha256==R['current'] and saved.bazis_file==R['file']
 assert FurnitureItem.model_validate_json(saved.model_dump_json())==saved
 for field in ('width','height','depth','x','z','rotation','production_note'): assert getattr(saved,field)==data[field]
 assert saved.shelves[0].offset_mm==420 and not saved.shelves[0].enabled
 fake={k:None for k in ('project_id','name','module_type','scene','version','created_at','updated_at')}
 fake['scene']={'items':[data]}
 revived=projection(fake)['scene']['items'][0]
 assert revived==dict(data,bazis_sha256=R['current'],bazis_file=R['file'])
 assert data['bazis_sha256']==R['previous']
 for patch in [dict(bazis_sha256='0'*64),dict(bazis_sha256='d79434c8d5e93744fcb37461491c9ec7560c1c78ad16d99a76ce7433fb9dfc80'),dict(bazis_id='bazis.other')]:
  unknown=dict(data,**patch);assert refresh_base_source(unknown) is unknown
