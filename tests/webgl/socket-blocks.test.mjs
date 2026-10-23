import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {newSocket,setSocketCount,mountSocket} from '../../backend/v2/cabinet_assets/planner/socket-editor.mjs';
import {newShaft} from '../../backend/v2/cabinet_assets/planner/shaft-editor.mjs';
import {roomError,featureBox,featureWall,socketSurface,socketBlockWidth} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
import {socketLayout,SocketAssets,socketRotation} from '../../backend/v2/cabinet_assets/planner/socket-asset.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const room=()=>({width:4200,depth:3200,height:2700,setup_complete:true,features:[]});
test('1–4 outlet blocks fit the front and both sides of a shaft on all four walls',()=>{
  for(const wall of 'abcd')for(const face of ['front','start','end'])for(const count of [1,2,3,4]){
    const r=room(),host={...newShaft(r,'shaft'),wall,offset:900},f=newSocket(r,'socket');r.features=[host,f];setSocketCount(f,count);mountSocket(f,r,host.id,face);
    assert.equal(roomError(r),'',`${wall}/${face}/${count}`);
    const b=featureBox(f,r),surface=socketSurface(f,r),h=featureBox(host,r);
    assert.equal(b.y,f.elevation+f.height/2);
    assert.ok(Math.abs(b.x-h.x)>=(b.w+h.w)/2-.001||Math.abs(b.z-h.z)>=(b.d+h.d)/2-.001);
    const n=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),socketRotation(featureWall(f,r)));
    assert.ok(n.distanceTo(new THREE.Vector3(surface.normal.x,0,surface.normal.z))<1e-8);
    const shifted=structuredClone(r);shifted.features[0].offset+=120;const next=featureBox(shifted.features[1],shifted);
    assert.equal(next.x-b.x,['a','c'].includes(wall)?120:0);assert.equal(next.z-b.z,['b','d'].includes(wall)?120:0);
  }
});
test('attached outlets track shaft depth and wall changes without rewriting their local offsets',()=>{
  const r=room(),host={...newShaft(r,'shaft'),offset:900},f=newSocket(r,'socket');r.features=[host,f];setSocketCount(f,3);mountSocket(f,r,host.id);const offset=f.offset,b=featureBox(f,r);
  host.projection+=125;assert.equal(featureBox(f,r).z-b.z,125);host.wall='d';assert.equal(featureWall(f,r),'d');assert.equal(f.offset,offset);assert.equal(roomError(r),'');
});
test('count changes preserve measured frame proportion and single legacy outlets stay unchanged',()=>{
  const f=newSocket(room(),'s');assert.deepEqual(socketLayout(f),[{x:0,width:86,height:86}]);
  for(const count of [2,3,4,1]){setSocketCount(f,count);assert.equal(f.width,socketBlockWidth(count));assert.equal(socketLayout(f).length,count);}
  setSocketCount(f,2);f.width=314;setSocketCount(f,3);assert.equal(f.width,456);
});
test('dangling mounts, obstructed faces, oversized blocks and invalid counts are rejected',()=>{
  const r=room(),host=newShaft(r,'shaft'),f=newSocket(r,'s');r.features=[host,f];assert.match(roomError(r),/пересекает выступ/);
  mountSocket(f,r,'shaft','start');assert.match(roomError(r),/границы комнаты/);
  mountSocket(f,r,'shaft','front');setSocketCount(f,4);f.offset=500;assert.match(roomError(r),/не помещается/);f.offset=0;
  host.height=200;assert.match(roomError(r),/высоту вентшахты/);host.height=2700;
  f.socket_count=5;assert.match(roomError(r),/от 1 до 4/);f.socket_count=4;
  f.mount_id='deleted';assert.match(roomError(r),/существующую/);
});
test('a four-outlet block uses four correctly spaced Tripo meshes with shared GPU resources',async()=>{
  const assets=new SocketAssets(()=>{});assets.geometry=new THREE.BoxGeometry();assets.material=new THREE.MeshStandardMaterial();assets.load=()=>Promise.resolve(assets);
  const f={width:299,height:86,projection:12,socket_count:4},group=new THREE.Group(),fallback=new THREE.Group();group.add(fallback);assets.attach(group,fallback,f,()=>true);await Promise.resolve();
  assert.equal(group.children.length,4);
  const boxes=group.children.map(m=>{assert.equal(m.geometry,assets.geometry);assert.equal(m.material,assets.material);return new THREE.Box3().setFromObject(m);});
  for(let i=0;i<4;i++){assert.ok(Math.abs(group.children[i].position.x-(-106.5+i*71)*.001)<1e-8);assert.ok(boxes[i].min.x>=-.1495&&boxes[i].max.x<=.1495);if(i)assert.ok(boxes[i].min.x>=boxes[i-1].max.x-1e-8);}
  assets.dispose();
});
test('mounted block survives save and undo/redo together with its parent shaft',()=>{
  const r=room(),host={...newShaft(r,'shaft'),offset:900};r.features=[host];let state={name:'Kitchen',scene:{room:r,items:[]}};
  const before=structuredClone(state),history=new History({snapshot:()=>structuredClone(state),restore:s=>state=structuredClone(s)});
  history.run('Add mounted block',()=>{const f=newSocket(r,'block');setSocketCount(f,4);mountSocket(f,r,'shaft');r.features.push(f);});const saved=JSON.parse(JSON.stringify(state));assert.equal(roomError(saved.scene.room),'');
  history.undo();assert.deepEqual(state,before);history.redo();assert.deepEqual(state,saved);
});
