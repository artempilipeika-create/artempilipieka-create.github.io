import test from 'node:test';
import assert from 'node:assert/strict';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {AssistantUI} from '../../backend/v2/cabinet_assets/planner/assistant-ui.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {prepareAssistantPlan,applyAssistantPlan,selectedCarcass} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {wardrobeSpec,sectionWidths,questionnaireMaterialError} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
const spec={recipe:'shelves',width:800,height:2200,depth:577,thickness:18,shelves:4,sections:1,back:true,elevation:0,shelfSetback:20,shelfGap:0,edgeThickness:1,edgePolicy:'front'};
function setup(catalogue={}){
 let state={room:{width:6000,depth:5000,height:2700,setup_complete:true},items:[]};
 const a=new StateAdapter({supportsElevation:true,state:()=>state,projectId:()=>null,selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),
 select:id=>{state.selected_item_id=id;},refresh(){},material:id=>catalogue[id]??null,snapshot:()=>({scene:structuredClone(state)}),restore:s=>{state=structuredClone(s.scene);}});
 return {a,h:new History(a)};
}
const selectedStock={body:'71118e45-0ce3-534b-ad68-db1238304f18',front:'389a2abc-c6e2-5214-a41b-60054320d0ff',back:'fb7b270e-66ad-5411-affc-5717b1adf0d6'};
const wardrobeCatalogue={
 [selectedStock.body]:{name:'Белый 605 PO',thickness:18},
 [selectedStock.front]:{name:'Персидский жемчуг 890 PO',thickness:'18.0'},
 [selectedStock.back]:{name:'ЛХДФ белый',thickness:3},custom:{name:'Дуб',thickness:18}
};
const panelSpec=wardrobeSpec({...spec,sectionShelves:[1],clearLayout:true,shelfLevels:[[{mode:'floor',mm:720}]],front:{swing:'pair',offset:90,autoHinges:true},
 drawerBanks:[{kind:'internal',layout:'equal',gap:15,faces:[{height:null},{height:null},{height:null}]}],
 nicheSplits:[{section:0,level:1,kind:'shelves',columns:[{gaps:[null,null]},{gaps:[null,null]}]}]});
test('an old door in a neighbouring wardrobe cannot veto a new wardrobe or silently change during apply',()=>{
 const {a}=setup(wardrobeCatalogue),create={action:'create',spec:panelSpec};
 applyAssistantPlan(a,prepareAssistantPlan(a,create,{id:'first',selectedMaterials:selectedStock}));
 const old=a.items.find(i=>i.item_id==='first:door-right');old.body_variant_id=selectedStock.back;
 const previous=structuredClone(a.items);
 const p=prepareAssistantPlan(a,create,{id:'second',selectedMaterials:selectedStock});
 applyAssistantPlan(a,p);
 assert.deepEqual(a.items.filter(i=>i.assistant_carcass.group_id==='first'),previous);
 assert.match(a.validate(old),/ЛХДФ белый.*3 мм.*18 мм/);
 assert.throws(()=>blankNativeItem(old,wardrobeCatalogue[old.body_variant_id]),/18 мм/);
 const fronts=a.items.filter(i=>i.assistant_carcass.group_id==='second'&&i.blank_axis==='front');
 assert.equal(fronts.length,5);
 for(const i of fronts)assert.equal(i.body_variant_id,selectedStock.front);
});
test('reopening repairs incompatible and missing assignments from the displayed role while retaining compatible manual decors',()=>{
 const {a}=setup(wardrobeCatalogue);
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec:panelSpec},{id:'wardrobe',selectedMaterials:selectedStock}));
 const part=key=>a.items.find(i=>i.item_id==='wardrobe:'+key);
 part('door-right').body_variant_id=selectedStock.back;
 part('door-left').body_variant_id='custom';
 part('door-left').blank_thickness_mm='18';part('door-left').depth='18';
 part('drawer-0-0-face').body_variant_id=null;
 part('drawer-0-1-face').body_variant_id='custom';
 part('drawer-0-0-side-left').body_variant_id=selectedStock.back;
 part('back').body_variant_id=selectedStock.front;
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 const p=prepareAssistantPlan(a,{action:'update',spec:panelSpec},{selectedMaterials:selectedStock});
 assert.equal(part('door-right').body_variant_id,selectedStock.back);
 applyAssistantPlan(a,p);
 assert.equal(part('door-right').body_variant_id,selectedStock.front);
 assert.equal(part('door-left').body_variant_id,'custom');
 assert.equal(part('drawer-0-0-face').body_variant_id,selectedStock.front);
 assert.equal(part('drawer-0-1-face').body_variant_id,'custom');
 assert.equal(part('drawer-0-0-side-left').body_variant_id,selectedStock.body);
 for(const key of ['back','drawer-0-0-bottom'])assert.equal(part(key).body_variant_id,selectedStock.back);
 for(const i of a.items)assert.equal(Number(blankNativeItem(i,a.material(i.body_variant_id),a.items).material_assignments.body.thickness),i.blank_thickness_mm);
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'update',spec:panelSpec},{selectedMaterials:selectedStock,frontMaterialId:selectedStock.front}));
 assert.ok(a.items.filter(i=>i.blank_axis==='front').every(i=>i.body_variant_id===selectedStock.front));
});
test('a genuinely incompatible front fails by name and thickness both before and after preview',()=>{
 const catalogue=structuredClone(wardrobeCatalogue),{a}=setup(catalogue),create={action:'create',spec:panelSpec};
 assert.throws(()=>prepareAssistantPlan(a,create,{selectedMaterials:selectedStock,frontMaterialId:selectedStock.back}),/Фасад.*ЛХДФ белый.*3 мм.*18 мм/);
 const pending=prepareAssistantPlan(a,create,{selectedMaterials:selectedStock});
 catalogue[selectedStock.front].thickness=16;
 assert.throws(()=>applyAssistantPlan(a,pending),/Фасад.*890 PO.*16 мм.*18 мм/);
 assert.equal(a.items.length,0);
});
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

