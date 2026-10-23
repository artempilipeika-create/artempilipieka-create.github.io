import test from 'node:test';
import assert from 'node:assert/strict';
import {newSocket,reconcileSurvey} from '../../backend/v2/cabinet_assets/planner/socket-editor.mjs';
import {roomError} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
const room=()=>({width:4200,depth:3200,height:2700,setup_complete:true,survey:null,features:[]});
test('repeated sockets remain valid room features, fit every wall and keep measured objects',()=>{
  for(const wall of ['a','b','c','d']){
    const r=room(),first=newSocket(r,'s1');first.wall=wall;r.features.push(first);
    const second=newSocket(r,'s2');assert.equal(second.wall,wall);assert.equal(second.offset,400);
    r.features.push(second);assert.equal(roomError(r),'');assert.equal(first.offset,300);
    second.offset=(wall==='a'||wall==='c'?r.width:r.depth)-86;
    assert.equal(newSocket(r,'s3').offset,300);
  }
});
test('adding and removing sockets reconciles explicit surveys without inventing a complete survey',()=>{
  const r=room();r.survey='none';r.features.push(newSocket(r,'s1'));reconcileSurvey(r);assert.equal(r.survey,'present');assert.equal(roomError(r),'');
  r.features=[];reconcileSurvey(r);assert.equal(r.survey,null);assert.equal(roomError(r),'');
  r.features.push(newSocket(r,'s2'));reconcileSurvey(r);assert.equal(r.survey,null);
  r.features[0].offset=4200;assert.match(roomError(r),/за длину/);
  r.features[0].offset=300;r.features[0].elevation=NaN;assert.match(roomError(r),/целое число/);
});
