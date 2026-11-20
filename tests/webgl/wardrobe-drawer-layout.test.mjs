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
 const open=drawerSections(spec(null,[bank()]),[564])[0];
 assert.deepEqual([open.spacerL,open.spacerR,open.mountWidth,open.faces[0].width],[0,0,564,561]);
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

import {drawerControls,installBank} from '../../backend/v2/cabinet_assets/planner/wardrobe-interior-ui.mjs';
test('typing numeric fields updates the bank before moving to another step or saving',()=>{
 const fieldsByLabel=new Map();
 const node=()=>({append(){},closest(){return null;},setAttribute(key,label){if(key==='aria-label')fieldsByLabel.set(label,this);},
  validity:{valid:true},reportValidity(){return true;},get valueAsNumber(){return Number(this.value);}});
 const original=globalThis.document;globalThis.document={createElement:node};
 try{
  const fields={sections:1,sectionShelves:[0],drawerBanks:[{kind:'internal',faces:[{height:197},{height:197}]}]};
  let rendered=0;drawerControls({fields,select(){},changed(){},render(){rendered++;}},node(),0);
  for(const [label,value] of [['Высота фасада 2, мм','147'],['Ширина фасада 2, мм','420'],['От верха дна шкафа до низа блока, мм','250']]){
   const input=fieldsByLabel.get(label);input.value=value;input.oninput();
   if(label.includes('фасада'))assert.equal(rendered,0);
  }
  assert.deepEqual(fields.drawerBanks[0].faces,[{height:197},{height:147,width:420}]);
  assert.equal(fields.drawerBanks[0].bottomOffset,250);assert.equal(rendered,1);
 }finally{globalThis.document=original;}
});

import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {doorHinges} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs';
import {wardrobeDrawing} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawing.mjs';
const equal=(count,gap=30)=>({kind:'internal',layout:'equal',gap,faces:Array.from({length:count},()=>({height:null}))});
const fields={width:1000,depth:600,height:2000,thickness:18,sections:2,sectionShelves:[2,1],back:true,
  front:{swing:'pair',offset:90},shelfLevels:[[{mode:'floor',mm:621},{mode:'floor',mm:1200}],[{mode:'floor',mm:741}]]};
