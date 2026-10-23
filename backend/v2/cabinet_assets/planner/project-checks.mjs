import {productionParts,productionHardware,bounds,overlaps,elevation,rotateXZ,placementError,dimensionError,kitchenRuns,kitchenSettings,tallShelfAdjustment} from './furniture-core.mjs';
import {finishError} from './wall-finishes.mjs';
import {modulePriceBreakdown,kitchenPriceBreakdown} from './pricing.mjs';
import {roomError,featureBox,FEATURES} from './room-plan.mjs';

const rectangle=b=>[{x:b.minX,z:b.minZ},{x:b.maxX,z:b.minZ},{x:b.maxX,z:b.maxZ},{x:b.minX,z:b.maxZ}];
const extent=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});
const vertical=(a,b)=>a.minY<b.maxY-.5&&a.maxY>b.minY+.5;
// Separating-axis test avoids false positives at corners of rotated doors.
export function polygonsOverlap(a,b,tolerance=.5){
  for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
    const p=polygon[i],q=polygon[(i+1)%polygon.length],dx=q.x-p.x,dz=q.z-p.z,n=Math.hypot(dx,dz);if(!n)continue;
    const axis={x:-dz/n,z:dx/n},aa=a.map(v=>v.x*axis.x+v.z*axis.z),bb=b.map(v=>v.x*axis.x+v.z*axis.z);
    if(Math.max(...aa)<=Math.min(...bb)+tolerance||Math.max(...bb)<=Math.min(...aa)+tolerance)return false;
  }
  return true;
}
function hull(points){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z),cross=(o,a,b)=>(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);
  const half=values=>{const out=[];for(const p of values){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
function world(points,it){return points.map(p=>{const v=rotateXZ(p.x,p.z,it.rotation||0);return{x:v.x+it.x,z:v.z+it.z};});}
function solidFeatures(room){
  return (room.features||[]).filter(f=>f.projection>0&&!['window','door'].includes(f.kind)).map(f=>{
    const b=featureBox(f,room);return {id:f.id,name:f.label||FEATURES[f.kind]?.[0]||'Объект помещения',
      minX:b.x-b.w/2,maxX:b.x+b.w/2,minZ:b.z-b.d/2,maxZ:b.z+b.d/2,minY:b.y-b.h/2,maxY:b.y+b.h/2};
  });
}
export function openingCheck(it,template,items,room,parts=productionParts(it,template)||[]){
  const obstacles=[...items.filter(x=>x.item_id!==it.item_id).map(x=>({...bounds(x,room),id:x.item_id,name:x.name})),...solidFeatures(room)];
  const collisions=new Map(),unknown=[];let checked=0;
  const inspect=(polygon,y,kind)=>{
    if(polygon.some(p=>Math.abs(p.x)>room.width/2+.5||Math.abs(p.z)>room.depth/2+.5))collisions.set(kind+':wall',{kind,target:'стена помещения',targetId:null});
    const box={...extent(polygon),...y};
    for(const b of obstacles)if(vertical(y,b)&&overlaps(box,b)&&polygonsOverlap(polygon,rectangle(b)))collisions.set(kind+':'+b.id,{kind,target:b.name,targetId:b.id});
  };
  let fronts=parts.filter(p=>p.facade&&!p.fixed);
  if(template?.production?.vitrine){
    const side=template.production.vitrine.opening;
    fronts=[{size:{x:it.width-4,y:it.height-104,z:20.5},position:{x:0,y:(it.height+100)/2,z:it.depth/2+12.25},
      hinge_side:side,open_angle:template.production.doors[0].open_angle,pivot:{x:(side==='left'?-1:1)*(it.width/2-2),z:it.depth/2+2}}];
  }
  if(!fronts.length&&!parts.length)unknown.push('Нет данных о механизмах открывания этого модуля.');
  for(const part of fronts){
    const {size:s,position:p}=part,y={minY:elevation(it,room)+p.y-s.y/2,maxY:elevation(it,room)+p.y+s.y/2};
    const closed=rectangle({minX:p.x-s.x/2,maxX:p.x+s.x/2,minZ:p.z-s.z/2,maxZ:p.z+s.z/2});
    if(part.facade?.kind==='drawer'){
      const travel=productionHardware(it,template?.production)?.slide_length_mm;
      if(!Number.isFinite(travel)||travel<=0){unknown.push('Для проверки ящика нужна длина направляющих.');continue;}
      checked++;inspect(world(rectangle({...extent(closed),maxZ:p.z+s.z/2+travel}),it),y,'drawer');continue;
    }
    if(!part.pivot||!['left','right'].includes(part.hinge_side)||!Number.isFinite(part.open_angle)||part.open_angle<=0){unknown.push('Угол или ось открывания фасада не заданы; проверить механизм вручную.');continue;}
    checked++;
    const polygonAt=degrees=>{
      const a=degrees*Math.PI/180*(part.hinge_side==='left'?1:-1),c=Math.cos(a),s=Math.sin(a),v=part.pivot;
      return world(closed.map(p=>({x:v.x+(p.x-v.x)*c-(p.z-v.z)*s,z:v.z+(p.x-v.x)*s+(p.z-v.z)*c})),it);
    };
    let previous=polygonAt(0);
    for(let angle=1;angle<=Math.ceil(part.open_angle);angle++){
      const next=polygonAt(Math.min(angle,part.open_angle));inspect(hull([...previous,...next]),y,'door');previous=next;
    }
  }
  return {collisions:[...collisions.values()],unknown:[...new Set(unknown)],checked};
}

export function checkProject(scene,{template,material=()=>null,priceList=null}){
  const issues=[],items=scene.items||[],room=scene.room;
  const add=(code,severity,message,it=null,detail='')=>issues.push({id:code+':'+(it?.item_id||'project')+':'+issues.length,code,severity,message,detail,itemId:it?.item_id||null,name:it?.name||'Проект'});
  if(!items.length)add('empty','warning','В проекте ещё нет модулей.');
  const re=roomError(room);if(re)add('room','error',re);
  if(room.setup_complete!==true)add('survey','warning','Подтвердите размеры помещения в замере.');
  if(room.survey==null)add('survey-detail','info','Расположение выступов и коммуникаций не подтверждено замером.');
  let mechanisms=0;
  for(const it of items){
    const t=template(it),parts=productionParts(it,t,material),dim=dimensionError(it,t),placement=placementError(it,items,room);
    if(dim)add('dimensions','error',dim,it);
    if(placement)add('placement','error',placement,it);
    for(const b of solidFeatures(room))if(overlaps(bounds(it,room),b))add('room-object','error','Модуль пересекает объект: '+b.name,it);
    const needed=parts?parts.filter(p=>p.type==='panel'&&!p.optical_material):[
      {name:'Корпус',material:{variant_id:it.body_variant_id}},...(it.layout==='niche'?[]:[{name:'Фасад',material:{variant_id:it.front_variant_id}}])];
    const missing=needed.filter(p=>!p.material?.variant_id),unresolved=needed.filter(p=>p.material?.variant_id&&!material(p.material.variant_id));
    if(missing.length)add('material','error','Не назначен материал: '+[...new Set(missing.map(p=>p.name))].join(', ')+'.',it);
    if(unresolved.length)add('material-unavailable','warning','Материал назначен, но не найден в доступном каталоге.',it,[...new Set(unresolved.map(p=>p.name))].join(', '));
    const price=modulePriceBreakdown(it,t,material,priceList);
    const missingPrices=[['Материалы',price.sheetMaterials],['Фурнитура',price.hardware],['Операции',price.operations],['Кромка',price.edging],['Дополнения',price.extras]]
      .map(([label,rows])=>[label,rows.filter(r=>r.status!=='PRICED').length]).filter(([,n])=>n).map(([label,n])=>label+' ('+n+')');
    if(price.totals.saleMinor===null)add('price','warning',price.totals.status==='CUSTOM'?'Нестандартный размер: требуется индивидуальная цена.':'Цена модуля не рассчитана полностью.',it,
      missingPrices.length?'Не заполнены цены или правила расчёта: '+missingPrices.join(', ')+'.':'Проверьте наценку и правила расчёта.');
    if(!it.bazis_id||!it.bazis_file||!it.bazis_sha256)add('native-source','warning','Нет исходного фрагмента: модуль не попадёт в автоматическую сборку БАЗИС.',it);
    else if(t?.id!==it.bazis_id||t.source_sha256!==it.bazis_sha256)add('native-identity','warning','Исходный фрагмент отличается от текущего каталога. Проверьте файл перед передачей в БАЗИС.',it);
    const adjustment=t?.production?.vitrine?globalThis.MF_VITRINE.adjustment(it):tallShelfAdjustment(it,t?.production);
    if(adjustment?.requires_manual_native_adjustment)add('native-adjustment','warning',adjustment.note||'Полки нужно уточнить в БАЗИС.',it);
    const k=kitchenSettings(it);
    if(k&&t?.production&&k.legHeightMm!==t.production.base_height)add('native-legs','warning','Высота ножек изменена: проверить опоры и положение корпуса в БАЗИС.',it);
    const opening=openingCheck(it,t,items,room,parts||[]);mechanisms+=opening.checked;
    for(const hit of opening.collisions)add('opening','warning',(hit.kind==='drawer'?'Зона выдвижения ящика':'Траектория двери')+' пересекает: '+hit.target+'.',it,
      hit.kind==='drawer'?'Запас пространства рассчитан по длине направляющей; уточните фактический ход.':'Проверено движение от закрытого положения до заданного угла.');
    for(const text of opening.unknown)add('opening-unknown','info',text,it);
  }
  const runs=kitchenRuns(items,room,material),assemblies=globalThis.MF_COUNTERTOPS.assemblies(runs);
  for(const a of assemblies){
    const it=items.find(i=>a.members.includes(i.item_id));
    const fragments=runs.flatMap(r=>r.parts).filter(p=>p.countertop_assembly_id===a.id);
    if(fragments.some(p=>!p.material?.variant_id))add('counter-material','error','Не назначен материал одного или нескольких участков столешницы.',it);
    const joints=Math.max(a.joint_count,a.parts.length-1);
    if(joints)add('counter-joint','warning',`Столешница: ${joints} стык(а). Проверьте соединение и согласование с клиентом.`,it,
      a.joint==='euro'?'Выбран еврозапил; операции должны быть учтены в цене.':'Выбрано обычное соединение.');
    if(!a.native_supported)add('counter-native','warning','Столешница требует доработки в БАЗИС.',it,a.native_notes.join(' '));
  }
  for(const p of globalThis.MF_ACCESSORIES?.plans(scene,material)||[]){
    if(p.error)add('plinth-row','error',p.error);
    else if(!p.material_id)add('plinth-material','error','Не назначен материал цоколя.',items.find(i=>p.members.includes(i.item_id)));
  }
  for(const [list,light]of [[scene.wallPanels||[],false],[scene.wallLights||[],true]])for(const p of list){const error=finishError(p,room,light);if(error)add('wall-finish','error',error);}
  if(scene.wallPanels?.length||scene.wallLights?.length)add('wall-finish-price','info','Стеновые панели и подсветка показаны для визуализации; в цену и распил не включены.');
  const shared=kitchenPriceBreakdown(items,room,template,material,priceList,scene.plinths||[]).extras;
  if(shared.some(r=>r.status!=='PRICED'))add('shared-price','warning','Не полностью рассчитана цена столешниц, цоколей или соединений.');
  issues.sort((a,b)=>({error:0,warning:1,info:2}[a.severity]-{error:0,warning:1,info:2}[b.severity]));
  return {issues,mechanisms,counts:Object.fromEntries(['error','warning','info'].map(s=>[s,issues.filter(i=>i.severity===s).length]))};
}
