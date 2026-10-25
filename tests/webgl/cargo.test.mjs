import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const G=globalThis.MF_CARGO;
const item=v=>C.normalizeKitchen({item_id:'cargo',name:'Карго',bazis_id:v.id,bazis_sha256:v.source_sha256,module_type:'base_cabinet',width:200,height:820,depth:510,base_height:100,base:'legs',layout:'drawers',drawers:1,x:0,z:0,rotation:0,handles:v.execution==='gola'?'handleless':'handles'});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});
for(const v of G.variants)test(v.label+' geometry, kits, profiles and source identity',()=>{
 const original=item(v),native=C.productionParts({...original,width:150},template(original));
 assert.equal(native.length,7);assert.equal(C.productionShelves(original).length,0);
 for(const p of native){const s=v.panels.find(s=>s.key===p.key);for(const [i,k] of ['x','y','z'].entries()){assert.ok(Math.abs(p.size[k]-s.size[i])<.001,p.key);assert.ok(Math.abs(p.position[k]-s.center[i])<.001,p.key);}}
 for(const width of v.allowed_widths)for(const depth of [510,600,700])for(const base of [80,100,150]){
  const it={...original,width,depth,legHeightMm:base,base_height:base,height:720+base},p=template(it);
  assert.equal(C.dimensionError(it,p),'');const parts=C.productionParts(it,p);
  assert.ok(parts.every(p=>Object.values(p.size).every(n=>n>0&&Number.isFinite(n))));
  assert.equal(parts.find(p=>p.key==='rail-rear').size.z,80);
  const fronts=C.facadeCells(it,p);assert.equal(fronts.length,1);assert.equal(fronts[0].kind,'drawer');assert.equal(fronts[0].w,width-3);
  const hw=C.productionHardware(it).items,k=G.kit(it);assert.equal(hw.filter(h=>h.key==='cargo-kit').length,1);assert.equal(hw.find(h=>h.key==='cargo-kit').article,k.article);
  assert.ok(!hw.some(h=>/петля|LED/.test(h.name)));assert.ok(!parts.some(p=>p.role==='drawer'));
  assert.equal(G.profiles(it).length,v.execution==='gola'?1:0);
  if(v.execution==='gola'){
   const ys=G.profiles(it)[0].contour_yz.map(p=>p[0]);assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-56.7645)<.001);
   const facadeFront=parts.find(p=>p.key==='front-1').position.z+9;
   assert.equal(it.depth/2+C.kitchenSettings(it).frontOverhangMm-facadeFront,.5);
   assert.equal(hw.find(h=>h.article==='60965').quantity,width/1000);
  }
  const b=G.basket(it);assert.ok(b.x-b.width/2>=-width/2+18-.01);assert.ok(b.x+b.width/2<=width/2-18+.01);assert.ok(b.z-b.depth/2>=-depth/2-.01);
 }
 const mesh=new MeshFactory({template,material:()=>null,room:{width:6000,depth:4000,height:3000}},()=>{}).build(original);
 let basket=0,pivots=0;mesh.traverse(m=>{if(m.userData.cargoBasket)basket++;if(m.userData.role==='door-pivot')pivots++;});assert.ok(basket>10);assert.equal(pivots,0);
 assert.ok(C.dimensionError({...original,bazis_sha256:'0'.repeat(64)},template(original)));
});
test('width restriction and variant switching preserve materials and worktop datum',()=>{
 for(const from of G.variants)for(const to of G.variants){
  const old={...item(from),part_materials:{'side-P':'board'},production_note:'Keep'},next=C.alignKitchenChange(old,G.select(old,to,G.variants));
  assert.equal(next.item_id,old.item_id);assert.equal(next.bazis_id,to.id);assert.deepEqual(next.part_materials,old.part_materials);assert.equal(next.production_note,'Keep');
  assert.equal(next.z-next.depth/2-C.kitchenSettings(next).rearServiceGapMm,old.z-old.depth/2-C.kitchenSettings(old).rearServiceGapMm);
 }
 for(const v of G.variants)for(const width of [149,175,250,350,401])assert.ok(G.dimensionError({...item(v),width}));
 const norwing=G.variants.find(v=>v.brand==='norwing');assert.match(G.dimensionError({...item(norwing),width:150}),/пересекают/);
 const focus=G.variants.find(v=>v.brand==='focus');assert.throws(()=>G.select({...item(focus),width:150},{brand:'norwing'},G.variants),/пересекают/);
});
test('exactly one cargo card; native baseline and importer width guards',()=>{
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),cards=[],node=()=>({dataset:{},append(){},replaceChildren(){}});
 const c=vm.createContext({MF_CARGO:G,MF_PULLOUT_DRYERS:globalThis.MF_PULLOUT_DRYERS,MF_GOLA:globalThis.MF_GOLA,MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:globalThis.MF_DRAWERS,MF_UPPERS:globalThis.MF_UPPERS,structuredClone,document:{body:{dataset:{}},getElementById:node,createElement:node}});
 vm.runInContext(source.slice(0,source.indexOf('let user=null')),c);c.addCatalogueButton=(root,opt)=>cards.push(opt);c.applyCatalogueFilter=()=>{};c.categoryKey=t=>t.module_type==='base_cabinet'?'base':t.module_type==='wall_cabinet'?'wall':'tall';
 vm.runInContext(source.slice(source.indexOf('function renderModuleCatalogue()'),source.indexOf('async function loadProjects()')),c);vm.runInContext('renderModuleCatalogue()',c);
 assert.equal(cards.filter(c=>G.choice(c.bazis)).length,1);
 const catalogue=vm.runInContext('bazisModules',c);for(const v of G.variants){const t=catalogue.find(t=>t.id===v.id);assert.equal(t.defaults.w,200);assert.equal(t.production.native_defaults.width,150);}
 const importer=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
 const start=importer.indexOf('const CARGO_WIDTHS'),end=importer.indexOf('const PULLOUT_DRYER_WIDTHS',start),widths=vm.runInNewContext(importer.slice(start,end)+';CARGO_WIDTHS');
 for(const v of G.variants)assert.deepEqual([...widths[v.source_sha256]],v.allowed_widths);
});
