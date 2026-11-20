import * as THREE from './vendor/three.module.js';
import {panelMachiningPlan} from './panel-machining.mjs';
import {physicalPanelUV} from './material-visuals.mjs';

const EPS=1e-8;
function facePlane(poly){
 const u=new THREE.Vector3(),v=new THREE.Vector3();
 for(let i=1;i+1<poly.length;i++){
  u.subVectors(poly[i],poly[0]);v.subVectors(poly[i+1],poly[0]);u.cross(v);
  if(u.lengthSq()>1e-24)return new THREE.Plane().setFromNormalAndCoplanarPoint(u.normalize(),poly[0]);
 }
 return null;
}
function split(poly,plane,same,opposite,front,back){
 const distances=poly.map(p=>plane.distanceToPoint(p));
 const pos=distances.some(d=>d>EPS),neg=distances.some(d=>d< -EPS);
 if(!pos&&!neg){const p=facePlane(poly);if(p)(p.normal.dot(plane.normal)>=0?same:opposite).push(poly);return;}
 if(!neg){front.push(poly);return;}
 if(!pos){back.push(poly);return;}
 const a=[],b=[];
 for(let i=0;i<poly.length;i++){
  const j=(i+1)%poly.length,di=distances[i],dj=distances[j];
  if(di>= -EPS)a.push(poly[i]);
  if(di<=EPS)b.push(poly[i]);
  if(di>EPS&&dj< -EPS||di< -EPS&&dj>EPS){
   const p=poly[i].clone().lerp(poly[j],di/(di-dj));a.push(p);b.push(p);
  }
 }
 if(facePlane(a))front.push(a);if(facePlane(b))back.push(b);
}
// Split closed solids into oriented convex polygons. Coplanar surfaces are
// classified by winding so adjacent PVC strips and through cuts stay closed.
class SolidTree{
 constructor(polys=[]){this.polys=[];this.add(polys);}
 add(polys){
  if(!polys.length)return;
  this.plane??=facePlane(polys[0]);
  const a=[],b=[];for(const p of polys)split(p,this.plane,this.polys,this.polys,a,b);
  if(a.length)(this.front??=new SolidTree()).add(a);
  if(b.length)(this.back??=new SolidTree()).add(b);
 }
 faces(){return [...this.polys,...this.front?.faces()??[],...this.back?.faces()??[]];}
 invert(){
  for(const p of this.polys)p.reverse();this.plane?.negate();
  this.front?.invert();this.back?.invert();[this.front,this.back]=[this.back,this.front];
 }
 outside(polys){
  if(!this.plane)return polys;
  const a=[],b=[];for(const p of polys)split(p,this.plane,a,b,a,b);
  return [...(this.front?this.front.outside(a):a),...(this.back?this.back.outside(b):[])];
 }
 clip(other){this.polys=other.outside(this.polys);this.front?.clip(other);this.back?.clip(other);}
}
function subtract(polys,tool){
 const a=new SolidTree(polys),b=new SolidTree(tool.map(p=>p.slice()));
 a.invert();a.clip(b);b.clip(a);b.invert();b.clip(a);b.invert();a.add(b.faces());a.invert();
 return a.faces();
}
function cutter(item,op){
 const W=item.blank_width_mm,L=item.blank_length_mm,T=item.blank_thickness_mm;
 const {line:[x,y,a,b],profile}=panelMachiningPlan(op,W,L,T),span=Math.hypot(a-x,b-y);
 function point(x,y,z){
  const p={side:[T/2-z,y,x-W/2],horizontal:[y-L/2,z,x-W/2],front:[x-W/2,y,z-T/2],back:[y-L/2,W-x,z-T/2]}[item.blank_axis];
  return new THREE.Vector3(...p).multiplyScalar(.001);
 }
 const rings=[[x,y],[a,b]].map(([i,j])=>profile.map(([u,v])=>point(i-(b-y)*u/span,j+(a-x)*u/span,v)));
 const polys=[rings[0].slice(),rings[1].slice()];
 for(let i=0;i<profile.length;i++){
  const j=(i+1)%profile.length;polys.push([rings[0][i],rings[0][j],rings[1][j],rings[1][i]]);
 }
 const center=new THREE.Vector3();for(const p of rings.flat())center.add(p);center.divideScalar(2*profile.length);
 for(const face of polys)if(facePlane(face).distanceToPoint(center)>0)face.reverse();
 return polys;
}
export function carvedGeometry(source,position,tools){
 let polys=[];const attr=source.attributes.position,idx=source.index;
 const vertex=i=>new THREE.Vector3().fromBufferAttribute(attr,idx?idx.getX(i):i);
 for(let i=0;i<(idx?.count??attr.count);i+=3){const p=[vertex(i),vertex(i+1),vertex(i+2)];if(facePlane(p))polys.push(p);}
 for(const tool of tools){
  if(!polys.length)break;
  polys=subtract(polys,tool.map(p=>p.map(v=>v.clone().sub(position))));
 }
 const coordinates=[];
 for(const p of polys)for(let i=1;i<p.length-1;i++)for(const v of [p[0],p[i],p[i+1]])coordinates.push(v.x,v.y,v.z);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));geometry.computeVertexNormals();
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(coordinates.length/3*2),2));
 if(source.attributes.color){
  const colors=new Float32Array(coordinates.length).fill(1);geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 }
 return geometry;
}
export function machineBoardMeshes(factory,item,meshes,grain){
 const tools=item.blank_machining.map(op=>cutter(item,op));
 const boxes=tools.map(p=>new THREE.Box3().setFromPoints(p.flat()));
 for(const mesh of meshes){
  const original=mesh.geometry,oldKey=mesh.userData.geometryKey;
  if(!original||!oldKey)continue;
  original.computeBoundingBox();
  const bounds=original.boundingBox.clone().translate(mesh.position);
  const active=tools.filter((_,i)=>boxes[i].intersectsBox(bounds));if(!active.length)continue;
  const key=JSON.stringify(['machining',oldKey,mesh.position.toArray(),item.blank_axis,item.width,item.height,item.depth,item.blank_machining]);
  mesh.geometry=factory.acquire(key,()=>{
   const g=carvedGeometry(original,mesh.position,active);
   if(g.attributes.position.count)physicalPanelUV(g,{x:item.width,y:item.height,z:item.depth},grain,
    {x:mesh.position.x*1000,y:mesh.position.y*1000-item.height/2,z:mesh.position.z*1000});
   return g;
  });
  factory.pool.get(oldKey).refs--;mesh.userData.geometryKey=key;
 }
}
