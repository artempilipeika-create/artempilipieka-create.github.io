import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {fingerprint} from '../../backend/v2/cabinet_assets/planner/project-autosave.mjs';
import {AccessoryUI} from '../../backend/v2/cabinet_assets/planner/accessory-ui.mjs';
const A=globalThis.MF_ACCESSORIES;
const room={width:6000,depth:4000,height:2700};
const item=(v=A.dishwashers[0],patch={})=>C.normalizeKitchen({item_id:'pm',name:'Посудомойка',module_type:'base_cabinet',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,width:600,height:820,depth:510,base_height:100,body_height:720,base:'legs',layout:'doors',drawers:0,handles:'handleless',x:0,z:0,rotation:0,...patch});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});
const state=(rotation=0,shape='straight')=>({room,items:[item(A.dishwashers[0],{item_id:'a',...C.rotateXZ(-300,0,rotation),rotation}),C.normalizeKitchen({...item(A.dishwashers[1],{item_id:'b',...C.rotateXZ(300,0,rotation),rotation}),rearServiceGapMm:50},room)],plinths:[{id:'p',members:['a','b'],shape,inset:40,material_id:'green18'}]});
test('All six donors retain exact SHA and native dimensions',()=>{
 assert.equal(A.variants.length,6);
 for(const v of A.variants){const bytes=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/accessory-sources/'+v.source_file,import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),v.source_sha256);assert.deepEqual(v.frame.size,[600,v.kind==='dishwasher'?820:100,600]);}
});
for(const v of A.dishwashers)test('Dishwasher '+v.variant+' preserves facade and profile without carcass or furniture legs',()=>{
 for(const width of [450,600])for(const height of [720,820,900]){
  const it=item(v,{width,height,body_height:height-100,front_variant_id:'front18'}),p=template(it),parts=C.productionParts(it,p,id=>({name:id,article:'P1',thickness:18}));
  assert.equal(C.dimensionError(it,p),'');assert.equal(parts.length,1);assert.equal(parts[0].role,'front');assert.equal(parts[0].size.x,width-3);assert.equal(parts[0].size.y,(v.variant==='gola'?688.5:717)+height-820);assert.equal(parts[0].position.z,264);assert.equal(parts[0].material.name,'front18');assert.deepEqual(C.kitchenLegs(it),[]);
  const m=new MeshFactory({template,material:()=>null,room},()=>{}).build(it);let bodies=0,profiles=0;
  m.traverse(n=>{if(['body','leg','reveal'].includes(n.userData.role))bodies++;if(n.userData.golaProfile)profiles++;});assert.equal(bodies,0);assert.equal(profiles,v.profiles.length);
 }
 assert.match(C.dimensionError(item(v,{base_height:80,legHeightMm:80})),/100 мм/);
});
test('Every row rotation and shape matches native frame placement and selected 18 mm material',()=>{
 for(const rotation of [0,90,180,270])for(const shape of Object.keys(A.names)){
  const s=state(rotation,shape),p=A.plans(s,id=>({name:id,article:'18',material_id:'m'}))[0],out=A.nativeItems(s,id=>({name:id}))[0];
  assert.ok(!p.error,p.error);assert.equal(p.width,1200);assert.equal(p.parts.length,shape==='u'?3:shape==='straight'?1:2);assert.equal(out.source_sha256,p.source.source_sha256);assert.deepEqual(out.position,p.position);assert.equal(out.rotation,p.rotation);
  const points=p.parts.flatMap(part=>[-1,1].flatMap(x=>[-1,1].map(z=>{const pt=C.rotateXZ(part.position.x+x*part.size.x/2,part.position.z+z*part.size.z/2,p.rotation);return C.rotateXZ(pt.x+p.position.x,pt.z+p.position.z,-rotation);})));assert.equal(Math.max(...points.map(p=>p.z)),215);assert.equal(Math.min(...points.map(p=>p.x)),-600);assert.equal(Math.max(...points.map(p=>p.x)),600);
  if(shape==='left'||shape==='right'){const side=p.parts.find(p=>p.orientation.thickness_axis==='x'),pos=C.rotateXZ(side.position.x,side.position.z,p.rotation-rotation);assert.ok(shape==='left'?pos.x<0:pos.x>0);}
  for(const part of p.parts){assert.equal(part.thickness,18);assert.equal(part.material.name,'green18');assert.equal(part.size.y,shape==='straight'?97:100);}
 }
});
test('Row resize, manual overrides, duplicate prevention and split-row errors',()=>{
 const s=state();s.items.push(item(A.dishwashers[0],{item_id:'c',x:900}));assert.equal(A.plans(s)[0].width,1800);
 s.plinths[0].width=1750;assert.equal(A.plans(s)[0].width,1750);assert.equal(JSON.parse(JSON.stringify(s)).plinths[0].width,1750);
 s.items[1].x=2000;assert.match(A.plans(s)[0].error,/разделён/);
 const dup=state();dup.plinths.push({...dup.plinths[0],id:'q'});assert.match(A.plans(dup)[1].error,/Два цоколя/);assert.throws(()=>A.nativeItems(dup),/Два цоколя/);
});
test('Served 9.9.2 importer assigns the explicit plinth material and accepts symmetric source frame',()=>{
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8'),c=vm.createContext({require:createRequire(import.meta.url),console,process});vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);
 for(const shape of Object.keys(A.names)){const out=A.nativeItems(state(0,shape),id=>({name:id,thickness:18}))[0];assert.equal(c.materialPalette(out).body.name,'green18');assert.equal(c.panelMaterialKind('Цоколь',{Thickness:18},out),'body');const d=c.detectAxisMap({x:600,y:100,z:600},out.source_default);assert.equal(d.map.width,'x');assert.equal(d.map.depth,'z');}
});
test('Actual catalogue has one dishwasher card for both exact sources',()=>{
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8'),cards=[],node=()=>({dataset:{},append(){},replaceChildren(){}}),c=vm.createContext({MF_GOLA:globalThis.MF_GOLA,MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_DRAWERS:globalThis.MF_DRAWERS,MF_UPPERS:globalThis.MF_UPPERS,MF_ACCESSORIES:A,structuredClone,document:{body:{dataset:{}},getElementById:node,createElement:node}});
 vm.runInContext(source.slice(0,source.indexOf('let user=null')),c);c.addCatalogueButton=(root,opt)=>cards.push(opt);c.applyCatalogueFilter=()=>{};c.categoryKey=()=> 'base';vm.runInContext(source.slice(source.indexOf('function renderModuleCatalogue()'),source.indexOf('async function loadProjects()')),c);vm.runInContext('renderModuleCatalogue()',c);assert.equal(cards.filter(x=>A.dishwashers.some(v=>v.id===x.bazis)).length,1);
});
test('Actual accessory controls add, resize, switch, undo, redo and remove a row plinth',()=>{
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.events={};this.attrs={};this.isConnected=true;}
  append(...nodes){this.children.push(...nodes);}before(){}replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this.attrs[k]=v;}
 }
 const doc=globalThis.document;globalThis.document={createElement:tag=>new Node(tag),getElementById:()=>new Node('div')};
 try{
  let s=state();s.plinths=[];let ui;const messages=[];
  const adapter={get state(){return s},get items(){return s.items},get selected(){return s.items[0]},material:()=>null,status:m=>messages.push(m),snapshot:()=>({name:'QA',scene:s}),restore:snapshot=>{s=structuredClone(snapshot.scene);ui.sync();}};
  const history=new History(adapter),app={adapter,bridge:{refresh:()=>ui?.sync()},interaction:{change:(label,fn)=>history.run(label,fn)},listen:(node,event,fn)=>node.events[event]=fn};
  ui=new AccessoryUI(app);ui.sync();assert.equal(ui.add.disabled,false);
  const before=fingerprint({name:'QA',scene:s});ui.add.events.click();assert.equal(s.plinths.length,1);assert.notEqual(fingerprint({name:'QA',scene:s}),before);assert.equal(history.undoStack.length,1);
  ui.add.events.click();assert.equal(s.plinths.length,1);assert.match(messages.at(-1),/уже добавлен/);
  const walk=n=>[n,...n.children.flatMap(walk)],left=walk(ui.list).find(n=>n.tagName==='button'&&n.children.some(c=>c.textContent==='Возврат слева'));left.events.click();assert.equal(s.plinths[0].shape,'left');
  const width=walk(ui.list).find(n=>n.tagName==='input'&&n.attrs['aria-label']==='Длина, мм');width.value='1320';width.events.change();assert.equal(s.plinths[0].width,1320);
  history.undo();assert.equal(s.plinths[0].width,undefined);history.redo();assert.equal(s.plinths[0].width,1320);
  walk(ui.list).find(n=>n.textContent==='Удалить цоколь').events.click();assert.equal(s.plinths.length,0);history.undo();assert.equal(s.plinths[0].width,1320);
  const auto=walk(ui.auto).find(n=>n.attrs['aria-label']==='Цоколь по расстановке');auto.checked=true;auto.events.change();
  assert.equal(s.plinths.length,1);assert.equal(s.plinths[0].automatic,true);assert.equal(A.plans(s).length,2);
  assert.equal(Math.abs(A.plans(s)[0].position.z-A.plans(s)[1].position.z),21.5);
  history.undo();assert.equal(s.plinths[0].width,1320);history.redo();assert.equal(s.plinths[0].automatic,true);
  const module=walk(ui.auto).find(n=>n.attrs['aria-label']==='Цоколь у выбранного модуля');module.checked=false;module.events.change();assert.deepEqual(s.plinths[0].excluded_members,[s.items[0].item_id]);
  s.items.push(item(A.dishwashers[0],{item_id:'future',x:900}));ui.sync();assert.equal(A.plans(s).reduce((sum,p)=>sum+p.width,0),1200);
 }finally{globalThis.document=doc;}
});
test('Real JSON exporter carries dishwasher variants and a native row plinth once',async()=>{
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');let blob;
 const s=state(90,'u'),c=vm.createContext({MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_ACCESSORIES:A,MF_GOLA:globalThis.MF_GOLA,MF_UPPERS:globalThis.MF_UPPERS,MF_DRAWERS:globalThis.MF_DRAWERS,state:s,templateFor:template,materials:new Map([['green18',{name:'Green',article:'G18',variant_id:'green18',thickness:18}]]),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,$:()=>({value:'QA'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL:()=>{}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('const UPPER_SOURCE_REFRESH='),source.indexOf('function normalizeItem(')),c);
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);c.exportBazisProject();const payload=JSON.parse(await blob.text());
 assert.equal(payload.items.length,3);assert.equal(payload.kitchen_production.native_plinths_included,1);assert.ok(payload.kitchen_production.runs.every(r=>r.parts.every(p=>p.role!=='plinth')));
 const plinth=payload.items[2];assert.equal(plinth.source_sha256,A.variants.find(v=>v.variant==='u').source_sha256);assert.equal(plinth.construction.parts.length,3);assert.equal(plinth.material_assignments.body.article,'G18');
 for(const [i,v]of A.dishwashers.entries()){assert.equal(payload.items[i].source_sha256,v.source_sha256);assert.equal(payload.items[i].source_default.depth,600);assert.equal(payload.items[i].target.depth,510);assert.equal(payload.items[i].construction.parts.length,1);}
});
