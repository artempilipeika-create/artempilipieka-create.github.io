import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {buildApplianceFront,trimApplianceBody} from '../../backend/v2/cabinet_assets/planner/appliance-finish.mjs';
import {ApplianceAssets} from '../../backend/v2/cabinet_assets/planner/appliance-assets.mjs';

test('Smooth fascias stay within the existing envelope with finite unit normals and bounded geometry',()=>{
 for(const kind of ['oven','microwave']){
  const {geometry:g,materials}=buildApplianceFront(kind);
  assert.ok(g.attributes.position.count/3<12000);
  assert.deepEqual(g.boundingBox.min.toArray().slice(0,2),[-.5,-.5]);assert.deepEqual(g.boundingBox.max.toArray(),[.5,.5,.5]);
  for(const name of ['position','normal'])assert.ok(Array.from(g.attributes[name].array).every(Number.isFinite));
  const v=new THREE.Vector3();for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(v.fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-5);
  let cursor=0;for(const group of g.groups){assert.equal(group.start,cursor);assert.ok(materials[group.materialIndex]);cursor+=group.count;}assert.equal(cursor,g.attributes.position.count);
  assert.ok(g.userData.components.includes('smooth horizontal handle'));assert.ok(g.userData.components.includes('64-segment rotary control'));
  g.dispose();materials.forEach(m=>m.dispose());
 }
});

test('Tripo front clipping interpolates UVs and normals and never leaves vertices in front of the cut',()=>{
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,.5,0,0,0,.5,.5],3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));g.setIndex([0,1,2]);
 const clipped=trimApplianceBody(g,.25),p=clipped.attributes.position,uv=clipped.attributes.uv;
 assert.equal(p.count,6);
 for(let i=0;i<p.count;i++){assert.ok(p.getZ(i)<=.25);assert.ok(Math.abs(uv.getX(i)-p.getX(i)-.5)<1e-6);assert.ok(Math.abs(uv.getY(i)-2*p.getY(i))<1e-6);}
 assert.equal(g.attributes.position.getZ(2),.5);g.dispose();clipped.dispose();
});

test('Body and fascia resources are shared by all instances and released with their owner',()=>{
 const assets=new ApplianceAssets(()=>{}),front=buildApplianceFront('oven'),entry={ready:true,textures:[],geometry:new THREE.BoxGeometry(1,1,1),material:new THREE.MeshPhysicalMaterial(),ghost:new THREE.MeshPhysicalMaterial(),frontGeometry:front.geometry,frontMaterials:front.materials,frontGhostMaterials:front.materials.map(m=>m.clone())};
 assets.entries.set('oven',entry);const a=new THREE.Group(),b=new THREE.Group(),layout={kind:'oven',width:595,height:593,depth:550,y:522.5,front:292};
 for(const slot of [a,b]){const fallback=new THREE.Group();slot.add(fallback);assets.attach(slot,fallback,layout,false,()=>true);assert.equal(slot.children.length,3);assert.equal(fallback.visible,false);}
 assert.equal(a.children[2].geometry,b.children[2].geometry);assert.equal(a.children[2].material,b.children[2].material);assert.ok(assets.ownsGeometry(front.geometry));
 assert.deepEqual(a.children[2].position.toArray(),a.children[1].position.toArray());assert.deepEqual(a.children[2].scale.toArray(),a.children[1].scale.toArray());
 let released=0;front.geometry.addEventListener('dispose',()=>released++);assets.dispose();assert.equal(released,1);
});
