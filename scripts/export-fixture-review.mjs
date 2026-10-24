// Offline geometry review of the actual mesh factory; no production orders.
import fs from 'node:fs';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {readApplianceGeometry} from '../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {PRODUCTION_MODELS,normalizeKitchen} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {defaultFixture} from '../backend/v2/cabinet_assets/planner/worktop-fixtures.mjs';
const room={width:3600,depth:3000,height:2700},id='bazis.0211e4f77fc4',p=PRODUCTION_MODELS[id];
const items=['sink','hob'].map((kind,i)=>{const sourceId=kind==='sink'?'bazis.5731630ddd87':id,source=PRODUCTION_MODELS[sourceId];return normalizeKitchen({item_id:kind,name:kind,module_type:'base_cabinet',bazis_id:sourceId,bazis_sha256:source.source_sha256,bazis_file:source.source_file,width:600,height:820,depth:510,body_height:720,base_height:100,base:'legs',layout:'doors',drawers:0,handles:'handles',x:i*600-300,z:0,rotation:0,worktop_fixture:{...defaultFixture(kind),hood:kind==='hob'?'chimney':'none'}});});
const factory=new MeshFactory({room,state:{items,room,plinths:[{id:"review-plinth",automatic:true,members:[],shape:"straight",excluded_members:[]}]},material:()=>null,template:it=>({production:PRODUCTION_MODELS[it.bazis_id]})},()=>{});
for(const kind of ['sink','faucet','hood']){
 const base=new URL('../backend/v2/cabinet_assets/planner/appliance-assets/',import.meta.url),meta=JSON.parse(fs.readFileSync(new URL(kind+'-tripo.json',base))),bytes=fs.readFileSync(new URL(meta.buffer,base));
 const material=new THREE.MeshPhysicalMaterial();material.userData.asset=kind;
 factory.applianceAssets.entries.set(kind,{ready:true,textures:[],geometry:readApplianceGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta),material,ghost:material,mountAnchor:meta.mountAnchor,nominalSize:meta.nominalSize});
}
const root=new THREE.Group();for(const it of items)root.add(factory.build(it));root.add(factory.dress(items));root.updateMatrixWorld(true);
const meshes=[];root.traverseVisible(m=>{if(!m.isMesh)return;const g=m.geometry,material=Array.isArray(m.material)?m.material[0]:m.material;
 meshes.push({position:Array.from(g.attributes.position.array),normal:g.attributes.normal?Array.from(g.attributes.normal.array):null,uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,index:g.index?Array.from(g.index.array):null,matrix:m.matrixWorld.toArray(),color:material.color?.toArray(),metalness:material.metalness||0,roughness:material.roughness??.7,asset:material.userData.asset,role:m.userData.role});});
fs.writeFileSync(process.argv[2],JSON.stringify(meshes));factory.dispose();
