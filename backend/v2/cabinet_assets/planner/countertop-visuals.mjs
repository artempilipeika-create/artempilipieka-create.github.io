import * as THREE from './vendor/three.module.js';

// Presentation geometry only. The FR3D contours, dimensions and cut lists stay intact.
const S=.001,EPS=.08,FRONT_RADIUS=4;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;
function edge(a,b){const d=sub(b,a),length=Math.hypot(...d);return{a,b,length,t:d.map(v=>v/length),n:[d[1]/length,-d[0]/length]};}
export function countertopContour(part){
  const p=part.position,d=part.size;
  let points=(part.contour||[[p.x-d.x/2,p.z-d.z/2],[p.x+d.x/2,p.z-d.z/2],[p.x+d.x/2,p.z+d.z/2],[p.x-d.x/2,p.z+d.z/2]]).map(p=>[...p]);
  points=points.filter((p,i)=>Math.hypot(...sub(p,points[(i+1)%points.length]))>.001);
  return area(points)<0?points.reverse():points;
}
function world(p,run){const a=run.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[run.position.x+p[0]*c-p[1]*s,run.position.z+p[0]*s+p[1]*c];}

/** Split exposed edges at actual contacts, including partial L/U returns and stock joins. */
export function countertopSurfaces(runs){
  const nodes=runs.flatMap(run=>run.parts.filter(p=>p.role==='counter').map(part=>{
    const points=countertopContour(part),wp=points.map(p=>world(p,run));
    return{part,points,worldEdges:wp.map((p,i)=>edge(p,wp[(i+1)%wp.length]))};
  })),surfaces=new Map();
  nodes.forEach((node,index)=>{
    const points=[],radii=[],joints=[];
    node.points.forEach((a,i)=>{
      const b=node.points[(i+1)%node.points.length],local=edge(a,b),e=node.worldEdges[i],contacts=[];
      nodes.forEach((other,j)=>{
        if(index===j||Math.abs(other.part.position.y-node.part.position.y)>EPS||Math.abs(other.part.thickness-node.part.thickness)>EPS)return;
        for(const o of other.worldEdges){
          if(dot(e.n,o.n)>-.99999||Math.abs(dot(sub(o.a,e.a),e.n))>EPS||Math.abs(dot(sub(o.b,e.a),e.n))>EPS)continue;
          const ts=[dot(sub(o.a,e.a),e.t),dot(sub(o.b,e.a),e.t)].sort((a,b)=>a-b);
          const lo=Math.max(0,ts[0]),hi=Math.min(e.length,ts[1]);if(hi-lo>EPS)contacts.push({lo,hi,owner:index<j});
        }
      });
      const cuts=[...new Set([0,e.length,...contacts.flatMap(c=>[c.lo,c.hi])].map(v=>Math.round(v*10000)/10000))].sort((a,b)=>a-b);
      for(let k=0;k<cuts.length-1;k++){
        const lo=cuts[k],hi=cuts[k+1];if(hi-lo<.001)continue;
        const contact=contacts.find(c=>(lo+hi)/2>=c.lo-EPS&&(lo+hi)/2<=c.hi+EPS);
        const start=mix(a,b,lo/e.length),end=mix(a,b,hi/e.length);
        points.push(start);radii.push(contact?0:local.n[1]>.999?FRONT_RADIUS:local.n[1]<-.999?.35:.65);
        if(contact?.owner)joints.push([start,end]);
      }
    });
    surfaces.set(node.part,{points,radii,joints});
  });
  return surfaces;
}

function profile(y,r,h){
  if(!r)return{inset:0,horizontal:1,vertical:0,travel:h-y};
  const fromEnd=Math.min(y,h-y);
  if(fromEnd>=r)return{inset:0,horizontal:1,vertical:0,travel:r*Math.PI/2+h-r-y};
  const vertical=(r-fromEnd)/r,horizontal=Math.sqrt(Math.max(0,1-vertical*vertical));
  return{inset:r*(1-horizontal),horizontal,vertical:vertical*(y>h/2?1:-1),
    travel:y>h/2?r*Math.acos(vertical):r*Math.PI/2+h-2*r+r*Math.asin(vertical)};
}

