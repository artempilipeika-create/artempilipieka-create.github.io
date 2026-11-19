import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {RenderRooms} from '../../backend/v2/cabinet_assets/planner/render-rooms.mjs';
import {rooms,roomCategories,wallCoating} from '../../backend/v2/cabinet_assets/planner/render-rooms/catalogue.mjs';
import {finishSettings} from '../../backend/v2/cabinet_assets/planner/room-state.mjs';
import {buildRoomSurfaces} from '../../backend/v2/cabinet_assets/planner/room-surfaces.mjs';
import {roomDaylight,daylightKey} from '../../backend/v2/cabinet_assets/planner/room-daylight.mjs';

const assets=new URL('../../backend/v2/cabinet_assets/planner/render-rooms/',import.meta.url);
const dimensions={width:4360,depth:3600,height:2670,features:[]};

test('fifteen palettes use the four measured faces; openings only come from the survey',async()=>{
  assert.equal(roomCategories.length,3);
  assert.deepEqual(rooms.map(r=>r.n),Array.from({length:15},(_,i)=>i+1));
  for(const item of rooms){
    const card=await readFile(new URL(String(item.n).padStart(2,'0')+'.webp',assets));
    assert.equal(card.toString('ascii',8,12),'WEBP');
    const settings=finishSettings({renderRoomId:item.n,floorMaterial:'concrete'});
    for(const measured of [false,true]){
      const room={...dimensions,features:measured?[{kind:'window',wall:'a',offset:1030,width:1100,elevation:860,height:1200,projection:0}]:[]};
      const before=structuredClone(room);
      const box=new THREE.BoxGeometry(),surfaces=buildRoomSurfaces(room,settings,box,4,()=>{});
      surfaces.root.updateMatrixWorld(true);
      const faces=surfaces.walls.filter(w=>w.userData.wall);
      assert.equal(faces.length,4);
      const back=faces.find(w=>w.userData.wall==='a');
      assert.equal(back.position.z,-1.8);
      const cast=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,0),new THREE.Vector3(0,0,-1)).intersectObject(back).length;
      assert.equal(cast(-.6,1.3)>0,!measured);
      assert.ok(cast(-.6,.4)>0);
      const physicalRight=daylightKey(roomDaylight(room,settings),item);
      if(measured)assert.ok(physicalRight.z<0,'real window sets the light for every palette');
      assert.deepEqual(room,before);
      surfaces.disposeMaps();surfaces.root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});
    }
  }
});

test('floor, light and individual walls can follow a palette or keep a saved choice',()=>{
  const gallery={renderRoomId:12,usePaletteFloor:true,usePaletteLight:true,wallFinishes:{b:'graphite'}};
  const follow=finishSettings(gallery);
  assert.equal(follow.floorMaterial,'marble');assert.equal(follow.lightingPreset,'daylight');
  assert.equal(wallCoating(follow,'b').name,'Графит');
  assert.equal(wallCoating(follow,'a').name,'Сланец');
  assert.equal(wallCoating(finishSettings({...gallery,renderRoomId:8}),'b').name,'Графит');
  const legacy=finishSettings({renderRoomId:12,floorMaterial:'oak',lightingPreset:'warm'});
  assert.equal(legacy.floorMaterial,'oak');assert.equal(legacy.lightingPreset,'warm');
});

test('changing the finish keeps the same camera for each furniture orientation',()=>{
  const viewer=new RenderRooms();
  for(const rotation of [0,90,180,270]){
    viewer.place(dimensions,rotation);viewer.select(1);
    const original=viewer.cameraView();
    for(const room of rooms){
      viewer.select(room.n);const next=viewer.cameraView();
      assert.ok(next.position.equals(original.position));assert.ok(next.target.equals(original.target));
    }
  }
});
