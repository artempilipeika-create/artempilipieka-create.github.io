import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PRODUCTION_MODELS as models,normalizeKitchen,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const D=globalThis.MF_DRAWERS,core=globalThis.MF_FURNITURE_CORE;
const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const template=it=>({production:models[it.bazis_id]});
const item=v=>normalizeKitchen({item_id:v.id,name:v.label,module_type:'base_cabinet',bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,bazis_resize:true,width:600,height:820,depth:510,body_height:720,base_height:100,base:'legs',layout:'drawers',drawers:v.drawer_count,x:0,z:0,rotation:0,body_variant_id:'body-a',front_variant_id:'front',back_variant_id:'back',part_materials:{bottom:'body-override'}});
const material=(id,thickness,color)=>({variant_id:id,name:id+' '+thickness+' мм',article:id,material_id:'m-'+id,thickness,visual:{render_color:color||'#ffffff'}});
const materials=new Map([['body-a',material('body-a',18,'#aa2200')],['body-b',material('body-b',18,'#0000cc')],['drawer16',material('drawer16',16,'#008800')],['wrong18',material('wrong18',18)],['front',material('front',18)],['back',material('back',3)]]);
const lookup=id=>materials.get(id),parts=it=>productionParts(it,template(it),lookup);
function node(){return {dataset:{},children:[],append(...xs){this.children.push(...xs)},replaceChildren(...xs){this.children=xs},setAttribute(){}};}
function picker(items,scope='module'){
 const c=vm.createContext({state:{items},selected:()=>items[0],templateFor:template,materials:new Map(materials),MF_FURNITURE_CORE:core,MF_DRAWERS:D,MF_GOLA:globalThis.MF_GOLA,label:m=>m?.name||'',status:()=>{},updateAll:()=>{},syncControls:()=>{},$:id=>id==='material-scope'?{value:scope}:node(),document:{createElement:node},api:async()=>({items:[]})});
 vm.runInContext(source.slice(source.indexOf('function materialVisualLabel('),source.indexOf('function setMode(')),c);
 return async(kind,id)=>{c.api=async()=>({items:[materials.get(id)]});const input={value:'плита',dataset:{}},results=node();await c.searchMaterial(input,results,kind);assert.equal(results.children.length,1);results.children[0].onclick();};
}
async function exported(items){
 let blob;const c=vm.createContext({state:{items,room:{width:6000,depth:4000,height:2700},production_note:''},templateFor:template,materials,MF_FURNITURE_CORE:core,MF_DRAWERS:D,MF_GOLA:globalThis.MF_GOLA,Blob,Date,JSON,Math,FACADE_GAP_MM:1.5,$:()=>({value:'Materials QA'}),status:()=>{},alert:m=>assert.fail(m),confirm:()=>true,setTimeout:()=>{},URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('const UPPER_SOURCE_REFRESH='),source.indexOf('function normalizeItem(')),c);
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);c.exportBazisProject();return JSON.parse(await blob.text());
}

test('Real material picker preserves 16 mm assignments when the carcass changes, locally and for the whole kitchen',async()=>{
 for(const scope of ['module','kitchen']){
  const items=D.variants.map(item),choose=picker(items,scope);await choose('drawer','drawer16');await choose('body','body-b');
  for(const it of scope==='module'?items.slice(0,1):items){
   assert.equal(it.body_variant_id,'body-b');assert.equal(it.back_variant_id,'back');assert.equal(it.part_materials.bottom,undefined);
   for(const p of parts(it).filter(p=>p.role==='drawer')){assert.equal(it.part_materials[p.key],'drawer16');assert.equal(p.material.variant_id,'drawer16');assert.equal(p.material.thickness,16);assert.equal(p.thickness,16);}
  }
  if(scope==='module')assert.equal(items[1].body_variant_id,'body-a');
  const payload=await exported(items);
  for(const out of scope==='module'?payload.items.slice(0,1):payload.items)for(const p of out.construction.parts.filter(p=>p.role==='drawer')){assert.equal(p.material.article,'drawer16');assert.equal(p.material.thickness,16);}
 }
});

test('Unassigned and stale 18 mm drawer materials cannot enter production exports as 16 mm SKUs',async()=>{
 const items=[];
 for(const v of D.variants)for(const override of [null,'body-a','wrong18']){
  const it=item(v);if(override)for(const p of parts(it).filter(p=>p.role==='drawer'))it.part_materials[p.key]=override;
  for(const p of parts(it).filter(p=>p.role==='drawer')){assert.equal(p.material.variant_id,null);assert.equal(p.material.name,null);assert.equal(p.material.article,null);assert.equal(p.visual_variant_id,'body-a');assert.equal(p.thickness,16);}
  items.push(it);
 }
 const payload=await exported(items);
 for(const out of payload.items)for(const p of out.construction.parts.filter(p=>p.role==='drawer')){assert.equal(p.material.variant_id,null);assert.equal(p.material.name,null);assert.equal(p.thickness,16);}
});

