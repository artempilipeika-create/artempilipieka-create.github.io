import {backTrim,canMachine,cutTitles,defaultCut,edgeLabels,faceLabels,panelEdges,panelMachiningPlan,machiningError,checkBackMount} from './panel-machining.mjs';

function el(tag,text){const node=document.createElement(tag);if(text)node.textContent=text;return node;}
function button(label,click){const node=el('button',label);node.type='button';node.onclick=click;return node;}
const mm=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:3});
function measurement(parent,label,value,change,step='any'){
 const wrap=el('label',label),input=el('input');input.type='number';input.min='0';input.step=step;input.required=true;
 input.value=value;input.setAttribute('aria-label',label);input.oninput=()=>change(input.valueAsNumber);wrap.append(input);parent.append(wrap);
 return input;
}
function section(parent,op,item){
 parent.replaceChildren();
 let plan;
 try{plan=panelMachiningPlan(op,item.blank_width_mm,item.blank_length_mm,item.blank_thickness_mm);}
 catch(e){parent.append(el('small',e.message));return;}
 const T=item.blank_thickness_mm,extent=Math.max(T*2,Math.max(...plan.profile.map(p=>p[0]))+T*.75);
 const sx=268/extent,sy=Math.min(82/T,sx),height=T*sy;
 const point=([x,z])=>(20+x*sx)+','+(108-z*sy);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 310 138');svg.setAttribute('role','img');svg.setAttribute('aria-label','Сечение выбранной обработки');
 const draw=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);svg.append(n);return n;};
 draw('rect',{x:20,y:108-height,width:268,height,fill:'#d5bda1',stroke:'#6c5846'});
 if(op.kind==='groove'||op.kind==='rabbet')draw('rect',{x:20,y:108-height,width:item.blank_edge_thickness_mm*sx,height,fill:'#50806b'});
 draw('polygon',{points:plan.profile.map(point).join(' '),fill:'#d9edf5',stroke:'#236b8a','stroke-width':2});
 draw('text',{x:20,y:Math.max(12,102-height),fill:'#334c40','font-size':12}).textContent=faceLabels[item.blank_axis][1]+' пласть';
 draw('text',{x:20,y:127,fill:'#334c40','font-size':12}).textContent=faceLabels[item.blank_axis][0]+' пласть';
 parent.append(svg);
 const description=op.kind==='miter'?'45° · остаток у края '+mm(op.land)+' мм':
  'Ширина '+mm(op.width)+' мм · глубина '+mm(op.depth)+' мм'+(op.kind==='groove'?' · от края до начала '+mm(op.offset)+' мм':'');
 parent.append(el('figcaption',op.kind==='miter'?description:description+' · ПВХ '+mm(item.blank_edge_thickness_mm)+' мм'));
}

