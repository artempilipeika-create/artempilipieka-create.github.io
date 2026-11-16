import test from 'node:test';
import assert from 'node:assert/strict';
import {shelfUndersides} from '../../backend/v2/cabinet_assets/planner/shelf-levels.mjs';

const positions=(levels,thicknesses=[18,18,18],floor=100)=>
 shelfUndersides({thickness:18,shelfLevels:[levels]},0,18,1218,thicknesses,floor);
test('measures to the lower face and respects the actual glass above which a gap is entered',()=>{
 const levels=[{mode:'floor',mm:400},{mode:'gap',mm:250},{mode:'floor',mm:1110}];
 assert.deepEqual(positions(levels,[8,18,18]),[300,558,1010]);
 assert.deepEqual(positions(levels,[8,18,18],120),[280,538,990]);
});
test('unassigned shelves are evenly distributed up to a fixed lower edge',()=>{
 const result=positions([null,null,{mode:'floor',mm:978}]);
 assert.deepEqual(result,[293,585,878]);
});
test('a manual level reports a collision instead of silently clamping',()=>{
 assert.throws(()=>positions([{mode:'floor',mm:50},null,null]),/полка 1/);
 assert.throws(()=>positions([{mode:'floor',mm:450},{mode:'gap',mm:500},{mode:'floor',mm:800}]),/не хватает/);
});
