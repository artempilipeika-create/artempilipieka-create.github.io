import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {clearanceSession,drawerStroke,maxOpening} from '../../backend/v2/cabinet_assets/planner/wardrobe-clearance.mjs';
import {WardrobeMotion,drawerKey} from '../../backend/v2/cabinet_assets/planner/wardrobe-motion.mjs';
import {roomDaylight,wallShell} from '../../backend/v2/cabinet_assets/planner/room-daylight.mjs';
import {wallPanels} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
import {roomSettings} from '../../backend/v2/cabinet_assets/planner/room-state.mjs';

test('a rotated pair opens about its original hinge axes, extending only the requested drawer',()=>{
  const items=['door-left','door-right','drawer-0-0-side-left','drawer-0-0-face','drawer-0-1-side-left','drawer-0-1-face'].map((key,i)=>({
    item_id:'case:'+key,assistant_carcass:{group_id:'case'},width:i<2?397:300,depth:i<2?18:500,x:300+i*12,z:-720,rotation:90
  }));
  const saved=JSON.stringify(items),entries=new Map();
  for(const it of items){
    const group=new THREE.Group();
    group.position.set(it.x/1000,0,it.z/1000);group.rotation.y=-Math.PI/2;
    if(it.item_id.includes('side-left'))for(const travel of [0,.5,1]){
      const stage=new THREE.Group();stage.userData={drawerRail:true,railTravel:travel};group.add(stage);
    }
    entries.set(it.item_id,{group});
  }
  const pivots=items.slice(0,2).map((it,i)=>new THREE.Vector3((i?1:-1)*(it.width/2-1.5)/1000,0,.009));
  const hingePoints=pivots.map((p,i)=>entries.get(items[i].item_id).group.localToWorld(p.clone()));
  const m=new WardrobeMotion();let time=0;
  const frame=()=>{m.step(time+=40);m.pose(entries,items);};
  const settle=()=>{for(let i=0;i<30;i++)frame();};
  m.show('case');m.toggleDrawer('0-0');
  for(let i=0;i<8;i++){frame();assert.equal(m.extension,0);}
  settle();assert.equal(m.door,1);assert.equal(m.shown,'0-0');assert.equal(m.extension,1);
  for(let i=0;i<2;i++){
    const door=entries.get(items[i].item_id).group;
    assert.ok(door.localToWorld(pivots[i].clone()).distanceTo(hingePoints[i])<1e-8);
    assert.equal(door.rotation.y,-Math.PI/2+(i?1:-1)*Math.PI/2);
  }
  const side=items[2],rails=entries.get(side.item_id).group.children;
  rails.forEach((rail,i)=>assert.ok(Math.abs(rail.getWorldPosition(new THREE.Vector3()).x-(side.x/1000-i*.205))<1e-8));
  assert.equal(entries.get(items[5].item_id).group.position.x,items[5].x/1000);
  m.toggleDrawer('0-1');frame();frame();assert.equal(m.shown,'0-0');assert.ok(m.extension<1);
  settle();assert.equal(m.shown,'0-1');assert.equal(m.extension,1);
  m.close();frame();frame();assert.equal(m.door,1);
  settle();assert.equal(m.id,null);assert.equal(m.extension,0);
  for(const it of items)assert.ok(entries.get(it.item_id).group.position.distanceTo(new THREE.Vector3(it.x/1000,0,it.z/1000))<1e-8);
  assert.equal(JSON.stringify(items),saved);
  assert.equal(drawerKey({item_id:'case:drawer-33-2-face'}),'33-2');
});

test('the environment follows the primary measured window and respects saved room finishes',()=>{
  const room={width:4200,depth:3600,height:2700,features:[]};
  const settings=roomSettings();assert.equal(settings.environmentPreset,'graphite');
  assert.equal(roomDaylight(room,settings).measured,false);
  room.features=[{kind:'window',wall:'a',width:400,height:500,offset:0,elevation:1000,projection:0},
                 {kind:'window',wall:'b',width:1200,height:1300,offset:800,elevation:900,projection:0}];
  const light=roomDaylight(room,settings);assert.equal(light.measured,true);
  assert.deepEqual(light.direction.toArray(),[-1,0]);assert.deepEqual(light.source.toArray(),[2.1,-.4]);
  const saved={environmentPreset:'studio',wallColor:'#bbaadd',floorMaterial:'concrete',lightingPreset:'warm'};
  assert.deepEqual(roomSettings(saved),saved);
});

test('the wall mesh has returns around a measured opening only',()=>{
  const room={width:4000,height:2800,depth:3600,features:[{kind:'window',wall:'a',offset:900,width:1200,height:1400,elevation:800}]};
  const wall=new THREE.Mesh(wallShell(room.width,wallPanels(room,'a')),new THREE.MeshBasicMaterial());
  const intersects=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1)).intersectObject(wall).length>0;
  assert.equal(intersects(-.5,1.5),false);assert.equal(intersects(-.5,.5),true);assert.equal(intersects(.5,1.5),true);
  const normal=wall.geometry.attributes.normal,pos=wall.geometry.attributes.position;
  for(let i=0;i<pos.count;i+=3)if(Math.abs(normal.getX(i))>.99&&Math.abs(pos.getX(i))<1.99){
    const height=(pos.getY(i)+pos.getY(i+1)+pos.getY(i+2))/3;
    assert.ok(height>.8&&height<2.2);
  }
  wall.geometry.dispose();wall.material.dispose();
});

