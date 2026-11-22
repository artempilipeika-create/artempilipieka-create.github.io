import * as THREE from './vendor/three.module.js';
import shapes from './wardrobe-fitting-meshes.json' with {type:'json'};
import {panelFittings} from './wardrobe-fittings.mjs';

function outlines(loops,depth){
 const paths=loops.map(loop=>{
   const p=new THREE.Path();p.moveTo(...loop[0]);for(const pt of loop.slice(1))p.lineTo(...pt);p.closePath();return p;
 });
 const vertices=paths.map(p=>p.getPoints()),areas=vertices.map(points=>Math.abs(THREE.ShapeUtils.area(points)));
 const order=paths.map((_,i)=>i).sort((a,b)=>areas[b]-areas[a]),forms=[];
 function contains(points,pt){
   let inside=false;
   for(let i=0,j=points.length-1;i<points.length;j=i++){
     const a=points[i],b=points[j];
     if((a.y>pt.y)!==(b.y>pt.y)&&pt.x<(b.x-a.x)*(pt.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
   }
   return inside;
 }
 for(const i of order){
   const parent=forms.find(f=>contains(vertices[f.i],vertices[i][0]));
   if(parent){parent.s.holes.push(paths[i]);continue;}
   const s=new THREE.Shape(vertices[i]);forms.push({i,s});
 }
 return new THREE.ExtrudeGeometry(forms.map(f=>f.s),{depth,bevelEnabled:false});
}
function originalMesh(part,delta,pitch){
 const data=shapes.shapes[part.g],m=part.m;
 let g;
 if(Array.isArray(data)){
   const [pos,idx,nor]=data.map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer);
   g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.Float32BufferAttribute(Float32Array.from(new Int16Array(pos),v=>v/10),3));
   g.setAttribute('normal',new THREE.Float32BufferAttribute(Float32Array.from(new Int8Array(nor),v=>v/127),3));
   g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx),1));
 }else g=outlines(data.rings,data.depth+(part.stretch?Math.sign(data.depth)*delta:0));
 g.applyMatrix4(new THREE.Matrix4().set(...m,0,0,0,1));
 if(pitch)g.rotateX(pitch*Math.PI/180);
 return g.scale(.001,.001,.001);
}
export function buildFittingMeshes(factory,group,it,ghost){
 const roles={chrome:'chromeFoot',black:'pull-black',graphite:'pull-graphite',brass:'pull-brushedGold',white:'whiteFoot',beige:'ironingBeige'};
 for(const r of panelFittings(it,factory.adapter?.items)){
   const delta=r.p.span?r.width-r.p.reference:0,[ax,ay,az]=r.p.anchor;
   for(const [i,p] of shapes.models[r.variant].entries()){
     const key='wardrobe-fitting:'+r.variant+':'+i+(p.stretch?':'+delta:'');
     const g=factory.acquire(key,()=>originalMesh(p,delta,r.p.pitch));
     const role=r.p.series==='Доски'&&p.color==='graphite'?'ironingGrey':roles[p.color];
     const mesh=factory.mesh(group,role,g,key,r.x-ax+(p.f??0)*delta,r.y-ay-(it.assistant_carcass.spec.height-it.assistant_carcass.spec.thickness),r.z-az,null,ghost);
     mesh.userData.article=r.p.article;mesh.userData.fittingId=r.id;
   }
 }
}
