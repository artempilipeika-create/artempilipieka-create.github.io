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

test('database JSON key order does not make a saved wardrobe look manually altered',()=>{
 const {a}=setup();applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec}));
 const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,reorder(v[k])])):v;
 a.restore(reorder(a.snapshot()));assert.equal(selectedCarcass(a).items.length,9);
 const updated=prepareAssistantPlan(a,{action:'update',spec:{...spec,shelves:5}});
 applyAssistantPlan(a,updated);assert.equal(a.items.length,10);
 a.items.find(i=>i.blank_binding).blank_binding.gap_left_mm=1;
 assert.throws(()=>selectedCarcass(a),/изменена вручную/);
});

test('manual divider datums produce exact openings and front setbacks through save, update and native export',async()=>{
 const {nativeCarcassJoints}=await import('../../backend/v2/cabinet_assets/planner/carcass-joints.mjs');
 const {blankNativeItem}=await import('../../backend/v2/cabinet_assets/planner/blanks-native.mjs');
 const {a,h}=setup();
 const design=wardrobeSpec({...spec,width:1200,sections:3,sectionShelves:[1,1,1],dividerPositions:[320,800],
  shelfChoices:[['4/48846'],['board/confirmat'],['board/95388']]});
 assert.deepEqual(sectionWidths(design),[320,462,346]);
 const plan=prepareAssistantPlan(a,{action:'create',spec:design});
 h.run('manual',()=>applyAssistantPlan(a,plan));a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 const meta=selectedCarcass(a).metadata;assert.deepEqual(meta.spec.dividerPositions,[320,800]);
 const byKey=Object.fromEntries(a.items.map(it=>[it.item_id.split(':').pop(),it]));
 const side=byKey.left;for(const k of ['divider-0','divider-1','shelf-0-0','shelf-1-0','shelf-2-0']){
  const part=byKey[k];assert.equal(part.depth,side.depth-1);
  assert.equal(part.z-part.depth/2,side.z-side.depth/2);
  assert.equal(part.z+part.depth/2,side.z+side.depth/2-1);
  assert.equal(blankNativeItem(part,{name:'QA',thickness:18}).target.depth,576);
 }
 assert.deepEqual([byKey['shelf-0-0'].width,byKey['shelf-1-0'].width,byKey['shelf-2-0'].width],[318,462,346]);
 for(const x of nativeCarcassJoints(a.items).filter(x=>x.joint_roll_deg))assert.equal(x.position.x,a.items.find(i=>i.item_id===x.joined_panel_id).x);
 assert.throws(()=>wardrobeSpec({...design,dividerPositions:[810,800]}),/узкие/);
 const centered={...design};delete centered.dividerPositions;
 const update=prepareAssistantPlan(a,{action:'update',spec:wardrobeSpec(centered)});
 assert.deepEqual(sectionWidths(update.spec),[376,376,376]);
});
