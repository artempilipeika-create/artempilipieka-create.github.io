import * as THREE from './vendor/three.module.js';

/** Retain the textured Tripo body behind a rebuilt, smooth appliance fascia. */
export function trimApplianceBody(source,maxZ=.43){
  const attributes=['position','normal','uv'],sizes=[3,3,2],output=[[],[],[]];
  const index=source.index?.array,count=index?.length??source.attributes.position.count;
  const vertex=i=>attributes.flatMap((name,k)=>Array.from({length:sizes[k]},(_,c)=>source.attributes[name].getComponent(i,c)));
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(n=>vertex(index?index[i+n]:i+n)),polygon=[];
    for(let n=0;n<3;n++){
      const a=triangle[n],b=triangle[(n+1)%3],inside=a[2]<=maxZ,next=b[2]<=maxZ;
      if(inside)polygon.push(a);
      if(inside!==next)polygon.push(mix(a,b,(maxZ-a[2])/(b[2]-a[2])));
    }
    for(let n=1;n<polygon.length-1;n++)for(const v of [polygon[0],polygon[n],polygon[n+1]]){
      output[0].push(...v.slice(0,3));
      const length=Math.hypot(...v.slice(3,6));output[1].push(...(length>1e-8?v.slice(3,6).map(x=>x/length):triangle[0].slice(3,6)));
      output[2].push(...v.slice(6,8));
    }
  }
  const geometry=new THREE.BufferGeometry();
  attributes.forEach((name,i)=>geometry.setAttribute(name,new THREE.Float32BufferAttribute(output[i],sizes[i])));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={...source.userData,frontTrim:maxZ};return geometry;
}