test('reopening the build wizard defaults to a new wardrobe with the previous one selected',()=>{
 const {a}=setup();
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec}));
 const options=[];
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({})};
 try{
  const ui={app:{adapter:a},mode:{setAttribute(){},replaceChildren(){options.length=0;},append(option){options.push(option.value);}},
   reset(){},dialog:{showModal(){},toggleAttribute(){},querySelector(){return {}; }},steps:[{focus(){}}]};
  AssistantUI.prototype.open.call(ui);
  assert.deepEqual(options,['create','update']);
  assert.equal(ui.mode.value,'create');
 }finally{
  if(previous===undefined)delete globalThis.document;
  else globalThis.document=previous;
 }
});

test('successive wardrobe builds extend the row and editing one group preserves its neighbours',()=>{
 const {a,h}=setup();
 const groups=[];
 for(const width of [800,650,1000]){
  const before=structuredClone(a.items);
  const plan=prepareAssistantPlan(a,{action:'create',spec:{...spec,width}});
  h.run('create',()=>applyAssistantPlan(a,plan));
  assert.deepEqual(a.items.slice(0,before.length),before);
  const {metadata}=selectedCarcass(a);
  assert.ok(!groups.some(g=>g.group_id===metadata.group_id));
  if(groups.length){
   const previous=groups.at(-1);
   assert.equal(metadata.position.x,previous.position.x+(previous.spec.width+width)/2);
   assert.equal(metadata.position.z,previous.position.z);
  }
  groups.push(metadata);
 }
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 const neighbours=()=>a.items.filter(i=>i.assistant_carcass.group_id!==groups[1].group_id);
 const before=structuredClone(neighbours());
 a.select(groups[1].group_id+':left');
 const edit=prepareAssistantPlan(a,{action:'update',spec:{...groups[1].spec,shelves:2}});
 h.run('edit',()=>applyAssistantPlan(a,edit));
 assert.deepEqual(neighbours(),before);
 assert.equal(selectedCarcass(a).metadata.spec.shelves,2);
});

test('compatible wardrobe plinths form one edged board and split when the middle model changes',()=>{
 const {a}=setup();
 const feet={article:'78517',front:80,rear:50};
 for(let i=0;i<3;i++)applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec:{...spec,feet}},{id:'g'+i}));
 const panels=()=>a.items.filter(it=>it.item_id.endsWith(':plinth'));
 assert.equal(panels().length,1);assert.equal(panels()[0].width,2400);
 assert.equal(panels()[0].height,97);
 // A row saved by the earlier preview still has a 2 mm clearance.
 Object.assign(panels()[0],{height:98,body_height:98,blank_width_mm:98});
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 a.select('g1:left');assert.equal(selectedCarcass(a).items.find(it=>it.item_id.endsWith(':plinth')).width,800);
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'update',spec:{...spec,feet:{...feet,article:'86503'}}}));
 assert.deepEqual(panels().map(it=>it.height).sort((a,b)=>a-b),[97,97,147]);
 assert.ok(panels().every(it=>it.blank_edge_code==='1111'&&it.width===800));
});

