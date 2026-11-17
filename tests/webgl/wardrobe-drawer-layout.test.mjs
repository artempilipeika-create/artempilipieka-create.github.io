import test from 'node:test';
import assert from 'node:assert/strict';
import {drawerSections,railForOpening,buildDrawerBoards,doorZones} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawers.mjs';

const bank=(kind='internal')=>({kind,faces:[{height:197}]});
const spec=(swing,banks)=>({width:banks.length*582+18,height:1800,depth:600,thickness:18,sections:banks.length,front:swing?{swing}:null,drawerBanks:banks});
test('550 control cabinet: outer hinged side only and real internal divider',()=>{
 const s=spec('left',[bank(),bank()]),b=drawerSections(s,[564,564]);
 assert.deepEqual(b.map(v=>[v.spacerL,v.spacerR,v.mountWidth,v.faces[0].width,v.rail.article]),[[18,0,546,543,'114798'],[0,0,564,561,'114798']]);
 const parts=[];buildDrawerBoards(s,b,(...args)=>parts.push(args));
 assert.equal(parts.filter(p=>p[0].includes('spacer')).length,1);
 assert.deepEqual(b.map(v=>v.mountWidth-27),[519,537]);
 assert.equal(parts.length,13);
});
test('both sides calculated independently for pairs, right swing, outer fronts and bare openings',()=>{
 for(const [swing,n,expected] of [['right',1,[[0,18]]],['pair',1,[[18,18]]],['pair',3,[[18,0],[0,0],[0,18]]]]){
  const s=spec(swing,Array.from({length:n},()=>bank()));
  assert.deepEqual(drawerSections(s,Array(n).fill(564)).map(b=>[b.spacerL,b.spacerR]),expected);
 }
 const s=spec(null,[bank('external')]);
 assert.equal(drawerSections(s,[564])[0].faces[0].width,597);
 assert.throws(()=>drawerSections(spec(null,[bank()]),[564]),/дверь/);
});
test('range boundaries, fitted remainder, multiple unequal drawer faces and clear shelf area',()=>{
 for(const [d,l] of [[255,250],[450,400],[450.5,400],[455,450],[600,550],[601,550],[605,600]])assert.equal(railForOpening(d).length,l);
 const s=spec('left',[{kind:'internal',height:500,faces:[{height:197},{height:null,width:400}]}]);
 const b=drawerSections(s,[564])[0];
 assert.deepEqual(b.faces.map(f=>[f.y,f.height,f.width]),[[19.5,197,543],[219.5,297,400]]);
 assert.equal(b.top,518);
 const bad=structuredClone(s);bad.drawerBanks[0].height=270;assert.throws(()=>drawerSections(bad,[564]),/фасад 2/);
 assert.equal(s.drawerBanks[0].faces[1].height,null);
});
test('shortens only the hinged leaf above overlay fronts in an unequal two-section cabinet',()=>{
 const s=spec('pair',[bank('external'),null]),b=drawerSections(s,[514,614]);
 const leaves=doorZones(s,[{left:1.5,width:588,height:1797,bottom:1.5},{left:592.5,width:588,height:1797,bottom:1.5}],b);
 assert.deepEqual(leaves.map(l=>[l.left,l.width,l.bottom,l.height]),[[1.5,538,201.5,1597],[542.5,638,1.5,1797]]);
});

import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeHardware,installedCuts} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';

