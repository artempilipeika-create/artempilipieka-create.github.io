import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {PRODUCTION_MODELS as models,productionParts,productionShelves,productionHardware,dimensionPatch} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import '../../backend/v2/cabinet_assets/planner/production-notes.js';
const U=globalThis.MF_UPPERS,core=globalThis.MF_FURNITURE_CORE,source=readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const item=v=>({item_id:'upper',name:'Над чайником',module_type:'wall_cabinet',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,
 width:600,height:720,depth:317,body_height:720,base_height:0,worktop_thickness:0,layout:'doors',drawers:0,base:'wall',handles:v.execution==='handles'?'handles':'handleless',x:100,z:200,rotation:90,
 body_variant_id:'body18',front_variant_id:'front18',back_variant_id:'hdf3',part_materials:{'side-L':'board18'},production_note:'Оставить заметку',doors_open:true});
const template=it=>({production:models[it.bazis_id]});

test('Corrected D2 replaces the current choice without rewriting saved source identity',()=>{
 const previous=U.choice('bazis.877ba2f68d92'),current=U.choice('bazis.6c187245284a');
 assert.equal(current.source_sha256,'6c187245284ab1651e01e4ff805f554cbedd5fef67ce5d9dabf67fde30351ae7');
 assert.equal(current.source_file,'ВМД2-600.(2).fr3d');
 assert.equal(U.family(current).default_id,current.id);
 assert.ok(!U.variants.includes(previous));assert.equal(U.info(item(previous)),previous);
 const old=item(previous),copy=structuredClone(old),updated=U.select(old,{execution:'handles'});
 assert.deepEqual(old,copy);assert.equal(U.info(updated),current);
 for(const key of ['item_id','name','width','height','depth','x','z','rotation','body_variant_id','front_variant_id','back_variant_id','part_materials','production_note'])assert.deepEqual(updated[key],old[key]);
 assert.equal(updated.handles,'handles');assert.equal(productionShelves(updated)[0].offset_mm,359.5);
 const hardware=productionHardware(updated);assert.equal(hardware.items.find(h=>h.article==='112602').quantity,4);
 assert.equal(models[previous.id].source_sha256,previous.source_sha256);
});

test('Exactly two catalogue cards expose all eighteen combinations',()=>{
 const cards=[],node=()=>({dataset:{},append(){},replaceChildren(){}});
 const c=vm.createContext({document:{body:{dataset:{}},getElementById:node,createElement:node},structuredClone,MF_FURNITURE_CORE:core,MF_DRAWERS:globalThis.MF_DRAWERS,MF_UPPERS:U});
 vm.runInContext(source.slice(0,source.indexOf('let user=null')),c);
 c.addCatalogueButton=(root,opt)=>cards.push(opt);c.applyCatalogueFilter=()=>{};c.categoryKey=t=>t.module_type==='base_cabinet'?'base':t.module_type==='wall_cabinet'?'wall':'tall';
 vm.runInContext(source.slice(source.indexOf('function renderModuleCatalogue()'),source.indexOf('async function loadProjects()')),c);c.renderModuleCatalogue();
 const uppers=cards.filter(c=>U.choice(c.bazis));assert.deepEqual(uppers.map(c=>c.bazis),U.families.map(f=>f.default_id));
 assert.equal(U.variants.length,18);assert.equal(U.all.filter(v=>v.legacy).length,6);
 for(const card of uppers){assert.match(card.description,/накладные ручки/);assert.match(card.description,/сушка/);assert.match(card.description,/нажатие/);}
});

for(const v of U.variants.filter(v=>!v.legacy))test(v.label+': native panel dimensions, positions and hardware',()=>{
 const it=item(v),parts=productionParts(it,template(it));
 assert.equal(U.dimensionError(it),'');assert.equal(parts.length,v.panels.length);
 const native=v.panels.map(p=>({size:p.size,lo:p.lo}));
 for(const p of parts){
  const size=['x','y','z'].map(k=>p.size[k]);
  const lo=['x','y','z'].map((k,j)=>Math.round((p.position[k]+[300,0,161.5][j]-p.size[k]/2)*1000)/1000);
  const at=native.findIndex(q=>q.size.every((n,j)=>Math.abs(n-size[j])<.001)&&q.lo.every((n,j)=>Math.abs(n-lo[j])<.001));
  assert.notEqual(at,-1,p.key+' '+JSON.stringify({size,lo}));native.splice(at,1);
 }
 const hw=productionHardware(it,models[v.id]);assert.equal(hw.hinge_count,2*v.door_count);
 assert.equal(hw.items.filter(h=>h.article==='112602').reduce((n,h)=>n+h.quantity,0),2*v.door_count);
 assert.equal(hw.items.filter(h=>h.article==='09.0019').reduce((n,h)=>n+h.quantity,0),v.execution==='push'?v.door_count:0);
 assert.ok(hw.items.every(h=>!/^\d+[xх]/.test(h.name)&&!['Поддон','Чашки','Тарелки'].includes(h.name)));
 assert.equal(U.adjustment(it),null);
});

