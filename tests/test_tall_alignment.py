"""Facade-aligned tall dimensions retain exact half-mm depth and quarter-mm position."""
import json
import subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem, Scene

ROOT=Path(__file__).resolve().parents[1]
def specimens():
 script="""import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';
 const room={width:5000,depth:4000,height:3000},out=[];
 for(const v of [...C.TALL_VARIANTS,...C.APPLIANCE_TALL_VARIANTS,...C.VITRINE_VARIANTS])for(const rotation of [0,90,180,270])for(const gola of [false,true]){
  const p=C.PRODUCTION_MODELS[v.id],id=gola?globalThis.MF_GOLA.variants[0].id:'bazis.3079d0656398',lp=C.PRODUCTION_MODELS[id],wall=-(rotation%180?room.width:room.depth)/2;
  const lower=C.normalizeKitchen({item_id:'lower',module_type:'base_cabinet',bazis_id:id,bazis_sha256:lp.source_sha256,width:600,height:820,depth:510,base:'legs',body_height:720,base_height:100,x:0,z:0,rotation});
  Object.assign(lower,C.rotateXZ(0,wall+255+C.kitchenSettings(lower).rearServiceGapMm,rotation));
  const tall={item_id:v.id,name:v.id,module_type:'tall_cabinet',bazis_id:v.id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,bazis_resize:true,width:600,height:2680,body_height:2580,base_height:100,base:'legs',depth:600,rotation,...C.rotateXZ(600,0,rotation)};
  out.push(C.alignTallFront(tall,lower,room));
 }console.log(JSON.stringify(out));"""
 return json.loads(subprocess.check_output(['node','--input-type=module','-e',script],cwd=ROOT))

def test_all_tall_variants_save_and_reopen_exact_alignment():
 for item in specimens():
  saved=FurnitureItem(**item)
  reopened=FurnitureItem.model_validate_json(saved.model_dump_json())
  for key in ['depth','x','z','height','bazis_sha256']:
   assert getattr(reopened,key)==item[key],(item['bazis_id'],key)
  assert Scene(room=dict(width=5000,depth=4000,height=3000),items=[saved]).items[0].depth==item['depth']

def test_precision_limits_remain_strict():
 tall=specimens()[0]
 for patch in [dict(depth=555.25),dict(x=1.1),dict(z=float('nan'))]:
  with pytest.raises(ValidationError):FurnitureItem(**dict(tall,**patch))
 generic=dict(item_id='generic',name='Test',module_type='chest',width=600,height=820,depth=510,base_height=100,body_height=720,x=0,z=0)
 assert FurnitureItem(**generic).depth==510
 for patch in [dict(depth=510.5),dict(x=.25),dict(z=.25)]:
  with pytest.raises(ValidationError):FurnitureItem(**dict(generic,**patch))
