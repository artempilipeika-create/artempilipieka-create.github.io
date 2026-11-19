import * as THREE from './vendor/three.module.js';
import meshes from './wardrobe-handle-meshes.json' with {type:'json'};
import {doorHardware} from './wardrobe-door-layout.mjs';
import {doorHandle,panelProfiles,boardProfileCuts,golaOutline} from './wardrobe-door-hardware.mjs';

function handleMesh(sku){
 const [xyz,idx,normals]=meshes[sku].map(v=>Uint8Array.from(atob(v),c=>c.charCodeAt(0)).buffer);
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(Float32Array.from(new Int16Array(xyz),n=>n*.0001),3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute(Float32Array.from(new Int8Array(normals),n=>n/127),3));
 g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx),1));return g;
}
function profileMesh(run){
 const section=doorHardware[run.article].sectionYZ,shape=new THREE.Shape();
 section.forEach(([y,z],i)=>{if(i)shape.lineTo(-z*.001,y*.001);else shape.moveTo(-z*.001,y*.001);});shape.closePath();
 return new THREE.ExtrudeGeometry(shape,{depth:run.span*.001,bevelEnabled:false}).rotateY(Math.PI/2);
}
export function buildDoorHardware(factory,group,item,ghost){
 const h=doorHandle(item);
 if(h){
  const key='wardrobe-handle:'+h.article;
  const mesh=factory.mesh(group,'frame',factory.acquire(key,()=>handleMesh(h.article)),key,h.x-item.width/2,h.y,(h.back?-1:1)*item.depth/2,null,ghost);
  if(h.back)mesh.rotateY(Math.PI);
  mesh.rotateOnWorldAxis(new THREE.Vector3(0,0,1),h.angle*Math.PI/180);
  Object.assign(mesh.userData,{frontAccessory:true,article:h.article});
 }
 for(const run of panelProfiles(item,factory.adapter.items||[])){
  const key='wardrobe-profile:'+run.article+':'+run.span;
  const mesh=factory.mesh(group,'frame',factory.acquire(key,()=>profileMesh(run)),key,run.x,run.y,run.z,null,ghost);
  Object.assign(mesh.userData,{golaProfile:run.kind,article:run.article});
  const bracketKey='gola-mount:118236';
  for(const direction of [1,-1]){
   const x=run.mountX+(direction<0?run.mountSpan:0);
   const bracket=factory.mesh(group,'handle',factory.acquire(bracketKey,bracketGeometry),bracketKey,x,run.y-31,run.z-run.mountDepth,null,ghost);
   bracket.scale.x=direction;Object.assign(bracket.userData,{golaMount:run.kind,article:'118236'});
  }
 }
}
export function shapedProfilePanel(factory,group,item,ghost){
 const cuts=boardProfileCuts(item,factory.adapter.items||[]);if(!cuts.length)return false;
 const {width:w,height:h,depth:d}=item,key='wardrobe-cut:'+JSON.stringify([w,h,d,cuts]);
 const shape=new THREE.Shape(),path=golaOutline(d,h,cuts);
 const v=(x,y)=>new THREE.Vector2((x-d/2)*.001,y*.001);
 const first=path[0].line;shape.moveTo((first[0]-d/2)*.001,first[1]*.001);
 for(const segment of path){
   if(segment.line){const p=v(segment.line[2],segment.line[3]);shape.lineTo(p.x,p.y);continue;}
   const [x,y,m,n,a,b]=segment.arc;
   const p=v(x,y),q=v(m,n),r=v(a,b);
   // Radius-five fillets in these corner cuts are circular, including clipped ends.
   const ax=q.x-p.x,ay=q.y-p.y,bx=r.x-p.x,by=r.y-p.y;
   const det=2*(ax*by-ay*bx),u=ax*ax+ay*ay,t=bx*bx+by*by;
   const cx=p.x+(by*u-ay*t)/det,cy=p.y+(ax*t-bx*u)/det;
   shape.absarc(cx,cy,Math.hypot(p.x-cx,p.y-cy),Math.atan2(p.y-cy,p.x-cx),Math.atan2(r.y-cy,r.x-cx),det<0);
 }
 const geometry=factory.acquire(key,()=>new THREE.ExtrudeGeometry(shape,{depth:w*.001,curveSegments:8,bevelEnabled:false}).rotateY(-Math.PI/2).translate(w*.0005,0,0));
 factory.mesh(group,'body',geometry,key,0,0,0,item.body_variant_id,ghost);return true;
}


// Actual solid geometry from AKS 118236, with the left inner side face as its origin.
function bracketGeometry() {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute([0,0,-47,0,0,-9,2,0,-9,2,0,-47,0,-12,-47,0,-12,-9,2,-12,-9,2,-12,-47,47,0,0,47,0,-2,9,0,-2,9,0,0,47,-12,0,47,-12,-2,9,-12,-2,9,-12,0,9,-2.9203,0,9,-2.9203,-2,2,-2.9203,-2,2,-2.9203,-9,0,-2.9203,-9,0,-2.9203,-3.0321,0.0373,-2.9203,-2.5578,0.1484,-2.9203,-2.0952,0.3305,-2.9203,-1.6556,0.5791,-2.9203,-1.2499,0.8881,-2.9203,-0.8881,1.2499,-2.9203,-0.5791,1.6556,-2.9203,-0.3305,2.0952,-2.9203,-0.1484,2.5578,-2.9203,-0.0373,3.0321,-2.9203,0,9,-9.0797,0,9,-9.0797,-2,2,-9.0797,-2,2,-9.0797,-9,0,-9.0797,-9,0,-9.0797,-3.0321,0.0373,-9.0797,-2.5578,0.1484,-9.0797,-2.0952,0.3305,-9.0797,-1.6556,0.5791,-9.0797,-1.2499,0.8881,-9.0797,-0.8881,1.2499,-9.0797,-0.5791,1.6556,-9.0797,-0.3305,2.0952,-9.0797,-0.1484,2.5578,-9.0797,-0.0373,3.0321,-9.0797,0], 3));
  indexed.setIndex([1,3,0,5,4,7,3,1,2,7,6,5,0,5,1,0,4,5,1,6,2,1,5,6,2,7,3,2,6,7,3,4,0,3,7,4,9,11,8,13,12,15,11,9,10,15,14,13,8,13,9,8,12,13,9,14,10,9,13,14,10,15,11,10,14,15,11,12,8,11,15,12,17,31,16,33,32,47,31,29,30,47,46,45,29,27,28,45,44,43,27,25,26,43,42,41,25,23,24,41,40,39,23,21,22,39,38,37,21,19,20,37,36,35,18,31,17,34,33,47,31,27,29,47,45,43,27,23,25,43,41,39,23,19,21,39,37,35,18,27,31,34,47,43,27,19,23,43,39,35,19,27,18,35,34,43,16,33,17,16,32,33,17,34,18,17,33,34,18,35,19,18,34,35,19,36,20,19,35,36,20,37,21,20,36,37,21,38,22,21,37,38,22,39,23,22,38,39,23,40,24,23,39,40,24,41,25,24,40,41,25,42,26,25,41,42,26,43,27,26,42,43,27,44,28,27,43,44,28,45,29,28,44,45,29,46,30,29,45,46,30,47,31,30,46,47,31,32,16,31,47,32]);
  // Solid faces keep their own normals on metal edges.
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry.scale(.001,.001,.001);
}