function rearAssembly(figure,fields,b){
 figure.replaceChildren();
 try{checkBackMount(fields);}catch(e){figure.append(el('small',e.message));return;}
 const t=fields.thickness,trim=backTrim(b),inner=(b.offset??0)+b.width;
 const scale=Math.min(2.3,70/(inner+t)),rear=35,y=z=>rear+z*scale;
 const left=18,right=292,leftEnd=left+t*scale,rightEnd=right-t*scale;
 const leftCut=b.kind==='groove'||b.layout==='both'||b.layout==='left',rightCut=b.kind==='groove'||b.layout==='both'||b.layout==='right';
 const hdfLeft=leftCut?leftEnd-(b.depth-1)*scale:left+scale;
 const hdfRight=rightCut?rightEnd+(b.depth-1)*scale:right-scale;
 const rect=(x,top,w,h,fill)=>'<rect x="'+x+'" y="'+top+'" width="'+w+'" height="'+h+'" fill="'+fill+'" stroke="#47594f" stroke-width="0.85"/>';
 const side=(x,cut,isLeft)=>{
  const start=b.kind==='rabbet'&&!cut?trim:0;
  let shape=rect(x,y(start),t*scale,120-y(start),'#dbc8aa');
  if(cut)shape+=rect(isLeft?leftEnd-b.depth*scale:rightEnd,y(b.offset??0),b.depth*scale,b.width*scale,'#fafaf6');
  return shape;
 };
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 310 134');svg.setAttribute('role','img');svg.setAttribute('aria-label','Посадка ХДФ между боковинами, вид сверху со стороны заднего торца');
 svg.innerHTML='<text x="155" y="18" text-anchor="middle" font-size="12" fill="#35483e">Задний торец · вид сверху</text>'+
  rect(leftEnd,y(trim),rightEnd-leftEnd,120-y(trim),'#ede5d7')+side(left,leftCut,true)+side(rightEnd,rightCut,false)+
  rect(hdfLeft,y(inner-3),hdfRight-hdfLeft,3*scale,'#6daba2')+
  '<text x="155" y="114" text-anchor="middle" font-size="12" fill="#35483e">'+(fields.bottomFit==='none'?'Крыша':'Дно и крыша')+'</text>';
 if(b.layout==='perimeter'){
  const a=y(0),c=y(b.offset);
  svg.insertAdjacentHTML('beforeend','<path d="M140 '+a+'h16m-8 0v'+(c-a)+'m-8 0h16" fill="none" stroke="#235c83" stroke-width="1.6"/><text x="164" y="'+(a+13)+'" font-size="11" fill="#235c83">'+mm(b.offset)+' мм</text>');
 }
 const label=fields.bottomFit==='none'?'Глубина крыши':'Глубина дна и крыши';
 figure.append(svg,el('figcaption',label+' '+mm(fields.depth-trim)+' мм · ХДФ 3 мм'));
}

export function backMountControls(ui){
 const b=ui.fields.backMount;if(!b)return;
 const group=el('fieldset');group.append(el('legend','Посадка задней стенки'));
 const figure=el('figure');figure.className='cut-section';
 const board={blank_axis:'side',blank_edge_thickness_mm:ui.fields.edgeThickness??1,blank_thickness_mm:ui.fields.thickness,blank_length_mm:ui.fields.height,blank_width_mm:ui.fields.depth};
 if(b.layout){
  const redraw=()=>{ui.changed();rearAssembly(figure,ui.fields,b);};
  if(b.kind==='rabbet')ui.select(group,'Боковина с четвертью',[['left','Левая'],['right','Правая'],['both','С обеих сторон']],b.layout,v=>{b.layout=v;redraw();});
  let inset;
  if(b.layout==='sides'){
   inset=measurement(group,'Утопление задней стенки, мм',backTrim(b),v=>{b.offset=v-b.width;redraw();},'.5');
   group.append(el('small','От заднего торца боковины до плоскости ХДФ, к которой прилегают дно и крыша.'));
  }
  const settings=el('details');settings.append(el('summary','Размеры выборки'));
  measurement(settings,'Ширина выборки, мм',b.width,v=>{b.width=v;if(inset)b.offset=inset.valueAsNumber-v;redraw();},'.5');
  measurement(settings,'Глубина в плиту, мм',b.depth,v=>{b.depth=v;redraw();},'.5');
  if(b.layout==='perimeter')measurement(group,'От заднего торца до начала паза, мм',b.offset,v=>{b.offset=v;redraw();},'.5');
  rearAssembly(figure,ui.fields,b);group.append(figure,settings);ui.form.append(group);return;
 }
 const preview=()=>section(figure,{...b,edge:'x0',face:1},board);
 for(const [key,label] of [['width','Ширина выборки, мм'],['depth','Глубина в плиту, мм'],...(b.kind==='groove'?[['offset','От заднего торца до начала паза, мм']]:[])]){
  measurement(group,label,b[key],v=>{b[key]=v;ui.changed();preview();},'.5');
 }
 preview();group.append(figure);
 group.append(el('small',b.kind==='groove'?'ХДФ входит в пазы боковин, крыши и установленного дна.':'Правая стойка закрывает торец ХДФ. Размер стенки следует за четвертью.'));
 ui.form.append(group);
}

