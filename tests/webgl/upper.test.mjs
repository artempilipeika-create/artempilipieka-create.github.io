import test from 'node:test';
import assert from 'node:assert/strict';
import {WALL_PRODUCTION,PRODUCTION_MODELS,productionParts,facadeCells,kitchenSettings,kitchenLegs,heights,dimensionPatch,elevation} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';

const room={width:4200,depth:3200,height:2700};
const ids=Object.keys(WALL_PRODUCTION);
const item=(id,changes={})=>{
  const p=WALL_PRODUCTION[id];
  return {item_id:id,bazis_id:id,bazis_sha256:p.source_sha256,module_type:'wall_cabinet',name:p.label,
    width:600,height:720,body_height:720,base_height:0,worktop_thickness:0,depth:317,base:'wall',
    layout:'doors',drawers:0,handles:'handles',x:0,z:0,rotation:0,shelves:structuredClone(p.shelves),...changes};
};
const parts=it=>productionParts(it,{production:WALL_PRODUCTION[it.bazis_id]});
const byName=(ps,name)=>ps.filter(p=>p.name===name).map(p=>[p.length,p.width,p.thickness]);

test('Production registry keeps five base modules plus three upper modules',()=>{
  assert.equal(Object.keys(PRODUCTION_MODELS).length,8);
  assert.deepEqual(ids,['bazis.858266606bc5','bazis.2175c60e84a6','bazis.877ba2f68d92']);
});

for(const [id,label,sha,file,fronts,hinges,sides] of [
  ['bazis.858266606bc5','ВМД1 L','858266606bc5e6f36a96635c155beb8f86161ce869956a8f961f27406db7ebc2','ВМД1-600. отк L.fr3d',[[717,597]],2,['left']],
  ['bazis.2175c60e84a6','ВМД1 P','2175c60e84a6eb6eeefa62eaddc611f2180b6a3060a0ea3aa1b5305ffbcc6ed5','ВМД1-600. отк P.fr3d',[[717,597]],2,['right']],
  ['bazis.877ba2f68d92','ВМД2','877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3','ВМД2-600..fr3d',[[717,297],[717,297]],4,['left','right']]
])test(label+': exact upper donor panels, materials and hardware',()=>{
  const p=WALL_PRODUCTION[id],it=item(id),bom=parts(it),cells=facadeCells(it,{production:p});
  assert.equal(p.tier,'wall');assert.equal(p.source_sha256,sha);assert.equal(p.source_file,file);
  assert.deepEqual(p.native_defaults,{width:600,height:720,depth:317});
  assert.deepEqual(byName(bom,'Левая Боковая'),[[720,317,18]]);
  assert.deepEqual(byName(bom,'Правая Боковая'),[[720,317,18]]);
  assert.deepEqual(byName(bom,'Крыша'),[[564,317,18]]);
  assert.deepEqual(byName(bom,'Дно'),[[564,317,18]]);
  assert.deepEqual(byName(bom,'Полка'),[[562,317,18]]);
  assert.deepEqual(byName(bom,'З.С'),[[716,596,3]]);
  assert.deepEqual(bom.filter(x=>x.role==='front').map(x=>[x.length,x.width]),fronts);
  assert.deepEqual(cells.map(x=>[x.h,x.w]),fronts);
  assert.deepEqual(p.doors.map(x=>x.side),sides);assert.equal(p.hardware.hinge_count,hinges);
  assert.equal(p.hardware.hinge_name,'Петля накладная с доводчиком 48мм h2 clip-on PRIME (саморезы, заглушки)');
  assert.deepEqual(Object.fromEntries(p.hardware.items.map(x=>[x.key,x.quantity])),{
    'confirmat-7x50':8,'hanger-white':2,'screw-3x30':4,'nails-1.4x25':52,'shelf-support-marcopol':4
  });
  assert.ok(bom.filter(x=>['body','shelf'].includes(x.role)).every(x=>x.material.name==='ЛДСП- БЕЛЫЙ'));
  assert.ok(bom.filter(x=>x.role==='front').every(x=>x.material.name==='Evagloss P004'));
  assert.ok(bom.filter(x=>x.role==='back').every(x=>x.material.name==='ЛХДФ 3ММ Белый'));
  assert.equal(kitchenSettings(it),null);assert.equal(kitchenLegs(it),null);
  assert.deepEqual(heights(it),{body_height:720,base_height:0,module_height:720,worktop_thickness:0,overall_height_with_worktop:720});
  assert.equal(elevation(it,room),1480);
});

for(const id of ids)test(WALL_PRODUCTION[id].label+': resizing preserves the wall-cabinet construction rules',()=>{
  const p=WALL_PRODUCTION[id],src=item(id),it=dimensionPatch(src,{width:800,height:900,depth:400}),bom=parts(it);
  assert.equal(it.height,900);assert.equal(it.body_height,900);assert.equal(it.base_height,0);assert.equal(it.depth,400);
  assert.deepEqual(byName(bom,'Левая Боковая'),[[900,400,18]]);
  assert.deepEqual(byName(bom,'Правая Боковая'),[[900,400,18]]);
  assert.deepEqual(byName(bom,'Крыша'),[[764,400,18]]);
  assert.deepEqual(byName(bom,'Дно'),[[764,400,18]]);
  assert.deepEqual(byName(bom,'Полка'),[[762,400,18]]);
  assert.deepEqual(byName(bom,'З.С'),[[896,796,3]]);
  const expected=p.doors.length===1?[[897,797]]:[[897,397],[897,397]];
  assert.deepEqual(bom.filter(x=>x.role==='front').map(x=>[x.length,x.width]),expected);
  assert.ok(bom.every(x=>x.length>0&&x.width>0&&x.thickness>0));
});
