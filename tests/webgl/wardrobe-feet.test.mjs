import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {footPlan,nativeFeet} from '../../backend/v2/cabinet_assets/planner/wardrobe-feet.mjs';
import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
const base={width:800,height:2000,depth:500,thickness:18,sections:1,sectionShelves:[0],back:true,
 feet:{article:'118779',front:50,rear:40},joints:{top:'cam_dowel',bottom:'confirmat'}};
test('wardrobe top and bottom construction, front and rear feet follow panels and rotated drill hosts',()=>{
 for(const bottomFit of ['overlay','inset'])for(const topFit of ['overlay','inset']){
  const spec=wardrobeSpec({...base,bottomFit,topFit,sections:2,sectionShelves:[1,0],dividerPositions:[300]});
  const built=buildCarcass(spec,{idPrefix:'q'}),items=placeCarcass(built,{rotation:90,x:200,z:300,elevation_mm:0}).map(p=>({...p,assistant_carcass:{group_id:'q',spec}}));
  assert.equal(items.find(p=>p.item_id==='q:left').height,2000-(bottomFit==='overlay'?18:0)-(topFit==='overlay'?18:0));
  assert.equal(items.find(p=>p.item_id==='q:bottom').width,bottomFit==='overlay'?800:764);
  assert.equal(nativeCarcassJoints(items).length,16);
  const feet=nativeFeet(items);
  assert.equal(feet.length,6);
  assert.ok(feet.every(p=>p.position.y===10));
  assert.equal(feet.filter(p=>p.host_blank_id==='q:bottom').length,bottomFit==='overlay'?6:2);
  const plan=footPlan(spec);
  assert.deepEqual([...new Set(plan.map(p=>p.x))],[-391,-73,391]);
  assert.deepEqual([...new Set(plan.map(p=>p.z))],[200,-210]);
 }
 assert.equal(footPlan(wardrobeSpec({...base,width:900})).length,4);
 assert.equal(footPlan(wardrobeSpec({...base,width:901})).length,6);
 assert.throws(()=>wardrobeSpec({...base,feet:{...base.feet,front:70}}),/присадкой/);
 assert.throws(()=>wardrobeSpec({...base,joints:undefined,bottomFit:'overlay',thickness:16}),/толще/);
});
