import {bounds,elevation,heights,rotateXZ,tier} from './furniture-core.mjs';

export const formatMm=value=>Number.isInteger(value)?String(value):String(Math.round(value*10)/10).replace('.',',');
export function dimensionValue(it,axis){return axis==='height'?heights(it).overall_height_with_worktop:it[axis];}
export function dimensionEdit(it,axis,value){
  if(!['width','height','depth'].includes(axis)||!Number.isInteger(value)||value<=0)throw new Error('Введите положительный размер в целых миллиметрах');
  return {[axis]:value-(axis==='height'?heights(it).worktop_thickness:0)};
}
const local=(it,x,y,z)=>{const p=rotateXZ(x,z,it.rotation||0);return {x:it.x+p.x,y,z:it.z+p.z};};
const dot=(it,axis)=>it.x*axis.x+it.z*axis.z;

// Physical straight runs only: never sum across a gap, another tier or a corner return.
export function dimensionRuns(items,room){
  const remaining=new Set(items),runs=[];
  for(const first of items){
    if(!remaining.has(first))continue;
    const u=rotateXZ(1,0,first.rotation||0),n=rotateXZ(0,1,first.rotation||0);
    const aligned=items.filter(it=>remaining.has(it)&&(it.rotation||0)===(first.rotation||0)&&tier(it)===tier(first)&&
      (Math.abs(elevation(it,room)-elevation(first,room))<.6||Math.abs(elevation(it,room)+dimensionValue(it,'height')-elevation(first,room)-dimensionValue(first,'height'))<.6)&&
      (Math.abs(dot(it,n)-it.depth/2-dot(first,n)+first.depth/2)<.6||Math.abs(dot(it,n)+it.depth/2-dot(first,n)-first.depth/2)<.6))
      .sort((a,b)=>dot(a,u)-dot(b,u));
    let run;
    for(const it of aligned){
      remaining.delete(it);const lo=dot(it,u)-it.width/2,hi=dot(it,u)+it.width/2;
      if(run&&Math.abs(lo-run.hi)<.6){run.items.push(it);run.hi=hi;run.front=Math.max(run.front,dot(it,n)+it.depth/2);}
      else{run={items:[it],lo,hi,front:dot(it,n)+it.depth/2,u,n,level:elevation(it,room)};runs.push(run);}
    }
  }
  return runs;
}
export function sceneDimensions(items,room,selectedId){
  const result=[];
  for(const run of dimensionRuns(items,room)){
    const top=Math.max(...run.items.map(it=>elevation(it,room)+dimensionValue(it,'height')));
    const point=(x,y,z=run.front)=>({x:run.u.x*x+run.n.x*z,y,z:run.u.z*x+run.n.z*z});
    for(const it of run.items){
      const x=dot(it,run.u),y=elevation(it,room)+dimensionValue(it,'height'),w=it.width/2;
      result.push({id:it.item_id+':width',itemId:it.item_id,axis:'width',value:it.width,kind:'module',selected:it.item_id===selectedId,
        a:point(x-w,top),b:point(x+w,top),sourceA:local(it,-w,y,it.depth/2),sourceB:local(it,w,y,it.depth/2),out:point(x,top+200,run.front+100),offset:26});
    }
    const representative=run.items.find(it=>it.item_id===selectedId)||run.items[0],level=elevation(representative,room),height=dimensionValue(representative,'height');
    result.push({id:representative.item_id+':height',itemId:representative.item_id,axis:'height',value:height,kind:'module',selected:representative.item_id===selectedId,
      a:point(run.lo,level),b:point(run.lo,level+height),out:point(run.lo-200,level+height/2),offset:32});
    if(run.items.length>1)result.push({id:'run:'+run.items.map(it=>it.item_id).join(':'),kind:'run',value:run.hi-run.lo,
      a:point(run.lo,top),b:point(run.hi,top),out:point((run.lo+run.hi)/2,top+200,run.front+100),offset:65});
  }
  return result;
}
export function clearanceDimensions(it,items,room,ignoredIds=[]){
  const group=Array.isArray(it)?it:[it],boxes=group.map(it=>bounds(it,room));if(!boxes.length)return [];
  const b=Object.fromEntries(['X','Y','Z'].flatMap(axis=>[['min'+axis,Math.min(...boxes.map(b=>b['min'+axis]))],['max'+axis,Math.max(...boxes.map(b=>b['max'+axis]))]]));
  const level=b.minY,top=b.maxY,y=level+Math.min(150,(top-level)/2),ignored=new Set([...group.map(it=>it.item_id),...ignoredIds]);
  const obstacles=items.filter(other=>!ignored.has(other.item_id)&&elevation(other,room)<top-.5&&elevation(other,room)+heights(other).module_height>level+.5).map(other=>({other,b:bounds(other,room)}));
  const result=[];
  for(const [axis,sign,limit]of [['x',-1,-room.width/2],['x',1,room.width/2],['z',-1,-room.depth/2],['z',1,room.depth/2]]){
    const cross=axis==='x'?'z':'x',lo=axis==='x'?'minX':'minZ',hi=axis==='x'?'maxX':'maxZ',clo=cross==='x'?'minX':'minZ',chi=cross==='x'?'maxX':'maxZ';
    const edge=b[sign<0?lo:hi];let stop=limit,target='До стены',crossAt=(b[clo]+b[chi])/2;
    for(const o of obstacles){
      const overlapLo=Math.max(b[clo],o.b[clo]),overlapHi=Math.min(b[chi],o.b[chi]),near=o.b[sign<0?hi:lo];
      if(overlapHi-overlapLo>.5&&(near-edge)*sign>=-.5&&(near-edge)*sign<(stop-edge)*sign){stop=near;target='До «'+o.other.name+'»';crossAt=(overlapLo+overlapHi)/2;}
    }
    const value=(stop-edge)*sign;if(value<-.5)continue;
    const a={x:0,y,z:0},end={x:0,y,z:0};a[axis]=edge;end[axis]=stop;a[cross]=end[cross]=crossAt;
    result.push({id:'gap:'+axis+sign,kind:'gap',value:Math.max(0,value),title:target,a,b:end,out:{...a,y:y+200},offset:12});
  }
  return result;
}
