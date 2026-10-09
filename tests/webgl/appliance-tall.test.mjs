import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPLIANCE_TALL_VARIANTS as variants,APPLIANCE_TALL_FAMILY,PRODUCTION_MODELS as models,productionParts,productionHardware,facadeCells,tallVariant,tallDefaultId,tallUpperShelves,tallShelfAdjustment,dimensionPatch,dimensionError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const native=JSON.parse(readFileSync(new URL('./fixtures/appliance-tall-native-panels.json',import.meta.url)));
const item=v=>({item_id:'oven-tall',name:'Мой пенал',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,module_type:'tall_cabinet',
  width:600,height:v.native_height,depth:600,base:'plinth',base_height:100,body_height:v.native_height-100,worktop_thickness:0,x:120,z:250,rotation:90,
  body_variant_id:'body',front_variant_id:'front',back_variant_id:'back',part_materials:{'support-oven':'support'},upper_shelf_count:null});
const parts=it=>productionParts(it,{production:models[it.bazis_id]});
for(const v of variants)test(v.label+': native panels, openings, facades and hardware',()=>{
  const it=item(v),actual=parts(it),fixture=native.find(n=>n.id===v.id),remaining=[...fixture.panels];
  assert.equal(fixture.sha256,v.source_sha256);assert.equal(actual.length,remaining.length);
  for(const p of actual){
    const lo=['x','y','z'].map(k=>p.position[k]-p.size[k]/2+(k==='y'?0:300)),hi=['x','y','z'].map(k=>p.position[k]+p.size[k]/2+(k==='y'?0:300));
    const match=remaining.findIndex(n=>n.min.every((x,i)=>Math.abs(x-lo[i])<.00001)&&n.max.every((x,i)=>Math.abs(x-hi[i])<.00001));
    assert.ok(match>=0,JSON.stringify({key:p.key,lo,hi}));remaining.splice(match,1);
    assert.ok(p.length>0&&p.width>0&&p.thickness>0);
  }
  const f=facadeCells(it,{production:models[v.id]});assert.deepEqual(f.map(x=>x.kind),[v.drawer?'drawer':'door','door']);
  assert.ok(actual.filter(p=>p.pivot).every(p=>p.hinge_side===v.opening));
  const dividers=actual.filter(p=>p.key.startsWith('support-')).sort((a,b)=>a.position.y-b.position.y);
  assert.equal(dividers[1].position.y-9-(dividers[0].position.y+9),595);
  if(v.microwave)assert.equal(dividers[2].position.y-9-(dividers[1].position.y+9),380);
  assert.equal(actual.find(p=>p.key==='support-oven').material.variant_id,'support');
  assert.deepEqual(productionHardware(it).items,v.hardware_items);
  assert.equal(tallShelfAdjustment(it),null);
});
test('Corrected 820 drawer + microwave donors replace both 5 mm shelf offsets',()=>{
  for(const v of variants.filter(v=>v.row_height===820&&v.layout==='drawer_oven_micro')){
    assert.equal(v.source_sha256,v.opening==='left'?'4eef1f854e00c5f01f0bdae4e7305466e5f1754fd991192e34147d112b659cf4':'c432f96c661e9687955bb8d5397e43cbe214bbdaccde235f88a9828d1eb47fb1');
    assert.deepEqual(tallUpperShelves(item(v)),[1826.75]);
    assert.equal(1826.75-9-v.upper_bottom,346.25);assert.equal(2200-18-1826.75-9,346.25);
  }
});
test('All 256 choices preserve project identity, materials, position and custom shelves',()=>{
  const catalogue=variants.map(v=>({...v,resize:true}));
  for(const from of variants)for(const to of variants){
    const source={...item(from),height:2400,body_height:2300,upper_shelf_count:3},next=tallVariant(source,to,catalogue);
    for(const k of ['item_id','name','height','depth','width','x','z','rotation','body_variant_id','front_variant_id','back_variant_id','part_materials','upper_shelf_count'])assert.deepEqual(next[k],source[k]);
    assert.equal(next.bazis_id,to.id);assert.equal(next.bazis_sha256,to.source_sha256);assert.equal(dimensionError(next),'');
    const upper=parts(next).filter(p=>p.key.startsWith('shelf-upper-'));assert.equal(upper.length,3);
    assert.equal(productionHardware(next).items.find(p=>p.key==='shelf-support-marcopol').quantity,12);
  }
});
test('Height grows upper section only, with equal clear shelf spaces; niche dimensions remain fixed',()=>{
  for(const v of variants){
    const src=item(v),next=dimensionPatch(src,{height:2600}),ps=parts(next);
    for(const p of parts(src).filter(p=>!['side-L','side-P','top','back-upper','door-upper'].includes(p.key)&&!p.key.startsWith('shelf-upper-')))assert.deepEqual(ps.find(x=>x.key===p.key),p);
    let bottom=v.upper_bottom;const gaps=[];
    for(const y of tallUpperShelves(next)){gaps.push(y-9-bottom);bottom=y+9;}gaps.push(2600-18-bottom);
    assert.ok(gaps.every(g=>Math.abs(g-gaps[0])<.00001));assert.ok(tallShelfAdjustment(next));
    for(const patch of [{width:599},{depth:550},{height:v.min_height-1},{base_height:150}])assert.ok(dimensionError({...src,...patch}));
  }
  assert.equal(tallDefaultId([],null,APPLIANCE_TALL_FAMILY),APPLIANCE_TALL_FAMILY.default_id);
});
