// Scene inputs for render-wardrobe-layout-art.py. No source FR3D is modified.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {buildCarcass,CARCASS_BACK_MATERIAL_ID} from '../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {newDresser,setDresserLayout,syncDresser,dresserPresets} from '../backend/v2/cabinet_assets/planner/dresser-layout.mjs';
import {planReadyLayout,readySections} from '../backend/v2/cabinet_assets/planner/wardrobe-ready-layouts.mjs';
import {prepareSectionPreset} from '../backend/v2/cabinet_assets/planner/wardrobe-section-presets.mjs';
import {wardrobeSpec} from '../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {questionnaireModel,studioCamera} from '../backend/v2/cabinet_assets/planner/questionnaire-showroom.mjs';

if(!process.argv[2])throw Error('Укажите папку для промежуточной геометрии.');
const directory=path.resolve(process.argv[2]);
fs.mkdirSync(directory,{recursive:true});
const entries=[];

function wardrobe(width,depth){
  return {width,depth,height:2280,thickness:18,sections:1,sectionShelves:[0],clearLayout:true,drawerFixing:'cam_dowel',back:true};
}
function buffer(array){
  return Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
}
function detailBounds(built,model){
  const box=new THREE.Box3();
  if(built.fittings.length||built.rods.length){
    const fittings=built.fittings.map(f=>f.id);
    const lowRod=built.rods.length?built.rods.reduce((a,b)=>a.y<b.y?a:b).id:null;
    // For a stacked pull-out and tray the lower mechanism is the most legible close-up.
    if(fittings.length>1)fittings.splice(1);
    model.traverseVisible(m=>{
      if(m.isMesh&&(fittings.includes(m.userData.fittingId)||lowRod&&m.userData.rodId===lowRod))box.expandByObject(m);
    });
  }else if(built.drawerBanks.some(Boolean)){
    for(const group of model.children){
      if(/:drawer-\d+-\d+-(?:face|side-right)$/.test(group.userData.itemId))box.expandByObject(group);
    }
  }
  return box.isEmpty()?null:{centre:box.getCenter(new THREE.Vector3()).toArray(),size:box.getSize(new THREE.Vector3()).toArray()};
}
function write(name,fields,{open=true,section=false}={}){
  const built=buildCarcass(wardrobeSpec(fields),{idPrefix:'studio'});
  const {model,release}=questionnaireModel(built,{open,material:id=>id===CARCASS_BACK_MATERIAL_ID?{color:'#ffffff'}:null});
  const {camera,centre,half}=studioCamera(built,4/3);
  const geometries=[],mats=[],instances=[],geometryIndex=new Map(),materialIndex=new Map();
  model.traverseVisible(mesh=>{
    if(!mesh.isMesh||mesh.userData.role==='reveal'||mesh.material.alphaMap)return;
    const geometry=mesh.geometry,mat=mesh.material;
    if(Array.isArray(mat))throw Error(name+' содержит неподдерживаемый составной материал.');
    if(!geometryIndex.has(geometry)){
      geometryIndex.set(geometry,geometries.length);
      const {position,normal}=geometry.attributes;
      geometries.push({p:buffer(Float32Array.from(position.array)),n:normal?buffer(Float32Array.from(normal.array)):null,
        idx:geometry.index?buffer(Uint32Array.from(geometry.index.array)):null});
    }
    const material={role:mesh.userData.role,c:mat.color.toArray(),metal:mat.metalness,rough:mat.roughness,opacity:mat.opacity};
    const key=JSON.stringify(material);
    if(!materialIndex.has(key)){materialIndex.set(key,mats.length);mats.push(material);}
    instances.push([geometryIndex.get(geometry),materialIndex.get(key),mesh.matrixWorld.toArray()]);
  });
  const {width,height,depth}=built.spec;
  const shot={geometries,mats,instances,camera:camera.position.toArray(),centre:centre.toArray(),half,
    size:[width,height,depth],suspended:built.spec.dresser?.installation==='wall',detail:section?detailBounds(built,model):null};
  fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify(shot));
  release();entries.push(name);
}
for(const [id,[width,depth]] of Object.entries({hall:[1000,420],couple:[1800,600],business:[1200,600],utility:[1100,600]})){
  write(id,planReadyLayout(wardrobe(width,depth),{id}).fields);
}
for(const id of Object.keys(readySections)){
  const width=id==='business'?600:['ironing','lift'].includes(id)?640:680;
  const fields=wardrobe(width,id==='shallow'?410:600);
  write(['daily','deep'].includes(id)?id:'section-'+id,planReadyLayout(fields,{id,section:0}).fields,{section:true});
}
// The quick action fits two rods into the existing niche, without the top shelf of the whole-section preset.
write('section-niche-shirts',prepareSectionPreset(wardrobe(680,600),{section:0,level:0},'shirts').fields,{section:true});
for(const preset of dresserPresets){
  const fields=newDresser();setDresserLayout(fields,preset.kinds);
  for(const hanging of [false,true]){
    if(hanging){delete fields.feet;fields.elevation=300;fields.dresser.installation='wall';}
    for(const open of [false,true]){
      write('dresser-'+preset.id+(hanging?'-wall':'')+'-'+(open?'open':'closed'),syncDresser(fields),{open});
    }
  }
}
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(entries));
