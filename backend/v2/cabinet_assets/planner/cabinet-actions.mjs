import {rearProjection} from './panel-machining.mjs';
import {outerFront} from './wardrobe-drawers.mjs';
import {splitPlinths,joinPlinths} from './wardrobe-plinth-runs.mjs';
import {resolveBlankBindings} from './blank-bindings.mjs';
import {footHeight} from './plinth-options.mjs';
import {placementError,kitchenGroup,dimensionPatch,heights,elevation,mountedItems,upperWorktopTop} from './furniture-core.mjs';

export const cabinetId=item=>item?.assistant_carcass?.group_id;
export const isInterior=item=>Boolean(cabinetId(item)&&/^(shelf-|divider-|drawer-|niche-)/.test(item.item_id.slice(cabinetId(item).length+1)));

export function cabinetEnvelope(meta){
 const {spec:s,position:p}=meta;
 return {...p,item_id:meta.group_id,module_type:'blank',name:'Шкаф',base:'wall',
   width:s.width,height:s.height+footHeight(s),depth:s.depth+rearProjection(s)+(outerFront(s)?18:0)};
}

export function cabinetChange(adapter,id,offset){
 const segments=splitPlinths(adapter.items),members=segments.filter(i=>cabinetId(i)===id);
 if(!id||!members.length)throw Error('Выберите шкаф целиком.');
 const meta=members[0].assistant_carcass;
 const others=segments.filter(i=>cabinetId(i)!==id);
 const memberIds=new Set(members.map(i=>i.item_id));
 const dependent=others.find(it=>it.blank_binding&&[it.blank_binding.left_id,it.blank_binding.right_id].some(key=>memberIds.has(key)));
 if(dependent)throw Error('К шкафу привязана отдельная деталь «'+dependent.name+'». Сначала снимите её привязку.');
 let moved=[];
 if(offset){
   const {dx,dz}=offset;
   if(![dx,dz].every(n=>Number.isFinite(n)&&Number.isInteger(n*2)))throw Error('Введите смещение с шагом 0,5 мм.');
   const position={...meta.position,x:meta.position.x+dx,z:meta.position.z+dz};
   const metadata={...meta,position};
   const otherGroups=new Map(others.filter(cabinetId).map(it=>[cabinetId(it),it.assistant_carcass]));
   const obstacles=[...others.filter(it=>!cabinetId(it)),...Array.from(otherGroups.values(),cabinetEnvelope)];
   const obstacle=placementError(cabinetEnvelope(metadata),obstacles,adapter.room);
   if(obstacle)throw Error(obstacle);
   moved=members.map(it=>({...it,x:it.x+dx,z:it.z+dz,assistant_carcass:metadata}));
 }
 const byId=new Map(moved.map(it=>[it.item_id,it]));
 const next=resolveBlankBindings(joinPlinths(segments.flatMap(it=>cabinetId(it)===id?byId.get(it.item_id)??[]:it)));
 if(next.length>100)throw Error('После разделения общего цоколя в проекте больше 100 деталей.');
 for(const item of next){const error=adapter.validate(item,next);if(error)throw Error(item.name+' · '+error);}
 return {next,moved};
}

export function commitCabinet(adapter,id,offset){
 const {next}=cabinetChange(adapter,id,offset);
 const selected=adapter.selected?.item_id;
 adapter.state.items=next;
 if(!next.some(it=>it.item_id===selected))adapter.select(next.find(it=>cabinetId(it)===id)?.item_id??next[0]?.item_id??null);
 adapter.notify();
}

export function heightTargets(items,source){
 const group=source&&kitchenGroup(source);
 if(!['lower','upper'].includes(group))return [];
 return items.filter(it=>it.module_type!=='tall_cabinet'&&kitchenGroup(it)===group);
}
export function matchCabinetHeight(adapter,source){
 const targets=heightTargets(adapter.items,source);
 if(!targets.some(it=>it.item_id===source.item_id))throw Error('Выберите нижний или верхний шкаф.');
 const upper=kitchenGroup(source)==='upper',height=upper?heights(source).body_height:source.height;
 const changes=new Map(targets.map(it=>{
   const next=dimensionPatch(it,upper?{body_height:height,elevation_mm:elevation(it,adapter.room)}:{height},adapter.room);
   if(upper)next.upper_mount_offset_mm=next.elevation_mm-upperWorktopTop(it,adapter.items)-600;
   return [it.item_id,next];
 }));
 const proposed=adapter.items.map(it=>changes.get(it.item_id)??it);
 const next=adapter.state.upperMountingRule==='worktop600'?mountedItems(proposed):proposed;
 // Identify the obstructed cabinet itself before the adapter checks the entire row.
 for(const item of next.filter(it=>it.module_type==='wall_cabinet')){
   const error=placementError(item,next,adapter.room);if(error)throw Error(item.name+' · '+error);
 }
 for(const item of next){
   if(upper&&changes.has(item.item_id)&&item.elevation_mm!==changes.get(item.item_id).elevation_mm)
     throw Error(item.name+' · новая высота нарушает отметку низа или пересекает соседний навесной шкаф.');
   const e=adapter.validate(item,next);
   if(e)throw Error(item.name+' · '+e);
 }
 return next;
}
