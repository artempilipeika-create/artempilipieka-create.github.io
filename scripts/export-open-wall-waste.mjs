// Catalogue pictures only: use the same production geometry as the editor.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {PRODUCTION_MODELS,normalizeKitchen} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const out=path.resolve(process.argv[2]||'/tmp/mf-choice-geometry');fs.mkdirSync(out,{recursive:true});
const room={width:6000,depth:5000,height:3000},records=[];
const paint={body:'#d1cabc',shelf:'#d1cabc',front:'#c3baa9',back:'#c6bdab',counter:'#e3ddd1',plinth:'#3e423c',handle:'#242724',reveal:'#31342e'};
function item(id){const p=PRODUCTION_MODELS[id],d=p.native_defaults||{width:600,height:820,depth:510};return normalizeKitchen({item_id:id,bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,module_type:'base_cabinet',name:p.label,width:d.width,height:d.height,depth:d.depth,body_height:d.height-100,base_height:100,base:'legs',layout:p.front?.kind||'doors',drawers:p.front?.kind==='drawers'?2:0,handles:'handles',x:0,z:0,rotation:0,body_variant_id:null,front_variant_id:null,countertopMaterialId:null,plinthMaterialId:null});}
function factory(items){const state={items,room,plinths:[]};const f=new MeshFactory({room,state,template:i=>({production:PRODUCTION_MODELS[i.bazis_id]}),material:()=>null},()=>{});
 return f;
}
function save(file,root,meta={}){root.updateMatrixWorld(true);const meshes=[];
 root.traverseVisible(m=>{if(!m.isMesh||m.material?.alphaMap||m.userData.role==='reveal')return;const g=m.geometry,mats=Array.isArray(m.material)?m.material:[m.material],groups=g.groups.length?g.groups:[{start:0,count:g.index?.count||g.attributes.position.count,materialIndex:0}],indices=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i);
  for(const group of groups){const mat=mats[group.materialIndex]||mats[0],role=m.userData.role||'',color=paint[role]?new THREE.Color(paint[role]):mat.color;
   meshes.push({position:Array.from(g.attributes.position.array),normal:g.attributes.normal?Array.from(g.attributes.normal.array):null,uv:g.attributes.uv?Array.from(g.attributes.uv.array):null,index:indices.slice(group.start,group.start+group.count),matrix:m.matrixWorld.toArray(),color:color?.toArray()||[.6,.6,.6],metalness:mat.metalness||0,roughness:mat.roughness??.7,opacity:mat.opacity??1,asset:mat.userData.asset,role,part:m.userData.part?.key});
  }
 });
 fs.writeFileSync(path.join(out,file+'.json'),JSON.stringify({file,meshes,...meta}));records.push({file,...meta});
}
for(const v of [...globalThis.MF_OPEN_TALL.variants.filter(v=>v.wall),...globalThis.MF_CARGO.variants.filter(v=>v.waste)]){
 const id=v.id,p=PRODUCTION_MODELS[id],wall=Boolean(v.wall),it=item(id);Object.assign(it,{module_type:wall?'wall_cabinet':'base_cabinet',width:wall?600:350,height:wall?720:820,depth:wall?317:510,body_height:720,base_height:wall?0:100,base:wall?'wall':'legs',layout:wall?'niche':'drawers',drawers:wall?0:1,handles:wall||v.execution==='gola'?'handleless':'handles'});
 const f=factory([it]),root=new THREE.Group(),body=f.build(it);root.add(body);
 if(!wall){body.traverse(m=>{if(m.isMesh&&(m.userData.role==='front'||m.userData.role==='handle'||m.userData.cargoBasket))m.position.z+=.45;});f.box(root,'plinth',it.width,98,18,0,49,205,null);root.add(f.dress([it],{items:[it],room,plinths:[]}));}
 const file=wall?id.replace('bazis.','open-wall-'):'waste-'+v.execution;save(file,root,{source_id:id,size_mm:[it.width,it.height,it.depth],camera:wall?[.4,.25,1.6]:[1.1,.9,1.5],floor:wall?-.08:-.002});f.dispose();
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({records},null,2));console.log(records.map(r=>r.file));
