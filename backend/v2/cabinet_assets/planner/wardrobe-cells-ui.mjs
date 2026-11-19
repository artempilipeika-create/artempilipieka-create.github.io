import {sameRodCell} from './wardrobe-rods.mjs';
import {cellGeometry,heightLimits,insertShelves,keysAfterInsertion,resizeSections,setClearHeight,setClearWidth,toggleHeightLock} from './wardrobe-cells.mjs';
import {nicheSlot,sectionOf,splitAt} from './wardrobe-layout.mjs';
import {installBank} from './wardrobe-interior-ui.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';

const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
function button(text,run){
 const b=el('button',text);b.type='button';b.onclick=run;return b;
}
export function activeCell(ui){
 const section=ui.activeSection,level=ui.nicheIndex,zone=splitAt(ui.fields,section,level);
 const column=zone?ui.column??0:null;
 return {section,level,column,opening:Math.max(0,Math.min(ui.gapIndex??0,(zone?.columns?.[column]?.gaps.length??1)-1))};
}
function change(ui,operation,after){
 try{
   const fields=structuredClone(ui.fields);
   operation(fields);wardrobeSpec(fields);
   ui.fields=fields;after?.();ui.changed(true);return true;
 }catch(error){ui.output.textContent=error.message;return false;}
}

export function sectionChoices(ui,parent){
 const choices=el('div');choices.className='assistant-cards section-count';choices.setAttribute('role','group');choices.setAttribute('aria-label','Деление корпуса');
 const warning=el('div');warning.className='section-warning';warning.hidden=true;
 for(const [i,name] of ['Одна секция','Две секции','Три секции','Четыре секции'].entries()){
   const n=i+1;
   const apply=()=>{
     const ok=change(ui,f=>resizeSections(f,n),()=>{
     ui.activeSection=Math.min(ui.activeSection,n-1);ui.nicheIndex=0;ui.gapIndex=0;ui.column=0;
       ui.shelfScopes={};ui.shelfDrafts={};
     });
     if(!ok){warning.textContent=ui.output.textContent;warning.hidden=false;}
   };
   const pick=button('',()=>{
     if(n===ui.fields.sections)return;
     if(ui.fields.rods?.some(r=>r.section>=n)||ui.fields.sectionShelves.slice(n).some(Boolean)||ui.fields.nicheSplits?.some(z=>z.section>=n)||ui.fields.drawerBanks?.some((b,slot)=>b&&sectionOf(slot)>=n)){
       warning.hidden=false;warning.replaceChildren(el('p','В удаляемых секциях есть наполнение.'),button('Убрать секции с наполнением',apply),button('Оставить',()=>{warning.hidden=true;}));
     }else apply();
   });
   const icon=el('span');icon.className='assistant-section-icon';icon.setAttribute('aria-hidden','true');
   for(let j=0;j<n;j++)icon.append(el('i'));
   pick.append(icon,el('span',name));pick.setAttribute('aria-pressed',String(n===ui.fields.sections));choices.append(pick);
 }
 parent.append(choices,warning);
}

function sizeField(ui,parent,{axis,cell,value,min,max,reason,near}){
 const width=axis==='width',label=width?'Ширина в свету, мм':'Высота в свету, мм';
 const box=el('div');box.className='cell-dimension';
 const wrap=el('label',label),input=el('input');
 Object.assign(input,{type:'number',inputMode:'numeric',step:'1',min,max,value,readOnly:Boolean(reason)});input.dataset.cellSize=axis;input.setAttribute('aria-label',label);
 wrap.append(input);box.append(wrap);
 const note=el('small',reason||near||'');note.id='cell-size-'+axis+'-hint';input.setAttribute('aria-describedby',note.id);
 if(!reason){
   const save=()=>{
     if(!change(ui,f=>(width?setClearWidth:setClearHeight)(f,cell,input.valueAsNumber))){
       note.textContent=ui.output.textContent;input.setAttribute('aria-invalid','true');
     }
   };
   const apply=button('Применить',save);apply.setAttribute('aria-label','Применить '+(width?'ширину':'высоту'));
   input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save();}};
   input.oninput=()=>{
     input.removeAttribute('aria-invalid');
     if(!input.value||!input.validity.valid){note.textContent='Допустимо от '+min+' до '+max+' мм';return;}
     note.textContent=near.replace(/\d+ мм$/,String(max+min-input.valueAsNumber)+' мм');
   };
   box.append(apply);
 }
 box.append(note);parent.append(box);
}

