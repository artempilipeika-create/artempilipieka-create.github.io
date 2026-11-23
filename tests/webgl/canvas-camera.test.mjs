import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {CanvasRenderer} from '../../backend/v2/cabinet_assets/planner/canvas-renderer.mjs';

function renderer(){
  const context={
    createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},
    putImageData(image){this.last=image;}
  };
  const r=new CanvasRenderer({width:120,height:90,getContext:()=>context});
  return {r,context};
}
function panel(scene,w,h,d,x,y,z,color){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color}));
  mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function pixel(image,x,y){return Array.from(image.data.slice((y*image.width+x)*4,(y*image.width+x)*4+3));}

test('software camera draws the same cabinet from its front, above and at an angle with depth occlusion',()=>{
  const {r,context}=renderer(),scene=new THREE.Scene();
  const cabinet=panel(scene,1,1.5,.5,0,0,0,0xffffff);
  panel(scene,.9,1.4,.03,0,0,.27,0xff0000);
  panel(scene,1.1,.05,.7,0,.78,0,0x996600);
  const camera=new THREE.OrthographicCamera(-1.5,1.5,1,-1,.01,30);
  const draw=(x,y,z)=>{
    camera.position.set(x,y,z);camera.up.set(0,z===0?0:1,z===0?-1:0);camera.lookAt(0,0,0);
    r.render(scene,camera);return Buffer.from(context.last.data);
  };
  const front=draw(0,0,4);assert.deepEqual(pixel(context.last,60,45),[255,0,0]);
  const top=draw(0,4,0);assert.deepEqual(pixel(context.last,60,45),[153,102,0]);
  const angle=draw(2,1.3,4);
  assert.notDeepEqual(angle,top);assert.notDeepEqual(angle,front);
  cabinet.visible=false;draw(0,0,-4);assert.deepEqual(pixel(context.last,60,45),[255,0,0]);
});

test('software preview targets use WebGL row order and leave the main canvas untouched',()=>{
  const {r,context}=renderer(),scene=new THREE.Scene();
  panel(scene,2,1,.03,0,.5,0,0xff0000);panel(scene,2,1,.03,0,-.5,0,0x0000ff);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,10);camera.position.z=3;
  const target={width:20,height:20};r.setRenderTarget(target);r.render(scene,camera);
  const row=new Uint8Array(4);r.readRenderTargetPixels(target,8,2,1,1,row);
  assert.deepEqual([...row],[0,0,255,255]);r.readRenderTargetPixels(target,8,18,1,1,row);
  assert.deepEqual([...row],[255,0,0,255]);assert.equal(context.last,undefined);
  r.setRenderTarget(null);r.render(scene,camera);assert.deepEqual(pixel(context.last,60,15),[255,0,0]);
});

test('geometry crossing the near plane remains visible from a perspective camera',()=>{
  const {r,context}=renderer(),scene=new THREE.Scene(),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.4,-2,.5,-.4,-2,0,.4,.1],3));
  scene.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff0000,side:THREE.DoubleSide})));
  const camera=new THREE.PerspectiveCamera(60,120/90,.1,40);r.render(scene,camera);
  assert.deepEqual(pixel(context.last,60,45),[255,0,0]);assert.deepEqual(pixel(context.last,0,89),[239,236,230]);
});
