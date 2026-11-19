import {columnOpenings,splitAt} from './wardrobe-layout.mjs';
import {nicheOpenings,nicheSlot,trimBanks} from './wardrobe-niches.mjs';
import {setClearHeight} from './wardrobe-cells.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {sectionWidths} from './carcass-model.mjs';
import {footHeight} from './plinth-options.mjs';
import {shelfRows} from './shelf-choices.mjs';

const element=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
function action(text,onclick){
 const button=element('button',text);button.type='button';button.onclick=onclick;return button;
}
function number(parent,title,value,min,max,fn,commitOnChange=false){
 const label=element('label',title),input=element('input');
 Object.assign(input,{type:'number',min,max,step:1,value:value??''});input.setAttribute('aria-label',title);
 input[commitOnChange?'onchange':'oninput']=()=>{if(input.value&&input.validity.valid)fn(input.valueAsNumber);};
 label.append(input);parent.append(label);return input;
}
function sizes(parent,name,count,current,fn){
 const nav=element('div');nav.className='wardrobe-subsections';nav.setAttribute('aria-label',name);
 for(let i=0;i<count;i++){
   const b=action(i?'Правая':'Левая',()=>fn(i));b.setAttribute('aria-pressed',String(i===current));nav.append(b);
 }
 parent.append(nav);
}

