import test from 'node:test';
import assert from 'node:assert/strict';
import {executionPreviewItem,executionMaterialKey,ExecutionPreviews} from '../../backend/v2/cabinet_assets/planner/execution-previews.mjs';
import {PRODUCTION_MODELS,TALL_GOLA_VARIANTS} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {materialVisual} from '../../backend/v2/cabinet_assets/planner/material-visuals.mjs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';

const id=TALL_GOLA_VARIANTS.find(v=>v.layout==='storage').id,p=PRODUCTION_MODELS[id];
const item={item_id:'QA',bazis_id:id,bazis_file:'original.fr3d',bazis_sha256:p.source_sha256,module_type:'tall_cabinet',width:600,height:2000,depth:600,body_height:1900,base_height:100,base:'plinth',layout:'doors',handles:'handleless',x:120,z:80,rotation:90,body_variant_id:'white',front_variant_id:'wood',plinthMaterialId:'plinth',part_materials:{'side-L':'special'},shelves:[]};
function adapter(){
 const materials=new Map(['white','wood','plinth','special'].map(id=>[id,{variant_id:id,thickness:18,visual:{texture_url:'/account/planner/materials/'+id+'.jpg',texture_size_mm:[1000,2000]}}]));
 return {materials,state:{displaySettings:{materialAppearance:{wood:{scale:2,rotation:90,finish:'gloss'}}}},room:{width:4000,depth:3000,height:2800},template:()=>({production:p}),material:id=>materials.get(id)};
}
test('hero keeps exact material assignments, option drafts stay neutral, original is untouched',()=>{
 const original=structuredClone(item);original.shelves=[{shelf_id:'custom',material_variant_id:'shelf'}];
 const hero=executionPreviewItem(original,{sceneDisplayMode:'normal'}),option=executionPreviewItem(original,{view:'closed'});
 for(const key of ['body_variant_id','front_variant_id','plinthMaterialId','part_materials','shelves','bazis_file','bazis_sha256'])assert.deepEqual(hero[key],original[key]);
 hero.part_materials['side-L']='changed';assert.equal(original.part_materials['side-L'],'special');
 assert.equal(option.front_variant_id,null);assert.equal(option.shelves[0].material_variant_id,null);assert.deepEqual(option.part_materials,{});
});
test('hero image key changes when a material, texture metadata or saved appearance changes',()=>{
 const a=adapter(),key=executionMaterialKey(item,a);
 assert.notEqual(executionMaterialKey({...item,front_variant_id:'white'},a),key);
 assert.notEqual(executionMaterialKey({...item,part_materials:{}},a),key);
 a.state.displaySettings.materialAppearance.wood.scale=1;assert.notEqual(executionMaterialKey(item,a),key);
 const scaled=executionMaterialKey(item,a);a.materials.get('wood').visual.texture_url='/updated.jpg';assert.notEqual(executionMaterialKey(item,a),scaled);
 const loaded=executionMaterialKey(item,a);a.materials.delete('wood');assert.notEqual(executionMaterialKey(item,a),loaded);
});
test('hero meshes use the same real images, scale, rotation and finish as the main scene',()=>{
 const load=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 const a=adapter(),f=new MeshFactory(a,()=>{}),hero=executionPreviewItem(item,{sceneDisplayMode:'normal'});
 try{
  const scene=f.build(item),preview=f.build(hero);f.updateAppearance(preview,hero,'normal');
  const materials=g=>{const result={};g.traverse(m=>{if(m.userData.part)result[m.userData.part.key]=m.material;});return result;};
  const before=materials(scene),after=materials(preview);
  for(const key of Object.keys(before))assert.equal(after[key],before[key],key);
  const wood=f.material('front','wood');assert.equal(wood.map.rotation,Math.PI/2);assert.deepEqual(wood.map.repeat.toArray(),[.5,.25]);assert.equal(wood.roughness,.18);
  assert.equal(materialVisual({visual:{preview_url:'/sample.jpg',render_color:'#e1d7cb',map_to_surface:false}}).url,null);
  f.release(scene);f.release(preview);
 }finally{f.dispose();THREE.TextureLoader.prototype.load=load;}
});
test('asynchronously loaded texture invalidates preview pixels and cache',()=>{
 let scheduled=0;const canvas={dataset:{previewReady:'true'}},view={closed:false,cache:new Map([['old','pixels']]),jobs:new Map([[canvas,{}]]),schedule(){scheduled++;}};
 ExecutionPreviews.prototype.refreshImages.call(view);
 assert.equal(view.cache.size,0);assert.equal(canvas.dataset.previewReady,undefined);assert.equal(scheduled,1);
 view.closed=true;ExecutionPreviews.prototype.refreshImages.call(view);assert.equal(scheduled,1);
});
