import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';

const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const families=[C.VITRINE,globalThis.MF_PULLOUT_DRYERS,globalThis.MF_UPPERS];
const variants=[...C.VITRINE_VARIANTS,...globalThis.MF_PULLOUT_DRYERS.variants,...globalThis.MF_UPPERS.variants];
const templateFor=it=>({production:C.sourceProduction(it),resize:it.bazis_resize});
const specimen=(v,revision=v)=>{
 const p=C.PRODUCTION_MODELS[v.id];
 const it={item_id:v.id,name:'Мой модуль',bazis_id:v.id,bazis_sha256:revision.source_sha256,
  bazis_file:'Моё имя '+revision.source_file,bazis_resize:revision===v,
  module_type:p.tier==='tall'?'tall_cabinet':p.tier==='wall'?'wall_cabinet':'base_cabinet',
  width:600,height:p.body_height+p.base_height,body_height:p.body_height,base_height:p.base_height,
  depth:p.scene_depth,base:p.tier==='wall'?'wall':'legs',x:125,z:350,rotation:90,
  layout:'doors',drawers:0,production_note:'Сохранить исходник и имя'};
 return C.normalizeKitchen(it);
};

test('Opening, calculating and exporting current and historical modules preserve source pins',async()=>{
 const objects=variants.flatMap(v=>[specimen(v),...(v.previous_sources||[]).filter(r=>!r.id).map(r=>specimen(v,r))]);
 for(const original of objects){
  let blob;
  const initial=structuredClone(original),state={room:{width:4200,depth:3200,height:2700},items:[original]};
  const globals=Object.fromEntries(Object.entries(globalThis).filter(([k])=>k.startsWith('MF_')));
  const c=vm.createContext({...globals,state,templateFor,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,
   MF_PRODUCTION_NOTES:{validate:()=>'',moduleText:it=>it.production_note},
   $:()=>({value:'Проверка сохранения'}),status:m=>{if(m?.startsWith('Экспорт не создан'))assert.fail(m);},
   setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,
   URL:{createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL(){}},
   document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
  vm.runInContext(source.slice(source.indexOf('function inferTemplate('),source.indexOf('function legacyItem('))+'\n'+
   source.slice(source.indexOf('function refreshUpperSource('),source.indexOf('function scenePayload(){')),c);
  const opened=c.normalizeScene(state).items[0];
  for(const key of ['bazis_id','bazis_file','bazis_sha256','item_id','width','height','depth','x','z','rotation','production_note'])assert.equal(opened[key],initial[key],key);
  state.items=[opened];const before=JSON.stringify(state);
  vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);
  c.exportBazisProject();assert.ok(blob,initial.bazis_file);
  const out=JSON.parse(await blob.text()).items[0];
  assert.equal(out.source_sha256,initial.bazis_sha256);assert.equal(out.source_file,initial.bazis_file);
  assert.equal(JSON.stringify(state),before);assert.deepEqual(original,initial);
 }
});

test('Selecting a different variant remains an explicit action and leaves the original intact',()=>{
 for(const family of families.filter(Boolean)){
  const from=family.variants[0],to=family.variants[1],it=specimen(from),before=structuredClone(it);
  const next=family.select(it,to,family.variants);
  assert.equal(next.bazis_sha256,to.source_sha256);assert.equal(next.bazis_file,to.source_file);
  assert.deepEqual(it,before);assert.equal(next.item_id,it.item_id);
 }
});
