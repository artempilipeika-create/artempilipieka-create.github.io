import * as THREE from './vendor/three.module.js';
import {FEATURES,featureBox} from './room-plan.mjs';
const S=.001;
export function measuredFeatures(scene){
  const r=scene.adapter.room,entries=[];
  const box=(parent,w,h,d,x,y,z,color)=>{const material=new THREE.MeshStandardMaterial({color,roughness:.8}),m=new THREE.Mesh(scene.factory.geometry,material);m.scale.set(w*S,h*S,d*S);m.position.set(x*S,y*S,z*S);m.userData.ownMaterial=true;parent.add(m);return m;};
  const badge=(parent,text,color,x,y,z)=>{
    const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#fcfcf6';ctx.beginPath();ctx.arc(32,32,28,0,Math.PI*2);ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#263b30';ctx.font='bold 29px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,32,33);
    const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;const material=new THREE.SpriteMaterial({map,depthTest:false});const s=new THREE.Sprite(material);s.userData={ownMaterial:true,ownMap:true};s.position.set(x*S,y*S,z*S);s.scale.set(.15,.15,1);s.renderOrder=9;parent.add(s);
  };
  for(const [i,f]of (r.features||[]).entries()){
    const color=FEATURES[f.kind][1],group=new THREE.Group(),plan=new THREE.Group();scene.roomRoot.add(group,plan);
    group.userData={roomFeatureId:f.id,kind:f.kind};plan.userData={roomFeatureId:f.id,plan:true};
    const horizontal=['a','c'].includes(f.wall),axis=horizontal?'z':'x',sign=['a','d'].includes(f.wall)?-1:1;
    const b=featureBox(f.kind==='window'?{...f,projection:0}:f,r,8),extras=[];group.position.set(b.x*S,b.y*S,b.z*S);group.rotation.y=horizontal?0:Math.PI/2;
    if(f.kind==='window'){
      box(group,f.width,f.height,6,0,0,0,'#b9d4dd');const t=Math.min(45,f.width/6,f.height/6);
      for(const x of[-(f.width-t)/2,(f.width-t)/2])box(group,t,f.height,26,x,0,0,'#f5f4ec');
      for(const y of[-(f.height-t)/2,(f.height-t)/2])box(group,f.width,t,26,0,y,0,'#f5f4ec');
      box(group,t,f.height,26,0,0,0,'#f5f4ec');
      // Sill projection is measured from the wall, not from the glass centre.
      if(f.projection){const sill=featureBox({...f,height:20,projection:f.projection},r);extras.push(box(scene.roomRoot,sill.w,20,sill.d,sill.x,f.elevation,sill.z,'#e6e4d8'));}
    }else{
      box(group,f.width,f.height,Math.max(8,f.projection),0,0,0,color);
      if(f.kind==='socket')for(const x of[-f.width*.18,f.width*.18])box(group,Math.min(10,f.width/10),Math.min(10,f.height/10),12,x,0,0,'#576559');
      if(f.kind==='radiator')for(let x=-f.width/2+25;x<f.width/2;x+=60)box(group,8,f.height*.85,Math.max(10,f.projection+2),x,0,0,'#f0e8df');
    }
    badge(group,String(i+1),color,0,f.height/2+95,0);
    const p=featureBox(f,r,70);box(plan,p.w,7,p.d,p.x,6,p.z,color);badge(plan,String(i+1),color,p.x,80,p.z);
    entries.push({group,plan,axis,sign,extras});
  }
  return entries;
}
