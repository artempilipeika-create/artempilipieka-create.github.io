// Serialize the kitchen questionnaire examples and the plinth row using the editor’s own parts and hardware.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {normalizeKitchen, PRODUCTION_MODELS} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {visitKitchenCards} from './kitchen-card-views.mjs';

if (!process.argv[2]) throw new Error('Укажите папку вывода геометрии.');
const directory = path.resolve(process.argv[2]);
fs.mkdirSync(directory, {recursive:true});
const room = {width:4000, depth:4000, height:2800};

function encode(values, Type) {
  const array = Type.from(values);
  return Buffer.from(array.buffer,array.byteOffset,array.byteLength).toString('base64');
}

function writeScene(file, root, options) {
  const geometries=[], objects=[], indices=new Map();
  root.updateMatrixWorld(true);
  root.traverseVisible(child=>{
    if (!child.isMesh || child.userData.role==='reveal') return;
    const geo=child.geometry, materials=Array.isArray(child.material)?child.material:[child.material];
    const position=geo.attributes.position;
    if (!position || !position.count) return;
    const allIndices=geo.index?.array??Array.from({length:position.count},(_,i)=>i);
    const groups=geo.groups.length&&materials.length>1?geo.groups:[{start:0,count:allIndices.length,materialIndex:0}];
    for (const group of groups) {
      const id=geo.uuid+':'+group.start+':'+group.count;
      if (!indices.has(id)) {
        indices.set(id,geometries.length);
        geometries.push({
          vertex:encode(position.array,Float32Array),
          normal:geo.attributes.normal&&encode(geo.attributes.normal.array,Float32Array),
          uv:geo.attributes.uv&&encode(geo.attributes.uv.array,Float32Array),
          index:encode(allIndices.slice(group.start,group.start+group.count),Uint32Array)
        });
      }
      const material=materials[group.materialIndex]??materials[0];
      const role=child.userData.appliance??child.userData.role??'body';
      const artRole=child.userData.artRole==='glassShelf'?'glass':child.userData.artRole;
      objects.push({geometry:indices.get(id),role:artRole??role,
        matrix:child.matrixWorld.toArray(),color:material.color.toArray(),roughness:material.roughness??.65,
        metalness:material.metalness??0});
    }
  });
  fs.writeFileSync(path.join(directory,file+'.json'),JSON.stringify({...options,geometries,objects}));
}

visitKitchenCards((_folder,file,root,options)=>writeScene(file,root,options));

// Keep the toe-kick illustration on the same installed row and native models as the kitchen.
const items=['bazis.3079d0656398','bazis.5f5697e39e27','bazis.0211e4f77fc4'].map((id,i)=>{
  const p=PRODUCTION_MODELS[id], d=p.native_defaults;
  return normalizeKitchen({item_id:'row-'+i,bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,
    module_type:'base_cabinet',name:p.label,...d,body_height:d.height-100,base_height:100,base:'legs',
    layout:p.front?.kind??'doors',drawers:i===1?3:0,handles:'handles',x:(i-1)*600,z:0,rotation:0},room);
});
const state={items,room,plinths:[{id:'continuous-plinth',members:[],shape:'straight',automatic:true,excluded_members:[]}]};
const factory=new MeshFactory({room,items,state,material:()=>null,
  template:it=>({production:PRODUCTION_MODELS[it.bazis_id]})},()=>{});
const row=new THREE.Group();
for (const it of items) {
  const group=factory.build(it);
  factory.position(group,it);
  row.add(group);
}
row.add(factory.dress(items,state));
writeScene('plinth',row,{wall:false});
factory.dispose();
