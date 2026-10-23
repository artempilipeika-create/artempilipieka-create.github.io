import test from 'node:test';
import assert from 'node:assert/strict';
import {newShaft,ShaftEditor} from '../../backend/v2/cabinet_assets/planner/shaft-editor.mjs';
import {featureBox,floorOutline,roomError} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
import {roomObstacles,placementError,bounds,PILOT_PRODUCTION,normalizeKitchen} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {findSpace,snapItem} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const room=()=>({width:3000,depth:2800,height:2700,setup_complete:true,survey:null,features:[]});
const item=(patch={})=>({item_id:'cabinet',module_type:'chest',name:'Шкаф',width:600,height:820,depth:510,x:0,z:0,rotation:0,base:'plinth',layout:'doors',drawers:0,...patch});
const kitchen=patch=>{const id=Object.keys(PILOT_PRODUCTION)[0];return normalizeKitchen(item({module_type:'base_cabinet',bazis_id:id,bazis_sha256:PILOT_PRODUCTION[id].source_sha256,body_height:720,base_height:100,...patch}));};
const perimeter=r=>floorOutline(r).reduce((n,e)=>n+Math.hypot(e.x2-e.x1,e.z2-e.z1),0);
test('shaft defaults and serialized measurements are valid on all four walls',()=>{
  for(const wall of 'abcd'){
    const r=room(),f={...newShaft(r,'shaft'),wall};r.features=[f];assert.equal(roomError(r),'');
    assert.deepEqual(JSON.parse(JSON.stringify(r)).features[0],f);
    const b=featureBox(f,r),o=roomObstacles(r)[0];
    assert.deepEqual([o.minX,o.maxX,o.minZ,o.maxZ,o.minY,o.maxY],[b.x-b.w/2,b.x+b.w/2,b.z-b.d/2,b.z+b.d/2,0,r.height]);
    assert.match(placementError(item({x:b.x,z:b.z,width:200,depth:200}),[],r),/выступом стены/);
  }
  const r=room(),f=newShaft(r,'shaft');r.features=[f];f.projection=0;assert.match(roomError(r),/глубину/);f.projection=350;f.elevation=1;f.height=2600;assert.match(roomError(r),/от пола/);
});
test('usable floor outline steps around a shaft at corners and mid-wall; touching shafts form one boundary',()=>{
  const r=room(),f=newShaft(r,'shaft');assert.equal(floorOutline(r).length,4);assert.equal(perimeter(r),11600);
  r.features=[f];assert.equal(floorOutline(r).length,6);assert.equal(perimeter(r),11600);
  assert.ok(floorOutline(r).some(e=>e.z1===-1050&&e.z2===-1050&&e.x1===-1500&&e.x2===-900));
  f.offset=900;assert.equal(floorOutline(r).length,8);assert.equal(perimeter(r),12300);
  r.features.push({...f,id:'adjacent',offset:1500});assert.equal(floorOutline(r).length,8);assert.equal(perimeter(r),12300);
  assert.ok(!floorOutline(r).some(e=>e.x1===0&&e.x2===0));
});
test('cabinet contact is allowed, overlap is blocked, automatic placement avoids the shaft',()=>{
  const r=room();r.features=[newShaft(r,'shaft')];
  assert.equal(placementError(item({x:-1200,z:-795}),[],r),'');
  assert.match(placementError(item({x:-1200,z:-796}),[],r),/выступом стены/);
  const placed=findSpace(item(),[],r,null);assert.ok(placed);assert.equal(placementError(placed,[],r),'');assert.ok(bounds(placed,r).minX>=-900);
  const above=item({x:-1200,z:-1200,depth:320,module_type:'wall_cabinet',height:500,elevation_mm:1600});r.features[0].height=1000;assert.equal(placementError(above,[],r),'');
});
test('countertop rear overhang cannot enter a shaft when cabinet body is clear',()=>{
  const r=room();r.features=[newShaft(r,'shaft')];
  const cabinet=kitchen({x:-1200,z:-770});
  assert.match(placementError(cabinet,[],r),/Столешница пересекает/);
  assert.equal(placementError({...cabinet,z:-745},[],r),'');
});
test('snapping uses a shaft front and side with the same measured clearance as walls',()=>{
  const r=room();r.features=[newShaft(r,'shaft')];
  const front=snapItem(item({x:-1200,z:-780}),[],r,{threshold:45,wallOffset:0});assert.equal(front.error,'');assert.equal(front.item.z,-795);assert.ok(front.guides.some(g=>g.text.includes('К выступу')));
  const side=snapItem(item({x:-785,z:-1200,rotation:270,width:200,depth:200}),[],r,{threshold:80,wallOffset:0});assert.equal(side.item.rotation,270);assert.equal(side.item.x,-800);assert.equal(side.error,'');
  r.features[0].offset=900;
  const result=snapItem(kitchen({x:-300,z:-725}),[],r,{threshold:45});assert.equal(result.error,'');assert.equal(result.item.rotation,0);assert.equal(result.item.z,-745);
});
test('room height follows full-height shafts while custom heights and furniture remain intact; undo restores geometry',()=>{
  let state={name:'Room',scene:{room:room(),items:[item()]}};state.scene.room.features=[newShaft(state.scene.room,'full'),{...newShaft(state.scene.room,'short'),height:1900,offset:900}];
  const before=structuredClone(state),history=new History({snapshot:()=>structuredClone(state),restore:s=>state=structuredClone(s)});
  history.run('Room change',()=>ShaftEditor.prototype.resizeRoomHeight.call({setup:{draft:state.scene.room},heightInputs:new Map()},3000));
  assert.equal(state.scene.room.features[0].height,3000);assert.equal(state.scene.room.features[1].height,1900);assert.deepEqual(state.scene.items,before.scene.items);
  const after=JSON.parse(JSON.stringify(state));history.undo();assert.deepEqual(state,before);history.redo();assert.deepEqual(state,after);
});
