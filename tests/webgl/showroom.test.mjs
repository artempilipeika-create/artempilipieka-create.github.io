import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {readShowroomModel} from '../../backend/v2/ui_assets/showroom/model.mjs';

const bytes=readFileSync(new URL('../../backend/v2/ui_assets/showroom/nmd2-600.glb',import.meta.url));
const buffer=()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
test('Showroom GLB keeps physical NMD2-600 envelope and all 45,100 exported triangles',()=>{
 const model=readShowroomModel(buffer(),THREE),box=new THREE.Box3().setFromObject(model,true),size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);
 assert.ok(Math.abs(size.x-600)<.03,`Width ${size.x}`);assert.ok(Math.abs(size.y-820)<.03);assert.ok(Math.abs(size.z-531)<.03);
 assert.equal(model.children.length,3);assert.equal(model.children.reduce((sum,m)=>sum+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),45100);
 assert.equal(model.children[0].geometry.index,null); // Flat panel normals, never smooth rounded slab edges.
 assert.equal(model.children[0].material.metalness,0);assert.equal(model.children[2].material.metalness,.8);
 assert.equal(model.children[0].material.map,null);
 for(const child of model.children){assert.ok([...child.geometry.attributes.normal.array].every(Number.isFinite));child.geometry.dispose();child.material.dispose();}
});
test('Showroom reader rejects a corrupt GLB header instead of drawing a partial model',()=>{
 const b=buffer();new DataView(b).setUint32(0,0,true);assert.throws(()=>readShowroomModel(b,THREE),/Invalid GLB/);
});
