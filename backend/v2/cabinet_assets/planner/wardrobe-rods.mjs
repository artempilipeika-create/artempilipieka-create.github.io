import {rearClearance} from './panel-machining.mjs';
import catalogue from './wardrobe-rods.json' with {type:'json'};
import {columnWidths,nicheSlot,sectionWidths,splitAt,splitKey} from './wardrobe-layout.mjs';
import {measuredRooms,installedShelfLevels} from './wardrobe-gola-shelves.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';

export {catalogue as rodCatalogue};
export const rodFinish={chrome:'Хром',black:'Чёрная',white:'Белая'};
export function rodLabel(article){
 const p=catalogue[article];
 return (p.family==='round'?'Круглая Ø25':'Овальная 30×15')+' · '+rodFinish[p.finish]+' · '+String(p.wallMm).replace('.',',')+' мм';
}
export function sameRodCell(a,b){
 return a.section===b.section&&a.level===b.level&&(a.column??null)===(b.column??null)&&(a.column==null||a.opening===(b.opening??0));
}
export function rodRoom(s,cell,levels){
 const {section,level}=cell,widths=sectionWidths(s);
 if(!Number.isInteger(section)||section<0||section>=s.sections)throw Error('Выберите секцию для штанги.');
 const base=measuredRooms(s,section,level,null,levels)[level],zone=splitAt(s,section,level);
 if(!base)throw Error('Выберите существующую нишу для штанги.');
 const old=s.drawerBanks?.[nicheSlot(section,0)];
 if(old&&!old.layout)throw Error('Сначала привяжите блок шуфляд этой секции к нише.');
 if(zone?.kind==='drawers'||s.drawerBanks?.[nicheSlot(section,level)])throw Error('Эту нишу занимают шуфляды. Выберите проём над ними.');
 let left=-s.width/2+s.thickness+widths.slice(0,section).reduce((x,w)=>x+w+s.thickness,0);
 let width=widths[section],low=base.bottom,high=base.top;
 let lhs=section===0?'left':'divider-'+(section-1),rhs=section===s.sections-1?'right':'divider-'+section;
 if(zone){
   const column=zone.columns?.[cell.column];
   if(!column)throw Error('Выберите проём слева или справа от перегородки.');
   const room=measuredRooms(s,section,level,cell.column,levels)[cell.opening??0];
   if(!room)throw Error('Выберите существующий проём колонки.');
   const halves=columnWidths(zone,width);width=halves[cell.column];low=room.bottom;high=room.top;
   const divider=splitKey(zone)+'-divider';
   if(cell.column===0)rhs=divider;
   else{lhs=divider;left+=halves[0]+18;}
 }else if(cell.column!=null)throw Error('Для этой штанги нужна перегородка в выбранной нише.');
 const innerRear=rearClearance(s)+(s.bottomFit==='none'&&s.sections>1?s.thickness:0);
 const frontSetback=zone?(s.shelfSetback??1):s.sections>1?(s.dividerSetback??1):0;
 return {left,width,low,high,lhs,rhs,rear:-s.depth/2+innerRear,usableDepth:s.depth-innerRear-frontSetback};
}
export function rodLimits(room,article,anchor){
 const [minY,maxY,minZ,maxZ]=catalogue[article].bounds;
 const fromTop=anchor==='top',span=room.high-room.low;
 return {min:Math.ceil(fromTop?maxY:-minY),max:Math.floor(span-(fromTop?-minY:maxY)),
   near:Math.ceil(-minZ),far:Math.floor(room.usableDepth-maxZ)};
}
export function planRods(spec,levels){
 const ids=new Set();
 return (spec.rods??[]).map(rod=>{
   const product=catalogue[rod.article];
   if(!product||!['top','bottom'].includes(rod.anchor)||typeof rod.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(rod.id)||ids.has(rod.id))throw Error('Проверьте модель и обозначение штанги.');
   ids.add(rod.id);
   const room=rodRoom(spec,rod,levels),limit=rodLimits(room,rod.article,rod.anchor);
   if(!Number.isInteger(rod.offset)||rod.offset<limit.min||rod.offset>limit.max)throw Error('Штанга в секции '+(rod.section+1)+': до оси допустимо '+limit.min+'–'+limit.max+' мм.');
   const at=rod.fromBack??room.usableDepth/2;
   if(!Number.isFinite(at)||at<limit.near||at>limit.far)throw Error('Штанга выходит за глубину стойки. Проверьте отступ от заднего края.');
   return {...rod,...room,product,y:rod.anchor==='top'?room.high-rod.offset:room.low+rod.offset,z:room.rear+at,cut:room.width-product.cutAllowance};
 });
}
export function rodWarnings(rods,thickness){
 const warnings=new Set();
 for(let i=0;i<rods.length;i++)for(let j=i+1;j<rods.length;j++){
   const a=rods[i],b=rods[j],opposite=a.rhs===b.lhs||b.rhs===a.lhs;
   const shared=a.rhs===b.lhs?a.rhs:b.rhs===a.lhs?b.rhs:null;
   if(opposite&&(shared.endsWith('-divider')?18:thickness)>=32)continue;
   if(!opposite&&a.lhs!==b.lhs&&a.rhs!==b.rhs)continue;
   const clashes=a.product.holes.some(([y,z])=>b.product.holes.some(([yy,zz])=>Math.hypot(a.y+y-b.y-yy,a.z+z-b.z-zz)<3.5));
   const sameSpace=a.lhs===b.lhs&&a.rhs===b.rhs&&Math.abs(a.y-b.y)<(a.product.family==='round'?12.5:15)+(b.product.family==='round'?12.5:15)&&Math.abs(a.z-b.z)<(a.product.family==='round'?12.5:7.5)+(b.product.family==='round'?12.5:7.5);
   if(clashes||sameSpace)warnings.add('Штанги '+a.article+' (секция '+(a.section+1)+') и '+b.article+' (секция '+(b.section+1)+')'+(sameSpace?' пересекаются.':' имеют совпадающие отверстия держателей.')+' Измените высоту или глубину одной штанги.');
 }
 return [...warnings];
}

