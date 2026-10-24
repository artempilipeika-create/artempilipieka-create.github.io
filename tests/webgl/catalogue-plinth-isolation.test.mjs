import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {MeshFactory,CataloguePreviews} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {PRODUCTION_MODELS,normalizeKitchen} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';

const room={width:6000,depth:4000,height:2700},id='bazis.0211e4f77fc4',p=PRODUCTION_MODELS[id];
const cabinet=patch=>normalizeKitchen({item_id:'card',name:'Шкаф',module_type:'base_cabinet',bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,width:600,height:820,depth:510,body_height:720,base_height:100,base:'legs',layout:'doors',drawers:0,handles:'handles',x:0,z:0,rotation:0,...patch});
const auto={id:'project-plinth',automatic:true,members:[],shape:'straight',excluded_members:[]};

test('Actual thumbnail renderer keeps the plinth under its own cabinet regardless of project layout',()=>{
 for(const rotation of [0,90,180,270]){
  const state={room,items:[cabinet({item_id:'project-a',x:4500,z:2800,rotation}),cabinet({item_id:'project-b',x:5100,z:2800,rotation})],plinths:[auto]};
  const before=JSON.stringify(state),adapter={room,state,material:()=>null,template:()=>({production:p}),createDraft:()=>cabinet({x:1500,z:1000,rotation})};
  const factory=new MeshFactory(adapter,()=>{}),dress=factory.dress.bind(factory);let inspected=false;
  factory.dress=(items,previewState)=>{
   assert.notEqual(previewState,state);assert.equal(previewState.items.length,1);assert.equal(previewState.items[0],items[0]);
   const g=dress(items,previewState),plinths=[];g.traverse(m=>{if(m.userData.productionPart==='plinth')plinths.push(m);});
   assert.ok(plinths.length);g.updateMatrixWorld(true);
   for(const m of plinths){const b=new THREE.Box3().setFromObject(m);assert.ok(b.min.x>=-.301&&b.max.x<=.301);assert.ok(b.min.y>=-.001&&b.max.y<=.101);assert.ok(b.min.z>-.5&&b.max.z<.5);}
   assert.ok(g.children.every(g=>!(g.userData.members||[]).some(id=>id.startsWith('project-'))));inspected=true;return g;
  };
  const preview=Object.create(CataloguePreviews.prototype);
  Object.assign(preview,{width:480,height:352,pixels:new Uint8Array(480*352*4),target:{},scene:new THREE.Scene(),floor:new THREE.Mesh(),contact:new THREE.Mesh(),key:new THREE.DirectionalLight(),owner:{adapter,factory,invalidate(){},renderer:{shadowMap:{},getRenderTarget(){},setRenderTarget(){},render(){},readRenderTargetPixels(){}}}});
  preview.paint({dataset:{},getContext:()=>null},{bazis:id});
  assert.ok(inspected);assert.equal(JSON.stringify(state),before);factory.dispose();preview.key.shadow.dispose();
 }
});

test('Room renderer continues using the actual project plinth settings',()=>{
 const it=cabinet({x:2300,z:1400}),state={room,items:[it],plinths:[auto]},factory=new MeshFactory({room,state,material:()=>null,template:()=>({production:p})},()=>{});
 const g=factory.dress(state.items),plinths=[];g.traverse(m=>{if(m.userData.productionPart==='plinth')plinths.push(m);});
 assert.ok(plinths.length);g.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(plinths[0]);assert.ok(b.min.x>1);factory.release(g);factory.dispose();
});
