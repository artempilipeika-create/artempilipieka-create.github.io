import {buildCarcass,placeCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {findSpace} from './placement.mjs';
import {resolveBlankBindings,worldPoint} from './blank-bindings.mjs';

export const specKeys=['recipe','width','height','depth','thickness','shelves','sections','back','elevation','shelfSetback','shelfGap','edgeThickness','edgePolicy'];
const cleanSpec=s=>({...Object.fromEntries(specKeys.map(k=>[k,s[k]])),sectionShelves:s.sectionShelves??null});
// PostgreSQL JSONB may reorder object keys without changing their values.
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const signature=v=>JSON.stringify(ordered(v));
const geometry=i=>signature(['item_id','x','z','rotation','elevation_mm','width','height','depth','blank_axis','blank_length_mm','blank_width_mm','blank_thickness_mm','blank_binding'].map(k=>k==='blank_binding'&&i[k]?Object.fromEntries(Object.entries(i[k]).filter(([key])=>key!=='mounting')):i[k]??null));
export const assistantStamp=adapter=>JSON.stringify([adapter.projectId,adapter.room,adapter.items]);

export function selectedCarcass(adapter){
 const metadata=adapter.selected?.assistant_carcass;
 if(!metadata)return null;
 const items=adapter.items.filter(i=>i.assistant_carcass?.group_id===metadata.group_id);
 const expected=placeCarcass(buildCarcass(metadata.spec,{idPrefix:metadata.group_id}),metadata.position);
 if(items.length!==expected.length||expected.some(i=>geometry(items.find(p=>p.item_id===i.item_id)||{})!==geometry(i)))
  throw Error('Геометрия этого корпуса изменена вручную. Продолжите редактировать детали в параметрах или создайте новый корпус.');
 if(items.some(i=>signature(i.assistant_carcass)!==signature(metadata)))throw Error('Параметры деталей корпуса различаются. Продолжите ручное редактирование.');
 return {metadata,items};
}

export function prepareAssistantPlan(adapter,plan,{id=crypto.randomUUID(),defaultMaterial=null,bodyMaterialId,backMaterialId}={}){
 if(!['create','update'].includes(plan.action)||!plan.spec)throw Error('Нет предложения для применения.');
 const current=plan.action==='update'?selectedCarcass(adapter):null;
 if(plan.action==='update'&&!current)throw Error('Выберите деталь корпуса, созданного помощником.');
 const spec=cleanSpec(plan.spec),prefix=current?.metadata.group_id||id;
 const first=current?.items.find(i=>i.item_id.endsWith(':left'));
 const built=buildCarcass(spec,{idPrefix:prefix,name:first?.name.split(' · ')[0]||'Корпус ИИ',
  bodyMaterialId:bodyMaterialId!==undefined?bodyMaterialId:(first?.blank_thickness_mm===spec.thickness?first.body_variant_id:spec.thickness===18?defaultMaterial:null),backMaterialId:backMaterialId??CARCASS_BACK_MATERIAL_ID});
 let position=current?{...current.metadata.position,elevation_mm:spec.elevation}:null;
 if(current){
  // Resize from the right and front, keeping the left edge and rear envelope.
  const previous=current.metadata.spec;
  const delta=worldPoint({x:(spec.width-previous.width)/2,z:(built.depth-previous.depth-(previous.back?3:0))/2},position.rotation);
  position.x+=delta.x;position.z+=delta.z;
 }
 if(!position){
  const envelope={module_type:'blank',item_id:'assistant-envelope',name:built.spec.label,width:built.width,height:built.height,depth:built.depth,
   x:0,z:0,rotation:0,elevation_mm:spec.elevation,base:'wall',body_height:built.height,base_height:0,worktop_thickness:0};
  position=findSpace(envelope,adapter.items,adapter.room,adapter.selected,{wallOffset:0,autoRotate:false});
  if(!position)throw Error('Для корпуса нет свободного места. Проверьте размеры помещения.');
 }
 position=Object.fromEntries(['x','z','elevation_mm','rotation'].map(k=>[k,position[k]??0]));
 const metadata={group_id:prefix,spec,position};
 const items=placeCarcass(built,position).map(generated=>{
  const old=current?.items.find(i=>i.item_id===generated.item_id);
  const item={...old,...generated,blank_binding:generated.blank_binding??null,assistant_carcass:metadata};
  if(old){
   item.name=old.name;
   if(old.blank_binding?.mounting&&item.blank_binding)item.blank_binding={...item.blank_binding,mounting:old.blank_binding.mounting};
   if(old.blank_thickness_mm===generated.blank_thickness_mm)item.body_variant_id=old.body_variant_id;
   if(spec.edgePolicy===current.metadata.spec.edgePolicy)item.blank_edge_code=old.blank_edge_code;
   if(spec.edgeThickness===current.metadata.spec.edgeThickness)item.blank_edge_thickness_mm=old.blank_edge_thickness_mm;
  }
  if(generated.item_id.endsWith(':back')){if(backMaterialId!==undefined)item.body_variant_id=backMaterialId;}
  else if(bodyMaterialId!==undefined)item.body_variant_id=bodyMaterialId;
  return item;
 });
 const removed=current?.items.filter(i=>!items.some(p=>p.item_id===i.item_id))||[];
 const oldIds=new Set(current?.items.map(i=>i.item_id)||[]);
 const next=resolveBlankBindings([...adapter.items.filter(i=>!oldIds.has(i.item_id)),...items]);
 if(next.length>100)throw Error('В проекте поддерживается до 100 деталей и модулей.');
 for(const i of next){const error=adapter.validate(i,next);if(error)throw Error(i.name+': '+error);}
 const summary=[plan.action==='create'?'Добавить корпус':'Изменить выбранный корпус',
  `${spec.width} × ${spec.height} × ${spec.depth} мм · ЛДСП ${spec.thickness} мм`,
  `${spec.sections} секц. · полки: ${(spec.sectionShelves??Array(spec.sections).fill(spec.shelves)).join(' / ')} · ${items.length} деталей`,
  `Зазор полок: ${spec.shelfGap} мм с каждой стороны`,
  spec.back?'Задняя стенка ХДФ 3 мм; общая глубина '+built.depth+' мм':'Без задней стенки',
  'Открытый шкаф. На съёмную полку — четыре SEKURA 2.'];
 if(removed.length)summary.push('Будут удалены детали: '+removed.map(i=>i.name+(i.production_note?' (есть примечание)':'')).join(', '));
 if(current&&spec.thickness!==current.metadata.spec.thickness)summary.push('Толщина изменится: выберите соответствующий материал перед экспортом.');
 return {stamp:assistantStamp(adapter),next,items,summary,spec};
}

export function applyAssistantPlan(adapter,pending){
 if(assistantStamp(adapter)!==pending.stamp)throw Error('Проект изменился после подготовки. Подготовьте предложение заново.');
 for(const i of pending.next){const error=adapter.validate(i,pending.next);if(error)throw Error(i.name+': '+error);}
 adapter.state.items=structuredClone(pending.next);
 adapter.select(pending.items[0].item_id);adapter.notify();
}
