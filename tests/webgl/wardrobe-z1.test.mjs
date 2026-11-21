import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {chooseHinge,selectLeafFrame} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinge-layout.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {doorHinges,nativeDoorHinges,doorPush} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs';
import {blanksCSV} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {hingeGeometry} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinge-mesh.mjs';
import {angleLimit} from '../../backend/v2/cabinet_assets/planner/wardrobe-clearance.mjs';
import {prepareAssistantPlan,applyAssistantPlan} from '../../backend/v2/cabinet_assets/planner/assistant-model.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
import z1 from '../../backend/v2/cabinet_assets/planner/wardrobe-z1-data.json' with {type:'json'};

const id='3b4c4804-3abe-420e-b0ff-519483511056';
function cabinet(front,rotation=0,surround){
 const spec=wardrobeSpec({width:600,height:700,depth:570,thickness:18,sections:2,sectionShelves:[1,1],back:true,
  front:{offset:90,...front},surround});
 const built=buildCarcass(spec,{idPrefix:id}),position={x:350,z:470,rotation,elevation_mm:0};
 const items=placeCarcass(built,position).map(p=>({...p,assistant_carcass:{spec,group_id:id,position}}));
 return {items,part:key=>items.find(p=>p.item_id===id+':'+key)};
}
const rect=p=>[p.width,p.height,p.elevation_mm,p.x];
test('changing one wardrobe door to Z1 preserves the finished gaps and replaces its hinges',()=>{
 for(const swing of ['left','right','pair']){
  const key=swing==='right'?'door-right':'door-left',f={swing};
  const solid=cabinet(f);
  assert.equal(selectLeafFrame(f,key,'Z1'),true);
  const {items,part}=cabinet(f),p=part(key);
  assert.deepEqual(rect(p),rect(solid.part(key)));
  assert.deepEqual([p.width,p.height,p.elevation_mm],[swing==='pair'?297:597,697,1.5]);
  assert.equal(angleLimit(p),95);
  const adapter=new StateAdapter({state:()=>({items,room:{width:6000,depth:4500,height:3000}}),material:()=>null});
  for(const item of items)assert.equal(adapter.validate(item,items),'');
  assert.equal(p.blank_front_frame,'Z1');assert.equal(p.blank_edge_code,'0000');assert.equal(p.body_variant_id,null);
  assert.equal(p.depth,20.5);assert.equal(p.z-p.depth/2-part('left').z,solid.part(key).z-9-solid.part('left').z);
  assert.deepEqual(doorHinges(p,items).map(f=>f.article),['71B950A','71B950A']);
  if(swing==='pair'){
    const other=part('door-right');
    assert.equal(other.x-other.width/2-p.x-p.width/2,3);assert.deepEqual(rect(other),rect(solid.part('door-right')));
    assert.equal(doorHinges(other,items)[0].article,'112595');
  }
  const row=blankNativeItem(p,null,items);
  assert.equal(row.source_sha256,z1.front.sha256);assert.deepEqual(row.target,{width:p.width+4,height:p.height+4,depth:22});
  assert.equal(row.position.y+2,p.elevation_mm);assert.equal(row.position.z-11,p.z-10.25);
  const cut=blanksCSV([p]);assert.match(cut,/Стекло 4 мм/);assert.match(cut,/Профиль|профиль/);assert.equal(cut.split('\r\n').filter(Boolean).length,6);
  selectLeafFrame(f,key,'board');const restored=cabinet(f).part(key);assert.equal(restored.depth,18);assert.deepEqual(rect(restored),rect(p));
 }
});
test('all eight independent Blum hinges keep their seat, SKU, finish and frame-relative mounting origin',()=>{
 for(const fit of z1.hinges)for(const angle of [0,90,180,270]){
  const key='door-right',f={swing:'pair',hinges:{[key]:{article:fit.article}}};
  const {items,part}=cabinet(f,angle),p=part(key),rows=doorHinges(p,items);
  assert.equal(rows.length,2);const host=items.find(p=>p.item_id===rows[0].host_blank_id);
  for(const row of rows){
   assert.equal(row.article,fit.sku);assert.equal(row.finish,fit.finish);assert.equal(row.source_sha256,fit.sha);
   assert.equal(row.source_file,fit.file);assert.equal(row.joined_panel_id,p.item_id);assert.equal(row.rotation,angle);
   const point=localPoint(row.position,angle),wall=localPoint(host,angle);
   assert.equal(point.x,wall.x+(row.door_side==='left'?1:-1)*9);
   assert.equal(point.z,localPoint(p,angle).z-10.25);
  }
  for(const part of ['cup','body'])assert.ok(hingeGeometry(fit.mesh,1,part).index.count>30);
 }
});
test('TIP-ON keeps the +2 mm mounting gap and chooses only the supplied springless seat',()=>{
 assert.equal(chooseHinge('overlay',true,'71B950A').article,'70T950A.TL');
 for(const kind of ['half','inset'])assert.equal(chooseHinge(kind,true,'70T950A.TL'),undefined);
 const setup={article:'70T950A.TL',push:{article:'72255',mount:'auto',support:'auto',heightMm:1050}};
 const f={swing:'pair',hinges:{'door-left':setup}},surround={upper:{height:500,leaves:2,side:'left',opening:'swing',divider:false,push:{...setup.push,article:'70787'},frame:'Z1'}};
 const {items,part}=cabinet(f,0,surround);
 for(const key of ['door-left','mezz-door-left','mezz-door-right']){
  const p=part(key),host=key.startsWith('mezz')?part('mezz-left'):part('left');
  assert.equal(p.z-10.25-host.z-host.depth/2,2);
  assert.deepEqual(doorHinges(p,items).map(h=>h.article),['70T950A.TL','70T950A.TL']);
  assert.ok(doorPush(p,items).length);
 }
});

