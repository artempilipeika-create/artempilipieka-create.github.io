import {plateControls} from './wardrobe-hinge-ui.mjs';
import {hingeCatalogue,withMountingPlate} from './wardrobe-hinge-layout.mjs';
import {footHeight} from './plinth-options.mjs';
import {trimSides,upperPush} from './wardrobe-surround.mjs';
import {lowerBodyHeight,savedTrimExtension} from './wardrobe-trim-layout.mjs';
import {aksPushProductControls} from './wardrobe-push-product-ui.mjs';

const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
function number(ui,box,label,obj,key,min,max,step='1'){
 const wrap=el('label',label),input=el('input');
 Object.assign(input,{type:'number',min:String(min),max:String(max),step,value:String(obj[key])});
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
const mm=value=>Number(value.toFixed(3)).toLocaleString('ru-RU',{useGrouping:false,maximumFractionDigits:3});
export function heightControl(ui){
 ui.number('overallHeight','Общая высота шкафа от пола, мм',200,5000);
 const result=el('p');result.className='wardrobe-height-result';result.dataset.bodyHeight='';ui.form.append(result);
}
export function updateHeights(ui,built){
 const f=ui.fields,h=lowerBodyHeight(f),body=ui.form.querySelector('[data-body-height]');
 if(body){
  const names=[['установка',f.elevation],['опоры',footHeight(f)],['антресоль',f.surround?.upper?.height],['закладная',f.surround?.cap?.height]].filter(([,n])=>n);
  const extension=savedTrimExtension(f);
  if(extension)names.push(['выступ планки над шкафом',extension]);
  body.textContent=Number.isFinite(h)?'Основной корпус '+mm(h)+' мм'+(names.length?' · '+mm(f.overallHeight)+names.map(([label,n])=>' − '+mm(n)+' ('+label+')').join('')+' = '+mm(h)+' мм':''):'Введите высоту шкафа и его элементов.';
 }
 for(const side of trimSides){
  const result=ui.form.querySelector('[data-trim-result="'+side+'"]'),t=built?.envelope.sides[side];
  if(result)result.textContent=t?'Отметки от пола '+mm(t.bottom+built.spec.elevation)+'–'+mm(t.bottom+t.h+built.spec.elevation)+' мм · в раскрой '+t.pieces.map(p=>mm(p.height)).join(' + ')+' мм':'';
 }
}
export function surroundControls(ui){
 const fields=ui.fields,a=fields.surround??={};
 heightControl(ui);
 const grid=el('div');grid.className='surround-sides';ui.form.append(grid);
 for(const side of trimSides){
  const box=section(grid,side==='left'?'Слева':'Справа'),t=a[side];
  select(ui,box,'Исполнение '+(side==='left'?'слева':'справа'),[['none','Без планки'],['filler','Г-образная фальшпланка'],['end','Торцевая стойка']],t?.kind??'none',v=>{
   if(v==='none'){delete a[side];return;}
   const placement=t?{heightMode:t.heightMode,bottom:t.bottom,start:t.start,split:t.split,...(t.heightMode==='custom'?{height:t.height}:{})}
    :{heightMode:'assembly',start:'floor',split:'auto',bottom:0};
   a[side]=v==='end'?{kind:v,depth:100,projection:20,...placement}:{kind:v,width:100,...placement};
  });
  if(!t)continue;
  if(t.kind==='filler')number(ui,box,'Ширина лица, мм',t,'width',40,1200);
  else{
   number(ui,box,'Глубина торцевой стойки, мм',t,'depth',40,1200);
   number(ui,box,'Выступ от переднего торца боковины, мм',t,'projection',0,300);
  }
  select(ui,box,'Нижний край планки',[['floor','От пола'],['plinth','От уровня опор (низ корпуса)'],['plinthEdge','По верхней кромке цоколя'],['facade','По нижней кромке фасада'],['custom','Своя отметка от пола']],t.start,v=>{
   if(v==='custom'){
    const previous=ui.previewBuilt?.envelope.sides[side];
    t.bottom=previous?previous.bottom+(fields.elevation??0):t.bottom??0;
   }else t.bottom=0;
   t.start=v;
  });
  if(t.start==='custom')number(ui,box,'Нижняя отметка от пола, мм',t,'bottom',0,4900,'0.001');
  select(ui,box,'Высота боковой детали',[['assembly','По высоте шкафа в сборе'],['body','До крыши основного шкафа'],['full','До верха корпуса с антресолью'],['custom','Своя высота']],t.heightMode,v=>{
   if(v==='custom')t.height=ui.previewBuilt?.envelope.sides[side]?.h??Math.max(100,fields.height);else delete t.height;
   t.heightMode=v;
  });
  if(t.heightMode==='custom')number(ui,box,'Высота детали, мм',t,'height',100,5000,'0.001');
  select(ui,box,'Стык планки',[['auto','Авто · цельная до 2780 мм'],['joint','По стыку с антресолью',!a.upper],['equal','На равные части']],t.split,v=>{t.split=v;});
  const result=el('p');result.dataset.trimResult=side;box.append(result);
 }
 const upper=section(ui.form,'Антресоль сверху');
 toggle(ui,upper,'Добавить отдельный модуль антресоли',Boolean(a.upper),on=>{
  if(on)a.upper={height:540,divider:false,leaves:2,side:'left',opening:fields.width/2-3>600?'lift':'swing',push:upperPush()};else{delete a.upper;for(const side of trimSides)if(a[side]?.split==='joint')a[side].split='auto';}
 });
 if(a.upper){
  number(ui,upper,'Высота модуля, мм',a.upper,'height',150,1500);
  select(ui,upper,'Перегородка',[['no','Без перегородки'],['yes','По центру']],a.upper.divider?'yes':'no',v=>{a.upper.divider=v==='yes';});
  const rear=fields.back?(fields.backThickness?'вкладная ЛДСП '+fields.backThickness+' мм':'ХДФ 3 мм'):'вкладная ЛДСП 18 мм в цвет корпуса';
  upper.append(el('p','Отдельные дно, стойки, крыша и задняя стенка. Задняя стенка антресоли — '+rear+'.'));
 }
 const cap=section(ui.form,'Закладная под потолок');
 toggle(ui,cap,'Добавить потолочную закладную',Boolean(a.cap),on=>{if(on)a.cap={height:80};else delete a.cap;});
 if(a.cap){
  number(ui,cap,'Высота закладной, мм',a.cap,'height',40,1200);
  select(ui,cap,'Длина закладной',[['body','Между планками · по ширине корпуса'],['over','Поверх боковых планок'],['custom','Своя длина по центру']],a.cap.fit==='over'?'over':a.cap.length==null?'body':'custom',v=>{
   if(v==='custom')a.cap.length=ui.previewBuilt?.envelope.capLength??fields.width;else delete a.cap.length;
   if(v==='over')a.cap.fit='over';else delete a.cap.fit;
  });
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
 select(ui,box,'Как открываются',[['swing','Распашные'],['lift','Вверх на газлифтах']],u.opening,v=>{u.opening=v;if(v==='lift'){delete u.frame;delete u.plate;}});
 if(u.opening==='swing'&&u.leaves===1)select(ui,box,'Петли',[['left','Слева'],['right','Справа']],u.side,v=>{u.side=v;});
 if(u.opening==='swing')select(ui,box,'Тип фасада антресоли',[['board','Глухой фасад'],['Z1','Витрина · алюминиевая рамка Z1']],u.frame??'board',v=>{if(v==='Z1')u.frame='Z1';else{delete u.frame;delete u.plate;}});
 box.append(el('p',u.frame?'TIP-ON · беспружинная Blum CLIP top 95° для узких рамок · арт. 70T950A.TL.':u.opening==='swing'?'Открывание нажатием · беспружинные петли. Артикул и присадка появятся после выбора модели петли.':'Открывание нажатием · типон на дне. Артикул и присадка газлифта появятся после выбора модели.'));
 if(u.frame)plateControls(box,withMountingPlate(hingeCatalogue['70T950A.TL'],u.plate),plate=>{u.plate=plate;ui.changed(true);});
 aksPushProductControls(ui,box,u.push,next=>{u.push=next;ui.changed(true);});
}

