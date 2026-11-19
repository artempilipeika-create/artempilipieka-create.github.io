import * as THREE from './vendor/three.module.js';
import {daylightSurface} from './room-daylight.mjs';
import {ROOM_PRESETS} from './room-state.mjs';

const palettes={
  graphite:{side:'#878e90',back:'#737678',lower:'#62696d',joint:'#484e51',trim:'#525a5c',crest:'#60686b',frame:'#555f62',sill:'#71787a',ceiling:'#c4c5be'},
  'warm-oak':{side:'#c9c1b1',back:'#c4b8a6',lower:'#ab967b',joint:'#998d79',trim:'#938674',crest:'#b2a288',frame:'#8b7d69',sill:'#a99a83',ceiling:'#ddd5c7'},
  classic:{side:'#bbc1bb',back:'#bcbfba',lower:'#9fa9a3',joint:'#a6afa9',trim:'#b4bcb5',crest:'#cbd0c7',frame:'#a1aaa4',sill:'#b7bdb3',ceiling:'#deddd4'}
};
const millimetre=.001;
const noPick=()=>{};

export function interiorPalette(settings){
  const base=palettes[settings.environmentPreset];
  if(!base)return null;
  const original=new THREE.Color(ROOM_PRESETS[settings.environmentPreset].wallColor);
  const chosen=new THREE.Color(settings.wallColor);
  return Object.fromEntries(Object.entries(base).map(([key,hex])=>{
    const color=new THREE.Color(hex);
    if(key!=='ceiling')for(const channel of ['r','g','b']){
      color[channel]=Math.min(1,color[channel]*chosen[channel]/original[channel]);
    }
    return [key,color];
  }));
}

// The material owns the scan. A room rebuild may dispose it before the image arrives.
function loadScan(material,url,fallback,anisotropy,invalidate,manager){
  const finish=material.color.clone();
  material.color.set(fallback);
  let live=true;
  const texture=new THREE.TextureLoader(manager).load(url,()=>{
    if(!live)return;
    material.map=texture;material.color.copy(finish);material.needsUpdate=true;invalidate();
  },undefined,()=>{if(live)invalidate();});
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=anisotropy;
  material.addEventListener('dispose',()=>{live=false;texture.dispose();});
}

function rectangleIntersection(a,b){
  const l=Math.max(a[0],b[0]),bottom=Math.max(a[1],b[1]);
  const r=Math.min(a[2],b[2]),top=Math.min(a[3],b[3]);
  return r>l&&top>bottom?[l,bottom,r,top]:null;
}

// Batch each finish into one draw per wall. Geometry stays behind the measured
// finished face, so cladding, furniture and sockets can still sit flush against it.
export function interiorWall({style,wall,length,height,panels,openings}){
  const half=length/2,left=-half,right=half;
  const solid=panels.map(p=>[left+p.offset,p.elevation,left+p.offset+p.width,p.elevation+p.height]);
  const holes=openings.map(f=>[left+f.offset,f.elevation,left+f.offset+f.width,f.elevation+f.height]);
  const batches=new Map();
  let grainOffset=0;
  function quad(finish,a,b,c,d){
    if(!batches.has(finish))batches.set(finish,{point:[],uv:[]});
    const batch=batches.get(finish);
    for(const [x,y,z] of [a,b,c,a,c,d]){
      batch.point.push(x*millimetre,y*millimetre,z*millimetre);
      if(finish==='wood')batch.uv.push(x/980+grainOffset,y/2200+grainOffset*.37);
    }
  }
  function block(rect,finish,front=-12,back=-24){
    for(const area of solid){
      const clipped=rectangleIntersection(rect,area);
      if(!clipped)continue;
      const [l,b,r,t]=clipped;
      quad(finish,[l,b,front],[r,b,front],[r,t,front],[l,t,front]);
      quad(finish,[l,b,back],[l,b,front],[l,t,front],[l,t,back]);
      quad(finish,[r,b,front],[r,b,back],[r,t,back],[r,t,front]);
      quad(finish,[l,t,front],[r,t,front],[r,t,back],[l,t,back]);
      quad(finish,[l,b,back],[r,b,back],[r,b,front],[l,b,front]);
    }
  }
  function spans(b,t){
    let ranges=[[left,right]];
    for(const [x,y,z,h] of holes){
      if(h<=b||y>=t)continue;
      ranges=ranges.flatMap(([a,d])=>[[a,Math.min(d,x-25)],[Math.max(a,z+25),d]]).filter(([a,d])=>d-a>60);
    }
    return ranges;
  }
  function moulding(l,b,r,t){
    if(r-l<100||t-b<90)return;
    let previous=null;
    for(const [inset,depth] of [[0,-19],[3,-14],[7,-11],[10,-5],[14,-3],[17,-6],[20,-12],[25,-18]]){
      const edge=[[l+inset,b+inset,depth],[r-inset,b+inset,depth],[r-inset,t-inset,depth],[l+inset,t-inset,depth]];
      if(previous)for(let i=0;i<4;i++)quad('crest',previous[i],previous[(i+1)%4],edge[(i+1)%4],edge[i]);
      previous=edge;
    }
  }
  if(style==='graphite'){
    const count=Math.max(2,Math.round(length/745)),cell=length/count;
    for(let i=0;i<count;i++){
      const l=left+i*cell+3,r=l+cell-6;
      if(wall==='a')block([l,65,r,height-15],'back');
      else{
        block([l,65,r,746],'lower');
        block([l,756,r,height-18],'side');
      }
    }
    const strip=wall==='a'?Math.min(450,length*.17):Math.min(260,length*.13);
    const start=wall==='d'?left+length*.075:right-length*.12-strip;
    for(let x=start;x<start+strip-15;x+=28){
      const bottom=wall==='a'?67:759;
      block([x,bottom,x+18,height-23],'trim',-5,-12);
      block([x+3,bottom,x+15,height-23],'crest',-2,-5);
    }
  }else if(style==='warm-oak'){
    const count=Math.max(2,Math.round(length/580)),cell=length/count;
    block([left,67,right,784],'joint',-23);
    for(let i=0;i<count;i++){
      grainOffset=i*.471+length*.00019;
      block([left+i*cell+2,69,left+(i+1)*cell-2,777],'wood',-12);
    }
    block([left,777,right,798],'crest',-5);
    if(wall==='a'){
      const end=right-Math.min(105,length*.04),width=Math.min(610,length*.21);
      for(let i=0;i<3;i++){
        grainOffset=.34+i*.377;
        block([end-width+i*width/3+2,800,end-width+(i+1)*width/3-2,height-18],'wood',-13);
      }
    }else for(const [l,r] of spans(799,height)){
      const n=Math.round((r-l)/1100);
      for(let i=1;i<n;i++){const x=l+i*(r-l)/n;block([x-2,799,x+2,height-18],'joint',-21);}
    }
  }else if(style==='classic'){
    block([left,65,right,747],'lower',-19);
    block([left,746,right,776],'trim',-9);
    block([left,768,right,779],'crest',-3);
    for(const [b,t] of [[154,650],[880,height-172]]){
      for(const [l,r] of spans(b,t)){
        const count=Math.max(1,Math.round((r-l)/1110)),cell=(r-l)/count,pad=Math.min(86,cell*.15);
        for(let i=0;i<count;i++)moulding(l+i*cell+pad,b,l+(i+1)*cell-pad,t);
      }
    }
    for(const [l,,r,t] of holes)if(height-t>420){
      // A transom panel belongs only in the uninterrupted band above this opening.
      for(const [a,z] of spans(t+90,height-172))moulding(Math.max(a,l)+86,t+90,Math.min(r,z)-86,height-172);
    }
    block([left,height-64,right,height-36],'trim',-10);
    block([left,height-40,right,height-12],'crest',-1);
  }
  const border=style==='classic'?42:style==='warm-oak'?33:28;
  for(const [l,b,r,t] of holes){
    block([l-border,b,l,t],'frame',-1);
    block([r,b,r+border,t],'frame',-1);
    block([l-border,t,r+border,t+border],'frame',-1);
    if(b>0)block([l-border,b-border,r+border,b],'frame',-1);
  }
  return batches;
}

