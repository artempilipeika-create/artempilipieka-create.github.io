import * as THREE from './vendor/three.module.js';
import {FEATURES,featureBox,featureWall,socketCount,socketSurface} from './room-plan.mjs';
import {SocketAssets,socketRotation,socketLayout} from './socket-asset.mjs';
import {roomSettings} from './room-state.mjs';
import {allSegments,surfaceOffset,normals} from './wall-finishes.mjs';
import {equipmentFallback,attachRoomEquipment} from './room-equipment-mesh.mjs';
const S=.001;
export function measuredFeatures(scene){
  const r=scene.adapter.room,entries=[];
  const box=(parent,w,h,d,x,y,z,color)=>{const material=new THREE.MeshStandardMaterial({color,roughness:.8}),m=new THREE.Mesh(scene.factory.geometry,material);m.scale.set(w*S,h*S,d*S);m.position.set(x*S,y*S,z*S);m.userData.ownMaterial=true;parent.add(m);return m;};
  const badge=(parent,text,color,x,y,z)=>{
    const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#fcfcf6';ctx.beginPath();ctx.arc(32,32,28,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#263b30';ctx.font='bold 29px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,32,33);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const material=new THREE.SpriteMaterial({map,depthTest:false});const s=new THREE.Sprite(material);s.userData={ownMaterial:true,ownMap:true};s.position.set(x*S,y*S,z*S);s.scale.set(.15,.15,1);s.renderOrder=9;parent.add(s);return s;
  };
  for(const [i,f]of (r.features||[]).entries()){
    const color=FEATURES[f.kind][1],group=new THREE.Group(),plan=new THREE.Group();scene.roomRoot.add(group,plan);
    group.userData={roomFeatureId:f.id,kind:f.kind,hostWall:socketSurface(f,r)?.host.wall};plan.userData={roomFeatureId:f.id,plan:true};
    const wall=featureWall(f,r),horizontal=['a','c'].includes(wall),axis=horizontal?'z':'x',sign=['a','d'].includes(wall)?-1:1;
    const b=featureBox(f.kind==='window'?{...f,projection:0}:f,r,['shaft','column'].includes(f.kind)?0:8),extras=[];group.position.set(b.x*S,b.y*S,b.z*S);group.rotation.y=horizontal?0:Math.PI/2;
    if(f.kind==='window'){
      const fallback=new THREE.Group();group.add(fallback);
      box(fallback,f.width,f.height,6,0,0,0,'#b9d4dd');const t=Math.min(45,f.width/6,f.height/6);
      for(const x of[-(f.width-t)/2,(f.width-t)/2])box(fallback,t,f.height,70,x,0,0,'#f5f4ec');
      for(const y of[-(f.height-t)/2,(f.height-t)/2])box(fallback,f.width,t,70,0,y,0,'#f5f4ec');
      box(fallback,t,f.height,70,0,0,0,'#f5f4ec');
      attachRoomEquipment(scene,group,f,fallback);
      // Sill projection is measured from the wall, not from the glass centre.
      if(f.projection){const sill=featureBox({...f,height:20,projection:f.projection},r);extras.push(box(scene.roomRoot,sill.w,20,sill.d,sill.x,f.elevation,sill.z,'#e6e4d8'));}
    }else if(['radiator','gas_cooker','gas_boiler','water_heater'].includes(f.kind)){
      const fallback=equipmentFallback(f.kind,scene.factory.geometry);fallback.scale.set(f.width*S,f.height*S,Math.max(1,f.projection)*S);group.add(fallback);attachRoomEquipment(scene,group,f,fallback);
    }else if(f.kind==='shaft'||f.kind==='column'){
      const solid=box(group,f.width,f.height,f.projection,0,0,0,roomSettings(scene.adapter.state?.displaySettings).wallColor);solid.castShadow=true;solid.receiveShadow=true;solid.material.roughness=.92;
      if(f.elevation===0){const depth=f.projection,trimHeight=Math.min(65,f.height),y=-f.height/2+trimHeight/2;
        box(group,f.width,trimHeight,9,0,y,-sign*(depth/2+4),'#edece7');
        for(const x of[-f.width/2-4,f.width/2+4])box(group,9,trimHeight,depth,x,y,0,'#edece7');}
    }else if(f.kind==='socket'){
      const n=normals[wall],projection=Math.max(8,f.projection),point={x:b.x-n.x*projection/2,z:b.z-n.z*projection/2};
      const cover=surfaceOffset(allSegments(scene.adapter.state),point,n,f.width,f.elevation,f.height);
      group.position.x+=n.x*cover*S;group.position.z+=n.z*cover*S;
      group.rotation.y=socketRotation(wall);
      if(socketCount(f)>1){const depth=Math.max(8,f.projection);box(group,f.width,f.height,Math.min(4,depth),0,0,-depth/2+Math.min(4,depth)/2,'#f1f0e9');}
      const fallback=new THREE.Group();group.add(fallback);
      for(const slot of socketLayout(f)){
        box(fallback,slot.width,slot.height,Math.max(8,f.projection),slot.x,0,0,'#f1f0e9');
        for(const x of[-slot.width*.18,slot.width*.18])box(fallback,Math.min(10,slot.width/10),Math.min(10,slot.height/10),1,slot.x+x,0,Math.max(8,f.projection)/2+.5,'#576559');
      }
      const root=scene.roomRoot;
      scene.socketAssets??=new SocketAssets(()=>{scene.renderer.shadowMap.needsUpdate=true;scene.invalidate();});
      scene.socketAssets.attach(group,fallback,f,()=>!scene.dead&&scene.roomRoot===root&&group.parent===root);
    }else{
      box(group,f.width,f.height,Math.max(8,f.projection),0,0,0,color);
      if(f.kind==='radiator')for(let x=-f.width/2+25;x<f.width/2;x+=60)box(group,8,f.height*.85,Math.max(10,f.projection+2),x,0,0,'#f0e8df');
    }
    const marker=badge(group,String(i+1),color,0,f.height/2+95,0);
    const p=featureBox(f,r,['shaft','column'].includes(f.kind)?0:70);box(plan,p.w,7,p.d,p.x,6,p.z,color);badge(plan,String(i+1),color,p.x,80,p.z);
    entries.push({group,plan,axis,sign,extras,marker});
  }
  return entries;
}