export function pickMachiningPart(ui,key){
 const selected=ui.previewBuilt?.parts.find(p=>p.key===key);
 if(selected)ui.showMachiningFronts=selected.item.blank_axis==='front';
 ui.partKey=key;ui.cutIndex=null;ui.cutDraft=null;ui.render();
}
export function machiningControls(ui){
 const built=ui.previewBuilt,parts=built?.parts.filter(p=>canMachine(p.item))??[];
 if(!parts.length){ui.form.append(el('p','Для обработки нужна деталь из плиты.'));return;}
 const part=parts.find(p=>p.key===ui.partKey)??parts[0],{item,key}=part;
 ui.partKey=key;
 const box=el('fieldset');box.className='panel-machining';box.append(el('legend','Обработка детали'));ui.form.append(box);
 ui.select(box,'Деталь шкафа',parts.map(p=>[p.key,p.label]),key,v=>pickMachiningPart(ui,v));
 if(built.parts.some(p=>p.item.blank_axis==='front')){
  const toggle=button(ui.showMachiningFronts?'Показать корпус':'Показать фасады',()=>{ui.showMachiningFronts=!ui.showMachiningFronts;ui.render();});box.append(toggle);
 }
 const saved=ui.fields.machining?.[key]??[];
 const generated=(item.blank_machining??[]).filter(op=>op.lightSystem);
 const extra=(item.blank_machining?.length??0)-saved.length-generated.length;
 if(generated.length)box.append(button('Паз подсветки · изменить',()=>{ui.view='lighting';ui.lightIndex=0;ui.render();}));
 if(extra>0)box.append(button('Посадка ХДФ · изменить в задней стенке',()=>{ui.view='back';ui.render();}));
 const index=ui.cutIndex;
 for(const [i,op] of saved.entries()){
  const row=el('div');row.className='cut-row';
  row.append(button(cutTitles[op.kind]+' · '+edgeLabels[item.blank_axis][panelEdges.indexOf(op.edge)]+' торец',()=>{ui.cutIndex=i;ui.cutDraft={...op};ui.render();}),
   button('Удалить',()=>{saved.splice(i,1);if(!saved.length)delete ui.fields.machining[key];ui.cutIndex=null;ui.cutDraft=null;ui.changed(true);}));
  box.append(row);
 }
 const op=ui.cutDraft??=defaultCut('groove','x0',key==='left'?0:1);
 const figure=el('figure');figure.className='cut-section';
 const feedback=el('small');feedback.setAttribute('role','status');
 const redraw=()=>{feedback.textContent='';section(figure,op,item);};
 ui.select(box,'Операция',Object.entries(cutTitles),op.kind,v=>{ui.cutDraft=defaultCut(v,op.edge,op.face);ui.render();});
 ui.select(box,'Торец детали',panelEdges.map((v,i)=>[v,edgeLabels[item.blank_axis][i]]),op.edge,v=>{op.edge=v;redraw();});
 ui.select(box,'Обрабатываемая пласть',faceLabels[item.blank_axis].map((s,i)=>[i,s]),op.face,v=>{op.face=Number(v);redraw();});
 if(op.kind==='groove'||op.kind==='rabbet')box.append(el('small','Наружный торец со стороны выборки оклеивается ПВХ.'));
 if(op.kind==='miter')box.append(button('Перевернуть скос',()=>{op.face=1-op.face;ui.render();}));
 const dimensions=op.kind==='miter'?[['land','Оставить у края, мм']]:[
  ['width','Ширина выборки, мм'],['depth','Глубина в плиту, мм'],...(op.kind==='groove'?[['offset','От края до начала паза, мм']]:[])];
 for(const [field,label] of dimensions)measurement(box,label,op[field],v=>{op[field]=v;redraw();});
 redraw();box.append(figure,feedback);
 box.append(button(index==null?'Добавить обработку':'Сохранить обработку',()=>{
  const cuts=[...saved];cuts[index??cuts.length]={...op};
  const error=machiningError({...item,blank_machining:[...(item.blank_machining??[]).slice(0,Math.max(0,extra)),...cuts,...generated]});
  if(error){feedback.textContent=error;return;}
  (ui.fields.machining??={})[key]=cuts;ui.cutIndex=null;ui.cutDraft=null;ui.changed(true);
 }));
 if(index!=null)box.append(button('Отмена',()=>{ui.cutIndex=null;ui.cutDraft=null;ui.render();}));
}