export function gapEditor(ui,parent,section,zone=null){
 const f=ui.fields,col=zone?.columns[ui.column??0];
 function activeBounds(){
   const all=nicheOpenings(f,section),room=zone&&all[zone.level];
   return col?columnOpenings(room.bottom,room.top,col,f.thickness):all;
 }
 const count=col?col.gaps.length-1:f.sectionShelves[section],index=Math.min(ui.gapIndex??0,count);
 let bounds;
 try{bounds=activeBounds();}catch(error){parent.append(element('p',error.message));}
 const title=i=>i===count?'Верхний проём':i===0?'Нижний проём':'Между полками '+i+' и '+(i+1);
 const locks=col?(col.locks??=[]):((f.gapLocks??=Array.from({length:f.sections},()=>[]))[section]??=[]);
 const current=i=>col?col.gaps[i]:i===count?f.topGaps?.[section]:f.shelfLevels?.[section]?.[i];
 const measured=i=>bounds?bounds[i].top-bounds[i].bottom:col?col.gaps[i]:i===count?f.topGaps?.[section]:f.shelfLevels?.[section]?.[i]?.mode==='gap'?f.shelfLevels[section][i].mm:null;
 function write(i,mm,mode='gap'){
   if(col)col.gaps[i]=mm;
   else if(i===count){f.topGaps??=Array(f.sections).fill(null);f.topGaps[section]=mm;}
   else{
     f.shelfLevels??=f.sectionShelves.map(n=>Array(n).fill(null));
     f.shelfLevels[section][i]=mm==null?null:{mode,mm};
   }
 }
 const box=element('fieldset');box.append(element('legend','Чистая высота проёмов'));parent.append(box);
 ui.select(box,'Выберите проём',Array.from({length:count+1},(_,i)=>[i,title(i)]),index,v=>{ui.gapIndex=Number(v);ui.render();});
 const size=number(box,title(index)+', мм',measured(index),60,3000,v=>{
   change(ui,next=>setClearHeight(next,{section,level:zone?zone.level:index,column:zone?ui.column??0:null,opening:index},v));
 },true);size.dataset.clearGap=String(index);
 const lock=action('',()=>{
   if(locks.includes(index))locks.splice(locks.indexOf(index),1);
   else{if(current(index)==null){if(measured(index)==null)return;write(index,measured(index));}locks.push(index);}
   ui.changed(true);
 });
 const remaining=element('output');remaining.className='niche-result';
 function refresh(){
   const locked=locks.includes(index);lock.textContent=locked?'Снять фиксацию':'Зафиксировать размер';lock.setAttribute('aria-pressed',String(locked));
   try{remaining.textContent='Проёмы снизу вверх · '+activeBounds().map(b=>b.top-b.bottom).join(' / ')+' мм';}catch(error){remaining.textContent=error.message;}
 }
 box.append(lock,action('Расставить полки равномерно',()=>{
   Array.from({length:count+1},(_,i)=>i).forEach(i=>{
     if(locks.includes(i))return;
     const structural=!col&&i<count&&[i,i+1].some(j=>f.drawerBanks?.[nicheSlot(section,j)]?.layout||splitAt(f,section,j));
     if(structural&&bounds)write(i,bounds[i].top+(f.elevation??0)+footHeight(f),'floor');else write(i,null);
   });
   ui.changed(true);
 }),action('Снять все фиксации и разделить поровну',()=>{
   locks.length=0;for(let i=0;i<=count;i++)write(i,null);ui.changed(true);
 }),remaining);refresh();
 if(!col&&index<count){
   const more=element('details');more.append(element('summary','Монтажная отметка от пола'));
   number(more,'От пола до низа полки, мм',bounds?bounds[index].top+(f.elevation??0)+footHeight(f):f.shelfLevels?.[section]?.[index]?.mode==='floor'?f.shelfLevels[section][index].mm:null,0,5000,v=>{write(index,v,'floor');ui.changed();refresh();});
   box.append(more);
 }
}
function change(ui,fn){
 try{const f=structuredClone(ui.fields);fn(f);wardrobeSpec(f);ui.fields=f;ui.changed(true);}catch(error){ui.output.textContent=error.message;}
}
// Turn the intervening full shelves into pairs while retaining their actual
// elevations in each column. Higher openings and their banks keep their anchors.
function divideShelves(f,section,start,end){
 const rooms=nicheOpenings(f,section),count=f.sectionShelves[section],remove=end-start;
 if(f.rods?.some(r=>r.section===section&&r.level>=start&&r.level<=end))throw Error('В этом проёме установлена штанга. Уберите её перед установкой перегородки.');
 if(f.nicheSplits?.some(z=>z.section===section&&z.level>=start&&z.level<=end))throw Error('В этом промежутке уже есть перегородка.');
 if(Array.from({length:remove+1},(_,j)=>f.drawerBanks?.[nicheSlot(section,start+j)]).some(Boolean))throw Error('Выберите промежуток для полок выше шуфляд.');
 const rows=shelfRows(f),floor=(f.elevation??0)+footHeight(f);
 const levels=f.sectionShelves.map((n,s)=>Array.from({length:n},(_,i)=>f.shelfLevels?.[s]?.[i]??null));
 const choices=rows[section].slice(start,end);
 const indices=f.gapLocks?.[section]??[];
 const columnLocks=indices.filter(i=>i>=start&&i<=end).map(i=>i-start);
 if(f.gapLocks)f.gapLocks[section]=indices.filter(i=>i<start||i>end).map(i=>i>end?i-remove:i);
 const gaps=rooms.slice(start,end+1).map((r,i)=>i===remove?null:r.top-r.bottom);
 levels[section]=rooms.slice(0,-1).map(r=>({mode:'floor',mm:r.top+floor}));
 if(remove){
   levels[section].splice(start,remove);rows[section].splice(start,remove);f.sectionShelves[section]-=remove;
   const banks=f.drawerBanks??[];
   for(let i=end+1;i<=count;i++)for(const column of [0,1]){
     const old=nicheSlot(section,i,column);
     if(banks[old]){banks[nicheSlot(section,i-remove,column)]=banks[old];banks[old]=null;}
   }
   f.drawerBanks=trimBanks(banks,f.sections);
   for(const r of f.rods??[])if(r.section===section&&r.level>end)r.level-=remove;
   for(const z of f.nicheSplits??[])if(z.section===section&&z.level>end)z.level-=remove;
 }
 f.shelfLevels=levels;f.shelfChoices=rows;
 (f.nicheSplits??=[]).push({kind:'shelves',section,level:start,columns:[0,1].map(()=>({gaps:[...gaps],...(columnLocks.length?{locks:[...columnLocks]}:{}),...(choices.some(c=>c!=='board/95388')?{choices:[...choices]}:{})}))});
}
export function splitControls(ui,parent,section){
 const f=ui.fields,count=f.sectionShelves[section],level=Math.min(ui.nicheIndex??0,count),slot=nicheSlot(section,level);
 const box=element('fieldset');box.append(element('legend','Перегородка в выбранной нише'));parent.append(box);
 ui.select(box,'Ниша для перегородки',Array.from({length:count+1},(_,i)=>[i,'Ниша '+(i+1)+' снизу']),level,v=>{ui.nicheIndex=Number(v);ui.gapIndex=0;ui.render();});
 const zone=splitAt(f,section,level);
 if(!zone){
   if(f.drawerBanks?.[slot]?.layout){
     box.append(action('Разделить шуфляды на левый и правый блок',()=>change(ui,next=>{
       (next.nicheSplits??=[]).push({kind:'drawers',section,level,edge:'open'});
       const bank=next.drawerBanks[slot];next.drawerBanks[nicheSlot(section,level,1)]=structuredClone(bank);
       for(const b of [bank,next.drawerBanks[nicheSlot(section,level,1)]])b.faces.forEach(face=>delete face.width);
       next.drawerBanks=trimBanks(next.drawerBanks,next.sections);ui.column=0;
     })));
   }else{
     let end=level;
     ui.select(box,'Верх перегородки',Array.from({length:count-level+1},(_,j)=>[j+level,j+level===count?'До крыши':'До полки '+(j+level+1)]),end,v=>{end=Number(v);});
     box.append(action('Добавить перегородку для полок',()=>change(ui,next=>{divideShelves(next,section,level,end);ui.gapIndex=0;ui.column=0;})));
   }
   return;
 }
 const w=sectionWidths(f)[section],left=zone.leftWidth??Math.ceil((w-18)/2),right=w-left-18;
 ui.select(box,'Ширина ниш',[['equal','Поровну'],['manual','Задать левую ширину']],zone.leftWidth==null?'equal':'manual',v=>{if(v==='equal')delete zone.leftWidth;else zone.leftWidth=left;ui.changed(true);});
 const widthNote=element('output','Справа '+right+' мм');
 if(zone.leftWidth!=null)number(box,'Чистая ширина слева, мм',left,100,w-118,v=>{zone.leftWidth=v;widthNote.textContent='Справа '+(w-18-v)+' мм';ui.changed();});
 box.append(widthNote);
 if(zone.kind==='drawers'){
   ui.select(box,'Передний торец общей стойки',[['open','Открыт · по 1,5 мм'],['overlay','Перекрыт фасадами · стык 3 мм']],zone.edge,v=>{zone.edge=v;ui.changed();});
   box.append(action('Настроить левый и правый блоки',()=>{ui.interior='drawer';ui.render();}));
 }else{
   sizes(box,'Колонка полок',2,ui.column??0,i=>{ui.column=i;ui.gapIndex=0;ui.render();});
   const col=zone.columns[ui.column??0];
   ui.select(box,'Полок в выбранной колонке',Array.from({length:11},(_,i)=>[i,String(i)]),col.gaps.length-1,v=>{
     const n=Number(v);
     if(n<col.gaps.length-1&&f.rods?.some(r=>r.section===section&&r.level===level&&r.column===(ui.column??0)&&r.opening>=n)){
       ui.render();ui.output.textContent='Удаляемая полка ограничивает проём со штангой. Сначала уберите штангу.';return;
     }
     if(col.choices)col.choices=Array.from({length:n},(_,i)=>col.choices[i]??'board/95388');
     if(col.locks)col.locks=col.locks.filter(i=>i<n);
     col.gaps=[...Array.from({length:n},(_,i)=>i<col.gaps.length-1?col.gaps[i]:null),null];ui.changed(true);
   });
   gapEditor(ui,box,section,zone);
 }
 box.append(action(zone.kind==='drawers'?'Убрать правый блок и перегородку':'Убрать перегородку и полки колонок',()=>change(ui,next=>{
   next.nicheSplits=next.nicheSplits.filter(z=>z.section!==section||z.level!==level);
   if(zone.kind==='drawers'){next.drawerBanks[nicheSlot(section,level,1)]=null;next.drawerBanks=trimBanks(next.drawerBanks,next.sections);}
   ui.column=0;
 })));
}