test('WebGL inherits body colour without a purchasing assignment, then respects the selected 16 mm material',()=>{
 const it=item(D.variants[0]),factory=new MeshFactory({template,material:lookup}),mesh=factory.build(it);
 const drawerMeshes=[];mesh.traverse(m=>{if(m.isMesh&&m.userData.part?.role==='drawer')drawerMeshes.push(m)});assert.ok(drawerMeshes.length);
 assert.ok(drawerMeshes.every(m=>m.material.userData.variantId==='body-a'));
 it.body_variant_id='body-b';factory.updateAppearance(mesh,it);assert.ok(drawerMeshes.every(m=>m.material.userData.variantId==='body-b'));
 for(const p of parts(it).filter(p=>p.role==='drawer'))it.part_materials[p.key]='drawer16';
 factory.updateAppearance(mesh,it);assert.ok(drawerMeshes.every(m=>m.material.userData.variantId==='drawer16'));
 it.body_variant_id='body-a';factory.updateAppearance(mesh,it);assert.ok(drawerMeshes.every(m=>m.material.userData.variantId==='drawer16'));
 assert.ok(drawerMeshes.every(m=>m.userData.part.thickness===16));factory.release(mesh);factory.dispose();
});

test('Ordinary ball-bearing drawer walls continue using the carcass 18 mm material',async()=>{
 for(const v of D.choices().filter(v=>v.system==='ball')){
  const it=item(v);await picker([it])('body','body-b');
  const walls=parts(it).filter(p=>p.role==='drawer');assert.ok(walls.length);
  assert.ok(walls.every(p=>p.material.variant_id==='body-b'&&p.thickness===18));
  assert.ok(parts(it).filter(p=>p.back_type==='drawer_bottom').every(p=>p.thickness===3));
 }
});

test('Native importer never substitutes carcass material for an unassigned metal drawer and preserves panel thickness',async()=>{
 const script=readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_9_6_UNIVERSAL_SEARCH.js',import.meta.url),'utf8');
 const c=vm.createContext({require:()=>({}),console,process,objectTypeChecker:{ObjectIsPanel:p=>Boolean(p.isPanel)},materialData:{CreateMaterialData:(name,thickness)=>({name,thickness}),SetupObjectMaterial:(panel,material,changeThickness)=>{assert.equal(changeThickness,false);panel.assigned=material;}},historyOperations:{RegisterObjectChanging(){}}});
 vm.runInContext(script.slice(0,script.lastIndexOf('(function main()')),c);
 for(const selected of [false,true]){
  const it=item(D.variants[0]);if(selected)for(const p of parts(it).filter(p=>p.role==='drawer'))it.part_materials[p.key]='drawer16';
  const out=(await exported([it])).items[0],panel={isPanel:true,Name:'З/С AQ LineBox',Thickness:16},root={AsList:()=>({Count:1,Objects:[panel]})};
  c.applyProjectMaterials(root,out,[]);assert.equal(panel.Thickness,16);
  if(selected){assert.equal(c.materialPalette(out).drawer.variant_id,'drawer16');assert.equal(panel.assigned.thickness,16);assert.match(panel.assigned.name,/drawer16/);}
  else{assert.equal(c.materialPalette(out).drawer,null);assert.equal(panel.assigned,undefined);}
  const bad={...out,construction:{parts:[{role:'body',thickness:18,material:materials.get('body-a')},{role:'drawer',thickness:16,material:materials.get('body-a')}]}};
  assert.equal(c.materialPalette(bad).drawer,null);
 }
 assert.equal(readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8'),script);
});

test('Cutlist shows the required 16 mm board instead of falling back to the 18 mm carcass label',()=>{
 const it=item(D.variants[0]),c=vm.createContext({materials,templateFor:template,MF_FURNITURE_CORE:core});
 vm.runInContext(source.slice(source.indexOf('function cutlistItem('),source.indexOf('function allCutlist(')),c);
 const rows=c.cutlistItem(it).filter(r=>r[7]?.role==='drawer');assert.ok(rows.length);
 assert.ok(rows.every(r=>r[6]==='Не выбран · ЛДСП 16 мм'));
 for(const p of parts(it).filter(p=>p.role==='drawer'))it.part_materials[p.key]='drawer16';
 assert.ok(c.cutlistItem(it).filter(r=>r[7]?.role==='drawer').every(r=>r[6]==='drawer16 16 мм'));
});
