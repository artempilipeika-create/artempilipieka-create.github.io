import test from 'node:test';
import assert from 'node:assert/strict';
import {kitchenFields,kitchenSpec,kitchenHinges,kitchenRails,kitchenModels} from '../../backend/v2/cabinet_assets/planner/ai-kitchen.mjs';
import {prepareAssistantPlan,applyAssistantPlan} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {kitchenMaterials,kitchenRow,lowerMembers,standardFields,saveKitchen} from '../../backend/v2/cabinet_assets/planner/ai-kitchen-project.mjs';
import {selectedCarcass} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {kitchenFeet,isVitrine} from '../../backend/v2/cabinet_assets/planner/ai-kitchen.mjs';
import {fixturePlans} from '../../backend/v2/cabinet_assets/planner/worktop-fixtures.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
import {kitchenRuns} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';

function project(){
 const state={room:{width:5000,height:2700,depth:3600,setup_complete:true},items:[]};
 return new StateAdapter({supportsElevation:true,state:()=>state,projectId:()=>null,
  selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),
  select:id=>{state.selected_item_id=id;},refresh(){},material:()=>null});
}
function assemble(adapter,id,fields,action='create'){
 const plan=prepareAssistantPlan(adapter,{action,spec:kitchenSpec(fields)},{id,cabinetName:id});
 applyAssistantPlan(adapter,plan);
 return plan.items;
}
test('each kitchen cabinet supports zero to three removable shelves with the correct material and fittings',()=>{
 for(const model of kitchenModels)for(let shelves=0;shelves<=(model.id==='base-sink'?0:3);shelves++){
  const fields={...kitchenFields(model.id),shelves,swing:'pair',width:800};
  const spec=kitchenSpec(fields),built=buildCarcass(spec,{idPrefix:'cabinet'});
  const boards=built.items.filter(it=>it.item_id.includes(':shelf-'));
  assert.equal(boards.length,shelves);
  assert.ok(boards.every(p=>isVitrine(model.id)?p.blank_shelf==='4/48846'&&p.blank_thickness_mm===4:p.blank_thickness_mm===18));
  assert.equal(built.hingeLocations.length,4);
  assert.equal(built.hingeConflicts.length,0);
  assert.equal(kitchenFields(model.id,spec).hinge,fields.hinge);
 }
});
test('door compatibility, handedness and hinge SKU survive a round trip',()=>{
 for(const m of kitchenModels)for(const hinge of kitchenHinges(m.id)){
  const f={...kitchenFields(m.id),swing:'right',hinge:hinge.article};
  const s=kitchenSpec(f),built=buildCarcass(s,{idPrefix:'model'});
  assert.equal(s.front.hinges['door-right'].article,hinge.article);
  assert.equal(kitchenFields(m.id,s).swing,'right');
  assert.ok(built.items.some(p=>p.item_id==='model:door-right'));
 }
 const base=kitchenFields('base-swing');
 assert.throws(()=>kitchenSpec({...base,width:601}),/две двери/);
 assert.throws(()=>kitchenSpec({...base,width:1201,swing:'pair'}),/1200/);
 assert.throws(()=>kitchenSpec({...base,hinge:'71B950A'}),/совместимую/);
});
test('neighboring bases share a 38 × 600 worktop and editing one cabinet preserves the other groups',()=>{
 const a=project(),f=kitchenFields('base-swing');
 const first=assemble(a,'base1',f),second=assemble(a,'base2',f);
 const upper=assemble(a,'upper',kitchenFields('wall-swing')),vitrine=assemble(a,'vitrine',kitchenFields('wall-vitrine'));
 const at=parts=>parts[0].assistant_carcass.position;
 assert.equal(at(second).x-at(first).x,600);assert.equal(at(second).z,at(first).z);
 assert.equal(at(upper).x,at(first).x);assert.equal(at(vitrine).x-at(upper).x,600);
 const runs=kitchenRuns(a.items,a.room);
 assert.equal(runs.length,1);
 const [counter]=runs[0].parts;assert.deepEqual(counter.size,{x:1200,y:38,z:600});
 assert.equal(counter.position.y,839);
 assert.equal(runs[0].position.z,-a.room.depth/2);
 assert.equal(runs[0].parts.length,1);
 const collected=structuredClone(a.items.filter(p=>p.assistant_carcass.group_id!=='base1'));
 a.select(first[0].item_id);
 const updated=assemble(a,'base1',{...f,shelves:3,swing:'right',hinge:'71B3550'},'update');
 assert.equal(updated.filter(p=>p.item_id.includes(':shelf-')).length,3);
 assert.deepEqual(a.items.filter(p=>p.assistant_carcass.group_id!=='base1'),collected);
 assert.ok(updated.every(p=>p.module_type==='blank'&&!p.bazis_file&&!p.bazis_sha256));
 const joints=nativeCarcassJoints(updated);
 for(const k of ['rail-front','rail-rear'])assert.equal(joints.filter(j=>j.joined_panel_id==='base1:'+k).length,4);
});

