import test from 'node:test';
import assert from 'node:assert/strict';
import {roomDimensions} from '../../backend/v2/cabinet_assets/planner/room-dimensions.mjs';

const room={width:6000,depth:5000,height:2800,setup_complete:true};
const distance=d=>Math.hypot(d.b.x-d.a.x,d.b.y-d.a.y,d.b.z-d.a.z);
test('Room plan measures all four inner walls, independent of furniture',()=>{
  const dims=roomDimensions(room,{mode:'top'});
  assert.deepEqual(dims.map(d=>[d.wall,d.value]),[['a',6000],['b',5000],['c',6000],['d',5000]]);
  for(const d of dims){assert.equal(distance(d),d.value);assert.equal(d.a.y,0);assert.equal(d.b.y,0);}
  assert.equal(dims[0].a.z,-2500);assert.equal(dims[1].a.x,3000);
  assert.equal(dims[2].a.z,2500);assert.equal(dims[3].a.x,-3000);
});
for(const [x,z,visible]of [[9000,9000,['a','d']],[-9000,9000,['a','b']],[-9000,-9000,['b','c']],[9000,-9000,['c','d']]]){
  test(`Room dimensions follow the visible walls from ${x}, ${z}`,()=>{
    const dims=roomDimensions(room,{camera:{x,z}}),height=dims.find(d=>d.id==='room:height');
    assert.deepEqual(dims.filter(d=>d.wall).map(d=>d.wall),visible);
    for(const d of dims){assert.equal(distance(d),d.value);assert.equal(d.b.y,2800);}
    assert.equal(height.a.y,0);assert.equal(height.a.x,-Math.sign(x)*3000);assert.equal(height.a.z,-Math.sign(z)*2500);
  });
}
test('Room resize updates lengths and datums; unmeasured rooms have no annotations',()=>{
  const dims=roomDimensions({...room,width:6400,depth:5400,height:3000});
  assert.deepEqual(dims.map(d=>d.value),[6400,5400,6400,5400,3000]);
  for(const d of dims)assert.equal(distance(d),d.value);
  assert.deepEqual(roomDimensions({...room,setup_complete:false}),[]);
});
