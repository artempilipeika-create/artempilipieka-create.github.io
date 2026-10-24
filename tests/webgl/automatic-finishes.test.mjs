import test from 'node:test';
import assert from 'node:assert/strict';
import {CORNER_VARIANTS,PRODUCTION_MODELS as models,normalizeKitchen,kitchenRuns,cornerReturnPlacement,rotateXZ} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {automaticPanelSegments} from '../../backend/v2/cabinet_assets/planner/automatic-finishes.mjs';
import {resolvedPanels,allSegments,finishSchedule,finishText,surfaceOffset,resolvedFinishError} from '../../backend/v2/cabinet_assets/planner/wall-finishes.mjs';
import {WallFinishMesh} from '../../backend/v2/cabinet_assets/planner/wall-finish-mesh.mjs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const A=globalThis.MF_ACCESSORIES,room={width:10000,depth:10000,height:3000};let serial=0;
function item(patch={},id='bazis.0211e4f77fc4'){
 const p=models[id];return normalizeKitchen({item_id:'m'+(++serial),bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,module_type:'base_cabinet',name:p.label,width:p.native_defaults.width,height:820,body_height:720,base_height:100,depth:510,base:'plinth',x:0,z:0,rotation:0,...patch});
}
const corner=side=>item({},CORNER_VARIANTS.find(v=>v.side===side&&v.purpose==='sink'&&v.door_count===1).id);
const panel={id:'p',automatic:true,excluded_members:[],kind:'skinali',shape:'straight',wall:'a',offset:0,width:2000,height:600,elevation:858,depth:400,thickness:6,color:'#e7e3da',tile_width:600,tile_height:300,grout:2,grout_color:'#bcb8af'};
const state=items=>({room,items,plinths:[{id:'c',automatic:true,members:[],excluded_members:[]}],wallPanels:[structuredClone(panel)]});
const backs=s=>automaticPanelSegments(s,s.wallPanels[0]);
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function bounds(p){const b=p.parts[0],center=rotateXZ(b.position.x,b.position.z,p.rotation),swap=p.rotation%180!==0;return {x:p.position.x+center.x,z:p.position.z+center.z,dx:(swap?b.size.z:b.size.x)/2,dz:(swap?b.size.x:b.size.z)/2,y:p.position.y,h:b.size.y};}
test('Automatic strips grow, resize, split, remove, and include future cabinets without changing saved settings',()=>{
 const a=item(),b=item({x:600}),s=state([a]),settings=JSON.stringify([s.plinths,s.wallPanels]);
 assert.deepEqual(backs(s).map(p=>p.length),[600]);assert.equal(A.plans(s).length,1);
 s.items.push(b);assert.deepEqual(backs(s).map(p=>p.length),[1200]);assert.equal(A.plans(s).length,1);assert.equal(A.plans(s)[0].width,1200);
 b.width=800;b.x=700;assert.equal(backs(s)[0].length,1400);assert.equal(A.plans(s)[0].width,1400);
 b.x=1600;assert.deepEqual(backs(s).map(p=>p.length),[600,800]);assert.equal(A.plans(s).length,2);
 s.items=[];assert.deepEqual(backs(s),[]);assert.deepEqual(A.plans(s),[]);assert.equal(JSON.stringify([s.plinths,s.wallPanels]),settings);
});
test('Per-module exclusions cut gaps; disabled worktop suppresses backsplash but not plinth',()=>{
 const s=state([item({x:-600}),item(),item({x:600})]),id=s.items[1].item_id;
 s.wallPanels[0].excluded_members=[id];s.plinths[0].excluded_members=[id];
 assert.deepEqual(backs(s).map(p=>p.length),[600,600]);assert.equal(A.plans(s).length,2);
 s.wallPanels[0].excluded_members=[];s.plinths[0].excluded_members=[];s.items[1].countertopEnabled=false;
 assert.deepEqual(backs(s).map(p=>p.length),[600,600]);assert.equal(A.plans(s).length,1);
});
for(const side of ['left','right'])for(const rotation of [0,90,180,270])test(`Automatic ${side} corner at ${rotation}: full back, exact native boards, no overlap`,()=>{
 const a={...corner(side),rotation},b=cornerReturnPlacement(a,item()),s=state([a,b]),segments=backs(s),plans=A.plans(s);
 assert.equal(segments.length,2);assert.ok(segments.every(p=>p.bottom===858));assert.equal(plans.length,2);assert.ok(plans.every(p=>!p.error));
 const tops=kitchenRuns(s.items,room).flatMap(r=>r.parts.filter(p=>p.role==='counter'));
 assert.ok(segments.some(p=>p.length>=a.width));assert.ok(segments.every(p=>p.length>=594));
 const native=A.nativeItems(s);assert.equal(native.length,plans.length);
 for(const [i,p]of plans.entries()){assert.equal(p.parts.length,1);assert.equal(p.parts[0].size.y,97);assert.equal(p.parts[0].thickness,18);assert.deepEqual(native[i].position,p.position);assert.equal(native[i].target.width,p.width);}
 const boxes=plans.map(bounds);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
  const x=boxes[i],y=boxes[j];const dx=Math.min(x.x+x.dx,y.x+y.dx)-Math.max(x.x-x.dx,y.x-y.dx),dz=Math.min(x.z+x.dz,y.z+y.dz)-Math.max(x.z-x.dz,y.z-y.dz);assert.ok(dx<.001||dz<.001,`Overlapping plinths ${i}, ${j}: ${dx} × ${dz}`);
 }
 const eu=state(s.items.map(it=>({...it,countertopJoint:'euro'})));assert.deepEqual(backs(eu),segments);
});
test('Unequal U returns retain lengths, butt once, and split when middle is removed',()=>{
 const left={...corner('left'),x:-1000},right={...corner('right'),x:1000},middle=item({width:1000},'bazis.3079d0656398');
 const s=state([left,middle,right,cornerReturnPlacement(left,item()),cornerReturnPlacement(right,item({width:900}))]);
 const seg=backs(s);assert.equal(seg.length,3);assert.notEqual(seg[1].length,seg[2].length);assert.equal(A.plans(s).length,3);
 s.items.splice(1,1);assert.equal(backs(s).length,4);assert.ok(A.plans(s).every(p=>!p.error));
});
test('Stock seams and material seams do not split the backsplash; plinth materials and heights remain separate',()=>{
 const s=state(Array.from({length:8},(_,i)=>item({x:i*600,plinthMaterialId:i<4?'wood':'white'})));
 assert.equal(backs(s).length,1);assert.equal(backs(s)[0].length,4800);
 const plans=A.plans(s,id=>({name:id}));assert.equal(plans.length,2);assert.deepEqual(plans.slice(0,2).map(p=>p.material_id),['wood','white']);
 s.items[0].height=870;s.items[0].legHeightMm=150;s.items[0].base_height=150;
 assert.deepEqual(backs(s).map(p=>p.bottom).sort(),[858,908]);assert.ok(A.plans(s).some(p=>p.parts[0].size.y===147));
});
test('Manual plinth rows keep priority without duplicated boards; automatic material override survives export',()=>{
 const s=state([item(),item({x:600})]);s.plinths[0].material_id='green';
 assert.ok(A.nativeItems(s,id=>({name:id})).every(p=>p.material_assignments.body.name==='green'));
 s.plinths.push({id:'manual',members:s.items.map(i=>i.item_id),shape:'straight',inset:40});assert.equal(A.plans(s).length,1);assert.equal(A.plans(s)[0].id,'manual');
});
test('Saved settings, history, schedule and socket finished face follow the same resolved geometry',()=>{
 let s=state([item({z:-4695})]);const original=JSON.parse(JSON.stringify(s)),adapter={snapshot:()=>({name:'QA',scene:s}),restore:v=>{s=structuredClone(v.scene);}};const history=new History(adapter);
 history.run('Move',()=>{s.items[0].width=800;s.items[0].x=100;});assert.equal(allSegments(s)[0].length,800);history.undo();assert.deepEqual(s,original);history.redo();assert.equal(allSegments(s)[0].length,800);
 const seg=allSegments(s)[0];assert.equal(seg.z,-5000);assert.equal(surfaceOffset(allSegments(s),{x:0,z:-5000},{x:0,z:1},86,1100,86),6);
 const schedule=finishSchedule(JSON.parse(JSON.stringify(s)));assert.equal(schedule.panels[0].parts[0].width,800);assert.equal(schedule.panels[0].native_import,true);assert.match(finishText(s),/800 × 600 × 6/);
 s.wallPanels[0].height=2000;s.room={...room,height:2700};assert.match(resolvedFinishError(resolvedPanels(s)[0],s.room),/потолка/);assert.equal(allSegments(s).length,0);
});
test('Actual mesh rebuilds after moving and resizing cabinets, without editing panel settings',()=>{
 const s=state([item()]),scene={adapter:{state:s,room,material:()=>null},scene:new THREE.Scene(),renderer:{shadowMap:{}},factory:{},mode:'3d',camera:{position:new THREE.Vector3(2,2,2)}};
 const mesh=new WallFinishMesh(scene);mesh.sync();const first=mesh.root.children[0];assert.equal(first.children[0].geometry.parameters.width,.6);
 s.items[0].width=900;s.items[0].x=200;mesh.sync();assert.notEqual(mesh.root.children[0],first);close(mesh.root.children[0].children[0].geometry.parameters.width,.9);mesh.dispose();
});
