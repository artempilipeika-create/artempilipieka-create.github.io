import {splitAt,levelOf,sectionOf,isRightBank} from './wardrobe-layout.mjs';
import {primeHinge,hingeLoad,hingeAxes} from './wardrobe-fronts.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';

// Minimise squared displacement from the original drilling axes. Prefix minima
// enforce 64 mm between neighbours without losing a solution to a greedy move.
function fitAxes(ideal,lo,hi,blocked){
 const positions=[];
 for(let y=Math.ceil(lo);y<=hi;y++)if(blocked.every(([a,b])=>y<a||y>b))positions.push(y);
 if(!positions.length)return null;
 if(ideal.every((y,i)=>positions.includes(y)&&(!i||y-ideal[i-1]>=64)))return ideal;
 let costs=positions.map(y=>(y-ideal[0])**2);
 const parents=[];
 for(const target of ideal.slice(1)){
   let edge=0,best=-1;
   const back=[],next=[];
   for(const y of positions){
     while(edge<positions.length&&positions[edge]<=y-64){
       if(Number.isFinite(costs[edge])&&(best<0||costs[edge]<costs[best]))best=edge;
       edge++;
     }
     back.push(best);next.push(best<0?Infinity:costs[best]+(y-target)**2);
   }
   parents.push(back);costs=next;
 }
 let at=costs.indexOf(Math.min(...costs));
 if(!Number.isFinite(costs[at]))return null;
 const axes=[positions[at]];
 for(let i=parents.length-1;i>=0;i--){at=parents[i][at];axes.unshift(positions[at]);}
 return axes;
}

function automaticAxes(door,host,items,side,shelves,count){
 const {group_id,spec}=door.assistant_carcass;
 const section=side==='left'?0:spec.sections-1,sign=side==='left'?1:-1;
 const zero=door.elevation_mm,wall=localPoint(host,door.rotation).x+sign*host.width/2;
 const blocked=shelves.map(([lo,hi])=>[lo-31,hi+31]);
 const parts=new Map(items.map(item=>[item.item_id,item]));
 (spec.drawerBanks??[]).forEach((bank,slot)=>{
   if(bank?.kind!=='internal'||sectionOf(slot)!==section)return;
   if(splitAt(spec,section,levelOf(slot))?.kind==='drawers'&&isRightBank(slot)!==(side==='right'))return;
   const key=group_id+':drawer-'+slot+'-';
   const spacer=parts.get(key+'spacer-'+side);
   for(let i=0;i<bank.faces.length;i++){
     const face=parts.get(key+i+'-face'),box=parts.get(key+i+'-side-'+side);
     if(!face||!box)throw Error('Не найдены детали шуфляды для проверки петель.');
     if(sign*(localPoint(face,door.rotation).x-wall)-face.width/2<23.6)
       blocked.push([face.elevation_mm-zero-31,face.elevation_mm+face.height-zero+31]);
     if(spacer){
       const rail=box.elevation_mm+40;
       blocked.push([Math.max(rail-57.5,spacer.elevation_mm-26)-zero,
         Math.min(rail+57.5,spacer.elevation_mm+spacer.height+26)-zero]);
     }
   }
 });
 const offset=spec.front.offset,step=(door.height-2*offset)/(count-1);
 const ideal=Array.from({length:count},(_,i)=>Math.round(offset+i*step));
 const low=Math.max(31,host.elevation_mm-zero+26),high=Math.min(door.height-31,host.elevation_mm+host.height-zero-26);
 const axes=fitAxes(ideal,low,high,blocked);
 if(axes)return axes;
 const index=Math.max(0,ideal.findIndex(y=>blocked.some(([a,b])=>y>=a&&y<=b)));
 const error=Error('Секция '+(section+1)+', '+(side==='left'?'левая':'правая')+' дверь: нет свободного положения для комплекта из '+count+' петель.');
 error.hingeConflict={side,section,y:zero+ideal[index],index};throw error;
}

export function doorHinges(door,items){
 if(door.blank_axis!=='front')return [];
 const group=door.assistant_carcass,front=group?.spec?.front;
 if(!front)return [];
 const side=['left','right'].find(s=>door.item_id===group.group_id+':door-'+s);
 if(!side)return [];
 const host=items.find(i=>i.item_id===group.group_id+':'+side);
 if(!host||host.blank_axis!=='side'||host.rotation!==door.rotation)throw Error('Проверьте привязку фасада к боковине.');
 const angle=door.rotation,sign=side==='left'?1:-1,at=localPoint(host,angle),leaf=localPoint(door,angle);
 const x=at.x+sign*host.width/2,z=leaf.z-door.depth/2;
 if(Math.abs(z-at.z-host.depth/2)>.01||Math.abs(leaf.x-sign*door.width/2-(at.x-sign*host.width/2+sign*1.5))>.01)
   throw Error('Проверьте положение фасада относительно боковины.');
 const obstacles=items.filter(i=>i.blank_binding?.[side+'_id']===host.item_id&&i.item_id.startsWith(group.group_id+':shelf-')&&localPoint(i,angle).z+i.depth/2>=z-76)
   .map(i=>[i.elevation_mm-door.elevation_mm,i.elevation_mm+i.height-door.elevation_mm]);
 const {count}=hingeLoad(door.width,door.height,front.massKg);
 const axes=front.autoHinges?automaticAxes(door,host,items,side,obstacles,count):hingeAxes(door.height,count,front.offset,obstacles);
 if(axes.some(y=>door.elevation_mm+y-26<host.elevation_mm||door.elevation_mm+y+26>host.elevation_mm+host.height))
   throw Error('Ответная планка выходит за боковину. Проверьте высоту фасада.');
 return axes.map(y=>({
   name:'Петля PRIME 3D · '+door.name,article:primeHinge.article,source_file:primeHinge.file,source_sha256:primeHinge.sha,
   door_side:side,host_blank_id:host.item_id,joined_panel_id:door.item_id,rotation:angle,
   position:{...worldPoint({x,z},angle),y:door.elevation_mm+y},elastic_resize:false
 }));
}
