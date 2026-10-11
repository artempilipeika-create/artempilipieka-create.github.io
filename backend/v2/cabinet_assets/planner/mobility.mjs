import {clone,rotateXZ,elevation,heights,kitchenGroup,scopeMatches,PRODUCTION_MODELS,dimensionPatch,rightAnchoredWidth,productionParts,normalizeKitchen} from './furniture-core.mjs';

export function movementTargets(selected,items,scope='module'){
  if(!selected)return [];
  return scope!=='module'&&scopeMatches(selected,scope)?items.filter(it=>scopeMatches(it,scope)):[selected];
}
export function translateItems(items,dx,dz){
  if(!Number.isFinite(dx)||!Number.isFinite(dz))throw new Error('Укажите смещение в миллиметрах');
  dx=Math.round(dx*2)/2;dz=Math.round(dz*2)/2;
  return items.map(it=>({...clone(it),x:it.x+dx,z:it.z+dz}));
}
// Only a touching, straight run follows the right edge. Never move a perpendicular
// return, a different height tier or a cabinet across a deliberate gap.
export function rightNeighbours(source,items,room){
  if(PRODUCTION_MODELS[source.bazis_id]?.corner)return [];
  const u=rotateXZ(1,0,source.rotation||0),n=rotateXZ(0,1,source.rotation||0);
  const dot=(p,a)=>p.x*a.x+p.z*a.z,group=kitchenGroup(source);
  const candidates=items.filter(it=>it.item_id!==source.item_id&&it.rotation===source.rotation&&kitchenGroup(it)===group&&
    !PRODUCTION_MODELS[it.bazis_id]?.corner&&Math.abs(elevation(it,room)-elevation(source,room))<.1&&
    (Math.abs(dot(it,n)+it.depth/2-dot(source,n)-source.depth/2)<.6||Math.abs(dot(it,n)-it.depth/2-dot(source,n)+source.depth/2)<.6))
    .sort((a,b)=>dot(a,u)-dot(b,u));
  const found=[];let edge=dot(source,u)+source.width/2;
  for(const it of candidates){const left=dot(it,u)-it.width/2;if(left<edge-.6)continue;if(left>edge+.6)break;found.push(it);edge=dot(it,u)+it.width/2;}
  return found;
}
export function widthChange(source,next,items,room,shiftNeighbours){
  const delta=next.width-source.width;
  if(!shiftNeighbours||!delta)return [next];
  const u=rotateXZ(delta,0,source.rotation||0);
  return [next,...translateItems(rightNeighbours(source,items,room),u.x,u.z)];
}
export function validateChanges(adapter,changed){
  const ids=new Set(changed.map(it=>it.item_id));
  if(ids.size!==changed.length||changed.some(it=>!adapter.items.some(old=>old.item_id===it.item_id)))throw new Error('Состав проекта изменился. Повторите действие.');
  const next=adapter.items.map(it=>changed.find(x=>x.item_id===it.item_id)||it);
  for(const it of changed){const error=adapter.validate(it,next);if(error)throw new Error(it.name+': '+error);}
  return next;
}
export function applyChanges(adapter,changed){
  const next=validateChanges(adapter,changed);
  adapter.state.items=next.map(it=>adapter.persistent(it));adapter.notify();
}
export function replacement(source,draft,oldTemplate,newTemplate,keepDimensions=true){
  if(kitchenGroup(source)!==kitchenGroup(draft))throw new Error('Выберите модуль из той же группы: низ, верх или пеналы.');
  let next={...clone(draft),item_id:source.item_id,x:source.x,z:source.z,rotation:source.rotation};
  for(const key of ['body_variant_id','front_variant_id','back_variant_id','plinthMaterialId','countertopMaterialId','production_note','doors_open'])
    if(Object.hasOwn(source,key))next[key]=clone(source[key]);
  if(newTemplate?.production?.vitrine)next.front_variant_id=null;
  if(kitchenGroup(source)==='lower')for(const key of ['legHeightMm','base_height','rearServiceGapMm','countertopDepthMm','countertopStockLengthMm','countertopThicknessMm','countertopEnabled','countertopJoint','worktop_thickness'])
    if(Object.hasOwn(source,key))next[key]=source[key];
  next=normalizeKitchen(next);
  next=dimensionPatch(next,keepDimensions?{width:source.width,height:source.height,depth:source.depth}:{body_height:heights(draft).body_height});
  next=rightAnchoredWidth(source,next);
  const n=rotateXZ(0,(next.depth-source.depth)/2,source.rotation||0);next.x+=n.x;next.z+=n.z;
  next.x=Math.round(next.x*2)/2;next.z=Math.round(next.z*2)/2;
  const baseName=oldTemplate?.itemName||oldTemplate?.catalogue_label||oldTemplate?.label||'';
  const suffix=baseName&&String(source.name).startsWith(baseName)?String(source.name).slice(baseName.length):null;
  if(suffix===null||suffix!==''&&!/^ \d+$/.test(suffix))next.name=source.name;
  else next.name=((newTemplate?.itemName||newTemplate?.catalogue_label||newTemplate?.label||draft.name)+suffix).slice(0,160);
  const oldParts=productionParts(source,oldTemplate)||[],newParts=productionParts(next,newTemplate)||[];
  next.part_materials=Object.fromEntries(Object.entries(source.part_materials||{}).filter(([key])=>{
    const a=oldParts.find(p=>p.key===key),b=newParts.find(p=>p.key===key);return a&&b&&a.role===b.role&&!a.optical_material&&!b.optical_material;
  }));
  if(oldTemplate?.production?.tall?.family==='appliance'&&newTemplate?.production?.tall?.family==='appliance'&&source.appliance_details)next.appliance_details=clone(source.appliance_details);
  return next;
}
