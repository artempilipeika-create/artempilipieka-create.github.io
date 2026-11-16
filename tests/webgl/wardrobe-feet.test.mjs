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
  assert.equal(feet.length,4);
  assert.ok(feet.every(p=>p.position.y===10));
  assert.equal(feet.filter(p=>p.host_blank_id==='q:bottom').length,bottomFit==='overlay'?4:0);
  const plan=footPlan(spec);
  assert.deepEqual([...new Set(plan.map(p=>p.x))],[-391,391]);
  assert.deepEqual([...new Set(plan.map(p=>p.z))],[200,-210]);
 }
 assert.equal(footPlan(wardrobeSpec({...base,width:800})).length,4);
 assert.equal(footPlan(wardrobeSpec({...base,width:801})).length,6);
 assert.throws(()=>wardrobeSpec({...base,feet:{...base.feet,front:70}}),/присадкой/);
 assert.throws(()=>wardrobeSpec({...base,joints:undefined,bottomFit:'overlay',thickness:16}),/толще/);
});

test('every supplied kitchen foot raises the body and exports a four-edge plinth and the exact source',async()=>{
 const {plinthFeet}=await import('../../backend/v2/cabinet_assets/planner/plinth-options.mjs');
 const {blankNativeItem}=await import('../../backend/v2/cabinet_assets/planner/blanks-native.mjs');
 assert.equal(plinthFeet.length,13);
 for(const leg of plinthFeet){
  const spec=wardrobeSpec({...base,feet:{article:leg.article,front:80,rear:50,left:'side'},edgePolicy:'none',edgeThickness:2});
  const built=buildCarcass(spec,{idPrefix:'q'});
  const items=placeCarcass(built,{rotation:90,x:200,z:300,elevation_mm:0}).map(i=>({...i,assistant_carcass:{group_id:'q',spec}}));
  const panel=items.find(i=>i.item_id==='q:plinth'),bottom=items.find(i=>i.item_id==='q:bottom');
  assert.equal(panel.height,leg.height-3);assert.equal(panel.width,782);assert.equal(panel.elevation_mm,0);
  assert.equal(bottom.elevation_mm,leg.height);assert.equal(items[0].elevation_mm,0);
  const native=blankNativeItem(panel,{name:'ЛДСП',thickness:18});
  assert.equal(native.source_file,'Заготовка_6.ПВХ_в круг..fr3d');
  assert.equal(native.blank.edge_code,'1111');
  assert.equal(native.target.height,leg.height-3);
  assert.equal(native.blank.cut.width,leg.height-3-2*spec.edgeThickness);
  assert.equal(bottom.elevation_mm-(panel.elevation_mm+panel.height),3);
  assert.equal(items[0].height,base.height+leg.height);
  const feet=nativeFeet(items);assert.equal(feet.length,4);
  assert.ok(feet.every(f=>f.host_blank_id===bottom.item_id&&f.position.y===leg.height&&f.source_sha256===leg.sha));
 }
});

test('foot count follows individual width even with shifted dividers; legacy projects keep their drilling',()=>{
 for(const article of ['118779','86505'])for(const width of [799,800,801,1200]){
  const spec=wardrobeSpec({...base,width,sections:3,sectionShelves:[0,0,0],dividerPositions:[160,430],feet:{article,front:80,rear:50}});
  const plan=footPlan(spec),xs=plan.map(p=>p.x);
  assert.equal(plan.length,width>800?6:4);
  assert.deepEqual(plan.filter(p=>p.x===0).map(p=>p.z),width>800?[170,-200]:[]);
  assert.equal(Math.min(...xs),-Math.max(...xs));
  const legacy=structuredClone(spec);delete legacy.feet.layout;
  assert.equal(footPlan(legacy).length,8);
 }
});

test('decorative feet use the chosen finish at each corner and a straight central foot above 800 mm',async()=>{
 const {decorativeFeet,centralFoot,turn}=await import('../../backend/v2/cabinet_assets/planner/decor-feet.mjs');
 for(const leg of decorativeFeet.filter(f=>!f.issue))for(const width of [800,801]){
  const spec=wardrobeSpec({...base,width,feet:{article:leg.article,front:10,rear:16}});
  const built=buildCarcass(spec,{idPrefix:'q'}),plan=footPlan(spec);
  assert.ok(!built.items.some(i=>i.item_id==='q:plinth'));
  assert.equal(plan.length,width===800?4:5);
  const corners=plan.slice(0,4);
  for(const f of corners){
   const [x,z]=turn(leg.sole,f.yaw),[dx,dz]=turn(leg.toe,f.yaw);
   assert.ok((f.x+x)*dx+(f.z+z)*dz>0,leg.name);
  }
  for(const rotation of [0,90,180,270]){
   const items=placeCarcass(built,{rotation,x:400,z:500,elevation_mm:0}).map(i=>({...i,assistant_carcass:{group_id:'q',spec}}));
   const feet=nativeFeet(items);assert.equal(feet.filter(f=>f.source_sha256===leg.sha).length,4);
   assert.ok(feet.every(f=>f.position.y===leg.height));
   if(width===801){
    const c=feet[4],b=items.find(i=>i.item_id==='q:bottom');
    assert.equal(c.article,centralFoot(leg.height).article);assert.deepEqual(c.position,{x:b.x,y:leg.height,z:b.z});
   }
  }
 }
});
