import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {CanvasRenderer} from '../../backend/v2/cabinet_assets/planner/canvas-renderer.mjs';
import {textureSampler, chooseLevel, sample} from '../../backend/v2/cabinet_assets/planner/canvas-materials.mjs';
import {CabinetShadows} from '../../backend/v2/cabinet_assets/planner/canvas-shadows.mjs';
import {qualityProfile} from '../../backend/v2/cabinet_assets/planner/presentation.mjs';

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

test('interactive profiles retain screen detail and leave preview and export sizes independent',()=>{
  const {r}=renderer();r.setSize(1864,895);
  const still=[r.canvas.width,r.canvas.height];
  assert.ok(still[0]>1864 && still[1]>895);
  const target={width:768,height:600};r.setRenderTarget(target);
  assert.deepEqual([r.frame().width,r.frame().height],[768,600]);assert.equal(r.canvas.width,still[0]);
  r.setRenderTarget(null);r.quality=qualityProfile('balanced');r.setSize(1864,895);
  assert.deepEqual([r.canvas.width,r.canvas.height],[1864,895]);
  r.setSize(3840,2160);assert.equal(r.canvas.width,1920);
  r.setSize(3840,2160,false,true);
  assert.deepEqual([r.canvas.width,r.canvas.height],[3840,2160]);
});

test('high resolution decor keeps fine strokes close up and averages them at a distance',()=>{
  const w=2048, data=new Uint8ClampedArray(w*4);
  for(let x=0;x<w;x++){data[x*4]=(x%2)*255;data[x*4+3]=255;}
  const tx=new THREE.DataTexture(data,w,1), sampler=textureSampler(tx,new WeakMap()), out=new Float32Array(4);
  chooseLevel(sampler,1/w,0,0,0);assert.equal(sampler.level.width,w);
  sample(sampler,1.5/w,.5,out);assert.equal(out[0],1);
  sample(sampler,2/w,.5,out);assert.ok(Math.abs(out[0]-.5)<.001);
  const redAtFootprint=footprint=>{
    chooseLevel(sampler,footprint/w,0,0,footprint);
    sample(sampler,1.5/w,.5,out);return out[0];
  };
  assert.ok(redAtFootprint(1.5)<.8 && redAtFootprint(1.5)>.6);
  assert.ok(Math.abs(redAtFootprint(1.999)-redAtFootprint(2.001))<.002);
  chooseLevel(sampler,32/w,0,0,0);assert.ok(sampler.level.width<=256);
  sample(sampler,.31,.5,out);assert.ok(Math.abs(out[0]-.5)<.01);assert.equal(out[3],1);
});

test('real occluders shade nearby rear panels without drawing a border on a lone flat face',()=>{
  const {r,context}=renderer(),scene=new THREE.Scene();
  panel(scene,2,2,.02,0,0,0,0xffffff);
  const camera=new THREE.PerspectiveCamera(42,120/90,.01,10);camera.position.z=1;
  r.render(scene,camera);const flat=Buffer.from(context.last.data);
  panel(scene,.35,.6,.045,.04,0,.033,0xffffff);
  r.render(scene,camera);
  assert.ok(flat.every((v,i)=>i%4===3||v===255));
  const nearEdge=pixel(context.last,42,45)[0],outside=pixel(context.last,16,45)[0];
  assert.ok(nearEdge<outside,`near ${nearEdge}, outside ${outside}`);
});

test('a pull casts one continuous soft shadow at its physical offset from the facade',()=>{
  const scene=new THREE.Scene(),key=new THREE.DirectionalLight(0xffffff,2);
  key.position.set(-2,3,4);scene.add(key,key.target);key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-.6,right:.6,top:.6,bottom:-.6,near:.1,far:10});
  key.shadow.camera.updateProjectionMatrix();
  const pull=panel(scene,.28,.085,.04,0,0,.18,0x777777);pull.castShadow=true;
  const camera=new THREE.PerspectiveCamera(36,1,.01,15);camera.position.z=2;
  scene.updateMatrixWorld();camera.updateMatrixWorld();
  const shadow=new CabinetShadows().build(key,[pull],camera,512);
  const visible=(x,y)=>{const p=new THREE.Vector3(x,y,0).project(camera);return shadow.visibility(p.x,p.y,p.z);};
  assert.ok(visible(.09,-.135)<.7);assert.equal(visible(.09,.13),1);
  const row=Array.from({length:121},(_,i)=>visible(-.21+i*.005,-.135));
  const first=row.findIndex(v=>v<.85),last=row.findLastIndex(v=>v<.85);
  assert.ok(first>0 && last<row.length-1 && last-first>40);
  assert.ok(row.slice(first,last+1).every(v=>v<.85));
  assert.ok(row.some(v=>v>.65 && v<.99));
  let rasterized=0;
  const triangle=shadow.triangle.bind(shadow);
  shadow.triangle=(...args)=>{rasterized++;return triangle(...args);};
  camera.position.x=.3;camera.lookAt(0,0,0);camera.updateMatrixWorld();
  shadow.build(key,[pull],camera,512,false);
  assert.equal(rasterized,0);assert.ok(visible(.09,-.135)<.7);
  pull.position.x=.32;pull.updateMatrixWorld();
  shadow.build(key,[pull],camera,512,false);
  assert.ok(rasterized>0);assert.equal(visible(.09,-.135),1);
});
