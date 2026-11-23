import {adjustableHeight,defaultFitting,fittingCatalogue,planFitting,planFittings,touchingStandardRod} from './wardrobe-fittings.mjs';
import {planRods,sameRodCell} from './wardrobe-rods.mjs';

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
const categories=[
 ['lifts','Пантографы VENTO'],['hangers','Выдвижные вешалки GRIDLI и BRUNO'],
 ['trousers','Брючницы GRIDLI и BRUNO'],['ties','Вешалки для галстуков BRUNO'],
 ['trays','Полки-органайзеры BRUNO'],['ironing','Гладильные доски']
];
export function fittingControls(ui,parent,cell,fame=false){
 const f=ui.fields,message=el('p');message.setAttribute('role','status');const installed=el('div');
 const inCell=(f.fittings??[]).filter(x=>sameRodCell(x,cell)&&((fittingCatalogue[x.variant].category==='rods')===fame));
 const selected=fame&&ui.fameId!==null?(inCell.find(x=>x.id===ui.fameId)??inCell[0]):null;
 const levels=ui.previewBuilt?.installedLevels;
 let replaceRod='';
 function commit(next,selectedId){
   try{
     const rods=(f.rods??[]).filter(r=>r.id!==replaceRod);
     const spec={...f,fittings:next,rods},planned=planFittings(spec,levels);
     const rod=fame&&planned.find(v=>v.id===selectedId);
     if(rod&&touchingStandardRod(rod,planRods(spec,levels)))throw Error('Штанги пересекаются. Выберите замену установленной штанги или измените её положение.');
     if(replaceRod){if(rods.length)f.rods=rods;else delete f.rods;}
     if(next.length)f.fittings=next;else delete f.fittings;
     if(fame)ui.fameId=selectedId;
     ui.changed(true);
   }catch(e){message.textContent=e.message;}
 }
 if(fame&&inCell.length){
   ui.select(parent,'Штанга FAME в нише',[...inCell.map((v,i)=>[v.id,(i+1)+'. '+fittingCatalogue[v.variant].name]),['new','Добавить ещё одну штангу']],
     selected?.id??'new',id=>{ui.fameId=id==='new'?null:id;ui.render();});
 }
 const ordinary=(f.rods??[]).filter(v=>sameRodCell(v,cell));
 if(fame&&!selected&&ordinary.length)ui.select(parent,'Как установить FAME',[['','Добавить отдельной штангой'],
   ...ordinary.map((v,i)=>[v.id,'Заменить штангу '+(i+1)+' · AKS '+v.article])],'',value=>{replaceRod=value;});
 for(const v of fame?(selected?[selected]:[]):inCell){
   const p=fittingCatalogue[v.variant],box=el('fieldset');box.dataset.installedFitting=v.variant;
   box.append(el('legend',p.name+' · '+p.article));
   const edit=(field,n)=>commit(f.fittings.map(x=>x.id===v.id?{...x,[field]:n}:x),v.id);
   if(adjustableHeight(p))number(box,p.mount==='tray'?'От низа ниши, мм':'От верха ниши, мм',v.offset,3000,n=>edit('offset',n));
   const plan=ui.previewBuilt?.fittings?.find(x=>x.id===v.id);
   number(box,'От переднего края, мм',v.frontInset??plan?.depth??0,1200,n=>edit('frontInset',n));
   box.append(button('Убрать из ниши',()=>commit(f.fittings.filter(x=>x.id!==v.id))));installed.append(box);
 }
 parent.append(installed,message);
 if(!fame)parent.append(button('Штанги FAME',()=>{ui.interior='rod';ui.rodFamily='fame';ui.fameId=undefined;ui.render();}));
 const groups=fame?[['spanSide','FAME · крепление к боковинам'],['spanTop','FAME · крепление под полкой или крышей']]:categories;
 for(const [id,name] of groups){
   const group=el('details');group.append(el('summary',name));
   group.open=id===(fame?(ui.fameMount??(selected?fittingCatalogue[selected.variant].mount:'spanSide')):ui.fittingCategory);
   group.ontoggle=()=>{if(group.isConnected&&group.open){if(fame)ui.fameMount=id;else ui.fittingCategory=id;}};
   const grid=el('div');grid.className='wardrobe-handle-cards';
   const matches=Object.entries(fittingCatalogue).filter(([,p])=>fame?p.category==='rods'&&p.mount===id:p.category===id);
   for(const [key,p] of matches.sort((a,b)=>a[1].name.localeCompare(b[1].name,'ru',{numeric:true}))){
     const pick=card(key,p,()=>{
       if(!selected&&(f.fittings?.length??0)>=128){message.textContent='В шкафу уже 128 механизмов.';return;}
       const item=defaultFitting(key,cell);
       if(selected){
         item.id=selected.id;
         if(selected.frontInset!=null)item.frontInset=selected.frontInset;
         if(p.mount===fittingCatalogue[selected.variant].mount)item.offset=selected.offset;
       }else if(fame&&replaceRod){
         const old=planRods({...f,rods:ordinary.filter(v=>v.id===replaceRod)},levels)[0];
         if(p.mount==='spanSide')item.offset=Math.max(0,Math.round(old.high-old.y));
         item.frontInset=Math.round(old.rear+old.usableDepth-old.z);
       }else if(fame&&inCell.length){
         const previous=ui.previewBuilt?.fittings?.filter(v=>sameRodCell(v,cell)&&v.p.category==='rods')??[];
         if(p.mount==='spanSide')item.offset=Math.round(Math.max(item.offset,...previous.map(v=>v.room.high-v.box[0][1]))+100);
         else if(previous.length)item.frontInset=Math.max(20,Math.min(...previous.map(v=>v.depth))-55);
       }
       if(fame&&!selected&&!replaceRod&&ordinary.length&&p.mount==='spanSide'){
         try{
           const rods=planRods({...f,rods:ordinary},levels);
           for(let i=0;i<rods.length;i++){
             const placed=planFitting(f,item,levels),hit=touchingStandardRod(placed,rods);
             if(!hit)break;
             item.offset+=Math.ceil(placed.box[1][1]-hit.y-hit.product.bounds[0])+1;
           }
         }catch(e){message.textContent=e.message;return;}
       }
       if(fame)ui.fameMount=id;else ui.fittingCategory=id;
       commit(selected?f.fittings.map(v=>v.id===selected.id?item:v):[...(f.fittings??[]),item],item.id);
     });
     if(fame)pick.setAttribute('aria-pressed',String(key===selected?.variant));
     grid.append(pick);
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
