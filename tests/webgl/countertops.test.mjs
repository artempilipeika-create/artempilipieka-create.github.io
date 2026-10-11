import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {CORNER_VARIANTS,PRODUCTION_MODELS as models,normalizeKitchen,kitchenRuns,kitchenSettings,heights,dimensionPatch,cornerReturnPlacement,rotateXZ} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {kitchenPriceBreakdown} from '../../backend/v2/cabinet_assets/planner/pricing.mjs';
const C=globalThis.MF_COUNTERTOPS,room={width:10000,depth:10000,height:3000};
function item(id='bazis.0211e4f77fc4',patch={}){
 const p=models[id];return normalizeKitchen({item_id:crypto.randomUUID(),bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,module_type:'base_cabinet',name:p.label,
  width:p.native_defaults.width,height:820,body_height:720,base_height:100,depth:510,base:'plinth',x:0,z:0,rotation:0,...patch});
}
const corner=side=>item(CORNER_VARIANTS.find(v=>v.side===side&&v.purpose==='sink'&&v.door_count===1).id);
const groups=items=>C.assemblies(kitchenRuns(items,room));
const tops=items=>kitchenRuns(items,room).flatMap(r=>r.parts.filter(p=>p.role==='counter'));
test('Seven immutable donors include the corrected left file, native contours and elastic axes',()=>{
 assert.equal(C.variants.length,7);
 for(const v of C.variants){
  const b=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/countertop-sources/'+v.source_file,import.meta.url));
  assert.equal(crypto.createHash('sha256').update(b).digest('hex'),v.source_sha256);
  assert.equal(v.source_default.height,38);assert.ok(v.elastic_planes.some(p=>p.axis==='x'));
  assert.equal(v.panels.length,v.shape==='straight'?1:v.shape==='u'?3:2);
 }
 assert.equal(C.source('left','standard').source_file,'Столешница_Обычная_Лево_38мм.(1).fr3d');
 assert.equal(C.source('straight','euro').joint,'standard');
});
test('First cabinet gets a top; continuous automatic row grows and shrinks with modules',()=>{
 const a=item(),b=item(undefined,{x:600});
 assert.equal(tops([a])[0].length,600);assert.equal(tops([a,b])[0].length,1200);
 assert.equal(groups([a,b])[0].shape,'straight');assert.equal(tops([a])[0].size.y,38);
 assert.equal(groups([a,b])[0].native_supported,true);
 assert.equal(C.nativeItems(kitchenRuns([a,b],room))[0].target.width,1200);
});
test('Off switch cuts a real gap; plinth and body heights stay unchanged and re-enable restores thickness',()=>{
 const a=item(undefined,{x:-600}),b=item(),c=item(undefined,{x:600});
 const off=dimensionPatch(b,{countertopEnabled:false});assert.equal(heights(off).overall_height_with_worktop,820);
 assert.equal(off.height,820);assert.equal(off.body_height,720);assert.equal(off.countertopThicknessMm,38);
 assert.deepEqual(tops([a,off,c]).map(p=>p.length),[600,600]);assert.equal(groups([a,off,c]).length,2);
 assert.equal(kitchenRuns([a,off,c],room)[0].parts.filter(p=>p.role==='plinth').length,3);
 const on=dimensionPatch(off,{countertopEnabled:true});assert.equal(heights(on).overall_height_with_worktop,858);
 assert.equal(tops([a,on,c]).length,1);
 for(const leg of [80,100,150]){const moved=dimensionPatch(off,{legHeightMm:leg});assert.equal(moved.body_height,720);assert.equal(moved.countertopThicknessMm,38);}
});
for(const side of ['left','right'])for(const rotation of [0,90,180,270])test(`Automatic ${side} corner at ${rotation} degrees, standard/euro and disabled return`,()=>{
 const a={...corner(side),rotation},b=cornerReturnPlacement(a,item());
 const standard=groups([a,b]);assert.equal(standard.length,1);assert.equal(standard[0].shape,side);assert.equal(standard[0].joint_count,1);assert.equal(standard[0].native_supported,true);
 const items=[a,b].map(it=>({...it,countertopJoint:'euro'})),e=groups(items)[0];
 assert.equal(e.shape,side);assert.equal(e.source.joint,'euro');assert.equal(e.euro_joint_count,1);assert.equal(e.native_supported,true);
 assert.ok(tops(items).every(p=>p.contour?.length>4));
 const off=groups([a,{...b,countertopEnabled:false}]);assert.equal(off.length,1);assert.equal(off[0].shape,'straight');assert.equal(off[0].joint_count,0);
 const factory=new MeshFactory({room,template:it=>({production:models[it.bazis_id]}),material:()=>null},()=>{}),g=factory.dress(items);
 let count=0;g.traverse(m=>{if(m.userData.part?.role==='counter'){count++;assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));}});assert.equal(count,2);factory.release(g);factory.dispose();
});
function uKitchen(){
 const left={...corner('left'),x:-1000},right={...corner('right'),x:1000},middle=item('bazis.3079d0656398',{width:1000});
 return [left,middle,right,cornerReturnPlacement(left,item()),cornerReturnPlacement(right,item())];
}
test('U shape has two real seams; unequal arms follow cabinets, and disabled middle splits the assembly',()=>{
 const items=uKitchen().map(it=>({...it,countertopJoint:'euro'})),u=groups(items)[0];
 assert.equal(groups(items).length,1);assert.equal(u.shape,'u');assert.equal(u.euro_joint_count,2);assert.equal(u.native_supported,true);
 const long=items.map((it,i)=>i===4?cornerReturnPlacement(items[2],{...it,width:900}):it);
 const uneven=groups(long)[0];assert.equal(uneven.shape,'u');assert.notEqual(uneven.arms.left,uneven.arms.right);assert.equal(uneven.native_supported,false);
 assert.match(uneven.native_notes.join(' '),/разную длину/);
 const off=items.map((it,i)=>i===1?{...it,countertopEnabled:false}:it);assert.equal(groups(off).length,2);assert.deepEqual(groups(off).map(g=>g.shape).sort(),['left','right']);
});
test('Joint cost uses actual corner count once and validates unit/currency, without invented rates',()=>{
 const items=uKitchen().map(it=>({...it,countertopJoint:'euro'})),lookup=it=>({production:models[it.bazis_id]});
 const b=kitchenPriceBreakdown(items,room,lookup);const e=b.extras.find(r=>r.key==='operation:countertop-euro');
 assert.equal(e.quantity,2);assert.equal(e.unit,'joint');assert.equal(e.amountMinor,null);
 const priced=kitchenPriceBreakdown(items,room,lookup,()=>null,{rates:{'operation:countertop-euro':{unit:'joint',currency:'BYN',unitPriceMinor:12500}}});
 assert.equal(priced.extras.find(r=>r.key===e.key).amountMinor,25000);
 assert.ok(!kitchenPriceBreakdown([item()],room,lookup).extras.some(r=>r.key===e.key));
});
test('Project joint preference applies to future cabinets; saved false stays false',()=>{
 const p=models['bazis.0211e4f77fc4'],adapter=new StateAdapter({state:()=>({countertopSettings:{joint:'euro'},items:[]}),catalogue:{bazisModules:[{id:'bazis.0211e4f77fc4',module_type:'base_cabinet',source_sha256:p.source_sha256,source_file:p.source_file,label:p.label,production:p,defaults:{w:600,h:820,d:510,layout:'doors',base:'plinth'}}]}});
 const draft=adapter.createDraft({bazis:'bazis.0211e4f77fc4'});assert.equal(draft.countertopJoint,'euro');assert.equal(draft.countertopEnabled,true);
 assert.equal(kitchenSettings(normalizeKitchen(JSON.parse(JSON.stringify({...draft,countertopEnabled:false})))).countertopEnabled,false);
});
test('Straight rows over stock length export separate elastic pieces with no overlap',()=>{
 const items=Array.from({length:8},(_,i)=>item(undefined,{x:i*600})),runs=kitchenRuns(items,room),native=C.nativeItems(runs);
 assert.deepEqual(native.map(i=>i.target.width),[4100,700]);
 assert.equal(native[0].position.x+native[0].target.width/2,native[1].position.x-native[1].target.width/2);
 assert.ok(native.every(i=>i.source_file===C.source('straight','standard').source_file));
 assert.equal(groups(items)[0].native_supported,true);
});
