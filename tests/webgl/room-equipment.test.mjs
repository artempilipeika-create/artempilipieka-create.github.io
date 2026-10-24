import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {EQUIPMENT,newEquipment} from '../../backend/v2/cabinet_assets/planner/room-equipment.mjs';
import {roomError,featureBox,wallPanels} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
import {roomObstacles,placementError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {attachRoomEquipment,equipmentFallback} from '../../backend/v2/cabinet_assets/planner/room-equipment-mesh.mjs';
import {ApplianceAssets} from '../../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const room=()=>({width:4200,depth:3200,height:2700,setup_complete:true,survey:null,features:[]});
const cabinet={item_id:'cabinet',module_type:'chest',name:'Шкаф',width:600,height:820,depth:510,x:0,z:0,rotation:0,base:'plinth',layout:'doors',drawers:0};
test('all five measured objects fit every wall, survive serialization and reject out-of-room dimensions',()=>{
  for(const kind of Object.keys(EQUIPMENT))for(const wall of 'abcd'){
    const r=room(),f={...newEquipment(r,kind,kind),wall};r.features=[f];assert.equal(roomError(r),'');
    assert.deepEqual(JSON.parse(JSON.stringify(r)).features,[f]);
    f.offset=12000;assert.match(roomError(r),/за длину/);f.offset=300;f.elevation=2700;assert.match(roomError(r),/выше потолка/);
  }
  const r={...room(),width:1500,depth:1500,height:2000};for(const kind of Object.keys(EQUIPMENT)){r.features=[newEquipment(r,kind,kind)];assert.equal(roomError(r),'');}
  assert.throws(()=>newEquipment(room(),'unknown','id'));
  const f=newEquipment(room(),'gas_cooker','c');assert.match(roomError({...room(),features:[{...f,elevation:1}]}),/на полу/);
  assert.match(roomError({...room(),features:[{...f,projection:0}]}),/глубину/);
});
test('window cuts only its selected wall; movable equipment never changes a wall opening',()=>{
  for(const wall of 'abcd'){
    const r=room(),f={...newEquipment(r,'window','w'),wall};r.features=[f];
    const length=['a','c'].includes(wall)?r.width:r.depth;
    assert.equal(wallPanels(r,wall).reduce((s,p)=>s+p.width*p.height,0),length*r.height-f.width*f.height);
    const before=wallPanels(r,wall);for(const kind of Object.keys(EQUIPMENT).filter(k=>k!=='window'))r.features.push({...newEquipment(r,kind,kind),wall});
    assert.deepEqual(wallPanels(r,wall),before);
  }
});
test('equipment blocks furniture at measured height on all walls while windows do not block a full volume',()=>{
  for(const kind of ['radiator','gas_cooker','gas_boiler','water_heater'])for(const wall of 'abcd'){
    const r=room(),f={...newEquipment(r,kind,kind),wall};r.features=[f];const b=featureBox(f,r),o=roomObstacles(r)[0];
    assert.deepEqual([o.minX,o.maxX,o.minY,o.maxY,o.minZ,o.maxZ],[b.x-b.w/2,b.x+b.w/2,b.y-b.h/2,b.y+b.h/2,b.z-b.d/2,b.z+b.d/2]);
    const x=wall==='b'?r.width/2-100:wall==='d'?-r.width/2+100:b.x,z=wall==='a'?-r.depth/2+100:wall==='c'?r.depth/2-120:b.z;
    assert.match(placementError({...cabinet,width:200,depth:200,x,z,elevation_mm:f.elevation},[],r),/оборудованием/);
  }
  const r=room();r.features=[newEquipment(r,'window','w')];assert.deepEqual(roomObstacles(r),[]);
});
test('Tripo placement faces into all four walls, keeps shared resources and rejects stale room loads',async()=>{
  for(const kind of Object.keys(EQUIPMENT))for(const wall of 'abcd'){
    const f={...newEquipment(room(),kind,kind),wall},root=new THREE.Group(),g=new THREE.Group(),fallback=new THREE.Group();root.add(g);g.add(fallback);
    const assets=new ApplianceAssets(()=>{}),entry={ready:true,textures:[],geometry:new THREE.BoxGeometry(),material:new THREE.MeshStandardMaterial()};assets.entries.set(kind,entry);
    const scene={roomRoot:root,roomEquipmentAssets:assets};attachRoomEquipment(scene,g,f,fallback);g.updateMatrixWorld(true);
    const n=new THREE.Vector3(0,0,1).applyQuaternion(g.quaternion),expected={a:[0,0,1],b:[-1,0,0],c:[0,0,-1],d:[1,0,0]}[wall];assert.ok(n.distanceTo(new THREE.Vector3(...expected))<1e-8);
    assert.equal(fallback.visible,false);const mesh=g.children.find(m=>m.isMesh);assert.equal(mesh.geometry,entry.geometry);assert.deepEqual(mesh.scale.toArray(),[f.width*.001,f.height*.001,(kind==='window'?70:f.projection)*.001]);assets.dispose();
  }
  const root=new THREE.Group(),g=new THREE.Group(),fallback=new THREE.Group();root.add(g);g.add(fallback);const assets=new ApplianceAssets(()=>{});let resolve;assets.load=()=>new Promise(r=>resolve=r);
  const scene={roomRoot:root,roomEquipmentAssets:assets};attachRoomEquipment(scene,g,newEquipment(room(),'gas_cooker','c'),fallback);scene.roomRoot=new THREE.Group();resolve({geometry:new THREE.BoxGeometry()});await Promise.resolve();assert.equal(g.children.length,1);assert.equal(fallback.visible,true);assets.dispose();
});
test('room equipment is one undo step and does not modify furniture or native sources',()=>{
  let state={scene:{room:room(),items:[{...cabinet,bazis_file:'original.fr3d'}]}};const before=structuredClone(state),h=new History({snapshot:()=>structuredClone(state),restore:s=>state=structuredClone(s)});
  h.run('Equipment',()=>{for(const kind of Object.keys(EQUIPMENT))state.scene.room.features.push(newEquipment(state.scene.room,kind,kind));});const after=JSON.parse(JSON.stringify(state));assert.deepEqual(after.scene.items,before.scene.items);h.undo();assert.deepEqual(state,before);h.redo();assert.deepEqual(state,after);
  const geometry=new THREE.BoxGeometry();for(const kind of Object.keys(EQUIPMENT).filter(k=>k!=='window')){const g=equipmentFallback(kind,geometry);assert.ok(g.children.length>0);g.traverse(o=>{if(o.material)o.material.dispose();if(o.geometry&&o.geometry!==geometry)o.geometry.dispose();});}geometry.dispose();
});
