import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {prepareHeightFields,trimPieces} from '../../backend/v2/cabinet_assets/planner/wardrobe-trim-layout.mjs';
import {surroundDrawing} from '../../backend/v2/cabinet_assets/planner/wardrobe-surround-drawing.mjs';

const feet={article:'86502',front:70,rear:60};
const upper={height:500,divider:false,leaves:2,side:'left',opening:'swing',push:{article:'70787',mount:'auto',support:'auto',heightMm:1050}};
const side=(start='floor',split='auto')=>({kind:'filler',width:100,start,split,heightMode:'assembly',bottom:0});
const fields={width:1000,depth:600,height:2200,thickness:18,sections:1,sectionShelves:[0],back:true};
const build=(extras)=>buildCarcass(wardrobeSpec({...fields,...extras}),{idPrefix:'case'});
const lengths=pieces=>pieces.map(p=>p.height);

test('auto measures each side independently; the stock limit includes exactly 2780 and the cut stays at the cabinet roof',()=>{
 const b=build({overallHeight:2850,feet,surround:{left:side(),right:side('plinth'),upper,cap:{height:80}}});
 assert.equal(b.spec.height,2170);assert.deepEqual(lengths(b.envelope.sides.left.pieces),[2270,580]);
 assert.deepEqual(lengths(b.envelope.sides.right.pieces),[2750]);
 const svg=surroundDrawing(b,'surround').svg;
 assert.match(svg,/2270 \+ 580 мм/);assert.match(svg,/2750 мм/);
 assert.deepEqual(lengths(trimPieces(0,2780,'auto',2020)),[2780]);
 assert.deepEqual(lengths(trimPieces(0,2781,'auto',null)),[1390.5,1390.5]);
 assert.deepEqual(lengths(trimPieces(0,2850,'auto',2790)),[1425,1425]);
 assert.deepEqual(lengths(trimPieces(0,4000,'auto',2950)),[1475,1475,1050]);
 assert.throws(()=>trimPieces(0,2850,'joint',2790),/100 мм/);
 assert.throws(()=>trimPieces(0,180,'equal',null),/100/);
 assert.deepEqual(trimPieces(99.125,2100.125,'equal',null),[{bottom:99.125,height:1000.5},{bottom:1099.625,height:1000.5}]);
});

test('the roof plan follows an asymmetric cap and both datums are measured from the real floor',()=>{
 const right={kind:'end',depth:100,projection:20,start:'plinthEdge',heightMode:'assembly',split:'auto',bottom:0};
 const b=build({overallHeight:2600,feet,elevation:50,surround:{left:side('floor','joint'),right,upper,cap:{height:80,fit:'over'}}});
 assert.equal(b.spec.height,1870);
 assert.deepEqual([b.envelope.sides.left.bottom,b.envelope.minY],[-50,-50]);
 assert.deepEqual(lengths(b.envelope.sides.left.pieces),[2020,500]);
 const post=b.parts.find(p=>p.key==='trim-right-end').item;
 assert.deepEqual([post.elevation_mm,post.height],[147,2373]);
 const cap=b.parts.find(p=>p.key==='trim-cap-face').item;
 assert.deepEqual([cap.x,cap.width,cap.elevation_mm],[-41,1118,2520]);
 assert.throws(()=>build({overallHeight:2600,surround:{right}}),/цокол/);
 assert.throws(()=>build({overallHeight:2600,surround:{left:side('facade')}}),/наружного фасада/);
 assert.throws(()=>build({overallHeight:500,feet,surround:{upper,cap:{height:80}}}),/основной корпус/);
});

test('an unsplit legacy side remains intact before editing; changing the total recomputes the body and cut list',()=>{
 const old={...fields,height:2850,surround:{left:{kind:'filler',width:100,heightMode:'body',bottom:0}}};
 assert.deepEqual(lengths(build(old).envelope.sides.left.pieces),[2850]);
 const editable=structuredClone(old);prepareHeightFields(editable);
 assert.equal(editable.overallHeight,2850);assert.equal(old.surround.left.split,undefined);
 assert.deepEqual(lengths(build(editable).envelope.sides.left.pieces),[1425,1425]);
 const raised={...fields,height:2000,elevation:50,surround:{left:{kind:'filler',width:100,heightMode:'custom',bottom:50,height:1700}}};
 prepareHeightFields(raised);
 assert.deepEqual([raised.overallHeight,raised.surround.left.start,raised.surround.left.bottom],[2050,'custom',100]);
 assert.equal(build(raised).parts.find(p=>p.key==='trim-left-face').item.elevation_mm,100);
 const projecting={...fields,surround:{left:{kind:'filler',width:100,heightMode:'custom',bottom:0,height:2400}}};
 prepareHeightFields(projecting);assert.equal(projecting.overallHeight,2400);
 const preserved=build(projecting);assert.equal(preserved.spec.height,2200);assert.equal(preserved.envelope.height,2400);
 projecting.overallHeight=2500;assert.equal(build(projecting).spec.height,2500);
});
