import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {prepareAssistantPlan,applyAssistantPlan,selectedCarcass} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {surroundDrawing} from '../../backend/v2/cabinet_assets/planner/wardrobe-surround-drawing.mjs';
import {viewingDoor,hingePose,clearanceSession} from '../../backend/v2/cabinet_assets/planner/wardrobe-clearance.mjs';
import {WardrobeMotion} from '../../backend/v2/cabinet_assets/planner/wardrobe-motion.mjs';

const upper={height:540,divider:true,leaves:2,side:'left',opening:'swing',push:{article:'70787',mount:'auto',support:'auto',heightMm:1050}};
const surround={
 left:{kind:'filler',width:100,heightMode:'custom',height:2000,bottom:0},
 right:{kind:'end',depth:100,projection:20,heightMode:'full',bottom:0},
 upper,cap:{height:80}
};
const spec=(changes={})=>wardrobeSpec({width:1000,height:2080,depth:580,thickness:18,sections:1,sectionShelves:[0],back:true,clearLayout:true,surround,...changes});
const body='71118e45-0ce3-534b-ad68-db1238304f18',front='389a2abc-c6e2-5214-a41b-60054320d0ff';
const options={idPrefix:'wardrobe',bodyMaterialId:body,frontMaterialId:front};
const part=(b,key)=>b.parts.find(p=>p.key===key).item;
const frontEdge=it=>it.z+it.depth/2;

test('assembled envelope, donor boards and edge schedules match the agreed questionnaire',()=>{
 const b=buildCarcass(spec(),options),g=b.envelope;
 assert.deepEqual([b.width,g.height,b.depth],[1118,2700,603]);
 const side=part(b,'right'),post=part(b,'trim-right-end'),left=part(b,'trim-left-face'),base=part(b,'trim-cap-base');
 assert.equal(frontEdge(post)-frontEdge(side),20);
 assert.deepEqual([left.body_variant_id,left.width,left.height,left.depth,left.blank_edge_code,left.blank_edge_thickness_mm],[front,100,2000,18,'1111',1]);
 const spacer=part(b,'trim-left-return');assert.deepEqual([spacer.body_variant_id,spacer.depth,spacer.x,spacer.blank_edge_code],[body,82,-591,'0111']);
 assert.deepEqual([post.width,post.depth,post.height,post.body_variant_id],[18,100,2620,front]);
 const door=part(b,'mezz-door-left'),cap=part(b,'trim-cap-face');
 assert.deepEqual([frontEdge(door)-frontEdge(side),cap.elevation_mm,frontEdge(cap),base.blank_edge_code],[20,2620,frontEdge(door),'1011']);
 assert.deepEqual([door.width,door.height,door.elevation_mm,door.blank_edge_thickness_mm],[497,537,2081.5,2]);
 assert.equal(part(b,'mezz-bottom').elevation_mm,2080);
 assert.deepEqual([part(b,'mezz-divider').blank_length_mm,part(b,'mezz-divider').elevation_mm],[504,2098]);
 assert.match(surroundDrawing(b,'surround').caption,/1000 \+ 100 \+ 18 = 1118/);
 for(const rotation of [0,90,180,270]){
  const rows=placeCarcass(b,{x:1000,z:1300,elevation_mm:0,rotation});
  const bounds=prop=>{const dims=rotation%180===0?['width','depth']:['depth','width'];const dim=dims[prop==='x'?0:1];return [Math.min(...rows.map(it=>it[prop]-it[dim]/2)),Math.max(...rows.map(it=>it[prop]+it[dim]/2))];};
  assert.equal((bounds('x')[0]+bounds('x')[1])/2,1000);assert.equal((bounds('z')[0]+bounds('z')[1])/2,1300);
 }
});

test('end projection is independent of doors, end depth, side and feet',()=>{
 const left={kind:'end',depth:480,projection:20,heightMode:'body',bottom:90};
 for(const front of [undefined,{swing:'pair',offset:90,autoHinges:true}]){
  const b=buildCarcass(spec({front,feet:{layout:'width',article:'118779',front:50,rear:50},surround:{left}}),options);
  const rows=placeCarcass(b,{x:0,z:0,rotation:0,elevation_mm:100});
  const get=k=>rows.find(i=>i.item_id==='wardrobe:'+k);
  assert.equal(frontEdge(get('trim-left-end'))-frontEdge(get('left')),20);
  assert.deepEqual([get('trim-left-end').elevation_mm,get('trim-left-end').height],[190,2000]);
  assert.equal(b.envelope.height,2090);
 }
});

test('the parent survives JSON save/reopen; fixed and automatic heights update separately',()=>{
 let state={room:{width:5000,height:3000,depth:4500,setup_complete:true},items:[]};
 const adapter=new StateAdapter({supportsElevation:true,state:()=>state,projectId:()=>null,selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),select:id=>state.selected_item_id=id,refresh(){},material:()=>null});
 const apply=(action,s)=>applyAssistantPlan(adapter,prepareAssistantPlan(adapter,{action,spec:s},{id:'wardrobe',selectedMaterials:{body,front}}));
 apply('create',spec());state=JSON.parse(JSON.stringify(state));adapter.select('wardrobe:trim-right-end');assert.deepEqual(selectedCarcass(adapter).metadata.spec.surround,surround);
 apply('update',spec({height:2180}));assert.ok(adapter.items.every(it=>it.assistant_carcass.group_id==='wardrobe'));
 const get=key=>adapter.items.find(i=>i.item_id==='wardrobe:'+key);
 assert.deepEqual([get('trim-left-face').height,get('trim-right-end').height,get('trim-cap-face').elevation_mm],[2000,2720,2720]);
 apply('update',spec({surround:undefined}));assert.ok(adapter.items.every(it=>!/(mezz|trim)-/.test(it.item_id)));
 assert.equal(selectedCarcass(adapter).metadata.spec.surround,undefined);
});

test('a lift front pivots at its top even on rotated cabinets; the closed board stays in the saved model',()=>{
 const upperLift={...upper,divider:false,leaves:1,opening:'lift',side:'right'};
 const s=spec({surround:{upper:upperLift}}),b=buildCarcass(s,options);
 assert.ok(!b.parts.some(p=>p.key==='mezz-divider'));
 const it={...part(b,'mezz-door-right'),rotation:90,assistant_carcass:{spec:s,group_id:'wardrobe'}},saved=structuredClone(it);
 const g={position:{},rotation:{},children:[],userData:{}},entries=new Map([[it.item_id,{group:g}]]);
 const motion=new WardrobeMotion();motion.show('wardrobe');motion.step(100,true);motion.pose(entries,[it]);
 assert.equal(viewingDoor(it),'right');
 assert.equal(g.rotation.x,-Math.PI/2);
 const pose=hingePose(it,90);assert.ok(Math.abs(pose.dy-(it.height-9))<1e-7);
 assert.ok(Math.abs(g.position.x-it.x/1000+(it.height+9)/1000)<1e-7);
 assert.equal(clearanceSession([it],null,null,motion).swing(it,0,90).degrees,90);
 motion.close();motion.step(101,true);motion.pose(entries,[it]);assert.equal(g.rotation.x,0);assert.deepEqual(it,saved);
});

