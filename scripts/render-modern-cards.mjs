import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {PRODUCTION_MODELS} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const out=path.resolve(process.argv[2]||'/tmp/mf-modern-geometry');fs.mkdirSync(out,{recursive:true});const records=[],M=globalThis.MF_MODERN_CABINETS;
for(const [key,family]of Object.entries(M.families)){
 const v=M.choice(family.default_id),p=PRODUCTION_MODELS[v.id],it={item_id:v.id,bazis_id:v.id,bazis_sha256:v.source_sha256,module_type:p.tier==='wall'?'wall_cabinet':'tall_cabinet',width:600,height:p.body_height+p.base_height,body_height:p.body_height,base_height:p.base_height,depth:p.scene_depth,base:p.tier==='wall'?'wall':'plinth',layout:'doors',handles:'handles',doors_open:key==='gaslift',x:0,z:0,rotation:0};
 const factory=new MeshFactory({room:{width:6000,depth:6000,height:3000},state:{items:[it],plinths:[]},template:()=>({production:p}),material:()=>null},()=>{}),root=factory.build(it);root.updateMatrixWorld(true);const meshes=[];
 root.traverseVisible(m=>{if(!m.isMesh||m.userData.role==='reveal')return;const g=m.geometry,mats=Array.isArray(m.material)?m.material:[m.material],groups=g.groups.length?g.groups:[{start:0,count:g.index?.count||g.attributes.position.count,materialIndex:0}],indices=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i);
 for(const group of groups){const mat=mats[group.materialIndex]||mats[0],colors={body:'#ded8cc',front:'#f1ede5',back:'#e3dfd4',shelf:'#ded8cc',plinth:'#ddd7ca',handle:'#343c38'},color=colors[m.userData.role]?new THREE.Color(colors[m.userData.role]):mat.color;meshes.push({position:Array.from(g.attributes.position.array),normal:g.attributes.normal?Array.from(g.attributes.normal.array):null,index:indices.slice(group.start,group.start+group.count),matrix:m.matrixWorld.toArray(),color:color.toArray(),opacity:mat.opacity??1,metalness:mat.metalness||0,roughness:mat.roughness??.7});}});
 const file='modern-'+key;fs.writeFileSync(path.join(out,file+'.json'),JSON.stringify({meshes,camera:[.8,.45,1.5]}));records.push({file});factory.dispose();
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({records}));
