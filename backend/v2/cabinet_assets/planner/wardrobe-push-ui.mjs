import {hingeCatalogue,hingeProduct,settingFor,closingNames} from './wardrobe-hinge-layout.mjs';
import {pushProducts,pushDefault} from './wardrobe-push-layout.mjs';

const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const mountNames={auto:'Авто · сначала врезной',bored:'Врезной',surface:'Накладной'};
const tips={magnet:'Магнитный',rubber:'Резиновый'};
const series={reinforced:'Усиленный',standard:'Стандартный',metal:'Металлический корпус'};
const colors={'белый':'Белый','серый':'Серый','черный':'Чёрный'};
export function compatibleHinge(p,push){
 if(!push)return true;
 if(push===true)return p.closing==='springless';
 return pushProducts[push.article]?.tip==='rubber'?p.closing==='reverse':['reverse','springless'].includes(p.closing);
}
export function chooseHinge(kind,push,preferred){
 const current=hingeCatalogue[preferred];
 if(current?.kind===kind&&compatibleHinge(current,push))return current;
 return Object.values(hingeCatalogue).filter(p=>p.kind===kind&&compatibleHinge(p,push))
  .sort((a,b)=>Number(a.closing==='reverse')-Number(b.closing==='reverse')||Number(a.fixing==='euro')-Number(b.fixing==='euro'))[0];
}
export function pushControls(ui,box,leaf,clearHandle){
 const f=ui.fields.front,key=leaf.key,current=settingFor(f,key),push=current.push;
 const section=node('fieldset');section.className='wardrobe-door-editor';section.append(node('legend','Открывание двери'));box.append(section);
 function update(next){
  const value={...current};
  if(next){
   clearHandle(key);value.push=next;value.article=chooseHinge(hingeProduct(f,key).kind,next,current.article).article;
  }else delete value.push;
  (f.hinges??={})[key]=value;ui.changed(true);
 }
 function select(title,choices,value,action){return ui.select(section,title,Object.entries(choices),value,action);}
 select('Способ открывания',{handle:'Ручка',push:'Нажатием'},push?'push':'handle',v=>update(v==='push'?{...pushDefault}:null));
 if(!push)return;
 select('Система типона',{aks:'AKS',aq:'AQ ONE-PUSH'},push===true?'aq':'aks',v=>update(v==='aq'?true:{...pushDefault}));
 if(push===true){
  const fig=node('figure'),img=node('img');img.src='/account/planner/shelf-images/09.0019.webp';img.alt='AQ ONE-PUSH';img.width=104;img.height=64;
  fig.append(img,node('figcaption','AQ ONE-PUSH · 09.0019, адаптер 09.0020, ответная планка 09.0021'));section.append(fig);return;
 }
 const cfg={...pushDefault,...push},product=pushProducts[cfg.article];
 const entries=Object.entries(pushProducts);
 function pick(changes,filters){
  const pool=entries.filter(([,p])=>(changes.mount??cfg.mount)!=='bored'||p.mounts.bored)
   .filter(([,p])=>Object.entries(filters).every(([k,v])=>p[k]===v));
  const score=p=>4*Number(p.tip!==product.tip)+2*Number(p.series!==product.series)+Number(p.color!==product.color);
  pool.sort((a,b)=>score(a[1])-score(b[1]));
  if(pool.length)update({...cfg,...changes,article:pool[0][0]});
 }
 select('Монтаж типона',mountNames,cfg.mount,mount=>pick({mount},{}));
 select('Наконечник',tips,product.tip,tip=>pick({},{tip}));
 const available=entries.filter(([,p])=>p.tip===product.tip&&(cfg.mount!=='bored'||p.mounts.bored));
 select('Исполнение типона',Object.fromEntries(Object.entries(series).filter(([k])=>available.some(([,p])=>p.series===k))),product.series,family=>pick({},{tip:product.tip,series:family}));
 select('Цвет типона',Object.fromEntries(Object.entries(colors).filter(([k])=>available.some(([,p])=>p.series===product.series&&p.color===k))),product.color,color=>pick({},{tip:product.tip,series:product.series,color}));
 select('Место установки',{auto:'Автоматически',side:'Боковая стойка',shelf:'Закреплённая полка',bottom:'Дно или полка под створкой'},cfg.support,support=>update({...cfg,support}));
 if(cfg.support==='side'||cfg.support==='shelf'||cfg.support==='auto'&&leaf.height>=1100&&!key.includes('upper-')){
  const label=node('label','Высота нажатия от пола, мм'),input=node('input');input.type='number';input.min='0';input.max='5000';input.step='1';input.required=true;input.value=cfg.heightMm;
  input.onchange=()=>{if(input.reportValidity())update({...cfg,heightMm:input.valueAsNumber});};label.append(input);section.append(label);
 }
 const fig=node('figure'),img=node('img');img.src='/account/planner/shelf-images/'+cfg.article+'.webp';img.alt=product.name;img.width=140;img.height=85;
 fig.append(img,node('figcaption',product.name+' · '+cfg.article));section.append(fig);
 const pos=ui.previewBuilt?.pushLocations?.[key];
 if(pos)section.append(node('p',mountNames[pos.style]+' · '+pos.host+' · '+Math.round(pos.height)+' мм от пола'));
 section.append(node('small','Петля '+closingNames[hingeProduct(f,key).closing]+' · '+current.article+(product.tip==='magnet'?'. Стальная ответная планка входит в комплект.':'.')));
}