export function cellControls(ui,parent){
 const cell=activeCell(ui),f=ui.fields,{section,level}=cell;
 let h,w;
 const widthCell=ui.wholeWidth?{...cell,column:null}:cell;
 try{h=heightLimits(f,cell);w=cellGeometry(f,widthCell);}catch(e){parent.append(el('p',e.message));return;}
 const {index,sizes,zone,column}=h;
 const box=el('fieldset');box.className='cell-editor';
 box.append(el('legend','Секция '+(section+1)+' · ниша '+(level+1)+(zone?(ui.column===1?' · справа':' · слева'):'')+(column&&sizes.length>1?' · проём '+(index+1):'')));
 sizeField(ui,box,{axis:'height',cell,value:sizes[index],min:h.min,max:h.max,reason:h.reason,
   near:h.other>=0?'Соседний проём '+sizes[h.other]+' мм':''});
 if(sizes.length>1){
   const locked=h.locks.includes(index);
   const lock=button(locked?'Снять фиксацию высоты':'Зафиксировать высоту',()=>change(ui,next=>toggleHeightLock(next,cell)));
   lock.className='cell-lock';lock.setAttribute('aria-pressed',String(locked));box.append(lock);
 }
 const widths=w.widths,i=w.widthIndex,other=i<widths.length-1?i+1:i-1,min=w.local?100:100+2*(f.shelfGap??0);
 sizeField(ui,box,{axis:'width',cell:widthCell,value:widths[i],min,max:other<0?widths[i]:widths[i]+widths[other]-min,
   reason:other<0?'Ширину задают боковины корпуса.':'',near:other<0?'':'Соседняя ширина '+widths[other]+' мм'});
 if(!f.drawerBanks?.[nicheSlot(section,level)]&&(!zone||column)){
   const row=el('div');row.className='cell-insert';let count=1;
   const max=Math.min(10-sizes.length+1,Math.floor((sizes[index]-60)/(60+f.thickness)));
   if(max>0){
     ui.select(row,'Добавить полок в нишу',Array.from({length:max},(_,i)=>[i+1,String(i+1)]),1,v=>{count=Number(v);});
     row.append(button('Добавить полки',()=>change(ui,next=>insertShelves(next,cell,count),()=>{
       ui.sourceKeys=keysAfterInsertion(ui.sourceKeys,cell,count);ui.shelfScopes={};ui.shelfDrafts={};
     })));
     box.append(row);
   }
 }
 if((!zone||column)&&!f.drawerBanks?.[nicheSlot(section,level)])box.append(button('Выбрать штангу',()=>{ui.interior='rod';ui.render();}));
 if(!zone&&!f.drawerBanks?.[nicheSlot(section,level)]){
   box.append(button('Добавить шуфляды',()=>installBank(ui,section,level)));
 }
 if(!zone)box.append(button('Разделить нишу перегородкой',()=>{ui.interior='split';ui.render();}));
 parent.append(box);
}

export function selectCell(ui,{section,level,column=0,opening=0},axis,wholeWidth=false){
 if(ui.step===1)ui.interior='cell';
 ui.zoomDiagram(false);ui.activeSection=section;ui.nicheIndex=level;ui.column=column;ui.gapIndex=splitAt(ui.fields,section,level)?.columns?opening:level;
 ui.levelIndex=level;ui.shelfScopes[section]=String(level);ui.step=2;ui.view='sections';ui.wholeWidth=wholeWidth;
 if(!ui.pending)ui.output.textContent='';
 const rods=ui.fields.rods?.filter(r=>sameRodCell(r,activeCell(ui)))??[];
 ui.interior=axis?'cell':ui.fields.drawerBanks?.[nicheSlot(section,level,column)]?'drawer':rods.length||ui.interior==='rod'?'rod':'cell';
 ui.render();
 const field=ui.form.querySelector(axis?'[data-cell-size="'+axis+'"]':'.cell-editor legend, .niche-editor legend');
 if(axis){field?.focus({preventScroll:true});if(field&&!field.readOnly)field.select();}
 else if(field){field.tabIndex=-1;field.focus({preventScroll:true});}
 if(field&&matchMedia('(max-width:640px)').matches)field.scrollIntoView({block:'nearest'});
}

export function wireCellDrag(ui){
 const root=ui.drawing;let drag=null;
 root.addEventListener('pointerdown',event=>{
   const target=event.target.closest('[data-drag-mm]');
   if(!target||ui.busy||event.button!==0)return;
   const d=target.dataset,svg=target.ownerSVGElement,matrix=svg.getScreenCTM();
   if(!matrix)return;
   const cell={section:Number(d.section),level:Number(d.niche??d.shelfIndex??0),column:d.column==null?null:Number(d.column),opening:Number(d.opening??0)};
   const width=d.dragMm==='width';
   try{
     const g=width?cellGeometry(ui.fields,cell):heightLimits(ui.fields,cell);
     if(!width&&g.reason)return;
     const value=width?g.widths[g.widthIndex]:g.sizes[g.index];
     const scale=Number(d.scale)*(width?matrix.a:matrix.d);
     target.setPointerCapture(event.pointerId);
     drag={cell,width,value,scale,start:width?event.clientX:event.clientY,id:event.pointerId,target,moved:false,delta:0};
   }catch{return;}
 });
 root.addEventListener('pointermove',event=>{
   if(!drag||event.pointerId!==drag.id)return;
   const delta=(drag.width?event.clientX:event.clientY)-drag.start;
   if(!drag.moved&&Math.abs(delta)<3)return;
   if(!drag.moved){root.setPointerCapture(event.pointerId);drag.moved=true;}
   drag.delta=Math.round((drag.width?delta:-delta)/drag.scale);
   drag.target.setAttribute('transform','translate('+(drag.width?drag.delta*Number(drag.target.dataset.scale):0)+' '+(drag.width?0:-drag.delta*Number(drag.target.dataset.scale))+')');
   drag.target.classList.add('moving');
   ui.description.textContent=(drag.width?'Ширина':'Высота')+' в свету · '+(drag.value+drag.delta)+' мм';
 });
 function finish(event,cancel){
   if(!drag||event.pointerId!==drag.id)return;
   const {cell,width,value,delta,moved,target}=drag;drag=null;
   if(!moved)return;
   target.removeAttribute('transform');target.classList.remove('moving');
   if(root.hasPointerCapture(event.pointerId))root.releasePointerCapture(event.pointerId);
   if(cancel){ui.draw();return;}
   ui.suppressDiagramClick=true;setTimeout(()=>{ui.suppressDiagramClick=false;},0);
   if(change(ui,f=>(width?setClearWidth:setClearHeight)(f,cell,value+delta))){
     selectCell(ui,{...cell,column:cell.column??0},width?'width':'height',width&&cell.column==null);
   }else ui.draw();
 }
 root.addEventListener('pointerup',e=>finish(e,false));root.addEventListener('pointercancel',e=>finish(e,true));
}
