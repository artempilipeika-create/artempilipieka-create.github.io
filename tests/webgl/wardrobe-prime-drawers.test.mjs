import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';
import {concealedRail,railForOpening} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawers.mjs';
import {drawerStroke} from '../../backend/v2/cabinet_assets/planner/wardrobe-clearance.mjs';

const lengths=[300,350,400,450,500,550];
const articles={soft:[113641,113643,113645,113647,113650,113652],push:[113654,113657,113661,113663,113665,113667]};
function cabinet(depth,banks,rotation=0){
 const fields={width:600*banks.length+18*(banks.length+1),height:1300,depth,sections:banks.length,
  sectionShelves:banks.map(()=>0),thickness:18,back:false,drawerBanks:banks};
 const spec=wardrobeSpec(fields),built=buildCarcass(spec,{idPrefix:'qa',bodyMaterialId:'board18'}),position={x:350,z:460,rotation,elevation_mm:0};
 const items=placeCarcass(built,position).map(i=>({...i,assistant_carcass:{group_id:'qa',spec,position}}));
 return {built,items,hardware:wardrobeHardware(items)};
}
const bank=(opening,faceFixing='cam')=>({kind:'external',faces:[{height:210}],railFamily:'concealed',opening,faceFixing});
for(const [opening,skus] of Object.entries(articles))for(const [i,length] of lengths.entries()){
 test('PRIME '+opening+' '+length+' mm matches both boards and supplier hardware',()=>{
  for(const rotation of [0,90,180,270])for(const fixing of ['cam','plank']){
   const {built,items,hardware}=cabinet(length+5,[bank(opening,fixing)],rotation);
   const part=key=>items.find(p=>p.item_id.endsWith('-0-0-'+key)),floor=part('bottom'),side=part('side-left');
   assert.equal(built.drawerBanks[0].rail.article,String(skus[i]));
   assert.deepEqual([floor.width,floor.depth,floor.height,floor.elevation_mm-side.elevation_mm],[551,length-10,18,12]);
   assert.equal(floor.body_variant_id,'board18');assert.equal(side.depth,length-10);
   assert.equal(Boolean(part('front')),fixing==='plank');
   assert.equal(drawerStroke(items,'qa','0-0'),length);
   const rails=hardware.filter(h=>h.aks_kind==='concealed');assert.equal(rails.length,1);
   assert.deepEqual([rails[0].article,rails[0].span_mm,rails[0].length_mm],[String(skus[i]),600,length]);
   if(opening==='push')assert.equal(rails[0].cut_mm,394);
   assert.equal(hardware.filter(h=>h.joint_part==='cam').length,fixing==='cam'?10:4);
   assert.equal(hardware.filter(h=>h.joint_part==='dowel').length,4);
   assert.equal(hardware.filter(h=>h.aks_kind==='face').length,fixing==='cam'?0:3);
   assert.equal(hardware.filter(h=>h.aks_kind==='bolt'||h.joint_part==='confirmat').length,fixing==='cam'?6:12);
  }
 });
}
test('independent banks and depth boundaries preserve existing ball guides',()=>{
 assert.throws(()=>concealedRail(302),/303/);
 assert.equal(concealedRail(303).length,300);assert.equal(concealedRail(450).length,400);
 assert.equal(railForOpening(605).length,600);
 const {hardware}=cabinet(455,[bank('soft'),bank('push')]);
 const guides=hardware.filter(h=>h.aks_kind==='concealed');
 assert.deepEqual(guides.map(p=>p.article),['113647','113663']);
 assert.ok(Math.abs(guides[1].position.y+41-guides[0].position.y-37.5)>=4);
});
