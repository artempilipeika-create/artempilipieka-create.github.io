import products from './wardrobe-fittings.json' with {type:'json'};
import {rodRoom} from './wardrobe-rods.mjs';
import {splitAt,splitKey} from './wardrobe-layout.mjs';
import {installedShelfLevels} from './wardrobe-gola-shelves.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';

export {products as fittingCatalogue};
export const adjustableHeight=p=>['tray','left','right','lift','spanSide'].includes(p.mount);
const centredDepth=p=>['spanTop','spanSide','lift'].includes(p.mount);
export function defaultFitting(key,cell){
 const p=products[key],offset=['left','right','spanSide'].includes(p.mount)?100:p.mount==='tray'?70:0;
 return {id:crypto.randomUUID(),variant:key,section:cell.section,level:cell.level,
   ...(cell.column!=null?{column:cell.column,opening:cell.opening??0}:{}),offset};
}
function faceOfOpening(spec,f,top){
 const zone=splitAt(spec,f.section,f.level);
 if(zone&&f.column!=null){
   const column=zone.columns[f.column],shelf=top?f.opening:f.opening-1;
   if(shelf>=0&&shelf<column.gaps.length-1){
     if(column.choices?.[shelf]&&!column.choices[shelf].startsWith('board/'))throw Error('Для крепления нужна полка из плиты.');
     return 'shelf-'+splitKey(zone)+'-'+f.column+'-'+shelf;
   }
 }
 const index=top?f.level:f.level-1;
 if(index>=0&&index<(spec.sectionShelves?.[f.section]??spec.shelves)){
   const choice=spec.shelfChoices?.[f.section]?.[index];
   if(choice&&!choice.startsWith('board/'))throw Error('Для крепления нужна полка из плиты.');
   return 'shelf-'+f.section+'-'+index;
 }
 if(!top&&(spec.bottomFit??spec.bottom)==='none')throw Error('Для гладильной доски нужно дно или полка из плиты.');
 if(top&&!['inset','overlay',undefined].includes(spec.topFit??spec.top))throw Error('Для верхнего крепления нужна сплошная крыша или полка.');
 return top?'top':'bottom';
}
export function planFitting(spec,f,levels){
 const p=products[f.variant];
 if(!p||p.mount==='door')throw Error('Выберите фурнитуру для ниши.');
 const room=rodRoom(spec,f,levels),[lo,hi]=p.bounds,[ax,ay,az]=p.anchor;
 const m=p.mount,span=Boolean(p.span);
 if(span&&(room.width<p.span[0]||room.width>p.span[1]))throw Error(p.series+' · ширина ниши должна быть '+p.span.join('–')+' мм. Сейчас '+room.width+' мм.');
 const x=span||m==='left'?room.left:m==='right'?room.left+room.width:room.left+room.width/2;
 const off=f.offset??0,upper=m!=='bottom'&&m!=='tray',y=upper?room.high-off:room.low+off;
 if(off&&!adjustableHeight(p))throw Error('Высота крепления задана опорной панелью.');
 const setDepth=f.frontInset??(centredDepth(p)?Math.round(room.usableDepth/2):0);
 const z=room.rear+room.usableDepth-setDepth;
 const box=[[x+lo[0]-ax,y+lo[1]-ay,z+lo[2]-az],[x+hi[0]-ax+(span?room.width-p.reference:0),y+hi[1]-ay,z+hi[2]-az]];
 const eps=.05;
 if(box[0][0]<room.left-eps||box[1][0]>room.left+room.width+eps)throw Error('Для этой модели нужна ширина в свету от '+Math.ceil(hi[0]-lo[0])+' мм. Сейчас '+room.width+' мм.');
 if(box[0][1]<room.low-eps||box[1][1]>room.high+eps)throw Error('Механизм выходит за высоту ниши. Измените высоту установки или выберите другой проём.');
 if(box[0][2]<room.rear-eps||box[1][2]>room.rear+room.usableDepth+eps)throw Error('Механизм выходит за глубину ниши. Доступно '+room.usableDepth+' мм, глубина модели '+Math.ceil(hi[2]-lo[2])+' мм.');
 let host=room.lhs,joined=room.rhs;
 if(['top','spanTop','bottom'].includes(m)){host=faceOfOpening(spec,f,m!=='bottom');joined=m==='spanTop'?room.lhs:host;}
 else if(m==='left'||m==='right')host=joined=m==='left'?room.lhs:room.rhs;
 return {...f,p,x,y,z,box,host,joined,width:room.width,depth:setDepth,room};
}
export function planFittings(spec,levels){
 const planned=(spec.fittings??[]).map(f=>planFitting(spec,f,levels));
 for(let i=0;i<planned.length;i++)for(let j=0;j<i;j++){
   const a=planned[i],b=planned[j];
   if(a.section===b.section&&[0,1,2].every(k=>Math.min(a.box[1][k],b.box[1][k])-Math.max(a.box[0][k],b.box[0][k])>.5))
     throw Error('В одной нише пересекаются '+a.p.article+' и '+b.p.article+'. Измените отступ или выберите другую нишу.');
 }
 return planned;
}
export function panelFittings(it,items=[]){
 const meta=it.assistant_carcass;
 return meta?.spec.fittings?.length&&it.item_id===meta.group_id+':top'?planFittings(meta.spec,installedShelfLevels(items,meta.group_id)):[];
}
export function nativeFittings(items){
 const byId=new Map(items.map(i=>[i.item_id,i])),out=[];
 for(const top of items){
   const meta=top.assistant_carcass;if(!meta||top.item_id!==meta.group_id+':top')continue;
   const rotation=top.rotation??0,center=localPoint(top,rotation),bottom=top.elevation_mm-meta.spec.height+meta.spec.thickness;
   for(const f of panelFittings(top,items)){
     const host=byId.get(meta.group_id+':'+f.host),joined=byId.get(meta.group_id+':'+f.joined);
     if(!host||!joined||host.rotation!==rotation||joined.rotation!==rotation)throw Error('Проверьте опорные детали для '+f.p.name+'.');
     const p=f.p;
     out.push({name:p.name,article:p.article,wardrobe_fitting:f.variant,fitting_id:f.id,source_file:(p.installation??p).file,source_sha256:(p.installation??p).sha,
       host_blank_id:host.item_id,joined_panel_id:joined.item_id,...(p.span?{span_mm:f.width}:{}),rotation,
       position:{...worldPoint({x:center.x+f.x,z:center.z+f.z},rotation),y:bottom+f.y}});
   }
 }
 return out;
}
