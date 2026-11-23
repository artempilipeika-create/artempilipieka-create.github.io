import test from 'node:test';
import assert from 'node:assert/strict';
import {planReadyLayout,recommendWardrobe,layoutSourceKeys,sectionContents} from '../../backend/v2/cabinet_assets/planner/wardrobe-ready-layouts.mjs';
import {prepareSectionPreset} from '../../backend/v2/cabinet_assets/planner/wardrobe-section-presets.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {defaultBackMount} from '../../backend/v2/cabinet_assets/planner/panel-machining.mjs';
import {wardrobeHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';
import {drawerRailSnapshot,drawerRailChanges} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawers.mjs';
import {installBank} from '../../backend/v2/cabinet_assets/planner/wardrobe-interior-ui.mjs';
import {defaultFitting,fittingCatalogue} from '../../backend/v2/cabinet_assets/planner/wardrobe-fittings.mjs';

const base=(width=1800,depth=600)=>({width,height:2400,depth,thickness:18,back:true,sections:1,sectionShelves:[0],clearLayout:true,drawerFixing:'cam_dowel'});
function build(fields){return buildCarcass(wardrobeSpec(fields),{idPrefix:'qa'});}
function addDrawers(fields,section,level,options={}){
 const ui={fields,previewBuilt:build(fields),changed(){},output:{}};
 installBank(ui,section,level,null,false,'internal',options);return ui;
}
test('upper preset opening and drawer bank below a hanging rail keep neighboring panel and hanger positions',()=>{
 const f=planReadyLayout(base(),{id:'couple'}).fields,before=build(f);
 f.fittings=[defaultFitting('113750-side',{section:0,level:0})];f.rods=f.rods.filter(r=>r.section!==0);
 const initial=build(f),ui=addDrawers(f,0,0,{count:2});assert.equal(ui.output.textContent,undefined);
 let b=build(ui.fields);assert.equal(b.drawerBanks[0].faces.length,2);
 assert.equal(b.fittings[0].id,initial.fittings[0].id);assert.equal(b.fittings[0].level,1);
 assert.deepEqual(b.fittings[0].box,initial.fittings[0].box);
 assert.deepEqual(b.rods.map(x=>x.y),initial.rods.map(x=>x.y));
 const top=addDrawers(ui.fields,2,1,{count:1});assert.equal(top.output.textContent,undefined);b=build(top.fields);
 assert.equal(b.drawerBanks[5].faces.length,1);
 for(const key of ['shelf-1-0','shelf-1-1','shelf-2-0'])assert.equal(b.parts.find(v=>v.key===key).item.elevation_mm,before.parts.find(v=>v.key===key).item.elevation_mm);
});
test('an empty shelf partition can accept a drawer bank on both sides at its original widths',()=>{
 const f=base(1050);f.nicheSplits=[{section:0,level:0,kind:'shelves',leftWidth:430,columns:[{gaps:[null]},{gaps:[null]}]}];
 const ui=addDrawers(f,0,0,{count:2,pair:true});assert.equal(ui.output.textContent,undefined);
 const fitted=build(ui.fields);assert.equal(fitted.spec.nicheSplits[0].leftWidth,430);
 for(const slot of [0,33])assert.equal(fitted.drawerBanks[slot].faces.length,2);
 assert.equal(f.nicheSplits[0].kind,'shelves');
});
test('occupied floors and explicit height locks report a local reason and preserve the existing assembly',()=>{
 const f=planReadyLayout(base(1100),{id:'utility'}).fields,before=structuredClone(f),v=f.fittings.find(x=>x.variant==='114784');
 const blocked=addDrawers(f,v.section,v.level);assert.match(blocked.output.textContent,/гладильная доска/);assert.deepEqual(f,before);
 const replaced=addDrawers(f,v.section,v.level,{replaceContents:true,count:2});assert.equal(replaced.output.textContent,undefined);
 assert.equal(build(replaced.fields).fittings.length,0);assert.deepEqual(f,before);
 const locked=planReadyLayout(base(),{id:'couple'}).fields;locked.gapLocks=[[],[],[1]];
 const original=structuredClone(locked),result=addDrawers(locked,2,1);assert.match(result.output.textContent,/фиксацию/);assert.deepEqual(result.fields,original);
});
test('all 49 supplied AKS assemblies have one functional category and preserve all FAME mounting options',()=>{
 const groups=Object.groupBy(Object.values(fittingCatalogue),p=>p.category);
 assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),{trousers:7,hangers:13,ties:2,trays:2,doors:2,ironing:2,lifts:9,rods:12});
 assert.equal(new Set(groups.rods.map(p=>p.article)).size,6);
 for(const p of groups.rods)assert.ok(p.series==='FAME'&&['spanTop','spanSide'].includes(p.mount)&&p.components.length>0);
});
test('a local preset counts FAME as a rail and only replaces it after a deliberate selection',()=>{
 const f=planReadyLayout(base(),{id:'couple'}).fields,cell={section:0,level:0};
 f.rods=f.rods.filter(r=>r.section!==0);
 const local=defaultFitting('113750-side',cell),neighbor=defaultFitting('113749-side',{section:1,level:1});
 f.fittings=[local,neighbor];
 assert.match(sectionContents(f,0),/штанг — 1/);assert.doesNotMatch(sectionContents(f,0),/механизмов/);
 assert.throws(()=>prepareSectionPreset(f,cell,'shirts'),/уже установлены штанги/);
 const result=prepareSectionPreset(f,cell,'shirts',null,true).fields;
 assert.deepEqual(f.fittings,[local,neighbor]);assert.deepEqual(result.fittings,[neighbor]);
 assert.equal(result.rods.filter(r=>r.section===0).length,2);
});
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