function meshGeometry(positions,uvs){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(uvs.length)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeVertexNormals();return geometry;
}

export function addWallInterior(surface,wallInput,palette,daylight,anisotropy,invalidate,manager){
  const style=wallInput.style;
  // The room shell has jambs. Recess its paint behind the raised profiles.
  surface.geometry.translate(0,0,-.026);
  surface.material.color.copy(style==='graphite'?palette.joint:wallInput.wall==='a'?palette.back:palette.side);
  for(const [key,batch] of interiorWall(wallInput)){
    const wood=key==='wood';
    const material=new THREE.MeshStandardMaterial({color:wood?'#e9e0d3':palette[key],roughness:wood?.64:.78});
    if(wood)loadScan(material,'/account/planner/materials/egger-h1180-st37.jpg','#ad9270',anisotropy,invalidate,manager);
    daylightSurface(material,daylight,'wall');
    const mesh=new THREE.Mesh(meshGeometry(batch.point,batch.uv),material);
    mesh.userData={ownMaterial:true,visualOnly:true};mesh.castShadow=true;mesh.receiveShadow=true;mesh.raycast=noPick;
    surface.add(mesh);
  }
}

export function interiorCeiling(room,color){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(room.width*millimetre,room.depth*millimetre),new THREE.MeshStandardMaterial({color,roughness:.94}));
  mesh.rotation.x=Math.PI/2;mesh.position.y=room.height*millimetre+.001;
  mesh.receiveShadow=true;mesh.userData={ownMaterial:true,visualOnly:true};mesh.raycast=noPick;return mesh;
}

export function marbleFloor(room,daylight,anisotropy,invalidate,manager){
  const left=-room.width/2,right=-left,near=-room.depth/2,far=-near,positions=[],uv=[];
  const width=1200,depth=600,joint=2.4;
  for(let col=0,x=left-280;x<right;col++,x+=width){
    for(let row=0,z=near-130;z<far;row++,z+=depth){
      const l=Math.max(x+joint/2,left),r=Math.min(x+width-joint/2,right);
      const b=Math.max(z+joint/2,near),t=Math.min(z+depth-joint/2,far);
      if(l>=r||b>=t)continue;
      const ox=((col*13+row*27)%39)/100,oy=((col*37+row*17)%52)/100;
      for(const [px,pz] of [[l,b],[l,t],[r,t],[l,b],[r,t],[r,b]]){
        let u=(pz-z)/1300,v=(px-x)/2800;
        if((row+col)%3===1){u=depth/1300-u;v=width/2800-v;}
        positions.push(px*millimetre,-.00065,pz*millimetre);uv.push(ox+u,oy+v);
      }
    }
  }
  const material=new THREE.MeshPhysicalMaterial({color:'#eeede9',roughness:.48,clearcoat:.09,clearcoatRoughness:.36,envMapIntensity:.48});
  loadScan(material,'/account/planner/materials/egger-f800-st9.jpg','#ddd9d1',anisotropy,invalidate,manager);
  daylightSurface(material,daylight,'floor');
  const mesh=new THREE.Mesh(meshGeometry(positions,uv),material);
  mesh.receiveShadow=true;mesh.raycast=noPick;mesh.userData={ownMaterial:true,visualOnly:true,tileSizeMm:[width,depth]};return mesh;
}
