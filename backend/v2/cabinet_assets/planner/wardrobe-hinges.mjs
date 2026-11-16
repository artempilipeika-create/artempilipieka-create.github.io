import {primeHinge,hingeLoad,hingeAxes} from './wardrobe-fronts.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';

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
 const axes=hingeAxes(door.height,count,front.offset,obstacles);
 if(axes.some(y=>door.elevation_mm+y-26<host.elevation_mm||door.elevation_mm+y+26>host.elevation_mm+host.height))
   throw Error('Ответная планка выходит за боковину. Проверьте высоту фасада.');
 return axes.map(y=>({
   name:'Петля PRIME 3D · '+door.name,article:primeHinge.article,source_file:primeHinge.file,source_sha256:primeHinge.sha,
   door_side:side,host_blank_id:host.item_id,joined_panel_id:door.item_id,rotation:angle,
   position:{...worldPoint({x,z},angle),y:door.elevation_mm+y},elastic_resize:false
 }));
}
