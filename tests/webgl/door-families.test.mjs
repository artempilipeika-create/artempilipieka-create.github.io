import test from 'node:test';
import assert from 'node:assert/strict';
import {DOOR_FAMILIES,doorFamily,doorVariant,PRODUCTION_MODELS as models,productionParts,dimensionError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const catalogue=Object.entries(models).map(([id,p])=>({id,source_file:id+'.fr3d',source_sha256:p.source_sha256,resize:true}));
const item=id=>{const p=models[id];return {item_id:'stable-id',name:'У окна',bazis_id:id,bazis_file:id+'.fr3d',bazis_sha256:p.source_sha256,bazis_resize:true,
  module_type:p.tier==='wall'?'wall_cabinet':'base_cabinet',width:500,depth:p.scene_depth||317,height:800+p.base_height,body_height:800,base_height:p.base_height,
  base:p.tier==='wall'?'wall':'plinth',x:120.5,z:-390,rotation:270,layout:'doors',doors_open:true,handles:'handles',
  body_variant_id:'body',front_variant_id:'front',shelves:(p.shelves||[]).map(s=>({...s,offset_mm:390,material_variant_id:'shelf'})),rearServiceGapMm:50};};
for(const f of DOOR_FAMILIES)test(f.label+': native donor switch preserves custom construction and placement',()=>{
  const left=item(f.left),right=doorVariant(left,'right',catalogue);
  assert.equal(right.bazis_id,f.right);assert.equal(right.bazis_file,f.right+'.fr3d');assert.equal(right.bazis_sha256,models[f.right].source_sha256);
  const omit=it=>{const {bazis_id,bazis_file,bazis_sha256,...rest}=it;return rest;};
  assert.deepEqual(omit(right),omit(left));assert.deepEqual(left,item(f.left));
  assert.deepEqual(doorVariant(right,'left',catalogue),left);
  for(const [it,side] of [[left,'left'],[right,'right']]){
    assert.equal(doorFamily(JSON.parse(JSON.stringify(it))).key,f.key);
    const p=models[it.bazis_id],parts=productionParts(it,{production:p});
    assert.deepEqual(parts.filter(x=>x.role==='front').map(x=>x.hinge_side),[side]);
    assert.equal(dimensionError(it,{production:p}),'');
    assert.match(dimensionError({...it,width:601},{production:p}),/600/);
  }
  const a=productionParts(left,{production:models[f.left]}).filter(x=>x.role!=='front');
  const b=productionParts(right,{production:models[f.right]}).filter(x=>x.role!=='front');
  assert.deepEqual(a,b);
});
test('Legacy donor versions and unrelated cabinets cannot be silently converted',()=>{
  const f=DOOR_FAMILIES[0],legacy={...item(f.right),bazis_sha256:'old-source-hash'};
  assert.equal(doorFamily(legacy),null);assert.throws(()=>doorVariant(legacy,'left',catalogue));
  assert.equal(doorFamily({...item(f.left),bazis_sha256:undefined}),null);
  assert.equal(doorFamily(item('bazis.3079d0656398')),null);
  assert.throws(()=>doorVariant(item(f.left),'up',catalogue));
  assert.throws(()=>doorVariant(item(f.left),'right',catalogue.filter(x=>x.id!==f.right)));
  assert.throws(()=>doorVariant(item(f.left),'right',catalogue.map(x=>({...x,source_sha256:'wrong'}))));
});
test('Existing automatic names follow side; custom and family names remain intact',()=>{
  const f=DOOR_FAMILIES[0];
  for(const suffix of ['',' 2']){
    const left={...item(f.left),name:models[f.left].label+suffix};
    assert.equal(doorVariant(left,'right',catalogue).name,models[f.right].label+suffix);
  }
  for(const name of ['Д1 L у окна',f.label,'Произвольное название'])assert.equal(doorVariant({...item(f.left),name},'right',catalogue).name,name);
  assert.deepEqual(doorVariant(item(f.left),'left',catalogue),item(f.left));
});
