import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {doorPush,doorHinges} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs';
import {pushProducts} from '../../backend/v2/cabinet_assets/planner/wardrobe-push-layout.mjs';
import {chooseHinge} from '../../backend/v2/cabinet_assets/planner/wardrobe-push-ui.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';

function cabinet({swing='left',angle=0,elevation=0,article='72258',mount='auto',support='auto',heightMm=1050,kind='overlay',...custom}={}){
 const sides=swing==='pair'?['left','right']:[swing];
 const push={article,mount,support,heightMm};
 const hinge=chooseHinge(kind,push);
 const hinges=Object.fromEntries(sides.map(s=>['door-'+s,{article:hinge.article,push}]));
 const spec=wardrobeSpec({width:594,height:2000,depth:580,thickness:18,back:true,sections:1,sectionShelves:[1],
   front:{swing,offset:90,hinges},...custom});
 const position={x:350,z:470,rotation:angle,elevation_mm:elevation},built=buildCarcass(spec,{idPrefix:'qa'});
 const items=placeCarcass(built,position).map(p=>({...p,assistant_carcass:{spec,group_id:'qa',position}}));
 const panel=key=>items.find(p=>p.item_id==='qa:'+key);
 const pushOn=side=>doorPush(panel('door-'+side),items);
 return {items,panel,pushOn,hinge};
}

test('all 18 AKS installations use real parts, compatible hinges and the requested absolute pressing height',()=>{
 let count=0;
 for(const [article,p] of Object.entries(pushProducts))for(const [mount,native] of Object.entries(p.mounts)){
  const {panel,pushOn,items,hinge}=cabinet({article,mount,heightMm:1125,elevation:180});
  const [home,catchPlate]=pushOn('left'),door=panel('door-left');
  assert.equal(home.host_blank_id,panel('right').item_id);
  assert.equal(home.wardrobe_push_mount,'right');
  assert.equal(home.push_height_mm,1125);
  assert.equal(home.source_sha256,native.body.sha);
  assert.equal(home.article,article);
  assert.equal(hinge.closing,p.tip==='magnet'?'springless':'reverse');
  assert.ok(doorHinges(door,items).every(h=>h.article===hinge.article));
  if(p.tip==='magnet'){
   assert.equal(catchPlate.host_blank_id,door.item_id);
   assert.equal(catchPlate.joined_panel_id,door.item_id);
   assert.equal(catchPlate.position.z,door.z-door.depth/2);
   assert.equal(catchPlate.source_sha256,native.catch.sha);
  }else assert.equal(catchPlate,undefined);
  count++;
 }
 assert.equal(count,18);
});

test('short right and left fronts use opposite 70 mm offsets in one bottom, with a 2 mm closed gap at every rotation',()=>{
 for(const angle of [0,90,180,270]){
  const {panel,pushOn}=cabinet({width:950,height:720,swing:'pair',angle});
  const bottom=panel('bottom'),cabinetFront=localPoint(bottom,angle).z+bottom.depth/2;
  for(const side of ['left','right']){
   const door=panel('door-'+side),d=localPoint(door,angle),[home,strike]=pushOn(side);
   const free=d.x+(side==='left'?1:-1)*door.width/2,pt=localPoint(home.position,angle);
   assert.equal(home.host_blank_id,bottom.item_id);assert.equal(home.push_install,'bored');
   assert.equal(Math.abs(pt.x-free),70);assert.equal(pt.z,cabinetFront);
   assert.equal(d.z-door.depth/2-cabinetFront,2);
   assert.equal(home.position.y-9,bottom.elevation_mm+9);
   assert.equal(strike.host_blank_id,door.item_id);
  }
 }
});

test('two taller leaves use individual mounting faces and the selected plate kind',()=>{
 for(const kind of ['overlay','half','inset']){
  const {panel,pushOn,items,hinge}=cabinet({width:950,height:1800,swing:'pair',sections:2,sectionShelves:[1,1],kind});
  const left=pushOn('left')[0],right=pushOn('right')[0];
  assert.equal(left.position.y,1050);assert.equal(right.position.y,1050);
  const shared=kind!=='half';
  assert.equal(left.host_blank_id,panel(shared?'divider-0':'left').item_id);
  assert.equal(right.host_blank_id,panel(shared?'divider-0':'right').item_id);
  assert.notEqual(left.wardrobe_push_mount,right.wardrobe_push_mount);
  assert.equal(left.push_install,shared?'surface':'bored');
  const source=hinge.pushNative??hinge;
  assert.ok(doorHinges(panel('door-left'),items).every(h=>h.source_sha256===source.sha));
 }
});

test('fixed shelf can carry the extended pin and the planner falls back to a surface adapter on a recessed support',()=>{
 const sh=cabinet({support:'shelf',shelfChoices:[['board/cam_dowel']]}),[home,strike]=sh.pushOn('left');
 assert.equal(home.host_blank_id,sh.panel('shelf-0-0').item_id);
 assert.equal(home.push_gap_mm,3);assert.equal(home.source_sha256,pushProducts['72258'].mounts.bored.bodyAt3.sha);
 assert.equal(strike.position.z-home.position.z,3);
 assert.throws(()=>cabinet({support:'shelf'}),/свободной опоры/);
 const options={width:950,swing:'pair',sections:2,sectionShelves:[1,1],support:'side'};
 assert.equal(cabinet(options).pushOn('left')[0].push_install,'surface');
 assert.throws(()=>cabinet({...options,mount:'bored'}),/накладной монтаж/);
});
