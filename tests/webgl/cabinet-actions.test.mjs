import test from 'node:test';
import assert from 'node:assert/strict';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {selectedCarcass,prepareAssistantPlan,applyAssistantPlan} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {cabinetId,commitCabinet,heightTargets,matchCabinetHeight} from '../../backend/v2/cabinet_assets/planner/cabinet-actions.mjs';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeDrawing} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawing.mjs';
import {AssistantUI} from '../../backend/v2/cabinet_assets/planner/assistant-ui.mjs';
import {furnitureMeasures} from '../../backend/v2/cabinet_assets/planner/dimension-geometry.mjs';
import {splitPlinths} from '../../backend/v2/cabinet_assets/planner/wardrobe-plinth-runs.mjs';
import {PRODUCTION_MODELS,dimensionPatch,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';

const spec=wardrobeSpec({width:900,height:2100,depth:550,thickness:18,sections:2,sectionShelves:[2,3],
 dividerPositions:[310],back:true,backThickness:18,front:{swing:'pair',offset:90},feet:{article:'78517',front:80,rear:50}});
function project(items=[]){
 let state={room:{width:6800,depth:4000,height:3000,setup_complete:true},items};
 const a=new StateAdapter({state:()=>state,projectId:()=>'qa',selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),
    select:id=>{state.selected_item_id=id;},template:()=>null,material:()=>null,supportsElevation:true,refresh(){},
    snapshot:()=>({scene:structuredClone(state)}),restore:s=>{state=structuredClone(s.scene);}});
 return {a,h:new History(a)};
}
function fittings(items){
 const b=globalThis.MF_BLANKS_NATIVE;
 return ['hingeItems','footItems','jointItems','supportItems','hookItems'].flatMap(key=>b[key](items));
}
test('two identical AI cabinets move and reopen independently, native fittings follow, shared plinth splits and deletion undoes in one step',()=>{
 const {a,h}=project();
 for(const id of ['cabinet-a','cabinet-b'])applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec},{id}));
 const plinths=()=>a.items.filter(i=>i.item_id.endsWith(':plinth'));
 assert.equal(plinths().length,1);assert.equal(plinths()[0].width,1800);
 const id='cabinet-b';a.select(id+':shelf-1-1');
 const before=structuredClone(a.items),hardware=fittings(before),partMap=items=>new Map(splitPlinths(items).map(i=>[i.item_id,i]));
 a.items.find(i=>i.item_id===id+':left').blank_hook={article:'68416',face:'positive',count:1};
 const hardwareWithHook=fittings(a.items);
 assert.ok(hardware.length>40);assert.ok(hardwareWithHook.length>hardware.length);
 const stamp=JSON.stringify(a.items);
 assert.throws(()=>commitCabinet(a,id,{dx:-400,dz:0}),/Пересечение/);
 assert.equal(JSON.stringify(a.items),stamp);
 h.run('Перенос',()=>commitCabinet(a,id,{dx:100,dz:200}));
 assert.equal(plinths().length,2);assert.equal(h.undoStack.length,1);
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));const current=selectedCarcass(a);
 assert.equal(current.metadata.group_id,id);assert.equal(current.metadata.spec.sections,2);
 const oldById=partMap(before);
 for(const item of splitPlinths(a.items)){
   const moved=cabinetId(item)===id,old=oldById.get(item.item_id);
   assert.equal(item.x-old.x,moved?100:0);assert.equal(item.z-old.z,moved?200:0);
   assert.deepEqual(item.blank_binding,old.blank_binding);
 }
 const after=fittings(a.items);assert.equal(after.length,hardwareWithHook.length);
 for(const [ix,old] of hardwareWithHook.entries()){
   const fitting=after[ix],moved=cabinetId(oldById.get(old.host_blank_id??old.joined_panel_id))===id;
   assert.equal(fitting.source_file,old.source_file);assert.equal(fitting.position.x-old.position.x,moved?100:0);
   assert.equal(fitting.position.z-old.position.z,moved?200:0);assert.equal(fitting.position.y,old.position.y);
 }
 assert.doesNotThrow(()=>prepareAssistantPlan(a,{action:'update',spec}));
 h.undo();assert.equal(plinths().length,1);
 h.run('Удаление',()=>commitCabinet(a,id,null));assert.equal(plinths()[0].width,900);assert.ok(a.items.every(i=>cabinetId(i)!==id));
 h.undo();assert.equal(plinths()[0].width,1800);assert.equal(selectedCarcass(a).metadata.group_id,id);
});
test('individual panel view selects exactly one SVG with stable coordinates and manufacturer layout',()=>{
 const make=s=>buildCarcass(s,{idPrefix:'drawing'});
 for(const key of ['body','feet','plinth','back','sections','fronts']){
   const d=wardrobeDrawing(make(spec),key,1);assert.equal(d.svg.match(/<svg/g).length,1);assert.ok(d.svg.includes('data-view="'+key+'"'));
   assert.ok(!d.svg.includes('NaN'));if(key==='body')assert.ok(!d.svg.includes('data-panel="door'));
 }
 const changed={...spec,sectionShelves:[1,3]};
 for(const s of [spec,changed])assert.match(wardrobeDrawing(make(s),'sections',1).svg,/Секция 2 · 536 мм/);
 assert.match(wardrobeDrawing(make(spec),'feet').caption,/опор: 6/);
 const back=wardrobeDrawing(make(spec),'back').svg;assert.ok((back.match(/<circle/g)||[]).length>20);
 assert.ok(!wardrobeDrawing(make({...spec,backThickness:undefined}),'back').svg.includes('<circle'));
});

