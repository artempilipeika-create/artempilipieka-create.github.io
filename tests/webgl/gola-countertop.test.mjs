import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {findSpace,snapItem} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {rightNeighbours,replacement} from '../../backend/v2/cabinet_assets/planner/mobility.mjs';
import {dimensionRuns} from '../../backend/v2/cabinet_assets/planner/dimension-geometry.mjs';
import '../../backend/v2/cabinet_assets/planner/production-notes.js';
const room={width:6200,depth:6200,height:3000,setup_complete:true};
const A=globalThis.MF_ACCESSORIES;
const variants=[...globalThis.MF_GOLA.variants,...globalThis.MF_PULLOUT_DRYERS.variants.filter(v=>v.execution==='gola'),...A.dishwashers.filter(v=>v.variant==='gola')];
const item=(v=variants[0],patch={})=>C.normalizeKitchen({item_id:v.id,name:'Gola',bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,bazis_resize:true,module_type:'base_cabinet',base:'legs',width:600,height:820,body_height:720,base_height:100,depth:510,x:0,z:0,rotation:0,...patch});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});
const back=it=>C.rotateXZ(it.x,it.z,-it.rotation).z-it.depth/2-C.kitchenSettings(it).rearServiceGapMm;
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('All 20 verified Gola sources place the worktop 0.5 mm ahead of closed facades at every rotation',()=>{
 assert.equal(variants.length,20);
 for(const v of variants)for(const rotation of [0,90,180,270])for(const depth of [510,560,600]){
  const it=item(v,{rotation,depth}),k=C.kitchenSettings(it),run=C.kitchenRuns([it],room)[0],top=run.parts.find(p=>p.role==='counter');
  assert.equal(k.frontOverhangMm,18.5);assert.equal(k.rearServiceGapMm,600-depth-18.5);
  const topFront=C.rotateXZ(run.position.x,run.position.z,-rotation).z+top.position.z+top.size.z/2;
  const fronts=C.productionParts(it,template(it)).filter(p=>p.role==='front');assert.ok(fronts.length);
  for(const p of fronts)near(topFront-(C.rotateXZ(it.x,it.z,-rotation).z+p.position.z+p.size.z/2),.5,.01);
  assert.match(globalThis.MF_PRODUCTION_NOTES.moduleText(it),/от лицевой поверхности закрытого фасада.*0,5 мм/);
 }
});
test('Legacy Gola migration keeps the worktop fixed and is idempotent, including islands',()=>{
 for(const rotation of [0,90,180,270])for(const z of [0,-2795]){
  const old={...item(variants[0],{rotation,...C.rotateXZ(0,z,rotation)}),rearServiceGapMm:50};
  const next=C.normalizeKitchen(old,room),local=C.rotateXZ(next.x,next.z,-rotation);
  near(local.z,z+21.5);near(back(next),z-255-50);
  assert.deepEqual(C.normalizeKitchen(JSON.parse(JSON.stringify(next)),room),next);
  assert.equal(next.bazis_sha256,old.bazis_sha256);
 }
});
test('Execution, carcass depth and worktop depth changes retain the worktop back datum',()=>{
 for(const rotation of [0,90,180,270]){
  const standard=item(A.dishwashers.find(v=>v.variant!=='gola'),{rotation}),gola=C.alignKitchenChange(standard,A.select(standard,'gola'));
  near(back(gola),back(standard));near(C.rotateXZ(gola.x,gola.z,-rotation).z,21.5);
  let current=gola;
  for(const patch of [{depth:560},{countertopDepthMm:650},{depth:510},{countertopDepthMm:600}]){
   const next=C.dimensionPatch(current,patch,room);near(back(next),back(current));assert.equal(C.kitchenSettings(next).frontOverhangMm,18.5);current=next;
  }
  const restored=C.alignKitchenChange(current,A.select(current,A.dishwashers.find(v=>v.variant!=='gola').variant));
  near(restored.x,standard.x);near(restored.z,standard.z);assert.equal(restored.rearServiceGapMm,50);
  for(const [from,to]of [[standard,gola],[gola,standard]]){
   const changed=replacement(from,to,template(from),template(to),true,room);near(back(changed),back(from));
  }
  const generic={...standard,bazis_id:null,bazis_sha256:null,bazis_file:null};
  const changed=replacement(gola,generic,template(gola),{},true,room);
  near(C.rotateXZ(changed.x,changed.z,-rotation).z-changed.depth/2,back(gola));
 }
});
test('Mixed rows retain one worktop, one dimension run and following right neighbours',()=>{
 for(const rotation of [0,90,180,270]){
  const a=item(A.dishwashers.find(v=>v.variant!=='gola'),{item_id:'a',rotation});
  const b=C.normalizeKitchen({...item(variants[0],{item_id:'b',rotation,...C.rotateXZ(600,0,rotation)}),rearServiceGapMm:50},room);
  const runs=C.kitchenRuns([a,b],room);assert.equal(runs.length,1);assert.equal(runs[0].parts.filter(p=>p.role==='counter').length,1);assert.equal(runs[0].countertopActualLengthMm,1200);
  assert.equal(dimensionRuns([a,b],room).length,1);assert.deepEqual(rightNeighbours(a,[a,b],room).map(it=>it.item_id),['b']);
 }
});
test('Click placement and wall snapping use the facade rule in every orientation',()=>{
 for(const rotation of [0,90,180,270]){
  const draft=item(variants[0],{rotation}),placed=findSpace(draft,[],room,draft);
  assert.equal(placed.rotation,rotation);near(back(placed),-3100);assert.equal(C.placementError(placed,[],room),'');
  const raw={...draft,...C.rotateXZ(0,-2760,rotation)},snapped=snapItem(raw,[],room,{threshold:40}).item;
  near(back(snapped),-3100);assert.equal(C.placementError(snapped,[],room),'');
 }
});
test('Both corner returns retain their worktop datum for Gola neighbours',()=>{
 for(const side of ['left','right'])for(const rotation of [0,90,180,270]){
  const v=C.CORNER_VARIANTS.find(v=>v.side===side&&v.purpose==='sink'&&v.door_count===1),corner=item(v,{width:1000,rotation});
  const regular=C.cornerReturnPlacement(corner,item(A.dishwashers.find(v=>v.variant!=='gola'))),gola=C.cornerReturnPlacement(corner,item(variants[0]));
  near(back(gola),back(regular));assert.equal(C.placementError(gola,[corner],room),'');
  assert.equal(C.kitchenRuns([corner,gola],room).filter(r=>r.parts.some(p=>p.role==='counter')).length,2);
 }
});
