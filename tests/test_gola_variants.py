"""Verify Gola source identity, purchasing parity and saved-project validation."""
import json
import subprocess
from io import BytesIO
from pathlib import Path
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_gola import VARIANTS,gola_error
from backend.v2.three_d_document import hardware_for,module_contents,render
ROOT=Path(__file__).resolve().parents[1]
def item(v):
 return dict(item_id=v['id'],name=v['label'],module_type='base_cabinet',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=600,height=820,depth=510,body_height=720,base_height=100,base='legs',x=0,z=0,rotation=0)
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['source_file'])
def test_save_and_pdf_source_fronts(v):
 saved=FurnitureItem(**dict(item(v),bazis_file='Мой переименованный модуль.fr3d')).model_dump()
 assert saved['bazis_file']=='Мой переименованный модуль.fr3d' and saved['bazis_resize']
 assert saved['bazis_sha256']==v['source_sha256']
 assert saved['handles']=='handleless' and saved['drawers']==v['drawer_count'] and saved['layout']==v['kind']
 text=module_contents(saved)
 if v['layout']=='three':assert '329 + 163 + 163' in text
 if v['kind']=='doors' and v['purpose']=='shelf':assert 'две полки' in text
 hardware=hardware_for(saved)[0]
 assert next(h['qty'] for h in hardware if h['article']=='118236')==(2 if v['kind']=='doors' else 4)
 assert next(h for h in hardware if h['article']=='60965')['qty']==.6
 for patch in (dict(bazis_sha256='0'*64),dict(width=1300),dict(module_type='wall_cabinet')):
  with pytest.raises(ValidationError):FurnitureItem(**dict(item(v),**patch))
def test_frontend_backend_constraints_and_purchasing_parity():
 specimens=[dict(item(v),height=body+leg,body_height=body,base_height=leg,legHeightMm=leg,depth=depth) for v in VARIANTS for leg in (80,100,150) for body in (600,720,800,920) for depth in (400,500,510,560,600)]
 script="""import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(it=>{const error=C.dimensionError(it);return {error,items:error?[]:C.productionHardware(it).items}})));"""
 actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(specimens).encode(),cwd=ROOT))
 for it,result in zip(specimens,actual):
  assert result['error']==gola_error(it),it
  if result['error']:continue
  saved=FurnitureItem(**it).model_dump()
  assert hardware_for(saved)[0]==[dict(name=h['name'],qty=h['quantity'],unit=h['unit'],article=h.get('article') or '') for h in result['items']],it

def test_all_thirteen_sources_render_in_specification():
 data=render('Gola',dict(items=[item(v) for v in VARIANTS],room=dict(width=6000,depth=3200,height=2700)),{})
 text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
 for expected in ('329 + 163 + 163','60965','60966','118236','16 мм','две полки'):assert expected in text,expected
