import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PRODUCTION_MODELS as models,normalizeKitchen,productionParts,productionHardware} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {MobilityUI} from '../../backend/v2/cabinet_assets/planner/mobility-ui.mjs';
import '../../backend/v2/cabinet_assets/planner/drawer-ui.js';
import '../../backend/v2/cabinet_assets/planner/production-notes.js';

const D=globalThis.MF_DRAWERS,choices=D.choices(),ball=choices.filter(v=>v.system==='ball');
const source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const template=it=>({production:models[it.bazis_id]});
const item=v=>normalizeKitchen({item_id:'drawer',name:'У мойки',module_type:'base_cabinet',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,
 width:600,height:820,depth:510,body_height:720,base_height:100,layout:'drawers',drawers:v.drawer_count,base:'legs',handles:'handles',x:100,z:100,rotation:90,
 body_variant_id:'body18',front_variant_id:'front18',back_variant_id:'hdf3',production_note:'Сохранить заметку'});

function catalogueContext(){
 const cards=[],node=()=>({dataset:{},append(){},replaceChildren(){}});
 const c=vm.createContext({document:{body:{dataset:{}},getElementById:node,createElement:node},structuredClone,MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:D});
 vm.runInContext(source.slice(0,source.indexOf('let user=null')),c);
 c.addCatalogueButton=(root,opt)=>cards.push(opt);c.applyCatalogueFilter=()=>{};
 c.categoryKey=t=>t.module_type==='base_cabinet'?'base':t.module_type==='wall_cabinet'?'wall':'tall';
 vm.runInContext(source.slice(source.indexOf('function renderModuleCatalogue()'),source.indexOf('async function loadProjects()')),c);
 vm.runInContext('renderModuleCatalogue()',c);
 return {cards,catalogue:vm.runInContext('bazisModules',c)};
}

test('One visible drawer card exposes all three systems and ten checked source choices',()=>{
 assert.equal(choices.length,10);assert.equal(ball.length,2);assert.equal(D.family.default_id,ball[0].id);
 const {cards,catalogue}=catalogueContext(),family=cards.filter(c=>D.choice(c.bazis));
 assert.equal(family.length,1);assert.equal(family[0].label,'Нижний шкаф с ящиками');
 for(const text of ['шариковые','AQ LineBox','Slimbox'])assert.ok(family[0].description.includes(text));
 for(const v of choices)assert.ok(catalogue.some(t=>t.id===v.id&&t.source_sha256===v.source_sha256));
});

test('Every supported transition keeps project identity, dimensions, notes and correct source',()=>{
 for(const from of choices)for(const to of choices){
  const old=item(from),copy=structuredClone(old),next=D.select(old,to,choices);
  assert.deepEqual(old,copy);assert.equal(D.familyInfo(next).id,to.id);
  for(const key of ['item_id','name','x','z','rotation','width','height','depth','body_height','base_height','body_variant_id','front_variant_id','back_variant_id','production_note'])assert.equal(next[key],old[key],key);
  assert.equal(next.bazis_file,to.source_file);assert.equal(next.bazis_sha256,to.source_sha256);assert.equal(next.drawers,to.drawer_count);
 }
 assert.equal(D.info(item(ball[0])),null,'Ordinary drawers must not use metal-specific geometry or thickness rules');
 assert.equal(D.familyInfo({...item(ball[0]),bazis_sha256:'0'.repeat(64)}),null);
 assert.throws(()=>D.select(item(ball[0]),{system:'aq'},choices.map(v=>({...v,source_sha256:'wrong'}))),/сочетания/);
});

test('Ordinary drawers retain 18 mm walls, 3 mm bottoms and native depth-based slide selection',()=>{
 for(const v of ball){
  const it=item(v),parts=productionParts(it,template(it));
  assert.equal(parts.filter(p=>p.role==='drawer').length,v.drawer_count*4);
  assert.ok(parts.filter(p=>p.role==='drawer').every(p=>p.thickness===18));
  assert.ok(parts.filter(p=>p.back_type==='drawer_bottom').every(p=>p.thickness===3));
  assert.equal(productionHardware({...it,depth:450}).slide_length_mm,400);
  assert.equal(productionHardware(it).slide_length_mm,500);
  assert.equal(productionHardware(it).slide_type,'ball_bearing_soft_close');
 }
 assert.deepEqual(D.frontHeights(item(ball[1])),[357,178,178]);
 for(const v of choices.filter(v=>v.system!=='ball'&&v.layout==='three'))assert.deepEqual(D.frontHeights(item(v)),[357,177.5,177.5]);
});

test('Cross-system materials follow matching role and thickness, including front-key remapping',()=>{
 const metal=item(D.variants[0]);metal.part_materials={bottom:'alternate18','side-L':'side18',back:'back3','front-1':'paint18','drawer-1-bottom':'drawer16','drawer-1-rear':'drawer16'};
 const ordinary=D.select(metal,{system:'ball'},choices);
 assert.deepEqual(ordinary.part_materials,{bottom:'alternate18','side-L':'side18',back:'back3','drawer-front-1':'paint18'});
 const parts=productionParts(ordinary,template(ordinary));
 assert.equal(parts.find(p=>p.key==='drawer-1-bottom').material.variant_id,'hdf3');
 assert.equal(parts.find(p=>p.key==='drawer-1-rear').material.variant_id,'body18');
 ordinary.part_materials['drawer-1-bottom']='bottom3';ordinary.part_materials['drawer-1-rear']='drawer18';
 const restored=D.select(ordinary,{system:'aq'},choices);
 assert.deepEqual(restored.part_materials,{bottom:'alternate18','side-L':'side18',back:'back3','front-1':'paint18'});
 assert.ok(!Object.values(restored.part_materials).includes('bottom3'));
 assert.ok(!Object.values(restored.part_materials).includes('drawer18'));
});

