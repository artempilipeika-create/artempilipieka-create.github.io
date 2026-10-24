import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const core=globalThis.MF_FURNITURE_CORE,D=C.DEFAULT_MATERIALS;
const node=()=>({dataset:{},children:[],append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs},setAttribute(){}});
const globals={MF_FURNITURE_CORE:core,MF_GOLA:globalThis.MF_GOLA,MF_DRAWERS:globalThis.MF_DRAWERS,MF_UPPERS:globalThis.MF_UPPERS,MF_ACCESSORIES:globalThis.MF_ACCESSORIES};
const ctx=vm.createContext({...globals,structuredClone,document:{body:{dataset:{}},getElementById:node,createElement:node}});
vm.runInContext(source.slice(0,source.indexOf('let user=null')),ctx);
const catalogue=vm.runInContext('({bazisModules,templates:kitchenTemplates,moduleDefs})',ctx);
const state={room:{width:6000,depth:4000,height:2700},items:[],plinths:[]};
const materials=new Map([
 [D.body_variant_id,{variant_id:D.body_variant_id,material_id:'f4a68348-cb76-5601-aeaa-c474a6349ba2',article:'605 PO',name:'ЛДСП BYSPAN 18мм Белый 605 PO',thickness:18,length:2800,width:2070}],
 [D.front_variant_id,{variant_id:D.front_variant_id,material_id:'4a77f03a-99e5-5af0-90e1-47752c3c83ca',article:'890 PO',name:'ЛДСП BYSPAN 18мм Персидский жемчуг 890 PO',thickness:18,length:2800,width:2070}],
 ['custom',{variant_id:'custom',name:'Выбранный материал',article:'CUSTOM',thickness:18}]
]);
const adapter=new StateAdapter({catalogue,state:()=>state,selected:()=>state.items[0],template:it=>catalogue.bazisModules.find(t=>t.id===it.bazis_id),material:id=>materials.get(id)});
const draft=id=>adapter.createDraft({bazis:id});

test('Actual catalogue drafts select exact 18 mm defaults, preserving glass and drawer board roles',()=>{
 globalThis.crypto??=webcrypto;
 const ids=['bazis.3079d0656398','bazis.0211e4f77fc4','bazis.858266606bc5',C.TALL_FAMILY.default_id,globalThis.MF_DRAWERS.variants[0].id,C.VITRINE.variants[0].id];
 for(const id of ids){
  const it=draft(id),p=C.PRODUCTION_MODELS[id];
  assert.equal(it.body_variant_id,D.body_variant_id);
  assert.equal(it.front_variant_id,p.vitrine?null:D.front_variant_id);
  assert.equal(it.plinthMaterialId,it.base==='wall'?undefined:D.plinthMaterialId);
  const parts=C.productionParts(it,adapter.template(it),id=>materials.get(id));
  for(const part of parts.filter(x=>x.role==='body'))assert.equal(part.material.variant_id,D.body_variant_id);
  for(const part of parts.filter(x=>x.role==='drawer'&&x.thickness===16))assert.notEqual(part.material.variant_id,D.body_variant_id);
  if(p.vitrine){const glass=parts.filter(x=>x.optical_material==='glass');assert.ok(glass.length);for(const g of glass){assert.equal(g.thickness,4);assert.equal(g.material.variant_id,null);}}
 }
});

test('Saved scenes and chosen materials do not acquire or reset defaults on normalization',()=>{
 const original={...draft('bazis.3079d0656398'),body_variant_id:'custom',front_variant_id:'custom',plinthMaterialId:'custom',part_materials:{bottom:'special'},shelves:[{id:'shelf-1',enabled:true,offset_mm:360,material_variant_id:'shelf'}]};
 const normalized=C.normalizeKitchen(structuredClone(original));
 for(const field of ['body_variant_id','front_variant_id','plinthMaterialId','part_materials','shelves'])assert.deepEqual(normalized[field],original[field]);
 const empty=C.normalizeKitchen({...original,body_variant_id:null,front_variant_id:null,plinthMaterialId:null});
 assert.equal(empty.body_variant_id,null);assert.equal(empty.front_variant_id,null);assert.equal(empty.plinthMaterialId,null);
});

test('Existing picker can replace all three defaults and retains the result through save/load',async()=>{
 state.items=[draft('bazis.3079d0656398')];
 const c=vm.createContext({...globals,state,selected:()=>state.items[0],templateFor:it=>adapter.template(it),materials,label:m=>m.name,status:()=>{},updateAll:()=>{},syncControls:()=>{},$:id=>id==='material-scope'?{value:'module'}:node(),document:{createElement:node},api:async()=>({items:[materials.get('custom')]})});
 vm.runInContext(source.slice(source.indexOf('function materialVisualLabel('),source.indexOf('function setMode(')),c);
 for(const [kind,key]of [['body','body_variant_id'],['front','front_variant_id'],['plinth','plinthMaterialId']]){
  const input={value:'custom',dataset:{}},results=node();await c.searchMaterial(input,results,kind);results.children[0].onclick();assert.equal(state.items[0][key],'custom');
 }
 const saved=C.normalizeKitchen(JSON.parse(JSON.stringify(state.items[0])));
 for(const key of Object.keys(D))assert.equal(saved[key],'custom');
});

test('Real BAZIS exporter includes the defaults as actual articles for the cabinet and automatic plinth',async()=>{
 let blob;state.items=[draft('bazis.3079d0656398')];state.plinths=[{id:'auto',automatic:true,members:[],shape:'straight',excluded_members:[]}];
 const c=vm.createContext({...globals,state,templateFor:it=>adapter.template(it),materials,Blob,Date,JSON,Math,FACADE_GAP_MM:1.5,$:()=>({value:'Defaults QA'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('const UPPER_SOURCE_REFRESH='),source.indexOf('function normalizeItem(')),c);
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);c.exportBazisProject();
 const payload=JSON.parse(await blob.text());assert.equal(payload.items[0].material_assignments.body.article,'605 PO');assert.equal(payload.items[0].material_assignments.front.article,'890 PO');
 const plinths=payload.items.slice(1);assert.ok(plinths.length);for(const p of plinths)assert.equal(p.material_assignments.body.article,'890 PO');
});
