import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {panelSegments,surfaceOffset,finishError,subtractRects,segmentOpenings,finishSchedule} from '../../backend/v2/cabinet_assets/planner/wall-finishes.mjs';
import {WallFinishMesh} from '../../backend/v2/cabinet_assets/planner/wall-finish-mesh.mjs';
import {PlannerScene} from '../../backend/v2/cabinet_assets/planner/scene.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {WallFinishUI} from '../../backend/v2/cabinet_assets/planner/wall-finish-ui.mjs';
import {normalizeKitchen,PRODUCTION_MODELS} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const room={width:3600,depth:3000,height:2700,features:[]};
const panel=(p={})=>({id:'p',kind:'skinali',shape:'straight',wall:'a',width:2000,height:600,depth:400,thickness:6,offset:0,elevation:858,color:'#e7e3da',material_id:null,tile_width:600,tile_height:300,grout:2,grout_color:'#bcb8af',...p});
const light=(p={})=>({id:'l',wall:'a',offset:0,width:2000,elevation:1444,brightness:80,temperature:3000,finish:'aluminium',enabled:true,...p});
const setup=(panels,lights=[])=>{const state={room,wallPanels:panels,wallLights:lights};const scene={scene:new THREE.Scene(),adapter:{room,state,material:()=>null},factory:{material:()=>{throw Error('Unexpected material lookup');}},renderer:{shadowMap:{}},mode:'3d',camera:{position:{x:0,y:2,z:3}}};return {state,scene,mesh:new WallFinishMesh(scene)};};
test('native-shaped returns butt against main 6 mm panel without double thickness',()=>{
 const s=panelSegments(panel({shape:'u'}),room);assert.equal(s.length,3);assert.deepEqual(s.map(p=>p.length),[2000,394,394]);
 assert.deepEqual(s.map(p=>[p.x,p.z]),[[-1800,-1500],[-1800,-1494],[200,-1494]]);assert.equal(s[1].n.x,1);assert.equal(s[2].n.x,-1);
 assert.deepEqual(panelSegments(panel({shape:'u',kind:'ldsp',thickness:18,depth:600}),room).map(p=>p.length),[2000,582,582]);
});
for(const wall of ['a','b','c','d'])test(`panel + socket mounting follows wall ${wall}`,()=>{
 const p=panel({wall,offset:200}),s=panelSegments(p,room)[0],point={x:s.x+s.u.x*1000,z:s.z+s.u.z*1000};
 assert.equal(surfaceOffset([s],point,s.n,86,1000,86),6);assert.equal(surfaceOffset([s],point,s.n,86,300,86),0);
 const {mesh}=setup([p]);mesh.sync();mesh.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh.root);const size=box.getSize(new THREE.Vector3());assert.ok(Math.abs(size.y-.6)<1e-7);assert.ok(Math.abs(size.x*size.z-.012)<1e-7);mesh.dispose();
});
test('overlapping openings clipped once; edge opening and second wall remain correct',()=>{
 const cuts=[{x:100,y:100,w:500,h:300},{x:400,y:100,w:400,h:300}];const parts=subtractRects({x:0,y:0,w:1000,h:600},cuts);assert.equal(parts.reduce((sum,p)=>sum+p.w*p.h,0),390000);
 const r={...room,features:[{kind:'window',wall:'a',offset:50,elevation:900,width:500,height:600},{kind:'door',wall:'c',offset:0,elevation:0,width:800,height:2100}]};assert.equal(segmentOpenings(panelSegments(panel(),r)[0],r).length,1);
});
test('bounded placement rejects overflow and prevents substituted native thickness',()=>{
 assert.ok(finishError(panel({width:6000}),room));assert.ok(finishError(panel({thickness:18}),room));assert.ok(finishError(panel({kind:'tile',thickness:10,grout:0}),room));assert.ok(finishError(light({brightness:Infinity}),room,true));assert.equal(finishError(panel({shape:'u',depth:3000}),room),'');
});
test('profile is mounted over finish, switches real lights off and releases resources on rebuild',()=>{
 const {mesh,state,scene}=setup([panel({kind:'ldsp',thickness:18})],[light()]);mesh.sync();
 const lights=[];mesh.root.traverse(o=>{if(o.isLight)lights.push(o);});assert.equal(lights.length,2);assert.ok(lights.every(l=>l.intensity>0&&!l.castShadow));
 let disposed=0;for(const g of mesh.geometries)g.addEventListener('dispose',()=>disposed++);const oldSize=mesh.geometries.size;
 const bar=mesh.root.children.at(-1).children[0];assert.equal(Math.round(bar.position.z*1000),33);
 state.wallLights[0].enabled=false;mesh.sync();assert.equal(disposed,oldSize);mesh.root.traverse(o=>{if(o.isLight)assert.equal(o.intensity,0);});
 state.wallLights[0].enabled=true;mesh.sync();scene.mode='top';mesh.visibility();mesh.root.traverse(o=>{if(o.isLight)assert.equal(o.intensity,0);});mesh.dispose();assert.equal(mesh.root.parent,null);assert.equal(mesh.materials.size,0);
});
test('tile layout uses bounded instancing, and schedule keeps production exclusion explicit',()=>{
 const p=panel({kind:'tile',thickness:10}),{mesh,state}=setup([p]);mesh.sync();const tiles=[];mesh.root.traverse(o=>{if(o.isInstancedMesh)tiles.push(o);});assert.equal(tiles.length,1);assert.equal(tiles[0].count,8);
 const schedule=finishSchedule(state);assert.equal(schedule.panels[0].native_import,false);assert.equal(schedule.panels[0].source,null);assert.match(schedule.note,/Не включены в распил/);mesh.dispose();
});
test('save snapshots undo and redo panel dimensions and wall light state',()=>{
 let current={name:'Kitchen',scene:{room,items:[],wallPanels:[panel()],wallLights:[light()]}};
 const h=new History({snapshot:()=>current,restore:s=>{current=structuredClone(s);}});h.run('finish',()=>{current.scene.wallPanels[0].shape='u';current.scene.wallLights[0].enabled=false;});h.undo();assert.equal(current.scene.wallPanels[0].shape,'straight');assert.equal(current.scene.wallLights[0].enabled,true);h.redo();assert.equal(current.scene.wallPanels[0].shape,'u');assert.equal(current.scene.wallLights[0].enabled,false);
});
for(const [rotation,wall]of [[0,'a'],[90,'b'],[180,'c'],[270,'d']])test(`selected row auto placement uses correct wall at rotation ${rotation}`,()=>{
 const [donorId,donor]=Object.entries(PRODUCTION_MODELS).find(([id,p])=>p.tier==='base');const it=normalizeKitchen({bazis_id:donorId,bazis_sha256:donor.source_sha256,item_id:'cab',module_type:'base_cabinet',template_id:'base',width:600,height:820,depth:510,x:0,z:0,rotation},room),state={items:[it],room};
 const p=WallFinishUI.prototype.placement.call({app:{adapter:{selected:it,items:[it],state,room}}});assert.equal(p.wall,wall);assert.equal(p.width,600);assert.equal(p.elevation,858);
});

test('kitchen camera envelope includes tall backsplash and profile without altering module selection',()=>{
 const {mesh,scene}=setup([panel()],[light()]);mesh.sync();
 const cabinet=new THREE.Mesh(new THREE.BoxGeometry(.6,.858,.51),new THREE.MeshBasicMaterial());cabinet.position.y=.429;
 scene.adapter.items=[{item_id:'cab'}];scene.adapter.selected={item_id:'cab'};scene.entries=new Map([['cab',{group:cabinet}]]);scene.wallFinishes=mesh;
 const box=PlannerScene.prototype.cameraBox.call(scene,'kitchen'),selected=PlannerScene.prototype.cameraBox.call(scene,'selected');assert.ok(box.max.y>=1.458-1e-6);assert.ok(selected.max.y<.86);mesh.dispose();cabinet.geometry.dispose();cabinet.material.dispose();
});