function assemble({depth=600,bottomOffset=0,swing='left',kind='internal',offset=130,rotation=0}={}){
 const group_id='qa',spec={width:600,height:2000,thickness:18,sections:1,depth,shelves:0,
  front:swing?{swing,offset}:null,drawerBanks:[{kind,bottomOffset,faces:[{height:197},{height:147}]}]};
 const built=buildCarcass(spec,{idPrefix:group_id}),position={x:723,z:539,elevation_mm:120,rotation};
 const items=placeCarcass(built,position).map(i=>({...i,assistant_carcass:{group_id,spec,position}}));
 return {built,items,get:key=>items.find(i=>i.item_id==='qa:'+key)};
}
test('moving the bank changes only real hinge notches and repositions both coaxial screw entries',()=>{
 for(const rotation of [0,90,180,270]){
  const {built,items,get}=assemble({rotation}),p=get('drawer-0-spacer-left');
  assert.deepEqual(built.drawerIssues,[]);assert.deepEqual(installedCuts(p,items),[[78.5,148.5]]);
  assert.equal(get('drawer-0-0-face').width,527);
  assert.equal(get('drawer-0-1-face').width,543);
  assert.deepEqual(blankNativeItem(p,{name:'board',thickness:18},items).blank.spacer_cuts,[[78.5,148.5]]);
  const hw=wardrobeHardware(items),fast=hw.filter(h=>h.aks_kind==='spacer');
  assert.equal(hw.filter(h=>h.aks_kind==='rail').length,4);
  assert.equal(hw.filter(h=>h.aks_kind==='bolt').length,16);
  assert.equal(hw.filter(h=>h.aks_kind==='face').length,6);
  assert.equal(fast.length,4);
  const host=get('left'),mount=localPoint(p,rotation).x+9;
  for(const screw of fast){
   assert.equal(screw.host_blank_id,p.item_id);assert.equal(screw.joined_panel_id,host.item_id);
   assert.equal(localPoint(screw.position,rotation).x,mount);
   assert.equal(mount-18,localPoint(host,rotation).x+host.width/2);
  }
  const raised=assemble({bottomOffset:250,rotation}),up=raised.get('drawer-0-spacer-left');
  assert.deepEqual(installedCuts(up,raised.items),[]);
  assert.equal(raised.get('drawer-0-0-face').width,543);
  assert.deepEqual(wardrobeHardware(raised.items).filter(h=>h.aks_kind==='spacer').map(h=>h.position.y),fast.map(h=>h.position.y+250));
 }
});
test('all rail lengths, right hinge, clear opening and actual collision',()=>{
 for(let L=250;L<=600;L+=50){
  const {items,get,built}=assemble({depth:L+50,swing:'right'});
  assert.equal(get('drawer-0-spacer-right').depth,L);assert.equal(get('drawer-0-spacer-left'),undefined);
  assert.equal(built.drawerBanks[0].rail.length,L);
  for(const h of wardrobeHardware(items).filter(h=>h.aks_kind==='rail'))assert.ok(h.source_file.includes('_'+L+'_'));
 }
 const {items,get}=assemble({swing:null,kind:'external'});assert.equal(get('drawer-0-spacer-left'),undefined);
 assert.equal(wardrobeHardware(items).some(h=>h.aks_kind==='spacer'),false);
 const hit=assemble({offset:90});assert.match(hit.built.drawerIssues[0],/направляющая/);
 assert.throws(()=>wardrobeHardware(hit.items),/петлю/);
 assert.throws(()=>railForOpening(254),/255/);
});

test('shelves below and above a raised bank use the actual free opening',()=>{
 const row={kind:'internal',bottomOffset:340,shelvesBelow:1,faces:[{height:197}]};
 const spec={width:600,depth:600,height:1800,thickness:18,sections:1,shelves:2,sectionShelves:[2],
  shelfLevels:[[{mode:'floor',mm:150},{mode:'gap',mm:100}]],drawerBanks:[row],front:{swing:'left',offset:90}};
 const b=buildCarcass(spec);
 assert.deepEqual(b.parts.filter(p=>p.key.startsWith('shelf-')).map(p=>p.item.elevation_mm),[150,658]);
 assert.deepEqual(b.drawerIssues,[]);
 assert.throws(()=>buildCarcass({...spec,drawerBanks:[{...row,bottomOffset:80}]}),/полка|полок/);
});
