import {newBay,bayNames,hasDoor,hasDrawers,dresserSteps,dresserPresets,dresserCableMarks,defaultDresserFoot,setDresserLayout,resizeDresser,setDresserWidth,syncDresser} from './dresser-layout.mjs';
import {nicheSlot,sectionWidths} from './wardrobe-layout.mjs';
import {sectionSpans,doorHardware} from './wardrobe-door-layout.mjs';
import {defaultBackMount} from './panel-machining.mjs';
import {backMountControls} from './panel-machining-ui.mjs';
import {footHeight,plinthPanel} from './plinth-options.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {buildCarcass} from './carcass-model.mjs';
import {showroomSnapshot} from './questionnaire-showroom.mjs';
import photos from './door-photos/sources.json' with {type:'json'};

export {dresserSteps};
const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const button=(text,onclick)=>Object.assign(el('button',text),{type:'button',onclick});
const list=(low,high)=>Array.from({length:high-low+1},(_,i)=>[low+i,String(low+i)]);
const mm=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:3});
function number(parent,label,value,min,max,change,{optional=false,step=1}={}){
 const wrap=el('label',label),input=el('input');
 Object.assign(input,{type:'number',value:value??'',min,max,step,required:!optional});
 input.setAttribute('aria-label',label);if(optional)input.placeholder='Автоматически';
 input.onchange=()=>{if(input.reportValidity())change(input.value===''?null:input.valueAsNumber);};
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}};
 wrap.append(input);parent.append(wrap);
}
function options(ui,parent,label,entries,value,save){
 return ui.select(parent,label,entries,value,v=>{save(v);ui.changed(true);});
}
function group(parent,title){
 const box=el('fieldset');box.append(el('legend',title));parent.append(box);return box;
}
function begin(ui,step){ui.step=step;ui.view=step===3?'fronts':step===0?'body':'sections';ui.render();}
function drawing(built,active=-1,interactive=false,closed=true){
 const s=built.spec,w=s.width,h=s.height,leg=footHeight(s);
 const suspended=s.dresser.installation==='wall',gap=suspended?Math.min(s.elevation,h*.8):0;
 const k=Math.min(412/w,226/(h+leg+gap));
 const x=width=>28+width*k,y=height=>24+(h-height)*k;
 const rect=(left,bottom,width,height,fill,stroke='#665c50')=>'<rect x="'+x(left)+'" y="'+y(bottom+height)+'" width="'+width*k+'" height="'+height*k+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1"/>';
 const line=(x1,y1,x2,y2,extra='')=>'<path d="M '+x(x1)+' '+y(y1)+' L '+x(x2)+' '+y(y2)+'" fill="none" stroke="#726b5b" '+extra+'/>';
 const label=(cx,cy,t)=>'<text x="'+x(cx)+'" y="'+y(cy)+'" text-anchor="middle" dominant-baseline="central" font-size="10" fill="#30483e">'+t+'</text>';
 let svg=rect(0,0,w,h,'#eeeae3');
 const plinth=plinthPanel(s);
 if(plinth){
   const left=s.feet.left==='side'?s.thickness:0,right=s.feet.right==='side'?s.thickness:0;
   svg+=rect(left,-leg,plinth.width,plinth.height,'#c6bbac');
   if(left)svg+=rect(0,-leg,left,leg,'#eeeae3');if(right)svg+=rect(w-right,-leg,right,leg,'#eeeae3');
 }
 else if(leg)for(const edge of [25,w-50])svg+=rect(edge,-leg,25,leg,'#8b8275');
 const widths=sectionWidths(s),spans=sectionSpans(s);
 let start=s.thickness;
 spans.forEach((span,i)=>{
   const bay=s.dresser.bays[i],width=widths[i],lo=start;
   svg+=rect(lo,s.thickness,width,h-2*s.thickness,'#fcfaf6');
   for(const p of built.parts.filter(p=>p.key.startsWith('shelf-'+i+'-'))){
     svg+=rect(lo,p.item.elevation_mm-s.elevation-leg,width,p.item.height,'#e3e2dd');
   }
   const bank=built.drawerBanks[nicheSlot(i,0)];
   for(const face of bank?.faces??[]){
     const left=face.x+w/2-face.width/2;
     svg+=rect(left,face.y,face.width,face.height,'#e1d7cb');
     if(interactive&&face.height*k>17&&width*k>49)svg+=label(left+face.width/2,face.y+face.height/2,mm(face.height));
   }
   for(const d of built.doors.filter(d=>closed&&d.section===i)){
     svg+=rect(d.left,d.bottom,d.width,d.height,'#e1d7cb');
     const hinge=d.side==='left'?d.left:d.left+d.width,free=d.side==='left'?d.left+d.width:d.left;
     svg+=line(free,d.bottom,hinge,d.bottom+d.height/2,'stroke-dasharray="4 3"')+line(hinge,d.bottom+d.height/2,free,d.bottom+d.height,'stroke-dasharray="4 3"');
   }
   if(bay.kind==='media')for(const m of dresserCableMarks(s).filter(m=>m.section===i))svg+='<circle cx="'+x(m.x)+'" cy="'+y(m.y)+'" r="3.5" fill="#365448"/>';
   if(interactive){
     const width=(span.right-span.left)*k;
     svg+='<g role="button" tabindex="0" aria-label="Выбрать секцию '+(i+1)+'" data-dresser-section="'+i+'"><rect x="'+x(span.left)+'" y="'+y(h)+'" width="'+width+'" height="'+h*k+'" fill="transparent" stroke="'+(active===i?'#23795c':'none')+'" stroke-width="2"/></g>';
     if(width>48)svg+=label((span.left+span.right)/2,-leg-14/k,mm(widths[i])+' мм');
   }
   start+=width+s.thickness;
 });
 if(suspended){
   const floor=-gap,tickWidth=Math.min(20,w*.04),datum=gap>0?Math.min(w*.68,w-6/k):w*.5;
   svg+=line(-10/k,floor,w+10/k,floor,'stroke-dasharray="3 2"');
   if(gap*k>23){
     svg+=line(datum,0,datum,floor)+line(datum-tickWidth,0,datum+tickWidth,0)+line(datum-tickWidth,floor,datum+tickWidth,floor);
     if(s.elevation>gap)svg+=line(datum-tickWidth,-gap/2-4/k,datum+tickWidth,-gap/2+4/k);
   }
   svg+=label(w*.5,floor-(interactive&&gap*k<32?30:12)/k,'От пола '+mm(s.elevation)+' мм');
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(56+w*k)+' '+(52+(h+leg+gap)*k+(suspended&&interactive&&gap*k<32?16:0))+'" role="'+(interactive?'group':'img')+'" aria-label="Комод, вид спереди">'+svg+'</svg>';
}
export function drawDresser(ui,preview){
 const {built,error}=preview;ui.previewBuilt=built??null;
 const presets=ui.form.querySelector('.dresser-presets');
 if(presets)presets.dataset.pose=ui.dresserClosed?'closed':'open';
 ui.figureTitle.textContent='Комод';
 if(!built){ui.livePreview?.hide();ui.drawing.replaceChildren();ui.description.textContent=error?.message??'Проверьте размеры секций.';ui.dimensions.textContent='';ui.railNotice.hidden=true;return;}
 const layers=el('div');layers.className='wardrobe-subsections';
 for(const [closed,name] of [[true,'С фасадами'],[false,'Вид наполнения']]){
   const b=button(name,()=>{ui.dresserClosed=closed;drawDresser(ui,preview);});
   b.setAttribute('aria-pressed',String(ui.dresserClosed===closed));layers.append(b);
 }
 const graph=el('div');graph.className='dresser-front-view';graph.innerHTML=drawing(built,ui.activeSection,true,ui.dresserClosed);
 const portrait=showroomSnapshot(built,ui,{open:!ui.dresserClosed,section:ui.activeSection});
 ui.drawing.replaceChildren(layers,portrait,graph);
 ui.updateRailNotice(built);
 const s=built.spec;
 ui.dimensions.textContent='Корпус '+s.width+' × '+s.height+' × '+s.depth+' мм'+(s.dresser.installation==='wall'?' · низ на '+s.elevation+' мм от пола':' · с опорами '+(s.height+footHeight(s))+' мм');
 ui.description.textContent=built.drawerIssues.join(' ');
 const slot=nicheSlot(ui.activeSection,0);
 try{ui.livePreview?.sync(ui.step===2||ui.step===3?built:null,built.drawerBanks[slot]?slot:null,ui.mode.value==='update'?ui.current:null,ui.materialChanged);}
 catch{ui.livePreview?.release();}
}
function dresserImage(id,installation,open){
 return '/account/planner/wardrobe-layout-images/dresser-'+id+(installation==='wall'?'-wall':'')+'-'+(open?'open':'closed')+'.webp?v=studio-pearl-1';
}
function previewLayout(ui,host,kinds,count){
 const fields=structuredClone(ui.fields);setDresserLayout(fields,kinds,count);
 const built=buildCarcass(wardrobeSpec(syncDresser(fields)),{idPrefix:'dresser-preview'});
 const photo=el('div'),fig=el('div'),toggle=button('Показать закрытый вариант',()=>{open=!open;render();});let open=true;
 photo.className='questionnaire-photo';fig.className='dresser-scheme';toggle.className='questionnaire-pose';
 function render(){
   photo.replaceChildren(showroomSnapshot(built,ui,{open}));fig.innerHTML=drawing(built,-1,false,!open);
   toggle.textContent=open?'Показать закрытый вариант':'Открыть наполнение';
 }
 host.append(photo,toggle,fig);render();
 return built;
}
function routes(ui){
 const route=ui.dresserRoute,box=group(ui.form,'Как собрать комод'),nav=el('div');nav.className='wardrobe-subsections';
 for(const [id,name] of [['manual','Собрать самому'],['survey','Пройти опрос'],['ready','Выбрать готовое наполнение']]){
   const b=button(name,()=>{ui.dresserRoute=id;if(id==='manual')begin(ui,1);else ui.render();});
   b.setAttribute('aria-pressed',String(route===id));nav.append(b);
 }
 box.append(nav);
 function apply(kinds,count){
   const next=structuredClone(ui.fields);
   try{setDresserLayout(next,kinds,count);const candidate=buildCarcass(wardrobeSpec(syncDresser(next)));if(candidate.drawerIssues.length)throw Error(candidate.drawerIssues.join(' '));}
   catch(e){ui.output.textContent=e.message;return;}
   ui.fields=next;ui.activeSection=0;ui.nicheIndex=0;ui.dresserRoute=null;
   ui.step=2;ui.view='sections';ui.changed(true);
 }
 if(route==='ready'){
   const cards=el('div');cards.className='dresser-cards dresser-presets';cards.dataset.pose=ui.dresserClosed?'closed':'open';
   for(const preset of dresserPresets){
     const card=button('',()=>{ui.dresserPick=preset.id;ui.render();});
     card.setAttribute('aria-label',preset.name);card.setAttribute('aria-pressed',String(ui.dresserPick===preset.id));
     const pic=el('span'),img=el('img'),closed=el('img');
     for(const shot of [img,closed]){
       shot.alt='';shot.width=680;shot.height=510;shot.loading='lazy';shot.decoding='async';
       shot.src=dresserImage(preset.id,ui.fields.dresser.installation,shot===img);
     }
     pic.className='dresser-preset-photos';closed.className='dresser-closed';pic.append(img,closed);card.append(pic);
     card.append(el('strong',preset.name));cards.append(card);
   }box.append(cards);
   const selected=dresserPresets.find(v=>v.id===ui.dresserPick);
   if(selected){
     try{previewLayout(ui,box,selected.kinds);box.append(button('Применить наполнение',()=>apply(selected.kinds)));}
     catch(e){box.append(el('p',e.message));}
   }
 }
 if(route==='survey'){
   const a=ui.dresserAnswers??={count:3,shelves:true,media:false};
   ui.select(box,'Сколько нужно шуфляд?',list(0,6),a.count,v=>{a.count=Number(v);ui.render();});
   for(const [key,label] of [['shelves','Полки за дверцей'],['media','Открытая ниша для техники']]){
     const wrap=el('label'),input=el('input');input.type='checkbox';input.checked=a[key];
     input.onchange=()=>{a[key]=input.checked;ui.render();};wrap.append(input,document.createTextNode(label));box.append(wrap);
   }
   const kinds=[...(a.count?['drawers']:[]),...(a.media?['media']:[]),...(a.shelves?['shelves']:[])];
   if(!kinds.length){box.append(el('p','Выберите хотя бы один вид наполнения.'));return;}
   try{previewLayout(ui,box,kinds,a.count);box.append(button('Применить результат опроса',()=>apply(kinds,a.count)));}
   catch(e){box.append(el('p',e.message));}
 }
}
function body(ui){
 const f=ui.fields,wrap=el('label','Название изделия'),name=el('input');name.value=ui.cabinetName;name.maxLength=120;
 name.setAttribute('aria-label','Название изделия');name.oninput=()=>{ui.cabinetName=name.value;ui.invalidate();};wrap.append(name);ui.form.append(wrap);
 const box=group(ui.form,'Установка');
 options(ui,box,'Тип установки',[['floor','Напольный'],['wall','Подвесной']],f.dresser.installation,v=>{
   if(v==='wall'){ui.dresserFeet=f.feet;delete f.feet;f.elevation=ui.dresserElevation??300;}
   else{ui.dresserElevation=f.elevation;f.elevation=0;f.feet=ui.dresserFeet??defaultDresserFoot();}
   f.dresser.installation=v;
 });
 ui.number('width','Ширина, мм',200,2400);ui.number('height','Высота корпуса, мм',200,3000);ui.number('depth','Глубина корпуса, мм',200,1200);
 if(f.dresser.installation==='wall')ui.number('elevation','От пола до низа корпуса, мм',0,5000);
 routes(ui);
 const shell=group(ui.form,'Конструкция корпуса');
 options(ui,shell,'Толщина корпуса, мм',[[16,'16 мм'],[18,'18 мм']],f.thickness,v=>{
   f.thickness=Number(v);if(f.thickness!==18)for(const b of f.dresser.bays)b.fixing='board/95388';
   ui.serial.body++;ui.materials.body=null;ui.materialChanged.body=true;
 });
 for(const [key,label] of [['topFit','Крышка'],['bottomFit','Дно']])options(ui,shell,label,[['inset','Между боковинами'],['overlay','Накладная панель']],f[key]??'inset',v=>{if(v==='inset')delete f[key];else f[key]=v;});
 const back=f.backMount?.layout;
 options(ui,shell,'Задняя стенка',[['overlay','Накладная ХДФ'],['sides','В пазах боковин'],['perimeter','В пазу по кругу'],['rabbet','В четверти']],
   f.backMount?(f.backMount.kind==='groove'?back:'rabbet'):'overlay',v=>{if(v==='overlay')delete f.backMount;else f.backMount=defaultBackMount(v==='rabbet'?'both':v);});
 if(f.backMount)backMountControls(ui);
 if(f.dresser.installation==='floor'){ui.footControls();if(plinthPanel(f))ui.plinthControls();}
}
function sections(ui){
 const f=ui.fields;
 options(ui,ui.form,'Количество секций',list(1,4),f.sections,v=>{resizeDresser(f,Number(v));ui.activeSection=Math.min(ui.activeSection,f.sections-1);});
 if(f.sections<2)return;
 const widths=sectionWidths(f);
 widths.forEach((w,i)=>number(ui.form,'Ширина секции '+(i+1)+' в свету, мм',w,100,f.width,n=>{
   try{setDresserWidth(f,i,n);ui.changed(true);}catch(e){ui.output.textContent=e.message;}
 }));
 ui.form.append(button('Распределить ширину поровну',()=>{delete f.dividerPositions;ui.changed(true);}));
}
const railCards=[['ball','Шариковые · с доводчиком','114797'],['soft','Скрытые PRIME · с доводчиком','113647'],['push','Скрытые PRIME · Push to open','113663']];
function rails(ui,p,b){
 const g=group(p,'Направляющие'),cards=el('div');cards.className='dresser-cards';
 for(const [id,label,art] of railCards){
   const c=button('',()=>{b.rail=id;ui.changed(true);});c.setAttribute('aria-label',label);c.setAttribute('aria-pressed',String((b.rail??'ball')===id));
   const img=el('img');img.src='/account/planner/hardware-photos/'+art+'.webp';img.alt='';
   c.append(img,el('strong',label),el('small','Фото серии · AKS '+art));cards.append(c);
 }g.append(cards);
 const bank=ui.previewBuilt?.drawerBanks[nicheSlot(ui.activeSection,0)];
 if(bank)g.append(el('p','В проекте '+bank.rail.length+' мм · арт. '+bank.rail.article+' · '+bank.faces.length+' компл.'));
}
function swing(ui,p,b){
 options(ui,p,'Дверцы секции',[['auto','Автоматически по ширине'],['left','Одна · петли слева'],['right','Одна · петли справа'],['pair','Две створки']],b.swing??'auto',v=>{b.swing=v;});
}
function interior(ui){
 const f=ui.fields,i=ui.activeSection,b=f.dresser.bays[i];ui.sectionTabs();
 const box=group(ui.form,'Заполнить секцию '+(i+1));
 options(ui,box,'Наполнение секции',Object.entries(bayNames),b.kind,v=>{if(v!==b.kind)f.dresser.bays[i]=newBay(v);});
 if(hasDrawers(b)){
   options(ui,box,'Количество шуфляд',list(1,24),b.drawers,v=>{b.drawers=Number(v);if(b.heights)b.heights=b.heights.slice(0,b.drawers);});
   number(box,'Зазор между фасадами, мм',b.gap??3,0,100,v=>{b.gap=v;ui.changed(true);},{step:.5});
   const custom=el('details');custom.open=Boolean(b.heights?.some(v=>v!=null));custom.append(el('summary','Высоты фасадов шуфляд'));
   const bank=ui.previewBuilt?.drawerBanks[nicheSlot(i,0)];if(bank)custom.append(el('p','Снизу вверх · '+bank.faces.map(v=>mm(v.height)).join(' / ')+' мм'));
   for(let j=b.drawers-1;j>=0;j--)number(custom,'Фасад '+(j+1)+' снизу, мм',b.heights?.[j],100,3000,v=>{
     b.heights=Array.from({length:b.drawers},(_,k)=>k===j?v:b.heights?.[k]??null);
     if(b.heights.every(x=>x==null))delete b.heights;ui.changed(true);
   },{optional:true});
   box.append(custom);rails(ui,box,b);
 }
 if(hasDoor(b)){
   options(ui,box,'Количество полок за дверцей',list(0,b.kind==='mixed'?9:10),b.shelves,v=>{b.shelves=Number(v);if(b.shelfGaps)b.shelfGaps=b.shelfGaps.slice(0,b.shelves);});
   if(b.shelves)options(ui,box,'Крепление полок',f.thickness===18?[['board/95388','Полкодержатели'],['board/cam_dowel','Эксцентрик со шкантом'],['board/confirmat','Конфирмат']]:[['board/95388','Полкодержатели']],b.fixing??'board/95388',v=>{b.fixing=v;});
   if(b.shelves){
     const levels=el('details');levels.open=Boolean(b.shelfGaps?.some(v=>v!=null));levels.append(el('summary','Расстояния между полками'));
     for(let j=0;j<b.shelves;j++)number(levels,'Проём под полкой '+(j+1)+', мм',b.shelfGaps?.[j],60,2900,v=>{
       b.shelfGaps=Array.from({length:b.shelves},(_,k)=>j===k?v:b.shelfGaps?.[k]??null);
       if(b.shelfGaps.every(g=>g==null))delete b.shelfGaps;ui.changed(true);
     },{optional:true});
     box.append(levels);
   }
   swing(ui,box,b);
 }
 if(b.kind==='mixed'||b.kind==='media')number(box,b.kind==='mixed'?'Высота нижней ниши для шуфляд, мм':'Высота открытой ниши в свету, мм',b.clearHeight,60,2900,v=>{
   if(v==null)delete b.clearHeight;else b.clearHeight=v;ui.changed(true);
 },{optional:true});
 if(b.kind==='media')options(ui,box,'Вывод кабелей в задней стенке',[['none','Без вывода'],['left','Слева'],['center','По центру'],['right','Справа']],b.cable??'none',v=>{if(v==='none')delete b.cable;else b.cable=v;});
}
const pictured=Object.fromEntries(Object.values(photos).map(p=>[p.pictured_article,p]));
const stockPulls=['127170','116550','89080'];
function pulls(ui,p,b,key,title){
 const g=group(p,title),cards=el('div');cards.className='dresser-cards';
 const none=button('Без отдельной ручки',()=>{delete b[key];ui.changed(true);});none.setAttribute('aria-pressed',String(!b[key]));cards.append(none);
 for(const art of stockPulls){
   const photo=pictured[art],product=doorHardware[art];if(!photo||!product)continue;
   const c=button('',()=>{b[key]=art;ui.changed(true);});c.dataset.dresserPull=art;
   c.setAttribute('aria-pressed',String(b[key]===art));const img=el('img');img.alt='';img.src='/account/planner/door-photos/'+photo.file;
   c.append(img,el('strong',photo.model+' · '+product.pitch+' мм'),el('small',photo.finish+' · AKS '+art));cards.append(c);
 }g.append(cards);
}
function fronts(ui){
 const b=ui.fields.dresser.bays[ui.activeSection];ui.sectionTabs();
 if(hasDoor(b)){swing(ui,ui.form,b);pulls(ui,ui.form,b,'doorPull','Ручки дверец');}
 if(hasDrawers(b))pulls(ui,ui.form,b,'drawerPull','Ручки шуфляд');
 if(b.kind==='media')ui.form.append(el('p','Секция открыта для техники.'));
}
export function dresserControls(ui){
 if(ui.step===0)body(ui);else if(ui.step===1)sections(ui);else if(ui.step===2)interior(ui);else fronts(ui);
}
