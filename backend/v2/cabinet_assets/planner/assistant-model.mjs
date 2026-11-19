import {outerFront,drawerBottom,drawerMember} from './wardrobe-drawers.mjs';
import {buildCarcass,placeCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {doorHinges} from './wardrobe-hinges.mjs';
import {shelfSupportPlan} from './sekura.mjs';
import {jointQuantity,nativeCarcassJoints,dividerScheme,jointOptions} from './carcass-joints.mjs';
import {choice,shelfDescription} from './shelf-choices.mjs';
import {joinPlinths,splitPlinths} from './wardrobe-plinth-runs.mjs';
import {footHeight} from './plinth-options.mjs';
import {findSpace} from './placement.mjs';
import {resolveBlankBindings,worldPoint} from './blank-bindings.mjs';
import {retainedBlankMaterial} from './blanks-model.mjs';

export const specKeys=['recipe','width','height','depth','thickness','shelves','sections','back','elevation','shelfSetback','shelfGap','edgeThickness','edgePolicy'];
const cleanSpec=s=>({...Object.fromEntries(specKeys.map(k=>[k,s[k]])),...Object.fromEntries(['clearLayout','drawerFixing','gapLocks','topGaps','nicheSplits','braceOffset','rods'].filter(k=>s[k]!=null).map(k=>[k,s[k]])),...(s.front?{front:s.front}:{}),...(s.backThickness?{backThickness:s.backThickness}:{}),sectionShelves:s.sectionShelves??null,...(s.feet?{feet:s.feet}:{}),...(s.topFit?{topFit:s.topFit}:{}),...(s.bottomFit?{bottomFit:s.bottomFit}:{}),...(s.dividerSetback!=null?{dividerSetback:s.dividerSetback}:{}),...(s.dividerPositions?{dividerPositions:s.dividerPositions}:{}),...(s.dividerJoints?{dividerJoints:s.dividerJoints}:{}),...(s.joints?{joints:s.joints}:{}),...(s.shelfChoices?.length?{shelfChoices:s.shelfChoices}:{}),...(s.shelfLevels?{shelfLevels:s.shelfLevels}:{}),...(s.drawerBanks?.some(Boolean)?{drawerBanks:s.drawerBanks}:{})});
// PostgreSQL JSONB may reorder object keys without changing their values.
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const signature=v=>JSON.stringify(ordered(v));
const geometry=i=>signature([i.item_id,i.blank_axis,
 ...['x','z','rotation','elevation_mm','width','height','depth','blank_length_mm','blank_width_mm','blank_thickness_mm'].map(k=>i[k]==null?null:Number(i[k])),
 i.blank_binding?Object.fromEntries(Object.entries(i.blank_binding).filter(([key])=>key!=='mounting')):null]);
export const sameAssistantSpec=(a,b)=>signature(a)===signature(b);
export const assistantStamp=adapter=>JSON.stringify([adapter.projectId,adapter.room,adapter.items]);

export function selectedCarcass(adapter){
 const metadata=adapter.selected?.assistant_carcass;
 if(!metadata)return null;
 const items=splitPlinths(adapter.items).filter(i=>i.assistant_carcass?.group_id===metadata.group_id);
 const matches=(legacyGlassGap=false,legacyDrawers=false)=>{
  const expected=placeCarcass(buildCarcass(metadata.spec,{idPrefix:metadata.group_id,legacyGlassGap,legacyDrawers}),metadata.position);
  return items.length===expected.length&&expected.every(i=>geometry(items.find(p=>p.item_id===i.item_id)||{})===geometry(i));
 };
 if(!matches()&&!(metadata.spec.drawerBanks&&matches(false,true))&&!(items.some(i=>/^[468]\//.test(i.blank_shelf))&&matches(true)))
  throw Error('Геометрия этого корпуса изменена вручную. Продолжите редактировать детали в параметрах или создайте новый корпус.');
 if(items.some(i=>signature(i.assistant_carcass)!==signature(metadata)))throw Error('Параметры деталей корпуса различаются. Продолжите ручное редактирование.');
 return {metadata,items};
}

function validateWardrobePlan(adapter,next,items){
 const owned=new Set(items.map(item=>item.item_id)),group=items[0].assistant_carcass.group_id;
 const previous=new Map(adapter.items.map(item=>[item.item_id,item]));
 for(const item of next){
  const old=previous.get(item.item_id);
  const checkMaterial=owned.has(item.item_id)||item.blank_plinth_run?.includes(group)||!old||
   item.body_variant_id!==old.body_variant_id||item.blank_thickness_mm!==old.blank_thickness_mm;
  const error=adapter.validate(item,next,{checkMaterial});
  if(error)throw Error(item.name+': '+error);
 }
}

export function prepareAssistantPlan(adapter,plan,{id=crypto.randomUUID(),defaultMaterial=null,selectedMaterials={},bodyMaterialId,backMaterialId,frontMaterialId,drawerMaterialId,previousPartKeys,resetSideEdges=false}={}){
 if(!['create','update'].includes(plan.action)||!plan.spec)throw Error('Нет предложения для применения.');
 const current=plan.action==='update'?selectedCarcass(adapter):null;
 if(plan.action==='update'&&!current)throw Error('Выберите деталь корпуса, созданного помощником.');
 const spec=cleanSpec(plan.spec),prefix=current?.metadata.group_id||id;
 const first=current?.items.find(i=>i.item_id.endsWith(':left'));
 const built=buildCarcass(spec,{idPrefix:prefix,name:first?.name.split(' · ')[0]||'Корпус ИИ',
  bodyMaterialId:bodyMaterialId!==undefined?bodyMaterialId:selectedMaterials.body??(Number(first?.blank_thickness_mm)===spec.thickness?first.body_variant_id:spec.thickness===18?defaultMaterial:null),
  frontMaterialId:frontMaterialId??selectedMaterials.front??current?.items.find(i=>i.blank_axis==='front')?.body_variant_id,
  drawerMaterialId:drawerMaterialId??(spec.thickness===18?bodyMaterialId??selectedMaterials.body:selectedMaterials.drawer)??current?.items.find(i=>drawerMember(i.item_id,'\\d+-side-left'))?.body_variant_id,
  backMaterialId:backMaterialId??selectedMaterials.back??(spec.backThickness?null:CARCASS_BACK_MATERIAL_ID)});
 if(spec.drawerBanks?.some(bank=>bank?.layout))spec.drawerBanks=built.spec.drawerBanks;
 if(built.drawerIssues.length)throw Error(built.drawerIssues.join(' '));
 let position=current?{...current.metadata.position,elevation_mm:spec.elevation}:null;
 if(current){
  // Resize from the right and front, keeping the left edge and rear envelope.
  const previous=current.metadata.spec;
  const delta=worldPoint({x:(spec.width-previous.width)/2,z:(built.depth-previous.depth-(previous.back&&!previous.backThickness?3:0)-(outerFront(previous)?18:0))/2},position.rotation);
  position.x+=delta.x;position.z+=delta.z;
 }
 if(!position){
  const envelope={module_type:'blank',item_id:'assistant-envelope',name:built.spec.label,width:built.width,height:built.height+footHeight(spec),depth:built.depth,
   x:0,z:0,rotation:0,elevation_mm:spec.elevation,base:'wall',body_height:built.height,base_height:0,worktop_thickness:0};
  position=findSpace(envelope,adapter.items,adapter.room,adapter.selected,{wallOffset:0,autoRotate:false});
  if(!position)throw Error('Для корпуса нет свободного места. Проверьте размеры помещения.');
 }
 position=Object.fromEntries(['x','z','elevation_mm','rotation'].map(k=>[k,position[k]??0]));
 const metadata={group_id:prefix,spec,position};
 const movedIds=new Map();
 for(const [key,original] of previousPartKeys??[]){
  const nextId=prefix+':'+key;if(original!==nextId)movedIds.set(original,nextId);
 }
 const shapeChanged=current&&(spec.back!==current.metadata.spec.back||spec.backThickness!==current.metadata.spec.backThickness||spec.topFit!==current.metadata.spec.topFit||spec.bottomFit!==current.metadata.spec.bottomFit);
 const originalItems=(shapeChanged||movedIds.size)?buildCarcass(current.metadata.spec,{idPrefix:prefix,name:first?.name.split(' · ')[0]}).items:[];
 const previousSides=shapeChanged?originalItems.filter(i=>['left','right','top','bottom'].includes(i.item_id.slice(prefix.length+1))):[];
 const retained=new Set();
 const items=placeCarcass(built,position).map(generated=>{
  const previousId=previousPartKeys?previousPartKeys.get(generated.item_id.slice(prefix.length+1)):generated.item_id;
  const old=current?.items.find(i=>i.item_id===previousId);
  const item={...old,...generated,blank_binding:generated.blank_binding??null,assistant_carcass:metadata};
  if(old){
   retained.add(previousId);
   const customName=previousId!==generated.item_id&&originalItems.find(i=>i.item_id===previousId)?.name!==old.name;
   if((previousId===generated.item_id||customName)&&old.blank_shelf===generated.blank_shelf&&(!item.item_id.endsWith(':back')||old.depth===generated.depth))item.name=old.name;
   if(!generated.blank_shelf)delete item.blank_shelf;
   if(!generated.blank_gola_runs)delete item.blank_gola_runs;
   if(!old.blank_shelf&&!generated.blank_shelf&&old.blank_binding?.mounting&&item.blank_binding)item.blank_binding={...item.blank_binding,mounting:old.blank_binding.mounting};
   item.body_variant_id=retainedBlankMaterial(generated,old,id=>adapter.material?.(id));
   if(!old.blank_shelf?.match(/^[468]\//)&&!generated.blank_shelf?.match(/^[468]\//)&&spec.edgePolicy===current.metadata.spec.edgePolicy){
    const oldSide=previousSides.find(i=>i.item_id===old.item_id);
    const recalculate=resetSideEdges&&[prefix+':left',prefix+':right'].includes(item.item_id);
    if(!recalculate&&(!oldSide||oldSide.blank_edge_code!==old.blank_edge_code))item.blank_edge_code=old.blank_edge_code;
   }
   if(spec.edgeThickness===current.metadata.spec.edgeThickness)item.blank_edge_thickness_mm=old.blank_edge_thickness_mm;
  }
  if(generated.blank_axis==='front'){item.blank_edge_code='1111';item.blank_edge_thickness_mm=2;if(frontMaterialId!==undefined)item.body_variant_id=frontMaterialId;}
  else if(generated.item_id.endsWith(':back')){item.blank_edge_code='0000';if(backMaterialId!==undefined)item.body_variant_id=backMaterialId;}
  else if(generated.blank_shelf&&!generated.blank_shelf.startsWith('board/'))item.body_variant_id=null;
  else if(drawerBottom(item.item_id))item.body_variant_id=CARCASS_BACK_MATERIAL_ID;
  else if(drawerMember(item.item_id,'.+')){if(drawerMaterialId!==undefined)item.body_variant_id=drawerMaterialId;else if(spec.thickness===18&&bodyMaterialId!==undefined)item.body_variant_id=bodyMaterialId;}
  else if(bodyMaterialId!==undefined)item.body_variant_id=bodyMaterialId;
  if(item.item_id===prefix+':rear-brace'){item.blank_edge_code='1100';item.blank_edge_thickness_mm=1;}
  if(item.item_id===prefix+':plinth')item.blank_edge_code='1111';
  return item;
 });
 const removed=current?.items.filter(i=>!retained.has(i.item_id))||[];
 const oldIds=new Set(current?.items.map(i=>i.item_id)||[]);
 const outside=splitPlinths(adapter.items).filter(i=>!oldIds.has(i.item_id)).map(it=>{
  const b=it.blank_binding;
  if(!b||!movedIds.size)return it;
  return {...it,blank_binding:{...b,left_id:movedIds.get(b.left_id)??b.left_id,right_id:movedIds.get(b.right_id)??b.right_id}};
 });
 const next=resolveBlankBindings(joinPlinths([...outside,...items]));
 if(next.length>100)throw Error('В проекте поддерживается до 100 деталей и модулей.');
 validateWardrobePlan(adapter,next,items);
 for(const shelf of next.filter(i=>i.blank_shelf)){
  const mount=shelfSupportPlan(shelf,next);if(mount.error)throw Error(shelf.name+' · '+mount.error);
 }
 nativeCarcassJoints(next);
 const hinges=items.filter(i=>i.blank_axis==='front').flatMap(it=>doorHinges(it,next));
 const summary=[plan.action==='create'?'Добавить корпус':'Изменить выбранный корпус',
  `${spec.width} × ${spec.height} × ${spec.depth} мм · ЛДСП ${spec.thickness} мм`,
  `${spec.sections} секц. · полки: ${(spec.sectionShelves??Array(spec.sections).fill(spec.shelves)).join(' / ')} · ${items.length} деталей`,
  `Базовый зазор съёмных полок: ${spec.shelfGap} мм с каждой стороны`,
  ...(hinges.length?['Накладные фасады · PRIME 3D 112595 · '+hinges.length+' петель на шкаф']:[]),
  spec.backThickness?'Вкладная задняя стенка ЛДСП '+spec.backThickness+' мм без кромки · полки короче на '+spec.backThickness+' мм':spec.back?'Задняя стенка ХДФ 3 мм; общая глубина '+built.depth+' мм':'Без задней стенки',
  ...Array.from({length:spec.thickness===18?spec.sections-1:0},(_,i)=>{
   const ends=dividerScheme(spec,i);
   return 'Стойка '+(i+1)+' · сверху: '+jointOptions[ends.top]+' · снизу: '+jointOptions[ends.bottom];
  }),
  ...(spec.joints?['Крыша · '+jointQuantity(spec.joints.top),...(spec.bottomFit==='none'?[]:['Дно · '+jointQuantity(spec.joints.bottom)])]:[]),
  ...(spec.bottomFit==='none'?['Без дна · заднее ребро 100 мм · кромка 1 мм по двум длинным торцам']:[]),
  ...(spec.shelfChoices?spec.shelfChoices.flatMap((row,i)=>{
   const quantities=new Map();
   for(const value of row)quantities.set(value,(quantities.get(value)||0)+1);
   return [...quantities].map(([value,n])=>{const c=choice(value,spec.thickness);return 'Секция '+(i+1)+' · '+(c.kind==='glass'?'стекло':'ЛДСП')+' '+c.thickness+' мм × '+n+' · '+shelfDescription(c,n);});
  }):['Открытый шкаф. На съёмную полку — четыре SEKURA 2.'])];
 if(removed.length)summary.push('Будут удалены детали: '+removed.map(i=>i.name+(i.production_note?' (есть примечание)':'')).join(', '));
 if(current&&spec.thickness!==current.metadata.spec.thickness)summary.push('Толщина изменится: выберите соответствующий материал перед экспортом.');
 return {stamp:assistantStamp(adapter),next,items,summary,spec};
}

export function applyAssistantPlan(adapter,pending){
 if(assistantStamp(adapter)!==pending.stamp)throw Error('Проект изменился после подготовки. Подготовьте предложение заново.');
 validateWardrobePlan(adapter,pending.next,pending.items);
 adapter.state.items=structuredClone(pending.next);
 adapter.select(pending.items[0].item_id);adapter.notify();
}
