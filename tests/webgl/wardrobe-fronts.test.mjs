import test from 'node:test';
import assert from 'node:assert/strict';
import {overlayFronts} from '../../backend/v2/cabinet_assets/planner/wardrobe-fronts.mjs';

test('equal overlay fronts use finished carcass dimensions regardless of divider and feet',()=>{
  for(const width of [800,801,1200])for(const count of [1,2]){
    const spec={width,height:2200};
    const leaves=overlayFronts(spec,count);
    assert.deepEqual(leaves,overlayFronts({...spec,dividerPositions:[245],feet:{height:100}},count));
    assert.equal(leaves[0].left,1.5);
    assert.equal(leaves.at(-1).left+leaves.at(-1).width,width-1.5);
    for(const leaf of leaves){
      assert.equal(leaf.bottom,1.5);assert.equal(leaf.height,2197);
      assert.equal(leaf.edges,'1111');assert.equal(leaf.edgeThickness,2);
      assert.deepEqual(leaf.cut,{length:2193,width:leaf.width-4});
    }
    if(count===2){
      assert.equal(leaves[0].width,leaves[1].width);
      assert.equal(leaves[1].left-leaves[0].left-leaves[0].width,3);
    }
  }
  assert.equal(overlayFronts({width:801,height:2200},2)[0].width,397.5);
});

import {hingeLoad,hingeAxes} from '../../backend/v2/cabinet_assets/planner/wardrobe-fronts.mjs';
test('AKS 35 mm chart uses both leaf mass and height at every transition',()=>{
 for(const [h,kg,n] of [[900,8,2],[901,8,3],[900,8.01,3],[1600,13,3],[1601,5,4],[900,13.01,4],[2000,17,4],[2001,5,5],[900,17.01,5],[2400,22,5]]){
   assert.equal(hingeLoad(600,h,kg).count,n);
 }
 for(const [w,h,kg] of [[601,720,5],[600,2401,10],[450,900,22.01]])assert.throws(()=>hingeLoad(w,h,kg));
 assert.deepEqual(hingeAxes(1500,3,130),[130,750,1370]);
 const shifted=hingeAxes(1500,3,130,[[741,759]]);
 assert.equal(shifted[0],130);assert.ok(shifted[1]+31<741||shifted[1]-31>759);assert.equal(shifted[2],1370);
 assert.throws(()=>hingeAxes(1500,3,90,[[80,98]]),/полк/);
});