test('Every variant transition keeps user data and exact source; one undo restores it',()=>{
 for(const from of U.variants)for(const to of U.variants.filter(v=>v.door_count===from.door_count)){
  const old=item(from),copy=structuredClone(old),next=U.select(old,to);
  assert.deepEqual(old,copy);assert.equal(U.info(next),to);
  for(const key of ['item_id','name','width','height','depth','x','z','rotation','body_variant_id','front_variant_id','back_variant_id','part_materials','production_note','doors_open'])assert.deepEqual(next[key],old[key]);
  assert.equal(next.handles,to.execution==='handles'?'handles':'handleless');
 }
 let state={items:[item(U.variants[0])]};const adapter={snapshot:()=>({scene:structuredClone(state)}),restore:s=>{state=structuredClone(s.scene)},status(){},notify(){}};
 const history=new History(adapter),old=structuredClone(state);history.begin('Исполнение');state.items[0]=U.select(state.items[0],{execution:'push'});history.commit();
 history.undo();assert.deepEqual(state,old);history.redo();assert.equal(U.info(state.items[0]).execution,'push');
 assert.throws(()=>U.select({...item(U.variants[0]),bazis_sha256:'0'.repeat(64)},{execution:'push'}));
});

test('Dryer bounds and resized shelf hardware match the chosen source type',()=>{
 const v=U.variants.find(v=>!v.legacy&&v.door_count===2&&v.filling==='dryer'),it=item(v);
 assert.match(U.dimensionError({...it,width:650}),/100/);assert.match(U.dimensionError({...it,width:1000}),/900/);
 const large=dimensionPatch(it,{height:900,width:800}),hw=productionHardware(large,models[v.id]);
 assert.equal(productionShelves(large).length,1);assert.equal(hw.items.find(h=>h.key==='dish-dryer').article,'113274');
 assert.equal(hw.items.find(h=>h.name.startsWith('Конфермат')).quantity,12);
 assert.ok(!hw.items.some(h=>h.article==='PK 5.0X16B'));assert.equal(U.adjustment(large).count,1);
 const plain=U.select(large,{filling:'shelves'});assert.equal(productionShelves(plain).length,2);assert.equal(productionHardware(plain).items.find(h=>h.article==='PK 5.0X16B').quantity,8);
});

test('New drafts and stored half-millimetre shelves validate through the real adapter',()=>{
 const catalogue=U.variants.map(v=>({id:v.id,source_file:v.source_file,source_sha256:v.source_sha256,module_type:'wall_cabinet',label:v.label,resize:true,production:models[v.id],defaults:{w:600,h:720,d:317,layout:'doors',drawers:0,base:'wall'},limits:U.limits(v)}));
 const adapter=new StateAdapter({catalogue:{bazisModules:catalogue},state:()=>({items:[],room:{width:4200,depth:3200,height:2700}}),selected:()=>null,template:it=>catalogue.find(v=>v.id===it.bazis_id)});
 for(const v of U.variants){const draft=adapter.createDraft({bazis:v.id});assert.equal(adapter.validate(draft),'');assert.equal(draft.handles,v.execution==='handles'?'handles':'handleless');}
});

test('Actual JSON export and importer profiles keep all eighteen exact identities',async()=>{
 const items=U.variants.map(item);let blob;
 const c=vm.createContext({state:{items,room:{width:4200,depth:3200,height:2700}},templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,
 MF_FURNITURE_CORE:core,MF_UPPERS:U,MF_PRODUCTION_NOTES:globalThis.MF_PRODUCTION_NOTES,$:()=>({value:'Upper QA'}),status(){},setTimeout(){},alert:m=>assert.fail(m),confirm:()=>true,
 URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);c.exportBazisProject();
 const payload=JSON.parse(await blob.text());assert.equal(payload.items.length,18);
 const script=readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8'),ic=vm.createContext({require:()=>({}),console,process});
 vm.runInContext(script.slice(0,script.lastIndexOf('(function main()')),ic);
 payload.items.forEach((out,i)=>{const v=U.variants[i];assert.equal(out.source_sha256,v.source_sha256);assert.equal(out.source_file,v.source_file);assert.equal(out.construction.upper_variant.execution,v.execution);
  assert.equal(ic.nativeFrameProfile(out).rearInsetMm,3);assert.match(out.production_note,new RegExp(v.execution==='push'?'tip-on':U.executions[v.execution]));});
});


test('Previously saved dryer donors refresh only the two approved source hashes',()=>{
 const start=source.indexOf('const UPPER_SOURCE_REFRESH='),end=source.indexOf('function scenePayload(){');
 assert.ok(start>=0&&end>start);
 const ctx=vm.createContext({MF_UPPERS:U,MF_FURNITURE_CORE:core});
 const inferStart=source.indexOf('function inferTemplate('),inferEnd=source.indexOf('function legacyItem(');
 assert.ok(inferStart>=0&&inferEnd>inferStart);
 vm.runInContext(source.slice(inferStart,inferEnd)+'\n'+source.slice(start,end),ctx);
 const revisions=[
  ['bazis.60f79b573cd1','60f79b573cd1ae910e0f5ec2796798e4250e3c2e0a2df0f52372d528dace9005'],
  ['bazis.1ac4fadd97b7','1ac4fadd97b74ebaf1d52e9d37c5d3e8652857c9422032e64dd3d0671911a63b']
 ];
 for(const [id,oldSha] of revisions){
  const donor=U.choice(id),previous={...item(donor),bazis_sha256:oldSha,production_note:'Не менять заметку',x:125,z:350};
  const room={width:4200,depth:3200,height:2700};
  const revived=ctx.normalizeScene({room,items:[previous]}).items[0];
  assert.equal(revived.bazis_sha256,donor.source_sha256);
  assert.equal(revived.bazis_file,donor.source_file);
  for(const field of ['name','width','height','depth','x','z','rotation','body_variant_id','front_variant_id','production_note'])assert.equal(revived[field],previous[field]);
  assert.equal(previous.bazis_sha256,oldSha);
  const unknown=ctx.normalizeScene({room,items:[{...previous,bazis_sha256:'0'.repeat(64)}]}).items[0];
  assert.equal(unknown.bazis_sha256,'0'.repeat(64));
 }
});
