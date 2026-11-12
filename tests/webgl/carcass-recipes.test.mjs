import test from 'node:test';
import assert from 'node:assert/strict';
import {CARCASSES,buildCarcass,placeCarcass,insertCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {carcassSVG} from '../../backend/v2/cabinet_assets/planner/carcass-ui.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {resolveBlankBindings} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
import {bounds} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {cuttingSize,blanksCSV,updateBlank} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
const room={width:6000,depth:5000,height:4000,setup_complete:true};
function setup(items=[]){
 let state={room,items,selected_item_id:null};
 const adapter=new StateAdapter({supportsElevation:true,state:()=>state,
 selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),select:id=>{state.selected_item_id=id;},refresh(){},material:()=>null,
 snapshot:()=>({scene:structuredClone(state)}),restore:v=>{state=structuredClone(v.scene);}});
 return {adapter,history:new History(adapter)};
}
for(const r of CARCASSES)for(const rotation of [0,90,180,270])test(`${r.id} ${rotation}: fitted boards, bindings, save roundtrip, PVC and native source`,()=>{
 const built=buildCarcass({recipe:r.id}),items=placeCarcass(built,{x:200,z:300,elevation_mm:100,rotation});
 const {adapter,history}=setup();
 history.run('Корпус',()=>insertCarcass(adapter,items));
 for(const i of items){assert.equal(adapter.validate(i,items),'',i.name);assert.deepEqual(resolveBlankBindings(items).find(p=>p.item_id===i.item_id),i);
   const native=blankNativeItem(i,{name:i.blank_thickness_mm===3?'ХДФ':'ЛДСП',thickness:i.blank_thickness_mm});
   assert.equal(native.blank.edge_code,i.blank_edge_code);assert.deepEqual(native.blank.cut,cuttingSize(i));assert.ok(native.source_sha256);
 }
 assert.equal(adapter.items.length,built.items.length);history.undo();assert.equal(adapter.items.length,0);history.redo();
 adapter.restore(JSON.parse(JSON.stringify(adapter.snapshot())));assert.equal(adapter.items.length,built.items.length);
 const boxes=items.map(i=>bounds(i,room)),range=k=>Math.max(...boxes.map(b=>b['max'+k]))-Math.min(...boxes.map(b=>b['min'+k]));
 assert.equal(range('X'),rotation%180?built.depth:built.width);assert.equal(range('Z'),rotation%180?built.width:built.depth);assert.equal(range('Y'),built.height);
 assert.ok(blanksCSV(items).includes('Распил'));assert.ok(!carcassSVG(built).includes('NaN'));
});
test('base and sink retain full-width bottom; wall panels fit between full-height sides',()=>{
 for(const recipe of ['base','sink','wall']){
  const b=buildCarcass({recipe}),part=k=>b.parts.find(p=>p.key===k).item;
  assert.equal(part('bottom').width,recipe==='wall'?564:600);
  assert.equal(part('left').height,recipe==='wall'?720:702);
  assert.equal(part('left').elevation_mm,recipe==='wall'?0:18);
  if(recipe==='base'){assert.equal(part('rail-front').depth,80);assert.equal(part('rail-front').height,18);}
  if(recipe==='sink'){assert.equal(b.items.length,6);assert.equal(part('rail-front').height,80);assert.equal(part('rail-rear-lower').elevation_mm,18);assert.ok(b.items.every(i=>i.blank_edge_code==='0000'));}
 }
 const cap=buildCarcass({recipe:'cap'});assert.equal(cap.parts.find(p=>p.key==='top').item.width,600);
 assert.equal(cap.parts.find(p=>p.key==='top').item.blank_edge_code,'1111');
});
test('odd division widths and all editable thicknesses fit without intersections',()=>{
 for(const thickness of [10,16,18,19,25,40])for(const sections of [1,2,3]){
  const b=buildCarcass({recipe:'divided',width:1001,sections,thickness}),{adapter}=setup();
  for(const i of b.items)assert.equal(adapter.validate(i,b.items),'',i.name);
 }
});
test('manual PVC survives size changes, native export and cutting calculation',()=>{
 const edges={left:'1011',bottom:'1111','shelf-0-0':'0101'};
 const b=buildCarcass({recipe:'shelves',width:800,edgeThickness:2},{edges});
 for(const [key,code] of Object.entries(edges))assert.equal(b.parts.find(p=>p.key===key).item.blank_edge_code,code);
 assert.deepEqual(cuttingSize(b.parts.find(p=>p.key==='bottom').item),{length:760,width:573});
 const shelf=b.parts.find(p=>p.key==='shelf-0-0').item,right=b.parts.find(p=>p.key==='right').item;
 const updated=resolveBlankBindings(b.items.map(i=>i===right?{...right,x:right.x+100}:i));
 assert.equal(updated.find(i=>i.item_id===shelf.item_id).blank_length_mm,shelf.blank_length_mm+100);
});
test('invalid sizes and overfilled layouts fail before placement',()=>{
 for(const patch of [{width:0},{height:NaN},{depth:Infinity},{sections:4},{shelves:1.5},{height:200,shelves:10},{width:200,sections:3},{recipe:'sink',back:true},{recipe:'sink',shelves:1},{recipe:'cap',sections:2}])assert.throws(()=>buildCarcass(patch));
 const {adapter}=setup(buildCarcass({recipe:'shelves'}).items),before=structuredClone(adapter.items);
 assert.throws(()=>insertCarcass(adapter,buildCarcass({recipe:'wall'}).items),/Пересечение/);assert.deepEqual(adapter.items,before);
 const crowded=setup(Array.from({length:99},(_,i)=>({...before[0],item_id:String(i)}))).adapter;
 assert.throws(()=>insertCarcass(crowded,buildCarcass().items),/100/);assert.equal(crowded.items.length,99);
});
