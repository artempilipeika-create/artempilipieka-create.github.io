import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectSafety} from '../../backend/v2/cabinet_assets/planner/project-safety.mjs';

test('order preflight blocks an empty or erroneous project, but allows reviewed warnings',()=>{
 for(const [items,error,expected] of [[[],0,false],[[{item_id:'x'}],1,false],[[{item_id:'x'}],0,true]]){
  let shown=0;
  const safety=Object.assign(Object.create(ProjectSafety.prototype),{
   bridge:{state:()=>({items})},report:()=>({counts:{error,warning:2}}),showChecks:()=>shown++
  });
  assert.equal(safety.orderReady(),expected);assert.equal(shown,expected?0:1);
 }
});
