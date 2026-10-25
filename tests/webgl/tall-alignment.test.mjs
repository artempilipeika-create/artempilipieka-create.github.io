import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {snapItem,findSpace} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {replacement} from '../../backend/v2/cabinet_assets/planner/mobility.mjs';
const room={width:5000,depth:4000,height:3000,setup_complete:true};
const tallIds=[...C.TALL_VARIANTS,...C.APPLIANCE_TALL_VARIANTS,...C.VITRINE_VARIANTS].map(v=>v.id);
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id],limits:C.PRODUCTION_MODELS[it.bazis_id].limits,resize:true});
const item=(id,patch={})=>{const p=C.PRODUCTION_MODELS[id];return C.normalizeKitchen({item_id:id,name:id,bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,bazis_resize:true,module_type:p.tier==='tall'?'tall_cabinet':p.tier==='wall'?'wall_cabinet':'base_cabinet',width:600,height:p.body_height+p.base_height,body_height:p.body_height,base_height:p.base_height,depth:p.scene_depth||600,base:p.tier==='wall'?'wall':'legs',x:0,z:0,rotation:0,...patch});};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function checkFaces(tall,lower,rotation){
 const local=C.rotateXZ(tall.x,tall.z,-rotation),wall=-(rotation%180?room.width:room.depth)/2;
 const parts=C.productionParts(tall,template(tall));
 near(local.z+Math.min(...parts.map(p=>p.position.z-p.size.z/2)),wall);
 near(local.z+Math.max(...parts.filter(p=>p.role==='front').map(p=>p.position.z+p.size.z/2)),C.cabinetFrontDatum(lower));
 assert.equal(C.dimensionError(tall),'');assert.equal(C.placementError(tall,[lower],room),'');
 const adapter=new StateAdapter({state:()=>({items:[lower,tall],room}),template});assert.equal(adapter.validate(tall),'');
}
test('Every shelf, appliance and Z1 tall aligns its top, rear and facade in all four directions',()=>{
 for(const id of tallIds)for(const rotation of [0,90,180,270])for(const lowerId of ['bazis.3079d0656398',globalThis.MF_GOLA.variants[0].id]){
  const wall=-(rotation%180?room.width:room.depth)/2;
  const lower=item(lowerId,{rotation}),k=C.kitchenSettings(lower);Object.assign(lower,C.rotateXZ(0,wall+lower.depth/2+k.rearServiceGapMm,rotation));
  const source=item(id,{rotation,...C.rotateXZ(600,0,rotation)}),before=JSON.stringify(source);
  const upper=item('bazis.877ba2f68d92',{height:900,body_height:900,elevation_mm:1780});
  const aligned=C.alignTallFront(C.alignTallTop(source,upper,room),lower,room);
  assert.equal(aligned.height,2680);checkFaces(aligned,lower,rotation);assert.equal(JSON.stringify(source),before);
  assert.equal(aligned.bazis_sha256,source.bazis_sha256);assert.deepEqual(C.alignTallFront(aligned,lower,room),aligned);
 }
});
test('Depth includes the actual back and front projections, including half millimetres',()=>{
 const lower=item('bazis.3079d0656398',{z:-1695});
 for(const [id,depth]of [[C.TALL_FAMILY.default_id,557],[C.APPLIANCE_TALL_FAMILY.default_id,560],[C.VITRINE_FAMILY.default_id,555.5]]){
  const next=C.alignTallFront(item(id,{x:600}),lower,room);assert.equal(next.depth,depth);
  assert.equal(C.cabinetFrontDatum(next),-1422);assert.equal(next.z,-2000+depth/2+C.tallRearExtension(next));
 }
});
test('Wall snapping ignores external wall clearance for tall cabinets and joins lower facades',()=>{
 for(const id of [C.TALL_FAMILY.default_id,C.APPLIANCE_TALL_FAMILY.default_id,C.VITRINE_FAMILY.default_id])for(const rotation of [0,90,180,270]){
  const wall=-(rotation%180?room.width:room.depth)/2,lower=item(globalThis.MF_GOLA.variants[0].id,{rotation,...C.rotateXZ(0,wall+326.5,rotation)});
  const raw=item(id,{rotation,...C.rotateXZ(610,wall+310,rotation)}),result=snapItem(raw,[lower],room,{wallOffset:50,threshold:45});
  assert.equal(result.error,'');checkFaces(result.item,lower,rotation);
  const alone=snapItem(raw,[],room,{wallOffset:50,threshold:45}).item;
  near(C.rotateXZ(alone.x,alone.z,-rotation).z-alone.depth/2-C.tallRearExtension(alone),wall);
 }
});
test('Click placement beside a wall row fits depth without moving the lower cabinet',()=>{
 for(const id of [C.TALL_FAMILY.default_id,C.APPLIANCE_TALL_FAMILY.default_id,C.VITRINE_FAMILY.default_id]){
  const lower=item('bazis.3079d0656398',{x:-2200,z:-1695}),before=JSON.stringify(lower);
  const next=findSpace(item(id),[lower],room,lower,{wallOffset:50});assert.equal(next.x,-1600);checkFaces(next,lower,0);assert.equal(JSON.stringify(lower),before);
 }
});
test('Replacing a tall with a different rear construction keeps its outer rear face fixed',()=>{
 const source=C.tallWallPlacement(item(C.TALL_FAMILY.default_id,{depth:578.5}),room);
 const draft=item(C.VITRINE_FAMILY.default_id),next=replacement(source,draft,template(source),template(draft),true,room);
 near(next.z-next.depth/2,-2000);assert.equal(next.depth,578.5);
});
test('Fractional depth and quarter coordinates are restricted to tall cabinets',()=>{
 const valid=C.tallWallPlacement(item(C.VITRINE_FAMILY.default_id,{depth:555.5}),room);
 const adapter=new StateAdapter({state:()=>({items:[valid],room}),template});assert.equal(adapter.validate(valid),'');
 assert.match(adapter.validate({...valid,depth:555.25}),/0,5/);
 const lower=item('bazis.3079d0656398',{depth:510.5,z:-1600});assert.match(adapter.validate(lower),/целые/);
 assert.throws(()=>C.alignTallFront(valid,{...lower,rotation:90},room),/одну сторону/);
});
