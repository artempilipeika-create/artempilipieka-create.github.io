import test from 'node:test';
import assert from 'node:assert/strict';
import {featureBox,roomError,roomReady,wallPanels} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
const f={id:'window',kind:'window',wall:'a',offset:500,elevation:900,width:1400,height:1300,projection:180,label:'Окно',notes:''};
const room={width:4600,depth:3400,height:2800,survey:'present',setup_complete:true,features:[f]};
test('measured dimensions are enough; explicit legacy survey data is still validated',()=>{
  assert.equal(roomError(room),'');assert.equal(roomReady({width:4200}),true);assert.equal(roomReady({setup_complete:false}),false);
  for(const r of [{...room,survey:'none'},{...room,features:[]},{...room,width:1600},{...room,height:2100},{...room,features:[f,f]}])assert.ok(roomError(r));
  assert.equal(roomError({...room,survey:'none',features:[]}),'');
  assert.equal(roomError({...room,survey:null,features:[]}),'');
  assert.equal(roomError({...room,survey:null}),'');
});
test('wall coordinates use the same corner directions on all four walls',()=>{
  for(const [wall,x,z,w,d]of [['a',-1100,-1610,1400,180],['b',2210,-500,180,1400],['c',-1100,1610,1400,180],['d',-2210,-500,180,1400]])assert.deepEqual(featureBox({...f,wall},room),{x,y:1550,z,w,h:1300,d});
});
test('wall opening subtraction preserves the exact union area and floor-to-ceiling boundary',()=>{
  const r={...room,features:[f,{...f,id:'door',kind:'door',offset:2400,elevation:0,width:900,height:2100}]};
  const p=wallPanels(r,'a');assert.equal(p.reduce((sum,p)=>sum+p.width*p.height,0),4600*2800-1400*1300-900*2100);
  assert.deepEqual(wallPanels(r,'b'),[{offset:0,width:3400,elevation:0,height:2800}]);
  const overlap={...room,features:[f,{...f,id:'second',offset:1000}]};assert.equal(wallPanels(overlap,'a').reduce((s,p)=>s+p.width*p.height,0),4600*2800-1900*1300);
});