test('each opening owns its gap, equal fronts, manual remainder and unchanged shelf datums',()=>{
 const rows=[equal(3),equal(3),null,{...equal(2,11),layout:'manual',faces:[{height:200},{height:null}]}];
 const s=wardrobeSpec({...fields,drawerBanks:rows}),built=buildCarcass(s,{idPrefix:'niche'});
 assert.deepEqual(built.drawerIssues,[]);
 assert.deepEqual(built.drawerBanks[0].faces.map(f=>f.height),[170.5,170.5,170.5]);
 assert.deepEqual(built.drawerBanks[1].faces.map(f=>f.height),[210.5,210.5,210.5]);
 assert.deepEqual(built.drawerBanks[3].faces.map(f=>f.height),[200,318.5]);
 for(const b of built.drawerBanks.filter(Boolean))for(let i=1;i<b.faces.length;i++)
   assert.ok(Math.abs(b.faces[i].y-b.faces[i-1].y-b.faces[i-1].height-rows[b.slot].gap)<.00001);
 assert.deepEqual(built.parts.filter(p=>p.key.startsWith('shelf-')).map(p=>p.item.elevation_mm),[621,1200,741]);
 const one=buildCarcass(wardrobeSpec({...fields,drawerBanks:[equal(1,246),null]}));
 assert.equal(one.drawerBanks[0].faces[0].height,571.5);
 const fractions=buildCarcass(wardrobeSpec({...fields,drawerBanks:[equal(4),null]}));
 assert.deepEqual(fractions.drawerBanks[0].faces.map(f=>f.height),[120.375,120.375,120.375,120.375]);
 assert.throws(()=>wardrobeSpec({...fields,drawerBanks:[equal(5,100),null]}),/фасад/);
 assert.deepEqual(rows[0].faces,[{height:null},{height:null},{height:null}]);
});
test('automatic hinges clear existing shelves, full drawer fronts and rails in drawing and rotated export',()=>{
 const s=wardrobeSpec({...fields,drawerBanks:[equal(3),equal(3)]}),prefix='qa';
 const built=buildCarcass(s,{idPrefix:prefix});
 assert.deepEqual(built.drawerIssues,[]);
 for(const rotation of [0,90,180,270]){
   const position={x:1000,z:1200,elevation_mm:140,rotation};
   const items=placeCarcass(built,position).map(i=>({...i,assistant_carcass:{group_id:prefix,spec:s,position}}));
   for(const [section,side] of ['left','right'].entries()){
     const door=items.find(i=>i.item_id==='qa:door-'+side),hinges=doorHinges(door,items),bank=built.drawerBanks[section];
     assert.equal(hinges.length,4);
     const mid=bank.faces[1].y-15;
     assert.ok(Math.abs(hinges[0].position.y-position.elevation_mm-mid)<.001);
     assert.equal(bank.hingeSetback,2);
     const host=items.find(p=>p.item_id==='qa:drawer-'+section+'-spacer-'+side);
     assert.deepEqual(installedCuts(host,items).map(row=>row.map(n=>Math.round(n*1000))),bank.cuts[side].map(row=>row.map(n=>Math.round(n*1000))));
     assert.ok(hinges.every((h,i)=>h.host_blank_id==='qa:'+side&&h.joined_panel_id===door.item_id&&(!i||h.position.y-hinges[i-1].position.y>=64)));
     assert.ok(bank.faces.every(f=>f.width===bank.mountWidth-3));
   }
   assert.equal(wardrobeHardware(items).filter(h=>h.aks_kind==='rail').length,12);
 }
 const shelfHit=wardrobeSpec({...fields,shelfLevels:[[{mode:'floor',mm:92},{mode:'floor',mm:600}],[{mode:'floor',mm:1450}]]});
 const b=buildCarcass(shelfHit,{idPrefix:prefix}),door=b.items.find(i=>i.item_id==='qa:door-left');
 const [h]=doorHinges({...door,assistant_carcass:{group_id:prefix,spec:shelfHit}},b.items);
 assert.ok(Math.abs(h.position.y-91.5)>1);
 assert.equal(b.parts.find(p=>p.key==='shelf-0-0').item.elevation_mm,92);
});
test('impossible hinge layout identifies the outer door and leaves all fronts intact',()=>{
 const f={...fields,width:600,height:800,sections:1,sectionShelves:[0],shelfLevels:undefined,front:{swing:'left',offset:90},drawerBanks:[equal(3,3)]};
 const b=buildCarcass(wardrobeSpec(f));
 assert.equal(b.hingeConflicts[0].side,'left');assert.equal(b.hingeConflicts[0].section,0);
 assert.match(b.drawerIssues[0],/левая дверь/);
 assert.match(wardrobeDrawing(b,'sections').svg,/Конфликт петель/);
 assert.equal(b.drawerBanks[0].faces.length,3);
});

import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';

test('structural drawer covers keep the actual shelf underside, face clearance and native fixing on both edges',()=>{
 for(const thickness of [16,18,25])for(const fixing of ['cam_dowel','confirmat']){
  const f={...fields,thickness,sectionShelves:[1,1],shelfLevels:[[{mode:'floor',mm:700}],[{mode:'floor',mm:700}]],
   shelfChoices:[['6/48846'],['board/95388']],drawerBanks:[{...equal(3,12.5),coverFixing:fixing},equal(2,27)]};
  const design=wardrobeSpec(f),group_id='cover',b=buildCarcass(design,{idPrefix:group_id});
  const panels=b.items.map(i=>({...i,assistant_carcass:{group_id,spec:design}}));
  const joints=nativeCarcassJoints(panels);
  assert.deepEqual(design.shelfChoices,[['board/'+fixing],['board/cam_dowel']]);
  for(const [section,bank] of b.drawerBanks.entries()){
   const top=bank.faces.at(-1),shelf=panels.find(p=>p.item_id===group_id+':shelf-'+section+'-0');
   assert.equal(shelf.elevation_mm,700);
   assert.ok(Math.abs(shelf.elevation_mm-top.y-top.height-30)<1e-6);
   assert.equal(top.width,bank.mountWidth-3);
   const fittings=joints.filter(j=>j.joined_panel_id===shelf.item_id);
   assert.equal(fittings.length,section===0&&fixing==='confirmat'?4:8);
   if(section===0&&fixing==='confirmat'&&thickness!==18)assert.ok(fittings.every(j=>j.source_file==='MF_confirmat_7x50_side_'+thickness+'.fr3d'));
  }
  const common=joints.filter(j=>j.host_blank_id==='cover:divider-0');
  for(const left of common.filter(j=>j.rotation===180))for(const right of common.filter(j=>j.rotation===0))assert.ok(Math.abs(left.position.z-right.position.z)>=8);
  assert.deepEqual(f.shelfChoices,[['6/48846'],['board/95388']]);
 }
});