test('the full questionnaire saves and reopens a framed cabinet and preserves its wall datum on replacement',()=>{
 let state={room:{width:5000,height:3000,depth:4500,setup_complete:true},items:[]};
 const adapter=new StateAdapter({supportsElevation:true,state:()=>state,projectId:()=>null,
  selected:()=>state.items.find(i=>i.item_id===state.selected_item_id),select:key=>state.selected_item_id=key,refresh(){},material:()=>null});
 const fields={width:600,height:700,depth:570,thickness:18,sections:2,sectionShelves:[1,1],back:true,front:{swing:'pair',offset:90}};
 const apply=action=>applyAssistantPlan(adapter,prepareAssistantPlan(adapter,{action,spec:wardrobeSpec(fields)},{id}));
 const part=key=>state.items.find(p=>p.item_id===id+':'+key);
 selectLeafFrame(fields.front,'door-left','Z1');apply('create');
 const datum=part('left').z;
 for(const type of ['board','Z1']){
  state=JSON.parse(JSON.stringify(state));selectLeafFrame(fields.front,'door-left',type);apply('update');
  assert.equal(part('left').z,datum);
  assert.equal(part('shelf-0-0').blank_binding.left_id,part('left').item_id);
  assert.equal(part('door-left').depth,type==='Z1'?20.5:18);
 }
});

test('every native Blum axis has one leaf part and one selected cabinet plate; all board and frame variants stay separate',()=>{
 for(const fit of [...z1.hinges,...z1.boardHinges])for(const sku of ['175H3100','173H7100'])for(const rotation of [0,90,180,270]){
  for(const side of ['left','right']){
   const key='door-'+side,{items,part}=cabinet({swing:'pair',hinges:{[key]:{article:fit.article,plate:sku}}},rotation);
   const door=part(key),rows=nativeDoorHinges(door,items),axes=doorHinges(door,items);
   const plate=z1.plates.find(p=>p.sku===sku&&p.finish===fit.finish);assert.equal(rows.length,axes.length*2);
   for(let i=0;i<axes.length;i++){
    const [h,p]=rows.slice(2*i,2*i+2);
    assert.deepEqual([h.wardrobe_blum_part,p.wardrobe_blum_part],['hinge','plate']);
    assert.equal(h.source_sha256,fit.sha);assert.equal(p.source_sha256,plate.sha);assert.notEqual(h.source_sha256,p.source_sha256);
    assert.equal(h.mount_blank_id,door.item_id);assert.equal(p.mount_blank_id,axes[i].host_blank_id);
    assert.deepEqual(h.position,p.position);assert.equal(h.rotation,rotation);assert.equal(p.rotation,rotation);
   }
   assert.ok(hingeGeometry(plate.mesh,side==='left'?1:-1,'plate').index.count>30);
   assert.equal(angleLimit(door),fit.frame?95:110);
  }
 }
});
test('separate components on the TIP-ON mezzanine use its saved mounting plate',()=>{
 const surround={upper:{height:450,leaves:2,side:'left',opening:'swing',divider:false,push:{article:'70787',mount:'auto',support:'auto',heightMm:1050},frame:'Z1',plate:'173H7100'}};
 const {items,part}=cabinet({swing:'pair'},270,surround);
 for(const side of ['left','right']){
  const rows=nativeDoorHinges(part('mezz-door-'+side),items);
  assert.deepEqual(rows.map(r=>r.article),['70T950A.TL','173H7100','70T950A.TL','173H7100']);
  assert.ok(rows.filter(r=>r.wardrobe_blum_part==='plate').every(r=>r.mount_blank_id===part('mezz-'+side).item_id));
 }
});
