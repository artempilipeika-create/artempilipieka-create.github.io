import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PRODUCTION_MODELS as models,productionParts,productionHardware,dimensionError,dimensionPatch,facadeCells,normalizeKitchen,PILOT_PRODUCTION} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {modulePriceBreakdown} from '../../backend/v2/cabinet_assets/planner/pricing.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import '../../backend/v2/cabinet_assets/planner/drawer-ui.js';
const D=globalThis.MF_DRAWERS,native=JSON.parse(readFileSync(new URL('./fixtures/drawer-native-panels.json',import.meta.url)));
const item=v=>normalizeKitchen({item_id:'drawer',name:'У мойки',bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,bazis_resize:true,module_type:'base_cabinet',width:600,height:820,depth:510,body_height:720,base_height:100,layout:'drawers',drawers:v.drawer_count,base:'legs',handles:'handles',x:100,z:100,rotation:90,body_variant_id:'wood',front_variant_id:'front',production_note:'Сохранить',part_materials:{bottom:'custom'}});
const template=it=>({production:models[it.bazis_id]});
for(const v of D.variants)test(v.label+': cutlist vs independent binary FR3D audit',()=>{
 const it=item(v),parts=productionParts(it,template(it));
 const expected=native[v.id].panels.filter(p=>p.thickness>=1);
 assert.equal(parts.length,expected.length);
 for(let i=0;i<parts.length;i++){
  const p=parts[i],n=expected[i];assert.equal(p.name,n.name);assert.equal(p.thickness,n.thickness);
  Object.values(p.size).forEach((x,j)=>assert.ok(Math.abs(x-n.bounds.size[j])<.1,`${p.key} axis${j}`));
  Object.values(p.position).forEach((x,j)=>assert.ok(Math.abs(x-((n.bounds.lo[j]+n.bounds.hi[j])/2-[300,0,255][j]))<.1,`${p.key} position${j}`));
  if(p.role==='drawer'){assert.equal(p.material.variant_id,null);assert.equal(p.visual_variant_id,'wood');assert.equal(p.thickness,16);}
 }
 assert.deepEqual(facadeCells(it,template(it)).map(f=>f.h),v.front_heights);
 assert.equal(dimensionError(it,template(it)),'');
 const hw=productionHardware(it).items,pricing=modulePriceBreakdown(it,template(it));
 assert.equal(hw.find(h=>h.name.startsWith('Конфермат')).quantity,8);
 assert.ok(!pricing.hardware.some(h=>h.key.startsWith('drawer-slides:')));
 assert.equal(pricing.sheetMaterials.reduce((n,r)=>n+r.partCount,0),parts.length);
 assert.equal(parts.filter(p=>p.thickness<1).length,0);
 if(v.layout==='inner'){
  const inner=hw.find(h=>h.article==='117346');assert.equal(inner.quantity,1);assert.match(inner.name,/SOFT CLOSE/);
  assert.equal(hw.find(h=>h.article==='113187').quantity,1);assert.equal(hw.find(h=>h.article==='94123').quantity,1);
 }
 const factory=new MeshFactory({template,material:()=>null}),mesh=factory.build(it);
 assert.ok(mesh.children.some(m=>m.userData.drawerMetal));factory.dispose();
});
test('All variant transitions preserve dimensions, location, materials, name and notes',()=>{
 for(const from of D.variants)for(const to of D.variants){
  const original=item(from),before=structuredClone(original),next=D.select(original,to,D.variants);
  for(const k of ['item_id','name','width','height','depth','x','z','rotation','body_variant_id','front_variant_id','part_materials','production_note'])assert.deepEqual(next[k],original[k]);
  assert.deepEqual(original,before);assert.equal(D.info(next).id,to.id);assert.equal(next.bazis_file,to.source_file);assert.equal(next.drawers,to.drawer_count);
  if(to.opening==='push')assert.equal(next.handles,'handleless');
 }
});
test('Unavailable combinations cannot silently substitute a different donor',()=>{
 const aq=item(D.variants[0]);for(const patch of [{opening:'push'},{layout:'inner'}])assert.throws(()=>D.select(aq,patch,D.variants),/сочетания/);
 const bad={...aq,bazis_sha256:'0'.repeat(64)};assert.equal(D.info(bad),null);assert.match(dimensionError(bad),/не совпадает/);
});
test('Legs translate all boards without stretching body or changing facades',()=>{
 for(const v of D.variants)for(const legHeightMm of [80,100,150]){
  const old=item(v),it=dimensionPatch(old,{legHeightMm}),a=productionParts(old,template(old)),b=productionParts(it,template(it));
  assert.equal(dimensionError(it),'');assert.equal(it.height,720+legHeightMm);
  for(let i=0;i<a.length;i++){assert.deepEqual(a[i].size,b[i].size);assert.ok(Math.abs(b[i].position.y-a[i].position.y-legHeightMm+100)<1e-8);}
 }
});
test('Width changes match both native X planes; height and depth are elastic',()=>{
 for(const v of D.variants){
  const it=item(v),wide={...it,width:800},p=productionParts(wide,template(wide));
  assert.equal(p.find(p=>p.key==='bottom').size.x,800);assert.equal(p.find(p=>p.key==='drawer-1-bottom').size.x,689);
  assert.equal(p.find(p=>p.key==='side-P').position.x,391);assert.equal(p.find(p=>p.key==='front-1').size.x,797);
  assert.equal(dimensionError({...it,depth:560}),'');assert.equal(dimensionError({...it,height:900,body_height:800}),'');
 }
 assert.ok(PILOT_PRODUCTION['bazis.39f282e08f0c']);assert.ok(PILOT_PRODUCTION['bazis.5f5697e39e27']);
});
test('Illustrated configurations remain distinct',()=>{for(const layout of ['two','three','inner'])assert.match(MF_DRAWER_UI.drawing(layout),/<svg/);assert.match(MF_DRAWER_UI.drawing('inner'),/stroke-dasharray/);});
test('Variant replacement is one undoable action, rejected changes add no history',()=>{
 let snapshot={name:'Кухня',scene:{room:{},items:[item(D.variants[0])]}};
 const adapter={snapshot:()=>snapshot,restore:s=>{snapshot=structuredClone(s)}},history=new History(adapter),before=structuredClone(snapshot);
 history.run('Система',()=>{snapshot.scene.items[0]=D.select(snapshot.scene.items[0],{system:'slimbox'},D.variants)});
 assert.equal(history.undoStack.length,1);const after=structuredClone(snapshot);history.undo();assert.deepEqual(snapshot,before);history.redo();assert.deepEqual(snapshot,after);
 assert.throws(()=>history.run('Нет варианта',()=>{snapshot.scene.items[0]=D.select(snapshot.scene.items[0],{system:'aq',opening:'push'},D.variants)}));assert.deepEqual(snapshot,after);assert.equal(history.undoStack.length,1);
});
test('16 mm board material overrides are separate from white metal and preserved on switch',()=>{
 const it=item(D.variants[0]);it.part_materials['drawer-1-bottom']='wood16';
 const next=D.select(it,{system:'slimbox'},D.variants),parts=productionParts(next,template(next));
 assert.equal(parts.find(p=>p.key==='drawer-1-bottom').material.variant_id,'wood16');assert.equal(parts.find(p=>p.key==='drawer-1-bottom').thickness,16);
});
test('White metal keeps its own material when corpus decor and inspection mode change',()=>{
 const it=item(D.variants[0]),factory=new MeshFactory({template,material:()=>({visual:{render_color:'#331100'}})}),mesh=factory.build(it);
 factory.updateAppearance(mesh,{...it,body_variant_id:'new'},'inspection');
 for(const m of mesh.children.filter(m=>m.userData.drawerMetal)){assert.equal(m.material.color.getHexString(),'f4f4f1');assert.equal(m.material.userData.variantId,null);}
 factory.release(mesh);factory.dispose();
});
test('Actual native export carries eight matching files, nominal fronts and separate base height',async()=>{
 await import('../../backend/v2/cabinet_assets/planner/production-notes.js');
 const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');let blob;
 const state={room:{width:6000,height:2700,depth:4000},items:D.variants.map(v=>dimensionPatch(item(v),{legHeightMm:150})),production_note:''};
 const c=vm.createContext({state,templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,
 MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:D,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,
 $:()=>({value:'Drawer QA'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,
 URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({style:{},click:()=>{},remove:()=>{}}),body:{append:()=>{}}}});
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);vm.runInContext('exportBazisProject()',c);
 const payload=JSON.parse(await blob.text());assert.equal(payload.items.length,8);
 for(let i=0;i<8;i++){const out=payload.items[i],v=D.variants[i];assert.equal(out.source_file,v.source_file);assert.equal(out.source_sha256,v.source_sha256);assert.equal(out.target.height,820);assert.equal(out.construction.base_height,150);assert.deepEqual(out.construction.metal_drawers.front_heights_mm,v.front_heights);assert.ok(out.production_note.includes(v.series));}
});
test('Native importer protects service-only AQ surface and keeps 16 mm board material',()=>{
 const script=readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_7_2_DRAWER_MATERIALS.js',import.meta.url),'utf8');
 const c=vm.createContext({require:()=>({}),console,process});vm.runInContext(script.slice(0,script.lastIndexOf('(function main()')),c);
 for(const v of D.variants){
  const it={source_sha256:v.source_sha256,construction:{parts:[{role:'body',thickness:18,material:{name:'Decor18'}},{role:'drawer',thickness:16,material:{name:'Decor16'}}]}};
  assert.equal(c.materialPalette(it).drawer.name,'Decor16');
  assert.equal(c.panelMaterialKind('Наполнение AQ LineBox',{Thickness:.1},it),null);
  assert.equal(c.panelMaterialKind(v.system==='aq'?'З/С AQ LineBox':'Ст. задн. ящика',{Thickness:16},it),'drawer');
  assert.equal(c.panelMaterialKind('З.С',{Thickness:3},it),'hdf');
 }
 assert.equal(readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8'),script);
});
test('Actual order transfer refuses wrong-thickness material before any write and uses explicit board IDs',async()=>{
 const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),requests=[];
 const it=item(D.variants[1]);it.part_materials={};
 const state={items:[it],room:{width:4200,depth:3200,height:2700}},materials=new Map([['wood',{thickness:18}],['front',{thickness:18}],['wood16',{thickness:16}],['hdf3',{thickness:3}]]);
 const c=vm.createContext({state,materials,templateFor:template,project:{project_id:'qa'},MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:D,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,
 $:()=>({value:'Drawer QA'}),saveProject:async()=>{requests.push({path:'save'})},uid:()=>String(requests.length),mmNumber:n=>n,location:{assign:()=>{}},api:async(path,method,body)=>{requests.push({path,method,body});return path==='/orders'?{order_id:'mock',optimistic_lock_version:1}:{active_release:'release'}}});
 vm.runInContext(source.slice(source.indexOf('function cutlistItem('),source.indexOf('function renderCutlist(')),c);vm.runInContext(source.slice(source.indexOf('async function toOrder('),source.indexOf('async function start(')),c);
 await assert.rejects(()=>vm.runInContext('toOrder()',c),/материал 3 мм|материал 16 мм/);assert.equal(requests.length,0);
 it.back_variant_id='hdf3';for(const p of productionParts(it,template(it)))if(p.role==='drawer')it.part_materials[p.key]='wood16';
 await vm.runInContext('toOrder()',c);const details=requests.find(r=>r.path.endsWith('/revisions')).body.details;
 assert.equal(details.filter(p=>p.variant_id==='wood16').length,4);assert.equal(details.filter(p=>p.variant_id==='hdf3').length,1);assert.equal(details.length,12);
});