/** A closed, softly postformed 38 mm slab, wholly within the production footprint. */
export function countertopGeometry(surface,thickness=38){
  const points=[],radii=[];
  // A short termination prevents a rounding on an exposed edge entering a shared seam.
  surface.points.forEach((p,i)=>{
    const b=surface.points[(i+1)%surface.points.length],r=surface.radii[i],e=edge(p,b),cuts=[0];
    if(r>0&&e.length>FRONT_RADIUS*4){cuts.push(FRONT_RADIUS*1.5,e.length-FRONT_RADIUS*1.5);}
    for(const d of cuts){points.push(mix(p,b,d/e.length));radii.push(Math.min(r,thickness/4));}
  });
  const edges=points.map((p,i)=>edge(p,points[(i+1)%points.length]));
  const levels=new Set([0,thickness]);
  for(const r of new Set(radii))if(r)for(let i=0;i<=8;i++){
    const y=r*(1-Math.cos(i*Math.PI/16));levels.add(y);levels.add(thickness-y);
  }
  const ys=[...levels].sort((a,b)=>a-b),rings=ys.map(y=>points.map((p,i)=>{
    const prev=(i+points.length-1)%points.length,a=edges[prev].n,b=edges[i].n;
    const da=profile(y,radii[prev],thickness).inset,db=profile(y,radii[i],thickness).inset,det=a[0]*b[1]-a[1]*b[0];
    let dx,dz;
    if(Math.abs(det)<1e-6){const d=Math.min(da,db);dx=-b[0]*d;dz=-b[1]*d;}
    else{dx=(-da*b[1]+a[1]*db)/det;dz=(-a[0]*db+da*b[0])/det;}
    return[p[0]+dx,y,p[1]+dz];
  }));
  const positions=[],normals=[],uvs=[],colors=[];
  const vertex=(p,n,uv)=>({p:p.map(v=>v*S),n,uv:uv.map(v=>v*S)});
  const triangle=(a,b,c)=>{
    const ab=new THREE.Vector3(...b.p).sub(new THREE.Vector3(...a.p)),ac=new THREE.Vector3(...c.p).sub(new THREE.Vector3(...a.p));
    if(ab.cross(ac).dot(new THREE.Vector3(...a.n).add(new THREE.Vector3(...b.n)).add(new THREE.Vector3(...c.n)))<0)[b,c]=[c,b];
    for(const v of[a,b,c]){positions.push(...v.p);normals.push(...v.n);uvs.push(...v.uv);const shade=.91+.09*Math.max(0,v.n[1]);colors.push(shade,shade,shade);}
  };
  for(let i=0;i<points.length;i++){
    const j=(i+1)%points.length,e=edges[i],r=radii[i];
    const v=(k,at)=>{
      const p=rings[k][at],f=profile(ys[k],r,thickness),n=[e.n[0]*f.horizontal,f.vertical,e.n[1]*f.horizontal];
      // The same laminate runs over the front radius without a UV flip or scale change.
      const uv=e.n[1]>.999?[e.a[1]-r+f.travel,p[0]]:Math.abs(e.n[0])>.99?[p[2],e.a[0]-e.n[0]*r+e.n[0]*f.travel]:[p[2],p[0]];
      return vertex(p,n,uv);
    };
    for(let k=0;k<ys.length-1;k++){triangle(v(k,i),v(k,j),v(k+1,j));triangle(v(k,i),v(k+1,j),v(k+1,i));}
  }
  for(const [k,sign]of [[0,-1],[ys.length-1,1]]){
    const ring=rings[k],contour=ring.map(p=>new THREE.Vector2(p[0],p[2]));
    for(const face of THREE.ShapeUtils.triangulateShape(contour,[]))triangle(...face.map(i=>vertex(ring[i],[0,sign,0],[ring[i][2],ring[i][0]])));
  }
  const g=new THREE.BufferGeometry();
  for(const [name,array,size]of [['position',positions,3],['normal',normals,3],['uv',uvs,2],['color',colors,3]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
  g.computeBoundingBox();g.computeBoundingSphere();g.userData={visualOnly:true,profile:'postformed-38',frontRadiusMM:FRONT_RADIUS,thicknessMM:thickness};
  return g;
}
