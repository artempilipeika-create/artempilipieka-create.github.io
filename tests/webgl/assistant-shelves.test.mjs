import test from 'node:test';
import assert from 'node:assert/strict';
import {resizeDividerChoices,wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {nativeShelfSupports} from '../../backend/v2/cabinet_assets/planner/sekura.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
const base={width:1000,height:2200,depth:500,sections:2,sectionShelves:[2,3],back:false,thickness:18};
test('mixed questionnaire preserves shelf tops and exact native articles after a quarter turn',()=>{
 const choices=[['4/48846','board/134286'],['board/95388','6/80936','8/64145']];
 const simple=buildCarcass(wardrobeSpec(base),{idPrefix:'q'});
 const built=buildCarcass(wardrobeSpec({...base,shelfChoices:choices}),{idPrefix:'q'});
 for(const [i,it] of built.items.entries())assert.equal(it.elevation_mm+it.height,simple.items[i].elevation_mm+simple.items[i].height);
 const items=placeCarcass(built,{x:120,z:400,rotation:90,elevation_mm:0}),supports=nativeShelfSupports(items);
 assert.equal(supports.length,20);
 for(const row of choices)for(const v of row)assert.equal(supports.filter(h=>h.article===v.split('/')[1]).length,4);
 const casper=supports.filter(h=>h.article==='134286');
 assert.equal(new Set(casper.map(h=>h.source_sha256)).size,2);
 assert.ok(casper.every(h=>h.source_file.includes('18мм')));
 for(const i of items.filter(i=>i.blank_shelf&&!i.blank_shelf.startsWith('board/'))){
   const g=blankNativeItem(i,null);assert.equal(g.glass_shelf,true);assert.equal(g.target.height,i.height);assert.ok(g.source_file.includes(i.height+'мм'));assert.equal(i.blank_edge_code,'0000');
 }
 assert.throws(()=>wardrobeSpec({...base,shelfChoices:[['4/80936']]}),/держатель/);
});

import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
test('cabinet joints follow both inset panels independently of shelves and project rotation',()=>{
 const spec=wardrobeSpec({...base,joints:{top:'cam_dowel',bottom:'confirmat'},dividerJoints:[{top:'cam_dowel',bottom:'confirmat'}]});
 const built=buildCarcass(spec,{idPrefix:'q'});
 for(const rotation of [0,90,180,270]){
   const shift={x:220,z:310,rotation,elevation_mm:90};
   const panels=placeCarcass(built,shift).map(i=>({...i,assistant_carcass:{group_id:'q',spec}}));
   const hardware=nativeCarcassJoints(panels);
   assert.equal(hardware.length,18);
   const vertical=hardware.filter(h=>h.joint_roll_deg);
   assert.equal(vertical.length,6);
   for(const v of vertical){
     const top=v.host_blank_id==='q:top',divider=panels.find(p=>p.item_id===v.joined_panel_id);
     assert.equal(divider.item_id,'q:divider-0');
     assert.equal(v.joint_roll_deg,top?-90:90);assert.equal(v.rotation,rotation);
     assert.equal(v.position.y,divider.elevation_mm+(top?divider.height:0));
     const offset=localPoint({x:v.position.x-divider.x,z:v.position.z-divider.z},rotation);
     assert.equal(Math.abs(offset.x),0);assert.equal(divider.depth/2-Math.abs(offset.z),v.joint_part==='dowel'?102:70);
   }
   for(const h of hardware.filter(h=>!h.joint_roll_deg)){
     const panel=panels.find(i=>i.item_id===h.joined_panel_id);
     const local=localPoint({x:h.position.x-panel.x,z:h.position.z-panel.z},rotation);
     assert.equal(Math.abs(local.x),panel.width/2);
     assert.equal(panel.depth/2-Math.abs(local.z),{cam:100,dowel:132,confirmat:70}[h.joint_part]);
     assert.equal(h.position.y,panel.elevation_mm+9);
     assert.equal(h.rotation,(rotation+(h.host_blank_id==='q:right'?180:0))%360);
   }
 }
 assert.equal(nativeCarcassJoints(built.items).filter(v=>v.joint_part==='confirmat').length,4);
 assert.throws(()=>wardrobeSpec({...base,depth:250,joints:spec.joints}),/276/);
 assert.throws(()=>wardrobeSpec({...base,thickness:16,joints:spec.joints}),/18/);
});

test('fixed shelf patterns keep the same working height, meet both sides and exclude holders',()=>{
 const spec=wardrobeSpec({...base,sections:1,sectionShelves:[3],shelfChoices:[['board/confirmat','board/cam_dowel','4/48846']]});
 const built=buildCarcass(spec,{idPrefix:'p'});
 for(const rotation of [0,90,180,270]){
  const items=placeCarcass(built,{x:520,z:360,elevation_mm:50,rotation});
  const joints=nativeCarcassJoints(items);
  assert.equal(joints.length,12);
  for(const h of joints){
   const p=items.find(i=>i.item_id===h.joined_panel_id);
   const offset=localPoint({x:h.position.x-p.x,z:h.position.z-p.z},rotation);
   assert.equal(p.depth/2-Math.abs(offset.z),h.joint_part==='dowel'?102:70);
   assert.equal(Math.abs(offset.x),p.width/2);
   assert.equal(h.position.y,p.elevation_mm+9);
   assert.equal(p.blank_binding.gap_left_mm,0);
  }
  assert.equal(nativeShelfSupports(items).length,4);
  assert.equal(items.find(i=>i.blank_shelf==='4/48846').blank_binding.gap_right_mm,1);
 }
 assert.throws(()=>wardrobeSpec({...base,sectionShelves:[1,1],shelfChoices:[['board/confirmat'],['board/cam_dowel']]}),/Встречная присадка/);
});

test('both outer sides receive PVC according to the covering panels and individual assignments',()=>{
 for(const [recipe,back,expected] of [['shelves',true,'1011'],['shelves',false,'1111'],['cap',false,'1110'],['base',true,'1001']]){
  const model=buildCarcass({recipe,back},{idPrefix:'s'});
  assert.deepEqual(model.items.slice(0,2).map(x=>x.blank_edge_code),[expected,expected]);
  const manual=buildCarcass({recipe,back},{idPrefix:'s',edges:{left:'0000'}});
  assert.deepEqual(manual.items.slice(0,2).map(x=>x.blank_edge_code),['0000',expected]);
 }
});

test('divider choices follow each present stand and override both outer joints independently',()=>{
 const fields={...base,sections:3,sectionShelves:[0,0,0],joints:{top:'cam_dowel',bottom:'cam_dowel'}};
 const defaults=wardrobeSpec(fields).dividerJoints;
 assert.deepEqual(defaults,[{top:'confirmat',bottom:'confirmat'},{top:'confirmat',bottom:'confirmat'}]);
 fields.dividerJoints=[{top:'none',bottom:'cam_dowel'},{top:'confirmat',bottom:'none'}];
 const spec=wardrobeSpec(fields);
 const panels=buildCarcass(spec,{idPrefix:'q'}).items.map(i=>({...i,assistant_carcass:{group_id:'q',spec}}));
 const vertical=nativeCarcassJoints(panels).filter(h=>h.joint_roll_deg);
 assert.deepEqual(vertical.map(h=>[h.joined_panel_id,h.host_blank_id,h.joint_part]),[
   ...['cam','dowel','cam','dowel'].map(kind=>['q:divider-0','q:bottom',kind]),
   ...['confirmat','confirmat'].map(kind=>['q:divider-1','q:top',kind])
 ]);
 const legacy={...spec};delete legacy.dividerJoints;
 assert.equal(nativeCarcassJoints(panels.map(i=>({...i,assistant_carcass:{group_id:'q',spec:legacy}}))).filter(h=>h.joint_roll_deg).length,16);
 fields.sections=2;resizeDividerChoices(fields);
 assert.deepEqual(fields.dividerJoints,[{top:'none',bottom:'cam_dowel'}]);
 fields.sections=3;resizeDividerChoices(fields);
 assert.deepEqual(fields.dividerJoints[1],defaults[1]);
 fields.sections=1;resizeDividerChoices(fields);assert.equal(fields.dividerJoints,undefined);
});
