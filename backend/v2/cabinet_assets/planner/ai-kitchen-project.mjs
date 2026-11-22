import {prepareAssistantPlan,applyAssistantPlan,selectedCarcass,assistantStamp} from './assistant-model.mjs';
import {isBase,kitchenFields,kitchenFoot,kitchenModels,kitchenSpec} from './ai-kitchen.mjs';
import {splitPlinths,joinPlinths} from './wardrobe-plinth-runs.mjs';
import {surroundLayout} from './wardrobe-surround.mjs';
import {StateAdapter} from './state-adapter.mjs';
import {dimensionPatch,kitchenSettings,rotateXZ} from './furniture-core.mjs';
import {defaultFixture,fixturePlans} from './worktop-fixtures.mjs';

const defaults=()=>globalThis.MF_FURNITURE_CORE.DEFAULT_MATERIALS;
export function materialRole(key,item){
 if(item.blank_front_frame||item.blank_shelf&&!item.blank_shelf.startsWith('board/'))return null;
 if(key==='back')return 'back';
 if(key==='plinth')return 'plinth';
 return item.blank_axis==='front'?'front':'body';
}
export function kitchenMaterials(current){
 const d=defaults(),saved=current?.metadata.spec.kitchenMaterials;
 const m=saved?structuredClone(saved):{body:d.body_variant_id,front:d.front_variant_id,parts:{}};
 if(!current)return m;
 const owned=current.items.map(i=>[i.item_id.slice(current.metadata.group_id.length+1),i]);
 if(!saved){
  for(const role of ['body','front']){
   const tally=new Map();for(const [key,it] of owned)if(materialRole(key,it)===role&&it.body_variant_id)tally.set(it.body_variant_id,(tally.get(it.body_variant_id)??0)+1);
   m[role]=[...tally].sort((a,b)=>b[1]-a[1])[0]?.[0]??m[role];
  }
 }
 for(const [key,it] of owned){
  const role=materialRole(key,it);
  if(role&&it.body_variant_id&&it.body_variant_id!==(m.parts[key]??m[role])){
   if(['body','front'].includes(role)||saved?.parts[key])m.parts[key]=it.body_variant_id;
  }
 }
 return m;
}
// Each row is a connected set along the same rear datum and rotation.
// Height is deliberately absent so a previously edited neighbour can be realigned.
export function lowerMembers(items){
 return items.flatMap(it=>{
  const m=it.assistant_carcass;
  if(m?!isBase(m.spec.kitchenModel)||it.item_id!==m.group_id+':bottom':!kitchenSettings(it))return [];
  const rot=it.rotation??0,p=rotateXZ(it.x,it.z,-rot);
  return [{id:m?.group_id??it.item_id,itemId:it.item_id,name:m?.name??it.name,rotation:rot,
   back:p.z-it.depth/2-(m?50:kitchenSettings(it).rearServiceGapMm),lo:p.x-it.width/2,hi:p.x+it.width/2,
   height:m?m.spec.height+kitchenFoot(m.spec.feet.article).height:it.height,topThickness:m?38:kitchenSettings(it).countertopThicknessMm}];
 });
}
export function kitchenRow(members,id){
 const seed=members.find(c=>c.id===id);if(!seed)return [];
 const matches=members.filter(c=>c.rotation===seed.rotation&&Math.abs(c.back-seed.back)<=1);
 const found=new Set([seed]);
 for(const x of found)for(const y of matches)if(Math.abs(x.lo-y.hi)<=1||Math.abs(x.hi-y.lo)<=1)found.add(y);
 return [...found].sort((a,b)=>a.lo-b.lo);
}
export function standardFields(adapter,id){
 const f=kitchenFields(id),members=lowerMembers(adapter.items);
 const active=adapter.selected?.assistant_carcass?.group_id??adapter.selected?.item_id;
 const datum=(members.find(x=>x.id===active)??members.at(-1))?.height??820;
 if(isBase(id))f.height=datum-kitchenFoot(f.feet).height;
 else f.elevation=datum+38+600;
 f.materials=kitchenMaterials(null);
 const recent=adapter.items.findLast(it=>it.assistant_carcass?.spec.kitchenMaterials)?.assistant_carcass.spec.kitchenMaterials;
 if(recent)Object.assign(f.materials,{body:recent.body,front:recent.front});
 return f;
}
export function saveKitchen(adapter,{fields,current=null,heightIds=[],materialRoles=[],wholeKitchen=false,fixture,stamp}){
 if(stamp!==undefined&&stamp!==assistantStamp(adapter))throw Error('Проект изменился. Откройте карточку шкафа заново.');
 const original=adapter.selected?.item_id,state={...adapter.state,items:structuredClone(adapter.items)};
 let selected=original;
 const draft=new StateAdapter({...adapter.bridge,state:()=>state,selected:()=>state.items.find(it=>it.item_id===selected),
  select:id=>{selected=id;},refresh(){}});
 const owned=current?.metadata.group_id;
 if(owned&&adapter.selected?.assistant_carcass?.group_id!==owned)throw Error('Выбран другой шкаф. Откройте его карточку.');
 function apply(f,update,name,fit){
  const spec=kitchenSpec(f),m=f.materials??kitchenMaterials(null);
  const target=selectedCarcassIfUpdating(update);
  if(!update){const used=new Set(draft.items.map(it=>it.assistant_carcass?.name));let i=1;const stem='ИИ · '+kitchenModels.find(x=>x.id===f.id).name;while(used.has(stem+' '+i))i++;name=stem+' '+i;}
  const plan=prepareAssistantPlan(draft,{action:update?'update':'create',spec},{cabinetName:name??target?.metadata.name,
   defaultMaterial:m.body,bodyMaterialId:m.body,frontMaterialId:m.front});
  const gid=plan.items[0].assistant_carcass.group_id;
  const segments=splitPlinths(plan.next);
  for(const it of segments){
   if(it.assistant_carcass?.group_id!==gid)continue;
   const key=it.item_id.slice(gid.length+1),role=materialRole(key,it);
   if(role&&m.parts[key])it.body_variant_id=m.parts[key];
   else if(['back','plinth'].includes(role)){
    const previous=target?.items.find(p=>p.item_id===it.item_id);
    if(previous&&!target.metadata.spec.kitchenMaterials?.parts?.[key])it.body_variant_id=previous.body_variant_id;
   }
   if(f.id==='base-sink'&&key==='bottom'){
    const sink=fit===undefined?(!update?defaultFixture('sink'):it.worktop_fixture):fit;
    if(sink)it.worktop_fixture={...sink};else delete it.worktop_fixture;
   }
  }
  plan.next=joinPlinths(segments);applyAssistantPlan(draft,plan);return gid;
 }
 function selectedCarcassIfUpdating(id){
  if(!id)return null;
  draft.select(draft.items.find(it=>it.assistant_carcass?.group_id===id)?.item_id);
  return selectedCarcass(draft);
 }
 const active=apply(fields,owned,current?.metadata.name,fixture),activeItem=selected;
 const datum=isBase(fields.id)?fields.height+kitchenFoot(fields.feet).height:null;
 const targets=new Set(heightIds.filter(id=>id!==active));
 const kitchenGroups=new Map(draft.items.filter(p=>p.assistant_carcass?.spec.kitchenModel).map(p=>[p.assistant_carcass.group_id,p.assistant_carcass]));
 for(const [id,meta] of kitchenGroups){
  if(id===active||!(targets.has(id)||wholeKitchen&&materialRoles.length))continue;
  const c=selectedCarcassIfUpdating(id),materials=kitchenMaterials(c);
  if(wholeKitchen)for(const role of materialRoles)materials[role]=fields.materials[role];
  if(targets.has(id)){
   const f=kitchenFields(meta.spec.kitchenModel,meta.spec);f.materials=materials;f.height=datum-kitchenFoot(f.feet).height;
   apply(f,id,meta.name);targets.delete(id);
  }else{
   // Finish-only changes keep the original construction and all individual exceptions.
   const metadata={...meta,spec:{...meta.spec,kitchenMaterials:materials}};
   draft.state.items=draft.items.map(it=>{
    if(it.assistant_carcass?.group_id!==id)return it;
    const key=it.item_id.slice(id.length+1),role=materialRole(key,it);
    return {...it,assistant_carcass:metadata,body_variant_id:materialRoles.includes(role)?materials.parts[key]??materials[role]:it.body_variant_id};
   });
  }
 }
 for(let i=0;i<draft.items.length;i++){
  const item=draft.items[i];if(!targets.has(item.item_id)||!kitchenSettings(item))continue;
  const next=dimensionPatch(item,{height:datum},draft.room);draft.items[i]=next;
  const err=draft.validate(next,draft.items);if(err)throw Error(item.name+' · '+err);
 }
 if(owned&&datum!=null&&(!state.upperMountingRule||state.upperMountingRule==='worktop600')){
  const before=lowerMembers(adapter.items),after=new Map(lowerMembers(draft.items).map(p=>[p.id,p]));
  const shifted=new Map();
  for(const [id] of kitchenGroups){
   const m=draft.items.find(it=>it.assistant_carcass?.group_id===id)?.assistant_carcass;
   if(!m?.spec.kitchenModel?.startsWith('wall-'))continue;
   const {rotation,x,z}=m.position,pos=rotateXZ(x,z,-rotation),width=m.spec.width;
   const back=pos.z-surroundLayout(m.spec).depth/2;
   const below=before.filter(c=>c.rotation===rotation&&Math.abs(c.back-back)<=1&&c.lo<pos.x+width/2-1&&c.hi>pos.x-width/2+1);
   if(!below.length)continue;
   const mount=members=>Math.max(...members.map(c=>c.height+c.topThickness))+600;
   const old=mount(below),next=mount(below.map(c=>after.get(c.id)??c));
   if(old!==m.position.elevation_mm||old===next)continue;
   shifted.set(id,{delta:next-old,meta:{...m,spec:{...m.spec,elevation:next},position:{...m.position,elevation_mm:next}}});
  }
  if(shifted.size){
   draft.state.items=draft.items.map(it=>{
    const change=shifted.get(it.assistant_carcass?.group_id);
    return change?{...it,elevation_mm:it.elevation_mm+change.delta,assistant_carcass:change.meta}:it;
   });
   for(const it of draft.items)if(shifted.has(it.assistant_carcass?.group_id)){
    const error=draft.validate(it,draft.items);if(error)throw Error(it.name+' · '+error);
   }
  }
 }
 const issue=fixturePlans(draft.items,draft.room).find(f=>f.error);if(issue)throw Error(issue.error);
 adapter.state.items=draft.items;adapter.select(activeItem);adapter.notify();return active;
}
