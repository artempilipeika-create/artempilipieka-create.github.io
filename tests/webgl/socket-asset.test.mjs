import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {readSocketGeometry,placeSocket,socketRotation,SocketAssets} from '../../backend/v2/cabinet_assets/planner/socket-asset.mjs';
import {featureBox} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
const base=new URL('../../backend/v2/cabinet_assets/planner/room-assets/',import.meta.url);
const meta=JSON.parse(readFileSync(new URL('socket-tripo.json',base))),bytes=readFileSync(new URL(meta.buffer,base));
const buffer=()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
test('Tripo mesh is normalized and bounded; 20k triangles retain UV and normal data',()=>{
 const g=readSocketGeometry(buffer(),meta);
 assert.ok(g.index.count<=60000&&g.index.count>=50000);assert.ok(g.attributes.position.count<20000);
 assert.deepEqual(g.boundingBox.min.toArray(),[-.5,-.5,-.5]);assert.deepEqual(g.boundingBox.max.toArray(),[.5,.5,.5]);
 for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-5);
 assert.equal(g.attributes.uv.count,g.attributes.position.count);g.dispose();
});
test('all wall orientations face inward and preserve measured size and floor elevation',()=>{
 const room={width:4200,depth:3200,height:2700},geometry=readSocketGeometry(buffer(),meta),material=new THREE.MeshStandardMaterial();
 for(const [wall,normal]of [['a',[0,0,1]],['b',[-1,0,0]],['c',[0,0,-1]],['d',[1,0,0]]]){
  const f={wall,offset:750,elevation:1080,width:86,height:86,projection:12},b=featureBox(f,room,8),root=new THREE.Group();root.position.set(b.x*.001,b.y*.001,b.z*.001);root.rotation.y=socketRotation(wall);
  root.add(placeSocket(new THREE.Mesh(geometry,material),f));root.updateMatrixWorld(true);
  const n=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion);assert.ok(n.distanceTo(new THREE.Vector3(...normal))<1e-8);
  const box=new THREE.Box3().setFromObject(root);assert.ok(Math.abs(box.min.y-1.08)<1e-7);
  assert.ok(box.getSize(new THREE.Vector3()).distanceTo(new THREE.Vector3(b.w*.001,.086,b.d*.001))<1e-7);
  assert.ok(Math.abs(box.max.x)<=room.width/2000+1e-7);assert.ok(Math.abs(box.min.x)<=room.width/2000+1e-7);
  assert.ok(Math.abs(box.max.z)<=room.depth/2000+1e-7);assert.ok(Math.abs(box.min.z)<=room.depth/2000+1e-7);
 }
 geometry.dispose();material.dispose();
});
test('corrupt buffers and out-of-range indices fail before renderer use',()=>{
 assert.throws(()=>readSocketGeometry(buffer().slice(0,-4),meta));
 const bad=buffer();new Uint32Array(bad,meta.attributes.index.offset,1)[0]=meta.vertices;assert.throws(()=>readSocketGeometry(bad,meta),/indices/);
});
test('late asset loads never attach to replaced rooms or disposed scenes; live clones share GPU resources',async()=>{
 let resolve;const assets=new SocketAssets(()=>{});assets.load=()=>new Promise(r=>resolve=r);const group=new THREE.Group(),fallback=new THREE.Group();group.add(fallback);
 assets.attach(group,fallback,{},()=>false);resolve();await Promise.resolve();assert.equal(group.children[0],fallback);
 assets.geometry=new THREE.BoxGeometry();assets.material=new THREE.MeshStandardMaterial();assets.load=()=>Promise.resolve(assets);
 const f={width:86,height:86,projection:12};assets.attach(group,fallback,f,()=>true);await Promise.resolve();assert.equal(group.children.length,1);assert.equal(group.children[0].geometry,assets.geometry);assert.ok(group.children[0].userData.sharedSocketAsset);
 const gone=new THREE.Group(),old=new THREE.Group();gone.add(old);assets.dispose();assets.attach(gone,old,f,()=>true);await Promise.resolve();assert.equal(gone.children[0],old);
});
