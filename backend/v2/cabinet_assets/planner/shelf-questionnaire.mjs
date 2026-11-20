import {rearClearance} from './panel-machining.mjs';
import {choice,defaultShelf,fittings,shelfRows,shelfDescription} from './shelf-choices.mjs';
import {nicheSlot} from './wardrobe-niches.mjs';
import {fittingImage,jointPhotos} from './hardware-photos.mjs';
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function shelfQuestionnaire(ui,parent,section){
 const f=ui.fields,count=f.sectionShelves[section],rows=shelfRows(f),row=rows[section];
 const scope=ui.shelfScopes[section]??'all';
 const protectedCover=i=>[i,i+1].some(level=>f.drawerBanks?.[nicheSlot(section,level)]?.layout);
 const indexes=row.map((_,i)=>i).filter(i=>!protectedCover(i)&&(scope==='all'||(scope==='top2'?i>=count-2:i===Number(scope))));
 const values=indexes.map(i=>row[i]),sample=choice(values[0]||defaultShelf,f.thickness);
 const mixed=values.some(value=>value!==values[0]);
 const draft=ui.shelfDrafts[section]??(sample.kind==='board'?'board':String(sample.thickness));
 ui.select(parent,'Какие полки изменить',[['all','Все полки секции'],...(count>2?[['top2','Две верхние']]:[]),
   ...row.map((_,i)=>[i,'Полка '+(i+1)+(i===0?' · нижняя':i===count-1?' · верхняя':'')])],scope,v=>{
    ui.shelfScopes[section]=v;delete ui.shelfDrafts[section];ui.render();
 });
 if(row.some((_,i)=>protectedCover(i))){
   const note=element('p','Крепёж ограничивающих полок задаётся один раз для шкафа.');parent.append(note);
   if(!indexes.length){
     const edit=element('button','Крепление полки над шуфлядами');edit.type='button';
     edit.onclick=()=>{ui.form.querySelector('[aria-label="Крепёж полок у шуфляд и заднего ребра"]')?.focus();};parent.append(edit);return;
   }
 }
 ui.select(parent,'Материал и толщина полки',[['board','ЛДСП · '+f.thickness+' мм'],...[4,6,8].map(n=>[n,'Стекло · '+n+' мм'])],draft,v=>{
   ui.shelfDrafts[section]=v;
   const first=v==='board'?'95388':'48846';
   set(v+'/'+first);
 });
 function set(value){
   const next=shelfRows(f);
   for(const index of indexes)next[section][index]=value;
   f.shelfChoices=next;ui.changed(true);
 }
 const kind=draft==='board'?'board':'glass',thickness=kind==='board'?f.thickness:Number(draft);
 if(kind==='board' && thickness===18){
   const methods=element('div');methods.className='shelf-options';methods.setAttribute('aria-label','Крепление полки 18 мм');
   for(const [code,label] of [['holder','Полкодержатели'],['confirmat','Конфирматы 7×50'],['cam_dowel','Эксцентрики + шканты']]){
     const b=element('button');b.type='button';b.setAttribute('aria-label',label);
     b.setAttribute('aria-pressed',String(!mixed&&(sample.scheme??'holder')===code));
     b.append(jointPhotos(code),element('strong',label),element('small',code==='holder'?'Съёмная полка':'Фиксированная полка'));
     b.onclick=()=>set('board/'+(code==='holder'?(sample.kind==='board'&&!sample.scheme?sample.hardware.article:'95388'):code));methods.append(b);
   }
   parent.append(methods);
   if(sample.scheme && !mixed){
     const cam=sample.scheme==='cam_dowel',depth=f.depth-1-rearClearance(f);
     const axes=cam?[70,102,depth-102,depth-70]:[70,depth-70];
     const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
     svg.setAttribute('viewBox','0 0 400 72');svg.setAttribute('role','img');svg.setAttribute('aria-label','Расположение крепежа на обоих торцах полки, вид снизу');
     const shape=(tag,attrs)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);svg.append(n);};
     shape('rect',{x:8,y:8,width:384,height:56,fill:'#efe2cd',stroke:'#7a6958'});
     for(const y of [8,64])for(const [i,axis] of axes.entries()){
       const dowel=cam&&(i===1||i===2),x=8+384*axis/depth;
       shape('line',{x1:x,x2:x,y1:y-5,y2:y+5,stroke:dowel?'#a26f3d':'#315e4d','stroke-width':4});
       if(cam&&!dowel)shape('circle',{cx:x,cy:y===8?16:56,r:4,fill:'#315e4d'});
     }
     parent.append(svg);
     parent.append(element('p',shelfDescription(sample,1)+' на полку. Оси от переднего края полки, мм: '+axes.join(' · ')+(cam?'. Чашки снизу.':'.')));
   }
 }
 const grid=element('div');grid.className='shelf-options';grid.setAttribute('role','group');grid.setAttribute('aria-label','Полкодержатели');
 const relevant=fittings.filter(h=>h.kind===kind&&(h.sizes.includes(thickness)||h.article==='95388'));
 const families=new Map();
 for(const h of relevant){if(!families.has(h.name))families.set(h.name,[]);families.get(h.name).push(h);}
 for(const [family,variants] of families){
   const selected=variants.find(h=>h.article===sample.hardware.article);
   const h=selected??variants[0],active=!mixed&&Boolean(selected);
   const card=element('div'),b=element('button');b.type='button';b.setAttribute('aria-pressed',String(active));
   b.setAttribute('aria-label',family+' · '+h.finish+' · '+h.article);
   const img=fittingImage(h.article,family+' · '+h.finish+' · '+h.article);
   b.append(img,element('strong',family),element('small',h.finish+' · '+h.article));b.onclick=()=>set(draft+'/'+h.article);card.append(b);
   if(active&&variants.length>1)ui.select(card,'Исполнение '+family,variants.map(v=>[v.article,[v.finish,v.detail,v.article].filter(Boolean).join(' · ')]),h.article,v=>set(draft+'/'+v));
   if(active&&family==='Casper')card.append(element('small','Плита '+thickness+' мм · левый и правый фрагменты'));
   grid.append(card);
 }
 if(!sample.scheme||mixed)parent.append(grid);
 if(mixed)parent.append(element('p','У выбранных полок разные держатели. Нажмите карточку, чтобы назначить один для всех выбранных полок.'));
 const others=fittings.filter(h=>h.kind===kind&&!h.sizes.length);
 if(others.length && (!sample.scheme||mixed)){const panel=element('details');panel.append(element('summary','Ещё в каталоге · требуется сверка установки'));
  const otherGrid=element('div');otherGrid.className='shelf-options';
  for(const h of others){const card=element('div');card.append(fittingImage(h.article,h.name),element('small',h.name+' · '+h.finish+' · '+h.article));otherGrid.append(card);}
  panel.append(otherGrid);parent.append(panel);}
 const list=element('ul');list.className='shelf-schedule';
 const grouped=new Map();
 for(const value of row)grouped.set(value,(grouped.get(value)||0)+1);
 for(const [value,n] of grouped){const c=choice(value,f.thickness);list.append(element('li',(c.kind==='board'?'ЛДСП':'Стекло')+' '+c.thickness+' мм × '+n+' · '+shelfDescription(c,n)));}
 parent.append(list);
}