export function nativeRods(items){
 const byId=new Map(items.map(it=>[it.item_id,it])),out=[],groups=new Set();
 for(const item of items)if(item.assistant_carcass?.spec.rods?.length)groups.add(item.assistant_carcass.group_id);
 for(const id of groups){
   const top=byId.get(id+':top');
   if(!top?.assistant_carcass?.spec.rods?.length)throw Error('Не найдена крыша шкафа со штангой. Пересоберите шкаф в конструкторе.');
   const meta=top.assistant_carcass;
   const s=meta.spec,rods=planRods(s,installedShelfLevels(items,id)),issues=rodWarnings(rods,s.thickness);if(issues.length)throw Error(issues.join(' '));
   const rotation=top.rotation??0,center=localPoint(top,rotation);
   for(const r of rods){
     const left=byId.get(meta.group_id+':'+r.lhs),right=byId.get(meta.group_id+':'+r.rhs);
     if(!left||!right||left.rotation!==rotation||right.rotation!==rotation)throw Error('Проверьте обе стойки штанги в секции '+(r.section+1)+'.');
     const lx=localPoint(left,rotation).x+left.width/2,rx=localPoint(right,rotation).x-right.width/2;
     if(Math.abs(rx-lx-r.width)>.01||Math.abs(lx-center.x-r.left)>.01)throw Error('Положение стоек штанги изменилось. Проверьте шкаф в конструкторе.');
     out.push({name:'Штанга AKS '+rodLabel(r.article)+' · секция '+(r.section+1),wardrobe_rod:true,article:r.article,
       rod_id:r.id,host_blank_id:left.item_id,joined_panel_id:right.item_id,source_file:r.product.file,source_sha256:r.product.sha,
       span_mm:r.width,cut_mm:r.cut,holders_included:2,elastic_resize:true,rotation,
       position:{...worldPoint({x:lx,z:center.z+r.z},rotation),y:top.elevation_mm-s.height+s.thickness+r.y}});
   }
 }
 return out;
}
