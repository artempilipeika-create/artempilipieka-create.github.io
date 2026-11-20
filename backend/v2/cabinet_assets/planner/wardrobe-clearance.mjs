// The drawing, the moving meshes and the clearance test share one hinge pivot.
// All dimensions below are millimetres. Operating poses never alter saved parts.
import * as THREE from './vendor/three.module.js';
import {wallPanels,WALLS} from './room-plan.mjs';
import aks from './aks-wardrobe.json' with {type:'json'};
import {installedSide} from './wardrobe-hinge-layout.mjs';
import {doorLabel,doorSide} from './wardrobe-door-layout.mjs';

const rad=Math.PI/180,zero=[0,0,0],epsilon=.00001;
export const maxOpening=105; // PRIME by AKS 112595, manufacturer opening angle.
export const slidingKey=item=>item?.item_id?.match(/:drawer-(\d+-\d+)-(?:face|front|rear|bottom|side-left|side-right)$/)?.[1]??null;
export const leafKey=it=>it?.assistant_carcass?it.item_id.slice(it.assistant_carcass.group_id.length+1):'';

export function hingePose(it,degrees){
 const sign=installedSide(it.assistant_carcass?.spec?.front,leafKey(it))==='left'?-1:1;
 const a=sign*degrees*rad,c=Math.cos(a),s=Math.sin(a);
 const x=sign*(it.width/2-1.5),z=it.depth/2;
 return {a,dx:x*(1-c)-z*s,dz:z*(1-c)+x*s};
}

