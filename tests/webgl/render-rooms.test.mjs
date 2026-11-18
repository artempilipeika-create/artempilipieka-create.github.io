import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {RenderRooms} from '../../backend/v2/cabinet_assets/planner/render-rooms.mjs';
import {rooms, roomCategories} from '../../backend/v2/cabinet_assets/planner/render-rooms/catalogue.mjs';

const assets = new URL('../../backend/v2/cabinet_assets/planner/render-rooms/', import.meta.url);

test('all fifteen shells contain a camera, clear project anchor and both floor finishes', async () => {
  assert.equal(roomCategories.length, 3);
  assert.deepEqual(rooms.map(room => room.n), Array.from({length:15}, (_,i)=>i+1));
  for (const room of rooms) {
    const stem=String(room.n).padStart(2,'0');
    const bytes=await readFile(new URL(stem+'.glb',assets));
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    const names=new Set(gltf.nodes.map(node=>node.name));
    for(const name of ['MF_CAMERA','MF_PROJECT_ANCHOR','MF_ARCHITECTURE','MF_FLOOR_MARBLE','MF_FLOOR_OAK'])assert.ok(names.has(name), stem+': '+name);
    for(const image of gltf.images){assert.match(image.uri,/^\.\.\/materials\/[a-z\d-]+\.jpg$/);assert.ok((await readFile(new URL(image.uri,assets))).length);}
    assert.equal((await readFile(new URL(stem+'.webp',assets))).toString('ascii',8,12),'WEBP');
  }
});

test('render room aligns the authored back wall to each project wall without touching furniture or the plan', () => {
  const scene=new THREE.Scene(), viewer=new RenderRooms(scene,{},()=>{});
  const root=new THREE.Group(), oak=new THREE.Group(), marble=new THREE.Group(), shelf=new THREE.Object3D();
  root.add(oak,marble);scene.add(root,shelf);shelf.position.set(-1,1.2,.7);
  viewer.room={root,oak,marble,item:rooms[0],walls:{left:[],right:[],rear:[],roof:[]}};
  for(const [angle,x,z] of [[0,0,-1.5],[90,2.1,0],[180,0,1.5],[270,-2.1,0]]){
    viewer.place({width:4200,depth:3000,height:2700},angle);
    assert.ok(root.localToWorld(new THREE.Vector3(0,0,-1.5)).distanceTo(new THREE.Vector3(x,0,z))<1e-8);
  }
  marble.scale.setScalar(0);
  viewer.setFloor('marble');assert.equal(oak.visible,false);assert.equal(marble.visible,true);assert.equal(marble.scale.x,1);
  assert.equal(viewer.show(false,new THREE.PerspectiveCamera()),false);assert.equal(root.visible,false);
  assert.deepEqual(shelf.position.toArray(),[-1,1.2,.7]);
});
