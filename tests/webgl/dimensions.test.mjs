import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionRuns,sceneDimensions,clearanceDimensions,dimensionValue,dimensionEdit} from '../../backend/v2/cabinet_assets/planner/dimension-geometry.mjs';
import {rotateXZ,dimensionPatch,heights} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const room={width:6000,depth:5000,height:2800};
const item=(id,x=0,extra={})=>({item_id:id,name:id,module_type:'base_cabinet',width:600,height:820,depth:510,base:'legs',legHeightMm:100,base_height:100,body_height:720,countertopThicknessMm:38,worktop_thickness:38,rotation:0,x,z:0,...extra});
for(const rotation of [0,90,180,270])test('Dimensions follow cabinet axes and row at '+rotation,()=>{
  const items=[0,1,2].map(i=>({...item(String(i)),...rotateXZ(i*600,0,rotation),rotation}));
  const dims=sceneDimensions(items,room,'1'),total=dims.find(d=>d.kind==='run');
  assert.equal(total.value,1800);assert.equal(Math.hypot(total.b.x-total.a.x,total.b.z-total.a.z),1800);
  for(const d of dims.filter(d=>d.kind==='module'))assert.equal(Math.round(Math.hypot(d.b.x-d.a.x,d.b.y-d.a.y,d.b.z-d.a.z)),d.value);
  assert.equal(dims.filter(d=>d.axis==='width').length,3);assert.equal(dims.filter(d=>d.axis==='height').length,1);
  const w=dims.find(d=>d.id==='1:width'),axis=rotateXZ(600,0,rotation);assert.equal(w.b.x-w.a.x,axis.x);assert.equal(w.b.z-w.a.z,axis.z);
});
test('Rows stop at gaps and split tiers and perpendicular returns',()=>{
  const items=[item('a'),item('b',600),item('gap',1220),item('upper',0,{module_type:'wall_cabinet',base:'wall',height:720}),item('corner-return',600,{z:900,rotation:90})];
  assert.deepEqual(dimensionRuns(items,room).filter(r=>r.items.length>1).map(r=>r.items.map(i=>i.item_id)),[['a','b']]);
});
test('Overall height edit preserves base and thickness and respects disabled countertop',()=>{
  const it=item('a');assert.equal(dimensionValue(it,'height'),858);
  const next=dimensionPatch(it,dimensionEdit(it,'height',900));assert.equal(next.height,862);assert.equal(heights(next).body_height,762);assert.equal(heights(next).base_height,100);assert.equal(heights(next).worktop_thickness,38);
  const noTop={...it,countertopEnabled:false};assert.equal(dimensionValue(noTop,'height'),820);assert.deepEqual(dimensionEdit(noTop,'height',900),{height:900});
  for(const value of [NaN,Infinity,0,-10,600.5])assert.throws(()=>dimensionEdit(it,'width',value));
});
test('Clearance uses nearest closed facade envelope and ignores other height tiers',()=>{
  const it=item('a'),near=item('near',800),far=item('far',1500),upper=item('upper',600,{module_type:'wall_cabinet',base:'wall',height:720});
  const dims=clearanceDimensions(it,[it,far,upper,near],room);
  assert.equal(dims.find(d=>d.id==='gap:x1').value,200);assert.match(dims.find(d=>d.id==='gap:x1').title,/near/);
  assert.equal(dims.find(d=>d.id==='gap:z1').value,2225); // 2500 - 255 - 20 facade
  assert.equal(clearanceDimensions(it,[it,near,far],room,['near','far']).find(d=>d.id==='gap:x1').value,2700);
});
test('Dimension calculation does not change saved scene or extend open-door bounds',()=>{
  const it=item('a',0,{doors_open:true}),items=[it],before=JSON.stringify(items);
  sceneDimensions(items,room,'a');clearanceDimensions(it,items,room);dimensionRuns(items,room);
  assert.equal(JSON.stringify(items),before);
  assert.equal(sceneDimensions(items,room,'a').some(d=>d.axis==='depth'),false);
});
test('Width chains are above each tier and upper cabinets share their top datum',()=>{
  const lower=item('a'),upper=item('b',0,{module_type:'wall_cabinet',base:'wall',height:720}),short=item('c',600,{module_type:'wall_cabinet',base:'wall',height:500});
  const dims=sceneDimensions([lower,upper,short],room,'a');
  assert.equal(dims.find(d=>d.id==='a:width').a.y,858);
  assert.equal(dims.find(d=>d.id==='b:width').a.y,2300);assert.equal(dims.find(d=>d.id==='c:width').a.y,2300);
  assert.equal(dims.find(d=>d.kind==='run').value,1200);
  assert.equal(dims.filter(d=>d.axis==='height').length,2);assert.ok(dims.every(d=>d.axis!=='depth'));
});
test('Group move clearance starts at its outer envelope',()=>{
  const a=item('a'),b=item('b',600),outside=item('c',1400);
  const gap=clearanceDimensions([a,b],[a,b,outside],room).find(d=>d.id==='gap:x1');
  assert.equal(gap.a.x,900);assert.equal(gap.value,200);
});
