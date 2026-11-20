import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {localPoint,worldPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
import {drawerCamSeats,wardrobeHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';
import {concealedRail,railForOpening} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawers.mjs';
import {drawerStroke} from '../../backend/v2/cabinet_assets/planner/wardrobe-clearance.mjs';

const lengths=[300,350,400,450,500,550];
const articles={soft:[113641,113643,113645,113647,113650,113652],push:[113654,113657,113661,113663,113665,113667]};
function cabinet(depth,banks,rotation=0,clearWidth=600){
 const fields={width:clearWidth*banks.length+18*(banks.length+1),height:1300,depth,sections:banks.length,
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
   assert.equal(hardware.filter(h=>h.joint_part==='cam').length,fixing==='cam'?14:10);
   assert.equal(hardware.filter(h=>h.joint_part==='dowel').length,fixing==='cam'?14:10);
   assert.equal(hardware.filter(h=>h.aks_kind==='face').length,fixing==='cam'?0:3);
   assert.equal(hardware.filter(h=>h.aks_kind==='bolt'||h.joint_part==='confirmat').length,fixing==='cam'?2:8);
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

function nativePoint(row,x,y,z){
 if(row.joint_back_face)[y,z]=[-z,y];
 const rad=(row.joint_roll_deg??0)*Math.PI/180;
 const after={x:x*Math.cos(rad)-y*Math.sin(rad),z},flat=worldPoint(after,row.rotation);
 return {x:row.position.x+flat.x,y:row.position.y+x*Math.sin(rad)+y*Math.cos(rad),z:row.position.z+flat.z};
}
const near=(a,b)=>Math.abs(a-b)<.001;

test('every PRIME cam has its own coaxially oriented dowel and a cup on the accessible panel face',()=>{
 for(const opening of ['soft','push'])for(const fixing of ['cam','plank'])for(const rotation of [0,90,180,270]){
  for(const [height,width,manual] of [[125,opening==='soft'?200:226,null],[210,600,null],[210,600,fixing==='plank'?60:null]]){
   const b=bank(opening,fixing);b.faces=[{height,...(manual?{width:manual}:{})}];
   const {items,hardware}=cabinet(455,[b],rotation,width),byId=new Map(items.map(p=>[p.item_id,p]));
   const name=r=>byId.get(r.joined_panel_id)?.item_id.split('-').at(-1);
   const cams=hardware.filter(r=>r.joint_part==='cam'),perRear=height===125?1:2;
   assert.equal(hardware.filter(r=>r.aks_kind==='bolt'&&name(r)==='rear').length,0);
   assert.equal(cams.filter(r=>name(r)==='rear').length,2*perRear);
   const bottomFront=cams.filter(r=>r.host_blank_id.endsWith('-face')&&name(r)==='bottom');
   assert.equal(bottomFront.length,width===600&&!manual?2:1);
   for(const [idx,cam] of hardware.entries()){
    if(cam.joint_part!=='cam')continue;
    const dowel=hardware[idx+1];
    assert.equal(dowel.joint_part,'dowel');
    for(const field of ['host_blank_id','joined_panel_id','rotation','joint_roll_deg','joint_back_face'])assert.equal(cam[field],dowel[field]);
    const d=Math.hypot(...['x','y','z'].map(k=>cam.position[k]-dowel.position[k]));
    assert.ok(near(d,32)||height===125&&near(d,16));
    const panel=byId.get(cam.joined_panel_id),seats=drawerCamSeats(panel,items);
    const centre=nativePoint(cam,34,-2.6,0),p=localPoint({x:centre.x-panel.x,z:centre.z-panel.z},rotation);
    assert.ok(seats.some(([,x,y,z])=>near(x,p.x)&&near(y,centre.y-panel.elevation_mm)&&near(z,p.z)),panel.item_id);
    if(name(cam)==='rear'){
     const mouth=nativePoint(cam,34,-9,0),tip=nativePoint(cam,34,4,0);
     assert.ok(near(localPoint(mouth,rotation).z-localPoint(panel,rotation).z,panel.depth/2));
     assert.ok(near(localPoint(mouth,rotation).z-localPoint(tip,rotation).z,13));
    }
   }
   const vertical=hardware.filter(r=>r.joint_part==='confirmat'&&name(r)==='front');
   assert.equal(vertical.length,fixing==='plank'?2:0);
   for(const screw of vertical)for(const row of hardware.filter(r=>r.host_blank_id.endsWith('-face')&&name(r)==='bottom'))
    assert.ok(Math.abs(localPoint(screw.position,rotation).x-localPoint(row.position,rotation).x)>=10-.001);
  }
 }
});