const testCabinet={group_id:'cab',spec:{drawerBanks:[{kind:'internal'}]}};
function blank(key,x,z,width,height,depth,y=0){
 return {item_id:'cab:'+key,assistant_carcass:testCabinet,blank_axis:'front',rotation:0,x,z,width,height,depth,elevation_mm:y};
}

test('independent doors stop a drawer anywhere along its full rail on every cabinet rotation',()=>{
 for(const rotation of [0,90,180,270]){
  const items=[blank('door-left',-250,250,497,1950,18),blank('door-right',250,250,497,1950,18),
   blank('drawer-0-0-face',-235,229,400,240,18,40),blank('drawer-0-0-side-left',-430,-30,18,190,500,59)];
  const yaw=-rotation*Math.PI/180;
  for(const it of items){
   const x=it.x,z=it.z;
   Object.assign(it,{rotation,x:x*Math.cos(yaw)+z*Math.sin(yaw),z:z*Math.cos(yaw)-x*Math.sin(yaw)});
  }
  const saved=JSON.stringify(items),m=new WardrobeMotion();m.show('cab');m.defaultDegrees=0;
  const view=clearanceSession(items,null,null,m);
  assert.equal(drawerStroke(items,m.id,'0-0'),500);
  const shut=view.drawer('0-0');
  assert.match(shut.obstacle,/левая дверь/);assert.ok(Math.abs(shut.time*500-3)<.001);
  assert.ok(shut.point.every(Number.isFinite));assert.ok(Math.abs(shut.point[1]-160)<.001);
  m.setDegrees(items[0].item_id,55);
  const partial=view.drawer('0-0');assert.ok(partial.time>shut.time&&partial.time<1);
  m.setDegrees(items[0].item_id,100);
  assert.equal(m.degrees(items[1].item_id),0);assert.equal(view.drawer('0-0'),null);
  m.shown='0-0';m.extension=1;
  const closing=view.swing(items[0],100,0);
  assert.ok(closing.degrees>0&&closing.degrees<100);assert.match(closing.contact.obstacle,/Шуфляда 1/);
  assert.equal(JSON.stringify(items),saved);
 }
});

test('a rail checks the metal shape, including clear space within its rectangular bounds',()=>{
 const door=blank('door-left',500,60,20,10,18);
 const items=[door,blank('drawer-0-0-face',0,0,20,12,10,410),blank('drawer-0-0-side-left',200,-200,18,10,250,10)];
 const group=new THREE.Group(),g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([-.600,.400,0,-.400,.600,0,-.600,.600,0],3));
 const metal=new THREE.Mesh(g);metal.userData={frontAccessory:true,article:'116550'};group.add(metal);
 const m=new WardrobeMotion();m.show('cab');m.defaultDegrees=0;
 const view=clearanceSession(items,new Map([[door.item_id,{group}]]),null,m);
 assert.equal(view.drawer('0-0'),null);
 items[1].elevation_mm=530;
 const hit=view.drawer('0-0');assert.equal(hit.obstacle,'Ручка 116550');
 assert.ok(Math.abs(hit.time*250-55)<.001);assert.ok(Math.abs(hit.point[2]-60)<.001);
 assert.ok(hit.point[1]>=530&&hit.point[1]<=542);
 g.dispose();metal.material.dispose();
});

test('the wall limits the swing first at the real handle, and a measured wall opening lets it pass',()=>{
 const a=blank('door-left',-800,0,397,900,18,500),m=new WardrobeMotion();m.show('cab');m.defaultDegrees=0;
 const room={width:2000,height:2500,depth:4000,features:[]},entries=new Map();
 const bare=clearanceSession([a],entries,room,m).swing(a,0,maxOpening);
 assert.ok(bare.degrees>90&&bare.degrees<91);assert.match(bare.contact.obstacle,/Стена D/);
 const group=new THREE.Group(),handle=new THREE.Mesh(new THREE.BoxGeometry(.015,.35,.045));
 handle.position.set(-.155,.5,.0315);handle.userData={frontAccessory:true,article:'116550'};group.add(handle);entries.set(a.item_id,{group});
 const metal=clearanceSession([a],entries,room,m).swing(a,0,maxOpening);
 assert.ok(metal.degrees>40&&metal.degrees<41);assert.match(metal.contact.moving,/116550/);
 assert.ok(Math.abs(metal.contact.point[0]+1000)<.02);
 room.features=[{kind:'door',wall:'d',offset:1500,width:1200,height:2000,elevation:0}];
 assert.deepEqual(clearanceSession([a],entries,room,m).swing(a,0,maxOpening),{degrees:105,contact:null});
 handle.geometry.dispose();handle.material.dispose();
});

test('a rotated neighboring leaf blocks the sweep even when the final pose would have cleared it',()=>{
 const a=blank('door-left',-200,0,397,900,18,500);
 const b={...blank('door-right',-340,300,150,900,18,500),item_id:'other:door-right',rotation:90,assistant_carcass:{group_id:'other'}};
 const m=new WardrobeMotion();m.show('cab');m.defaultDegrees=0;
 const v=clearanceSession([a,b],null,null,m),blocked=v.swing(a,0,105);
 assert.equal(v.swing(a,105,105).contact,null);assert.ok(blocked.degrees>70&&blocked.degrees<75);
 assert.match(blocked.contact.obstacle,/правая дверь/);
});
