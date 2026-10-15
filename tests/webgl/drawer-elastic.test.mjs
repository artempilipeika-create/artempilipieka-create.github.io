import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PRODUCTION_MODELS as models,productionParts,productionHardware,dimensionError,dimensionPatch,normalizeKitchen} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const D=globalThis.MF_DRAWERS;
const item=v=>normalizeKitchen({item_id:v.id,bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,bazis_resize:true,module_type:'base_cabinet',width:600,height:820,depth:510,base_height:100,body_height:720,legHeightMm:100,base:'legs',layout:'drawers',drawers:v.drawer_count,x:0,z:0,rotation:0});
const template=it=>({production:models[it.bazis_id],limits:models[it.bazis_id].limits});
const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');

test('Actual size controls accept height and depth and keep leg-height offsets',()=>{
 const nodes=Object.fromEntries(['width','height','depth'].map(id=>[id,{}]));
 const c=vm.createContext({$:id=>nodes[id],MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE});
 vm.runInContext(source.slice(source.indexOf('function applyLimits('),source.indexOf('const STANDARD_WIDTHS=')),c);
 for(const v of D.variants){const it=dimensionPatch(item(v),{legHeightMm:150});c.applyLimits(it,template(it));assert.equal(nodes.height.disabled,false);assert.equal(nodes.depth.disabled,false);assert.equal(nodes.height.min,'750');assert.equal(nodes.height.max,'1150');}
});

test('Native elastic weights drive carcass, fronts and drawer origins across all eight donors',()=>{
 for(const v of D.variants)for(const body of [720,800,920])for(const depth of [500,510,550,560,600]){
  const it=dimensionPatch(item(v),{body_height:body,depth});
  // The public dimension channel is body_height; the result must carry a consistent height.
  assert.equal(it.height,body+100);assert.equal(dimensionError(it),'');
  const p=productionParts(it,template(it)),original=productionParts(item(v),template(it));
  assert.equal(p.find(x=>x.key==='side-L').size.y,body-18);assert.equal(p.find(x=>x.key==='side-L').size.z,depth);
  assert.equal(p.find(x=>x.key==='bottom').size.z,depth);assert.equal(p.find(x=>x.key==='back').size.y,body-4);
  assert.equal(p.find(x=>x.key==='rail-front').size.z,80);assert.equal(p.find(x=>x.key==='front-1').size.z,18);
  if(v.layout==='three')assert.deepEqual(D.frontHeights(it),[357+(body-720)/2,177.5+(body-720)/4,177.5+(body-720)/4]);
  else assert.deepEqual(D.frontHeights(it),[357+(body-720)/2,357+(body-720)/2]);
  for(const d of D.configuration(it).drawers){
   const b=p.find(x=>x.key===`drawer-${d.index}-bottom`),r=p.find(x=>x.key===`drawer-${d.index}-rear`);
   assert.equal(b.size.z,d.kit.length_mm-(v.system==='aq'?10:24));assert.equal(r.size.y,d.kit.height_mm-(v.system==='aq'?20:0));
   assert.equal(b.thickness,16);assert.equal(r.thickness,16);
   assert.ok(Math.abs(b.position.z+b.size.z/2-(depth/2-(v.layout==='inner'&&d.index===3?2:0)))<.1);
  }
  assert.equal(p.find(x=>x.key==='drawer-1-bottom').position.y,original.find(x=>x.key==='drawer-1-bottom').position.y);
 }
});

test('Hardware follows embedded upper-inclusive depth intervals and height tiers',()=>{
 const aq=D.variants.find(v=>v.system==='aq'&&v.layout==='three');
 const a={...item(aq),height:1020,body_height:920,depth:560};
 assert.deepEqual(D.configuration(a).drawers.map(d=>[d.kit.height_mm,d.kit.length_mm,d.kit.article]),[[203,550,'12.0069'],[171,500,'12.0097'],[171,500,'12.0097']]);
 assert.deepEqual(D.railLengths(a),[550,500]);assert.equal(productionHardware(a).length_mm,null);
 const s=D.variants.find(v=>v.system==='slimbox'&&v.layout==='two'&&v.opening==='soft');
 for(const [depth,length] of [[500,450],[501,500],[550,500],[551,550],[600,550]]){
  const it={...item(s),depth};assert.deepEqual(D.railLengths(it),[length]);
  assert.equal(productionHardware(it).items.find(h=>h.name.startsWith('Система')).quantity,2);
 }
 for(const v of D.variants.filter(v=>v.layout==='inner')){
  const it={...item(v),height:1020,body_height:920,depth:560},kits=D.configuration(it).drawers;
  assert.equal(kits[2].kit.height_mm,84);assert.match(kits[2].kit.name,/SOFT CLOSE/);assert.equal(kits[2].kit.article,'117830');
  assert.equal(productionHardware(it).items.find(h=>h.article==='113187').quantity,1);
 }
});

test('Unsupported native gaps report the drawer and never silently stretch an unavailable kit',()=>{
 const soft=D.variants.find(v=>v.system==='slimbox'&&v.layout==='two'&&v.opening==='soft');
 assert.match(dimensionError({...item(soft),depth:450}),/Ящик 1.*глубины/);
 const aq=D.variants.find(v=>v.system==='aq'&&v.layout==='three');
 assert.match(dimensionError({...item(aq),height:700,body_height:600,depth:400}),/встроенной геометрии/);
 assert.throws(()=>productionParts({...item(soft),depth:450},template(item(soft))),/направляющих/);
 assert.equal(D.frontHeights(item(aq))[1],177.5);
});

test('A height/depth edit and resulting parts are one undoable change',()=>{
 let snapshot={scene:{items:[item(D.variants[5])]}};const before=structuredClone(snapshot);
 const adapter={snapshot:()=>snapshot,restore:s=>{snapshot=structuredClone(s)}},history=new History(adapter);
 history.run('Размеры',()=>{snapshot.scene.items[0]=dimensionPatch(snapshot.scene.items[0],{body_height:800,depth:560});});
 assert.equal(snapshot.scene.items[0].height,900);assert.deepEqual(D.frontHeights(snapshot.scene.items[0]),[397,197.5,197.5]);
 const after=structuredClone(snapshot);history.undo();assert.deepEqual(snapshot,before);history.redo();assert.deepEqual(snapshot,after);
});

test('Real native export sends resized dimensions, current hardware and fronts for all eight systems',async()=>{
 let blob;const state={room:{width:6000,height:2700,depth:4000},items:D.variants.map(v=>dimensionPatch(item(v),{body_height:800,depth:560,legHeightMm:150})),production_note:''};
 const c=vm.createContext({state,templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:D,$:()=>({value:'Elastic QA'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({style:{},click:()=>{},remove:()=>{}}),body:{append:()=>{}}}});
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);vm.runInContext('exportBazisProject()',c);
 const payload=JSON.parse(await blob.text());assert.equal(payload.items.length,8);
 for(let i=0;i<8;i++){const out=payload.items[i],it=state.items[i];assert.deepEqual(out.target,{width:600,height:900,depth:560});assert.equal(out.elastic_resize,true);assert.equal(out.construction.base_height,150);assert.equal(out.construction.native_adjustment.body_height_mm,800);assert.deepEqual(out.construction.metal_drawers.front_heights_mm,D.frontHeights(it));assert.deepEqual(out.construction.metal_drawers.lengths_mm,D.railLengths(it));assert.deepEqual(out.construction.metal_drawers.drawers.map(d=>d.article),D.configuration(it).drawers.map(d=>d.kit.article));}
});
