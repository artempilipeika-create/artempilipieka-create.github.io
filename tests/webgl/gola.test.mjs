import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const G=globalThis.MF_GOLA,D=globalThis.MF_DRAWERS,core=globalThis.MF_FURNITURE_CORE;
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const item=v=>C.normalizeKitchen({item_id:'gola',name:'У окна',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,module_type:'base_cabinet',width:600,height:820,depth:510,body_height:720,base_height:100,base:'legs',handles:'handleless',x:0,z:0,rotation:0,production_note:'Сохранить',layout:v.kind||'drawers',drawers:v.drawer_count||0,bazis_resize:true});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});
const globals={MF_GOLA:G,MF_FURNITURE_CORE:core,MF_DRAWERS:D,MF_UPPERS:globalThis.MF_UPPERS};
function catalog(){
 const cards=[],node=()=>({dataset:{},append(){},replaceChildren(){}}),c=vm.createContext({...globals,structuredClone,document:{body:{dataset:{}},getElementById:node,createElement:node}});
 vm.runInContext(source.slice(0,source.indexOf('let user=null')),c);c.addCatalogueButton=(root,opt)=>cards.push(opt);c.applyCatalogueFilter=()=>{};
 c.categoryKey=t=>t.module_type==='base_cabinet'?'base':t.module_type==='wall_cabinet'?'wall':'tall';
 vm.runInContext(source.slice(source.indexOf('function renderModuleCatalogue()'),source.indexOf('async function loadProjects()')),c);vm.runInContext('renderModuleCatalogue()',c);
 return {cards,catalogue:vm.runInContext('bazisModules',c)};
}
test('13 new donors are grouped into two door cards and the same one drawer card',()=>{
 const {cards,catalogue}=catalog();assert.equal(G.variants.length,13);assert.equal(D.choices().length,17);
 const corrected=G.variants.find(v=>v.system==='aq'&&v.layout==='three');assert.equal(corrected.source_sha256,'99f651b86d4dc7b965e7682a7e4e7eb57912ff9e604bf93dabe768a7fc8519f3');assert.ok(corrected.source_file.endsWith('(2).fr3d'));assert.ok(!G.variants.some(v=>v.id==='bazis.784075ecf511'));
 assert.equal(cards.filter(c=>G.baseChoice(c.bazis)).length,2);assert.equal(cards.filter(c=>D.choice(c.bazis)).length,1);
 for(const v of G.variants)assert.ok(catalogue.some(t=>t.id===v.id&&t.source_sha256===v.source_sha256));
 assert.ok(cards.filter(c=>G.baseChoice(c.bazis)||D.choice(c.bazis)).every(c=>c.description.includes('Gola')));
});
for(const v of G.variants)test(v.source_file,()=>{
 const it=item(v),p=template(it),parts=C.productionParts(it,p),fronts=C.facadeCells(it,p);
 assert.equal(C.dimensionError(it,p),'');assert.equal(parts.length,v.panels.length);
 const expected=v.kind==='doors'?Array(v.door_count).fill(688.5):v.layout==='three'?[329,163,163]:[329,329];
 assert.deepEqual(fronts.map(f=>f.h),expected);assert.ok(fronts.every(f=>f.w===(v.door_count===2?297:597)));
 for(const part of parts){const original=v.panels.find(p=>p.key===part.key);assert.equal(part.name,original.name);assert.equal(part.thickness,original.thickness);for(const [i,axis] of ['x','y','z'].entries()){assert.ok(Math.abs(part.size[axis]-original.size[i])<.001);assert.ok(Math.abs(part.position[axis]-original.center[i])<.001);}}
 const hw=C.productionHardware(it).items;assert.equal(hw.find(h=>h.article==='118236').quantity,v.kind==='doors'?2:4);
 for(const art of v.kind==='doors'?['60965']:['60965','60966']){const h=hw.find(h=>h.article===art);assert.equal(h.quantity,.6);assert.equal(h.unit,'m');}
 if(v.kind==='doors'&&v.purpose==='shelf'){assert.equal(parts.filter(p=>p.role==='shelf').length,2);assert.match(G.brief(it),/две полки/);}
 const mesh=new MeshFactory({template,material:()=>null,room:{width:4200,depth:3200,height:2700}},()=>{}).build(it);let profiles=0,sides=0;
 mesh.traverse(m=>{if(m.userData.golaProfile)profiles++;if(m.userData.part?.contour_yz){sides++;assert.ok(m.geometry.attributes.position.count>50);}});
 assert.equal(profiles,v.profiles.length);assert.equal(sides,2);
});
test('Switches keep project identity and selected material thickness; incompatible Gola push is unavailable',()=>{
 const {catalogue}=catalog();
 for(const from of D.choices())for(const to of D.choices()){
  const old=item(from);old.body_variant_id='body18';old.part_materials={'drawer-1-bottom':'board16'};
  const next=D.select(old,to,catalogue);assert.equal(next.bazis_id,to.id);assert.equal(next.name,old.name);assert.equal(next.production_note,old.production_note);assert.equal(next.width,old.width);
  if(to.execution==='gola')assert.equal(next.handles,'handleless');
  if(from.system!=='ball'&&to.system==='ball')assert.equal(next.part_materials['drawer-1-bottom'],undefined);
 }
 for(const from of G.baseChoices())for(const to of G.baseChoices().filter(v=>v.door_count===from.door_count)){
  const next=G.select(item(from),to,catalogue);assert.equal(next.bazis_id,to.id);assert.equal(next.name,'У окна');assert.equal(next.width,600);
 }
 assert.equal(D.available(G.variants.find(v=>v.system==='slimbox'),{opening:'push'}),null);
});
test('Gola metal boards retain 16 mm, and ball drawers retain 18/3 mm after resize',()=>{
 for(const v of G.variants.filter(v=>v.kind==='drawers'))for(const depth of [500,510,550,560])for(const body of [720,800,920]){
  const it={...item(v),height:body+100,body_height:body,depth,body_variant_id:'body18'},error=C.dimensionError(it,template(it));if(error)continue;
  const parts=C.productionParts(it,template(it),id=>({name:id,thickness:18}));
  for(const p of parts.filter(p=>p.role==='drawer')){assert.equal(p.thickness,v.system==='ball'?18:16);if(v.system!=='ball')assert.equal(p.material.variant_id,null);}
  assert.ok(parts.every(p=>Object.values(p.size).every(n=>Number.isFinite(n)&&n>0)));
  assert.ok(C.productionHardware(it).items.some(h=>h.article==='60965'&&h.quantity===.6));
 }
});
test('Real JSON exporter keeps exact Gola source SHA, contours, hardware and source warnings',async()=>{
 let blob;const state={room:{width:6000,height:2700,depth:4000},items:G.variants.map(item),production_note:''};
 const c=vm.createContext({...globals,state,templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,$:()=>({value:'Gola QA'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('const UPPER_SOURCE_REFRESH='),source.indexOf('function normalizeItem(')),c);
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);c.exportBazisProject();const payload=JSON.parse(await blob.text());
 assert.equal(payload.items.length,13);for(const [i,out]of payload.items.entries()){assert.equal(out.source_sha256,G.variants[i].source_sha256);assert.equal(out.source_file,G.variants[i].source_file);assert.equal(out.construction.gola_variant.execution,'gola');assert.ok(out.construction.parts.filter(p=>p.contour_yz).length===2);}
});
test('Current native importer protects all five Gola metal donors from 18 mm substitution',()=>{
 const script=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8'),c=vm.createContext({require:createRequire(import.meta.url),console,process});vm.runInContext(script.slice(0,script.lastIndexOf('(function main()')),c);
 for(const v of G.variants.filter(v=>v.kind==='drawers'&&v.system!=='ball')){
  const it=item(v);it.body_variant_id='body18';const parts=C.productionParts(it,template(it));parts.find(p=>p.role==='body').material={name:'White 18',variant_id:'body18'};
  assert.equal(c.materialPalette({source_sha256:v.source_sha256,body_variant_id:'body18',construction:{parts}}).drawer,null);
 }
 assert.equal(script,fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_9_1_X0_FOLDERS.js',import.meta.url),'utf8'));
});
