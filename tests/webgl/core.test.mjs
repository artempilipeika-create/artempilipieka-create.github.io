import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {facadeCells,bounds,rotateXZ,elevation,placementError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {snapItem,findSpace} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
const room={width:4200,depth:3200,height:2700};
const item=(props={})=>({item_id:'a',module_type:'base_cabinet',name:'Нижний',x:0,z:0,rotation:0,width:600,height:720,depth:560,base:'plinth',layout:'doors',drawers:0,handles:'handles',...props});
const two={front:{kind:'doors',count:2}};

test('1.5 mm on each side: 400 cell gives 397 facade',()=>{const cells=facadeCells(item({width:800}),two);assert.equal(cells.length,2);assert.equal(cells[0].w,397);assert.equal(cells[0].h,637);assert.equal(facadeCells(item({width:900}),two)[1].w,447);});
test('Shared drawer/combo/niche arithmetic stays finite and within cells',()=>{
 for(const w of [300,600,801,1200])for(const h of [600,720,1000])for(const n of [1,2,3,8]){
  const cells=facadeCells(item({width:w,height:h}),{front:{kind:'drawers',count:n}});
  assert.equal(cells.length,n);assert.equal(cells[0].w,w-3);assert.ok(Math.abs(cells[0].h-((h-80)/n-3))<=.051);
 }
 assert.equal(facadeCells(item(),{front:{kind:'none'}}).length,0);
 assert.equal(facadeCells(item({width:1000}),{front:{kind:'combo',drawerRows:2,doors:2,drawerRatio:.3}}).length,4);
 assert.equal(facadeCells(item(),{front:{kind:'niche',drawerRows:2,nicheRatio:.35}}).length,2);
});
for(const [r,x,z]of [[0,0,1],[90,-1,0],[180,0,-1],[270,1,0]])test('Rotation '+r+' follows existing X/Z convention',()=>{
 assert.deepEqual(rotateXZ(0,1,r),{x,z});const b=bounds(item({rotation:r}),room,false);assert.equal(b.maxX-b.minX,r%180===0?600:560);assert.equal(b.maxZ-b.minZ,r%180===0?560:600);
});
test('Elevation fallback is exactly the saved v2 rule',()=>{assert.equal(elevation(item({module_type:'wall_cabinet'}),room),1480);assert.equal(elevation(item(),room),0);assert.equal(elevation(item({elevation_mm:1550}),room),1550);});
test('Upper over lower is not a collision; upper inside tall is',()=>{
 const upper=item({item_id:'upper',module_type:'wall_cabinet',depth:320});
 assert.equal(placementError(upper,[item()],room),'');assert.match(placementError(upper,[item({height:2200,module_type:'tall_cabinet'})],room),/Пересечение/);
});
test('Hidden furniture remains in collision and bounds include facades',()=>{assert.match(placementError(item(),[item({item_id:'hidden',hidden:true})],room),/Пересечение/);assert.match(placementError(item({z:1320}),[],room),/границы/);});
for(const [r,x,z]of [[0,0,-1300],[90,1800,0],[180,0,1300],[270,-1800,0]])test('Wall snap, inward orientation and clearance '+r,()=>{
 const res=snapItem(item({x,z}),[],room,{wallOffset:20,threshold:55,allowElevation:false});assert.equal(res.item.rotation,r);assert.equal(res.error,'');const b=bounds(res.item,room,false);assert.equal(r===0?b.minZ:r===90?b.maxX:r===180?b.maxZ:b.minX,r===0?-1580:r===90?2080:r===180?1580:-2080);
});
for(const r of [0,90,180,270])test('Sibling zero-gap and front alignment '+r,()=>{
 const peer=item({rotation:r}),normal=rotateXZ(0,1,r),along=rotateXZ(1,0,r);
 const raw=item({item_id:'b',rotation:r,depth:450,x:along.x*612+normal.x*60,z:along.z*612+normal.z*60});
 const res=snapItem(raw,[peer],room,{threshold:45,allowElevation:false});assert.equal(res.error,'');
 assert.equal(res.item.x,along.x*600+normal.x*55);assert.equal(res.item.z,along.z*600+normal.z*55);
 assert.ok(res.guides.some(g=>g.text.includes('0 мм')));assert.ok(res.guides.some(g=>g.text==='Линия фасадов'));
});
test('Wall hysteresis release radius is larger than capture radius',()=>{
 const first=snapItem(item({z:-1310}),[],room,{threshold:40,allowElevation:false});
 const held=snapItem(item({z:-1265}),[],room,{threshold:40,allowElevation:false},first.anchors);
 const free=snapItem(item({z:-1265}),[],room,{threshold:40,allowElevation:false});
 assert.equal(held.item.z,-1320);assert.equal(free.item.z,-1265);
});
test('Snapping can be disabled and still rejects collisions',()=>{const res=snapItem(item({item_id:'b',x:30}),[item()],room,{enabled:false,allowElevation:false});assert.equal(res.item.x,30);assert.match(res.error,/Пересечение/);assert.equal(res.guides.length,0);});
test('findSpace puts a new cabinet beside an existing one without moving it',()=>{
 const first=item({z:-1320}),before=JSON.stringify(first);const it=findSpace(item({item_id:'b'}),[first],room,first);assert.ok(it);assert.equal(Math.abs(it.x),600);assert.equal(JSON.stringify(first),before);assert.equal(placementError(it,[first],room),'');
});
function harness(){
 let state={items:[item()],room:{...room},selected_item_id:'a',schema_version:2},name='Кухня';
 const bridge={supportsElevation:false,state:()=>state,selected:()=>state.items.find(x=>x.item_id===state.selected_item_id),projectId:()=>null,
  template:()=>null,material:()=>null,refresh:()=>{},status:()=>{},select:id=>{state.selected_item_id=id;},
  snapshot:()=>({name,scene:structuredClone(state),selectedId:state.selected_item_id}),restore:s=>{name=s.name;state=structuredClone(s.scene);},
  catalogue:{templates:{},bazisModules:[],moduleDefs:{base_cabinet:{name:'Нижний',w:600,h:720,d:560,layout:'doors',drawers:0,base:'plinth'}}}};
 const adapter=new StateAdapter(bridge),history=new History(adapter);return{adapter,history};
}
test('Temporary preview height is not silently added to v2 payload',()=>{const {adapter}=harness();adapter.replace({...adapter.selected,elevation_mm:1480});assert.equal(Object.hasOwn(adapter.selected,'elevation_mm'),false);assert.equal(Object.hasOwn(adapter.createDraft({module:'base_cabinet'}),'elevation_mm'),false);});
test('Drag preview produces one undo; cancellation leaves original state',()=>{
 const {adapter,history}=harness();history.begin('drag');for(let n=0;n<100;n++){snapItem({...adapter.selected,x:n},[],room,{});}assert.equal(adapter.selected.x,0);
 adapter.replace({...adapter.selected,x:600});history.commit();assert.equal(history.undoStack.length,1);history.undo();assert.equal(adapter.selected.x,0);history.redo();assert.equal(adapter.selected.x,600);
 history.begin('cancelled');history.cancel();assert.equal(adapter.selected.x,600);assert.equal(history.undoStack.length,1);
});
test('Resize, duplicate and delete round trip with undo/redo',()=>{
 const {adapter,history}=harness();history.run('resize',()=>adapter.replace({...adapter.selected,width:800}));history.undo();assert.equal(adapter.selected.width,600);history.redo();assert.equal(adapter.selected.width,800);
 history.run('copy',()=>adapter.insert({...adapter.selected,item_id:'b',x:900}));history.run('delete',()=>adapter.remove('b'));assert.equal(adapter.items.length,1);history.undo();assert.equal(adapter.items.length,2);history.undo();assert.equal(adapter.items.length,1);history.redo();assert.equal(adapter.items.length,2);
});
test('100-module planning smoke stays finite and non-mutating',()=>{
 const r={width:12000,depth:12000,height:2700};const items=Array.from({length:100},(_,i)=>item({item_id:'s'+i,x:(i%10-4.5)*900,z:(Math.floor(i/10)-4.5)*900}));
 assert.ok(items.every(it=>!placementError(it,items,r)));const before=JSON.stringify(items);
 for(let i=0;i<100;i++)snapItem({...items[0],x:-4200+i},items,r,{allowElevation:false});assert.equal(JSON.stringify(items),before);
});
test('WebGL route has no competing legacy canvas controller',()=>{
 const src=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
 assert.ok(src.includes("ctx=plannerRequested?null:canvas.getContext('2d')"));assert.ok(src.includes('function draw(){\n  if(plannerRequested)return;'));assert.ok(src.includes('if(!plannerRequested){\ncanvas.onpointerdown'));
 assert.ok(src.includes('return globalThis.MF_FURNITURE_CORE.facadeCells(it,templateFor(it))'));
});
