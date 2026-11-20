import * as THREE from './vendor/three.module.js';
import overlay from './prime-hinge-mesh.json' with {type:'json'};
import models from './wardrobe-prime-meshes.json' with {type:'json'};

const parts=new Map();
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
function hingeParts(asset){
 if(parts.has(asset))return parts.get(asset);
 const [v,f]=asset==='112595'?overlay:models[asset];
 const points=new Int16Array(decode(v)),indices=new Uint16Array(decode(f));
 const parent=Array.from({length:points.length/3},(_,i)=>i);
 function root(i){
  while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}
  return i;
 }
 for(let t=0;t<indices.length;t+=3){
  const a=root(indices[t]);parent[root(indices[t+1])]=a;parent[root(indices[t+2])]=a;
 }
 // Only the cup enters the door. Its frontmost vertex identifies the entire
 // welded component, independent of face order or faceting in each native mesh.
 let tip=0;
 for(let i=1;i<parent.length;i++)if(points[3*i]<points[3*tip])tip=i;
 const cup=root(tip),groups={cup:[],body:[]};
 for(const i of indices)groups[root(i)===cup?'cup':'body'].push(i);
 const result={};
 for(const [key,faces] of Object.entries(groups)){
  const used=[...new Set(faces)],local=new Map(used.map((v,i)=>[v,i]));
  result[key]={positions:Float32Array.from(used.flatMap(i=>[points[i*3],points[i*3+1],points[i*3+2]]),v=>v*.0001),
   indices:Uint16Array.from(faces,i=>local.get(i))};
 }
 parts.set(asset,result);return result;
}

export function hingeGeometry(asset,side,part){
 const data=hingeParts(asset)[part],g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(data.positions.slice(),3));
 g.setIndex(new THREE.BufferAttribute(data.indices,1));
 g.rotateY(Math.PI/2);g.rotateZ(-side*Math.PI/2);g.computeVertexNormals();return g;
}