const add=(a,b,t=1)=>[a[0]+t*b[0],a[1]+t*b[1],a[2]+t*b[2]];
const sub=(a,b)=>add(a,b,-1);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const rotate=(p,c,s)=>[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];
const point=(p,c,s,origin)=>add(rotate(p,c,s),origin);
const unitAxes=[[1,0,0],[0,1,0],[0,0,1]];
function projection(points,axis){
 let lo=Infinity,hi=-Infinity;
 for(const p of points){const x=dot(p,axis);lo=Math.min(lo,x);hi=Math.max(hi,x);}
 return [lo,hi];
}
// Continuous separating-axis interval for a convex object translated along v.
// This also detects a drawer passing entirely through a thin, partly open door.
function hitTime(a,b,v){
 let lo=0,hi=1;
 function separate(axis){
  const size=Math.hypot(...axis);if(size<epsilon)return false;
  const tolerance=epsilon*size,[amin,amax]=projection(a.p,axis),[bmin,bmax]=projection(b.p,axis);
  const velocity=dot(v,axis);
  if(Math.abs(velocity)<tolerance){
   if(amax<bmin-tolerance||bmax<amin-tolerance)return true;
   if(amax-amin>tolerance&&bmax-bmin>tolerance&&(amax<=bmin+tolerance||bmax<=amin+tolerance))return true;
   return false;
  }
  let enter=(bmin-amax)/velocity,leave=(bmax-amin)/velocity;
  if(enter>leave)[enter,leave]=[leave,enter];
  lo=Math.max(lo,enter);hi=Math.min(hi,leave);
  return lo>hi+1e-9;
 }
 for(const n of a.normals)if(separate(n))return null;
 for(const n of b.normals)if(separate(n))return null;
 for(const u of a.edges)for(const w of b.edges)if(separate(cross(u,w)))return null;
 if(a.p.length===3&&b.p.length===3){
  // Coplanar triangles also need axes in their plane.
  for(const e of [...a.edges,...b.edges])if(separate(cross(a.normals[0],e)))return null;
 }
 return hi<=epsilon&&dot(v,v)>epsilon?null:lo;
}
function triangle(a,b,c){
 const edges=[sub(b,a),sub(c,b),sub(a,c)],n=cross(edges[0],edges[1]);
 return Math.hypot(...n)>epsilon?{p:[a,b,c],edges,normals:[n]}:null;
}
const frontMeshes=new WeakMap(),mountedMeshes=new WeakMap();
function fronts(group,mounted=false){
 const meshCache=mounted?mountedMeshes:frontMeshes;
 if(!group)return [];
 if(meshCache.has(group))return meshCache.get(group);
 group.updateWorldMatrix(true,true);
 const inverse=group.matrixWorld.clone().invert(),wood=new THREE.Box3(),solids=[];
 group.traverse(m=>{
  if(!m.isMesh)return;
  const hinge=m.userData.hingePart===(mounted?'body':'cup');
  const metal=hinge||!mounted&&m.userData.frontAccessory&&m.userData.article;
  if(!metal&&(mounted||m.userData.role!=='front'))return;
  const transform=inverse.clone().multiply(m.matrixWorld),g=m.geometry;
  if(!g?.attributes?.position)return;
  if(!g.boundingBox)g.computeBoundingBox();
  const rect=g.boundingBox.clone().applyMatrix4(transform);
  if(!metal){wood.union(rect);return;}
  const v=new THREE.Vector3(),attr=g.attributes.position,pts=[];
  for(let i=0;i<attr.count;i++)pts.push(v.fromBufferAttribute(attr,i).applyMatrix4(transform).multiplyScalar(1000).toArray());
  solids.push({lo:rect.min.multiplyScalar(1000).toArray(),hi:rect.max.multiplyScalar(1000).toArray(),
   label:(hinge?'Петля ':'Ручка ')+m.userData.article,vertices:pts,indices:g.index?.array});
 });
 if(!wood.isEmpty())solids.unshift({lo:wood.min.multiplyScalar(1000).toArray(),hi:wood.max.multiplyScalar(1000).toArray()});
 meshCache.set(group,solids);return solids;
}
function placed(name,local,yaw,origin){
 const c=Math.cos(yaw),s=Math.sin(yaw),{lo,hi}=local,p=[];
 for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]])p.push(point([x,y,z],c,s,origin));
 const axes=unitAxes.map(a=>rotate(a,c,s)),extent=unitAxes.map(a=>projection(p,a));
 const body={name,p,edges:axes,normals:axes,extent};
 if(local.vertices){
  body.facets=()=>{
   if(body.tris)return body.tris;
   const pts=local.vertices.map(v=>point(v,c,s,origin)),idx=local.indices,n=idx?.length??pts.length;
   const tris=[];for(let i=0;i<n;i+=3){const t=triangle(pts[idx?.[i]??i],pts[idx?.[i+1]??i+1],pts[idx?.[i+2]??i+2]);if(t)tris.push(t);}
   body.tris=tris;return tris;
  };
 }
 return body;
}
// Clip in three dimensions so that curved or asymmetric handles mark the
// actual metal contact. An empty space inside the handle is valid clearance.
function clip(poly,normal,bound,sign){
 const result=[],tol=epsilon*Math.hypot(...normal);
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dp=sign*(dot(normal,p)-bound),dq=sign*(dot(normal,q)-bound);
  if(dp>=-tol)result.push(p);
  if(dp*dq<0)result.push(add(p,sub(q,p),dp/(dp-dq)));
 }
 return result;
}
const average=poly=>poly.reduce((sum,p)=>add(sum,p,1/poly.length),zero);
function facetContact(a,b,v,t){
 const movingTriangle=a.p.length===3,movable=movingTriangle?a:b,other=movingTriangle?b:a;
 let poly=movable.p.map(p=>movingTriangle?add(p,v,t):p);
 const points=other.p.map(p=>movingTriangle?p:add(p,v,t));
 if(points.length===3){
  const n=other.normals[0],level=dot(n,points[0]);
  poly=clip(clip(poly,n,level,1),n,level,-1);
  for(let i=0;i<3;i++){
   const normal=cross(n,other.edges[i]);
   poly=clip(poly,normal,dot(normal,points[i]),Math.sign(dot(normal,sub(points[(i+2)%3],points[i]))));
  }
 }else for(const n of other.normals){
  const [lo,hi]=projection(points,n);poly=clip(clip(poly,n,lo,1),n,hi,-1);
 }
 return poly.length?average(poly):null;
}
function meet(a,b,v){
 for(let i=0;i<3;i++){
  const [lo,hi]=a.extent[i],[otherLow,otherHigh]=b.extent[i];
  if(hi+Math.max(v[i],0)<otherLow-epsilon||lo+Math.min(v[i],0)>otherHigh+epsilon)return null;
 }
 const broad=hitTime(a,b,v);if(broad===null)return null;
 let time=Infinity,facetA,facetB;
 if(!a.facets&&!b.facets)time=broad;
 else{
  const aa=a.facets?a.facets():[a],bb=b.facets?b.facets():[b];
  for(const u of aa){
   if(aa.length>1&&bb.length>1&&hitTime(u,b,v)===null)continue;
   for(const w of bb){
    const t=hitTime(u,w,v);
    if(t!==null&&t<time){time=t;facetA=u;facetB=w;}
    if(time===0)break;
   }
   if(time===0)break;
  }
 }
 if(!Number.isFinite(time))return null;
 if(facetA){
  const p=facetContact(facetA,facetB,v,time);
  if(p)return {time,point:p,moving:a.name,obstacle:b.name};
 }
 // Clip the two oriented rectangles in plan. The marker sits in their shared
 // contact area, including at a room corner or along a rotated drawer edge.
 const corners=body=>[body.p[0],body.p[1],body.p[5],body.p[4]];
 let poly=corners(a).map(p=>add(p,v,time));
 for(const normal of [b.normals[0],b.normals[2]]){
  const [low,high]=projection(b.p,normal);
  poly=clip(clip(poly,normal,low,1),normal,high,-1);
 }
 const [ay,by]=[projection(a.p,unitAxes[1]),projection(b.p,unitAxes[1])];
 const center=poly.length?average(poly):add(a.p[0],v,time);
 center[1]=(Math.max(ay[0],by[0])+Math.min(ay[1],by[1]))/2;
 return {time,point:center,moving:a.name,obstacle:b.name};
}
function shapes(it,angle=0,slide=0,group){
 const door=doorSide(leafKey(it)),base=-(it.rotation||0)*rad;
 const pose=door?hingePose(it,angle):{a:0,dx:0,dz:0};
 const origin=point([pose.dx,0,pose.dz+slide],Math.cos(base),Math.sin(base),[it.x,it.elevation_mm??0,it.z]);
 const drawer=slidingKey(it);
 const name=door?doorLabel(leafKey(it)):drawer?'Шуфляда '+(Number(drawer.split('-')[1])+1):it.name||'Соседний корпус';
 const local=it.blank_axis==='front'?fronts(group):[];
 const stock={lo:[-it.width/2,0,-it.depth/2],hi:[it.width/2,it.height,it.depth/2]};
 return (local.length&&local.some(p=>!p.vertices)?local:[stock,...local]).map(part=>placed(part.label||name,part,base+pose.a,origin));
}
function roomSolids(room){
 const solids=[];if(!room?.width||!room.depth||!room.height)return solids;
 for(const wall of Object.keys(WALLS))for(const p of wallPanels(room,wall)){
  const xwall=wall==='b'||wall==='d',sign=wall==='a'||wall==='d'?-1:1;
  const wallAxis=(xwall?room.width:room.depth)*sign/2;
  const along=p.offset-(xwall?room.depth:room.width)/2;
  // Continue the solid outside the room. A leaf cannot tunnel through a thin
  // plane at the end of its swing. Wall cutouts retain their measured heights.
  const near=Math.min(wallAxis,wallAxis+10000*sign),far=Math.max(wallAxis,wallAxis+10000*sign);
  const lo=xwall?[near,p.elevation,along]:[along,p.elevation,near];
  const hi=xwall?[far,p.elevation+p.height,along+p.width]:[along+p.width,p.elevation+p.height,far];
  solids.push(placed('Стена '+WALLS[wall],{lo,hi},0,zero));
 }
 return solids;
}
export function drawerStroke(items,id,key){
 const side=items.find(it=>it.assistant_carcass?.group_id===id&&it.item_id===id+':drawer-'+key+'-side-left');
 if(!side)return 0;
 // The enumerated PRIME rails are full extension. Unspecified old assemblies
 // keep their historical display travel; their hardware cannot be identified.
 if(side.assistant_carcass.spec?.drawerBanks?.[Number(key.split('-')[0])]?.railFamily==='concealed')return side.depth+10;
 return aks.rails[side.depth]&&side.assistant_carcass.spec?.drawerBanks?.[Number(key.split('-')[0])]?side.depth:side.depth*.82;
}

