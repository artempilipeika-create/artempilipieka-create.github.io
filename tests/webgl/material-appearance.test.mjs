import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {materialAppearance,materialVisual,physicalPanelUV} from '../../backend/v2/cabinet_assets/planner/material-visuals.mjs';
import {MeshFactory,panelGeometry} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {PILOT_PRODUCTION,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const wood={variant_id:'wood',article:'Exact decor',material_id:'original',visual:{texture_url:'/wood.jpg',texture_size_mm:[1300,2800],rotation_deg:0,grain_direction:'length',roughness:.85,scale_confirmed:false}};
test('Display scale preserves the exact image, aspect ratio, source metadata and unconfirmed scale',()=>{
  const before=structuredClone(wood),v=materialVisual(wood,{scale:1.5,rotation:90,finish:'satin'});
  assert.deepEqual(v.size,[1950,4200]);assert.equal(v.rotation,90);assert.equal(v.url,'/wood.jpg');assert.equal(v.roughness,.48);assert.deepEqual(wood,before);
  assert.deepEqual(materialAppearance({scale:Infinity,rotation:45,finish:'chrome'}),{scale:1,rotation:0,finish:'auto'});
  assert.equal(materialAppearance({scale:900}).scale,4);assert.equal(materialAppearance({scale:.01}).scale,.25);
  assert.equal(materialVisual({name:'Oak',visual:{}},{finish:'gloss'}).url,null);
  assert.equal(materialVisual({visual:{preview_url:'/sample.jpg',visual_status:'USER_PREVIEW',map_to_surface:false,render_color:'#eeeeee'}},{scale:4}).url,null);
});
test('Rounded facade keeps every broad-face vertex in the same physical UV plane',()=>{
  const g=panelGeometry(597,717,18,.85),p=g.attributes.position;physicalPanelUV(g,{x:597,y:717,z:18},'y');
  const uv=g.attributes.uv;
  for(let i=0;i<p.count;i++)if(g.userData.uvFaceAxes[i]==='z'){
    assert.ok(Math.abs(uv.getX(i)-(p.getX(i)+.597/2))<1e-7);
    assert.ok(Math.abs(uv.getY(i)-(p.getY(i)+.717/2))<1e-7);
  }
  assert.deepEqual(g.userData.envelopeMM,[597,717,18]);g.dispose();
});
test('Texture rotation preserves physical proportions at 90 degrees and scale is independent',()=>{
  const original=THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
  const state={displaySettings:{materialAppearance:{wood:{rotation:90,scale:2,finish:'auto'}}}};
  const f=new MeshFactory({state,material:()=>wood},()=>{});
  try{
    const m=f.material('front','wood'),tx=m.map;tx.updateMatrix();
    const origin=new THREE.Vector2(0,0).applyMatrix3(tx.matrix);
    const x=new THREE.Vector2(5.6,0).applyMatrix3(tx.matrix).sub(origin),y=new THREE.Vector2(0,2.6).applyMatrix3(tx.matrix).sub(origin);
    assert.ok(Math.abs(Math.abs(x.y)-1)<1e-6);assert.ok(Math.abs(Math.abs(y.x)-1)<1e-6);
    assert.equal(tx.colorSpace,THREE.SRGBColorSpace);assert.equal(m.userData.variantId,'wood');
  }finally{f.dispose();THREE.TextureLoader.prototype.load=original;}
});
test('Matte/gloss updates actual shared material while production geometry and identity stay unchanged',()=>{
  const template={production:Object.values(PILOT_PRODUCTION)[0]},data={...wood,visual:{render_color:'#b49570',roughness:.85}};
  const state={displaySettings:{materialAppearance:{}}};
  const it={item_id:'a',module_type:'base_cabinet',width:600,height:820,body_height:720,base_height:100,depth:510,x:0,z:0,rotation:0,base:'plinth',handles:'handles',front_variant_id:'wood',body_variant_id:'wood',shelves:template.production.shelves};
  const f=new MeshFactory({state,room:{width:3600,depth:3000,height:2700},material:()=>data,template:()=>template},()=>{});
  const group=f.build(it),before=productionParts(it,template,()=>data),sig=f.signature(it),ids=[];group.traverse(m=>{if(m.isMesh)ids.push(m.geometry.uuid);});
  state.displaySettings.materialAppearance.wood={finish:'gloss'};f.updateAppearance(group,it);
  const glossy=f.material('front','wood');assert.equal(glossy.isMeshPhysicalMaterial,true);assert.equal(glossy.roughness,.18);assert.equal(glossy.metalness,0);assert.ok(glossy.clearcoat>.5);
  group.traverse(m=>{if(m.userData.part?.role==='front')assert.equal(m.material,glossy);});
  state.displaySettings.materialAppearance.wood={finish:'matte'};f.updateAppearance(group,it);
  assert.equal(f.material('front','wood').roughness,.86);assert.equal(f.material('front','wood').metalness,0);
  assert.equal(f.signature(it),sig);assert.deepEqual(productionParts(it,template,()=>data),before);
  const after=[];group.traverse(m=>{if(m.isMesh)after.push(m.geometry.uuid);});assert.deepEqual(after,ids);
  assert.ok(f.material('hinge',null).metalness>.5);assert.equal(f.material('glass',null).ior,1.5);
  f.release(group);f.dispose();
});
test('Appearance undo/redo and JSON restore do not edit production item or material identity',()=>{
  let doc={name:'Materials',scene:{room:{width:3600},items:[{item_id:'a',front_variant_id:'wood'}],materialIdentities:{wood:{materialId:'original',article:'Exact decor'}},displaySettings:{}}};
  const before=structuredClone(doc),h=new History({snapshot:()=>structuredClone(doc),restore:v=>{doc=structuredClone(v);}});
  h.run('Material',()=>{doc.scene.displaySettings.materialAppearance={wood:{scale:1.4,rotation:90,finish:'satin'}};});
  const changed=JSON.parse(JSON.stringify(doc));h.undo();assert.deepEqual(doc,before);h.redo();assert.deepEqual(doc,changed);
  assert.deepEqual(doc.scene.items,before.scene.items);assert.deepEqual(doc.scene.materialIdentities,before.scene.materialIdentities);
});
