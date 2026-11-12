import test from 'node:test';
import assert from 'node:assert/strict';
import {blankItem,updateBlank,blankCopies} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {resolveBlankBindings,worldPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {applyChanges,translateItems} from '../../backend/v2/cabinet_assets/planner/mobility.mjs';

function fixture(rotation=0){
  const left=blankItem({item_id:'left',name:'Левая',blank_axis:'side',blank_length_mm:720,...worldPoint({x:-391,z:0},rotation),rotation});
  const right=blankItem({...left,item_id:'right',name:'Правая',...worldPoint({x:391,z:0},rotation)});
  const shelf=blankItem({item_id:'shelf',name:'Полка',elevation_mm:300,rotation,blank_binding:{left_id:'left',right_id:'right',gap_left_mm:0,gap_right_mm:0,depth_offset_mm:0}});
  return resolveBlankBindings([left,right,shelf]);
}
function project(){
  let state={room:{width:4200,depth:3200,height:2700},items:fixture(),selected_item_id:'shelf'};
  const adapter=new StateAdapter({supportsElevation:true,state:()=>state,selected:()=>state.items.find(it=>it.item_id===state.selected_item_id),select:id=>{state.selected_item_id=id;},refresh:()=>{},material:()=>null,
    snapshot:()=>({name:'QA bindings',scene:structuredClone(state)}),restore:value=>{state=structuredClone(value.scene);}});
  return {adapter,history:new History(adapter)};
}
for(const rotation of [0,90,180,270])test('800 mm outside width yields 764 mm shelf, rotation '+rotation,()=>{
  const items=fixture(rotation);assert.equal(items[2].blank_length_mm,764);assert.equal(Math.abs(items[2].x),0);assert.equal(Math.abs(items[2].z),0);
  const shelf={...items[2],blank_binding:{...items[2].blank_binding,gap_left_mm:1,gap_right_mm:3}};
  const next=resolveBlankBindings([...items.slice(0,2),shelf]);assert.equal(next[2].width,760);
  assert.deepEqual({x:next[2].x,z:next[2].z},worldPoint({x:-1,z:0},rotation));
});
test('support edits recompute shelf atomically, with undo, redo and saved relationships',()=>{
  const {adapter:a,history:h}=project();
  h.run('Widen',()=>a.replace({...a.items[1],x:491}));assert.equal(a.items[2].width,864);assert.equal(a.items[2].x,50);
  h.undo();assert.equal(a.items[2].width,764);assert.equal(a.items[1].x,391);
  h.redo();assert.equal(a.items[2].width,864);
  a.restore(JSON.parse(JSON.stringify(a.snapshot())));
  h.run('Thicker support',()=>a.replace(updateBlank(a.items[0],{blank_thickness_mm:22})));
  assert.equal(a.items[2].width,862);assert.equal(a.items[2].x,51);
  assert.equal(a.items[2].blank_binding.left_id,'left');
  h.run('Translate whole construction',()=>applyChanges(a,translateItems(a.items,100,200)));
  assert.equal(a.items[2].x,151);assert.equal(a.items[2].z,200);
});
test('invalid support movement and deleting an anchor cannot partially mutate the project',()=>{
  const {adapter:a,history:h}=project(),before=JSON.stringify(a.snapshot());
  for(const fn of [()=>a.remove('left'),()=>a.replace({...a.items[1],x:-300}),()=>a.replace({...a.items[1],rotation:90}),()=>a.replace({...a.items[1],z:50})]){
    assert.throws(()=>h.run('Invalid',fn));assert.equal(JSON.stringify(a.snapshot()),before);
  }
  h.run('Detach',()=>a.replace(updateBlank(a.items[2],{blank_binding:null})));
  assert.equal(a.items[2].width,764);h.run('Delete support',()=>a.remove('left'));assert.equal(a.items.length,2);
});
test('dependent shelf collisions reject the entire support edit',()=>{
  const {adapter:a,history:h}=project();
  a.insert(blankItem({item_id:'obstacle',x:650,elevation_mm:300,blank_length_mm:100}));
  const before=JSON.stringify(a.snapshot());
  assert.throws(()=>h.run('Widen into obstacle',()=>a.replace({...a.items[1],x:791})),/Пересечение/);
  assert.equal(JSON.stringify(a.snapshot()),before);
});
test('copies by elevation retain independent bindings; lateral copies detach',()=>{
  const source=fixture()[2],copy=blankCopies(source,1,100,'elevation_mm')[0];
  assert.deepEqual(copy.blank_binding,source.blank_binding);assert.notEqual(copy.blank_binding,source.blank_binding);
  assert.equal(blankCopies(source,1,100,'x')[0].blank_binding,null);
  assert.throws(()=>resolveBlankBindings([...fixture().slice(0,2),{...copy,elevation_mm:710}]),/высоту/);
});
test('missing, same, reversed and self anchors and invalid gaps are rejected',()=>{
  const items=fixture();
  for(const patch of [{left_id:'missing'},{right_id:'left'},{left_id:'right',right_id:'left'},{left_id:'shelf'},{gap_left_mm:-1},{gap_right_mm:NaN},{depth_offset_mm:0.25}])
    assert.throws(()=>resolveBlankBindings([...items.slice(0,2),{...items[2],blank_binding:{...items[2].blank_binding,...patch}}]));
});