test('wardrobe drawer banks survive save, reopen, material changes and one undo with shelves above',()=>{
 const {a,h}=setup();
 const form={...spec,width:600,height:2000,depth:600,sections:1,sectionShelves:[1],
  front:{swing:'left',offset:130},shelfLevels:[[{mode:'gap',mm:250}]],
  drawerBanks:[{kind:'internal',faces:[{height:197},{height:147}]}]};
 const create=prepareAssistantPlan(a,{action:'create',spec:wardrobeSpec(form)},{bodyMaterialId:'body',frontMaterialId:'front'});
 h.run('drawers',()=>applyAssistantPlan(a,create));
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 assert.deepEqual(selectedCarcass(a).metadata.spec.drawerBanks,form.drawerBanks);
 const get=key=>a.items.find(it=>it.item_id.endsWith(':'+key));
 assert.equal(get('shelf-0-0').elevation_mm,18+197+147+6+250);
 assert.equal(get('drawer-0-0-face').body_variant_id,'front');
 assert.equal(get('drawer-0-0-bottom').blank_thickness_mm,3);
 assert.equal(get('drawer-0-spacer-left').width,18);
 assert.equal(get('drawer-0-spacer-right'),undefined);
 const edited={...form,front:{swing:'right',offset:130}};
 const update=prepareAssistantPlan(a,{action:'update',spec:wardrobeSpec(edited)});
 h.run('change hinge side',()=>applyAssistantPlan(a,update));
 assert.ok(get('drawer-0-spacer-right'));assert.equal(get('drawer-0-spacer-left'),undefined);
 h.undo();assert.ok(get('drawer-0-spacer-left'));
 assert.throws(()=>wardrobeSpec({...form,drawerBanks:[{kind:'internal',faces:[{height:2400}]}]}));
 assert.ok(get('drawer-0-spacer-left'));
});

test('editing a saved wardrobe moves the required PVC with the machining and the actual shelf support',()=>{
 const {a}=setup();
 const initial={...spec,shelves:2,sectionShelves:[2],shelfChoices:[['board/95388','board/confirmat']],
  machining:{top:[{kind:'rabbet',edge:'x0',face:0,width:4,depth:8}]}};
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec:initial},{id:'edging'}));
 const part=key=>a.items.find(it=>it.item_id==='edging:'+key);
 assert.equal(part('top').blank_edge_code,'1100');
 part('top').blank_edge_code='1101';
 part('shelf-0-0').blank_edge_code='1000'; // old project
 const edited={...initial,shelfChoices:[['board/cam_dowel','board/70245']],
  machining:{top:[{kind:'groove',edge:'y0',face:1,width:4,depth:5,offset:18}]}};
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'update',spec:edited}));
 assert.equal(part('top').blank_edge_code,'1011');
 assert.equal(part('shelf-0-0').blank_edge_code,'1000');
 assert.equal(part('shelf-0-1').blank_edge_code,'1111');
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'update',spec:{...edited,machining:{}}}));
 assert.equal(part('top').blank_edge_code,'1001');
});

test('wardrobe lighting estimate survives applying and editing the cabinet without machining the controller',()=>{
 const {a}=setup(wardrobeCatalogue);
 const line={system:'lira-17.5x6.5',anchor:'front',offset:50,face:0};
 const fields={...spec,sectionShelves:[1],lighting:{'shelf-0-0':[line]},lightKit:{control:'wave',holders:0,prices:{81771:17.25}}};
 const apply=(action,settings)=>applyAssistantPlan(a,prepareAssistantPlan(a,{action,spec:wardrobeSpec(settings)},{id:'lamp',selectedMaterials:selectedStock}));
 apply('create',fields);
 const group=selectedCarcass(a);
 assert.deepEqual(group.metadata.spec.lightKit,fields.lightKit);
 assert.equal(a.items.filter(it=>it.blank_machining?.length).length,1);
 const cuts=structuredClone(a.items.find(it=>it.blank_machining?.length).blank_machining);
 apply('update',{...fields,lightKit:{control:'motion'}});
 assert.deepEqual(selectedCarcass(a).metadata.spec.lightKit,{control:'motion'});
 assert.deepEqual(a.items.find(it=>it.blank_machining?.length).blank_machining,cuts);
 apply('update',{...fields,lighting:{}});
 assert.equal(selectedCarcass(a).metadata.spec.lightKit,undefined);
});

