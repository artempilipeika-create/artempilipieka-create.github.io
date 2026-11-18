import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
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
  const settings=roomSettings();assert.equal(settings.environmentPreset,'showroom');
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