/** All dimensions below are presentation millimetres, normalized only at the end. */
export function buildApplianceFront(kind){
  if(!['oven','microwave'].includes(kind))throw Error('Unknown appliance front');
  const oven=kind==='oven',W=595,H=oven?593:378,D=oven?550:350,Z=D/2-22;
  const materials=[
    new THREE.MeshPhysicalMaterial({color:'#101517',roughness:.23,metalness:.18,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:.8}),
    new THREE.MeshStandardMaterial({color:'#b5babd',roughness:.34,metalness:.92,envMapIntensity:.8}),
    new THREE.MeshStandardMaterial({color:'#242a2c',roughness:.38,metalness:.35}),
    new THREE.MeshPhysicalMaterial({color:'#152228',roughness:.16,metalness:.28,clearcoat:1,clearcoatRoughness:.1,envMapIntensity:1.05}),
    new THREE.MeshStandardMaterial({color:'#9eb7ac',roughness:.5,emissive:'#719688',emissiveIntensity:.28}),
    new THREE.MeshStandardMaterial({color:'#080d0f',roughness:.48,metalness:.08})
  ];
  const parts=materials.map(()=>[]),components=[];
  const add=(geometry,material,x,y,z,name)=>{
    geometry.translate(x,y,z);parts[material].push(geometry);if(name)components.push(name);
  };
  // Inset the extruded shape by the bevel width so the exact outer envelope stays fixed.
  const panel=(w,h,d,r,x,y,z,material,name)=>{
    r=Math.min(r,d/2-.01,w/4,h/4);const a=w/2-r,b=h/2-r,shape=new THREE.Shape();
    shape.moveTo(-a,-b);shape.lineTo(a,-b);shape.lineTo(a,b);shape.lineTo(-a,b);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,steps:1,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:6,curveSegments:12});
    g.translate(0,0,-d/2+r);add(g,material,x,y,z,name);
  };
  const cylinder=(radius,length,x,y,z,material,name)=>{
    const g=new THREE.CylinderGeometry(radius,radius,length,64,1,false);g.rotateX(Math.PI/2);add(g,material,x,y,z,name);
  };
  const ring=(radius,tube,x,y,z,material)=>add(new THREE.TorusGeometry(radius,tube,12,64),material,x,y,z);
  const handle=(length,y,x=0)=>{
    const g=new THREE.CylinderGeometry(6,6,length,48,1,false);g.rotateZ(Math.PI/2);
    add(g,1,x,y,D/2-6,'smooth horizontal handle');
    for(const sign of [-1,1]){
      add(new THREE.SphereGeometry(6,24,16),1,x+sign*length/2,y,D/2-6);
      panel(12,16,13,2,x+sign*(length/2-25),y,Z+7,1);
    }
  };
  const dial=(x,y,r)=>{
    ring(r+2,1.1,x,y,Z+1,1);
    cylinder(r,12,x,y,Z+7,1,'64-segment rotary control');
    cylinder(r-1.4,1.2,x,y,Z+13.5,2);
    panel(1.3,5,.5,.2,x,y+r-4,Z+14.3,4);
  };
  const digit=(n,x,y,s=1)=>{
    const patterns=['abcedf','bc','abged','abgcd','fgbc','afgcd','afgecd','abc','abcdefg','abfgcd'];
    const bars={a:[0,6,6,1],g:[0,0,6,1],d:[0,-6,6,1],f:[-3,3,1,5],b:[3,3,1,5],e:[-3,-3,1,5],c:[3,-3,1,5]};
    for(const letter of patterns[n]){const [dx,dy,w,h]=bars[letter];panel(w*s,h*s,.4,.1,x+dx*s,y+dy*s,Z+1.9,4);}
  };
  const display=(x,y,w,h,s)=>{
    panel(w,h,1.2,.3,x,y,Z+.6,5,'digital display');
    [1,2,0,0].forEach((n,i)=>digit(n,x+(i-1.5)*12*s,y,s));
    for(const dy of [-2,2])panel(1.2*s,1.2*s,.4,.1,x,y+dy*s,Z+1.9,4);
  };

  panel(W,H,8,2,0,0,Z-4,0,'straight glass fascia');
  panel(W-6,6,1.4,.6,0,H/2-4,Z+.7,1,'straight upper trim');
  panel(W-6,9,1.4,.6,0,-H/2+5.5,Z+.7,1,'straight lower trim');
  if(oven){
    panel(583,95,1.2,.45,0,H/2-55,Z+.6,0,'control panel');
    panel(583,1,1,.3,0,H/2-105,Z+.5,2);
    display(0,H/2-54,108,34,1.2);
    for(const x of [-120,120])dial(x,H/2-54,12);
    panel(579,468,2,0.7,0,-55,Z+1,5,'door gasket');
    panel(570,457,2,.8,0,-55,Z+2,0,'smooth door');
    panel(466,330,1.2,.4,0,-73,Z+3.6,2,'window surround');
    panel(454,318,1.4,.5,0,-73,Z+4.8,3,'smoked glass window');
    // Faint inner frame adds depth without textured triangles or an opaque painted highlight.
    for(const x of [-214,214])panel(.8,290,.5,.1,x,-73,Z+5.6,2);
    for(const y of [-218,72])panel(428,.8,.5,.1,0,y,Z+5.6,2);
    handle(404,170);
  }else{
    panel(465,H-20,1.6,.6,-58,0,Z+.8,5,'door gasket');
    panel(455,H-30,2,.7,-58,0,Z+2,0,'smooth door');
    panel(391,235,1.2,.4,-58,-18,Z+3.6,2,'window surround');
    panel(381,225,1.4,.5,-58,-18,Z+4.8,3,'smoked glass window');
    panel(1,H-24,1,.3,180,0,Z+.5,2);
    display(233,91,82,36,1);
    dial(233,-68,17);
    for(const y of [27,-2])for(const x of [217,248])cylinder(3.5,.8,x,y,Z+1.2,2,'touch control');
    handle(378,143,-58);
  }

  const positions=[],normals=[],groups=[];
  parts.forEach((list,materialIndex)=>{
    const start=positions.length/3;
    for(const source of list){
      const g=source.index?source.toNonIndexed():source,p=g.attributes.position,n=g.attributes.normal;
      for(let i=0;i<p.count;i++){
        positions.push(p.getX(i)/W,p.getY(i)/H,p.getZ(i)/D);
        // Inverse-transpose compensation for the normalization, undone by placement scaling.
        const v=new THREE.Vector3(n.getX(i)*W,n.getY(i)*H,n.getZ(i)*D).normalize();normals.push(v.x,v.y,v.z);
      }
      if(g!==source)g.dispose();source.dispose();
    }
    groups.push({start,count:positions.length/3-start,materialIndex});
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  for(const group of groups)if(group.count)geometry.addGroup(group.start,group.count,group.materialIndex);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={visualOnly:true,kind,components,finish:'smooth-fascia-v1'};
  return {geometry,materials};
}
