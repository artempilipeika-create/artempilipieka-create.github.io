import {footHeight} from './plinth-options.mjs';
import {trimSides,upperPush} from './wardrobe-surround.mjs';
import {aksPushProductControls} from './wardrobe-push-product-ui.mjs';

const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
function number(ui,box,label,obj,key,min,max){
 const wrap=el('label',label),input=el('input');
 Object.assign(input,{type:'number',min:String(min),max:String(max),step:'1',value:String(obj[key])});
 input.setAttribute('aria-label',label);
 input.oninput=()=>{obj[key]=input.valueAsNumber;ui.changed();};
 wrap.append(input);box.append(wrap);
}
function section(parent,title){
 const box=el('fieldset');box.className='surround-section';box.append(el('legend',title));parent.append(box);return box;
}
function toggle(ui,box,label,checked,change){
 const wrap=el('label'),input=el('input');input.type='checkbox';input.checked=checked;input.setAttribute('aria-label',label);
 input.onchange=()=>{change(input.checked);ui.changed(true);};
 wrap.className='surround-toggle';wrap.append(input,el('span',label));box.append(wrap);
}
function select(ui,box,label,options,value,change){
 ui.select(box,label,options,value,next=>{change(next);ui.changed(true);});
}
export function surroundControls(ui){
 const fields=ui.fields,a=fields.surround??={},bodyTop=fields.height+footHeight(fields),floor=fields.elevation??0;
 ui.form.append(el('p','Основной шкаф · ширина '+fields.width+' мм · от пола до крыши '+(bodyTop+floor)+' мм'));
 const grid=el('div');grid.className='surround-sides';ui.form.append(grid);
 for(const side of trimSides){
  const box=section(grid,side==='left'?'Слева':'Справа'),t=a[side];
  select(ui,box,'Исполнение '+(side==='left'?'слева':'справа'),[['none','Без планки'],['filler','Г-образная фальшпланка'],['end','Торцевая стойка']],t?.kind??'none',v=>{
   if(v==='none'){delete a[side];return;}
   const placement=t?{heightMode:t.heightMode,bottom:t.bottom,...(t.heightMode==='custom'?{height:t.height}:{})}
    :v==='end'?{heightMode:'full',bottom:0}:{heightMode:'custom',height:Math.min(2000,bodyTop),bottom:0};
   a[side]=v==='end'?{kind:v,depth:100,projection:20,...placement}:{kind:v,width:100,...placement};
  });
  if(!t)continue;
  if(t.kind==='filler')number(ui,box,'Ширина лица, мм',t,'width',40,1200);
  else{
   number(ui,box,'Глубина торцевой стойки, мм',t,'depth',40,1200);
   number(ui,box,'Выступ от переднего торца боковины, мм',t,'projection',0,300);
  }
  select(ui,box,'Высота боковой детали',[['custom','Своя высота'],['body','До крыши основного шкафа'],['full',a.upper?'До верха антресоли':'До верха шкафа в сборе']],t.heightMode,v=>{
   const roof=fields.height+footHeight(fields)+(t.heightMode==='full'?(a.upper?.height??0):0);
   t.heightMode=v;if(v==='custom')t.height=Math.max(100,roof-t.bottom);else delete t.height;
  });
  if(t.heightMode==='custom')number(ui,box,'Высота детали, мм',t,'height',100,3000);
  number(ui,box,fields.elevation?'Низ от уровня установки, мм':'Низ детали от пола, мм',t,'bottom',0,4900);
 }
 const upper=section(ui.form,'Антресоль сверху');
 toggle(ui,upper,'Добавить отдельный модуль антресоли',Boolean(a.upper),on=>{
  if(on)a.upper={height:540,divider:false,leaves:2,side:'left',opening:fields.width/2-3>600?'lift':'swing',push:upperPush()};else delete a.upper;
 });
 if(a.upper){
  number(ui,upper,'Высота модуля, мм',a.upper,'height',150,1500);
  select(ui,upper,'Перегородка',[['no','Без перегородки'],['yes','По центру']],a.upper.divider?'yes':'no',v=>{a.upper.divider=v==='yes';});
  upper.append(el('p','Дно, две стойки и крыша. Двери и типон выбираются в шаге «Фасады».'));
 }
 const cap=section(ui.form,'Закладная под потолок');
 toggle(ui,cap,'Добавить потолочную закладную',Boolean(a.cap),on=>{if(on)a.cap={height:80};else delete a.cap;});
 if(a.cap){
  number(ui,cap,'Высота закладной, мм',a.cap,'height',40,1200);
  select(ui,cap,'Длина закладной',[['body','По корпусу · '+fields.width+' мм'],['custom','Своя длина']],a.cap.length==null?'body':'custom',v=>{if(v==='custom')a.cap.length=fields.width;else delete a.cap.length;});
  if(a.cap.length!=null)number(ui,cap,'Длина по центру шкафа, мм',a.cap,'length',100,3000);
  cap.append(el('p',a.upper?'На крыше антресоли, лицевая планка вровень с закрытыми фасадами.':'На крыше основного шкафа, лицевая планка вровень с закрытым фасадом.'));
 }
}
export function upperFrontTabs(ui){
 const nav=el('nav');nav.className='wardrobe-subsections';nav.setAttribute('aria-label','Фасады шкафа');
 for(const [view,label] of [['fronts','Основной шкаф'],['upper-fronts','Антресоль']]){
  const b=el('button',label);b.type='button';b.setAttribute('aria-pressed',String(ui.view===view));
  b.onclick=()=>{ui.view=view;ui.render();};nav.append(b);
 }
 ui.form.append(nav);
}
export function upperFrontControls(ui){
 const u=ui.fields.surround.upper,box=section(ui.form,'Фасады антресоли');
 select(ui,box,'Количество створок',[[1,'Одна'],[2,'Две']],u.leaves,v=>{u.leaves=Number(v);});
 select(ui,box,'Как открываются',[['swing','Распашные'],['lift','Вверх на газлифтах']],u.opening,v=>{u.opening=v;});
 if(u.opening==='swing'&&u.leaves===1)select(ui,box,'Петли',[['left','Слева'],['right','Справа']],u.side,v=>{u.side=v;});
 box.append(el('p',u.opening==='swing'?'Открывание нажатием · беспружинные петли. Артикул и присадка появятся после выбора модели петли.':'Открывание нажатием · типон на дне. Артикул и присадка газлифта появятся после выбора модели.'));
 aksPushProductControls(ui,box,u.push,next=>{u.push=next;ui.changed(true);});
}

