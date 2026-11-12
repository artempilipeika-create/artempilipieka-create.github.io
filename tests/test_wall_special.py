from pathlib import Path
import json, subprocess
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_wall_special import VARIANTS,wall_special_hardware,wall_special_shelves
from backend.v2.three_d_document import hardware_for,module_contents,module_materials
ROOT=Path(__file__).resolve().parents[1]
def item(v,**patch):
 w,h,d=v['native_frame']['size']
 return dict(dict(item_id='upper-qa',name='Upper QA',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],module_type='wall_cabinet',width=w,height=h,depth=d-3,base='wall',base_height=0,x=0,z=0,rotation=0),**patch)
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_save_reopen_source_identity_and_pdf_quantities(v):
 it=FurnitureItem(**item(v)).model_dump(mode='json')
 assert FurnitureItem(**it).model_dump(mode='json')==it
 assert it['bazis_file']==v['source_file'] and it['bazis_sha256']==v['source_sha256']
 assert it['handles']==('handles' if v['execution']=='handles' else 'handleless')
 assert len(hardware_for(it)[0])==len(wall_special_hardware(it))
 assert 'Центры полок' in module_contents(it)
 if v['family']!='corner':assert ('Фасады и полки','Стекло 4 мм') in module_materials(it,'body','front')
 for patch in [dict(bazis_sha256='0'*64),dict(depth=400),dict(height=299),dict(base='plinth',base_height=100),dict(module_type='base_cabinet')]:
  with pytest.raises(ValidationError):FurnitureItem(**item(v,**patch))
def test_browser_and_server_share_resized_shelf_and_purchase_contract():
 specimens=[item(v,width=900 if v['family']=='corner' or v['door_count']==2 else 450,height=900) for v in VARIANTS]
 script="import './backend/v2/cabinet_assets/planner/furniture-core.mjs';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(it=>({shelves:MF_WALL_SPECIAL.shelfCenters(it),hardware:MF_WALL_SPECIAL.hardware(it).items}))));"
 results=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(specimens).encode(),cwd=ROOT))
 for it,js in zip(specimens,results):
  FurnitureItem(**it)
  assert js['shelves']==wall_special_shelves(it)
  assert js['hardware']==wall_special_hardware(it)
