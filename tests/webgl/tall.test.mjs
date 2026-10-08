import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TALL_FAMILY,TALL_VARIANTS,tallVariant,tallVariantInfo,tallDefaultId,PRODUCTION_MODELS as models,productionParts,productionHardware,dimensionPatch,dimensionError,kitchenRuns} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const native=JSON.parse(readFileSync(new URL('./fixtures/tall-native-panels.json',import.meta.url)));
const catalogue=TALL_VARIANTS.map(v=>({...v,resize:true}));
const item=v=>({item_id:'pn',name:'У окна',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,
  module_type:'tall_cabinet',width:600,height:2000,body_height:1900,base_height:100,worktop_thickness:0,depth:600,base:'plinth',
  x:100,z:100,rotation:0,body_variant_id:null,front_variant_id:null,part_materials:{},shelves:[],doors_open:false});
const parts=it=>productionParts(it,{production:models[it.bazis_id]});
const approx=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<.00001);
for(const v of TALL_VARIANTS)test(v.label+': all closed panel bounds match original FR3D (including fractional shelves)',()=>{
  const it=item(v),expected=native.find(x=>x.id===v.id),actual=parts(it);
  assert.equal(expected.sha256,v.source_sha256);assert.equal(expected.source_file,v.source_file);
  assert.equal(actual.length,expected.panels.length);
  const remaining=[...expected.panels];
  for(const p of actual){
    const min=['x','y','z'].map(k=>p.position[k]-p.size[k]/2+(k==='y'?0:300));
    const max=['x','y','z'].map(k=>p.position[k]+p.size[k]/2+(k==='y'?0:300));
    const index=remaining.findIndex(n=>approx(min,n.min)&&approx(max,n.max));
    assert.ok(index>=0,`${p.key} ${JSON.stringify({min,max})}`);remaining.splice(index,1);
  }
  assert.deepEqual(remaining,[]);
  const fronts=actual.filter(p=>p.role==='front'),n=v.doors_per_section;
  assert.equal(fronts.length,n*2);
  assert.equal((fronts[n].position.y-fronts[n].size.y/2)-(fronts[0].position.y+fronts[0].size.y/2),1.5);
  if(n===2)assert.equal(fronts[1].position.x-fronts[1].size.x/2-(fronts[0].position.x+fronts[0].size.x/2),3);
  const hw=productionHardware(it);assert.equal(hw.hinge_count,5*n);
  assert.equal(hw.items.find(x=>x.key==='shelf-support-marcopol').quantity,v.row_height===820?4:8);
  assert.deepEqual(kitchenRuns([it],{width:4200,depth:3200,height:2700}),[]);
});
test('All 36 variant switches retain user construction, materials and position; donor identity follows choice',()=>{
  for(const from of TALL_VARIANTS)for(const to of TALL_VARIANTS){
    const source={...item(from),height:2200,body_height:2100,width:500,depth:650,x:120.5,z:-500,rotation:90,
      body_variant_id:'body',front_variant_id:'front',back_variant_id:'back',part_materials:{'shelf-fixed':'shelf'},doors_open:true};
    const next=tallVariant(source,{row_height:to.row_height,opening:to.opening},catalogue);
    assert.equal(next.bazis_id,to.id);assert.equal(next.bazis_file,to.source_file);assert.equal(next.bazis_sha256,to.source_sha256);
    const omit=x=>{const {bazis_id,bazis_file,bazis_sha256,...rest}=x;return rest;};assert.deepEqual(omit(next),omit(source));
    assert.equal(dimensionError(next,{production:models[to.id]}),'');
    const ps=parts(next);assert.equal(ps.find(p=>p.key==='shelf-fixed').material.variant_id,'shelf');
  }
  const bad={...item(TALL_VARIANTS[0]),bazis_sha256:'stale'};assert.equal(tallVariantInfo(bad),null);
  assert.throws(()=>tallVariant(bad,{opening:'right'},catalogue));
});
test('Height resize grows upper section while preserving row datum and native shelf positions',()=>{
  for(const v of TALL_VARIANTS){
    const src=item(v),next=dimensionPatch(src,{height:2400}),old=parts(src),ps=parts(next);
    assert.equal(next.body_height,2300);
    for(const key of ['divider','shelf-fixed',...v.upper_shelves.map((_,i)=>'shelf-upper-'+(i+1))])
      assert.deepEqual(ps.find(p=>p.key===key),old.find(p=>p.key===key));
    assert.equal(ps.find(p=>p.key==='door-1').length,v.row_height-103);
    assert.equal(ps.find(p=>p.key==='door-'+(v.doors_per_section+1)).length,2400-v.row_height-1.5);
    assert.match(dimensionError({...src,width:v.doors_per_section*600+1},{production:models[v.id]}),/600/);
    assert.match(dimensionError({...src,base_height:150},{production:models[v.id]}),/100/);
  }
});
test('Initial family choice follows the lower body datum, with explicit 820 fallback',()=>{
  const lower={bazis_id:'bazis.0211e4f77fc4',height:950,body_height:800,base_height:150,legHeightMm:150,module_type:'base_cabinet'};
  assert.equal(models[tallDefaultId([lower],lower)].tall.row_height,900);
  assert.equal(tallDefaultId([],null),TALL_FAMILY.default_id);
  assert.equal(models[tallDefaultId([{...lower,height:870,body_height:720}],null)].tall.row_height,820);
});
