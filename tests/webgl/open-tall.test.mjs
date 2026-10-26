import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {modulePriceBreakdown} from '../../backend/v2/cabinet_assets/planner/pricing.mjs';
import '../../backend/v2/cabinet_assets/planner/production-notes.js';
const O={...globalThis.MF_OPEN_TALL,variants:globalThis.MF_OPEN_TALL.variants.filter(v=>!v.wall)};
const item=v=>({item_id:'open',name:'Открытый пенал',bazis_id:v.id,bazis_sha256:v.source_sha256,module_type:'tall_cabinet',width:600,height:2000,depth:600,base_height:100,body_height:1900,base:'plinth',layout:'niche',drawers:0,handles:'handleless',x:0,z:0,rotation:0});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id],front:{kind:'none',count:0}});
for(const v of O.variants)test(v.source_file+' native geometry and bounds',()=>{
 const native=item(v),parts=C.productionParts(native,template(native));assert.equal(parts.length,6);
 for(const p of parts){const s=v.panels.find(s=>s.key===p.key);for(const [i,k]of ['x','y','z'].entries()){assert.ok(Math.abs(p.size[k]-s.size[i])<1e-5,p.key+' size');assert.ok(Math.abs(p.position[k]-s.center[i])<1e-5,p.key+' center');}}
 assert.equal(C.facadeCells(native,template(native)).length,0);assert.equal(C.cabinetFrontExtension(native),0);assert.equal(C.tallRearExtension(native),0);
 for(const width of [300,450,600])for(const height of [1800,2000,2800])for(const depth of [300,588,609.5,700])for(const upper_shelf_count of [null,1,3,8]){
  const it={...native,width,height,body_height:height-100,depth,upper_shelf_count},p=template(it),parts=C.productionParts(it,p),m=O.metrics(it);
  assert.equal(C.dimensionError(it,p),'');assert.equal(parts.length,5+(upper_shelf_count??1));
  assert.ok(parts.every(p=>p.thickness===18&&Object.values(p.size).every(n=>n>0&&Number.isFinite(n))));
  assert.ok(parts.every(p=>p.role!=='front'&&!p.optical_material));
  for(const part of parts){assert.ok(part.position.x-part.size.x/2>=-width/2-1e-5);assert.ok(part.position.x+part.size.x/2<=width/2+1e-5);assert.ok(part.position.z-part.size.z/2>=-depth/2-1e-5);assert.ok(part.position.z+part.size.z/2<=depth/2+1e-5);}
  for(const shelf of parts.filter(p=>p.role==='shelf')){assert.equal(shelf.size.z,depth-18-v.shelf_front_setback_mm);assert.ok(shelf.position.y-9>=118);assert.ok(shelf.position.y+9<=height-18);}
  assert.equal(parts.filter(p=>p.machining).length,m.lighting_sides.length);
  for(const part of parts.filter(p=>p.machining)){const cut=part.machining[0];assert.equal(cut.start.z+depth/2,(depth+18)/2);assert.equal(cut.length_mm,height-100);assert.equal(cut.width_mm,v.light_system==='aq-4x8'?4:17.5);}
  for(const s of m.segments){assert.ok(s.led_cut_mm<=s.length_mm);assert.equal(s.led_cut_mm%25,0);assert.ok(!parts.filter(p=>p.role==='shelf').some(p=>s.start_mm<p.position.y+9-1e-5&&s.end_mm>p.position.y-9+1e-5));}
  const rows=C.productionHardware(it,p.production).items;
  assert.equal(rows.find(h=>h.key===v.confirmat_key).quantity,(v.bottom_full_width?8:0)+4*(upper_shelf_count??1));
  assert.ok(!rows.some(h=>/Z1|KUBIC|петля|стекло/i.test(h.name)));
  if(v.light_system==='none'){assert.equal(m.led_order_length_m,0);assert.equal(rows.length,v.hardware_items.length);}
  if(v.light_system==='lira-17.5x6.5'){assert.equal(m.light_profile_end_caps,m.lighting_sides.length*m.segments.length*2);assert.ok(m.segments.reduce((a,b)=>a+b.length_mm,0)+m.segments.length*4<m.light_profile_stock_mm);}
 }
 const factory=new MeshFactory({template,material:()=>null,room:{width:6000,depth:4000,height:3000}},()=>{}),mesh=factory.build(native);let lights=0,pivots=0;
 mesh.traverse(m=>{if(m.userData.openTallLighting)lights++;if(m.userData.role==='door-pivot')pivots++;});assert.equal(pivots,0);assert.equal(lights,v.light_system==='none'?0:(v.light_system==='aq-4x8'?1:2)*(v.lighting==='both'?2:1)*2);
 const pricing=modulePriceBreakdown(native,template(native));assert.equal(pricing.actualBOM.parts.length,6);assert.equal(pricing.extras.some(r=>r.key==='lighting:power-control'),v.light_system!=='none');
 for(const patch of [{depth:299},{width:601},{height:1799},{upper_shelf_count:0},{upper_shelf_count:9},{bazis_sha256:'0'.repeat(64)},{base_height:80}])assert.ok(C.dimensionError({...native,...patch},template(native)));
});
test('one card, seven visible choices, exact duplicate identities, material preservation',()=>{
 assert.equal(O.variants.length,8);assert.equal(O.variants.filter(v=>v.catalogue_primary).length,7);
 const duplicate=O.variants.find(v=>!v.catalogue_primary),canonical=O.variants.find(v=>v.catalogue_primary&&v.light_system===duplicate.light_system&&v.lighting===duplicate.lighting);
 assert.notEqual(duplicate.source_sha256,canonical.source_sha256);
 assert.deepEqual(duplicate.panels.map(p=>[p.key,p.size,p.center,p.source_cuts]),canonical.panels.map(p=>[p.key,p.size,p.center,p.source_cuts]));
 for(const from of O.variants)for(const to of O.variants.filter(v=>v.catalogue_primary)){
  const it={...item(from),part_materials:{'side-P':'board'},body_variant_id:'body',upper_shelf_count:3,production_note:'Keep'},next=O.select(it,to,O.variants);
  assert.equal(next.bazis_id,to.id);assert.deepEqual(next.part_materials,it.part_materials);assert.equal(next.upper_shelf_count,3);assert.equal(next.production_note,'Keep');assert.equal(next.front_variant_id,null);
 }
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),cards=[],node=()=>({dataset:{},append(){},replaceChildren(){}});
 const c=vm.createContext({...Object.fromEntries(Object.entries(globalThis).filter(([k])=>k.startsWith('MF_'))),structuredClone,document:{body:{dataset:{}},getElementById:node,createElement:node}});
 vm.runInContext(source.slice(0,source.indexOf('let user=null')),c);c.addCatalogueButton=(root,opt)=>cards.push(opt);c.applyCatalogueFilter=()=>{};c.categoryKey=t=>t.module_type==='base_cabinet'?'base':t.module_type==='wall_cabinet'?'wall':'tall';
 vm.runInContext(source.slice(source.indexOf('function renderModuleCatalogue()'),source.indexOf('async function loadProjects()')),c);vm.runInContext('renderModuleCatalogue()',c);
 assert.equal(cards.filter(c=>O.variants.some(v=>v.id===c.bazis)).length,1);
 assert.equal(cards.filter(c=>globalThis.MF_VITRINE.variants.some(v=>v.id===c.bazis)).length,1);
});
test('open tall front meets lower facade while its back touches wall',()=>{
 const room={width:5000,depth:4000,height:3000},base=C.normalizeKitchen({item_id:'base',module_type:'base_cabinet',bazis_id:'bazis.3079d0656398',width:600,height:820,depth:510,base_height:100,base:'legs',x:0,z:-2000+50+255,rotation:0});
 for(const v of O.variants){const next=C.alignTallFront({...item(v),x:700,z:0},base,room);assert.equal(next.z-next.depth/2,-2000);assert.equal(C.cabinetFrontDatum(next),C.cabinetFrontDatum(base));assert.equal(C.dimensionError(next),'');}
});
test('native import validates dimensions with both importer copies identical',()=>{
 const src=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');assert.equal(src,fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_9_4_MATERIAL_NAMES.js',import.meta.url),'utf8'));
 const c=vm.createContext({collectSourceFiles:()=>({files:[]}),canonicalBaseDonor:i=>i,canonicalUpperDonor:i=>i,resolveSourceFile:()=>'/exact.fr3d'});
 vm.runInContext(src.slice(src.indexOf('const CARGO_MIN_BODY'),src.indexOf('// Native API only. Node tests do not establish compatibility')),c);const prepare=vm.runInContext('prepareProject',c);
 for(const v of O.variants){const it={source_sha256:v.source_sha256,source_file:v.source_file,target:{width:600,height:2000,depth:300}};assert.equal(prepare({items:[it]},'/sources').entries.length,1);for(const target of [{...it.target,depth:299},{...it.target,width:601},{...it.target,height:2900}])assert.throws(()=>prepare({items:[{...it,target}]},'/sources'),/Открытый пенал/);}
});
test('order preparation transfers the six wooden panels without asking for a facade',async()=>{
 const src=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),requests=[];
 const it={...item(O.variants.find(v=>v.light_system==='lira-17.5x6.5'&&v.lighting==='both')),body_variant_id:'body',front_variant_id:null};
 const c=vm.createContext({state:{room:{width:5000,depth:4000,height:3000},items:[it]},templateFor:template,project:{project_id:'synthetic'},materials:new Map(),MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,
  $:()=>({value:'Open tall QA'}),saveProject:async()=>{},uid:()=>String(requests.length),mmNumber:n=>n,location:{assign:()=>{}},
  api:async(path,method,body)=>{requests.push({path,method,body});return path==='/orders'?{order_id:'synthetic',optimistic_lock_version:1}:{active_release:'synthetic'};}});
 vm.runInContext(src.slice(src.indexOf('function cutlistItem('),src.indexOf('function renderCutlist(')),c);
 vm.runInContext(src.slice(src.indexOf('async function toOrder('),src.indexOf('async function start(')),c);
 await vm.runInContext('toOrder()',c);
 const revision=requests.find(r=>r.path.endsWith('/revisions')).body;
 assert.equal(revision.details.length,6);assert.ok(revision.details.every(p=>p.variant_id==='body'));
 assert.match(revision.comment,/между полками/);assert.match(revision.comment,/75069/);
});
