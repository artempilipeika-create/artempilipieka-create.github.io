// Export review-only meshes from the same geometry used by the configurator.
// Never changes production parts, FR3D sources, or the live catalogue.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {PRODUCTION_MODELS, normalizeKitchen, dimensionError} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';

const out=path.resolve(process.argv[2]||'docs/tripo-module-cards-20261025/input');
fs.mkdirSync(out,{recursive:true});
const families=[['open-tall',globalThis.MF_OPEN_TALL.variants.filter(v=>v.catalogue_primary)],['cargo',globalThis.MF_CARGO.variants],['pullout-dryer',globalThis.MF_PULLOUT_DRYERS.variants]];
const room={width:4000,depth:3000,height:3000};

function glb(root,label){
  const j={asset:{version:'2.0',generator:'Martin Forest exact catalogue mesh export'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}]};
  const chunks=[],materialIds=new Map();let offset=0,triangles=0;
  function attribute(array,size,target){
    const padding=(4-offset%4)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
    const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=j.bufferViews.length;
    j.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target});chunks.push(bytes);offset+=bytes.length;
    const a={bufferView:view,componentType:array instanceof Uint32Array?5125:5126,count:array.length/size,type:['','SCALAR','VEC2','VEC3','VEC4'][size]};
    if(size===3){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){a.min[i%3]=Math.min(a.min[i%3],array[i]);a.max[i%3]=Math.max(a.max[i%3],array[i]);}}
    j.accessors.push(a);return j.accessors.length-1;
  }
  root.updateMatrixWorld(true);
  root.traverseVisible(m=>{
    if(!m.isMesh||m.userData.role==='contact'||m.userData.role==='reveal'||m.material?.alphaMap)return;
    const geom=m.geometry.clone().applyMatrix4(m.matrixWorld),materials=Array.isArray(m.material)?m.material:[m.material];
    const attributes={POSITION:attribute(new Float32Array(geom.attributes.position.array),3,34962)};
    if(geom.attributes.normal)attributes.NORMAL=attribute(new Float32Array(geom.attributes.normal.array),3,34962);
    if(geom.attributes.uv)attributes.TEXCOORD_0=attribute(new Float32Array(geom.attributes.uv.array),2,34962);
    const source=geom.index?Array.from(geom.index.array):Array.from({length:geom.attributes.position.count},(_,i)=>i),primitives=[];
    const groups=geom.groups.length?geom.groups:[{start:0,count:source.length,materialIndex:0}];
    for(const group of groups){
      const mat=materials[group.materialIndex]||materials[0];
      const spec={name:m.userData.role||'material',pbrMetallicRoughness:{baseColorFactor:[...(mat.color?.toArray()||[1,1,1]),mat.opacity??1],metallicFactor:mat.metalness||0,roughnessFactor:mat.roughness??.8},doubleSided:mat.side===THREE.DoubleSide};
      if(mat.emissive&&mat.emissiveIntensity)spec.emissiveFactor=mat.emissive.toArray().map(v=>Math.min(1,v*mat.emissiveIntensity));
      const key=JSON.stringify(spec);if(!materialIds.has(key)){materialIds.set(key,j.materials.length);j.materials.push(spec);}
      const indices=new Uint32Array(source.slice(group.start,group.start+group.count));triangles+=indices.length/3;
      primitives.push({attributes,indices:attribute(indices,1,34963),material:materialIds.get(key)});
    }
    j.scenes[0].nodes.push(j.nodes.length);j.nodes.push({name:m.userData.part?.key||m.userData.role||label,mesh:j.meshes.length});j.meshes.push({primitives});geom.dispose();
  });
  const padding=(4-offset%4)%4;if(padding)chunks.push(Buffer.alloc(padding));
  const bin=Buffer.concat(chunks);j.buffers[0].byteLength=bin.length;
  const text=Buffer.from(JSON.stringify(j)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
  const header=Buffer.alloc(12);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);
  const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
  return {bytes:Buffer.concat([header,jh,json,bh,bin]),triangles,meshes:j.meshes.length};
}

const entries=[];
for(const [family,variants] of families)for(const v of variants){
  const tall=family==='open-tall',cargo=family==='cargo';
  const it=normalizeKitchen({item_id:v.id,name:v.label,bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,module_type:tall?'tall_cabinet':'base_cabinet',width:cargo?200:600,height:tall?2000:820,depth:tall?600:510,body_height:tall?1900:720,base_height:100,base:'legs',layout:tall?'niche':'drawers',drawers:tall?0:cargo?1:2,handles:tall||v.execution==='gola'?'handleless':'handles',x:0,z:0,rotation:0});
  const template=i=>({production:PRODUCTION_MODELS[i.bazis_id],...(tall?{front:{kind:'none',count:0}}:{})});
  const error=dimensionError(it,template(it));if(error)throw Error(v.id+': '+error);
  const state={items:[it],room,plinths:[{id:'preview-plinth',automatic:true,members:[],shape:'straight',excluded_members:[]}]};
  const factory=new MeshFactory({room,state,template,material:()=>null},()=>{}),root=new THREE.Group(),cabinet=factory.build(it);root.add(cabinet);root.add(factory.dress([it],state));
  // Inspection pose only: expose the basket so the choice is recognizable.
  // All panels keep their dimensions. Production/export item is left untouched.
  if(!tall)cabinet.traverse(m=>{
    if(!m.isMesh)return;
    const u=m.userData,p=u.part;
    if(u.role==='front'||u.role==='handle'||u.cargoBasket||u.pulloutDryer||u.drawerMetal||p?.role==='drawer')m.position.z+=(cargo?.32:.28);
    if(u.role==='plinth')m.visible=false;
  });
  const slug=tall?`${family}-${v.light_system}-${v.lighting}`:cargo?`${family}-${v.brand}-${v.execution}`:`${family}-${v.dryer_brand}-${v.system}-${v.execution}`;
  const result=glb(root,v.label),file=slug+'.glb';fs.writeFileSync(path.join(out,file),result.bytes);
  const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);
  entries.push({file,family,source_id:v.id,source_sha256:v.source_sha256,label:v.label,light_system:v.light_system,lighting:v.lighting,brand:v.brand||v.dryer_brand,system:v.system,execution:v.execution,dimensions_mm:[it.width,it.height,it.depth],inspection_pose:!tall,mesh_bounds_mm:size.toArray(),triangles:result.triangles,meshes:result.meshes,bytes:result.bytes.length,sha256:crypto.createHash('sha256').update(result.bytes).digest('hex')});
  factory.dispose();
}
const prompt='Texture the supplied furniture mesh only. Preserve its geometry, panel boundaries, openings and all gaps exactly. Cabinet panels: uniform warm light greige matte furniture laminate with a subtle fine microtexture and matching edge banding. Existing metal fittings: retain the supplied graphite or satin steel colors. Existing LED strips only: warm white, never add lighting. Gola profiles have NO lighting. Neutral albedo without baked shadows, reflections, highlights or ambient occlusion. No new shelves, handles, holes, ornaments, text, logos or objects. Keep construction and the inspection pose unchanged.';
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({status:'prepared_not_submitted',created:'2026-10-25',mode:'existing_mesh_texture_4k',prompt,entries},null,2)+'\n');
console.log(JSON.stringify({directory:out,count:entries.length,bytes:entries.reduce((n,e)=>n+e.bytes,0),files:entries.map(e=>e.file)},null,2));
