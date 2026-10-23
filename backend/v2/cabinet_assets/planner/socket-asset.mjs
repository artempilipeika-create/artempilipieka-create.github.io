import * as THREE from './vendor/three.module.js';
import {socketCount} from './room-plan.mjs';
export const SOCKET_ASSET_URL=new URL('./room-assets/socket-tripo.json',import.meta.url);
export const socketRotation=wall=>({a:0,b:-Math.PI/2,c:Math.PI,d:Math.PI/2})[wall];
export function socketLayout(f){
  const count=socketCount(f);if(count===1)return [{x:0,width:f.width,height:f.height}];
  const size=Math.min(f.height*71/86,f.width/count),margin=Math.min(f.height*7.5/86,Math.max(0,(f.width-size*count)/2)),pitch=(f.width-size-2*margin)/(count-1);
  return Array.from({length:count},(_,i)=>({x:(i-(count-1)/2)*pitch,width:size,height:size}));
}

// Fixed, build-time validated asset; this is not a general user mesh importer.
export function readSocketGeometry(buffer,meta){
  if(meta.version!==1||meta.byteLength!==buffer.byteLength||meta.vertices>100000||meta.triangles>50000)throw Error('Invalid socket asset');
  const geometry=new THREE.BufferGeometry();
  try{
    for(const [key,size]of [['position',3],['normal',3],['uv',2],['index',1]]){
      const a=meta.attributes[key],Type=key==='index'?Uint32Array:Float32Array;
      if(!a||a.size!==size||a.type!==(key==='index'?'uint32':'float32')||a.offset%4||a.offset<0||!Number.isInteger(a.count)||a.count<1||a.offset+a.count*size*4>buffer.byteLength)throw Error('Invalid socket attribute');
      const data=new Type(buffer,a.offset,a.count*size);
      if(key==='index'){if(a.count!==meta.triangles*3||data.some(v=>v>=meta.vertices))throw Error('Invalid socket indices');geometry.setIndex(new THREE.BufferAttribute(data,1));}
      else{if(a.count!==meta.vertices||data.some(v=>!Number.isFinite(v)))throw Error('Invalid socket vertices');geometry.setAttribute(key,new THREE.BufferAttribute(data,size));}
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
  }catch(error){geometry.dispose();throw error;}
}
export function placeSocket(mesh,feature){
  mesh.scale.set(feature.width*.001,feature.height*.001,Math.max(8,feature.projection)*.001);
  mesh.userData.sharedSocketAsset=true;mesh.userData.visualOnly=true;
  mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}
export class SocketAssets{
  constructor(onChange){this.onChange=onChange;this.abort=new AbortController();this.maps=[];this.disposed=false;}
  async load(){
    if(!this.promise)this.promise=this.prepare().catch(error=>{this.release();throw error;});
    return this.promise;
  }
  async prepare(){
    const json=await fetch(SOCKET_ASSET_URL,{signal:this.abort.signal});if(!json.ok)throw Error('Socket manifest unavailable');
    const meta=await json.json();
    if(meta.buffer!=='socket-tripo.bin'||Object.values(meta.textures).some(v=>!/^socket-tripo-(color|rm|normal)\.webp$/.test(v)))throw Error('Unknown socket asset');
    const response=await fetch(new URL(meta.buffer,SOCKET_ASSET_URL),{signal:this.abort.signal});if(!response.ok)throw Error('Socket mesh unavailable');
    const buffer=await response.arrayBuffer();if(this.disposed)throw Error('Socket disposed');
    this.geometry=readSocketGeometry(buffer,meta);
    const loader=new THREE.TextureLoader();
    const texture=key=>new Promise((resolve,reject)=>{
      const t=loader.load(new URL(meta.textures[key],SOCKET_ASSET_URL).href,()=>{if(this.disposed){t.dispose();reject(Error('Socket disposed'));}else resolve(t);},undefined,reject);
      t.flipY=false;t.colorSpace=key==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=4;this.maps.push(t);
    });
    // Wait for every texture to settle before cleanup on a partial failure.
    const results=await Promise.allSettled(['color','rm','normal'].map(texture));
    if(this.disposed||results.some(r=>r.status==='rejected'))throw Error('Socket textures unavailable');
    const [map,rm,normalMap]=results.map(r=>r.value);
    this.material=new THREE.MeshStandardMaterial({map,roughnessMap:rm,metalnessMap:rm,normalMap,roughness:1,metalness:1});
    return this;
  }
  attach(group,fallback,feature,isCurrent){
    this.load().then(()=>{
      if(this.disposed||!isCurrent())return;
      for(const slot of socketLayout(feature)){const mesh=placeSocket(new THREE.Mesh(this.geometry,this.material),{...feature,width:slot.width,height:slot.height});mesh.position.x=slot.x*.001;group.add(mesh);}
      fallback.removeFromParent();fallback.traverse(m=>{if(m.userData.ownMaterial)m.material.dispose();});
      this.onChange();
    }).catch(()=>{ /* Keep the measured placeholder if loading fails. */ });
  }
  release(){this.geometry?.dispose();this.material?.dispose();for(const t of this.maps)t.dispose();this.maps=[];}
  dispose(){this.disposed=true;this.abort.abort();this.release();}
}
