import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTION_MODELS,normalizeKitchen,productionParts,mountedItems,rotateXZ} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {albumGeometry} from '../../backend/v2/cabinet_assets/planner/album-geometry.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';

test('Every native family projects its actual panels without changing source or manual choices',()=>{
  for(const [id,p] of Object.entries(PRODUCTION_MODELS)){
    const it=normalizeKitchen({item_id:id,name:p.label,bazis_id:id,bazis_file:p.source_file,bazis_sha256:p.source_sha256,
      module_type:p.tier==='wall'?'wall_cabinet':p.tier==='tall'?'tall_cabinet':'base_cabinet',
      width:p.native_defaults?.width||600,height:p.body_height+p.base_height,body_height:p.body_height,base_height:p.base_height,
      worktop_thickness:p.worktop_thickness,depth:p.scene_depth||p.native_defaults?.depth||510,
      base:p.tier==='wall'?'wall':'legs',layout:'doors',x:0,z:0,rotation:0,body_variant_id:'manual-body',part_materials:{side:'manual-side'}});
    const original=structuredClone(it),g=albumGeometry([it])[0];assert.deepEqual(it,original,id);
    assert.equal(g.source_sha256,p.source_sha256);assert.ok(g.shapes.length>0&&g.shapes.length<=600,id);
    for(const shape of g.shapes){
      assert.ok(shape.x>=-it.width/2-100&&shape.x+shape.w<=it.width/2+100,id);
      assert.ok(shape.y>=-100&&shape.y+shape.h<=it.height+150,id);
    }
    for(const part of productionParts(it,{production:p}).filter(v=>v.role!=='back'&&(v.role!=='front'||v.fixed))){
      const expected=[part.position.x-part.size.x/2,part.position.y-part.size.y/2,part.size.x,part.size.y];
      assert.ok(g.shapes.some(s=>[s.x,s.y,s.w,s.h].every((v,i)=>Math.abs(v-expected[i])<.0011)),id+': '+part.key);
    }
  }
});

const base={item_id:'base',module_type:'base_cabinet',width:600,height:820,body_height:720,base_height:100,legHeightMm:100,
  worktop_thickness:38,depth:510,base:'legs',x:0,z:0,rotation:0,countertopThicknessMm:38};
const upper={item_id:'upper',module_type:'wall_cabinet',width:600,height:720,body_height:720,base_height:0,base:'wall',
  depth:317,x:0,z:-96.5,rotation:0,bazis_file:'keep.fr3d',bazis_sha256:'keep-source',front_variant_id:'manual'};
test('600 mm follows the real worktop on all walls, including changed legs and stacked uppers',()=>{
  for(const rotation of [0,90,180,270])for(const leg of [80,100,150]){
    const b={...base,height:720+leg,legHeightMm:leg,base_height:leg,rotation},u={...upper,...rotateXZ(0,-96.5,rotation),rotation};
    const source=[b,u,{...u,item_id:'stack',height:360,body_height:360,elevation_mm:2178}],original=structuredClone(source);
    const result=mountedItems(source);assert.deepEqual(source,original);
    assert.equal(result[1].elevation_mm,b.height+38+600);assert.equal(result[2].elevation_mm,b.height+38+600+720);
    assert.equal(result[1].bazis_file,u.bazis_file);assert.equal(result[1].front_variant_id,'manual');
  }
  const withIsland=mountedItems([base,upper,{...base,item_id:'island',height:1000,z:1600}]);
  assert.equal(withIsland[1].elevation_mm,1458);
  assert.equal(mountedItems([{...base,countertopThicknessMm:60,worktop_thickness:60},upper])[1].elevation_mm,1480);
});
test('Raising the base cannot silently push an associated upper through the ceiling',()=>{
  const state={upperMountingRule:'worktop600',room:{width:4200,depth:3200,height:2200},items:[base,upper]};
  const adapter=new StateAdapter({state:()=>state,template:()=>null});
  assert.match(adapter.validate({...base,height:870,base_height:150,legHeightMm:150}),/выше потолка/);
});
