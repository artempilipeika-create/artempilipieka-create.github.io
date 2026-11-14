import {choice,defaultShelf,fittings,shelfRows} from './shelf-choices.mjs';
import {photoArticles} from './shelf-images.mjs';
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function shelfQuestionnaire(ui,parent,section){
 const f=ui.fields,count=f.sectionShelves[section],rows=shelfRows(f),row=rows[section];
 const scope=ui.shelfScopes[section]??'all';
 const indexes=row.map((_,i)=>i).filter(i=>scope==='all'||(scope==='top2'?i>=count-2:i===Number(scope)));
 const values=indexes.map(i=>row[i]),sample=choice(values[0]||defaultShelf,f.thickness);
 const mixed=values.some(value=>value!==values[0]);
 const draft=ui.shelfDrafts[section]??(sample.kind==='board'?'board':String(sample.thickness));
 ui.select(parent,'Какие полки изменить',[['all','Все полки секции'],...(count>2?[['top2','Две верхние']]:[]),
   ...row.map((_,i)=>[i,'Полка '+(i+1)+(i===0?' · нижняя':i===count-1?' · верхняя':'')])],scope,v=>{
    ui.shelfScopes[section]=v;delete ui.shelfDrafts[section];ui.render();
 });
 ui.select(parent,'Материал и толщина полки',[['board','ЛДСП · '+f.thickness+' мм'],...[4,6,8].map(n=>[n,'Стекло · '+n+' мм'])],draft,v=>{
   ui.shelfDrafts[section]=v;
   const first=v==='board'?'95388':'48846';
   set(v+'/'+first);
 });
 function set(value){
   const next=shelfRows(f);
   for(const index of indexes)next[section][index]=value;
   f.shelfChoices=next;ui.changed();ui.render();
 }
 const kind=draft==='board'?'board':'glass',thickness=kind==='board'?f.thickness:Number(draft);
 const grid=element('div');grid.className='shelf-options';grid.setAttribute('role','group');grid.setAttribute('aria-label','Полкодержатели');
 const relevant=fittings.filter(h=>h.kind===kind&&(h.sizes.includes(thickness)||h.article==='95388'));
 const families=new Map();
 for(const h of relevant){if(!families.has(h.name))families.set(h.name,[]);families.get(h.name).push(h);}
 for(const [family,variants] of families){
   const selected=variants.find(h=>h.article===sample.hardware.article);
   const h=selected??variants[0],active=!mixed&&Boolean(selected);
   const card=element('div'),b=element('button');b.type='button';b.setAttribute('aria-pressed',String(active));
   b.setAttribute('aria-label',family+' · '+h.finish+' · '+h.article);
   const img=element('img');img.src='/account/planner/shelf-images/'+h.article+'.webp';img.alt=(photoArticles.includes(h.article)?'Фото ':'Вид из БАЗИС · ')+family;
   b.append(img,element('strong',family),element('small',h.finish+' · '+h.article));b.onclick=()=>set(draft+'/'+h.article);card.append(b);
   if(active&&variants.length>1)ui.select(card,'Исполнение '+family,variants.map(v=>[v.article,[v.finish,v.detail,v.article].filter(Boolean).join(' · ')]),h.article,v=>set(draft+'/'+v));
   if(active&&family==='Casper')card.append(element('small','Плита '+thickness+' мм · левый и правый фрагменты'));
   grid.append(card);
 }
 parent.append(grid);
 if(mixed)parent.append(element('p','У выбранных полок разные держатели. Нажмите карточку, чтобы назначить один для всех выбранных полок.'));
 const others=fittings.filter(h=>h.kind===kind&&!h.sizes.length);
 if(others.length){const panel=element('details');panel.append(element('summary','Ещё в каталоге · требуется сверка установки'));
  const otherGrid=element('div');otherGrid.className='shelf-options';
  for(const h of others){const card=element('div'),img=element('img');img.src='/account/planner/shelf-images/'+h.article+'.webp';img.alt=h.name;card.append(img,element('small',h.name+' · '+h.finish+' · '+h.article));otherGrid.append(card);}
  panel.append(otherGrid);parent.append(panel);}
 const list=element('ul');list.className='shelf-schedule';
 const grouped=new Map();
 for(const value of row)grouped.set(value,(grouped.get(value)||0)+1);
 for(const [value,n] of grouped){const c=choice(value,f.thickness);list.append(element('li',(c.kind==='board'?'ЛДСП':'Стекло')+' '+c.thickness+' мм × '+n+' · '+c.hardware.name+' · арт. '+c.hardware.article+' × '+(4*n)+' шт.'));}
 parent.append(list);
}
