import * as THREE from './vendor/three.module.js';
import {roundedOutline} from './worktop-fixtures.mjs';

const S=.001;
/** Measured placement with shared Tripo resources and an immediate analytic fallback. */
export function buildWorktopFixture(f,assets=null,isCurrent=null){
  const group=new THREE.Group();group.userData={visualOnly:true,role:'worktop-fixture',tier:'base',itemId:f.itemId,members:[f.itemId]};
  const live=isCurrent||(()=>!group.userData.released);
  const bodySlot=new THREE.Group(),bodyFallback=new THREE.Group();bodySlot.userData={...group.userData};bodySlot.add(bodyFallback);group.add(bodySlot);let target=bodyFallback;
  const materials={
    steel:new THREE.MeshStandardMaterial({color:'#b9c0c3',metalness:.9,roughness:.28,side:THREE.DoubleSide}),
    black:new THREE.MeshStandardMaterial({color:'#242a2b',metalness:.12,roughness:.44,side:THREE.DoubleSide}),
    chrome:new THREE.MeshStandardMaterial({color:'#d4d9dc',metalness:1,roughness:.18}),
    glass:new THREE.MeshPhysicalMaterial({color:'#10181b',metalness:.18,roughness:.16,clearcoat:1,clearcoatRoughness:.1}),
    mark:new THREE.MeshStandardMaterial({color:'#697175',metalness:.35,roughness:.45}),
    dark:new THREE.MeshStandardMaterial({color:'#080c0d',roughness:.52})
  };
  const add=(geometry,material,x=0,y=0,z=0)=>{
    geometry.scale(S,S,S);geometry.translate(x*S,y*S,z*S);const mesh=new THREE.Mesh(geometry,materials[material]);
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={...group.userData,ownGeometry:true};target.add(mesh);return mesh;
  };
  const slab=(w,d,h,r,material,y,holes=[])=>{
    const shape=new THREE.Shape(roundedOutline(w,d,r).map(([x,z])=>new THREE.Vector2(x,-z)));
    shape.holes=holes.map(points=>new THREE.Path(points.map(([x,z])=>new THREE.Vector2(x,-z))));
    const g=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);return add(g,material,0,y,0);
  };
  const cylinder=(r,h,x,y,z,material)=>add(new THREE.CylinderGeometry(r,r,h,64),material,x,y,z);
  const ring=(r,t,x,y,z,material)=>{const g=new THREE.TorusGeometry(r,t,12,80);g.rotateX(-Math.PI/2);return add(g,material,x,y,z);};
  const pipe=(points,r,material)=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal'),72,r,24,false),material);
  if(f.kind==='sink'){
    const w=f.width-40,d=f.depth-110,cz=30,finish=f.finish;
    slab(f.width,f.depth,3,12,finish,0,[roundedOutline(w,d,24,0,cz)]);
    // Rounded lip and tapered bowl, including the floor, open at the top.
    const levels=[[w,d,24,2],[w-5,d-5,25,-6],[w-16,d-16,28,-22],[w-52,d-52,36,-145],[w-66,d-66,38,-163],[w-88,d-88,38,-170]];
    const pos=[],idx=[],rings=levels.map(([rw,rd,r,y])=>roundedOutline(rw,rd,r,0,cz).map(([x,z])=>[x,y,z]));
    rings.flat().forEach(p=>pos.push(...p));const n=rings[0].length;
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n,c=(j+1)*n+(i+1)%n,d=(j+1)*n+i;idx.push(a,b,c,a,c,d);}
    const floor=rings.at(-1),offset=(rings.length-1)*n;
    for(const face of THREE.ShapeUtils.triangulateShape(floor.map(p=>new THREE.Vector2(p[0],p[2])),[]))idx.push(...face.map(i=>i+offset));
    // The lit surface faces into the open bowl, with the floor facing upwards.
    for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
    const bowl=new THREE.BufferGeometry();bowl.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bowl.setIndex(idx);bowl.computeVertexNormals();add(bowl,finish);
    cylinder(23,2,0,-168,cz,'chrome');ring(18,1.1,0,-166.8,cz,'dark');
    for(let i=0;i<8;i++){const a=i*Math.PI/4;cylinder(2,1,Math.sin(a)*12,-166.5,cz+Math.cos(a)*12,'dark');}
    cylinder(4,1,0,-166.5,cz,'dark');
    assets?.attach(bodySlot,bodyFallback,{kind:'sink',width:f.width,height:180,depth:f.depth,y:-87,z:0},false,live,f.finish==='black'?materials.black:null);
    const faucetSlot=new THREE.Group(),faucetFallback=new THREE.Group();faucetSlot.userData={...group.userData};faucetSlot.add(faucetFallback);group.add(faucetSlot);target=faucetFallback;
    const tz=-f.depth/2+34,mat=f.faucet_finish==='black'?'black':'chrome';
    cylinder(22,5,0,5,tz,mat);cylinder(17,65,0,39,tz,mat);
    if(f.faucet==='arch')pipe([[0,64,tz],[0,210,tz],[0,310,tz+28],[0,325,tz+105],[0,282,tz+170],[0,235,tz+170]],11,mat);
    else if(f.faucet==='angled')pipe([[0,65,tz],[0,285,tz],[0,302,tz+16],[0,302,tz+167],[0,287,tz+183]],10,mat);
    else pipe([[0,65,tz],[0,170,tz],[0,205,tz+50],[0,180,tz+145]],12,mat);
    cylinder(10,8,27,44,tz,mat);pipe([[27,44,tz],[39,61,tz],[39,104,tz]],4,mat);
    if(f.faucet==='arch')assets?.attach(faucetSlot,faucetFallback,{kind:'faucet',sourceSize:true,height:330,y:3,z:tz},false,live,f.faucet_finish==='black'?materials.black:null);
  }else{
    slab(f.width-10,f.depth-10,22,8,'dark',-22);slab(f.width,f.depth,5,10,'glass',.7);
    for(const [x,z,r]of [[-.25,-.23,83],[.25,-.23,65],[-.25,.2,65],[.25,.2,90]]){
      ring(r,.55,x*f.width,6,z*f.depth,'mark');ring(r-5,.3,x*f.width,6,z*f.depth,'mark');
      const bar=new THREE.BoxGeometry(12,.3,1);add(bar,'mark',x*f.width,6,z*f.depth);
    }
    const z=f.depth/2-27;ring(5,.5,-80,6,z,'mark');
    for(const x of [-30,5,40,75]){const g=new THREE.BoxGeometry(12,.3,.7);add(g,'mark',x,6,z);}
    const power=new THREE.BoxGeometry(.8,.4,5);add(power,'mark',-80,6.2,z-4);
  }
  if(f.hoodLayout){
    const h=f.hoodLayout,slot=new THREE.Group(),fallback=new THREE.Group();slot.userData={...group.userData,role:'hood'};slot.add(fallback);group.add(slot);target=fallback;
    add(new THREE.BoxGeometry(h.width,45,h.depth),'steel',0,h.y-h.height/2+22.5,h.z);
    add(new THREE.BoxGeometry(220,h.height-45,220),'steel',0,h.y+22.5,h.z-h.depth/2+110);
    assets?.attach(slot,fallback,{kind:'hood',...h},false,live);
  }
  group.position.set(f.x*S,f.y*S,f.z*S);group.rotation.y=-f.rotation*Math.PI/180;
  group.userData.ownedMaterials=Object.values(materials);return group;
}