test('switching paired, left and right fronts immediately replaces the drawing, including an over-width single door',()=>{
 const fields=structuredClone(spec),warning={},drawing={replaceChildren(){this.innerHTML='';}};
 const ui={fields,view:'fronts',paintDrawing(svg){drawing.innerHTML=svg;},figureTitle:{},form:{querySelector:()=>warning},drawing,dimensions:{},description:{},spec(){return wardrobeSpec(this.fields);}};
 for(const width of [900,550]){
   fields.width=width;fields.dividerPositions=[230];
   for(const swing of ['pair','left','right','pair',null]){
     if(swing)fields.front={swing,offset:90};else delete fields.front;
     AssistantUI.prototype.draw.call(ui);
     assert.equal((drawing.innerHTML.match(/<svg/g)||[]).length,1);
     assert.deepEqual([...drawing.innerHTML.matchAll(/data-hinge="(\w+)"/g)].map(m=>m[1]),swing==='pair'?['left','right']:swing?[swing]:[]);
     if(width===900&&['left','right'].includes(swing)){
       assert.equal(warning.hidden,false);assert.match(warning.textContent,/600/);assert.throws(()=>ui.spec(),/600/);
     }else assert.equal(warning.hidden,true);
   }
 }
});

test('overview measures two distinct wardrobes and their run, detail measures the shelf and its underside from the floor',()=>{
 const {a}=project();
 for(const id of ['left-product','right-product'])applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec},{id}));
 const selected=a.items.find(it=>it.item_id==='right-product:shelf-1-1');
 const input=JSON.stringify(a.items);
 for(const mode of ['3d','front','top']){
   const {dims,subject}=furnitureMeasures(a.items,a.room,{selectedId:selected.item_id,mode});
   assert.equal(subject.item_id,'right-product');assert.equal(subject.depth,568);
   assert.deepEqual(dims.filter(d=>d.axis==='width').map(d=>d.value),[900,900]);
   assert.deepEqual(dims.filter(d=>d.kind==='run').map(d=>d.value),[1800]);
   assert.equal(dims.filter(d=>d.axis===(mode==='top'?'depth':'height')).length,1);
   assert.ok(dims.filter(d=>d.kind==='module').every(d=>d.readOnly));
 }
 const {dims,subject}=furnitureMeasures(a.items,a.room,{selectedId:selected.item_id,scope:'detail',mode:'3d'});
 assert.equal(subject,selected);assert.deepEqual(dims.map(d=>[d.axis,d.value]),[['width',selected.width],['depth',selected.depth],['elevation',selected.elevation_mm]]);
 assert.equal(dims.at(-1).a.y,0);assert.equal(dims.at(-1).b.y,selected.elevation_mm);
 assert.deepEqual(furnitureMeasures(a.items,a.room,{scope:'detail'}).dims,[]);
 assert.equal(JSON.stringify(a.items),input);
});
test('absolute kitchen row height preserves legs, individual upper bottoms, fixed oven cavity, rejects invalid target atomically',()=>{
 const base=(id,x,h,leg)=>({name:id,item_id:id,module_type:'base_cabinet',width:600,depth:510,height:h,base:'legs',base_height:leg,body_height:h-leg,worktop_thickness:38,x,z:0,rotation:0,layout:'doors',drawers:0});
 const up=(id,x,h,y)=>({...base(id,x,h,0),module_type:'wall_cabinet',depth:317,elevation_mm:y,base:'wall',worktop_thickness:0});
 const [ovenId,production]=Object.entries(PRODUCTION_MODELS).find(([_,p])=>p.constraints?.min_body_height_mm&&p.constraints?.fixed_width_mm);
 const oven={...base('НШД-600',1200,820,100),bazis_id:ovenId,bazis_sha256:production.source_sha256,layout:'niche'};
 const tall={...base('Пенал',-1200,2200,100),module_type:'tall_cabinet',worktop_thickness:0};
 const {a,h}=project([base('Образец',0,900,100),base('Сосед',600,850,150),oven,tall,up('Верх 1',0,900,1458),up('Верх 2',600,720,1560)]);
 const apply=it=>h.run('Высота ряда',()=>{a.state.items=matchCabinetHeight(a,it);});
 assert.equal(heightTargets(a.items,a.items[0]).length,3);
 apply(a.items[0]);assert.deepEqual(a.items.slice(0,3).map(i=>[i.height,i.body_height,i.base_height]),[[900,800,100],[900,750,150],[900,800,100]]);
 assert.equal(a.items[3].height,2200);assert.equal(a.items[5].height,720);
 assert.ok(productionParts(a.items[2],{production}).length);
 h.undo();assert.equal(a.items[1].height,850);h.redo();
 a.state.upperMountingRule='worktop600';
 apply(a.items[4]);assert.equal(a.items[5].height,900);assert.equal(a.items[5].elevation_mm,1560);
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));assert.equal(a.items[5].elevation_mm,1560);h.undo();assert.equal(a.items[5].height,720);
 a.items[0]=dimensionPatch(a.items[0],{height:690},a.room);const old=JSON.stringify(a.items);
 assert.throws(()=>matchCabinetHeight(a,a.items[0]),/НШД-600/);assert.equal(JSON.stringify(a.items),old);
});
