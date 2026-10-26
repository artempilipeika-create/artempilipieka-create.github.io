import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {executionArtwork} from '../../backend/v2/cabinet_assets/planner/execution-artwork.mjs';
const O=globalThis.MF_OPEN_TALL,G=globalThis.MF_CARGO;
const wall=O.variants.filter(v=>v.wall),waste=G.variants.filter(v=>v.waste);
const item=v=>C.normalizeKitchen({item_id:'qa',bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,module_type:v.wall?'wall_cabinet':'base_cabinet',width:v.wall?600:350,height:v.wall?720:820,depth:v.wall?317:510,base:v.wall?'wall':'legs',base_height:v.wall?0:100,layout:v.wall?'niche':'drawers',drawers:v.wall?0:1,x:0,z:0,rotation:0});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});

test('seven upper and two waste sources preserve identity, materials and their artwork',()=>{
 assert.equal(wall.length,7);assert.equal(waste.length,2);
 for(const from of wall)for(const to of wall){const it={...item(from),body_variant_id:'custom',part_materials:{'side-L':'custom'},upper_shelf_count:2},next=O.select(it,to,O.variants);assert.equal(next.bazis_id,to.id);assert.equal(next.body_variant_id,'custom');assert.equal(next.upper_shelf_count,2);assert.deepEqual(next.part_materials,it.part_materials);assert.equal(O.info(next).wall,true);const file=executionArtwork(next,'open-tall','lighting',to.lighting);assert.ok(file.endsWith(to.id.replace('bazis.','open-wall-')+'.webp'));}
 for(const from of waste)for(const to of waste){const it=item(from),next=G.select(it,to,G.variants);assert.equal(next.bazis_sha256,to.source_sha256);assert.equal(next.width,350);assert.match(executionArtwork(it,'cargo','execution',to.execution),new RegExp('waste-'+to.execution+'\\.webp$'));}
});

test('wall geometry matches source at native size and has no feet; waste bins stay out of cut list',()=>{
 for(const v of wall){const it={...item(v),height:2000,depth:600,upper_shelf_count:1},parts=C.productionParts(it,template(it));for(const p of parts){const s=v.panels.find(s=>s.key===p.key);for(const [a,k]of ['x','y','z'].entries()){assert.equal(p.size[k],s.size[a]);assert.equal(p.position[k],s.center[a]);}}
  const f=new MeshFactory({template,material:()=>null,room:{width:6000,depth:4000,height:3000}},()=>{}),m=f.build(item(v));let feet=0,fronts=0;m.traverse(n=>{if(n.userData.role==='leg')feet++;if(n.userData.role==='front')fronts++;});assert.equal(feet,0);assert.equal(fronts,0);f.dispose();
 }
 for(const v of waste){const it=item(v),f=new MeshFactory({template,material:()=>null,room:{width:6000,depth:4000,height:3000}},()=>{}),m=f.build(it);let bins=0;m.traverse(n=>{if(n.userData.wasteBin){bins++;assert.equal(n.userData.visualOnly,true);assert.ok(n.material.color.getHexString()!=='ffffff');}});assert.ok(bins>0);assert.equal(C.productionParts(it,template(it)).length,7);f.dispose();}
});

test('native import validates all nine sources and both source copies agree',()=>{
 const src=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');assert.equal(src,fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_9_4_MATERIAL_NAMES.js',import.meta.url),'utf8'));
 const c=vm.createContext({collectSourceFiles:()=>({files:[]}),canonicalBaseDonor:i=>i,canonicalUpperDonor:i=>i,resolveSourceFile:()=>'/exact.fr3d'});vm.runInContext(src.slice(src.indexOf('const CARGO_MIN_BODY'),src.indexOf('// Native API only. Node tests do not establish compatibility')),c);const prepare=vm.runInContext('prepareProject',c);
 for(const v of [...wall,...waste]){const i=item(v),it={source_sha256:v.source_sha256,source_file:v.source_file,target:{width:i.width,height:i.height,depth:i.depth}};assert.equal(prepare({items:[it]},'/sources').entries.length,1);assert.throws(()=>prepare({items:[{...it,target:{...it.target,width:601}}]},'/sources'));if(v.waste)assert.throws(()=>prepare({items:[{...it,target:{width:450,height:820,depth:510}}]},'/sources'),/525/);}
});