test('reopening an earlier fitted wardrobe keeps the stored reveal until applying new questionnaire settings',()=>{
 const orig={...fields,recipe:'divided',shelves:2,drawerBanks:[{...equal(3,30),height:603,bottomOffset:0},null]};
 const before=buildCarcass(orig).drawerBanks[0].faces;
 assert.equal(before[0].height,180);
 const next=buildCarcass(wardrobeSpec(orig)).drawerBanks[0].faces;
 assert.equal(next[0].height,170.5);
 assert.equal(orig.drawerBanks[0].coverFixing,undefined);
});


test('install inset drawers in the selected upper 1073 mm opening before choosing any doors',()=>{
 const f={width:1000,height:2200,depth:577,thickness:18,sections:1,sectionShelves:[1],back:true,clearLayout:true,drawerFixing:'cam_dowel'};
 const ui={fields:f,output:{},previewBuilt:buildCarcass(wardrobeSpec(f)),changed(){}};
 installBank(ui,0,1);
 assert.equal(ui.output.textContent,undefined);
 const spec=wardrobeSpec(ui.fields);
 assert.equal(spec.front,undefined);assert.deepEqual(spec.sectionShelves,[2]);
 assert.deepEqual(spec.shelfChoices,[['board/cam_dowel','board/cam_dowel']]);
 const build=buildCarcass(spec),bank=build.drawerBanks[3];
 assert.equal(bank.internal,true);assert.deepEqual([bank.spacerL,bank.spacerR],[0,0]);
 assert.equal(build.parts.find(p=>p.key==='shelf-0-0').item.elevation_mm,1091);
 assert.equal(bank.base,1109);assert.equal(bank.faces.length,3);
 assert.equal(bank.faces[0].width,961);
 const top=bank.faces.at(-1),cover=build.parts.find(p=>p.key==='shelf-0-1').item.elevation_mm;
 assert.ok(Math.abs(cover-top.y-top.height-30)<.001);
});


test('overlay fronts can be chosen before adding a bank that fits only at overlay depth',()=>{
 const fields={width:600,height:1800,depth:260,thickness:18,sections:1,sectionShelves:[1],back:true,clearLayout:true,drawerFixing:'cam_dowel'};
 const ui={fields,output:{},changed(){}};
 installBank(ui,0,0);
 assert.match(ui.output.textContent,/255 мм/);assert.equal(ui.fields.drawerBanks,undefined);
 installBank(ui,0,0,null,false,'external');
 const bank=buildCarcass(wardrobeSpec(ui.fields)).drawerBanks[0];
 assert.equal(bank.internal,false);assert.equal(bank.rail.length,250);
});

import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {WardrobeMotion} from '../../backend/v2/cabinet_assets/planner/wardrobe-motion.mjs';
import {clearanceSession} from '../../backend/v2/cabinet_assets/planner/wardrobe-clearance.mjs';

