import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CARCASSES,CARCASS_BACK_MATERIAL_ID,buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
const core=globalThis.MF_FURNITURE_CORE,source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const materials=new Map([
 [core.DEFAULT_MATERIALS.body_variant_id,{variant_id:core.DEFAULT_MATERIALS.body_variant_id,name:'ЛДСП BYSPAN 18мм Белый 605 PO',article:'605 PO',thickness:18}],
 [CARCASS_BACK_MATERIAL_ID,{variant_id:CARCASS_BACK_MATERIAL_ID,name:'ЛХДФ 3ММ Белый, 2800х2070 мм',article:null,thickness:3}],
 ['custom',{variant_id:'custom',name:'Материал заказчика',article:'CUSTOM',thickness:18}]
]);
function exporter(items){
 let blob=null,message='',filename='';const button={disabled:false,value:'Carcass QA'};
 const state={items,room:{width:6000,depth:4000,height:3000},plinths:[],wallPanels:[]};
 const context=vm.createContext({state,materials,MF_FURNITURE_CORE:core,MF_BLANKS_NATIVE:globalThis.MF_BLANKS_NATIVE,templateFor:()=>null,
 Blob,Date,JSON,Math,FACADE_GAP_MM:1.5,$:()=>button,hydrateMaterials:async()=>{},status:s=>message=s,setTimeout:()=>{},
 alert:s=>assert.fail(s),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:qa';},revokeObjectURL(){}},
 document:{body:{append(){}},createElement:()=>({style:{},click(){filename=this.download;},remove(){}})}});
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),context);
 return {context,button,result:async()=>({payload:blob?JSON.parse(await blob.text()):null,message,filename})};
}
for(const recipe of CARCASSES)test('full download export: '+recipe.id,async()=>{
 const b=buildCarcass({recipe:recipe.id},{bodyMaterialId:core.DEFAULT_MATERIALS.body_variant_id,backMaterialId:CARCASS_BACK_MATERIAL_ID,edges:{left:'1011'}});
 const items=placeCarcass(b,{x:200,z:300,elevation_mm:100,rotation:90});items[0].body_variant_id='custom';
 const before=JSON.stringify(items),e=exporter(items);await e.context.exportBazisProjectReady();const {payload,message,filename}=await e.result();
 assert.equal(payload.minimum_importer,'9.9.9');assert.equal(payload.items.length,items.length);assert.equal(filename,'Carcass_QA.mf-bazis.json');
 assert.match(message,new RegExp('деталей корпуса: '+items.length));assert.equal(e.button.disabled,false);
 assert.equal(payload.items[0].material_assignments.body.article,'CUSTOM');assert.equal(payload.items[0].blank.edge_code,'1011');
 for(let i=0;i<items.length;i++){
  const out=payload.items[i],part=items[i];assert.equal(out.index,i+1);assert.equal(out.rotation,90);
  assert.deepEqual(out.position,{x:part.x,y:part.elevation_mm,z:part.z});
  assert.deepEqual(out.target,{width:part.width,height:part.height,depth:part.depth});
  assert.equal(out.material_assignments.body.thickness,part.blank_thickness_mm);assert.equal(out.source_sha256.length,64);
 }
 assert.equal(JSON.stringify(items),before,'export must not mutate saved materials, PVC or source data');
});
test('missing or wrong HDF assignment blocks the download with the named panel',async()=>{
 for(const id of [null,core.DEFAULT_MATERIALS.body_variant_id]){
  const b=buildCarcass({recipe:'shelves'},{bodyMaterialId:core.DEFAULT_MATERIALS.body_variant_id,backMaterialId:id});
  const e=exporter(b.items);await e.context.exportBazisProjectReady();const r=await e.result();
  assert.equal(r.payload,null);assert.match(r.message,/Задняя стенка ХДФ 3 мм: выберите материал толщиной 3 мм/);assert.equal(e.button.disabled,false);
 }
});
