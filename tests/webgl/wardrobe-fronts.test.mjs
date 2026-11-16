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