function gapWardrobe(side='left',opening='soft',depth=600,gap=30,width=null){
 const b={...equal(3,gap),railFamily:'concealed',opening};
 b.faces.forEach(f=>f.width=width);
 return wardrobeSpec({width:600,height:1800,depth,thickness:18,sections:1,back:true,sectionShelves:[1],
  shelfLevels:[[{mode:'floor',mm:680}]],front:{swing:side,offset:90},drawerBanks:[b]});
}
test('30 mm gap, milled spacer, plate and cup agree during swing and full slide on both hands',()=>{
 for(const [side,opening,rotation] of [['left','soft',0],['right','soft',90],['left','push',180],['right','push',270]]){
  const spec=gapWardrobe(side,opening),group_id='qa',built=buildCarcass(spec,{idPrefix:group_id});
  const position={x:100,z:350,elevation_mm:140,rotation},bank=built.drawerBanks[0];
  const items=placeCarcass(built,position).map(it=>({...it,assistant_carcass:{group_id,spec,position}}));
  const part=key=>items.find(p=>p.item_id==='qa:'+key),door=part('door-'+side),spacer=part('drawer-0-spacer-'+side);
  const face=part('drawer-0-0-face'),axes=doorHinges(door,items);
  assert.equal(localPoint(door,rotation).z-door.depth/2-localPoint(face,rotation).z-face.depth/2,5);
  assert.equal(spec.drawerBanks[0].hingeClearanceMm,5);assert.deepEqual(built.hingeConflicts,[]);
  assert.ok(wardrobeDrawing(built,'sections').svg.includes('data-hinge-article="112595"'));
  for(const [i,g] of bank.faces.slice(1).entries())assert.ok(Math.abs(axes[i].position.y-position.elevation_mm-(g.y-15))<.001);
  const cuts=blankNativeItem(spacer,{name:'board',thickness:18},items).blank.spacer_cuts;
  assert.equal(cuts.length,2);
  for(const [i,[lo,hi]] of cuts.entries()){
   const y=axes[i].position.y-spacer.elevation_mm;
   assert.ok(Math.abs(lo-y+(side==='left'?27:28))<.001&&Math.abs(hi-y-(side==='left'?28:27))<.001);
   for(const f of bank.faces){
    const screw=f.boxY+(opening==='push'?21:20.5)-bank.base;
    assert.ok(screw<=lo-5||screw>=hi+5);
   }
  }
  const factory=new MeshFactory({items,material:()=>null,room:{height:3000}},()=>{});
  const entries=new Map(items.map(p=>[p.item_id,{group:factory.buildBlank(p)}]));
  assert.equal(entries.get(part(side).item_id).group.children.filter(m=>m.userData.hingePart==='body').length,axes.length);
  assert.equal(entries.get(door.item_id).group.children.filter(m=>m.userData.hingePart==='cup').length,axes.length);
  const motion=new WardrobeMotion();motion.show(group_id);
  const session=clearanceSession(items,entries,null,motion);
  assert.deepEqual(session.swing(door,0,105),{degrees:105,contact:null});
  motion.setDegrees(door.item_id,90);
  for(const i of [0,1,2])assert.equal(session.drawer('0-'+i),null);
  for(const {group} of entries.values())factory.release(group);
  factory.dispose();
 }
});
test('a short mounting depth retains the same guide, and an already clear front keeps its original depth',()=>{
 for(const [depth,gap,width,change] of [[474,30,null,0],[475,30,null,0],[476,30,null,2],[600,65,null,0],[600,30,528,0]]){
  const spec=gapWardrobe('left','soft',depth,gap,width),built=buildCarcass(spec,{idPrefix:'qa'}),bank=built.drawerBanks[0];
  assert.equal(bank.hingeSetback,change);assert.equal(spec.drawerBanks[0].hingeClearanceMm,change?5:undefined);
  if(depth<500)assert.equal(bank.rail.article,'113647');
  const old=structuredClone(spec);delete old.drawerBanks[0].hingeClearanceMm;
  const previous=buildCarcass(old,{idPrefix:'qa'}),before=previous.drawerBanks[0];
  assert.equal(before.hingeSetback,0);assert.equal(before.rail.article,bank.rail.article);
  assert.deepEqual(before.faces.map(f=>[f.y,f.height,f.width]),bank.faces.map(f=>[f.y,f.height,f.width]));
  assert.equal(before.bodyFront-bank.bodyFront,change);
  if(depth<476)assert.ok(built.hingeLocations[0].y>bank.top);
 }
});

test('an offset upper guide displaces the hinge inside the same gap before another gap is considered',()=>{
 const spec=gapWardrobe(),group_id='qa',built=buildCarcass(spec,{idPrefix:group_id});
 const items=built.items.map(it=>({...it,assistant_carcass:{group_id,spec}})),part=k=>items.find(p=>p.item_id==='qa:'+k);
 const door=part('door-left'),mid=doorHinges(door,items)[0].position.y;
 for(const side of ['left','right'])part('drawer-0-1-side-'+side).elevation_mm-=10;
 const y=doorHinges(door,items)[0].position.y;
 assert.ok(y<mid&&y>=mid-6);
 const guideBottom=part('drawer-0-1-side-left').elevation_mm-17;
 assert.ok(guideBottom-y>=9);
});
