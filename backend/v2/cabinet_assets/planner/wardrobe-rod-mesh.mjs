import * as THREE from './vendor/three.module.js';
import holders from './wardrobe-rod-meshes.json' with {type:'json'};
import {planRods} from './wardrobe-rods.mjs';

export function panelRods(it){
 const meta=it.assistant_carcass;
 return meta?.spec.rods?.length&&it.item_id===meta.group_id+':top'?planRods(meta.spec):[];
}
function holderGeometry(family){
 const [xyz,indices,normals]=holders[family].map(data=>Uint8Array.from(atob(data),s=>s.charCodeAt(0)).buffer);
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(new Int16Array(xyz),p=>p*.0001),3));
 g.setAttribute('normal',new THREE.BufferAttribute(Float32Array.from(new Int8Array(normals),p=>p/127),3));
 g.setIndex(new THREE.BufferAttribute(new Uint16Array(indices),1));return g;
}
function tubeGeometry(r){
 const round=r.product.family==='round',radius=round?12.5:7.5,straight=round?0:7.5;
 function outline(path,mm,clockwise){
   const a=mm*.001,h=straight*.001;
   if(round){path.absarc(0,0,a,0,Math.PI*2,clockwise);return;}
   if(clockwise){
     path.moveTo(-a,h);path.absarc(0,h,a,Math.PI,0,true);path.lineTo(a,-h);path.absarc(0,-h,a,0,-Math.PI,true);
   }else{
     path.moveTo(a,h);path.absarc(0,h,a,0,Math.PI,false);path.lineTo(-a,-h);path.absarc(0,-h,a,Math.PI,2*Math.PI,false);
   }
   path.closePath();
 }
 const section=new THREE.Shape(),hole=new THREE.Path();
 outline(section,radius,false);outline(hole,radius-r.product.wallMm,true);section.holes.push(hole);
 return new THREE.ExtrudeGeometry(section,{depth:r.cut*.001,bevelEnabled:false,curveSegments:20}).rotateY(Math.PI/2);
}
export function buildRodMeshes(factory,group,it,ghost){
 for(const r of panelRods(it)){
   const s=it.assistant_carcass.spec,y=r.y-(s.height-s.thickness);
   const role={chrome:'chromeFoot',black:'frame',white:'whiteFoot'}[r.product.finish];
   const tubeKey='wardrobe-tube:'+r.article+':'+r.cut,holderKey='rod-holder:'+r.product.family;
   const tube=factory.mesh(group,role,factory.acquire(tubeKey,()=>tubeGeometry(r)),tubeKey,r.left+r.product.cutAllowance/2,y,r.z,null,ghost);
   tube.userData.rodId=r.id;tube.userData.article=r.article;
   for(const right of [false,true]){
     const m=factory.mesh(group,role,factory.acquire(holderKey,()=>holderGeometry(r.product.family)),holderKey,r.left+(right?r.width:0),y,r.z,null,ghost);
     if(right)m.rotation.y=Math.PI;m.userData.rodId=r.id;m.userData.article=r.product.holderArticle;
   }
 }
}