test('Unsupported combinations and incompatible metal dimensions cannot silently replace sources or sizes',()=>{
 for(const v of ball){
  const it=item(v);
  assert.equal(D.available(v,{opening:'push'}),null);assert.equal(D.available(v,{layout:'inner'}),null);
  assert.throws(()=>D.select(it,{opening:'push'},choices),/сочетания/);
  const narrow={...it,width:350};assert.throws(()=>D.select(narrow,{system:'aq'},choices),/400–1200/);
  const shallow={...it,depth:450};assert.throws(()=>D.select(shallow,{system:'slimbox'},choices),/510/);assert.equal(shallow.depth,450);
  assert.equal(D.select(shallow,{layout:v.layout==='two'?'three':'two'},choices).depth,450);
 }
});

test('Cross-system change and material remapping undo together',()=>{
 let snapshot={scene:{items:[{...item(D.variants[0]),part_materials:{'drawer-1-bottom':'board16'}}]}};
 const before=structuredClone(snapshot),adapter={snapshot:()=>snapshot,restore:s=>{snapshot=structuredClone(s)}},history=new History(adapter);
 history.run('Система',()=>{snapshot.scene.items[0]=D.select(snapshot.scene.items[0],{system:'ball'},choices);});
 const after=structuredClone(snapshot);assert.equal(history.undoStack.length,1);history.undo();assert.deepEqual(snapshot,before);history.redo();assert.deepEqual(snapshot,after);
});

test('Shared controls describe ordinary and metal construction accurately and disable unavailable choices',()=>{
 const buttons=[['system','ball'],['system','aq'],['system','slimbox'],['layout','two'],['layout','three'],['layout','inner'],['opening','soft'],['opening','push']].map(([key,value])=>({dataset:{drawerOption:key,drawerValue:value},attrs:{},setAttribute(k,v){this.attrs[k]=v},querySelector(){return null}}));
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
 const controls={querySelectorAll:()=>buttons,querySelector:node};
 const previous=globalThis.document;globalThis.document={getElementById:id=>id==='drawer-options-controls'?controls:null};
 try{
  MF_DRAWER_UI.sync(item(ball[1]),models[ball[1].id]);
  assert.equal(controls.hidden,false);assert.equal(node('#drawer-board-material-controls').hidden,true);
  assert.match(node('#drawer-construction').textContent,/18 мм/);assert.match(node('#drawer-fronts').textContent,/357 \+ 178 \+ 178/);
  assert.equal(buttons.find(b=>b.dataset.drawerValue==='push').disabled,true);
  assert.equal(buttons.find(b=>b.dataset.drawerValue==='inner').disabled,true);
  MF_DRAWER_UI.sync({...item(ball[0]),depth:450},models[ball[0].id]);
  assert.equal(buttons.find(b=>b.dataset.drawerValue==='aq').disabled,true);
  assert.match(buttons.find(b=>b.dataset.drawerValue==='aq').title,/510/);
  MF_DRAWER_UI.sync(item(D.variants[0]),models[D.variants[0].id]);
  assert.equal(node('#drawer-board-material-controls').hidden,false);assert.match(node('#drawer-construction').textContent,/16 мм/);
  assert.equal(buttons.find(b=>b.dataset.drawerValue==='ball').disabled,false);
 }finally{globalThis.document=previous;}
});

test('Replacement menu also has a single family entry; selected family uses its own controls',()=>{
 const {catalogue}=catalogueContext(),previous=globalThis.Option;
 globalThis.Option=class{constructor(text,value){this.text=text;this.value=value}};
 const options=[],ui={app:{adapter:{selected:{module_type:'base_cabinet',bazis_id:'bazis.0211e4f77fc4'}},bridge:{catalogue:{bazisModules:catalogue}}},section:{},shift:{},apply:{},select:{options,replaceChildren(...v){options.splice(0,options.length,...v)},append(v){options.push(v)}}};
 try{
  MobilityUI.prototype.sync.call(ui);assert.equal(options.filter(o=>D.choice(o.value)).length,1);assert.equal(options.find(o=>D.choice(o.value)).text,D.family.label);
  ui.app.adapter.selected=item(D.variants[0]);MobilityUI.prototype.sync.call(ui);assert.equal(options.filter(o=>D.choice(o.value)).length,0);
 }finally{globalThis.Option=previous;}
});

test('Actual export follows the final selected source and ordinary construction after switching',async()=>{
 const items=choices.map(v=>D.select(item(D.variants[0]),v,choices));let blob;
 const state={room:{width:6000,height:2700,depth:4000},items,production_note:''};
 const c=vm.createContext({state,templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,
 MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:D,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,
 $:()=>({value:'Unified drawer QA'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,
 URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);vm.runInContext('exportBazisProject()',c);
 const payload=JSON.parse(await blob.text());assert.equal(payload.items.length,10);
 for(let i=0;i<choices.length;i++){
  const out=payload.items[i],v=choices[i];assert.equal(out.source_sha256,v.source_sha256);assert.equal(out.source_file,v.source_file);
  if(v.system==='ball'){
   assert.equal(out.construction.metal_drawers,null);assert.equal(out.construction.hardware.slide_type,'ball_bearing_soft_close');
   assert.ok(out.construction.parts.filter(p=>p.role==='drawer').every(p=>p.thickness===18));
   assert.match(out.production_note,/обычные шариковые/);
  }else assert.equal(out.construction.metal_drawers.system,v.system);
 }
});
