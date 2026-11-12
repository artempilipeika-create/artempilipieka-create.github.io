import json,subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_modern import VARIANTS
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_document import hardware_for,module_contents,module_materials
ROOT=Path(__file__).resolve().parents[1]
def item(v):
 base=100 if v['family']=='fridge' else 0
 return dict(item_id=v['id'],name=v['label'],module_type='tall_cabinet' if base else 'wall_cabinet',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=600,height=v['default_height'],depth=v['native_frame']['size'][2]-v['rear_inset_mm'],body_height=v['default_height']-base,base_height=base,base='plinth' if base else 'wall',layout='doors',x=0,z=0,rotation=0,handles='handles' if v['execution']=='handles' else 'handleless')
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['source_file'])
def test_new_sources_roundtrip_without_rewriting_native_identity(v):
 data=item(v);saved=FurnitureItem(**data)
 assert FurnitureItem.model_validate_json(saved.model_dump_json())==saved
 assert saved.bazis_sha256==v['source_sha256'] and saved.bazis_file==v['source_file'] and saved.bazis_resize
 assert hardware_for(saved.model_dump())[0]
 assert module_contents(saved.model_dump())
 assert len(module_materials(saved.model_dump(),'Корпус','Фасад'))==(2 if v['family']=='fridge' else 3)
 with pytest.raises(ValidationError):FurnitureItem(**dict(data,bazis_sha256='0'*64))
def test_modern_hardware_matches_browser_at_default_and_changed_heights():
 inputs=[dict(item(v),height=h,body_height=h-(100 if v['family']=='fridge' else 0)) for v in VARIANTS for h in ([2000,2200] if v['family']=='fridge' else [450,600] if v['family']=='gaslift' else [720,900])]
 js="import {productionHardware} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let input='';for await(const c of process.stdin)input+=c;console.log(JSON.stringify(JSON.parse(input).map(it=>productionHardware(it).items)));"
 hardware=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps(inputs).encode(),cwd=ROOT))
 for it,hw in zip(inputs,hardware):assert hardware_for(FurnitureItem(**it).model_dump())[0]==[dict(name=h['name'],qty=h['quantity'],unit=h['unit'],article=h.get('article') or '') for h in hw]
def test_controls_and_photos_are_served_but_native_archive_stays_private():
 from fastapi import FastAPI
 from fastapi.testclient import TestClient
 from backend.v2.cabinet_ui import router
 from backend.v2.modern_archive import build_archive
 archive=build_archive()
 import zipfile
 with zipfile.ZipFile(archive) as z:
  assert len(z.namelist())==41
  assert z.read("Martin_Forest_Import_v9_9_13.js")== (ROOT/"backend/v2/cabinet_assets/planner/bazis-drawers-import.js").read_bytes()
 app=FastAPI();app.include_router(router())
 with TestClient(app) as c:
  for url in ['/constructor','/constructor-legacy']:assert c.get(url).text.count('id="modern-cabinet-controls"')==1
  for asset in ['modern-cabinet-variants.js','modern-cabinets.js','hardware-photos/38402.webp','hardware-photos/113272.webp']:
   r=c.get('/account/planner/'+asset);assert r.status_code==200
   assert r.content==(ROOT/'backend/v2/cabinet_assets/planner'/asset).read_bytes()
  assert c.get('/account/planner/modern-cabinet-sources.zip').status_code==404
