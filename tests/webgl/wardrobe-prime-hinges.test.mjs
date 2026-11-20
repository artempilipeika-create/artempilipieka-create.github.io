import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {hingeCatalogue} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinge-layout.mjs';
import {doorHinges,doorPush} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';

const defaults={width:1000,height:1850,depth:577,thickness:18,back:true,sections:2,sectionShelves:[2,2],dividerPositions:[410]};
function cabinet(hinges,rotation=0,changes={}){
 const spec=wardrobeSpec({...defaults,front:{swing:'pair',offset:90,...(hinges?{hinges}:{})},...changes});
 const built=buildCarcass(spec,{idPrefix:'qa'}),position={x:350,z:470,rotation,elevation_mm:150};
 const items=placeCarcass(built,position).map(i=>({...i,assistant_carcass:{spec,group_id:'qa',position}}));
 return {built,items,part:key=>items.find(i=>i.item_id==='qa:'+key)};
}
const both=(a,b=a)=>({'door-left':a,'door-right':b});
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,[a,b].join(' != '));
const x=(it,angle)=>localPoint(it,angle).x;
const z=(it,angle)=>localPoint(it,angle).z;
test('all H0 articles resolve to their own pinned source and the H2 variant is unavailable',()=>{
 const counts={};
 for(const p of Object.values(hingeCatalogue)){
  counts[p.kind]=(counts[p.kind]??0)+1;
  const {part,items}=cabinet(both({article:p.article}));
  const hs=doorHinges(part('door-left'),items);
  assert.equal(hs.length,4);
  assert.ok(hs.every(h=>h.article===p.article&&h.source_file===p.file&&h.source_sha256===p.sha));
 }
 assert.deepEqual(counts,{overlay:3,half:6,inset:7});
 assert.equal(hingeCatalogue['113401'],undefined);
 assert.throws(()=>cabinet(both({article:'113401'})),/каталога/);
});
test('half overlays use both faces of the actual off-centre divider without facing screws or moving shelves',()=>{
 const reference=cabinet();
 for(const angle of [0,90,180,270]){
  const {part,items}=cabinet(both({article:'112643'},{article:'113403'}),angle);
  const left=part('door-left'),right=part('door-right'),middle=part('divider-0');
  close(x(left,angle)+left.width/2,x(middle,angle)-1.5);
  close(x(right,angle)-right.width/2,x(middle,angle)+1.5);
  close(z(middle,angle)+middle.depth/2,z(part('left'),angle)+part('left').depth/2);
  assert.equal(reference.part('shelf-1-0').elevation_mm,part('shelf-1-0').elevation_mm);
  const a=doorHinges(left,items),b=doorHinges(right,items);
  assert.equal(a[0].host_blank_id,middle.item_id);assert.equal(a[0].door_side,'right');
  assert.equal(b[0].host_blank_id,middle.item_id);assert.equal(b[0].door_side,'left');
  for(const ha of a)for(const hb of b)for(const delta of [-32,0,32])assert.ok(Math.abs(ha.position.y-hb.position.y+delta)>5);
 }
});
test('inset leaves expose the outer and shared stiles and the plate follows actual face recess',()=>{
 for(const recess of [undefined,0,2,20]){
  const setting={article:'112650',...(recess!=null?{recess}:{})};
  const {part,built,items}=cabinet(both(setting,{...setting,central:true}));
  const left=part('door-left'),right=part('door-right'),side=part('left'),middle=part('divider-0');
  close(left.x-left.width/2,side.x+side.width/2+1.5);close(left.x+left.width/2,middle.x-middle.width/2-1.5);
  close(right.x-right.width/2,middle.x+middle.width/2+1.5);
  close(z(side,0)+side.depth/2-z(left,0)-left.depth/2,recess??2);
  close(middle.z+middle.depth/2-right.z-right.depth/2,recess??2);
  const h=doorHinges(left,items)[0];
  close(side.z+side.depth/2-(h.position.z-37),37+18+(recess??2));
  close(h.position.x+hingeCatalogue['112650'].cupFromHostMm-(left.x-left.width/2)-17.5,3);
  close(built.depth,580);
  assert.ok(part('shelf-0-0').z+part('shelf-0-0').depth/2<=left.z-left.depth/2-1);
 }
});
test('press to open references the free edge, the back of the door and the real shelf for each rotation',()=>{
 for(const kind of ['112708','112712'])for(const angle of [0,90,180,270]){
  const {part,items}=cabinet(both({article:kind,push:true}),angle);
  const door=part('door-left'),side=part('left'),h=doorHinges(door,items)[0],p=doorPush(door,items)[0];
  const sign=h.door_side==='left'?1:-1,pos=localPoint(p.position,angle);
  close(pos.x,x(door,angle)+sign*(door.width/2-70));close(pos.z,z(door,angle)-9);
  close(z(door,angle)+9-z(side,angle)-side.depth/2,kind==='112708'?20:-2);
  assert.ok(items.some(i=>i.item_id===p.host_blank_id&&i.blank_axis==='horizontal'));
  assert.equal(p.joined_panel_id,door.item_id);assert.equal(p.article,'09.0019');
 }
 assert.deepEqual(doorPush(cabinet().part('door-left'),cabinet().items),[]);
});
