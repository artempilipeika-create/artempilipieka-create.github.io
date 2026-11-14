import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {anchoredDimensions,resizeConnectedLayout,layoutJoints} from '../../backend/v2/cabinet_assets/planner/corner-layout.mjs';
import {findSpace,snapItem} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {applyChanges} from '../../backend/v2/cabinet_assets/planner/mobility.mjs';
const U=globalThis.MF_WALL_SPECIAL,room={width:10000,depth:10000,height:3000};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const pos=(it)=>C.rotateXZ(it.x,it.z,-it.rotation);
function item(id,bazis,patch={}){const p=C.PRODUCTION_MODELS[bazis];return C.normalizeKitchen({item_id:id,name:id,bazis_id:bazis,bazis_file:p.source_file,bazis_sha256:p.source_sha256,bazis_resize:true,module_type:p.tier==='wall'?'wall_cabinet':'base_cabinet',width:p.native_defaults.width,height:p.body_height+p.base_height,body_height:p.body_height,base_height:p.base_height,depth:p.scene_depth,base:p.tier==='wall'?'wall':'plinth',handles:'handles',rotation:0,x:0,z:0,...patch});}
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id],limits:C.PRODUCTION_MODELS[it.bazis_id].limits,resize:true});
for(const v of U.variants)for(const depth of [250,400,600])test(v.id+' depth '+depth+' preserves native sections and machining offsets',()=>{
 const it=item('s',v.id,{depth}),pp=C.productionParts(it,template(it)),native=U.parts({...it,depth:v.native_frame.size[2]-3});
 assert.equal(C.dimensionError(it,template(it)),'');
 for(const p of pp){assert.ok(Object.values(p.size).every(n=>n>0));const orig=native.find(q=>q.key===p.key);near(p.thickness,orig.thickness);if(p.type==='profile'){near(p.size.z,orig.size.z);near(p.length,orig.length);}}
 const back=pp.find(p=>p.role==='back');near(back.size.z,3);near(back.position.z+back.size.z/2,-depth/2);
 const shelves=pp.filter(p=>p.role==='shelf');for(const p of shelves)near(p.size.z,depth-(v.family==='corner'?0:1));
 if(v.family==='corner'){
  near(U.pivot(it,0).z,depth/2-3.6622);
  const notch=pp.find(p=>p.native_polygon);if(notch){const z=[...new Set(notch.native_polygon.front.map(q=>q[2]))].sort((a,b)=>a-b);near(z.at(-1)-z.at(-2),20);}
 }else{
  for(const p of pp.filter(p=>p.role==='shelf'))assert.equal(p.thickness,4);
  for(const groove of pp.flatMap(p=>p.machining||[]))near(depth/2-groove.trajectory[0][2],158.5);
  for(const p of pp.filter(p=>p.role==='front'&&p.type!=='profile'))near(p.position.z-p.size.z/2,depth/2+17.5);
 }
});

