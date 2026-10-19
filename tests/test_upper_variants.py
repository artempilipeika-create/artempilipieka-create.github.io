"""Upper cards: schema round trips, public assets and JS/Python purchasing parity.
No production database, orders, messages or browser automation.
"""
import json,subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem,Scene
from backend.v2.three_d_upper import VARIANTS
from backend.v2.three_d_document import hardware_for,module_contents,module_materials
ROOT=Path(__file__).resolve().parents[1]
def item(v):
 return dict(item_id=v['id'],name='Над чайником',module_type='wall_cabinet',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=600,height=720,depth=317,body_height=720,base_height=0,base='wall',layout='doors',x=0,z=0,rotation=0,handles='handles' if v['execution']=='handles' else 'handleless')
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['label'])
def test_donor_roundtrip_preserves_data_and_execution(v):
 data=item(v)
 if v['filling']=='shelves':data['shelves']=[dict(id='shelf-1',offset_mm=360 if v['legacy'] else 359.5)]
 saved=FurnitureItem(**data)
 assert FurnitureItem.model_validate_json(saved.model_dump_json())==saved
 assert saved.bazis_file==v['source_file'] and saved.bazis_resize
 assert saved.handles==data['handles']
 assert 'ВМД'+str(v['door_count']) in module_contents(saved.model_dump())
 assert len(module_materials(saved.model_dump(),'Корпус','Фасад'))==3
@pytest.mark.parametrize('patch',[dict(bazis_sha256='0'*64),dict(module_type='base_cabinet'),dict(width=601),dict(base='legs'),dict(depth=501)])
def test_invalid_identity_and_dimensions_are_rejected(patch):
 v=next(v for v in VARIANTS if not v['legacy'] and v['door_count']==1)
 with pytest.raises(ValidationError):FurnitureItem(**dict(item(v),**patch))
def test_corrected_d2_donors_have_no_push_or_extra_hinges():
 for sha in ['c98de01845cf','85f493fc1d17']:
  v=next(v for v in VARIANTS if v['id']=='bazis.'+sha);rows,_=hardware_for(item(v))
  assert sum(h['qty'] for h in rows if h['article']=='112602')==4
  assert not any(h['article'] in ('09.0019','09.0021') for h in rows)
def test_current_hardware_matches_frontend_after_resizing():
 specimens=[dict(item(v),height=h,body_height=h,width=w) for v in VARIANTS if not v['legacy'] for h in [720,850,900] for w in ([400,500,600] if v['door_count']==1 else [400,600,800,900])]
 js="""import {productionHardware} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(it=>productionHardware(it).items)));"""
 actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps(specimens).encode(),cwd=ROOT))
 for it,hw in zip(specimens,actual):
  saved=FurnitureItem(**it).model_dump()
  assert hardware_for(saved)[0]==[dict(name=h['name'],qty=h['quantity'],unit=h['unit'],article=h.get('article') or '') for h in hw]
  assert bool(hardware_for(saved)[1])==(it['height']!=720)
def test_new_assets_are_served_with_correct_mime_and_controls():
 from fastapi import FastAPI
 from fastapi.testclient import TestClient
 from backend.v2.cabinet_ui import router
 app=FastAPI();app.include_router(router())
 with TestClient(app) as client:
  for url in ['/constructor','/constructor-legacy']:
   r=client.get(url);assert r.status_code==200
   assert r.text.count('id="upper-options-controls"')==1
   for label in ['Накладные ручки','Без ручек','Нажатие (tip-on)']:assert label in r.text
  for asset in ['upper-variants.js','upper-variants.json','upper-model.js','upper-ui.js','bazis-drawers-import.js']:
   r=client.get('/account/planner/'+asset);assert r.status_code==200
   assert r.content==(ROOT/'backend/v2/cabinet_assets/planner'/asset).read_bytes()
   assert r.headers['content-type'].startswith('application/json' if asset.endswith('.json') else 'application/javascript')
  assert client.get('/account/planner/../three_d_upper.py').status_code==404
