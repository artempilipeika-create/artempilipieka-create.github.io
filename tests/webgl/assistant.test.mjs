import test from 'node:test';
import assert from 'node:assert/strict';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {prepareAssistantPlan,applyAssistantPlan,selectedCarcass} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {wardrobeSpec,sectionWidths,questionnaireMaterialError} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
const spec={recipe:'shelves',width:800,height:2200,depth:577,thickness:18,shelves:4,sections:1,back:true,elevation:0,shelfSetback:20,shelfGap:0,edgeThickness:1,edgePolicy:'front'};
function setup(){
 let state={room:{width:6000,depth:5000,height:2700,setup_complete:true},items:[]};
 const a=new StateAdapter({supportsElevation:true,state:()=>state,projectId:()=>null,selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),
 select:id=>{state.selected_item_id=id;},refresh(){},material:()=>null,snapshot:()=>({scene:structuredClone(state)}),restore:s=>{state=structuredClone(s.scene);}});
 return {a,h:new History(a)};
}
test('AI create, reload and edit use bound shelves and a single undo; retain materials, PVC and notes',()=>{
 const {a,h}=setup();let p=prepareAssistantPlan(a,{action:'create',spec});
 h.run('create',()=>applyAssistantPlan(a,p));assert.equal(a.items.length,9);assert.equal(selectedCarcass(a).metadata.spec.width,800);
 h.undo();assert.equal(a.items.length,0);h.redo();a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 const left=a.items[0];left.production_note='Не потерять примечание';left.blank_edge_code='1011';left.body_variant_id='manual-material';
 p=prepareAssistantPlan(a,{action:'update',spec:{...spec,width:1000,shelves:5}});
 h.run('edit',()=>applyAssistantPlan(a,p));assert.equal(a.items.length,10);
 assert.equal(a.items[0].production_note,left.production_note);assert.equal(a.items[0].blank_edge_code,'1011');assert.equal(a.items[0].body_variant_id,'manual-material');
 assert.equal(a.items.find(i=>i.item_id.endsWith(':shelf-0-0')).blank_length_mm,964);
 h.undo();assert.equal(a.items.length,9);assert.equal(selectedCarcass(a).metadata.spec.width,800);
});
test('stale proposals, invalid geometry and manual structural changes cannot overwrite work',()=>{
 const {a}=setup();const p=prepareAssistantPlan(a,{action:'create',spec});a.room.height=2800;
 assert.throws(()=>applyAssistantPlan(a,p),/Проект изменился/);assert.equal(a.items.length,0);
 assert.throws(()=>prepareAssistantPlan(a,{action:'create',spec:{...spec,height:3000}}));assert.equal(a.items.length,0);
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec}));a.items[0].x+=10;
 assert.throws(()=>selectedCarcass(a),/изменена вручную/);
});
test('removing noted shelves is explicit in preview; shrinking does not mutate existing scene',()=>{
 const {a}=setup();applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec}));
 a.items.find(i=>i.item_id.endsWith(':shelf-0-3')).production_note='Специальное крепление';
 const p=prepareAssistantPlan(a,{action:'update',spec:{...spec,shelves:1}});
 assert.ok(p.summary.some(s=>s.includes('есть примечание')));assert.equal(a.items.length,9);
});
test('questionnaire builds independent section fill, exact materials and reversible edits',()=>{
 const {a,h}=setup(),s=wardrobeSpec({...spec,width:1200,sections:3,sectionShelves:[2,0,5]});
 assert.equal(s.shelves,5);assert.deepEqual(sectionWidths(s),[376,376,376]);
 const p=prepareAssistantPlan(a,{action:'create',spec:s},{bodyMaterialId:'body-choice',backMaterialId:'back-choice'});
 h.run('form',()=>applyAssistantPlan(a,p));assert.equal(a.items.filter(i=>i.item_id.includes(':shelf-')).length,7);
 assert.equal(a.items.filter(i=>i.item_id.includes(':shelf-1-')).length,0);
 assert.ok(a.items.every(i=>i.body_variant_id===(i.item_id.endsWith(':back')?'back-choice':'body-choice')));
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));assert.deepEqual(selectedCarcass(a).metadata.spec.sectionShelves,[2,0,5]);
 const changed=prepareAssistantPlan(a,{action:'update',spec:wardrobeSpec({...s,sectionShelves:[1,3,0]})},{bodyMaterialId:'new-body',backMaterialId:'new-back'});
 h.run('edit',()=>applyAssistantPlan(a,changed));assert.equal(a.items.filter(i=>i.item_id.includes(':shelf-')).length,4);
 assert.ok(a.items.every(i=>i.body_variant_id===(i.item_id.endsWith(':back')?'new-back':'new-body')));
 h.undo();assert.deepEqual(selectedCarcass(a).metadata.spec.sectionShelves,[2,0,5]);
 assert.throws(()=>wardrobeSpec({...s,sectionShelves:[1]}));assert.throws(()=>wardrobeSpec({...s,sectionShelves:[1,2,11]}));
 assert.match(questionnaireMaterialError({variant_id:'x',thickness:16},18),/18 мм/);
});
