// Build each questionnaire illustration from the same panels and fixtures as the interactive editor.
import fs from 'node:fs';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {buildCarcass, placeCarcass} from '../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {isBase, kitchenFields, kitchenModels, kitchenSpec} from '../backend/v2/cabinet_assets/planner/ai-kitchen.mjs';
import {MeshFactory} from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {footHeight} from '../backend/v2/cabinet_assets/planner/plinth-options.mjs';
import {WardrobeMotion} from '../backend/v2/cabinet_assets/planner/wardrobe-motion.mjs';
import {readApplianceGeometry} from '../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {defaultFixture, roundedOutline} from '../backend/v2/cabinet_assets/planner/worktop-fixtures.mjs';
import {buildWorktopFixture} from '../backend/v2/cabinet_assets/planner/worktop-fixture-mesh.mjs';
import {countertopGeometry} from '../backend/v2/cabinet_assets/planner/countertop-visuals.mjs';

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

function kitchenCard(model, shelves, sink, filling, visit) {
  const fields=kitchenFields(model.id);
  fields.shelves=shelves;
  const spec=kitchenSpec(fields), built=buildCarcass(spec,{idPrefix:model.id});
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
    if (it.item_id.includes('shelf')) part.traverse(mesh=>{
      if(mesh.userData.role==='glass')mesh.userData.artRole='glassShelf';
    });
    root.add(part);entries.set(it.item_id,{group:part});
  }
  if (isBase(model.id)) addWorktop(root,factory,spec,items.find(i=>i.item_id.endsWith(':bottom')),sink);
  // Ajar solid doors reveal their shelf and construction. A Z1 front shows the glass shelves through the glass itself.
  if (filling || !model.id.endsWith('vitrine')) {
    const motion=new WardrobeMotion();
    motion.show(model.id);motion.defaultDegrees=filling?78:model.id==='base-sink'?58:49;
    motion.step(0,true);motion.pose(entries,items);
  }
  visit(root,{wall:!isBase(model.id), sink});
  factory.dispose();
}

export function visitKitchenCards(visit, includeFillings=false) {
  for (const model of kitchenModels) {
    const sink = model.id==='base-sink';
    kitchenCard(model,model.shelves,sink,false,(root,options)=>visit('module-card-images',model.photo,root,options));
    if (!includeFillings) continue;
    if (sink) {
      for(const installed of [true,false]) kitchenCard(model,0,installed,true,(root,options)=>
        visit('kitchen-option-images',model.photo+(installed?'-installed':'-empty'),root,options));
    } else {
      for(const count of [0,1,2,3]) kitchenCard(model,count,false,true,(root,options)=>
        visit('kitchen-option-images',model.photo+'-shelves-'+count,root,options));
    }
  }
}
