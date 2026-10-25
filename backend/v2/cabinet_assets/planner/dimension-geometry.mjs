import {bounds,elevation,heights,rotateXZ,tier,isTallModule,kitchenSettings} from './furniture-core.mjs';

export const formatMm=value=>Number.isInteger(value)?String(value):String(Math.round(value*10)/10).replace('.',',');
export function dimensionValue(it,axis){return axis==='height'?heights(it).overall_height_with_worktop:it[axis];}
export function dimensionEdit(it,axis,value){
  if(!['width','height','depth'].includes(axis)||!Number.isInteger(value*(axis==='depth'&&isTallModule(it)?2:1))||value<=0)throw new Error(axis==='depth'&&isTallModule(it)?'Введите глубину с шагом 0,5 мм':'Введите положительный размер в целых миллиметрах');
  return {[axis]:value-(axis==='height'?heights(it).worktop_thickness:0)};
}
const local=(it,x,y,z)=>{const p=rotateXZ(x,z,it.rotation||0);return {x:it.x+p.x,y,z:it.z+p.z};};
const dot=(it,axis)=>it.x*axis.x+it.z*axis.z;
const backDatum=it=>dot(it,rotateXZ(0,1,it.rotation||0))-it.depth/2-(kitchenSettings(it)?.rearServiceGapMm||0);

// Physical straight runs only: never sum across a gap, another tier or a corner return.
export function dimensionRuns(items,room){
  const remaining=new Set(items),runs=[];
  for(const first of items){
    if(!remaining.has(first))continue;
    const u=rotateXZ(1,0,first.rotation||0),n=rotateXZ(0,1,first.rotation||0);
    const aligned=items.filter(it=>remaining.has(it)&&(it.rotation||0)===(first.rotation||0)&&tier(it)===tier(first)&&
      (Math.abs(elevation(it,room)-elevation(first,room))<.6||Math.abs(elevation(it,room)+dimensionValue(it,'height')-elevation(first,room)-dimensionValue(first,'height'))<.6)&&
      (Math.abs(backDatum(it)-backDatum(first))<.6||Math.abs(dot(it,n)-it.depth/2-dot(first,n)+first.depth/2)<.6||Math.abs(dot(it,n)+it.depth/2-dot(first,n)-first.depth/2)<.6))
      .sort((a,b)=>dot(a,u)-dot(b,u));
    let run;
    for(const it of aligned){
      remaining.delete(it);const lo=dot(it,u)-it.width/2,hi=dot(it,u)+it.width/2;
      if(run&&Math.abs(lo-run.hi)<.6){run.items.push(it);run.hi=hi;run.back=Math.min(run.back,backDatum(it));}
      else{run={items:[it],lo,hi,back:backDatum(it),u,n,level:elevation(it,room)};runs.push(run);}
    }
  }
  return runs;
}
// Overall installation extent along each rear line. Deliberate gaps count, and
// a perpendicular cabinet contributes its footprint only where it meets that
// line. An island or an opposite wall must not enlarge another wall's total.
export function overallDimensions(items,room){
  const groups=[];
  for(const it of items){
    const back=backDatum(it),rotation=it.rotation||0,level=elevation(it,room),top=level+dimensionValue(it,'height');
    let g=groups.find(g=>g.rotation===rotation&&g.tier===tier(it)&&Math.abs(g.back-back)<.6);
    if(!g){g={rotation,tier:tier(it),back,items:[],top};groups.push(g);}
    g.items.push(it);g.top=Math.max(g.top,top);
  }
  return groups.flatMap(g=>{
    const u=rotateXZ(1,0,g.rotation),n=rotateXZ(0,1,g.rotation),members=[...g.items];
    const points=it=>{
      const k=kitchenSettings(it),rear=k?-it.depth/2-k.rearServiceGapMm:-it.depth/2;
      const front=k&&k.countertopEnabled?rear+k.countertopDepthMm:it.depth/2;
      return [-it.width/2,it.width/2].flatMap(x=>[rear,front].map(z=>local(it,x,0,z)));
    };
    const interval=(it,axis)=>{const values=points(it).map(p=>dot(p,axis));return [Math.min(...values),Math.max(...values)];};
    let lo=Math.min(...g.items.map(it=>interval(it,u)[0])),hi=Math.max(...g.items.map(it=>interval(it,u)[1]));
    for(const it of items){
      if(members.includes(it)||tier(it)!==g.tier||Math.abs(((it.rotation||0)-g.rotation)%180)!==90)continue;
      const [near,far]=interval(it,n),[left,right]=interval(it,u);
      if(Math.abs(near-g.back)<.6||Math.abs(far-g.back)<.6){
        members.push(it);lo=Math.min(lo,left);hi=Math.max(hi,right);g.top=Math.max(g.top,elevation(it,room)+dimensionValue(it,'height'));
      }
    }
    if(members.length<2)return [];
    const point=(x,y)=>({x:u.x*x+n.x*g.back,y,z:u.z*x+n.z*g.back});
    return [{id:'overall:'+g.rotation+':'+g.items.map(it=>it.item_id).sort().join(':'),kind:'run',overall:true,value:hi-lo,
      a:point(lo,g.top),b:point(hi,g.top),out:point((lo+hi)/2,g.top+200),offset:65}];
  });
}
export function sceneDimensions(items,room,selectedId){
  const result=[];
  for(const run of dimensionRuns(items,room)){
    const top=Math.max(...run.items.map(it=>elevation(it,room)+dimensionValue(it,'height')));
    const point=(x,y,z=run.back)=>({x:run.u.x*x+run.n.x*z,y,z:run.u.z*x+run.n.z*z});
    for(const it of run.items){
      const x=dot(it,run.u),y=elevation(it,room)+dimensionValue(it,'height'),w=it.width/2;
      result.push({id:it.item_id+':width',itemId:it.item_id,axis:'width',value:it.width,kind:'module',selected:it.item_id===selectedId,
        a:point(x-w,top),b:point(x+w,top),sourceA:point(x-w,y),sourceB:point(x+w,y),out:point(x,top+200),offset:26});
    }
    const representative=run.items.find(it=>it.item_id===selectedId)||run.items[0],level=elevation(representative,room),height=dimensionValue(representative,'height');
    result.push({id:representative.item_id+':height',itemId:representative.item_id,axis:'height',value:height,kind:'module',selected:representative.item_id===selectedId,
      a:point(run.lo,level),b:point(run.lo,level+height),out:point(run.lo-200,level+height/2),offset:32});
  }
  return result.concat(overallDimensions(items,room));
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