test('create and edit retain AKS section hardware and door straighteners in every saved panel',()=>{
 const {a}=setup(wardrobeCatalogue);
 const f={id:'gridli',variant:'113950',section:0,level:0,offset:0};
 const s=wardrobeSpec({...spec,width:600,shelves:0,sectionShelves:[0],front:{swing:'right',offset:90,autoHinges:true},
   fittings:[f],doorFittings:{'door-right':{variant:'83332',quantity:1}}});
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'create',spec:s},{id:'hardware',selectedMaterials:selectedStock}));
 a.select('hardware:top');
 const next=structuredClone(selectedCarcass(a).metadata.spec);
 next.fittings[0].frontInset=24;next.doorFittings['door-right'].quantity=2;
 applyAssistantPlan(a,prepareAssistantPlan(a,{action:'update',spec:next},{selectedMaterials:selectedStock}));
 for(const it of a.items){assert.deepEqual(it.assistant_carcass.spec.fittings,next.fittings);assert.deepEqual(it.assistant_carcass.spec.doorFittings,next.doorFittings);}
});

test('dresser bays retain independent fronts, hinge hosts, fit and native cable coordinates through edits',async()=>{
 const {newDresser,setDresserLayout,setDresserWidth,resizeDresser,syncDresser,dresserCableMarks}=await import('../../backend/v2/cabinet_assets/planner/dresser-layout.mjs');
 const {buildCarcass}=await import('../../backend/v2/cabinet_assets/planner/carcass-model.mjs');
 const {doorHinges}=await import('../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs');
 const {nativeCarcassJoints}=await import('../../backend/v2/cabinet_assets/planner/carcass-joints.mjs');
 const f=newDresser(),design=()=>wardrobeSpec(syncDresser(f)),{a}=setup(wardrobeCatalogue);
 const defaults=buildCarcass(design());
 assert.deepEqual([defaults.drawerBanks[0].faces.length,defaults.doors.length],[3,0]);
 assert.equal(defaults.parts.find(p=>p.key==='plinth').item.height,97);
 const plan=action=>prepareAssistantPlan(a,{action,spec:design()},{selectedMaterials:selectedStock});
 applyAssistantPlan(a,plan('create'));
 const {group_id,name}=selectedCarcass(a).metadata;assert.equal(name,'Комод 01');
 f.width=1600;f.height=600;f.depth=480;f.elevation=330;delete f.feet;f.dresser.installation='wall';
 setDresserLayout(f,['drawers','media','shelves']);
 Object.assign(f.dresser.bays[0],{heights:[null,null,140],rail:'soft',drawerPull:'127170'});
 Object.assign(f.dresser.bays[1],{clearHeight:220,cable:'center'});
 Object.assign(f.dresser.bays[2],{swing:'left',doorPull:'116550',shelfGaps:[160,null]});
 assert.equal(buildCarcass(design()).drawerBanks[0].rail.length,450);
 f.depth=430;
 const updated=plan('update');applyAssistantPlan(a,updated);
 a.restore(JSON.parse(JSON.stringify(a.snapshot())));
 const saved=selectedCarcass(a).metadata;assert.equal(saved.group_id,group_id);assert.deepEqual(saved.spec.dresser,f.dresser);
 const b=buildCarcass(saved.spec);
 assert.equal(b.drawerBanks[0].rail.article,'113645');assert.deepEqual(b.drawerBanks[0].faces.map(v=>v.height),[225.5,225.5,140]);
 assert.deepEqual(b.doors.map(d=>d.key),['door-section-2-left']);assert.deepEqual(b.drawerIssues,[]);
 assert.deepEqual(dresserCableMarks(saved.spec),[{section:1,x:800.5,y:128}]);
 const part=k=>a.items.find(it=>it.item_id===group_id+':'+k);
 assert.equal(part('plinth'),undefined);assert.equal(part('left').elevation_mm,330);
 assert.match(blankNativeItem(part('back'),{name:'ХДФ',thickness:3},a.items).production_note,/800.5 мм, от низа корпуса 128 мм/);
 const hinges=doorHinges(part('door-section-2-left'),a.items);
 assert.equal(hinges.length,2);assert.ok(hinges.every(h=>h.article==='112644'&&h.host_blank_id===group_id+':divider-1'));
 setDresserWidth(f,1,530);assert.equal(sectionWidths(f)[1],530);resizeDresser(f,4);
 assert.equal(f.dresser.bays[1].cable,'center');assert.equal(f.dividerPositions,undefined);
 f.width=1800;setDresserLayout(f,['mixed','mixed','media','drawers']);
 const mixed=buildCarcass(design());
 const upper=mixed.doors.find(d=>d.section===1),faces=mixed.drawerBanks[1].faces;
 assert.equal(upper.bottom-(faces.at(-1).y+faces.at(-1).height),3);
 assert.equal(mixed.drawerBanks[66].section,3);
 assert.doesNotThrow(()=>nativeCarcassJoints(mixed.items.map(it=>({...it,assistant_carcass:{group_id:it.item_id.split(':')[0],spec:mixed.spec}}))));
});
