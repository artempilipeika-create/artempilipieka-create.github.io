import * as THREE from './vendor/three.module.js';

const KINDS=new Set(['oven','microwave']);
export const applianceAssetURL=kind=>{
  if(!KINDS.has(kind))throw Error('Unknown appliance');
  return new URL('./appliance-assets/'+kind+'-tripo.json',import.meta.url);
};

/** Presentation envelopes only; the native 595 / 380 mm mounting niches stay intact. */
export function applianceLayout(item,production){
  const a=production?.tall;if(a?.family!=='appliance')return[];
  const extension=a.microwave?9.5:0;
  return [['oven',a.oven_bottom,595],...(a.microwave?[['microwave',a.oven_bottom+613,380]]:[])].map(([kind,bottom,h])=>({
    kind,width:595,height:h-2+extension,depth:kind==='oven'?550:350,
    y:bottom+h/2+(kind==='oven'?extension/2:-extension/2),front:item.depth/2+42
  }));
}

export function readApplianceGeometry(buffer,meta){
  if(meta.version!==1||!KINDS.has(meta.kind)||meta.byteLength!==buffer.byteLength||!Number.isInteger(meta.vertices)||meta.vertices<3||meta.vertices>100000||!Number.isInteger(meta.triangles)||meta.triangles<1||meta.triangles>40000)throw Error('Invalid appliance asset');
  const geometry=new THREE.BufferGeometry();
  try{
    for(const [key,size]of [['position',3],['normal',3],['uv',2],['index',1]]){
      const a=meta.attributes?.[key],indexed=key==='index',Type=indexed?Uint32Array:Float32Array;
      if(!a||a.size!==size||a.type!==(indexed?'uint32':'float32')||!Number.isInteger(a.offset)||a.offset<0||a.offset%4||!Number.isInteger(a.count)||a.count<1||a.offset+a.count*size*4>buffer.byteLength)throw Error('Invalid appliance attribute');
      const values=new Type(buffer,a.offset,a.count*size);
      if(indexed){if(a.count!==meta.triangles*3||values.some(v=>v>=meta.vertices))throw Error('Invalid appliance indices');geometry.setIndex(new THREE.BufferAttribute(values,1));}
      else{
        if(a.count!==meta.vertices||values.some(v=>!Number.isFinite(v)))throw Error('Invalid appliance vertices');
        if(key==='position'&&values.some(v=>Math.abs(v)>.50001))throw Error('Appliance exceeds normalized bounds');
        geometry.setAttribute(key,new THREE.BufferAttribute(values,size));
      }
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={visualOnly:true,source:'Tripo H3.1',kind:meta.kind};return geometry;
  }catch(error){geometry.dispose();throw error;}
}

export class ApplianceAssets{
  constructor(onChange){this.onChange=onChange;this.entries=new Map();this.abort=new AbortController();this.disposed=false;}
  load(kind){
    if(!this.entries.has(kind)){
      const entry={textures:[],ready:false};this.entries.set(kind,entry);
      entry.promise=this.prepare(kind,entry).then(()=>{entry.ready=true;this.onChange?.(true);return entry;}).catch(error=>{this.releaseEntry(entry);throw error;});
    }
    return this.entries.get(kind).promise;
  }
  async prepare(kind,entry){
    const url=applianceAssetURL(kind),response=await fetch(url,{signal:this.abort.signal});if(!response.ok)throw Error('Appliance manifest unavailable');
    const meta=await response.json();
    if(meta.kind!==kind||meta.buffer!==kind+'-tripo.bin'||['color','rm','normal'].some(k=>meta.textures?.[k]!==kind+'-tripo-'+k+'.webp'))throw Error('Unknown appliance file');
    const mesh=await fetch(new URL(meta.buffer,url),{signal:this.abort.signal});if(!mesh.ok)throw Error('Appliance mesh unavailable');
    const buffer=await mesh.arrayBuffer();if(this.disposed)throw Error('Appliances disposed');entry.geometry=readApplianceGeometry(buffer,meta);
    const loader=new THREE.TextureLoader(),results=await Promise.allSettled(['color','rm','normal'].map(key=>new Promise((resolve,reject)=>{
      const texture=loader.load(new URL(meta.textures[key],url).href,()=>{if(this.disposed){texture.dispose();reject(Error('Appliances disposed'));}else resolve(texture);},undefined,reject);
      texture.flipY=false;texture.colorSpace=key==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.anisotropy=4;entry.textures.push(texture);
    })));
    if(this.disposed||results.some(r=>r.status==='rejected'))throw Error('Appliance textures unavailable');
    const [map,rm,normalMap]=results.map(r=>r.value);
    entry.material=new THREE.MeshPhysicalMaterial({map,roughnessMap:rm,metalnessMap:rm,normalMap,roughness:1,metalness:1,clearcoat:.22,clearcoatRoughness:.18,envMapIntensity:1.05});
    entry.ghost=entry.material.clone();entry.ghost.transparent=true;entry.ghost.opacity=.36;entry.ghost.depthWrite=false;
  }
  attach(slot,fallback,layout,ghost,isCurrent){
    const mount=entry=>{
      if(this.disposed||!isCurrent()||slot.userData.assetAttached)return;
      const mesh=new THREE.Mesh(entry.geometry,ghost?entry.ghost:entry.material);
      mesh.scale.set(layout.width*.001,layout.height*.001,layout.depth*.001);
      mesh.position.set(0,layout.y*.001,(layout.front-layout.depth/2)*.001);
      mesh.castShadow=!ghost;mesh.receiveShadow=!ghost;
      mesh.userData={visualOnly:true,sharedApplianceAsset:true,appliance:layout.kind,role:'appliance-model',itemId:slot.userData.itemId};
      slot.add(mesh);fallback.visible=false;slot.userData.assetAttached=true;this.onChange?.();
    };
    const entry=this.entries.get(layout.kind);
    if(entry?.ready)mount(entry);else this.load(layout.kind).then(mount).catch(()=>{ /* Keep the measured fallback. */ });
  }
  ownsGeometry(g){return [...this.entries.values()].some(e=>e.geometry===g);}
  releaseEntry(e){e.geometry?.dispose();e.material?.dispose();e.ghost?.dispose();for(const t of e.textures)t.dispose();e.textures=[];e.ready=false;}
  dispose(){this.disposed=true;this.abort.abort();for(const e of this.entries.values())this.releaseEntry(e);this.entries.clear();}
}
