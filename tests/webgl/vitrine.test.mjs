import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {VITRINE as V,PRODUCTION_MODELS as models,productionParts,productionHardware,dimensionError,facadeCells} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {modulePriceBreakdown} from '../../backend/v2/cabinet_assets/planner/pricing.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import '../../backend/v2/cabinet_assets/planner/production-notes.js';
const native=JSON.parse(readFileSync(new URL('./fixtures/vitrine-native-panels.json',import.meta.url)));
const item=v=>({item_id:'vitrine',name:'У окна',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:v.global_elastic_defined,
  module_type:'tall_cabinet',width:600,height:2000,depth:600,base:'legs',base_height:100,body_height:1900,worktop_thickness:0,handles:'handleless',x:100,z:300,rotation:90,
  body_variant_id:'body',front_variant_id:null,glass_shelf_count:null});
const template=it=>({production:models[it.bazis_id]});
const parts=it=>productionParts(it,template(it));
for(const v of V.variants)test(`Z1 ${v.light_system} ${v.lighting}/${v.opening}: independently measured FR3D panels and cuts`,()=>{
  const it=item(v),actual=parts(it),expected=[...native[v.id]];
  assert.equal(actual.filter(p=>p.type==='panel').length,expected.length);
  for(const part of actual.filter(p=>p.type==='panel')){
    const index=expected.findIndex(p=>p.size.every((n,i)=>Math.abs(n-Object.values(part.size)[i])<.001)&&p.center.every((n,i)=>Math.abs(n-Object.values(part.position)[i])<.001));
    assert.ok(index>=0,JSON.stringify({key:part.key,size:part.size,position:part.position,expected}));expected.splice(index,1);
  }
  assert.equal(dimensionError(it),'');
  assert.deepEqual(facadeCells(it,template(it)),[{kind:'door',w:596,h:1896,cx:0,cy:1050}]);
  const grooves=actual.flatMap(p=>p.machining||[]);assert.equal(grooves.length,v.lighting==='both'?2:1);
  for(const g of grooves){assert.equal(g.width_mm,v.light_system==='aq-4x8'?4:17.5);assert.equal(g.depth_mm,v.light_system==='aq-4x8'?8:6.5);assert.equal(g.length_mm,1900);assert.equal(g.start.z,9);}
  assert.deepEqual(actual.filter(p=>p.type==='profile').map(p=>p.cut_length_mm),[1896,1896,596,596]);
  const hardware=productionHardware(it).items;
  assert.equal(hardware.find(h=>h.key===(v.light_system==='aq-4x8'?'led-aq-15.0341':'led-aks-75069')).quantity,v.lighting==='both'?3.8:1.9);
  assert.equal(hardware.find(h=>h.key==='profile-z1-black').quantity,4.984);
  assert.equal(hardware.find(h=>h.key==='seal-z1').quantity,4.874);
  assert.equal(hardware.find(h=>h.key==='corner-z1').quantity,4);
});
test('All 144 independent system/light/opening changes preserve placement, custom name, shelves and material',()=>{
  const catalogue=V.variants;
  for(const from of V.variants)for(const to of V.variants){
    const a={...item(from),glass_shelf_count:4},b=V.select(a,to,catalogue);
    for(const key of ['item_id','name','width','height','depth','x','z','rotation','body_variant_id','glass_shelf_count'])assert.equal(a[key],b[key]);
    assert.equal(b.bazis_sha256,to.source_sha256);assert.equal(V.info(b).light_system,to.light_system);assert.equal(dimensionError(b),'');assert.equal(b.bazis_resize,to.global_elastic_defined);
  }
});
test('Missing global elasticity is guarded; resized quantities, LED cutting and shelves stay consistent',()=>{
  for(const v of V.variants){
    const it={...item(v),width:550,height:2211,body_height:2111,depth:550,glass_shelf_count:3};
    if(!v.global_elastic_defined){assert.match(dimensionError(it),/600 × 2000 × 600/);continue;}
    assert.equal(dimensionError(it),'');assert.equal(parts(it).filter(p=>p.role==='shelf').length,3);
    const m=V.metrics(it),n=v.lighting==='both'?2:1;
    assert.equal(m.led_length_m,2.111*n);assert.equal(m.led_order_length_m,2.125*n);
    assert.equal(m.profile_length_m,5.306);assert.equal(m.seal_length_m,5.196);
    assert.equal(productionHardware(it).items.find(h=>h.key==='glass-shelf-support').quantity,12);
    assert.ok(V.adjustment(it).requires_manual_native_adjustment);
  }
  assert.match(dimensionError({...item(V.variants[0]),bazis_sha256:'0'.repeat(64)}),/не совпадает/);
});
test('Estimate does not bill profiles as sheet materials or duplicate native hinges; missing prices remain null',()=>{
  const it=item(V.variants[0]),b=modulePriceBreakdown(it,template(it));
  assert.equal(b.sheetMaterials.filter(r=>r.role==='glass').reduce((n,r)=>n+r.partCount,0),2);
  assert.equal(b.sheetMaterials.reduce((n,r)=>n+r.partCount,0),7);
  assert.equal(b.hardware.filter(r=>r.article?.startsWith('70T950A')).length,1);
  assert.equal(b.hardware.filter(r=>r.key.startsWith('hinges:')).length,0);
  assert.equal(b.totals.costMinor,null);assert.equal(b.hardware.find(r=>r.key==='hardware:seal-z1').quantity_basis,'glass_perimeter_estimate');
  assert.equal(b.operations.find(r=>r.key==='operation:led-groove-4x8').quantity,1.9);
  const raw=JSON.parse(JSON.stringify({...it,glass_shelf_count:0}));
  assert.equal(parts(raw).filter(p=>p.role==='shelf').length,0);
  assert.equal(productionHardware(raw).items.find(p=>p.key==='glass-shelf-support').quantity,0);
  const note=globalThis.MF_PRODUCTION_NOTES.moduleText(raw);for(const text of ['15.0341','4.984','4.874','Стекло и рамка','вручную'])assert.ok(note.includes(text),text);
});
test('LIRA selection preserves opening/light side, uses whole stock lengths and does not charge an extra screen',()=>{
  const old={...item(V.variants[5]),glass_shelf_count:3};
  const it=V.select(old,{light_system:'lira-17.5x6.5'},V.variants);
  assert.equal(V.info(it).lighting,'both');assert.equal(V.info(it).opening,'right');
  const hw=productionHardware(it).items,m=V.metrics(it);
  assert.equal(m.led_article,'75069');assert.equal(m.led_power_w,36.48);
  assert.equal(hw.find(h=>h.article==='89609').quantity,2);
  assert.equal(hw.find(h=>h.article==='89610').quantity,4);
  assert.equal(hw.find(h=>h.article==='77267').quantity,null);
  assert.equal(hw.find(h=>h.key==='kubic-screws').quantity,12);
  assert.equal(hw.find(h=>h.article==='20646').quantity,20);
  assert.ok(!hw.some(h=>/рассеиватель|экран/i.test(h.name)&&!h.name.includes('профиль с экраном')));
  const tall={...it,height:2201,body_height:2101};
  const tallHW=productionHardware(tall).items;
  assert.equal(tallHW.find(h=>h.article==='89672').quantity,2);
  assert.ok(!tallHW.some(h=>h.article==='89609'));
  assert.equal(V.metrics(tall).led_order_length_m,4.25);
  const estimate=modulePriceBreakdown(it,template(it));
  assert.equal(estimate.operations.find(r=>r.key==='operation:led-groove-17.5x6.5').quantity,3.8);
  assert.equal(estimate.hardware.find(r=>r.article==='77267').status,'PRICING_RULE_MISSING');
});
test('KUBIC visuals follow every glass shelf in both lighting systems and never enter the cutlist',()=>{
  const factory=new MeshFactory({template,material:()=>null,room:{width:4200,height:2700,depth:3200}},()=>{});
  for(const v of [V.variants[0],V.variants[11]])for(const count of [null,0,3]){
    const it={...item(v),glass_shelf_count:count},g=factory.build(it),meshes=[];
    g.traverse(m=>{if(m.isMesh)meshes.push(m);});
    const supports=meshes.filter(m=>m.userData.role==='shelfSupport');
    assert.equal(supports.length,(count??1)*4);
    for(const m of supports){
      assert.ok(Math.abs(m.position.y-(V.shelves(it)[m.userData.shelfIndex]-2)/1000)<1e-9);
      assert.ok(Math.abs(Math.abs(m.position.x)-.282)<1e-9);
      assert.ok([-.232,.248].some(z=>Math.abs(z-m.position.z)<1e-9));
      assert.ok(m.userData.visualOnly&&!m.userData.part);
    }
    assert.equal(meshes.filter(m=>m.userData.role==='lightProfile').length,v.light_system==='aq-4x8'?0:2);
    factory.updateAppearance(g,it,'facadesHidden');assert.ok(supports.every(m=>m.visible));
    factory.release(g);
  }
  factory.dispose();
});
test('Transparent glass, four black frame members and lighting survive appearance and door state changes',()=>{
  const it=item(V.variants[5]),adapter={template,material:()=>null,room:{width:4200,height:2700,depth:3200}},factory=new MeshFactory(adapter,()=>{});
  const group=factory.build(it),meshes=[];group.traverse(m=>{if(m.isMesh)meshes.push(m);});
  assert.equal(meshes.filter(m=>m.userData.role==='frame').length,4);
  assert.equal(meshes.filter(m=>m.userData.role==='glass').length,2);
  assert.equal(meshes.filter(m=>m.userData.role==='led').length,2);
  assert.ok(!meshes.some(m=>m.userData.role==='reveal'));
  for(const m of meshes.filter(m=>m.userData.role==='glass'))assert.ok(m.material.transparent&&m.material.opacity<.3);
  factory.updateAppearance(group,{...it,body_variant_id:'different'});
  for(const m of meshes.filter(m=>m.userData.role==='glass'))assert.ok(m.material.transparent&&!m.castShadow);
  factory.updateAppearance(group,it,'facadesHidden');
  assert.equal(group.children.find(m=>m.userData.role==='door-pivot').visible,false);
  const open=factory.build({...it,doors_open:true});assert.ok(open.children.find(m=>m.userData.role==='door-pivot').rotation.y>0);
  assert.notEqual(factory.signature(it),factory.signature({...it,glass_shelf_count:2}));
  factory.release(group);factory.release(open);factory.dispose();
});
test('Real native exporter carries exact twelve donor identities, machining, components and manual shelf changes',async()=>{
  const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
  let blob;
  const state={room:{width:6000,height:2700,depth:4000},items:V.variants.map(v=>({...item(v),glass_shelf_count:3})),production_note:''};
  const context=vm.createContext({state,templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,
    FACADE_GAP_MM:1.5,MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_VITRINE:V,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,
    $:()=>({value:'Vitrine QA'}),status:()=>{},setTimeout:()=>{},alert:message=>assert.fail(message),confirm:()=>true,
    URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL:()=>{}},
    document:{createElement:()=>({style:{},click:()=>{},remove:()=>{}}),body:{append:()=>{}}}});
  vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),context);
  vm.runInContext('exportBazisProject()',context);
  const payload=JSON.parse(await blob.text());assert.equal(payload.items.length,12);
  payload.items.forEach((out,i)=>{
    assert.equal(out.source_sha256,V.variants[i].source_sha256);assert.equal(out.source_file,V.variants[i].source_file);
    assert.deepEqual(out.source_default,{width:600,height:2000,depth:600});assert.deepEqual(out.target,out.source_default);
    assert.equal(out.elastic_resize,V.variants[i].global_elastic_defined);
    assert.equal(out.construction.vitrine.groove_width_mm,i<6?4:17.5);assert.equal(out.construction.vitrine.groove_depth_mm,i<6?8:6.5);
    assert.equal(out.construction.native_adjustment.count,3);assert.ok(out.construction.native_adjustment.requires_manual_native_adjustment);
    assert.equal(out.construction.hardware.items.find(h=>h.key==='profile-z1-black').quantity,4.984);
    assert.ok(out.production_note.includes(i<6?'15.0341':'75069'));
  });
});
test('Order transfer includes only the five LDSP panels; separate glass and frame stay in the manufacturing brief',async()=>{
  const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),requests=[];
  const it=item(V.variants[0]),state={room:{width:4200,height:2700,depth:3200},items:[it]};
  const context=vm.createContext({state,templateFor:template,project:{project_id:'qa-project'},materials:new Map(),
    MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_VITRINE:V,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,
    $:()=>({value:'Vitrine QA'}),saveProject:async()=>{},uid:()=>String(requests.length),mmNumber:n=>n,location:{assign:()=>{}},
    api:async(path,method,body)=>{requests.push({path,method,body});return path==='/orders'?{order_id:'mock-order',optimistic_lock_version:1}:{active_release:'mock-release'};}});
  vm.runInContext(source.slice(source.indexOf('function cutlistItem('),source.indexOf('function renderCutlist(')),context);
  vm.runInContext(source.slice(source.indexOf('async function toOrder('),source.indexOf('async function start(')),context);
  await vm.runInContext('toOrder()',context);
  const revision=requests.find(r=>r.path.endsWith('/revisions')).body;
  assert.equal(revision.details.length,5);assert.ok(revision.details.every(p=>p.variant_id==='body'));
  assert.ok(revision.details.every(p=>!p.name.includes('Стекло')&&!p.name.includes('Z1')));
  for(const text of ['568.5 × 1868.5 × 4','556 × 580 × 4','15.0341','4.984','4.874'])assert.ok(revision.comment.includes(text),text);
});
