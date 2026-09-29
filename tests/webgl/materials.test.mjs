import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {materialVisual} from '../../backend/v2/cabinet_assets/planner/material-visuals.mjs';
import {PILOT_PRODUCTION,productionParts,bounds,placementError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const room={width:6200,depth:3600,height:2700};
const item={item_id:'module',module_type:'base_cabinet',width:600,height:820,body_height:720,base_height:100,depth:510,x:0,z:0,rotation:0,base:'plinth',handles:'handles',layout:'doors',drawers:0};
const meshes=g=>{const out=[];g.traverse(m=>{if(m.isMesh)out.push(m)});return out;};
const visible=m=>{for(let p=m;p;p=p.parent)if(!p.visible)return false;return true;};
test('Visual data priority and neutral fallback do not guess a decor from its name',()=>{
 const visual={texture_url:'/decor.jpg',preview_url:'/preview.png',render_color:'#ffffff'};
 assert.equal(materialVisual({visual}).source,'texture');delete visual.texture_url;assert.equal(materialVisual({visual}).source,'preview');
 delete visual.preview_url;assert.equal(materialVisual({visual}).source,'color');
 assert.equal(materialVisual({name:'EGGER brown oak black white'}).source,'fallback');
 assert.equal(materialVisual({visual:{texture_url:'https://other.example/decor.jpg'}}).url,null);
 assert.equal(materialVisual({visual:{texture_url:'/../secret.jpg'}}).url,null);
});
for(const [id,production]of Object.entries(PILOT_PRODUCTION))test(production.label+' display modes preserve parts, dimensions and collisions with open/closed doors',()=>{
 const template={production},f=new MeshFactory({room,template:()=>template,material:()=>null},()=>{});
 for(const doors_open of [false,true]){
  const it={...item,bazis_id:id,doors_open,shelves:structuredClone(production.shelves)},before=JSON.stringify(it),parts=productionParts(it,template),g=f.build(it),all=meshes(g);
  const geo=all.map(m=>m.geometry.uuid),box=bounds(it,room);g.updateMatrixWorld(true);
  for(const mode of ['inspection','facadesHidden','normal']){
   f.updateAppearance(g,it,mode);
   assert.equal(JSON.stringify(it),before);assert.deepEqual(productionParts(it,template),parts);assert.deepEqual(bounds(it,room),box);
   assert.equal(placementError(it,[{...it,item_id:'adjacent',x:600}],room),'');
   assert.match(placementError(it,[{...it,item_id:'overlap',x:590}],room),/Пересечение/);
   assert.deepEqual(all.map(m=>m.geometry.uuid),geo);
   for(const m of all){const p=m.userData.part;if(!p)continue;
    const shell=p.role==='front'||p.key.startsWith('side-');assert.equal(m.material.transparent,mode==='inspection'&&shell);
    assert.equal(m.material.depthWrite,!(mode==='inspection'&&shell));assert.equal(visible(m),!(mode==='facadesHidden'&&p.role==='front'));
    assert.deepEqual(m.userData.part,parts.find(x=>x.key===p.key));
   }
   assert.ok(all.filter(m=>m.userData.frontAccessory).every(m=>visible(m)===(mode!=='facadesHidden')));
   if(mode==='facadesHidden'){
    const hits=new THREE.Raycaster(new THREE.Vector3(0,.28,1),new THREE.Vector3(0,0,-1)).intersectObject(g,true).filter(h=>visible(h.object));
    assert.equal(hits[0].object.userData.role,production.drawer_box?'drawer':'back');
   }
  }
  f.release(g);
 }
 f.dispose();
});
test('Body/front/back/part material identities update existing meshes and restore independently',()=>{
 const production=Object.values(PILOT_PRODUCTION)[0],template={production};
 const data=id=>({variant_id:id,material_id:'m-'+id,article:'article-'+id,name:id,manufacturer:'test',visual:{render_color:id==='white'?'#ffffff':'#555555'}});
 const f=new MeshFactory({room,template:()=>template,material:data},()=>{}),it={...item,shelves:production.shelves,body_variant_id:'white',front_variant_id:'dark',back_variant_id:'back',part_materials:{'rail-front':'rail'}},g=f.build(it),all=meshes(g),geometry=all.map(m=>m.geometry.uuid),signature=f.signature(it);
 const mats=()=>Object.fromEntries(all.filter(m=>m.userData.part).map(m=>[m.userData.part.key,m.material.userData.variantId]));
 assert.equal(mats()['back'],'back');assert.equal(mats()['rail-front'],'rail');assert.equal(mats()['door-1'],'dark');assert.equal(mats()['shelf-1'],'white');
 const before=mats();it.body_variant_id='gray';f.updateAppearance(g,it);assert.equal(mats()['shelf-1'],'gray');assert.equal(mats()['door-1'],'dark');
 assert.equal(f.signature(it),signature);assert.deepEqual(all.map(m=>m.geometry.uuid),geometry);
 it.body_variant_id='white';f.updateAppearance(g,it);assert.deepEqual(mats(),before);
 assert.equal(all.find(m=>m.userData.part?.key==='bottom').userData.part.material.article,'article-white');f.dispose();
});
test('Textures use sRGB, fixed physical scale, grain rotation, matt surfaces and bounded cache',()=>{
 const load=THREE.TextureLoader.prototype.load;THREE.TextureLoader.prototype.load=()=>new THREE.Texture();
 try{
  const production=Object.values(PILOT_PRODUCTION)[0],template={production};
  const f=new MeshFactory({room,template:()=>template,material:id=>({visual:{texture_url:'/decor-'+id+'.jpg',render_color:'#ffffff',texture_size_mm:[1300,2800],rotation_deg:10,grain_direction:'width'}})},()=>{});
  const it={...item,shelves:production.shelves,body_variant_id:'0'},g=f.build(it),m=meshes(g).find(m=>m.userData.part?.key==='side-L');
  assert.equal(m.material.map.colorSpace,THREE.SRGBColorSpace);assert.deepEqual(m.material.map.repeat.toArray(),[1000/1300,1000/2800]);assert.ok(Math.abs(m.material.map.rotation-100*Math.PI/180)<1e-10);
  assert.equal(m.material.metalness,0);assert.ok(m.material.roughness>=.8);assert.equal(m.material.color.getHexString(),'ffffff');
  const uv=m.geometry.attributes.uv;assert.ok(Math.max(...Array.from({length:uv.count},(_,i)=>uv.getY(i)))<.71);
  for(let i=1;i<=150;i++){it.body_variant_id=String(i);f.updateAppearance(g,it);f.pruneMaterials([g]);}
  assert.ok(f.materials.size<=64);assert.ok(f.textures.size<=16);assert.equal(m.material.userData.variantId,'150');assert.ok(m.material.map);
  f.dispose();assert.equal(f.materials.size,0);assert.equal(f.textures.size,0);
 }finally{THREE.TextureLoader.prototype.load=load;}
});
