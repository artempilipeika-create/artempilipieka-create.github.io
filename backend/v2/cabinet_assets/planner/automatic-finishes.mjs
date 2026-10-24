import {kitchenRuns,rotateXZ} from './furniture-core.mjs';
const mm=n=>Math.round(n*10000)/10000;
const vector=(x,z,r)=>{const p=rotateXZ(x,z,r);return {x:Math.round(p.x),z:Math.round(p.z)};};
const wall=n=>n.z===1?'a':n.z===-1?'c':n.x===-1?'b':'d';
// Use the exposed back boundary of the same rectangles used by the countertop.
// This includes the corner cabinet behind a perpendicular return, but never
// bridges a real gap or a module whose countertop/backsplash is disabled.
export function automaticPanelSegments(state,settings){
 const excluded=new Set(settings.excluded_members||[]);
 const items=(state.items||[]).map(it=>excluded.has(it.item_id)?{...it,countertopEnabled:false}:it);
 const runs=kitchenRuns(items,state.room),rects=[],backs=[];
 for(const run of runs){
  const n=vector(0,1,run.rotation),parts=run.parts.filter(p=>p.role==='counter');
  if(!parts.length)continue;
  for(const p of parts){
   const center=rotateXZ(p.position.x,p.position.z,run.rotation),swap=run.rotation%180!==0;
   const x=run.position.x+center.x,z=run.position.z+center.z,dx=(swap?p.size.z:p.size.x)/2,dz=(swap?p.size.x:p.size.z)/2,bottom=p.position.y+p.size.y/2;
   rects.push({x0:mm(x-dx),x1:mm(x+dx),z0:mm(z-dz),z1:mm(z+dz),bottom});
   backs.push({n,plane:mm(n.x?run.position.x:run.position.z),bottom});
  }
 }
 const groups=new Map();
 for(const a of rects){
  for(const [n,plane,lo,hi]of [[{x:0,z:1},a.z0,a.x0,a.x1],[{x:0,z:-1},a.z1,a.x0,a.x1],[{x:1,z:0},a.x0,a.z0,a.z1],[{x:-1,z:0},a.x1,a.z0,a.z1]]){
   if(!backs.some(b=>b.bottom===a.bottom&&b.n.x===n.x&&b.n.z===n.z&&Math.abs(b.plane-plane)<.01))continue;
   let intervals=[[lo,hi]];
   // Remove edges buried inside an adjacent rectangle, including stock seams.
   const outside=plane-(n.x||n.z)*.1;
   for(const b of rects){
    if(b===a||b.bottom!==a.bottom)continue;
    if(n.x?outside<=b.x0||outside>=b.x1:outside<=b.z0||outside>=b.z1)continue;
    const l=n.x?b.z0:b.x0,h=n.x?b.z1:b.x1;
    intervals=intervals.flatMap(([s,e])=>h<=s||l>=e?[[s,e]]:[[s,Math.max(s,l)],[Math.min(e,h),e]].filter(([x,y])=>y-x>.01));
   }
   const key=[n.x,n.z,plane,a.bottom].join(':');
   if(!groups.has(key))groups.set(key,{n,plane,bottom:a.bottom,intervals:[]});
   groups.get(key).intervals.push(...intervals);
  }
 }
 const out=[];
 for(const g of groups.values()){
  const merged=[];
  for(const pair of g.intervals.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&pair[0]<=last[1]+.01)last[1]=Math.max(last[1],pair[1]);else merged.push([...pair]);}
  for(const [lo,hi]of merged)out.push({name:'Участок '+(out.length+1),x:g.n.x?g.plane:lo,z:g.n.x?lo:g.plane,u:g.n.x?{x:0,z:1}:{x:1,z:0},n:g.n,length:mm(hi-lo),height:settings.height,bottom:g.bottom,thickness:settings.thickness,host:wall(g.n)});
 }
 // Horizontal panels run through the internal corner; vertical panels butt
 // against their finished face. Unequal U arms therefore remain independent.
 for(const v of out.filter(s=>s.u.z))for(const h of out.filter(s=>s.u.x)){
  if(v.bottom!==h.bottom||v.x<h.x-.01||v.x>h.x+h.length+.01)continue;
  if(h.n.z===1&&Math.abs(v.z-h.z)<.01){v.z+=h.thickness;v.length-=h.thickness;}
  if(h.n.z===-1&&Math.abs(v.z+v.length-h.z)<.01)v.length-=h.thickness;
 }
 return out.filter(s=>s.length>.01);
}
