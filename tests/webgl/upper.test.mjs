import test from 'node:test';
import assert from 'node:assert/strict';
import {WALL_PRODUCTION,PRODUCTION_MODELS,PILOT_PRODUCTION,DRAWER_SLIDE_RULE,productionParts,productionShelves,productionHardware,facadeCells,kitchenSettings,kitchenLegs,heights,dimensionPatch,elevation} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';

const room={width:4200,depth:3200,height:2700};
const regularIds=['bazis.858266606bc5','bazis.2175c60e84a6','bazis.877ba2f68d92'];
const dryerIds=['bazis.b89bf9852860','bazis.60f79b573cd1','bazis.1ac4fadd97b7'];
const item=(id,changes={})=>{
  const p=PRODUCTION_MODELS[id];
  const it={item_id:id,bazis_id:id,bazis_sha256:p.source_sha256,module_type:p.tier==='wall'?'wall_cabinet':'base_cabinet',name:p.label,
    width:600,height:p.body_height+p.base_height,body_height:p.body_height,base_height:p.base_height,worktop_thickness:p.worktop_thickness,
    depth:p.scene_depth,base:p.tier==='wall'?'wall':'legs',layout:p.front_layout?'drawers':'doors',drawers:p.front_layout?.heights.length||0,
    handles:'handles',x:0,z:0,rotation:0,...changes};
  it.shelves=structuredClone(productionShelves(it,p));
  return it;
};
const parts=it=>productionParts(it,{production:PRODUCTION_MODELS[it.bazis_id]});
const byName=(ps,name)=>ps.filter(p=>p.name===name).map(p=>[p.length,p.width,p.thickness]);

test('Production registry keeps nine lower modules plus six upper modules',()=>{
  assert.equal(Object.keys(PRODUCTION_MODELS).length,15);
  assert.deepEqual(Object.keys(WALL_PRODUCTION),[...regularIds,...dryerIds]);
});

for(const [id,label,sha,file,fronts,hinges,sides] of [
  ['bazis.858266606bc5','ВМД1 L','858266606bc5e6f36a96635c155beb8f86161ce869956a8f961f27406db7ebc2','ВМД1-600. отк L.fr3d',[[717,597]],2,['left']],
  ['bazis.2175c60e84a6','ВМД1 P','2175c60e84a6eb6eeefa62eaddc611f2180b6a3060a0ea3aa1b5305ffbcc6ed5','ВМД1-600. отк P.fr3d',[[717,597]],2,['right']],
  ['bazis.877ba2f68d92','ВМД2','877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3','ВМД2-600..fr3d',[[717,297],[717,297]],4,['left','right']]
])test(label+': exact upper donor panels and one shelf up to 850',()=>{
  const p=WALL_PRODUCTION[id],it=item(id),bom=parts(it),cells=facadeCells(it,{production:p}),hw=productionHardware(it,p);
  assert.equal(p.source_sha256,sha);assert.equal(p.source_file,file);
  assert.deepEqual(byName(bom,'Левая Боковая'),[[720,317,18]]);
  assert.deepEqual(byName(bom,'Правая Боковая'),[[720,317,18]]);
  assert.deepEqual(byName(bom,'Крыша'),[[564,317,18]]);
  assert.deepEqual(byName(bom,'Дно'),[[564,317,18]]);
  assert.deepEqual(byName(bom,'Полка'),[[562,317,18]]);
  assert.deepEqual(byName(bom,'З.С'),[[716,596,3]]);
  assert.deepEqual(bom.filter(x=>x.role==='front').map(x=>[x.length,x.width]),fronts);
  assert.deepEqual(cells.map(x=>[x.h,x.w]),fronts);
  assert.deepEqual(p.doors.map(x=>x.side),sides);assert.equal(hw.hinge_count,hinges);
  assert.equal(hw.items.find(x=>x.key==='shelf-support-marcopol').quantity,4);
  assert.equal(kitchenSettings(it),null);assert.equal(kitchenLegs(it),null);
  assert.equal(elevation(it,room),1480);
});

