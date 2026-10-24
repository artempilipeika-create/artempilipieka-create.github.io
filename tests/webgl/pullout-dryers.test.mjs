import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const D=globalThis.MF_PULLOUT_DRYERS;
const item=v=>C.normalizeKitchen({item_id:'dryer',name:'Сушка',bazis_id:v.id,bazis_sha256:v.source_sha256,module_type:'base_cabinet',width:600,height:820,depth:510,base_height:100,base:'legs',x:0,z:0,rotation:0,handles:v.execution==='gola'?'handleless':'handles'});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});
test('12 independent sources never appear among ordinary drawer options',()=>{
 assert.equal(D.variants.length,12);assert.ok(D.family.default_id);
 for(const v of D.variants)assert.equal(globalThis.MF_DRAWERS.choice(v.id),null);
});
for(const v of D.variants)test(v.label,()=>{
 const original=item(v),native=C.productionParts(original,template(original));
 assert.equal(native.length,v.panels.length);
 for(const p of native){const s=v.panels.find(s=>s.key===p.key);for(const [i,k] of ['x','y','z'].entries()){assert.ok(Math.abs(p.size[k]-s.size[i])<.001,p.key);assert.ok(Math.abs(p.position[k]-s.center[i])<.001,p.key);}}
 for(const width of v.allowed_widths)for(const depth of [510,600,700]){
  const it={...original,width,depth};assert.equal(D.dimensionError(it),'');
  const parts=C.productionParts(it,template(it));assert.ok(parts.every(p=>Object.values(p.size).every(n=>n>0&&Number.isFinite(n))));
  assert.equal(parts.filter(p=>p.role==='front').length,2);
  assert.equal(C.productionHardware(it).items.filter(h=>h.key==='pullout-dryer').length,1);
  const mesh=new MeshFactory({template,material:()=>null,room:{width:6000,depth:4000,height:3000}},()=>{}).build(it);
  let basket=0;mesh.traverse(m=>{if(m.userData.pulloutDryer)basket++;});assert.ok(basket>10);
 }
});
test('900-mm FLAT LINE cannot switch to NORWING; all legal switches preserve identity',()=>{
 const v=D.variants.find(v=>v.dryer_brand==='flat_line'),it={...item(v),width:900};
 assert.throws(()=>D.select(it,{dryer_brand:'norwing'},D.variants),/600, 700, 800/);
 for(const from of D.variants)for(const to of D.variants){const next=D.select(item(from),to,D.variants);assert.equal(next.bazis_id,to.id);assert.equal(next.item_id,'dryer');}
});
test('Appliance depth stretches carcass while retaining drawer length and mounting niches',()=>{
 for(const v of C.APPLIANCE_TALL_VARIANTS){
  const it={...item(v),module_type:'tall_cabinet',height:v.native_height,depth:650},p=template(it);
  assert.equal(C.dimensionError(it,p),'');
  const parts=C.productionParts(it,p);
  for(const part of parts){const source=v.panels.find(s=>s.key===part.key);if(!source)continue;
   assert.equal(part.size.y,source.size[1]);
   assert.equal(part.size.z,source.size[2]+(['body','shelf'].includes(source.role)&&source.size[2]>100?50:0));
  }
 }
});
