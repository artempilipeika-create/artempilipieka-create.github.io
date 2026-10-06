import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_PRODUCTION,normalizeKitchen,kitchenSettings,kitchenRuns,kitchenLegs,productionParts,dimensionPatch,heights,facadeCells,rotateXZ,placementError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {snapItem,findSpace} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {Box3} from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
const room={width:6200,depth:3600,height:2700},ids=Object.keys(PILOT_PRODUCTION);
const item=(id=ids[0],changes={})=>normalizeKitchen({item_id:id,bazis_id:id,bazis_sha256:PILOT_PRODUCTION[id].source_sha256,module_type:'base_cabinet',name:PILOT_PRODUCTION[id].label,width:600,height:820,depth:510,base_height:100,body_height:720,base:'plinth',layout:'doors',handles:'handles',x:0,z:-1495,rotation:0,shelves:structuredClone(PILOT_PRODUCTION[id].shelves),...changes});
const row=()=>[item(ids[0],{x:-600}),item(ids[2]),item(ids[1],{x:600})];
const parts=it=>productionParts(it,{production:PILOT_PRODUCTION[it.bazis_id]});
for(const id of ids)test(PILOT_PRODUCTION[id].label+': horizontal rails have the right blank, axes and top/rear/front positions',()=>{
 const rails=parts(item(id)).filter(p=>p.key.startsWith('rail-'));
 assert.equal(rails.length,2);
 for(const [i,p]of rails.entries()){
  assert.deepEqual(p.size,{x:564,y:18,z:80});assert.deepEqual(p.orientation,{length_axis:'z',width_axis:'x',thickness_axis:'y'});
  assert.equal(p.length,80);assert.equal(p.width,564);assert.equal(p.thickness,18);
  assert.deepEqual(p.position,{x:0,y:811,z:(i?1:-1)*215});
 }
});
for(const [id,heights,boxHeights,sha,file]of [
 ['bazis.39f282e08f0c',[357,357],[300,300],'f5f5c16f716ba2716f829ba6860768ce09667e540a7135265dc6f182a7fc24b2','НМРШ2-600.З.С 3мм Гвозди Шариковые напр с довод.(1).fr3d'],
 ['bazis.5f5697e39e27',[357,178,178],[300,121,121],'f1db2bfd1400b00c073ec4fc3598412fbf4532bde75d11968ae1beabda6e1ac0','НМРШ3-600.З.С 3мм Гвозди Шариковые напр с довод.(1).fr3d']
])test(PILOT_PRODUCTION[id].label+': exact donor facades, drawer boxes and soft-close hardware',()=>{
 const p=PILOT_PRODUCTION[id],it=item(id,{layout:'drawers',drawers:heights.length}),cells=facadeCells(it,{production:p}),bom=parts(it);
 assert.equal(p.source_sha256,sha);assert.equal(p.source_file,file);assert.equal(p.hardware.drawer_system,'AKS');
 assert.equal(p.hardware.slide_type,'ball_bearing_soft_close');assert.equal(p.hardware.drawer_count,heights.length);
 assert.deepEqual(cells.map(c=>[c.w,c.h]),heights.map(h=>[597,h]));
 assert.deepEqual(bom.filter(x=>x.role==='front').map(x=>[x.length,x.width]),heights.map(h=>[h,597]));
 assert.deepEqual(bom.filter(x=>x.name==='ЗАДНЯЯ ШУФ').map(x=>[x.length,x.width]),boxHeights.map(h=>[h,501]));
 assert.deepEqual(bom.filter(x=>x.name==='Фронтальная ШУФ').map(x=>[x.length,x.width]),boxHeights.map(h=>[h,501]));
 assert.deepEqual(bom.filter(x=>x.name==='Боковая напр.P').map(x=>[x.length,x.width]),boxHeights.map(h=>[h,500]));
 assert.deepEqual(bom.filter(x=>x.name==='Боковая напр.L').map(x=>[x.length,x.width]),boxHeights.map(h=>[h,500]));
 assert.deepEqual(bom.filter(x=>x.name==='З.С').map(x=>[x.length,x.width]),boxHeights.map(()=>[533,496]));
 assert.ok(bom.filter(x=>x.role==='body').every(x=>x.material.name==='ЛДСП- БЕЛЫЙ'));
 assert.ok(bom.filter(x=>x.role==='front').every(x=>x.material.name==='Evagloss P004'));
 assert.ok(bom.filter(x=>x.name==='ЗАДНЯЯ ШУФ'||x.name==='Фронтальная ШУФ'||x.name.startsWith('Боковая напр.')).every(x=>x.material.name==='ЛДСП- БЕЛЫЙ'));
 assert.ok(bom.filter(x=>x.name==='З.С').every(x=>x.material.name==='ЛХДФ 3ММ Белый'));
});
for(const leg of [80,100,150])test('Leg '+leg+' shifts every cabinet panel without stretching any body/front/shelf/back/rail',()=>{
 for(const id of ids){const before=item(id),after=dimensionPatch(before,{legHeightMm:leg}),a=parts(before),b=parts(after);
  assert.equal(heights(after).body_height,720);assert.equal(after.height,720+leg);assert.equal(after.base_height,leg);
  for(let i=0;i<a.length;i++){assert.deepEqual(a[i].size,b[i].size);assert.equal(b[i].position.y-a[i].position.y,leg-100);}
  assert.ok(kitchenLegs(after).every(x=>x.height===leg&&x.position.y===leg/2));
  assert.deepEqual(kitchenSettings(JSON.parse(JSON.stringify(after))),kitchenSettings(after));
 }
 const run=kitchenRuns(row().map(it=>dimensionPatch(it,{legHeightMm:leg})),room)[0];
 assert.ok(run.parts.filter(p=>p.role==='plinth').every(p=>p.size.y===leg));
 assert.equal(run.parts.find(p=>p.role==='counter').position.y,720+leg+19);
});
for(const rotation of [0,90,180,270])test('Continuous row and wall service gap at '+rotation+' degrees',()=>{
 const wall=rotation%180?room.width/2:room.depth/2;
 const items=row().map(it=>({...it,rotation,...rotateXZ(it.x,-wall+305,rotation)}));
 const runs=kitchenRuns(items,room);assert.equal(runs.length,1);const run=runs[0];
 assert.equal(run.countertopActualLengthMm,1800);assert.equal(run.countertopStockLengthMm,4100);
 assert.equal(run.parts.filter(p=>p.role==='counter').length,1);assert.equal(run.parts.filter(p=>p.role==='plinth').length,3);
 assert.deepEqual(run.parts[0].size,{x:1800,y:38,z:600});
 const f=new MeshFactory({room,template:it=>({production:PILOT_PRODUCTION[it.bazis_id]}),material:()=>null},()=>{}),g=f.dress(items);g.updateMatrixWorld(true);
 assert.equal(g.children.length,1);const b=new Box3().setFromObject(g.children[0].children.find(x=>x.userData.role==='counter'));
 const n=rotateXZ(0,1,rotation),axis=rotation%180?'x':'z',back=n[axis]>0?b.min[axis]:-b.max[axis];assert.ok(Math.abs(back+wall/1000)<1e-7);
 const raw={...items[1],x:items[1].x+n.x*20,z:items[1].z+n.z*20};
 const snap=snapItem(raw,items,room,{threshold:45});assert.equal(snap.error,'');assert.equal(snap.item.x,items[1].x);assert.equal(snap.item.z,items[1].z);
 assert.ok(snap.guides.some(g=>g.text.includes('столешницы')));assert.ok(items.every(it=>!placementError({...it,doors_open:true},items,room)));f.dispose();
});
test('Adding, removing, resizing, moving and snapping rebuild only actual contiguous runs',()=>{
 const items=row();assert.equal(kitchenRuns(items,room)[0].countertopActualLengthMm,1800);
 assert.equal(kitchenRuns(items.slice(0,2),room)[0].countertopActualLengthMm,1200);
 const moved=items.map((it,i)=>i===2?{...it,x:850}:it);assert.equal(kitchenRuns(moved,room).length,2);
 const snapped=snapItem({...moved[2],x:625},moved,room);moved[2]=snapped.item;assert.equal(kitchenRuns(moved,room).length,1);
 const resized=items.map((it,i)=>i===2?dimensionPatch(it,{width:800,x:700}):it);assert.equal(kitchenRuns(resized,room)[0].countertopActualLengthMm,2000);
 const first=findSpace(item(),[],room,null);assert.equal(first.z,-1495);assert.equal(first.x,-2800);
 const added=findSpace(item(ids[2]),[first],room,first);assert.equal(added.z,first.z);assert.equal(added.x,-2200);
});
test('General overhang formula, stock length is never substituted for row length',()=>{
 for(const depth of [450,510,530,610])for(const rearServiceGapMm of [50,60,80]){
  const it=item(ids[0],{depth,rearServiceGapMm});assert.equal(kitchenSettings(it).frontOverhangMm,600-50-depth);
 }
 const long=Array.from({length:8},(_,i)=>item(ids[i%3],{item_id:'long-'+i,x:i*600,z:0}));
 const run=kitchenRuns(long,room)[0];assert.equal(run.countertopActualLengthMm,4800);assert.equal(run.countertopStockLengthMm,4100);
 const tops=run.parts.filter(p=>p.role==='counter');
 assert.deepEqual(tops.map(p=>p.length),[4100,700]);
 assert.equal(tops.reduce((sum,p)=>sum+p.length,0),run.countertopActualLengthMm);
 assert.equal(tops[0].position.x+tops[0].size.x/2,tops[1].position.x-tops[1].size.x/2);
 assert.ok(tops.every(p=>p.length<=run.countertopStockLengthMm));
});
test('Independent decors produce adjacent finish sections with no overlapping countertops',()=>{
 const items=row().map((it,i)=>({...it,body_variant_id:'body',front_variant_id:'front',countertopMaterialId:i===1?'stone-B':'stone-A',plinthMaterialId:'plinth'}));
 const run=kitchenRuns(items,room,id=>({article:id,name:id}))[0];const tops=run.parts.filter(p=>p.role==='counter');
 assert.equal(tops.length,3);assert.equal(tops.reduce((n,p)=>n+p.length,0),1800);
 assert.deepEqual(tops.map(p=>p.material.article),['stone-A','stone-B','stone-A']);
 for(let i=1;i<tops.length;i++)assert.equal(tops[i-1].position.x+tops[i-1].size.x/2,tops[i].position.x-tops[i].size.x/2);
 assert.equal(run.parts.filter(p=>p.role==='plinth'&&p.size.x===1800).length,1);
 const uniform=items.map(it=>({...it,countertopMaterialId:'stone'}));assert.equal(kitchenRuns(uniform,room)[0].parts.filter(p=>p.role==='counter').length,1);
 assert.deepEqual(items.map(it=>[it.body_variant_id,it.front_variant_id]),Array(3).fill(['body','front']));
});
test('Old donor hashes do not silently acquire pilot construction or kitchen parameters',()=>{
 const old={...item(),bazis_sha256:'a'.repeat(64)};assert.equal(kitchenSettings(old),null);assert.deepEqual(kitchenRuns([old],room),[]);
});
test('Old flush pilot projects gain service space once; saved/free-standing coordinates stay unchanged',()=>{
 for(const rotation of [0,90,180,270]){
  const wall=rotation%180?room.width/2:room.depth/2,it=item(ids[0],{rotation,...rotateXZ(0,-wall+255,rotation)});delete it.rearServiceGapMm;
  const normalized=normalizeKitchen(it,room),n=rotateXZ(0,1,rotation);
  assert.equal(normalized.x,it.x+n.x*50);assert.equal(normalized.z,it.z+n.z*50);
  assert.deepEqual(normalizeKitchen(normalized,room),normalized);assert.equal(placementError(normalized,[],room),'');
  assert.match(placementError({...it,rearServiceGapMm:60},[],room),/Столешница/);
 }
 const free=item(ids[0],{x:0,z:0});delete free.rearServiceGapMm;assert.equal(normalizeKitchen(free,room).z,0);
});

test('A pilot cannot enter the legacy suspended-base state that cannot be saved with kitchen legs',()=>{
 const it=item(),adapter=new StateAdapter({state:()=>({room,items:[it]}),template:x=>({production:PILOT_PRODUCTION[x.bazis_id]})});
 assert.equal(adapter.validate(it),'');
 assert.match(adapter.validate(dimensionPatch(it,{base:'wall'})),/ножки/);
});
