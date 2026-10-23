import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {ApplianceAssets,applianceLayout,readApplianceGeometry} from '../../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {APPLIANCE_TALL_VARIANTS as variants,PRODUCTION_MODELS as models,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const item=v=>({item_id:'appliance-test',bazis_id:v.id,module_type:'tall_cabinet',width:600,height:v.native_height,depth:600,body_height:v.native_height-100,base_height:100,base:'plinth',worktop_thickness:0,x:0,z:0,rotation:0});
const resource=()=>({ready:true,textures:[],geometry:new THREE.BoxGeometry(1,1,1),material:new THREE.MeshPhysicalMaterial(),ghost:new THREE.MeshPhysicalMaterial({transparent:true,opacity:.36})});
const meshes=g=>{const result=[];g.traverse(m=>{if(m.userData.sharedApplianceAsset)result.push(m);});return result;};
test('Presentation envelopes preserve all 16 production variants and the 1 mm stacked reveal',()=>{
 for(const v of variants){const it=item(v),source=models[v.id],before=JSON.stringify(productionParts(it,{production:source})),layout=applianceLayout(it,source);
  assert.equal(layout.length,v.microwave?2:1);assert.ok(layout.every(l=>l.width===595&&l.front===342));
  if(v.microwave){const [oven,micro]=layout;assert.equal(micro.y-micro.height/2-(oven.y+oven.height/2),1);}
  assert.equal(JSON.stringify(productionParts(it,{production:source})),before);
 }
});
test('Shared meshes survive appearance updates, obey inspection modes, and release with the factory',()=>{
 const v=variants.find(v=>v.microwave),it=item(v),f=new MeshFactory({room:{width:4200,depth:3200,height:2700},material:()=>null,template:()=>({production:models[v.id]})},()=>{});
 for(const kind of ['oven','microwave'])f.applianceAssets.entries.set(kind,resource());
 const a=f.build(it),b=f.build({...it,item_id:'other'}),am=meshes(a),bm=meshes(b);assert.equal(am.length,2);
 assert.equal(am[0].geometry,bm[0].geometry);assert.equal(am[0].material,bm[0].material);
 const material=am[0].material;f.updateAppearance(a,it,'inspection');assert.equal(am[0].material,material);assert.ok(am.every(m=>!m.visible));
 f.updateAppearance(a,it,'normal');assert.ok(am.every(m=>m.visible&&m.parent.visible));
 assert.ok(am.every(m=>m.parent.children[0].visible===false));
 f.release(a);assert.equal(a.userData.released,true);assert.ok(meshes(b).every(m=>f.ownsGeometry(m.geometry)));
 f.release(b);assert.ok([...f.pool.values()].every(e=>e.refs===0));f.dispose();
});
test('Late loads cannot attach to released previews; failures retain measured fallback',async()=>{
 const assets=new ApplianceAssets(()=>{}),entry=resource(),slot=new THREE.Group(),fallback=new THREE.Group();slot.add(fallback);
 let resolve;assets.load=()=>new Promise(r=>resolve=r);let current=true;
 assets.attach(slot,fallback,{kind:'oven',width:595,height:593,depth:550,y:1100,front:342},false,()=>current);current=false;resolve(entry);await Promise.resolve();assert.equal(slot.children.length,1);
 assets.load=()=>Promise.reject(Error('offline'));assets.attach(slot,fallback,{kind:'oven'},false,()=>true);await Promise.resolve();await Promise.resolve();assert.equal(fallback.visible,true);assert.equal(slot.children.length,1);assets.releaseEntry(entry);assets.dispose();
});
test('Normalized geometry rejects corrupt metadata, positions and indices before rendering',()=>{
 const buffer=new ArrayBuffer(108),meta={version:1,kind:'oven',byteLength:108,vertices:3,triangles:1,attributes:{position:{offset:0,count:3,size:3,type:'float32'},normal:{offset:36,count:3,size:3,type:'float32'},uv:{offset:72,count:3,size:2,type:'float32'},index:{offset:96,count:3,size:1,type:'uint32'}}};
 new Float32Array(buffer,0,9).set([-.5,0,0,.5,0,0,0,.5,0]);new Float32Array(buffer,36,9).set([0,0,1,0,0,1,0,0,1]);new Uint32Array(buffer,96,3).set([0,1,2]);
 const g=readApplianceGeometry(buffer,meta);assert.equal(g.index.count,3);g.dispose();
 assert.throws(()=>readApplianceGeometry(buffer.slice(0,-4),meta));new Uint32Array(buffer,96,1)[0]=3;assert.throws(()=>readApplianceGeometry(buffer,meta),/indices/);new Uint32Array(buffer,96,1)[0]=0;new Float32Array(buffer,0,1)[0]=.6;assert.throws(()=>readApplianceGeometry(buffer,meta),/bounds/);
});

test('Both real Tripo buffers retain finite normalized geometry, UVs, unit normals and the web budget',async()=>{
 const {readFileSync,statSync}=await import('node:fs');const base=new URL('../../backend/v2/cabinet_assets/planner/appliance-assets/',import.meta.url);
 for(const kind of ['oven','microwave']){
  const meta=JSON.parse(readFileSync(new URL(kind+'-tripo.json',base))),bytes=readFileSync(new URL(meta.buffer,base));
  const g=readApplianceGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta);
  assert.ok(meta.triangles<=26000&&meta.triangles>20000);assert.equal(meta.generator,'Tripo H3.1');assert.match(meta.sourceSha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(g.boundingBox.min.toArray(),[-.5,-.5,-.5]);assert.deepEqual(g.boundingBox.max.toArray(),[.5,.5,.5]);
  for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i).length()-1)<1e-4);
  assert.equal(g.attributes.uv.count,g.attributes.position.count);
  const total=bytes.length+Object.values(meta.textures).reduce((n,file)=>n+statSync(new URL(file,base)).size,0);assert.ok(total<1400000);
  if(kind==='oven'){assert.equal(meta.cleanBounds[0][0],-.335);assert.equal(meta.cleanBounds[1][0],.369);}
  g.dispose();
 }
});
