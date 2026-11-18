import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
import {wardrobeHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';
import {wardrobeDrawing} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawing.mjs';
import {applyAssistantPlan,prepareAssistantPlan,selectedCarcass} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';

const base={width:1000,height:2400,depth:577,thickness:18,back:true,sections:1,sectionShelves:[1],
  shelfLevels:[[{mode:'floor',mm:764}]],drawerFixing:'confirmat',clearLayout:true,bottomFit:'none',front:{swing:'pair',offset:90}};
const bank=()=>({kind:'internal',layout:'equal',gap:12,faces:[{height:null},{height:null}]});
const banks=Array(34).fill(null);banks[0]=bank();banks[33]=bank();
const zones=[{section:0,level:0,kind:'drawers',edge:'overlay'},
  {section:0,level:1,kind:'shelves',leftWidth:425,columns:[{gaps:[500,null,null]},{gaps:[500,600,null]}]}];
const fields={...base,drawerBanks:banks,nicheSplits:zones};
const group='b633ec5a-e1c4-4584-81e6-5b3355a81526';
test('bottomless wardrobe shares its rail divider and respects independent clear openings and actual joints',()=>{
 for(const scheme of ['confirmat','cam_dowel']){
  const spec=wardrobeSpec({...fields,drawerFixing:scheme}),built=buildCarcass(spec,{idPrefix:group});
  const items=built.items.map(it=>({...it,assistant_carcass:{spec,group_id:group}}));
  const part=key=>items.find(it=>it.item_id===group+':'+key);
  assert.equal(part('bottom'),undefined);assert.equal(part('shelf-base-0').elevation_mm,100);
  assert.deepEqual([part('rear-brace').height,part('rear-brace').blank_edge_code,part('rear-brace').blank_edge_thickness_mm],[100,'1100',1]);
  assert.equal(part('niche-0-0-divider').depth,built.drawerBanks[0].rail.length);
  assert.equal(part('niche-0-1-divider').elevation_mm,782);
  const L=part('drawer-0-0-face'),R=part('drawer-33-0-face');
  assert.equal(R.x-R.width/2-(L.x+L.width/2),3);
  assert.equal(part('shelf-0-0').elevation_mm-part('drawer-33-1-face').elevation_mm-part('drawer-33-1-face').height,30);
  const top=part('top').elevation_mm;
  for(const [n,expected] of [[0,[500,532,532]],[1,[500,600,464]]]){
    const panels=[0,1].map(i=>part('shelf-niche-0-1-'+n+'-'+i));
    assert.deepEqual([panels[0].elevation_mm-782,panels[1].elevation_mm-panels[0].elevation_mm-18,top-panels[1].elevation_mm-18],expected);
  }
  assert.equal(part('shelf-niche-0-1-0-0').width,425);
  const joints=nativeCarcassJoints(items);
  assert.equal(joints.filter(j=>j.joined_panel_id===part('rear-brace').item_id).length,4);
  assert.ok(joints.every(j=>items.some(it=>it.item_id===j.host_blank_id)));
  const rails=wardrobeHardware(items).filter(j=>j.aks_kind==='rail'&&j.host_blank_id===part('niche-0-0-divider').item_id);
  assert.equal(rails.length,4);assert.ok(rails.every(r=>r.source_file.includes('_shared')));
  const art=wardrobeDrawing(built,'sections',0,spec.front,null,{splitLevel:1,column:1});
  assert.match(art.svg,/Чистая высота 464 мм/);
 }
});
test('one saved cabinet reopens from a drawer panel and updates in place with a manual note',()=>{
 const adapter={room:{width:5000,height:2700,depth:3600},projectId:'qa',state:{items:[]},get items(){return this.state.items;},
 get selected(){return this.items.find(i=>i.item_id===this.selectedId);},select(id){this.selectedId=id;},validate(){},notify(){}};
 const s=wardrobeSpec(fields);
 applyAssistantPlan(adapter,prepareAssistantPlan(adapter,{action:'create',spec:s},{id:group}));
 adapter.state=JSON.parse(JSON.stringify(adapter.state));
 const old=adapter.items.find(i=>i.item_id.endsWith(':drawer-33-0-face'));
 old.production_note='QA';adapter.select(old.item_id);
 const current=selectedCarcass(adapter);
 assert.equal(current.metadata.group_id,group);
 const changed=wardrobeSpec({...current.metadata.spec,width:1050});
 applyAssistantPlan(adapter,prepareAssistantPlan(adapter,{action:'update',spec:changed}));
 assert.equal(new Set(adapter.items.map(i=>i.assistant_carcass.group_id)).size,1);
 assert.equal(adapter.items.find(i=>i.item_id===old.item_id).production_note,'QA');
 assert.equal(selectedCarcass(adapter).metadata.spec.width,1050);
});
