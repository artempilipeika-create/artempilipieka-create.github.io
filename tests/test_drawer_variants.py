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
@pytest.mark.parametrize('patch',[dict(bazis_sha256='0'*64),dict(depth=560),dict(height=900,body_height=800),dict(module_type='tall_cabinet')])
def test_reject_invalid_source_and_unsupported_sizes(patch):
 with pytest.raises(ValidationError):FurnitureItem(**dict(item(VARIANTS[0]),**patch))
def test_leg_height_preserves_carcass():
 for v in VARIANTS:
  for leg in (80,100,150):assert FurnitureItem(**dict(item(v),height=720+leg,base_height=leg,legHeightMm=leg)).body_height==720

def test_js_pdf_purchasing_parity():
 specimens=[dict(item(v),height=720+leg,base_height=leg,legHeightMm=leg) for v in VARIANTS for leg in (80,100,150)]
 js="""import {productionHardware} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(it=>productionHardware(it).items)));"""
 actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps(specimens).encode(),cwd=ROOT))
 for it,hw in zip(specimens,actual):assert hardware_for(it)[0]==[dict(name=h['name'],qty=h['quantity'],unit=h['unit'],article=h['article'] or '') for h in hw]

def test_pdf_all_eight_variants(tmp_path):
 data=render('Ящики · проверка',dict(items=[item(v) for v in VARIANTS],room=dict(width=6000,depth=3200,height=2700)),{})
 text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
 for value in ['177,5','117360','117356','117346','94123','113187','12.0068','12.0095','Westline','AKS','16 мм','0,04']:assert value in text,value
 (tmp_path/'drawers-check.pdf').write_bytes(data)
