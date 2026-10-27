// Exact construction references for the separate Gola card's illustrations.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {PRODUCTION_MODELS,TALL_GOLA_VARIANTS} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {readApplianceGeometry} from '../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {trimApplianceBody,buildApplianceFront} from '../backend/v2/cabinet_assets/planner/appliance-finish.mjs';

const out=path.resolve(process.argv[2]||'/tmp/mf-tall-gola-references');fs.mkdirSync(out,{recursive:true});
const records=[],room={width:6000,depth:5000,height:3000};
const paint={body:'#c6b390',shelf:'#c6b390',front:'#c6b390',back:'#c6b390',plinth:'#343730',handle:'#242724',lightProfile:'#242724'};
const assets=new URL('../backend/v2/cabinet_assets/planner/appliance-assets/',import.meta.url);

for(const v of TALL_GOLA_VARIANTS){
 const modes=v.layout==='storage'&&v.row_height===820?['closed','open']:['closed'];
 for(const mode of modes){
  const p=PRODUCTION_MODELS[v.id],it={item_id:'reference',name:v.label,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,
   module_type:'tall_cabinet',width:600,height:v.native_height,depth:600,body_height:v.native_height-100,base_height:100,base:'legs',
   worktop_thickness:0,handles:'handleless',layout:v.drawer?'combo':'doors',drawers:v.drawer?1:0,x:0,z:0,rotation:0,doors_open:mode==='open'};
  const state={items:[it],room,plinths:[]},factory=new MeshFactory({room,state,template:()=>({production:p}),material:()=>null},()=>{});
  for(const kind of ['oven','microwave']){
   const meta=JSON.parse(fs.readFileSync(new URL(kind+'-tripo.json',assets))),bytes=fs.readFileSync(new URL(meta.buffer,assets));
   const source=readApplianceGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta),front=buildApplianceFront(kind);
   const material=new THREE.MeshPhysicalMaterial({color:'#999999',roughness:.35,metalness:.3});material.userData.asset=kind;
   factory.applianceAssets.entries.set(kind,{ready:true,textures:[],geometry:trimApplianceBody(source),material,ghost:material,
    frontGeometry:front.geometry,frontMaterials:front.materials,frontGhostMaterials:front.materials});source.dispose();
  }
  const group=factory.build(it);
  factory.box(group,'plinth',600,98,18,0,49,250,null);
  group.updateMatrixWorld(true);const meshes=[];
  group.traverseVisible(m=>{
   if(!m.isMesh||m.material?.alphaMap||m.userData.role==='reveal')return;
   const g=m.geometry,mats=Array.isArray(m.material)?m.material:[m.material],indices=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i);
   const groups=g.groups.length?g.groups:[{start:0,count:indices.length,materialIndex:0}];
   for(const section of groups){const mat=mats[section.materialIndex]||mats[0],role=m.userData.role||'',color=paint[role]?new THREE.Color(paint[role]):mat.color;
    meshes.push({position:Array.from(g.attributes.position.array),normal:g.attributes.normal?Array.from(g.attributes.normal.array):null,
     uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,index:indices.slice(section.start,section.start+section.count),matrix:m.matrixWorld.toArray(),
     color:color?.toArray()||[.6,.6,.6],metalness:mat.metalness||0,roughness:mat.roughness??.7,opacity:mat.opacity??1,asset:mat.userData.asset,role,part:m.userData.part?.key});
   }
  });
  const file=`gola-${v.row_height}-${v.layout}-${v.opening}-${mode}`;
  const record={file,source_id:v.id,source_file:v.source_file,source_sha256:v.source_sha256,size_mm:[600,v.native_height,600],mode};
  fs.writeFileSync(path.join(out,file+'.json'),JSON.stringify({meshes,camera:[.8,.38,1.5]}));records.push(record);factory.dispose();
 }
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({purpose:'Exact native construction references; final illustrations pending',records},null,2)+'\n');
console.log(JSON.stringify({references:records.length,variants:TALL_GOLA_VARIANTS.length}));
