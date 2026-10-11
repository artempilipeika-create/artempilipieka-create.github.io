import test from 'node:test';
import assert from 'node:assert/strict';
import {openingCheck,checkProject,polygonsOverlap} from '../../backend/v2/cabinet_assets/planner/project-checks.mjs';
import {PRODUCTION_MODELS,VITRINE_VARIANTS} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const room={width:4200,depth:3600,height:3000,setup_complete:true,survey:'none',features:[]};
const item=(extra={})=>({item_id:'a',name:'Шкаф',module_type:'base_cabinet',x:0,z:0,rotation:0,width:600,height:820,depth:510,base:'legs',base_height:100,layout:'doors',...extra});
const door=(side='left',angle=90)=>({facade:{kind:'door'},size:{x:596,y:716,z:18},position:{x:0,y:460,z:266},pivot:{x:side==='left'?-298:298,z:266},hinge_side:side,open_angle:angle});
test('finds door collision along its arc, not just its final position',()=>{
  const a=item(),b=item({item_id:'b',name:'Остров',x:80,z:630,width:150,depth:200});const r=openingCheck(a,{},[a,b],room,[door()]);assert.ok(r.collisions.some(c=>c.targetId==='b'));assert.equal(r.checked,1);
});
test('adjacent closed cabinets and a high wall cabinet do not obstruct a door',()=>{
  const a=item(),b=item({item_id:'b',x:600}),c=item({item_id:'c',module_type:'wall_cabinet',x:0,z:700,height:600,base:'wall'});
  assert.deepEqual(openingCheck(a,{},[a,b,c],room,[door()]).collisions,[]);
});
test('rotated cabinet door is checked against the correct room wall',()=>{
  const a=item({rotation:90,x:-1800});assert.ok(openingCheck(a,{},[a],room,[door()]).collisions.some(c=>c.target==='стена помещения'));
});
test('sweep finds a measured radiator but ignores utility markers with zero projection',()=>{
  const a=item({z:1100}),f={id:'rad',kind:'radiator',wall:'c',offset:1800,width:600,elevation:0,height:900,projection:350};
  assert.ok(openingCheck(a,{},[a],{...room,features:[f]},[door()]).collisions.some(c=>c.targetId==='rad'));
  assert.ok(!openingCheck(a,{},[a],{...room,features:[{...f,projection:0}]},[door()]).collisions.some(c=>c.targetId==='rad'));
});
test('unknown angle is explicitly unverified',()=>{
  const a=item();const r=openingCheck(a,{},[a],room,[door('left',null)]);assert.equal(r.checked,0);assert.equal(r.unknown.length,1);
});
test('drawer extension uses hardware travel and cabinet rotation',()=>{
  const a=item({rotation:180}),b=item({item_id:'b',z:-850});const p={hardware:{slide_length_mm:500}};
  const r=openingCheck(a,{production:p},[a,b],room,[{...door(),facade:{kind:'drawer'}}]);assert.ok(r.collisions.some(c=>c.kind==='drawer'&&c.targetId==='b'));
});
test('vitrine fixed glass/profile never generates missing LDSP warning',()=>{
  const v=VITRINE_VARIANTS[0],p=PRODUCTION_MODELS[v.id],a=item({bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,module_type:'tall_cabinet',height:2200,body_height:2100,base_height:100,depth:600,body_variant_id:'body',glass_shelf_count:3,handles:'handleless'});
  const r=checkProject({room,items:[a]},{template:()=>({production:p}),material:id=>id==='body'?{name:'Белый'}:null});
  assert.equal(r.issues.filter(i=>i.code==='material').length,0);assert.ok(r.issues.some(i=>i.code==='native-adjustment'));assert.equal(r.mechanisms,1);
});
test('material and missing prices are actionable and source absence is flagged',()=>{
  const a=item(),r=checkProject({room,items:[a]},{template:()=>null});
  for(const code of ['material','price','native-source'])assert.ok(r.issues.some(i=>i.code===code&&i.itemId==='a'));
});
test('polygon touching is not an intersection',()=>{
  const a=[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}],b=a.map(p=>({x:p.x+10,z:p.z}));assert.equal(polygonsOverlap(a,b),false);
});
