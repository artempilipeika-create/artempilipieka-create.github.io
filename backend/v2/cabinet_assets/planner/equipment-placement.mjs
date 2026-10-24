import {featureBox,featureError,wallLength,FEATURES} from './room-plan.mjs';
import {bounds,overlaps,kitchenSettings,rotateXZ} from './furniture-core.mjs';
export const MOVABLE_EQUIPMENT=Object.freeze(['gas_cooker','radiator','gas_boiler','water_heater']);
export const isEquipment=f=>Boolean(f&&[...MOVABLE_EQUIPMENT,'window'].includes(typeof f==='string'?f:f.kind));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function equipmentBounds(f,room){const b=featureBox(f,room);return {minX:b.x-b.w/2,maxX:b.x+b.w/2,minY:b.y-b.h/2,maxY:b.y+b.h/2,minZ:b.z-b.d/2,maxZ:b.z+b.d/2};}
export function equipmentError(f,room,items=[]){
  const invalid=featureError(f,room);if(invalid||f.kind==='window')return invalid;const b=equipmentBounds(f,room);
  for(const other of room.features||[])if(other.id!==f.id&&['shaft','column',...MOVABLE_EQUIPMENT].includes(other.kind)&&other.projection>0&&overlaps(b,equipmentBounds(other,room)))return 'Пересечение: '+(other.label||FEATURES[other.kind][0]);
  for(const it of items){
    const box=bounds(it,room);if(overlaps(b,box))return 'Пересечение: '+it.name;
    const k=kitchenSettings(it);if(k?.countertopEnabled){
      const points=[];for(const x of[-it.width/2,it.width/2])for(const z of[-it.depth/2-k.rearServiceGapMm,-it.depth/2-k.rearServiceGapMm+k.countertopDepthMm]){const p=rotateXZ(x,z,it.rotation||0);points.push({x:p.x+it.x,z:p.z+it.z});}
      if(overlaps(b,{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z)),minY:box.maxY,maxY:box.maxY+k.countertopThicknessMm}))return 'Пересечение со столешницей: '+it.name;
    }
  }return '';
}
function wallCandidate(f,point,room,wall=f.wall){
  const projection=f.kind==='window'?0:f.projection;
  const horizontal=['a','c'].includes(wall),along=horizontal?point.x:point.z;
  const gap=wall==='a'?point.z+room.depth/2-projection/2:wall==='c'?room.depth/2-point.z-projection/2:wall==='b'?room.width/2-point.x-projection/2:point.x+room.width/2-projection/2;
  return {...f,wall,offset:Math.round(along+wallLength(room,wall)/2-f.width/2),wall_gap:Math.round(gap)};
}
export function equipmentAtPoint(f,point,room,wall=f.wall){const next=wallCandidate(f,point,room,wall);return f.kind==='window'?{...next,wall_gap:0}:next;}
export function snapEquipment(f,point,room,items=[],{enabled=true,threshold=100}={}){
  const candidates=(enabled||f.kind==='window')?['a','b','c','d'].map(wall=>wallCandidate(f,point,room,wall)).filter(v=>(f.kind==='window'||Math.abs(v.wall_gap)<=threshold)&&v.width<=wallLength(room,v.wall)).sort((a,b)=>Math.abs(a.wall_gap)-Math.abs(b.wall_gap)||(a.wall===f.wall?-1:1)):[];
  let next=candidates[0]||equipmentAtPoint(f,point,room);const snapped=Boolean(candidates.length);
  if(snapped)next={...next,wall_gap:0,offset:clamp(next.offset,0,wallLength(room,next.wall)-next.width)};
  next.elevation=f.kind==='gas_cooker'?0:Math.round(f.elevation);
  const error=equipmentError(next,room,items);return {feature:next,error,guides:snapped?[{text:'К стене '+next.wall.toUpperCase()+' · без зазора'}]:[]};
}
export function findEquipmentSpace(f,room,items=[]){
  for(const wall of [f.wall,...['a','b','c','d'].filter(w=>w!==f.wall)]){
    const limit=wallLength(room,wall)-f.width;
    for(const offset of [...new Set([f.offset,0,limit,...Array.from({length:Math.max(0,Math.floor(limit/50)+1)},(_,i)=>i*50)])]){
      const next={...f,wall,offset,wall_gap:0};if(!equipmentError(next,room,items))return next;
    }
  }return null;
}
