import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {StudioRender} from '../../backend/v2/cabinet_assets/planner/studio-render.mjs';

function renderer(supported=true){
  return {extensions:{has:()=>supported},capabilities:{maxSamples:4},target:null,draws:[],
    getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},
    getDrawingBufferSize(v){return v.set(3840,2160);},
    render(s,c){this.draws.push({scene:s,camera:c,target:this.target});}};
}
test('Unsupported GPUs render the original scene without allocating HDR targets',()=>{
  const r=renderer(false),p=new StudioRender(r),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  p.render(scene,camera);assert.equal(r.draws.length,1);assert.equal(r.draws[0].scene,scene);assert.equal(p.target,undefined);p.dispose();
});
test('Presentation keeps geometry/camera intact and caps the offscreen allocation',()=>{
  const r=renderer(),p=new StudioRender(r),s=new THREE.Scene(),c=new THREE.PerspectiveCamera(32,16/9,.025,150);
  c.setViewOffset(1920,1080,172,-16,1920,1080);
  const before=c.projectionMatrix.toArray();p.render(s,c);
  assert.equal(r.draws.length,2);assert.equal(r.draws[0].scene,s);assert.equal(r.draws[0].camera,c);
  assert.equal(p.target.width,2100);assert.ok(p.target.height<=1182);assert.equal(r.target,null);
  assert.deepEqual(c.projectionMatrix.toArray(),before);assert.equal(s.children.length,0);
  assert.deepEqual(p.material.uniforms.inverseProjection.value.toArray(),c.projectionMatrixInverse.toArray());p.dispose();
});
test('Orthographic measurements and nested catalogue targets bypass presentation',()=>{
  const r=renderer(),p=new StudioRender(r),s=new THREE.Scene();p.render(s,new THREE.OrthographicCamera());
  assert.equal(r.draws.length,1);const target={catalogue:true};r.target=target;p.render(s,new THREE.PerspectiveCamera());
  assert.equal(r.draws.length,2);assert.equal(r.target,target);p.dispose();
});
test('A failed scene render always restores the default framebuffer',()=>{
  const r=renderer(),p=new StudioRender(r);r.render=()=>{throw Error('lost context');};
  assert.throws(()=>p.render(new THREE.Scene(),new THREE.PerspectiveCamera()),/lost context/);assert.equal(r.target,null);p.dispose();
});
