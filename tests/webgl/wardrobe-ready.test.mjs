import test from 'node:test';
import assert from 'node:assert/strict';
import {planReadyLayout,recommendWardrobe,layoutSourceKeys} from '../../backend/v2/cabinet_assets/planner/wardrobe-ready-layouts.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {defaultBackMount} from '../../backend/v2/cabinet_assets/planner/panel-machining.mjs';
import {wardrobeHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';
import {drawerRailSnapshot,drawerRailChanges} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawers.mjs';

const base=(width=1800,depth=600)=>({width,height:2400,depth,thickness:18,back:true,sections:1,sectionShelves:[0],clearLayout:true,drawerFixing:'cam_dowel'});
function build(fields){return buildCarcass(wardrobeSpec(fields),{idPrefix:'qa'});}
test('the four catalogue cards create editable production parts for the supplied enclosure',()=>{
 for(const [id,width,depth,widths,articles] of [
  ['hall',1000,420,[546,400],['113951']],['couple',1800,600,[576,576,576],[]],
  ['business',1200,600,[564,582],['115591','115597','123793']],['utility',1100,600,[482,564],['114784']]]){
  const f=base(width,depth);f.backMount=defaultBackMount('perimeter');f.topFit='overlay';
  const before=structuredClone(f),result=planReadyLayout(f,{id});
  assert.deepEqual(result.widths,widths);assert.deepEqual(f,before);
  const built=build(JSON.parse(JSON.stringify(result.fields)));
  assert.equal(built.spec.topFit,'overlay');assert.deepEqual(built.spec.backMount,f.backMount);
  assert.deepEqual(built.fittings.map(p=>p.variant),articles);
  if(id==='couple'){assert.equal(built.rods.length,3);const faces=built.drawerBanks[1].faces;assert.equal(faces.length,3);assert.ok(faces[2].height<faces[0].height);}
 }
});
test('section replacement changes only its own contents and preserves its neighbors and carcass',()=>{
 const {fields:f}=planReadyLayout(base(),{id:'couple'});
 const before=structuredClone(f);const result=planReadyLayout(f,{id:'deep',section:1});
 assert.deepEqual(f,before);assert.deepEqual(result.fields.rods,before.rods);assert.equal(result.fields.drawerBanks[1].faces.length,2);
 assert.equal(result.changes.length,1);assert.deepEqual(result.widths,[576,576,576]);
 const keys=new Map(['left','shelf-1-0','shelf-0-0','drawer-1-0-face','drawer-0-0-face'].map(k=>[k,'qa:'+k]));
 assert.deepEqual([...layoutSourceKeys(keys,[1],3).keys()],['left','shelf-0-0','drawer-0-0-face']);
 assert.deepEqual(recommendWardrobe({room:'bedroom',people:'one',things:['knit','shirts']}).sections,['shirts','deep']);
 assert.deepEqual(recommendWardrobe({room:'bedroom',people:'two',things:['long','linen']}).sections,['long','daily','shirts']);
 assert.equal(recommendWardrobe({room:'hall',things:['shoes']}).id,'hall');
});
for(const [family,opening,sku] of [['ball','soft','114795'],['concealed','soft','113645'],['concealed','push','113661']]){
 test('rear groove resizes '+family+'/'+opening+' guide and box in estimate-ready boards and native export',()=>{
  const f=planReadyLayout(base(700,480),{id:'deep',section:0}).fields;
  if(family==='concealed')Object.assign(f.drawerBanks[0],{railFamily:family,opening});
  const wide=build(f);assert.equal(wide.drawerBanks[0].rail.length,450);
  f.backMount={...defaultBackMount('perimeter'),offset:30};
  const built=build(f),bank=built.drawerBanks[0];assert.equal(bank.rail.length,400);assert.equal(bank.rail.article,sku);
  const [change]=drawerRailChanges(drawerRailSnapshot(wide.drawerBanks),drawerRailSnapshot(built.drawerBanks));
  assert.deepEqual([change.previous,change.length,change.article,change.count],[450,400,sku,2]);
  const pos={x:900,z:700,elevation_mm:0,rotation:0},meta={group_id:'qa',spec:built.spec,position:pos};
  const items=placeCarcass(built,pos).map(it=>({...it,assistant_carcass:meta}));
  assert.equal(items.find(it=>it.item_id==='qa:drawer-0-0-side-left').depth,family==='ball'?400:390);
  const rails=wardrobeHardware(items).filter(p=>p.aks_kind===(family==='ball'?'rail':'concealed'));
  assert.equal(rails.length,family==='ball'?4:2);assert.ok(rails.every(p=>p.article===sku&&p.length_mm===400));
  assert.throws(()=>build({...f,depth:220}),/Секция 1.*ниша 1/);
 });
}
