import test from 'node:test';
import assert from 'node:assert/strict';
import {drawerSections,railForOpening,buildDrawerBoards,doorZones} from '../../backend/v2/cabinet_assets/planner/wardrobe-drawers.mjs';

const bank=(kind='internal')=>({kind,faces:[{height:197}]});
const spec=(swing,banks)=>({width:banks.length*582+18,height:1800,depth:600,thickness:18,sections:banks.length,front:swing?{swing}:null,drawerBanks:banks});
test('550 control cabinet: outer hinged side only and real internal divider',()=>{
 const s=spec('left',[bank(),bank()]),b=drawerSections(s,[564,564]);
 assert.deepEqual(b.map(v=>[v.spacerL,v.spacerR,v.mountWidth,v.faces[0].width,v.rail.article]),[[18,0,546,543,'114798'],[0,0,564,561,'114798']]);
 const parts=[];buildDrawerBoards(s,b,(...args)=>parts.push(args));
 assert.equal(parts.filter(p=>p[0].includes('spacer')).length,1);
 assert.deepEqual(b.map(v=>v.mountWidth-27),[519,537]);
 assert.equal(parts.length,13);
});
test('both sides calculated independently for pairs, right swing, outer fronts and bare openings',()=>{
 for(const [swing,n,expected] of [['right',1,[[0,18]]],['pair',1,[[18,18]]],['pair',3,[[18,0],[0,0],[0,18]]]]){
  const s=spec(swing,Array.from({length:n},()=>bank()));
  assert.deepEqual(drawerSections(s,Array(n).fill(564)).map(b=>[b.spacerL,b.spacerR]),expected);
 }
 const s=spec(null,[bank('external')]);
 assert.equal(drawerSections(s,[564])[0].faces[0].width,597);
 assert.throws(()=>drawerSections(spec(null,[bank()]),[564]),/дверь/);
});
test('range boundaries, fitted remainder, multiple unequal drawer faces and clear shelf area',()=>{
 for(const [d,l] of [[450,400],[450.5,450],[600,550],[601,600]])assert.equal(railForOpening(d).length,l);
 const s=spec('left',[{kind:'internal',height:500,faces:[{height:197},{height:null,width:400}]}]);
 const b=drawerSections(s,[564])[0];
 assert.deepEqual(b.faces.map(f=>[f.y,f.height,f.width]),[[19.5,197,543],[219.5,297,400]]);
 assert.equal(b.top,518);
 const bad=structuredClone(s);bad.drawerBanks[0].height=270;assert.throws(()=>drawerSections(bad,[564]),/фасад 2/);
 assert.equal(s.drawerBanks[0].faces[1].height,null);
});
test('shortens only the hinged leaf above overlay fronts in an unequal two-section cabinet',()=>{
 const s=spec('pair',[bank('external'),null]),b=drawerSections(s,[514,614]);
 const leaves=doorZones(s,[{left:1.5,width:588,height:1797,bottom:1.5},{left:592.5,width:588,height:1797,bottom:1.5}],b);
 assert.deepEqual(leaves.map(l=>[l.left,l.width,l.bottom,l.height]),[[1.5,538,201.5,1597],[542.5,638,1.5,1797]]);
});
