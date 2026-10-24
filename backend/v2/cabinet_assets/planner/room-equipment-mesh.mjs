import * as THREE from './vendor/three.module.js';
import {ApplianceAssets} from './appliance-assets.mjs';
import {socketRotation} from './socket-asset.mjs';

// Visible immediately while the shared Tripo model loads, or if it is unavailable.
export function equipmentFallback(kind,boxGeometry){
  const g=new THREE.Group();
  const box=(w,h,d,x=0,y=0,z=0,color='#eeede7')=>{
    const material=new THREE.MeshStandardMaterial({color,roughness:.36,metalness:color==='#505858'?.5:0});
    const m=new THREE.Mesh(boxGeometry,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.userData.ownMaterial=true;m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
  };
  if(kind==='gas_cooker'){
    box(1,.95,1,0,-.025,0);box(.96,.035,.96,0,.467,0,'#505858');
    box(.85,.58,.025,0,-.08,.505,'#242a2c');box(.76,.035,.055,0,.235,.53,'#828987');
    for(let i=0;i<5;i++)box(.055,.05,.035,-.34+i*.17,.38,.52,'#303639');
    for(const x of[-.25,.25])for(const z of[-.25,.25]){box(.3,.025,.04,x,.5,z,'#242a2c');box(.04,.025,.3,x,.5,z,'#242a2c');box(.12,.035,.12,x,.49,z,'#242a2c');}
  }else if(kind==='radiator'){
    box(1,1,1);for(let i=0;i<24;i++)box(.009,.91,.03,-.47+i*.041,0,.51,'#d8d9d3');
  }else if(kind==='gas_boiler'){
    box(1,1,1);box(.64,.13,.025,0,-.3,.51,'#303b40');box(.28,.06,.03,-.06,-.29,.53,'#7d9fa3');
  }else if(kind==='water_heater'){
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,1,40),new THREE.MeshStandardMaterial({color:'#efeee9',roughness:.3}));m.userData.ownMaterial=true;m.castShadow=true;m.receiveShadow=true;g.add(m);
    box(.17,.07,.025,0,.25,.49,'#6a7778');box(.21,.075,.025,0,-.35,.49,'#e0dfd7');
  }
  return g;
}
export function attachRoomEquipment(scene,group,f,fallback){
  group.rotation.y=socketRotation(f.wall);
  const root=scene.roomRoot;scene.roomEquipmentAssets??=new ApplianceAssets(()=>{scene.renderer.shadowMap.needsUpdate=true;scene.invalidate();});
  scene.roomEquipmentAssets.attach(group,fallback,{kind:f.kind,width:f.width,height:f.height,depth:f.kind==='window'?70:f.projection,x:0,y:0,z:0},false,()=>!scene.dead&&scene.roomRoot===root&&group.parent===root);
}

/** Analytic window frame and sill; opening dimensions remain exact. */
export function windowEquipment(f,geometry){
  const group=new THREE.Group(),box=(w,h,d,x,y,z,color)=>{const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.6}));m.scale.set(w*.001,h*.001,d*.001);m.position.set(x*.001,y*.001,z*.001);m.userData.ownMaterial=true;group.add(m);};
  const t=Math.min(45,f.width/6,f.height/6);
  box(f.width,f.height,6,0,0,0,'#b9d4dd');
  for(const x of[-(f.width-t)/2,(f.width-t)/2,0])box(t,f.height,70,x,0,0,'#f5f4ec');
  for(const y of[-(f.height-t)/2,(f.height-t)/2])box(f.width,t,70,0,y,0,'#f5f4ec');
  if(f.projection)box(f.width,20,f.projection,0,-f.height/2,f.projection/2,'#e6e4d8');
  return group;
}
