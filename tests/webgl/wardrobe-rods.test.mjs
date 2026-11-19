import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {insertShelves} from '../../backend/v2/cabinet_assets/planner/wardrobe-cells.mjs';
import {nativeRods,planRods,rodCatalogue,rodWarnings} from '../../backend/v2/cabinet_assets/planner/wardrobe-rods.mjs';
import {worldPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';

const rod=(id,extra={})=>({id,article:'22109',section:0,level:0,anchor:'top',offset:100,...extra});
const base=(extra={})=>({width:1300,height:2100,depth:500,thickness:18,sections:2,sectionShelves:[1,0],back:true,clearLayout:true,...extra});
test('axis follows the chosen opening, independently of other sections, floor and elevation',()=>{
 const s=wardrobeSpec(base({rods:[rod('a',{level:1}),rod('b',{section:1,anchor:'bottom',offset:830,article:'57975'})]}));
 const [a,b]=planRods(s);
 assert.equal(a.y,2100-18-100);assert.equal(b.y,18+830);
 assert.equal(a.cut,a.width-1);assert.equal(b.cut,b.width-5);
 for(const rotation of [0,90,180,270]){
   const group_id='test',position={x:500,z:710,elevation_mm:230,rotation},built=buildCarcass(s,{idPrefix:group_id});
   const items=placeCarcass(built,position).map(it=>({...it,assistant_carcass:{group_id,spec:s,position}}));
   const native=nativeRods(items);assert.equal(native.length,2);
   const point=worldPoint({x:b.left,z:b.z+1.5},rotation);
   assert.ok(Math.abs(native[1].position.x-500-point.x)<1e-6);
   assert.ok(Math.abs(native[1].position.z-710-point.z)<1e-6);
   assert.equal(native[1].position.y,b.y+230);assert.equal(native[1].holders_included,2);
   assert.equal(native[1].host_blank_id,'test:divider-0');
 }
});
test('split column, adjustable reference, independent length and shelf insertion',()=>{
 const f=base({nicheSplits:[{section:0,level:1,kind:'shelves',leftWidth:240,columns:[{gaps:[null]},{gaps:[200,null]}]}],
   rods:[rod('above',{level:1,column:1,opening:1,article:'14066',offset:75}),rod('bottom',{offset:185})]});
 const [a,b]=planRods(f);assert.equal(a.y,2100-18-75);assert.equal(a.lhs,'niche-0-1-divider');assert.equal(a.cut,a.width-5);
 insertShelves(f,{section:0,level:0},1);
 const [aa,bb]=planRods(f);assert.deepEqual([aa.y,bb.y],[a.y,b.y]);assert.deepEqual([aa.level,bb.level],[2,1]);
 const same={...f.rods[0],anchor:'bottom',offset:aa.y-aa.low};
 assert.equal(planRods({...f,rods:[same]})[0].y,aa.y);
});
test('native opposed screws are detected on an 18 mm divider, including a local split',()=>{
 const f=base({sectionShelves:[0,0],rods:[rod('one'),rod('two',{section:1})]});
 assert.equal(rodWarnings(planRods(f),18).length,1);
 f.rods[1].fromBack=180;assert.deepEqual(rodWarnings(planRods(f),18),[]);
 f.depth=499;assert.equal(planRods(f).length,2);
});
test('all seven original kits resize their signed tube and move original right fixtures only',()=>{
 const path=new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url);
 const src=fs.readFileSync(path,'utf8');const start=src.indexOf('const ROD_SOURCES ='),end=src.indexOf('function resizeAndPlace(obj',start);
 for(const [article,c] of Object.entries(rodCatalogue))for(const span of [300,478,1600]){
   const frame=()=>({kind:'frame',Width:300}),frames=[frame(),frame()];
   const tube={Name:'Штанга гардеробная',Thickness:-(300-c.cutAllowance)};
   function fixture(x,name){return {x,Name:name,TranslateGCS(p){this.x+=p.x;}};}
   const fixtures=[0,300].flatMap(x=>[fixture(x,'Держатель штанги'),...c.holes.map(()=>fixture(x,'Саморез универсальный AKS'))]);
   const obj={children:[frames[0],{children:[frames[1],...fixtures]},tube],ToGlobal:p=>p,SetDefaultTransform(){}};
   let anchor;
   const api={asList:o=>({children:o.children??[],Count:o.children?.length??0}),childAt:(o,i)=>o.children[i],isServiceFrame:o=>o.kind==='frame',
    objectTypeChecker:{ObjectIsExtrusionBody:o=>o===tube},profilePoint:(_,o)=>({x:o.x,y:0,z:0}),
    historyOperations:{RegisterObjectChanging(){}},distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),placeByFrame:(_,f,i,l,point)=>{anchor=point;}};
   const fn=vm.runInNewContext(src.slice(start,end)+';placeWardrobeRod',api);
   fn(obj,{article,wardrobe_rod:true,source_sha256:c.sha,span_mm:span,cut_mm:span-c.cutAllowance,holders_included:2,rotation:90},[]);
   assert.deepEqual(fixtures.map(o=>o.x),[0,span].flatMap(x=>Array(c.holes.length+1).fill(x)));
   assert.equal(tube.Thickness,-(span-c.cutAllowance));assert.equal(anchor.y,c.axisY);
 }
});
