import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {nativeShelfSupports} from '../../backend/v2/cabinet_assets/planner/sekura.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
const base={width:1000,height:2200,depth:500,sections:2,sectionShelves:[2,3],back:false,thickness:18};
test('mixed questionnaire preserves shelf tops and exact native articles after a quarter turn',()=>{
 const choices=[['4/48846','board/134286'],['board/95388','6/80936','8/64145']];
 const simple=buildCarcass(wardrobeSpec(base),{idPrefix:'q'});
 const built=buildCarcass(wardrobeSpec({...base,shelfChoices:choices}),{idPrefix:'q'});
 for(const [i,it] of built.items.entries())assert.equal(it.elevation_mm+it.height,simple.items[i].elevation_mm+simple.items[i].height);
 const items=placeCarcass(built,{x:120,z:400,rotation:90,elevation_mm:0}),supports=nativeShelfSupports(items);
 assert.equal(supports.length,20);
 for(const row of choices)for(const v of row)assert.equal(supports.filter(h=>h.article===v.split('/')[1]).length,4);
 const casper=supports.filter(h=>h.article==='134286');
 assert.equal(new Set(casper.map(h=>h.source_sha256)).size,2);
 assert.ok(casper.every(h=>h.source_file.includes('18мм')));
 for(const i of items.filter(i=>i.blank_shelf&&!i.blank_shelf.startsWith('board/'))){
   const g=blankNativeItem(i,null);assert.equal(g.glass_shelf,true);assert.equal(g.target.height,i.height);assert.ok(g.source_file.includes(i.height+'мм'));assert.equal(i.blank_edge_code,'0000');
 }
 assert.throws(()=>wardrobeSpec({...base,shelfChoices:[['4/80936']]}),/держатель/);
});