test('all kitchen rail pull SKUs persist in both orientations with mirrored two-door placement',()=>{
 for(const [handle] of kitchenRails)for(const orientation of ['horizontal','vertical']){
  const f={...kitchenFields('base-swing'),width:1200,height:1100,swing:'pair',handle,orientation};
  const spec=kitchenSpec(f),fields=kitchenFields('base-swing',spec);
  assert.equal(fields.handle,handle);assert.equal(fields.orientation,orientation);
  const l=spec.front.handles['door-left'],r=spec.front.handles['door-right'];
  assert.deepEqual([l.edge,r.edge],orientation==='vertical'?['right','left']:['top','top']);
 }
});

test('source standards, mixed shelf construction and full-height light share the same machining',()=>{
 const parts=id=>buildCarcass(kitchenSpec(kitchenFields(id)),{idPrefix:id}).parts;
 const board=(p,k)=>p.find(x=>x.key===k).item;
 const lower=parts('base-swing'),upper=parts('wall-swing'),v=parts('wall-vitrine');
 assert.deepEqual([board(lower,'shelf-0-0').width,board(lower,'shelf-0-0').depth,board(lower,'back').width,board(lower,'back').height],[564,509,596,716]);
 assert.deepEqual([board(upper,'shelf-0-0').width,board(upper,'shelf-0-0').depth],[562,317]);
 assert.deepEqual([board(v,'shelf-0-0').width,board(v,'shelf-0-0').depth,board(v,'shelf-0-0').height],[556,316,4]);
 for(const side of ['left','right']){const p=board(v,side),op=p.blank_machining[0];assert.equal(op.start,9);assert.equal(op.end??0,0);assert.equal(p.blank_length_mm-op.start,711);assert.equal(op.offset+op.width/2,158.5);}
 const f=kitchenFields('base-vitrine');f.shelfChoices=['board/confirmat','6/48846','board/cam_dowel'];f.shelves=3;f.lightAxis=61;f.lightStart=7;f.lightEnd=0;
 const b=buildCarcass(kitchenSpec(f),{idPrefix:'m'});assert.deepEqual(b.parts.filter(p=>p.key.startsWith('shelf')).map(p=>p.item.blank_thickness_mm),[18,6,18]);
 assert.equal(b.parts[0].item.blank_machining[0].offset+8.75,61);
 assert.deepEqual(new Set(kitchenFeet.filter(p=>p.category==='plinth').map(p=>p.height)),new Set([60,100,120,150]));
 assert.ok(kitchenFeet.every(p=>p.height!==80));
});
test('a standard sink, selectable installed heights and per-panel materials survive rebuilds',()=>{
 const a=project(),add=id=>saveKitchen(a,{fields:standardFields(a,id)}),one=add('base-swing'),two=add('base-sink'),three=add('base-vitrine');
 const members=lowerMembers(a.items);assert.deepEqual(kitchenRow(members,one).map(c=>c.id),[one,two,three]);
 const sink=a.items.filter(p=>p.assistant_carcass.group_id===two);
 assert.equal(sink.filter(p=>p.item_id.includes(':rail-')&&p.blank_axis==='back').length,3);
 assert.ok(!sink.some(p=>p.item_id.endsWith(':back')));
 assert.equal(nativeCarcassJoints(sink).filter(p=>p.joined_panel_id.includes(':rail-')).length,6);
 assert.equal(fixturePlans(a.items,a.room)[0].y,858);
 const cfg=id=>{a.select(id+':left');const current=selectedCarcass(a),fields=kitchenFields(current.metadata.spec.kitchenModel,current.metadata.spec);fields.materials=kitchenMaterials(current);return {fields,current};};
 const upper=add('wall-vitrine');
 const entry=cfg(one);entry.fields.height=800;
 const custom='91518079-f405-4256-984c-c6a256c16960',global='178978ec-3e85-4938-9472-b14df7c0dc65';
 entry.fields.materials.parts.left=custom;saveKitchen(a,{...entry,heightIds:[one,two,three]});
 assert.equal(fixturePlans(a.items,a.room)[0].y,938);
 assert.equal(a.items.find(i=>i.item_id===upper+':left').assistant_carcass.spec.elevation,1538);
 const other=cfg(three);other.fields.materials.body=global;saveKitchen(a,{...other,wholeKitchen:true,materialRoles:['body']});
 assert.equal(a.items.find(i=>i.item_id===one+':left').body_variant_id,custom);
 assert.equal(a.items.find(i=>i.item_id===one+':right').body_variant_id,global);
 assert.equal(a.items.find(i=>i.item_id===three+':shelf-0-0').body_variant_id,null);
 const end=cfg(two);end.fields.feet='86505';end.fields.height=840;saveKitchen(a,end);
 assert.ok(lowerMembers(a.items).every(p=>p.height===900));assert.equal(standardFields(a,'wall-swing').elevation,1538);
 const before=structuredClone(a.items),invalid=cfg(one);invalid.fields.width=730;
 assert.throws(()=>saveKitchen(a,invalid),/две двери/);assert.deepEqual(a.items,before);
});

