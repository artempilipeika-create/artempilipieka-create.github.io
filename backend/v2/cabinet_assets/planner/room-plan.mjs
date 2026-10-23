// Measured room data. Independent of cabinet manufacturing and display presets.
export const WALLS=Object.freeze({a:'A · задняя',b:'B · правая',c:'C · передняя',d:'D · левая'});
export const ORIGINS=Object.freeze({a:'угла A–D',b:'угла A–B',c:'угла C–D',d:'угла A–D'});
export const FEATURES=Object.freeze({window:['Окно','#68a6b8'],door:['Дверь','#ac8253'],socket:['Розетка','#d7a83c'],switch:['Выключатель','#c49b42'],water:['Вода','#4188ba'],sewer:['Канализация','#737c9a'],gas:['Газ','#bf8855'],ventilation:['Вентиляция','#7d9987'],meter:['Счётчик','#a87997'],radiator:['Радиатор','#c67d65'],column:['Выступ / колонна','#91948d'],shaft:['Вентшахта','#899284']});
export const wallLength=(room,wall)=>['a','c'].includes(wall)?room.width:room.depth;
export const roomReady=room=>room.setup_complete!==false; // Legacy projects stay accessible.
export function dimensionsError(room){
  for(const [key,label,min,max]of [['width','Длина',1500,12000],['depth','Глубина',1500,12000],['height','Высота',2000,5000]])
    if(!Number.isInteger(room[key])||room[key]<min||room[key]>max)return `${label}: укажите целое число от ${min} до ${max} мм.`;
  return '';
}
export function featureError(f,room){
  if(!FEATURES[f.kind]||!WALLS[f.wall])return 'Выберите объект и стену.';
  if(!f.id||typeof f.id!=='string'||f.id.length>80)return 'Некорректный идентификатор объекта.';
  if((f.label||'').length>100||(f.notes||'').length>500)return 'Сократите название или примечание.';
  for(const [key,label,min,max]of [['offset','Отступ от угла',0,12000],['elevation','Высота от пола',0,5000],['width','Ширина',1,12000],['height','Высота объекта',1,5000],['projection','Выступ в комнату',0,3000]])
    if(!Number.isInteger(f[key])||f[key]<min||f[key]>max)return `${label}: укажите целое число от ${min} до ${max} мм.`;
  if(f.offset+f.width>wallLength(room,f.wall))return 'Объект выходит за длину выбранной стены.';
  if(f.elevation+f.height>room.height)return 'Объект выходит выше потолка.';
  if(f.projection>(['a','c'].includes(f.wall)?room.depth:room.width))return 'Выступ больше глубины помещения.';
  if(f.kind==='shaft'&&(f.elevation!==0||f.projection<1))return 'Вентшахта начинается от пола и должна иметь глубину выступа не меньше 1 мм.';
  if(f.kind==='door'&&f.elevation!==0)return 'Дверной проём должен начинаться от пола (0 мм).';
  return '';
}
export function roomError(room,complete=true){
  const error=dimensionsError(room);if(error)return error;
  const features=room.features||[];
  if(features.length>100)return 'В комнате поддерживается до 100 объектов.';
  if(new Set(features.map(f=>f.id)).size!==features.length)return 'Идентификаторы объектов должны быть уникальны.';
  for(const f of features){const e=featureError(f,room);if(e)return (f.label||FEATURES[f.kind]?.[0]||'Объект')+': '+e;}
  if(complete){
    // The dimensions-only setup does not claim a utility survey took place.
    if(room.survey!=null&&!['none','present'].includes(room.survey))return 'Некорректное состояние замера.';
    if(room.survey==='present'&&!features.length)return 'Добавьте хотя бы один объект по замеру.';
    if(room.survey==='none'&&features.length)return 'В комнате уже есть объекты. Выберите «Есть» или удалите их.';
  }
  return '';
}
export function featureBox(f,r,minProjection=0){
  const p=Math.max(f.projection,minProjection),along=-wallLength(r,f.wall)/2+f.offset+f.width/2;
  const x=f.wall==='b'?r.width/2-p/2:f.wall==='d'?-r.width/2+p/2:along;
  const z=f.wall==='a'?-r.depth/2+p/2:f.wall==='c'?r.depth/2-p/2:along;
  const w=['a','c'].includes(f.wall)?f.width:p,d=['a','c'].includes(f.wall)?p:f.width;
  return {x,y:f.elevation+f.height/2,z,w,h:f.height,d};
}
// Boundary of usable floor: subtract measured solid wall protrusions, including corners.
export function floorOutline(r){
  const blocks=(r.features||[]).filter(f=>['shaft','column'].includes(f.kind)&&f.elevation===0&&f.projection>0).map(f=>featureBox(f,r)).filter(b=>Object.values(b).every(Number.isFinite)).map(b=>({x0:Math.max(-r.width/2,b.x-b.w/2),x1:Math.min(r.width/2,b.x+b.w/2),z0:Math.max(-r.depth/2,b.z-b.d/2),z1:Math.min(r.depth/2,b.z+b.d/2)})).filter(b=>b.x1>b.x0&&b.z1>b.z0);
  const xs=[...new Set([-r.width/2,r.width/2,...blocks.flatMap(b=>[b.x0,b.x1])])].sort((a,b)=>a-b),zs=[...new Set([-r.depth/2,r.depth/2,...blocks.flatMap(b=>[b.z0,b.z1])])].sort((a,b)=>a-b);
  const free=zs.slice(1).map((z,j)=>xs.slice(1).map((x,i)=>!blocks.some(b=>(x+xs[i])/2>b.x0&&(x+xs[i])/2<b.x1&&(z+zs[j])/2>b.z0&&(z+zs[j])/2<b.z1))),groups=new Map();
  const add=(axis,line,a,b)=>{const key=axis+':'+line;if(!groups.has(key))groups.set(key,{axis,line,spans:[]});groups.get(key).spans.push([a,b]);};
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++)if(free[j][i]){
    if(!free[j-1]?.[i])add('x',zs[j],xs[i],xs[i+1]);if(!free[j+1]?.[i])add('x',zs[j+1],xs[i],xs[i+1]);
    if(!free[j][i-1])add('z',xs[i],zs[j],zs[j+1]);if(!free[j][i+1])add('z',xs[i+1],zs[j],zs[j+1]);
  }
  const segments=[];for(const {axis,line,spans}of groups.values()){
    const merged=[];for(const span of spans.sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&span[0]===last[1])last[1]=span[1];else merged.push([...span]);}
    for(const [a,b]of merged)segments.push(axis==='x'?{x1:a,z1:line,x2:b,z2:line}:{x1:line,z1:a,x2:line,z2:b});
  }return segments;
}
// Subtract window/door openings from a wall, merging neighbouring equal strips.
export function wallPanels(r,wall){
  const openings=(r.features||[]).filter(f=>f.wall===wall&&['window','door'].includes(f.kind));
  const cuts=[...new Set([0,wallLength(r,wall),...openings.flatMap(f=>[f.offset,f.offset+f.width])])].sort((a,b)=>a-b),out=[];
  let previous=new Map();
  for(let i=1;i<cuts.length;i++){
    const x=cuts[i-1],end=cuts[i],middle=(x+end)/2,intervals=openings.filter(f=>middle>f.offset&&middle<f.offset+f.width).map(f=>[f.elevation,f.elevation+f.height]).sort((a,b)=>a[0]-b[0]);
    let y=0;const strips=[];
    for(const [bottom,top]of intervals){if(bottom>y)strips.push([y,bottom]);y=Math.max(y,top);}
    if(y<r.height)strips.push([y,r.height]);const next=new Map();
    for(const [bottom,top]of strips){const key=bottom+':'+top;let p=previous.get(key);if(p)p.width+=end-x;else{p={offset:x,width:end-x,elevation:bottom,height:top-bottom};out.push(p);}next.set(key,p);}previous=next;
  }
  return out;
}