function layout(upper,side,rotation){
 const cv=upper?U.variants.find(v=>v.family==='corner'&&v.opening===side):C.CORNER_VARIANTS.find(v=>v.side===side&&v.door_count===1&&v.purpose==='shelf');
 const root=item('corner',cv.id,{rotation,width:upper?974:1000});
 const regular=upper?U.families.vitrine1.default_id:'bazis.0211e4f77fc4';
 const first=C.cornerReturnPlacement(root,item('return',regular));
 const sign=side==='right'?1:-1,delta=C.rotateXZ(sign*600,0,first.rotation);
 const second={...first,item_id:'second',name:'second',x:first.x+delta.x,z:first.z+delta.z};
 return [root,first,second];
}
for(const upper of [false,true])for(const side of ['left','right'])for(const rotation of [0,90,180,270])test(`${upper?'upper':'lower'} ${side} ${rotation}: depth and width preserve 90deg and connected row`,()=>{
 let list=layout(upper,side,rotation),[root,first,second]=list;
 assert.equal(layoutJoints(list,room).length,2);
 for(const it of list)assert.equal(C.placementError(it,list,room),'');
 const old=pos(root),cornerSide=side==='left'?-1:1,back=old.z-root.depth/2;
 const changed={...root,depth:400+(upper?0:200),width:root.width+20};
 list=resizeConnectedLayout(root,anchoredDimensions(root,changed),list,room);
 [root,first,second]=list;const p=pos(root);near(p.z-root.depth/2,back);near(p.x+cornerSide*root.width/2,old.x+cornerSide*changed.width/2-cornerSide*20/2);
 const contact=C.rotateXZ(first.x-root.x,first.z-root.z,-rotation);
 near(contact.z-first.width/2,root.depth/2+68);
 assert.equal((first.rotation-root.rotation+360)%360,side==='left'?270:90);
 assert.equal(layoutJoints(list,room).length,2);
 const rootBefore=structuredClone(root),next={...first,depth:upper?280:550,width:450};
 list=resizeConnectedLayout(first,anchoredDimensions(first,next),JSON.parse(JSON.stringify(list)),room);
 assert.deepEqual(list[0],rootBefore);[root,first,second]=list;
 const q=C.rotateXZ(first.x-root.x,first.z-root.z,-rotation),s=side==='left'?1:-1;
 if(upper)near(s*q.x+first.depth/2+C.cabinetFrontExtension(first),-root.width/2+321);
 else near(s*q.x-first.depth/2,-root.width/2+50);
 near(q.z-first.width/2,root.depth/2+68);
 assert.equal(layoutJoints(list,room).length,2);
 for(const it of list)assert.equal(C.placementError(it,list,room),'');
 assert.equal(first.bazis_sha256,next.bazis_sha256);
 const snapped=snapItem({...first,x:first.x+8,z:first.z+8},[root],room);near(snapped.item.x,first.x);near(snapped.item.z,first.z);
 const added=findSpace({...first,item_id:'new'},[root],room,root);near(added.x,first.x);near(added.z,first.z);
});
test('Standalone rear anchors are stable away from walls at all rotations',()=>{
 for(const rotation of [0,90,180,270]){const a=item('a',U.families.vitrine1.default_id,{rotation,x:200,z:300}),b=anchoredDimensions(a,{...a,depth:400});near(pos(a).z-a.depth/2,pos(b).z-b.depth/2);}
});
test('Deliberate gaps and other tiers do not follow, and invalid resize rolls back atomically',()=>{
 const list=layout(true,'left',0),gap={...list[2],item_id:'gap',x:2500,z:2500};list.push(gap);
 const resized=resizeConnectedLayout(list[0],{...list[0],depth:400},list,room);
 assert.equal(resized.length,3);assert.ok(!resized.some(it=>it.item_id==='gap'));
 let state={items:structuredClone(list),room},selectedId='corner';
 const adapter=new StateAdapter({state:()=>state,selected:()=>state.items.find(it=>it.item_id===selectedId),template,refresh(){},select(id){selectedId=id;},snapshot:()=>({name:'QA depth',scene:structuredClone(state)}),restore:value=>{state=structuredClone(value.scene);},supportsElevation:true});
 const history=new History(adapter);history.run('Depth',()=>applyChanges(adapter,resized));assert.equal(history.undoStack.length,1);history.undo();assert.deepEqual(state.items,list);history.redo();assert.equal(state.items[0].depth,400);
 const before=structuredClone(state);assert.throws(()=>history.run('Invalid',()=>applyChanges(adapter,resizeConnectedLayout(state.items[0],{...state.items[0],depth:601},state.items,room))),/диапазона/);assert.deepEqual(state,before);
});

test('logged 340 mm return: actual door faces coincide with the corner filler in exported scene coordinates',()=>{
 const door=item('return','bazis.d850b6a88a43',{width:600,depth:340,elevation_mm:1458});
 for(const v of U.variants.filter(v=>v.family==='corner'))for(const rotation of [0,90,180,270]){
  const root=item('corner',v.id,{x:-1000,z:-850,rotation,elevation_mm:1458});
  const mate=C.cornerReturnPlacement(root,{...door,depth:Number(v.return_depth)});
  const s=v.opening==='left'?1:-1;
  const face=Math.max(...U.parts(root).filter(p=>p.name==='Бленда').map(p=>s*p.position.x+p.size.x/2));
  const doors=C.productionParts(mate,template(mate)).filter(p=>p.role==='front');
  assert.equal(doors.length,2);
  for(const p of doors){
   const offset=C.rotateXZ(p.position.x,p.position.z+p.size.z/2,mate.rotation);
   near(s*C.rotateXZ(mate.x+offset.x-root.x,mate.z+offset.z-root.z,-rotation).x,face);
  }
  if(v.id==='bazis.6005ad4c2f5e'&&rotation===0){near(mate.x,-1330);near(mate.z,-332);assert.equal(mate.rotation,270);}
 }
});
