"""Drawer API/PDF checks; no external DB, orders or messages."""
import json,subprocess
from io import BytesIO
from pathlib import Path
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_drawers import VARIANTS
from backend.v2.three_d_document import hardware_for,module_contents,module_materials,render
ROOT=Path(__file__).resolve().parents[1]
def test_drawer_assets_are_served_by_constructor_router():
 from fastapi import FastAPI
 from fastapi.testclient import TestClient
 from backend.v2.cabinet_ui import router
 app=FastAPI();app.include_router(router())
 with TestClient(app) as client:
  page=client.get('/constructor')
  assert page.status_code==200 and 'drawer-options-controls' in page.text
  for name in ('drawer-variants.js','drawer-variants.json','drawer-model.js','drawer-ui.js','drawer.css','bazis-drawers-import.js'):
   response=client.get('/account/planner/'+name)
   assert response.status_code==200,name
   assert response.content==(ROOT/'backend/v2/cabinet_assets/planner'/name).read_bytes(),name
   expected='text/css' if name.endswith('.css') else 'application/json' if name.endswith('.json') else 'application/javascript'
   assert response.headers['content-type'].startswith(expected),name
  assert client.get('/account/planner/not-a-public-asset.py').status_code==404

def item(v):
 return dict(item_id=v['id'],name=v['label'],module_type='base_cabinet',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=600,height=820,depth=510,body_height=720,base_height=100,base='legs',x=0,z=0,rotation=0)
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_source_schema_and_nominal_fronts(v):
 saved=FurnitureItem(**dict(item(v),bazis_file='stale-name.fr3d')).model_dump()
 assert saved['bazis_file']==v['source_file'] and saved['bazis_resize']
 assert saved['drawers']==v['drawer_count'] and saved['layout']=='drawers'
 if v['opening']=='push':assert saved['handles']=='handleless'
 if v['layout']=='three':assert '177,5' in module_contents(saved)
 assert len(hardware_for(saved)[0])==len(v['hardware_items'])
 assert any('16 мм' in k for k,_ in module_materials(saved,'Корпус','Фасад'))
@pytest.mark.parametrize('patch',[dict(bazis_sha256='0'*64),dict(depth=701),dict(height=1101,body_height=1001),dict(module_type='tall_cabinet')])
def test_reject_invalid_source_and_unsupported_sizes(patch):
 with pytest.raises(ValidationError):FurnitureItem(**dict(item(VARIANTS[0]),**patch))
def test_leg_height_preserves_carcass():
 for v in VARIANTS:
  for leg in (80,100,150):assert FurnitureItem(**dict(item(v),height=720+leg,base_height=leg,legHeightMm=leg)).body_height==720

def test_js_pdf_purchasing_parity():
 specimens=[dict(item(v),height=body+leg,body_height=body,depth=depth,base_height=leg,legHeightMm=leg) for v in VARIANTS for leg in (80,100,150) for body in (720,800,920) for depth in (500,510,550,560,600)]
 js="""import {productionHardware} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(it=>productionHardware(it).items)));"""
 actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps(specimens).encode(),cwd=ROOT))
 for it,hw in zip(specimens,actual):assert hardware_for(it)[0]==[dict(name=h['name'],qty=h['quantity'],unit=h['unit'],article=h['article'] or '') for h in hw]

def test_pdf_all_eight_variants(tmp_path):
 data=render('Ящики · проверка',dict(items=[item(v) for v in VARIANTS],room=dict(width=6000,depth=3200,height=2700)),{})
 text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
 for value in ['177,5','117360','117356','117346','94123','113187','12.0068','12.0095','Westline','AKS','16 мм','0,04']:assert value in text,value
 (tmp_path/'drawers-check.pdf').write_bytes(data)

@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_elastic_sizes_save_with_correct_pdf_specs(v):
 from backend.v2.three_d_drawers import drawer_configuration, drawer_front_heights
 for body in (720,800,920):
  for depth in (500,510,550,560,600):
   saved=FurnitureItem(**dict(item(v),height=body+100,body_height=body,depth=depth)).model_dump()
   drawers,error=drawer_configuration(saved)
   assert not error and len(drawers)==v['drawer_count']
   assert f'Корпус {body} мм' in module_contents(saved)
   if v['layout']=='three':assert drawer_front_heights(saved)==[357+(body-720)/2,177.5+(body-720)/4,177.5+(body-720)/4]
   assert all(str(d['kit']['length_mm']) in module_contents(saved) for d in drawers)

def test_elastic_pdf_uses_current_kits_and_fronts(tmp_path):
 specimens=[dict(item(v),height=1020,body_height=920,depth=560) for v in VARIANTS]
 data=render('Эластичные ящики',dict(items=specimens,room=dict(width=6000,depth=3200,height=2700)),{})
 text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
 for expected in ('457','227,5','550','12.0069','117828','117833','Корпус 920'):assert expected in text,expected
 (tmp_path/'drawers-elastic-check.pdf').write_bytes(data)

def test_drawer_pdf_does_not_substitute_carcass_material_when_16_mm_is_unassigned():
 it=item(VARIANTS[0])
 assert '18 мм' not in module_materials(it,'Декор корпуса 18 мм','Фасад 18 мм')[2][1]
 assert '16 мм' in module_materials(it,'Декор корпуса 18 мм','Фасад 18 мм')[2][1]
 it['part_materials']={'drawer-1-bottom':'selected16','drawer-1-rear':'selected16'}
 assert module_materials(it,'Новый корпус 18 мм','Фасад 18 мм',{'selected16':'Выбранная плита 16 мм'})[2][1]=='Выбранная плита 16 мм'
