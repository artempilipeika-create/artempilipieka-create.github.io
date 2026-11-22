import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {buildFittingMeshes} from '../../backend/v2/cabinet_assets/planner/wardrobe-fitting-mesh.mjs';
import {defaultFitting,fittingCatalogue,nativeFittings,planFittings} from '../../backend/v2/cabinet_assets/planner/wardrobe-fittings.mjs';

const cell={section:0,level:0},position={x:800,z:600,elevation_mm:0,rotation:90};
const fields=(width=600)=>({width,height:2200,depth:580,thickness:18,sections:1,sectionShelves:[0],back:true,clearLayout:true});
test('every AKS variant has a distinct source, a supplier photo and a usable installation or door setup',()=>{
 const records=Object.entries(fittingCatalogue);
 assert.equal(records.length,49);assert.equal(new Set(records.map(([,p])=>p.sha)).size,49);
 for(const [key,p] of records){
   const asset=new URL('../../backend/v2/cabinet_assets/planner/wardrobe-fitting-photos/'+p.photo+'.webp',import.meta.url);
   assert.equal(fs.readFileSync(asset).subarray(8,12).toString(),'WEBP');
   assert.ok(p.photoSource.startsWith('https://'));
   if(p.mount==='door'){assert.ok(p.manual);continue;}
   const width=p.span?Math.min(p.span[1],Math.max(564,p.span[0]+12))+36:Math.ceil(p.bounds[1][0]-p.bounds[0][0])+400;
   const f=fields(width),chosen=defaultFitting(key,cell);f.fittings=[chosen];
   const spec=JSON.parse(JSON.stringify(wardrobeSpec(f))),built=buildCarcass(spec,{idPrefix:'qa'});
   const items=placeCarcass(built,position).map(it=>({...it,assistant_carcass:{group_id:'qa',spec,position}}));
   const row=nativeFittings(items)[0];assert.equal(row.fitting_id,chosen.id);assert.equal(row.article,p.article);
   assert.equal(row.source_sha256,(p.installation??p).sha);assert.equal(row.rotation,90);
   assert.ok(items.some(i=>i.item_id===row.host_blank_id));assert.ok(items.some(i=>i.item_id===row.joined_panel_id));
   const meshes=[],factory={adapter:{items},acquire:(key,get)=>get(),mesh:(g,role,geo,k,x,y,z)=>{geo.computeBoundingBox();assert.ok(!geo.boundingBox.isEmpty());assert.ok([x,y,z,...geo.boundingBox.min.toArray(),...geo.boundingBox.max.toArray()].every(Number.isFinite));meshes.push(geo);return {userData:{}};}};
   buildFittingMeshes(factory,{},items.find(it=>it.item_id==='qa:top'),false);assert.ok(meshes.length,key);
 }
});
test('pantograph opening limits, solid horizontal mount and independent heights',()=>{
 const raw=fields(),f=defaultFitting('123793',cell);raw.width=556;raw.fittings=[f];
 assert.equal(planFittings(wardrobeSpec(raw))[0].width,520);
 raw.width=706;assert.equal(planFittings(wardrobeSpec(raw))[0].width,670);
 raw.width=707;assert.throws(()=>planFittings(wardrobeSpec(raw)),/520–670/);
 raw.width=600;raw.fittings=[defaultFitting('113950',cell)];raw.sectionShelves=[1];raw.shelfChoices=[['8/95388']];
 assert.throws(()=>planFittings(wardrobeSpec(raw)),/полка из плиты|стекл|полк/i);
 raw.sectionShelves=[0];delete raw.shelfChoices;raw.fittings=[defaultFitting('115597',cell),{...defaultFitting('115597',cell),offset:270}];
 const installed=planFittings(wardrobeSpec(raw));assert.equal(installed[1].y-installed[0].y,200);
 raw.fittings[1].offset=70;assert.throws(()=>planFittings(wardrobeSpec(raw)),/пересекаются/);
});
