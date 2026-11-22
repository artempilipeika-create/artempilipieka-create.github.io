import {adjustableHeight,defaultFitting,fittingCatalogue,planFittings} from './wardrobe-fittings.mjs';
import {sameRodCell} from './wardrobe-rods.mjs';

const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(text,onclick)=>Object.assign(el('button',text),{type:'button',onclick});
function card(key,p,select){
 const b=button('',select);b.dataset.fittingVariant=key;b.setAttribute('aria-label',p.name+' · AKS '+p.article);
 const img=new Image();img.src='/account/planner/wardrobe-fitting-photos/'+p.photo+'.webp';img.alt='';img.loading='lazy';
 const photos=el('span');photos.className='wardrobe-fitting-photos';photos.append(img);
 for(const component of p.components??[])if(component.photo){
   const holder=new Image();holder.src='/account/planner/wardrobe-fitting-photos/'+component.photo+'.webp';
   holder.alt=component.name+' · '+component.sku;holder.title=holder.alt;holder.loading='lazy';photos.append(holder);
 }
 b.append(photos,el('span',p.name),el('small','AKS '+p.article+(p.seriesPhoto?' · Фото серии':'')));return b;
}
function number(box,label,value,max,save){
 const field=el('label',label),input=el('input');input.type='number';input.min=0;input.max=max;input.step=1;input.value=value;input.setAttribute('aria-label',label);
 input.onchange=()=>{if(input.value!==''&&input.reportValidity())save(input.valueAsNumber);};field.append(input);box.append(field);
}
const sections=[['VENTO','Пантографы VENTO'],['GRIDLI','Выдвижные вешалки GRIDLI'],['BRUNO','Брючницы, вешалки и органайзеры BRUNO'],['FAME','Штанги FAME'],['Доски','Гладильные доски']];
export function fittingControls(ui,parent,cell){
 const f=ui.fields,message=el('p');message.setAttribute('role','status');const installed=el('div');
 function commit(next){
   try{
     const spec={...f,fittings:next};
     planFittings(spec,ui.previewBuilt?.installedLevels);
     if(next.length)f.fittings=next;else delete f.fittings;
     ui.changed(true);
   }catch(e){message.textContent=e.message;}
 }
 for(const v of (f.fittings??[]).filter(x=>sameRodCell(x,cell))){
   const p=fittingCatalogue[v.variant],box=el('fieldset');box.dataset.installedFitting=v.variant;
   box.append(el('legend',p.name+' · '+p.article));
   const edit=(field,n)=>commit(f.fittings.map(x=>x.id===v.id?{...x,[field]:n}:x));
   if(adjustableHeight(p))number(box,p.mount==='tray'?'От низа ниши, мм':'От верха ниши, мм',v.offset,3000,n=>edit('offset',n));
   const plan=ui.previewBuilt?.fittings?.find(x=>x.id===v.id);
   number(box,'От переднего края, мм',v.frontInset??plan?.depth??0,1200,n=>edit('frontInset',n));
   box.append(button('Убрать из ниши',()=>commit(f.fittings.filter(x=>x.id!==v.id))));installed.append(box);
 }
 parent.append(installed,message);
 for(const [series,name] of sections){
   const group=el('details');group.append(el('summary',name));group.open=ui.fittingSeries===series;
   group.ontoggle=()=>{if(group.open)ui.fittingSeries=series;};
   const grid=el('div');grid.className='wardrobe-handle-cards';
   for(const [key,p] of Object.entries(fittingCatalogue).filter(([,v])=>v.series===series).sort((a,b)=>a[1].name.localeCompare(b[1].name,'ru',{numeric:true}))){
     grid.append(card(key,p,()=>{
       if((f.fittings?.length??0)>=128){message.textContent='В шкафу уже 128 механизмов.';return;}
       ui.fittingSeries=series;commit([...(f.fittings??[]),defaultFitting(key,cell)]);
     }));
   }
   group.append(grid);parent.append(group);
 }
}
export function doorFittingControls(ui,parent,leaf,framed){
 const f=ui.fields,key=leaf.key,old=f.doorFittings?.[key];
 if(framed&&!old)return;
 const group=el('details');group.open=Boolean(old);group.append(el('summary','Выравниватель фасада FLAT'));
 const grid=el('div');grid.className='wardrobe-handle-cards';
 function set(value){
   const records={...f.doorFittings};if(value)records[key]=value;else delete records[key];
   if(Object.keys(records).length)f.doorFittings=records;else delete f.doorFittings;
   ui.changed(true);
 }
 for(const [variant,p] of Object.entries(fittingCatalogue).filter(([,v])=>v.mount==='door')){
   const b=card(variant,p,()=>set({variant,quantity:old?.quantity??1}));b.setAttribute('aria-pressed',String(old?.variant===variant));b.disabled=framed;grid.append(b);
 }
 group.append(grid);
 if(old){
   const p=fittingCatalogue[old.variant];group.append(el('p',p.manual+' Артикул и количество входят в закупку.'));
   ui.select(group,'Количество на створку',[[1,'1 шт.'],[2,'2 шт.']],old.quantity,v=>set({...old,quantity:Number(v)}));
   group.append(button('Убрать выравниватель',()=>set(null)));
 }
 parent.append(group);
}
