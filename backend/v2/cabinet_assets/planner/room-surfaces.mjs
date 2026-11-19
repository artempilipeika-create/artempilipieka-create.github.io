import * as THREE from './vendor/three.module.js';
import {wallPanels} from './room-plan.mjs';
import {roomDaylight,daylightSurface,wallShell} from './room-daylight.mjs';
import {roomSurfaceTexture} from './studio-environment.mjs';
import {interiorPalette,addWallInterior,interiorCeiling,marbleFloor} from './room-interiors.mjs';
import {wallCoating} from './render-rooms/catalogue.mjs';

const S=.001;

export function buildRoomSurfaces(r,settings,boxGeometry,anisotropy,invalidate) {
  const root=new THREE.Group(),daylight=roomDaylight(r,settings);
  const palette=settings.renderRoomId?null:interiorPalette(settings);
  const manager=new THREE.LoadingManager();
  let ready=Promise.resolve(),resolve;
  manager.onStart=()=>{ready=new Promise(done=>{resolve=done;});};
  manager.onLoad=()=>resolve?.();
  let floorTexture=null,surfaceTexture=null,plasterMap=null,clientFloor=null,ceiling=null;
  const make=(w,h,d,x,y,z,color)=>{const material=new THREE.MeshStandardMaterial({color,roughness:.82});const m=new THREE.Mesh(boxGeometry,material);m.userData.ownMaterial=true;m.scale.set(w*S,h*S,d*S);m.position.set(x*S,y*S,z*S);m.receiveShadow=true;root.add(m);return m;};
  const floor=make(r.width,20,r.depth,0,-12,0,settings.floorMaterial==='oak'?'#ffffff':settings.floorMaterial==='concrete'?'#b8b7b3':'#d9d8d1');
  const walls=[];
  floor.material.roughness=settings.floorMaterial==='oak'?.78:.84;daylightSurface(floor.material,daylight,'floor');
  if(settings.floorMaterial==='marble'){
    floor.material.color.set('#bab9b3');
    clientFloor=marbleFloor(r,daylight,anisotropy,invalidate,manager);
    root.add(clientFloor);
  }else if(settings.floorMaterial!=='oak'){
    surfaceTexture=roomSurfaceTexture(r.width*S,r.depth*S);
    floor.material.bumpMap=surfaceTexture;floor.material.bumpScale=.0012;
    floor.material.color.set(settings.floorMaterial==='concrete'?'#c7c4bd':'#ddd8cd');
  }
  if(settings.floorMaterial==='oak'){
    const texture=new THREE.TextureLoader(manager).load('/account/planner/materials/egger-h1180-st37.jpg',invalidate,undefined,()=>{if(floorTexture===texture){for(const m of [floor,clientFloor].filter(Boolean)){m.material.map=null;m.material.color.set('#bca585');m.material.needsUpdate=true;}invalidate();}});
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(r.width/1300,r.depth/2800);texture.anisotropy=anisotropy;floor.material.map=texture;floorTexture=texture;
    // Environment floor only: 190 x 1200 mm staggered boards, UVs in physical
    // millimetres of the existing scan. One draw call, no new decor assets.
    const positions=[],uvs=[],colors=[],width=190,length=1200;
    for(let col=0,x=-r.width/2;x<r.width/2;col++,x+=width){
      let row=0;for(let z=-r.depth/2-(col%3)*400;z<r.depth/2;row++,z+=length){
        const x0=x+.5,x1=Math.min(x+width,r.width/2)-.5,z0=Math.max(z,-r.depth/2)+.5,z1=Math.min(z+length,r.depth/2)-.5;
        const u=(col*431+row*193)%1100,v=(col*733+row*557)%1500,tint=.965+((col*7+row*3)%5)*.007;
        for(const [px,pz]of [[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]){
          positions.push(px*S,-.001,pz*S);uvs.push((px-x+u)/r.width,(pz-z+v)/r.depth);colors.push(tint,tint,tint);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({color:'#e2dcd1',map:texture,roughness:.80,metalness:0,vertexColors:true});
    daylightSurface(material,daylight,'floor');clientFloor=new THREE.Mesh(geometry,material);clientFloor.userData={ownMaterial:true,visualOnly:true,plankSizeMm:[width,length],scanSizeMm:[1300,2800]};clientFloor.receiveShadow=true;clientFloor.raycast=()=>{};root.add(clientFloor);
  }
  for(const wall of ['a','b','c','d']){
    const horizontal=['a','c'].includes(wall),axis=horizontal?'z':'x',sign=['a','d'].includes(wall)?-1:1;
    const length=horizontal?r.width:r.depth,edge=sign*(horizontal?r.depth:r.width)/2;
    const coating=wallCoating(settings,wall);
    const panels=wallPanels(r,wall),material=new THREE.MeshStandardMaterial({color:coating?.color||settings.wallColor,roughness:coating?.surface==='plaster'?.96:.86,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:4});
    if(coating?.surface==='plaster'){
      plasterMap??=roomSurfaceTexture(1,1);
      plasterMap.anisotropy=anisotropy;
      material.bumpMap=plasterMap;
      material.bumpScale=.0013;
    }
    daylightSurface(material,daylight,'wall');
    const surface=new THREE.Mesh(wallShell(length,panels),material);
    surface.rotation.y={a:0,b:-Math.PI/2,c:Math.PI,d:Math.PI/2}[wall];
    surface.scale.x=['c','d'].includes(wall)?-1:1;surface.position[axis]=edge*S;
    surface.userData={wall,axis,sign,ownMaterial:true};surface.receiveShadow=true;root.add(surface);walls.push(surface);
    if(palette&&!coating)addWallInterior(surface,{style:settings.environmentPreset,wall,length,height:r.height,panels,
      openings:(r.features||[]).filter(f=>f.wall===wall&&['window','door'].includes(f.kind))},palette,daylight,anisotropy,invalidate,manager);
    for(const p of panels.filter(p=>p.elevation===0)){
      const along=-length/2+p.offset+p.width/2;
      const trim=horizontal?make(p.width,65,9,along,32.5,edge-sign*4,'#edece7'):make(9,65,p.width,edge-sign*4,32.5,along,'#edece7');
      if(palette)trim.material.color.copy(palette.trim);
      Object.assign(trim.userData,{axis,sign});walls.push(trim);
    }
  }
  if(palette||settings.renderRoomId){ceiling=interiorCeiling(r,palette?.ceiling||'#e2e1db');root.add(ceiling);}
  return {root,walls,roomFloorBase:floor,clientFloor,ceiling,floorTexture,palette,ready,
    disposeMaps(){for(const texture of [floorTexture,surfaceTexture,plasterMap])texture?.dispose();}};
}

export function wallVisible(wall,room,eye){
  const {axis,sign}=wall.userData;
  return eye[axis]*sign<(axis==='x'?room.width:room.depth)*S/2-.02;
}
