// Serialize the kitchen questionnaire examples and the plinth row using the editor’s own parts and hardware.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {buildCarcass, placeCarcass} from '../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {isBase, kitchenFields, kitchenModels, kitchenSpec} from '../backend/v2/cabinet_assets/planner/ai-kitchen.mjs';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {normalizeKitchen, PRODUCTION_MODELS} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {footHeight} from '../backend/v2/cabinet_assets/planner/plinth-options.mjs';
import {WardrobeMotion} from '../backend/v2/cabinet_assets/planner/wardrobe-motion.mjs';
import {readApplianceGeometry} from '../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {defaultFixture, roundedOutline} from '../backend/v2/cabinet_assets/planner/worktop-fixtures.mjs';
import {buildWorktopFixture} from '../backend/v2/cabinet_assets/planner/worktop-fixture-mesh.mjs';
import {countertopGeometry} from '../backend/v2/cabinet_assets/planner/countertop-visuals.mjs';

if (!process.argv[2]) throw new Error('Укажите папку вывода геометрии.');
const directory = path.resolve(process.argv[2]);
fs.mkdirSync(directory, {recursive:true});
const appliances = new URL('../backend/v2/cabinet_assets/planner/appliance-assets/', import.meta.url);
const reference = {x:0, z:0, rotation:0, elevation_mm:0};
const room = {width:4000, depth:4000, height:2800};

function installFixtureMeshes(factory) {
  for (const kind of ['sink', 'faucet']) {
    const meta = JSON.parse(fs.readFileSync(new URL(kind+'-tripo.json', appliances)));
    const buffer = fs.readFileSync(new URL(meta.buffer, appliances));
    const geometry = readApplianceGeometry(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset+buffer.byteLength),meta);
    const material = new THREE.MeshStandardMaterial({roughness:.31,metalness:.78});
    factory.applianceAssets.entries.set(kind,{...meta,geometry,material,ghost:material,textures:[],ready:true});
  }
}

function addWorktop(group, factory, spec, bottom, sink) {
  const height = spec.height+footHeight(spec);
  const rear = bottom.z-bottom.depth/2-50, front = rear+600, half = spec.width/2;
  const points = [[-half,rear],[half,rear],[half,front],[-half,front]];
  const surface = {points, radii:[.35,.65,4,.65]};
  if (sink) {
    const fixture = defaultFixture('sink');
    const z = front-fixture.front_offset-fixture.depth/2;
    surface.holes = [roundedOutline(fixture.width-20,fixture.depth-20,12,0,z)];
    installFixtureMeshes(factory);
    group.add(buildWorktopFixture({...fixture, x:0,y:height+38,z,rotation:0},factory.applianceAssets));
  }
  const top = new THREE.Mesh(countertopGeometry(surface,38),factory.material('counter',null));
  top.position.y = height/1000;
  top.userData.role = 'counter';
  group.add(top);
}

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
      objects.push({geometry:indices.get(id),role:child.userData.artRole??role,
        matrix:child.matrixWorld.toArray(),color:material.color.toArray(),roughness:material.roughness??.65,
        metalness:material.metalness??0});
    }
  });
  fs.writeFileSync(path.join(directory,file+'.json'),JSON.stringify({...options,geometries,objects}));
}

for (const model of kitchenModels) {
  const spec=kitchenSpec(kitchenFields(model.id)), built=buildCarcass(spec,{idPrefix:model.id});
  const metadata={group_id:model.id,spec:built.spec,position:reference};
  const items=placeCarcass(built,reference).map(it=>({...it,assistant_carcass:metadata}));
  const factory=new MeshFactory({room,items,state:{items,room},material:()=>null,template:()=>null},()=>{});
  const root=new THREE.Group(), entries=new Map();
  for (const it of items) {
    const part=factory.build(it);
    factory.position(part,it);
    if (it.item_id===model.id+':plinth') part.traverse(mesh=>{
      if(mesh.userData.role==='body')mesh.userData.artRole='plinth';
    });
    root.add(part);entries.set(it.item_id,{group:part});
  }
  if (isBase(model.id)) addWorktop(root,factory,spec,items.find(i=>i.item_id.endsWith(':bottom')),model.id==='base-sink');
  // Ajar solid doors reveal their shelf and construction. A Z1 front shows the glass shelves through the glass itself.
  if (!model.id.endsWith('vitrine')) {
    const motion=new WardrobeMotion();
    motion.show(model.id);motion.defaultDegrees=model.id==='base-sink'?58:49;
    motion.step(0,true);motion.pose(entries,items);
  }
  writeScene(model.photo,root,{wall:!isBase(model.id)});
  factory.dispose();
}

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
