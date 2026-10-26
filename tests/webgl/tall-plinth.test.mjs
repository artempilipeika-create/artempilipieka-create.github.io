import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {kitchenPriceBreakdown} from '../../backend/v2/cabinet_assets/planner/pricing.mjs';
const A=globalThis.MF_ACCESSORIES,room={width:8000,depth:6000,height:3000};
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});
function item(id,patch={}){
 const p=C.PRODUCTION_MODELS[id];return C.normalizeKitchen({item_id:id,name:p.label,bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,bazis_resize:true,module_type:p.tier==='base'?'base_cabinet':'tall_cabinet',width:600,height:p.body_height+p.base_height,body_height:p.body_height,base_height:100,depth:p.tier==='base'?510:600,base:'plinth',plinthMaterialId:'green',x:0,z:0,rotation:0,...patch});
}
function scene(rotation=0,gola=false){
 const lower=item(gola?globalThis.MF_GOLA.variants[0].id:'bazis.3079d0656398',{item_id:'lower',rotation}),wall=-(rotation%180?room.width:room.depth)/2;
 Object.assign(lower,C.rotateXZ(0,wall+lower.depth/2+C.kitchenSettings(lower).rearServiceGapMm,rotation));
 const tall=[C.TALL_FAMILY.default_id,C.APPLIANCE_TALL_FAMILY.default_id,C.VITRINE_FAMILY.default_id].map((id,i)=>C.alignTallFront(item(id,{item_id:'tall'+i,rotation,...C.rotateXZ([600,1200,-600][i],0,rotation)}),lower,room));
 return {room,items:[lower,...tall],plinths:[{id:'auto',automatic:true,members:[],shape:'straight',excluded_members:[]}]};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} != ${b}`);
for(const rotation of [0,90,180,270])for(const gola of [false,true])test(`One physical plinth under lower, shelf, appliance and Z1 at ${rotation}, Gola=${gola}`,()=>{
 const s=scene(rotation,gola),before=JSON.stringify(s),plans=A.plans(s),[p]=plans;
 assert.equal(plans.length,1);assert.equal(p.width,2400);assert.equal(p.parts.length,1);assert.equal(p.parts[0].length,2400);assert.equal(p.parts[0].width,97);assert.equal(p.parts[0].thickness,18);assert.equal(p.members.length,4);
 const origin=C.rotateXZ(p.position.x,p.position.z,-rotation),part=p.parts[0];near(origin.z+part.position.z+9,C.cabinetFrontDatum(s.items[0])-69);
 const tops=C.kitchenRuns(s.items,room).flatMap(r=>r.parts.filter(p=>p.role==='counter'));assert.equal(tops.length,1);assert.equal(tops[0].length,600);
 const native=A.nativeItems(s);assert.equal(native.length,1);assert.equal(native[0].target.width,2400);assert.equal(native[0].construction.parts.length,1);assert.match(native[0].production_note,/закрытого фасада 69 мм/);assert.equal(JSON.stringify(s),before);
});
test('All shelf, appliance and Z1 sources participate without depending on cabinet height or body depth',()=>{
 for(const v of [...C.TALL_VARIANTS,...C.APPLIANCE_TALL_VARIANTS,...C.VITRINE_VARIANTS,...globalThis.MF_OPEN_TALL.variants.filter(v=>!v.wall)]){
  const s=scene(),lower=s.items[0],tall=C.alignTallFront(item(v.id,{height:2600,x:600}),lower,room);s.items=[lower,tall];
  assert.equal(A.plans(s).length,1,v.id);assert.equal(A.plans(s)[0].width,1200,v.id);
 }
 const s=scene();s.items=s.items.filter(it=>it.item_id!=='lower'&&it.item_id!=='tall2');assert.equal(A.plans(s).length,1);assert.equal(A.plans(s)[0].width,1200);
});
test('Real gaps, facade steps, height changes, material changes and explicit exclusions remain separate',()=>{
 for(const patch of [{x:1201},{z:-2650},{plinthMaterialId:'white'}]){
  const s=scene();Object.assign(s.items[2],patch);assert.equal(A.plans(s).length,2);
 }
 const s=scene();s.plinths[0].excluded_members=['lower'];assert.deepEqual(A.plans(s).map(p=>p.width).sort((a,b)=>a-b),[600,1200]);
 s.plinths[0].excluded_members=[];s.items[0].legHeightMm=150;s.items[0].height=870;assert.equal(A.plans(s).length,3);
 s.plinths[0].material_id='shared';s.items[0].legHeightMm=100;s.items[0].height=820;s.items[1].plinthMaterialId='white';assert.equal(A.plans(s).length,1);assert.equal(A.plans(s)[0].material_id,'shared');
});
test('Actual dress contains one board, owns old tall plinths and exclusions, and keeps tall layers',()=>{
 const s=scene(),factory=new MeshFactory({room,state:s,material:()=>null,template},()=>{});
 const g=factory.dress(s.items),boards=[];g.traverse(m=>{if(m.userData.productionPart==='plinth')boards.push(m);});
 assert.equal(boards.length,1);near(new THREE.Box3().setFromObject(boards[0]).getSize(new THREE.Vector3()).x,2.4);assert.deepEqual(new Set(g.userData.mergedPlinthIds),new Set(s.items.map(it=>it.item_id)));assert.deepEqual(new Set(boards[0].parent.userData.tiers),new Set(['base','tall']));factory.release(g);
 s.plinths[0].excluded_members=['tall0'];const excluded=factory.dress(s.items);assert.ok(excluded.userData.mergedPlinthIds.includes('tall0'));factory.release(excluded);factory.dispose();
});
test('Saved settings and undo/redo recompute the common plinth from current positions',()=>{
 let s=scene();const adapter={snapshot:()=>({name:'QA',scene:s}),restore:snapshot=>{s=structuredClone(snapshot.scene);}},history=new History(adapter);
 history.run('Move',()=>{s.items[2].x+=300;});assert.deepEqual(A.plans(s).map(p=>p.width).sort((a,b)=>a-b),[600,1800]);history.undo();assert.equal(A.plans(s)[0].width,2400);history.redo();assert.equal(A.plans(s).length,2);
 assert.deepEqual(A.plans(JSON.parse(JSON.stringify(s))),A.plans(s));
});
test('Price breakdown includes one actual shared board and no per-tall duplicates',()=>{
 const s=scene(),quote=kitchenPriceBreakdown(s.items,room,template,()=>null,null,s.plinths),plinths=quote.extras.filter(p=>p.role==='plinth');
 assert.equal(plinths.reduce((n,p)=>n+p.partCount,0),1);near(plinths.reduce((n,p)=>n+p.quantity,0),2400*97/1e6);
 assert.ok(quote.modules.every(p=>p.extras.every(extra=>extra.role!=='plinth')));
});
