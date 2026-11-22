import test from 'node:test';
import assert from 'node:assert/strict';
import {kitchenFields,kitchenSpec,kitchenHinges,kitchenRails,kitchenModels} from '../../backend/v2/cabinet_assets/planner/ai-kitchen.mjs';
import {prepareAssistantPlan,applyAssistantPlan} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
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
 for(const model of kitchenModels)for(let shelves=0;shelves<=3;shelves++){
  const fields={...kitchenFields(model.id),shelves,swing:'pair',width:800};
  const spec=kitchenSpec(fields),built=buildCarcass(spec,{idPrefix:'cabinet'});
  const boards=built.items.filter(it=>it.item_id.includes(':shelf-'));
  assert.equal(boards.length,shelves);
  assert.ok(boards.every(p=>model.id==='wall-vitrine'?p.blank_shelf==='6/48846'&&p.blank_thickness_mm===6:p.blank_thickness_mm===18));
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