for(const id of regularIds)test(WALL_PRODUCTION[id].label+': height above 850 creates two evenly spaced shelves',()=>{
  const p=WALL_PRODUCTION[id],src=item(id),it=dimensionPatch(src,{height:900}),shelves=productionShelves(it,p),bom=parts(it);
  assert.equal(it.body_height,900);assert.equal(shelves.length,2);
  assert.deepEqual(shelves.map(x=>x.offset_mm),[300,600]);
  assert.deepEqual(byName(bom,'Полка'),[[562,317,18],[562,317,18]]);
  assert.equal(productionHardware(it,p).items.find(x=>x.key==='shelf-support-marcopol').quantity,8);
});

for(const [id,label,sha,file,fronts,hinges,sides] of [
  ['bazis.b89bf9852860','ВМД1 L · Сушка','b89bf98528601e2bc74e52bc19cc6904a20ff90ed6f0785c1d599c7aac4250fd','ВМД1-600. отк L. (Сушка).fr3d',[[717,597]],2,['left']],
  ['bazis.60f79b573cd1','ВМД1 P · Сушка','60f79b573cd1ae910e0f5ec2796798e4250e3c2e0a2df0f52372d528dace9005','ВМД1-600. отк P. (Сушка).fr3d',[[717,597]],2,['right']],
  ['bazis.1ac4fadd97b7','ВМД2 · Сушка','1ac4fadd97b74ebaf1d52e9d37c5d3e8652857c9422032e64dd3d0671911a63b','ВМД2-600.(Сушка).fr3d',[[717,297],[717,297]],4,['left','right']]
])test(label+': dryer width follows module width and shelf appears only above 850',()=>{
  const p=WALL_PRODUCTION[id],it=item(id),bom=parts(it),hw=productionHardware(it,p);
  assert.equal(p.source_sha256,sha);assert.equal(p.source_file,file);
  assert.equal(p.dryer.width_equals_module,true);assert.equal(p.dryer.width_step_mm,100);
  assert.equal(byName(bom,'Полка').length,0);
  assert.deepEqual(byName(bom,'З.С'),[[716,596,3]]);
  assert.deepEqual(bom.filter(x=>x.role==='front').map(x=>[x.length,x.width]),fronts);
  assert.deepEqual(p.doors.map(x=>x.side),sides);assert.equal(hw.hinge_count,hinges);
  const dryer=hw.items.find(x=>x.key==='dish-dryer');assert.equal(dryer.width_mm,600);assert.match(dryer.name,/600 MOUNT/);
  assert.equal(hw.items.some(x=>x.key==='shelf-support-marcopol'),false);

  const wide=dimensionPatch(it,{width:700}),wideHw=productionHardware(wide,p);
  assert.equal(wideHw.items.find(x=>x.key==='dish-dryer').width_mm,700);assert.match(wideHw.items.find(x=>x.key==='dish-dryer').name,/700 MOUNT/);

  const tall=dimensionPatch(wide,{height:900}),shelves=productionShelves(tall,p),tallHw=productionHardware(tall,p),tallBom=parts(tall);
  assert.equal(shelves.length,1);assert.deepEqual(shelves.map(x=>x.offset_mm),[600]);
  assert.deepEqual(byName(tallBom,'Полка'),[[662,317,18]]);
  assert.equal(tallHw.items.find(x=>x.key==='shelf-support-marcopol').quantity,4);
});

test('Drawer guide selection follows Martin Forest depth mapping and native FR3D metadata',()=>{
  assert.deepEqual(DRAWER_SLIDE_RULE.control_points[250],[[250,0],[300,1],[1000,0]]);
  assert.deepEqual(DRAWER_SLIDE_RULE.control_points[600],[[600,0],[1000,1]]);
  for(const id of ['bazis.39f282e08f0c','bazis.5f5697e39e27']){
    const p=PILOT_PRODUCTION[id],native=item(id),nativeHw=productionHardware(native,p);
    assert.equal(native.depth,510);assert.equal(nativeHw.slide_length_mm,500);
    const expected=new Map([[300,250],[350,300],[400,350],[450,400],[500,450],[510,500],[550,500],[600,550],[1000,600]]);
    for(const [depth,length] of expected){
      const resizedHw=productionHardware({...native,depth},p);
      assert.equal(resizedHw.slide_length_mm,length);
      assert.equal(resizedHw.slide_selection,'native_auto_by_depth');
      assert.equal(resizedHw.slide_rule.mode,'native_fr3d_parameter_table');
    }
  }
});
