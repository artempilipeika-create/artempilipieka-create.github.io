import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {PRODUCTION_MODELS,productionParts,productionHardware,facadeCells,dimensionError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {hardwareArtwork} from '../../backend/v2/cabinet_assets/planner/hardware-photos.mjs';
import {checkProject} from '../../backend/v2/cabinet_assets/planner/project-checks.mjs';
const M=globalThis.MF_MODERN_CABINETS;
const template=v=>({id:v.id,source_file:v.source_file,source_sha256:v.source_sha256,label:v.label,resize:true,production:PRODUCTION_MODELS[v.id],module_type:v.family==='fridge'?'tall_cabinet':'wall_cabinet',defaults:{w:600,h:v.default_height,d:v.native_frame.size[2]-v.rear_inset_mm,base:v.family==='fridge'?'plinth':'wall',layout:'doors',drawers:0}});
const catalogue=M.variants.map(template),adapter=new StateAdapter({catalogue:{bazisModules:catalogue},state:()=>({items:[],room:{width:6000,height:3000,depth:6000}}),selected:()=>null,material:()=>null});
const item=v=>adapter.createDraft({bazis:v.id});
test('client preflight leaves unresolved native HDF for review and order never substitutes carcass LDSP',async()=>{
 const v=M.variants.find(v=>v.family==='upper1'&&v.dryer==='inox'),it=item(v);
 it.body_variant_id='body';it.front_variant_id='front';
 const state={room:{width:6000,depth:6000,height:3000,setup_complete:true,survey:'none'},items:[it]};
 const report=checkProject(state,{template:()=>template(v),material:id=>({variant_id:id,name:'ЛДСП',thickness:18})});
 assert.ok(report.issues.some(i=>i.code==='material-back-review'&&i.severity==='warning'));
 assert.ok(!report.issues.some(i=>i.code==='material'));
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),requests=[];
 const context=vm.createContext({state,templateFor:()=>template(v),project:{project_id:'qa'},materials:new Map(),
  MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,$:()=>({value:'QA'}),saveProject:async()=>{},uid:()=>String(requests.length),mmNumber:n=>n,location:{assign(){}},
  api:async(path,method,body)=>{requests.push({path,body});return path==='/orders'?{order_id:'qa',optimistic_lock_version:1}:{active_release:'qa'};}});
 vm.runInContext(source.slice(source.indexOf('function cutlistItem('),source.indexOf('function renderCutlist(')),context);
 vm.runInContext(source.slice(source.indexOf('async function toOrder('),source.indexOf('async function start(')),context);
 await context.toOrder();const rows=requests.find(r=>r.path.endsWith('/revisions')).body.details;
 const back=rows.find(r=>r.comments.includes('толщина 3 мм'));assert.ok(back);assert.equal(back.variant_id,null);
 assert.ok(rows.some(r=>r.variant_id==='body'));assert.ok(rows.some(r=>r.variant_id==='front'));
});
test('Reviewed package excludes exact duplicate and incorrect dryer; actual bytes keep exact SHA',()=>{
 assert.equal(M.variants.length,39);assert.equal(new Set(M.variants.map(v=>v.source_sha256)).size,39);
 for(const v of M.variants){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/modern-cabinet-sources/'+v.source_file,import.meta.url))).digest('hex'),v.source_sha256);assert.ok(!['09f5f653393a','297e66ac9c58'].includes(v.source_sha256.slice(0,12)));}
 const corrected=M.variants.find(v=>v.source_file.includes('Inox(1)'));assert.equal(corrected.dryer,'inox');assert.equal(corrected.hardware_items.find(h=>h.name.startsWith('Сушка для посуды')).article,'38402');
 assert.equal(M.variants.find(v=>v.source_file==='ВМД1-600. отк L. (Сушка).Inox.fr3d').back,'groove');
});
for(const v of M.variants)test(v.source_file+' preserves production geometry and source after draft/selection',()=>{
 const it=item(v),p=PRODUCTION_MODELS[v.id],parts=productionParts(it,{production:p});assert.equal(dimensionError(it),'');assert.equal(it.height,v.default_height);assert.equal(M.info(it),v);assert.ok(parts.every(s=>Object.values(s.size).every(n=>n>0)));assert.equal(facadeCells(it,{production:p}).length,v.door_count);
 for(const s of parts)assert.ok([3,18].includes(s.thickness));
 if(v.default_height===v.native_frame.size[1])for(const s of v.panels.filter(s=>s.role!=='shelf')){const part=parts.find(p=>p.key===s.key);for(const [i,a]of ['x','y','z'].entries())assert.ok(Math.abs(part.size[a]-s.size[i])<.001);}
 const before=structuredClone(it),selected=M.select({...it,production_note:'keep'}, {}, catalogue);assert.equal(selected.bazis_sha256,v.source_sha256);assert.equal(selected.production_note,'keep');assert.deepEqual(it,before);
});
test('Grooved backs, shelf depth and hanger hardware use the modern body',()=>{
 const v=M.choice(M.families.upper1.default_id),it=item(v),parts=productionParts(it,{production:PRODUCTION_MODELS[v.id]}),back=parts.find(p=>p.role==='back'),shelf=parts.find(p=>p.role==='shelf');assert.deepEqual(back.size,{x:572,y:692,z:3});assert.equal(back.position.z,-147.5);assert.equal(shelf.size.z,305);assert.equal(parts.filter(p=>p.machining?.length).length,4);assert.ok(productionHardware(it).items.some(h=>h.article?.includes('806')));
 const resized={...it,height:900,body_height:900,depth:450,width:500};assert.equal(dimensionError(resized),'');assert.equal(M.parts(resized).filter(p=>p.role==='shelf').length,2);assert.equal(M.parts(resized).find(p=>p.role==='back').size.x,472);
});
test('INOX photo/part identity remains stainless across selections and unavailable source stays unavailable',()=>{
 const v=M.variants.find(v=>v.family==='upper1'&&v.back==='groove'&&v.side==='left'&&v.execution==='handles'&&v.dryer==='mount'),it=item(v),next=M.select(it,{dryer:'inox'},catalogue);assert.equal(M.info(next).dryer,'inox');assert.ok(productionHardware(next).items.some(h=>h.article==='38402'));assert.match(hardwareArtwork(next,'modern','dryer','inox').src,/38402.webp/);assert.match(hardwareArtwork(it,'modern','dryer','mount').src,/113272.webp/);
 const right=M.variants.find(v=>v.family==='upper1'&&v.back==='groove'&&v.side==='right'&&v.execution==='push'&&v.dryer==='mount');assert.equal(M.available(right,{dryer:'inox'}),null);
});
test('All gas lifts default to450 while720 source remains720; upward door pivot never rotates sideways',()=>{
 for(const v of M.variants.filter(v=>v.family==='gaslift')){const it=item(v);assert.equal(it.height,450);const p=PRODUCTION_MODELS[v.id],front=M.parts(it).find(p=>p.role==='front');assert.equal(front.size.y,447);assert.equal(front.pivot.y,448.5);assert.equal(M.parts(it).filter(p=>p.role==='shelf').length,0);if(v.execution==='handleless')assert.equal(p.native_defaults.height,720);
 const factory=new MeshFactory({room:{width:6000,depth:6000,height:3000},state:{items:[],plinths:[]},template:()=>({production:p}),material:()=>null},()=>{});const mesh=factory.build({...it,doors_open:true});let pivot;mesh.traverse(o=>{if(o.userData.role==='door-pivot')pivot=o;});assert.equal(pivot.rotation.y,0);assert.equal(pivot.rotation.x,-Math.PI/2);factory.dispose();}
});
test('Fridge lower splits stay fixed while height increases and no shelves/back are invented',()=>{
 for(const v of M.variants.filter(v=>v.family==='fridge')){const it=item(v),parts=M.parts(it);assert.equal(parts.filter(p=>['back','shelf'].includes(p.role)).length,0);const fronts=M.facades(it),resized=M.facades({...it,height:2200,body_height:2100});assert.equal(fronts[0].w,597);if(v.fridge_layout!=='single'){assert.equal(fronts[0].h,Number(v.fridge_layout)-103);assert.equal(fronts[0].h,resized[0].h);}assert.equal(resized.at(-1).h,fronts.at(-1).h+200);}
});
test('Importer converts modern source frames with the correct rear inset and preserves720 source to450 target',()=>{
 const src=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8'),c=vm.createContext({require:createRequire(import.meta.url),console,process});vm.runInContext(src.slice(0,src.lastIndexOf('(function main()')),c);
 for(const v of M.variants){const p=PRODUCTION_MODELS[v.id],profile=c.nativeFrameProfile({source_sha256:v.source_sha256}),native=c.nativeDimensions(p.native_defaults,profile);assert.deepEqual([native.width,native.height,native.depth],v.native_frame.size);assert.equal(profile.rearInsetMm,v.rear_inset_mm);}
});

test('Actual export retains all39 source pins, native720 versus target450 and fridge installation height',async()=>{
 const items=M.variants.map(item);let blob;
 const c=vm.createContext({MF_MODERN_CABINETS:M,MF_WALL_SPECIAL:globalThis.MF_WALL_SPECIAL,MF_UPPERS:globalThis.MF_UPPERS,MF_GOLA:globalThis.MF_GOLA,MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,state:{items,room:{width:6000,depth:6000,height:3000}},templateFor:it=>catalogue.find(v=>v.id===it.bazis_id),materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,$:()=>({value:'Modern QA'}),status(){},setTimeout(){},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);c.exportBazisProject();
 const payload=JSON.parse(await blob.text());assert.equal(payload.minimum_importer,'9.9.13');assert.equal(payload.items.length,39);
 payload.items.forEach((out,i)=>{const v=M.variants[i];assert.equal(out.source_sha256,v.source_sha256);assert.equal(out.source_file,v.source_file);assert.equal(out.target.height,v.default_height);assert.equal(out.source_default.height,v.native_frame.size[1]);assert.equal(out.construction.modern_cabinet.family,v.family);});
});

test('Updated upper bodies keep the previously approved catalogue and option photographs',async()=>{
 await import('../../backend/v2/cabinet_assets/planner/catalogue-artwork.js');
 const {executionArtwork}=await import('../../backend/v2/cabinet_assets/planner/execution-artwork.mjs');
 for(const [family,legacy,file]of [['upper1','bazis.858266606bc5','upper-upper-execution-handles.webp'],['upper2','bazis.6c187245284a','upper-double-upper-execution-handles.webp']]){
  const id=M.families[family].default_id,art=globalThis.MF_CATALOGUE_ARTWORK;
  assert.equal(art[id].file,art[legacy].file);assert.equal(art[id].source,'tripo');
  assert.ok(executionArtwork(item(M.choice(id)),'modern','execution','handles').includes(file));
 }
});
test('Both photographed dryers can be selected directly from a shelf cabinet without changing the source pins',async()=>{
 const {previewVariant}=await import('../../backend/v2/cabinet_assets/planner/execution-options.mjs');
 for(const family of ['upper1','upper2']){
  const original=item(M.choice(M.families[family].default_id));
  for(const [dryer,article]of [['mount','113272'],['inox','38402']]){
   const next=previewVariant(original,'modern','dryer',dryer,catalogue),v=M.info(next);
   assert.equal(v.filling,'dryer');assert.equal(v.dryer,dryer);
   assert.equal(next.bazis_file,v.source_file);assert.equal(next.bazis_sha256,v.source_sha256);
   assert.match(hardwareArtwork(next,'modern','dryer',dryer).src,new RegExp(article+'\\.webp'));
  }
  assert.equal(M.info(original).filling,'shelves');
 }
});
test('Gaslift handle is horizontal at the bottom centre and stays attached when opened',()=>{
 const v=M.variants.find(v=>v.family==='gaslift'&&v.execution==='handles'),it=item(v),p=PRODUCTION_MODELS[v.id];
 const factory=new MeshFactory({room:{width:6000,depth:6000,height:3000},state:{items:[],plinths:[]},template:()=>({production:p}),material:()=>null},()=>{});
 for(const width of [300,600])for(const doors_open of [false,true]){
  const resized={...it,width,doors_open},front=M.parts(resized).find(p=>p.role==='front'),mesh=factory.build(resized),handles=[];
  mesh.traverse(o=>{if(o.userData.role==='handle')handles.push(o);});assert.equal(handles.length,1);
  const h=handles[0];assert.equal(h.parent.userData.role,'door-pivot');assert.equal(h.rotation.z,Math.PI/2);
  assert.ok(Math.abs(h.position.x)<1e-9);assert.ok(Math.abs(h.position.y-(front.position.y-front.size.y/2+50-front.pivot.y)/1000)<1e-9);
  assert.equal(h.parent.rotation.x,doors_open?-Math.PI/2:0);
 }
 factory.dispose();
});
test('Every fridge layout is handle-free, including older saved items with handles enabled',()=>{
 for(const v of M.variants.filter(v=>v.family==='fridge')){
  const it=item(v),p=PRODUCTION_MODELS[v.id];assert.equal(it.handles,'handleless');assert.equal(M.select({...it,handles:'handles'},{},catalogue).handles,'handleless');
  const factory=new MeshFactory({room:{width:6000,depth:6000,height:3000},state:{items:[],plinths:[]},template:()=>({production:p}),material:()=>null},()=>{});
  for(const doors_open of [false,true]){const mesh=factory.build({...it,handles:'handles',doors_open}),handles=[];mesh.traverse(o=>{if(o.userData.role==='handle')handles.push(o);});assert.equal(handles.length,0);}
  factory.dispose();
 }
});
