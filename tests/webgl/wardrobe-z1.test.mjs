import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {chooseHinge,selectLeafFrame} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinge-layout.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {doorHinges,doorPush} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs';
import {blanksCSV} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {hingeGeometry} from '../../backend/v2/cabinet_assets/planner/wardrobe-hinge-mesh.mjs';
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
test('all eight signed Blum assemblies keep their seat, SKU, finish and frame-relative mounting origin',()=>{
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
