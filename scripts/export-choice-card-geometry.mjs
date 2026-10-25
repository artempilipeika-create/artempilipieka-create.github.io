// Catalogue pictures only: use the same production geometry as the editor.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory,panelGeometry} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {PRODUCTION_MODELS,normalizeKitchen,productionParts,CORNER_VARIANTS} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {readApplianceGeometry} from '../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {trimApplianceBody,buildApplianceFront} from '../backend/v2/cabinet_assets/planner/appliance-finish.mjs';
import {countertopGeometry} from '../backend/v2/cabinet_assets/planner/countertop-visuals.mjs';
const out=path.resolve(process.argv[2]||'/tmp/mf-choice-geometry');fs.mkdirSync(out,{recursive:true});
const room={width:6000,depth:5000,height:3000},records=[];
const paint={body:'#d1cabc',shelf:'#d1cabc',front:'#c3baa9',back:'#c6bdab',counter:'#e3ddd1',plinth:'#3e423c',handle:'#242724',reveal:'#31342e'};
function item(id){const p=PRODUCTION_MODELS[id],d=p.native_defaults||{width:600,height:820,depth:510};return normalizeKitchen({item_id:id,bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,module_type:'base_cabinet',name:p.label,width:d.width,height:d.height,depth:d.depth,body_height:d.height-100,base_height:100,base:'legs',layout:p.front?.kind||'doors',drawers:p.front?.kind==='drawers'?2:0,handles:'handles',x:0,z:0,rotation:0,body_variant_id:null,front_variant_id:null,countertopMaterialId:null,plinthMaterialId:null});}
function factory(items){const state={items,room,plinths:[]};const f=new MeshFactory({room,state,template:i=>({production:PRODUCTION_MODELS[i.bazis_id]}),material:()=>null},()=>{});
 const base=new URL('../backend/v2/cabinet_assets/planner/appliance-assets/',import.meta.url);
 for(const kind of ['oven','sink','faucet']){const meta=JSON.parse(fs.readFileSync(new URL(kind+'-tripo.json',base))),bytes=fs.readFileSync(new URL(meta.buffer,base)),g=readApplianceGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta),m=new THREE.MeshPhysicalMaterial({color:'#999999',roughness:.35,metalness:.3});m.userData.asset=kind;
  const front=kind==='oven'?buildApplianceFront(kind):null;
  f.applianceAssets.entries.set(kind,{ready:true,textures:[],geometry:front?trimApplianceBody(g):g,material:m,ghost:m,frontGeometry:front?.geometry,frontMaterials:front?.materials,mountAnchor:meta.mountAnchor,nominalSize:meta.nominalSize});
 }
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
function cabinet(file,id,{open=false,choice=false}={}){const it=item(id),p=PRODUCTION_MODELS[id];it.doors_open=open;
 const f=factory([it]),root=new THREE.Group(),body=f.build(it);root.add(body);
 const parts=productionParts(it,{production:p},()=>null),sides=parts.filter(x=>/^side-/.test(x.key));
 for(const s of sides)if(s.position.y-s.size.y/2<99.9)throw Error(file+': side touches floor');
 if(p.corner&&!parts.some(x=>x.key==='filler-front'&&x.size.z===50&&x.size.x===18))throw Error('Missing 90 degree filler');
 if(p.cargo||p.pullout_dryer)body.traverse(m=>{if(m.isMesh&&(m.userData.role==='front'||m.userData.role==='handle'||m.userData.cargoBasket||m.userData.pulloutDryer||m.userData.drawerMetal||m.userData.part?.role==='drawer'))m.position.z+=.25;});
 // Reveal the support construction: front plinth only, open visible side shows legs.
 const plinth=f.box(root,'plinth',p.corner?it.width-50:it.width,98,18,p.corner?(p.corner.side==='right'?-25:25):0,49,it.depth/2-50,null);plinth.userData.visualOnly=true;
 if(!choice){const dress=f.dress([it],{items:[it],room,plinths:[]});dress.traverse(m=>{if(m.userData.role==='plinth')m.visible=false;});root.add(dress);}
 save(file,root,{kind:'cabinet',source_id:id,source_sha256:p.source_sha256,size_mm:[it.width,it.height,it.depth],side_bottom_mm:sides.map(s=>s.position.y-s.size.y/2),filler:p.corner?{depth_mm:50,angle_deg:90}:null,drawer_front_height_mm:p.constraints?.niche_height_mm?122:null,camera:p.corner?[p.corner.side==='right'?-.85:.85,.55,1.4]:[.8,.38,1.5],choice});f.dispose();
}
const families=[['base-single','bazis.0211e4f77fc4'],['base-double','bazis.3079d0656398'],['base-drawers','bazis.39f282e08f0c'],['base-oven','bazis.9e77f4333545'],['base-corner','bazis.a310afbf587f'],['cargo','bazis.0ac4e1b6b2d3'],['pullout-dryer','bazis.85c150c30ea5'],['dishwasher','bazis.300138dc82b5']];
for(const [file,id]of families)cabinet(file,id);
for(const v of CORNER_VARIANTS)cabinet(`corner-${v.side}-${v.purpose}-${v.door_count}`,v.id,{open:v.purpose==='shelf',choice:true});
function box(root,w,h,d,x,y,z,color,role=''){const m=new THREE.Mesh(panelGeometry(w,h,d,.45),new THREE.MeshStandardMaterial({color,roughness:.65}));m.position.set(x/1000,y/1000,z/1000);m.userData.role=role;root.add(m);return m;}
for(const joint of ['standard','euro']){const source=globalThis.MF_COUNTERTOPS.source('left',joint),root=new THREE.Group();
 const panels=joint==='euro'?source.panels:[{role:'main',points:[[0,0],[1800,0],[1800,600],[0,600]]},{role:'left',points:[[0,600],[600,600],[600,1200],[0,1200]]}];
 for(const [i,p]of panels.entries()){const points=p.points,mesh=new THREE.Mesh(countertopGeometry({points,radii:points.map(()=>.5)},38),new THREE.MeshStandardMaterial({color:i?'#c7beac':'#d8cfbd',roughness:.7}));root.add(mesh);}
 save('countertop-'+joint,root,{kind:'joint',source_file:source.source_file,source_sha256:source.source_sha256,camera:[.35,1.6,1],target:[.55,.02,.59],half:.23,floor:-.002});
}
for(const kind of ['panel','ldsp','tile']){const root=new THREE.Group(),t=kind==='panel'?6:kind==='ldsp'?18:10;
 box(root,1200,38,280,0,19,130,'#d6d0c5');
 if(kind==='tile'){box(root,1200,600,8,0,338,-5,'#b8b2a7');for(let row=0;row<3;row++)for(let col=0;col<4;col++)box(root,298,198,2,-450+col*300,138+row*200,0,'#d4ccbc');}
 else box(root,1200,600,t,0,338,0,kind==='panel'?'#c4b295':'#bbb4a5');
 save('backsplash-'+kind,root,{kind:'backsplash',thickness_mm:t,camera:[.8,.36,1.7],floor:-.004});
}
for(const shape of ['straight','left','right','u']){const root=new THREE.Group();box(root,1200,500,6,0,250,0,'#c4b295');if(shape==='left'||shape==='u')box(root,6,500,400,-597,250,203,'#c4b295');if(shape==='right'||shape==='u')box(root,6,500,400,597,250,203,'#c4b295');save('backsplash-'+shape,root,{kind:'backsplash-shape',shape,thickness_mm:6,camera:[shape==='right'?-.8:.8,.5,1.7],floor:0});}
{
 const its=['bazis.0211e4f77fc4','bazis.39f282e08f0c','bazis.3079d0656398'].map(item),f=factory(its),root=new THREE.Group();
 for(const [i,it]of its.entries()){const m=f.build(it);m.position.x=(i-1)*.6;root.add(m);}
 f.box(root,'plinth',1800,98,18,0,49,205,null);box(root,1820,38,580,0,839,15,'#e3ddd1');
 save('plinth',root,{kind:'plinth',side_bottom_mm:118,camera:[.8,.2,1.5],target:[0,.17,.15],half:.43});f.dispose();
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({geometry:'Canonical MF production parts and original FR3D countertop contours. Tripo appliance meshes reused.',records},null,2));console.log(JSON.stringify({output:out,count:records.length}));