test('project shelf fixings update board machining, preserve glass and accept later cabinet exceptions',()=>{
 const a=project();
 const add=(id,params={})=>saveKitchen(a,{fields:{...standardFields(a,id),...params}});
 const base=add('base-swing',{shelves:2}),wall=add('wall-swing');
 const mixed=add('wall-vitrine',{shelfChoices:['board/confirmat','8/80936']});
 const sink=add('base-sink'),empty=add('base-swing',{shelves:0});
 const part=(id,key)=>a.items.find(it=>it.item_id===id+':'+key);
 const savedSink=structuredClone(a.items.filter(it=>it.assistant_carcass.group_id===sink));
 const edit=id=>{
  a.select(id+':left');
  const current=selectedCarcass(a);
  return {current,fields:kitchenFields(current.metadata.spec.kitchenModel,current.metadata.spec,a.state.kitchenShelfFixing)};
 };
 const savedGlass=part(mixed,'shelf-0-1'),beforePosition=structuredClone(savedGlass.assistant_carcass.position);
 const custom='91518079-f405-4256-984c-c6a256c16960';
 part(mixed,'right').body_variant_id=custom;
 part(mixed,'shelf-0-0').production_note='Сохранить подпись';
 saveKitchen(a,{...edit(wall),projectFixing:'cam_dowel'});
 for(const id of [base,wall,mixed]){
  const shelf=part(id,'shelf-0-0');
  assert.equal(shelf.blank_shelf,'board/cam_dowel');
  const hardware=nativeCarcassJoints(a.items.filter(it=>it.assistant_carcass.group_id===id)).filter(x=>x.joined_panel_id===shelf.item_id);
  assert.equal(hardware.filter(it=>it.joint_part==='cam').length,4);
  assert.equal(hardware.filter(it=>it.joint_part==='dowel').length,4);
 }
 assert.deepEqual(a.items.filter(it=>it.assistant_carcass.group_id===sink),savedSink);
 assert.equal(part(mixed,'shelf-0-1').blank_shelf,'8/80936');assert.equal(part(mixed,'shelf-0-1').height,savedGlass.height);
 assert.deepEqual(part(mixed,'left').assistant_carcass.position,beforePosition);
 assert.equal(part(mixed,'right').body_variant_id,custom);assert.equal(part(mixed,'shelf-0-0').production_note,'Сохранить подпись');
 assert.equal(edit(empty).fields.shelfChoices[0],'board/cam_dowel');
 assert.equal(a.state.kitchenShelfFixing,'cam_dowel');assert.equal(standardFields(a,'base-swing').shelfChoices[1],'board/cam_dowel');
 const local=edit(base);local.fields.shelfChoices[0]='board/95388';saveKitchen(a,local);
 assert.equal(part(base,'shelf-0-0').blank_binding.mounting,'sekura-95388');assert.equal(part(base,'shelf-0-1').blank_shelf,'board/cam_dowel');
 assert.equal(part(wall,'shelf-0-0').blank_shelf,'board/cam_dowel');
 assert.equal(part(add('wall-swing'),'shelf-0-0').blank_shelf,'board/cam_dowel');
});

test('a failure on a shallow neighbour leaves the whole project and default unchanged',()=>{
 const a=project(),add=(id,params)=>saveKitchen(a,{fields:{...standardFields(a,id),...params}});
 const base=add('base-swing',{});add('wall-swing',{depth:210});
 a.select(base+':left');
 const current=selectedCarcass(a),fields=kitchenFields('base-swing',current.metadata.spec),before=structuredClone(a.state);
 assert.throws(()=>saveKitchen(a,{fields,current,projectFixing:'cam_dowel'}),/глубин/);
 assert.deepEqual(a.state,before);
});
