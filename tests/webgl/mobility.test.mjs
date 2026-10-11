import test from 'node:test';
import assert from 'node:assert/strict';
import {rotateXZ,rightAnchoredWidth} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {movementTargets,translateItems,rightNeighbours,widthChange,applyChanges,replacement} from '../../backend/v2/cabinet_assets/planner/mobility.mjs';
const room={width:6200,depth:6200,height:2700,setup_complete:true};
const item=(id,x=0,z=0,extra={})=>({item_id:id,name:id,module_type:'base_cabinet',width:600,height:820,body_height:720,base_height:100,depth:510,x,z,rotation:0,base:'plinth',handles:'handles',layout:'doors',drawers:0,...extra});
function adapter(items){
 let state={room:structuredClone(room),items},selectedId=items[0].item_id;
 const bridge={state:()=>state,selected:()=>state.items.find(x=>x.item_id===selectedId),template:()=>({front:{kind:'doors',count:2}}),
 snapshot:()=>({name:'Test',scene:structuredClone(state),selectedId}),restore:s=>{state=structuredClone(s.scene);selectedId=s.selectedId;},refresh:()=>{},select:id=>{selectedId=id;}};
 return new StateAdapter(bridge);
}
for(const rotation of [0,90,180,270])test('Touching right neighbours resize as one validated change at '+rotation,()=>{
 const u=rotateXZ(1,0,rotation),list=[0,1,2].map((i)=>item(String(i),u.x*600*i||0,u.z*600*i||0,{rotation})),a=adapter(list),history=new History(a);
 const source=list[0],next=rightAnchoredWidth(source,{...source,width:800});
 assert.deepEqual(rightNeighbours(source,list,room).map(i=>i.item_id),['1','2']);
 history.run('Width',()=>applyChanges(a,widthChange(source,next,list,room,true)));
 assert.deepEqual(a.items.map(it=>it.x*u.x+it.z*u.z),[100,800,1400]);
 assert.equal(history.undoStack.length,1);history.undo();assert.deepEqual(a.items,list);history.redo();assert.equal(a.items[0].width,800);
});
test('A deliberate gap, other tier and different orientation stop following',()=>{
 const source=item('a'),list=[source,item('b',600),item('gap',1220),item('upper',600,0,{module_type:'wall_cabinet',base:'wall',height:720,body_height:720,base_height:0}),item('turn',0,600,{rotation:90})];
 assert.deepEqual(rightNeighbours(source,list,room).map(i=>i.item_id),['b']);
});
test('All selected cabinets can move through each other’s former positions',()=>{
 const list=[item('a'),item('b',600),item('upper',0,0,{module_type:'wall_cabinet',base:'wall',height:720,body_height:720,base_height:0})],a=adapter(list);
 applyChanges(a,translateItems(movementTargets(list[0],list,'lower'),600,0));
 assert.deepEqual(a.items.map(i=>i.x),[600,1200,0]);assert.equal(movementTargets(list[0],list,'kitchen').length,3);
});
test('An invalid group move is atomic and has no undo entry',()=>{
 const list=[item('a'),item('b',600)],a=adapter(list),history=new History(a);
 assert.throws(()=>history.run('Move',()=>applyChanges(a,translateItems(list,2500,0))),/границы/);
 assert.deepEqual(a.items,list);assert.equal(history.undoStack.length,0);
});
test('Replacement keeps identity, materials, note and left/back anchors',()=>{
 const source=item('original',-1200,-800,{name:'У окна',body_variant_id:'body',front_variant_id:'front',back_variant_id:'back',production_note:'Розетка справа',countertopEnabled:false,countertopJoint:'euro'});
 const draft=item('new',0,0,{width:800,depth:560,layout:'drawers',drawers:3});
 const next=replacement(source,draft,{label:'Old'},{label:'New'},false);
 assert.equal(next.item_id,source.item_id);assert.equal(next.name,'У окна');assert.equal(next.layout,'drawers');
 assert.equal(next.x-next.width/2,source.x-source.width/2);assert.equal(next.z-next.depth/2,source.z-source.depth/2);
 for(const key of ['body_variant_id','front_variant_id','back_variant_id','production_note','countertopEnabled','countertopJoint'])assert.equal(next[key],source[key]);
 const kept=replacement(source,draft,{label:'Old'},{label:'New'},true);assert.equal(kept.width,source.width);assert.equal(kept.depth,source.depth);
 assert.throws(()=>replacement(source,{...draft,module_type:'wall_cabinet'},{},{}),/той же группы/);
});
test('Default replacement corpus retains the project leg height',()=>{
  const source=item('original',0,0,{height:870,base_height:150,legHeightMm:150}),draft=item('new');
  const next=replacement(source,draft,{},{},false);
  assert.equal(next.body_height,720);assert.equal(next.base_height,150);assert.equal(next.height,870);
});