export function clearanceSession(items,entries,room,motion){
 const group=it=>entries?.get(it.item_id)?.group;
 const own=it=>it.assistant_carcass?.group_id===motion.id;
 const leaves=items.filter(it=>doorSide(leafKey(it)));
 const doors=(except)=>leaves.filter(it=>it!==except).flatMap(it=>shapes(it,own(it)?motion.degrees(it.item_id):0,0,group(it)));
 // Other cabinets may use integrated fronts, rather than individual door blanks.
 const neighboring=items.filter(it=>it.module_type!=='blank'&&!own(it)&&!it.assistant_carcass&&it.width&&it.depth&&it.height);
 const walls=roomSolids(room);
 const faces=items.filter(it=>slidingKey(it)&&it.item_id.endsWith('-face'));
 function first(movable,obstacles,v){
  let result=null;
  for(const a of movable)for(const b of obstacles){
   const h=meet(a,b,v);if(h&&(!result||h.time<result.time))result=h;
   if(result?.time===0)return result;
  }
  return result;
 }
 function drawerPieces(key,slide){
  return items.filter(it=>own(it)&&slidingKey(it)===key).flatMap(it=>shapes(it,0,slide,group(it)));
 }
 function drawer(key){
  const face=items.find(it=>own(it)&&it.item_id.endsWith(':drawer-'+key+'-face'));
  if(!face)return null;
  const travel=drawerStroke(items,motion.id,key),yaw=-(face.rotation||0)*rad;
  const fixed=items.filter(it=>own(it)&&it.blank_axis==='side').flatMap(it=>fronts(group(it),true)
   .map(p=>placed(p.label,p,-(it.rotation||0)*rad,[it.x,it.elevation_mm,it.z])));
  return first(drawerPieces(key,0),[...doors(),...fixed,...walls],rotate([0,0,travel],Math.cos(yaw),Math.sin(yaw)));
 }
 function swing(leaf,from,to){
  const movingDrawer=motion.shown&&motion.extension>0?drawerPieces(motion.shown,motion.extension*drawerStroke(items,motion.id,motion.shown)):[];
  const closedFaces=faces.filter(it=>!own(it)||slidingKey(it)!==motion.shown||!motion.extension);
  const obstacles=[...doors(leaf),...walls,...movingDrawer,...closedFaces.flatMap(it=>shapes(it,0,0,group(it))),...neighboring.flatMap(it=>shapes(it,0,0,group(it)))];
  const at=deg=>first(shapes(leaf,deg,0,group(leaf)),obstacles,zero);
  const distance=to-from;
  if(!distance)return {degrees:to,contact:at(to)};
  // Sample the sweep at sub-millimetre angular increments at the outer corner,
  // then refine the first contact to a hundredth of a degree.
  const steps=Math.ceil(Math.abs(distance)/Math.min(1,60/Math.max(60,leaf.width)));
  const initial=at(from);let last=from,wasBlocked=Boolean(initial);
  for(let i=1;i<=steps;i++){
   const next=from+distance*i/steps,h=at(next);
   if(!h){wasBlocked=false;last=next;continue;}
   if(wasBlocked)continue; // Allow an existing overlap to be cleared.
   let good=last,bad=next,contact=h;
   while(Math.abs(bad-good)>.01){
    const mid=(good+bad)/2,hit=at(mid);if(hit){bad=mid;contact=hit;}else good=mid;
   }
   return {degrees:Math.abs(good-Math.round(good))<.01?Math.round(good):(distance>0?Math.floor(good*10):Math.ceil(good*10))/10,contact};
  }
  return wasBlocked?{degrees:from,contact:initial}:{degrees:to,contact:null};
 }
 return {drawer,swing};
}
