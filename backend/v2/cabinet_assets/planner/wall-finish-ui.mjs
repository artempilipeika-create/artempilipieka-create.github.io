import {panelNames,shapeNames,sources,finishError,wallLength,panelSegments,resolvedPanels,resolvedFinishError} from './wall-finishes.mjs';
import {WALLS,ORIGINS} from './room-plan.mjs';
import {kitchenSettings,elevation} from './furniture-core.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const drawing=shape=>`<svg viewBox="0 0 140 64" aria-hidden="true"><path d="M14 12h112v8H14z${['left','u'].includes(shape)?'M14 20h8v34h-8z':''}${['right','u'].includes(shape)?'M118 20h8v34h-8z':''}" fill="currentColor"/><path d="M28 36h84" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity=".3"/></svg>`;
export class WallFinishUI{
 constructor(app){
  this.app=app;
  const card=el('section');this.card=card;card.id='wall-finish-card';card.className='mf3d-control-card wall-finish-card';
  card.append(el('h3','Стеновые панели'),el('p','Выберите покрытие. Единый фартук следует за столешницей: длина и углы меняются вместе с кухней.'));
  const choices=el('div');choices.className='wall-finish-types';choices.setAttribute('role','group');choices.setAttribute('aria-label','Покрытие фартука');this.typeButtons=[];
  for(const [kind,label]of Object.entries(panelNames)){
   const b=this.button('',()=>this.addPanel(kind));b.dataset.finish=kind;b.setAttribute('aria-pressed','false');
   const photo=el('img');photo.className='surface-card-photo';photo.src='/account/planner/module-card-images/backsplash-'+({skinali:'glass',ldsp:'ldsp',tile:'tile'}[kind])+'.webp';photo.alt='';photo.width=370;photo.height=270;photo.loading='lazy';photo.draggable=false;app.listen(photo,'error',()=>photo.remove());
   b.append(photo,el('strong',kind==='ldsp'?'Фартук ЛДСП':label),el('small',kind==='skinali'?'Стекло 6 мм':kind==='ldsp'?'16 / 18 мм':'Плитка и швы'));choices.append(b);this.typeButtons.push(b);
  }card.append(choices);
  this.list=el('div');card.append(this.list);
  card.append(el('h3','Настенная подсветка'),el('p','Накладной профиль на стене. Высота задаётся от пола до центра профиля.'));
  card.append(this.button('Добавить настенную подсветку',()=>this.addLight()));this.lights=el('div');card.append(this.lights);
  const note=el('p','Скиналь 6 мм выгружается в БАЗИС отдельными участками. ЛДСП, плитка и подсветка сохраняются в описании. Вырезы, раскрой, крепление и электрика уточняются отдельно.');note.className='studio-hint';
  const originals=el('details');originals.append(el('summary','Детали и исходники БАЗИС'),note);
  for(const s of sources){const a=el('a',shapeNames[s.shape]+' · FR3D');a.href='/account/planner/wall-panel-sources/'+encodeURIComponent(s.source_file);a.download=s.source_file;originals.append(a);}card.append(originals);
  document.getElementById('module-catalogue').before(card);
  document.getElementById('countertop-module-control').append(this.button('Фартук и настенная подсветка',()=>{app.workspace?.panel('left',true,{manual:true,focus:true});card.scrollIntoView({block:'start',behavior:'smooth'});}));
 }
 button(text,fn){const b=el('button',text);b.type='button';b.className='secondary';this.app.listen(b,'click',fn);return b;}
 change(label,fn){try{this.app.interaction.change(label,()=>{fn();this.app.bridge.refresh();});}catch(e){this.app.adapter.status(e.message);this.key=null;this.sync();}}
 placement(){
  const a=this.app.adapter,r=a.room,it=a.selected,run=globalThis.MF_ACCESSORIES?.runFor(a.state,it?.item_id);
  let wall='a',width=Math.min(2000,r.width),offset=0,level=858;
  if(run&&kitchenSettings(it)){
   wall=({0:'a',90:'b',180:'c',270:'d'})[run.rotation]||'a';width=Math.min(6000,run.countertopActualLengthMm,wallLength(r,wall));
   const center=['a','c'].includes(wall)?run.position.x:run.position.z;offset=Math.max(0,Math.min(wallLength(r,wall)-width,Math.round(center+wallLength(r,wall)/2-width/2)));
   level=Math.round(elevation(it,r)+it.height+run.countertopThicknessMm);
  }
  return {wall,width,offset,elevation:Math.min(level,r.height-600)};
 }
 addPanel(kind){this.change('Добавить стеновую панель',()=>{
  const s=this.app.adapter.state,list=s.wallPanels||[];
  const existing=list.find(p=>p.automatic);if(existing){this.openId=existing.id;existing.kind=kind;existing.thickness=kind==='skinali'?6:kind==='ldsp'?18:10;existing.material_id=null;return;}
  const p={id:crypto.randomUUID(),...this.placement(),automatic:true,excluded_members:[],kind,shape:'straight',height:600,depth:400,thickness:kind==='skinali'?6:kind==='ldsp'?18:10,color:kind==='ldsp'?'#c5b99f':'#e7e3da',material_id:null,tile_width:600,tile_height:300,grout:2,grout_color:'#bcb8af'};
  const error=finishError(p,s.room);if(error)throw Error(error);this.openId=p.id;s.wallPanels=[p];
 });}
 addLight(){this.change('Добавить настенную подсветку',()=>{
  const s=this.app.adapter.state,list=s.wallLights||[];if(list.length>=4)throw Error('В проекте уже 4 настенных профиля.');
  const p=s.wallPanels?.at(-1)?.automatic?{...this.placement(),height:s.wallPanels.at(-1).height}:s.wallPanels?.at(-1)||{...this.placement(),height:600};
  const light={id:crypto.randomUUID(),wall:p.wall,width:p.width,offset:p.offset,elevation:Math.min(s.room.height-14,p.elevation+p.height-14),enabled:true,brightness:80,temperature:3000,finish:'aluminium'};
  const error=finishError(light,s.room,true);if(error)throw Error(error);this.openId=light.id;s.wallLights=[...list,light];
 });}
 patch(list,id,patch){this.change('Параметры фартука и света',()=>{
  const s=this.app.adapter.state,next=s[list].map(p=>p.id===id?{...p,...patch}:p),p=next.find(p=>p.id===id),error=finishError(p,s.room,list==='wallLights');if(error)throw Error(error);
  if(p.material_id){const m=this.app.adapter.material(p.material_id);if(m&&Number(m.thickness)!==p.thickness)throw Error('Толщина выбранного материала не совпадает с панелью.');}
  if(list==='wallPanels'&&patch.automatic!==true&&next.filter(p=>p.automatic).length>1)throw Error('Для всей кухни уже включён автоматический фартук.');
  const resolved=list==='wallPanels'?resolvedPanels({...s,wallPanels:next}).find(q=>q.id===id):null;
  if(resolved){const error=resolvedFinishError(resolved,s.room);if(error)throw Error(error);}
  s[list]=list==='wallPanels'&&patch.automatic===true?[p]:next;
 });}
 field(parent,p,list,key,label,{min,max,options,type='number'}={}){
  const wrap=el('label',label),input=el(options?'select':'input');input.setAttribute('aria-label',label);
  if(options)for(const [value,text]of Object.entries(options)){const o=el('option',text);o.value=value;input.append(o);}
  else{input.type=type;if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;input.step=1;}
  if(type==='checkbox')input.checked=p[key];else input.value=p[key];
  this.app.listen(input,'change',()=>{if(type==='number'&&!options&&input.value===''){this.app.adapter.status('Введите значение.');input.value=p[key];return;}const value=type==='checkbox'?input.checked:type==='number'&&!options?Number(input.value):['thickness','temperature'].includes(key)?Number(input.value):input.value;this.patch(list,p.id,{[key]:value});});
  wrap.append(input);parent.append(wrap);return input;
 }
 sync(){
  const s=this.app.adapter.state,key=JSON.stringify([s.wallPanels,s.wallLights,s.room,s.items,this.app.adapter.selected?.item_id,(s.wallPanels||[]).map(p=>this.app.adapter.material(p.material_id)?.name)]);if(key===this.key)return;this.key=key;
  const selectedKind=s.wallPanels?.find(p=>p.automatic)?.kind;for(const b of this.typeButtons)b.setAttribute('aria-pressed',String(b.dataset.finish===selectedKind));
  const opened=new Set([...this.card.querySelectorAll('details[data-id][open]')].map(d=>d.dataset.id));if(this.openId)opened.add(this.openId);this.openId=null;
  for(const [list,parent]of [['wallPanels',this.list],['wallLights',this.lights]]){
   parent.replaceChildren();const light=list==='wallLights';
   for(const [i,p]of (s[list]||[]).entries()){
    const section=el('details');section.dataset.id=p.id;section.open=opened.has(p.id);section.className='wall-finish-settings';
    const resolved=!light?resolvedPanels(s).find(q=>q.id===p.id):p;
    const title=(light?'Подсветка':panelNames[p.kind])+' '+(i+1);section.append(el('summary',p.automatic?title+' · по столешнице':title+' · '+p.width+' мм · '+p.wall.toUpperCase()));parent.append(section);
    const error=light?finishError(p,s.room,true):resolvedFinishError(resolved,s.room);if(error){const warning=el('p',error+' Исправьте параметры — элемент скрыт.');warning.className='wall-finish-error';section.append(warning);}
    if(!light){
     const label=el('label','Исполнение фартука'),select=el('select');select.setAttribute('aria-label','Исполнение фартука');for(const [value,text]of Object.entries(panelNames)){const o=el('option',text);o.value=value;select.append(o);}select.value=p.kind;label.append(select);section.append(label);
     this.app.listen(select,'change',()=>this.patch(list,p.id,{kind:select.value,thickness:select.value==='skinali'?6:select.value==='ldsp'?18:10,material_id:null}));
     const mode=el('label','По столешнице'),auto=el('input');auto.type='checkbox';auto.checked=!!p.automatic;auto.setAttribute('aria-label','Фартук по столешнице');mode.append(auto);section.append(mode);this.app.listen(auto,'change',()=>this.patch(list,p.id,{automatic:auto.checked,...(!auto.checked?this.placement():{})}));
     if(p.automatic){section.append(el('p','Длина и низ панели вычисляются по столешнице. Новые шкафы включаются автоматически.'));
      const it=this.app.adapter.selected;if(it&&kitchenSettings(it)){const label=el('label','Фартук у выбранного модуля'),input=el('input');input.type='checkbox';input.checked=!(p.excluded_members||[]).includes(it.item_id);input.setAttribute('aria-label','Фартук у выбранного модуля');label.append(input);section.append(label);this.app.listen(input,'change',()=>{const ids=new Set(p.excluded_members||[]);input.checked?ids.delete(it.item_id):ids.add(it.item_id);this.patch(list,p.id,{excluded_members:[...ids]});});}
     }else{
     const shapes=el('div');shapes.className='wall-finish-shapes';for(const [shape,text]of Object.entries(shapeNames)){const b=this.button('',()=>this.patch(list,p.id,{shape}));b.innerHTML=drawing(shape);b.append(el('span',text));b.setAttribute('aria-label','Форма фартука: '+text);b.setAttribute('aria-pressed',String(shape===p.shape));shapes.append(b);}section.append(shapes);}
    }
    const grid=el('div');grid.className='wall-finish-grid';section.append(grid);
    if(!p.automatic){this.field(grid,p,list,'wall','Стена',{options:WALLS});
    this.field(grid,p,list,'offset','Отступ от начала стены, мм',{min:0,max:12000});
    this.field(grid,p,list,'width',light?'Длина подсветки, мм':'Длина фартука, мм',{min:100,max:6000});
    this.field(grid,p,list,'elevation',light?'Высота подсветки, мм':'Низ фартука от пола, мм',{min:light?30:0,max:4900});
    section.append(el('p','Отступ от '+ORIGINS[p.wall]+'. Боковые участки: «левая» — у начала, «правая» — у конца основной панели.'));}
    if(light){
     this.field(grid,p,list,'enabled','Включить подсветку',{type:'checkbox'});
     this.field(grid,p,list,'brightness','Яркость, %',{min:0,max:100});
     this.field(grid,p,list,'temperature','Оттенок света',{options:{2700:'Тёплый · 2700 K',3000:'Тёплый белый · 3000 K',4000:'Нейтральный · 4000 K'}});
     this.field(grid,p,list,'finish','Профиль',{options:{aluminium:'Алюминий',black:'Чёрный'}});
    }else{
     this.field(grid,p,list,'height','Высота фартука, мм',{min:100,max:2000});
     if(!p.automatic&&p.shape!=='straight')this.field(grid,p,list,'depth','Глубина боковых участков, мм',{min:50,max:6000});
     this.field(grid,p,list,'thickness','Толщина фартука, мм',{options:p.kind==='skinali'?{6:'6 мм'}:p.kind==='ldsp'?{16:'16 мм',18:'18 мм'}:{8:'8 мм',10:'10 мм',12:'12 мм'}});
     if(p.kind!=='ldsp'||!p.material_id)this.field(grid,p,list,'color',p.kind==='tile'?'Цвет плитки':'Цвет панели',{type:'color'});
     if(p.kind==='tile'){
      this.field(grid,p,list,'tile_width','Ширина плитки, мм',{min:100,max:1200});this.field(grid,p,list,'tile_height','Высота плитки, мм',{min:100,max:1200});this.field(grid,p,list,'grout','Ширина шва, мм',{min:1,max:10});this.field(grid,p,list,'grout_color','Цвет шва',{type:'color'});
     }
     if(p.kind==='ldsp')this.material(section,p,list);
     section.append(el('p','Панели: '+panelSegments(resolved,s.room).map(q=>q.length+' × '+q.height+' × '+q.thickness).join(' / ')+' мм.'));
    }
    section.append(this.button(light?'Удалить подсветку':'Удалить фартук',()=>this.change('Удалить '+title,()=>{this.app.adapter.state[list]=this.app.adapter.state[list].filter(x=>x.id!==p.id);}))); 
   }
  }
 }
 material(section,p,list){
  const m=this.app.adapter.material(p.material_id),label=el('p',m?'Материал: '+m.name:'Материал ЛДСП не назначен — показан условный цвет.');label.className='studio-hint';section.append(label);
  const search=el('input');search.type='search';search.placeholder='Материал ЛДСП · '+p.thickness+' мм';search.setAttribute('aria-label','Материал фартука');section.append(search);
  const results=el('div');results.className='material-results';section.append(results);let request=0;
  this.app.listen(search,'input',async()=>{const token=++request,q=search.value.trim();results.replaceChildren();if(q.length<2)return;
   try{const data=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(q)+'&limit=20','GET');if(token!==request||!search.isConnected)return;
    const matches=data.items.filter(m=>Number(m.thickness)===p.thickness);if(!matches.length)results.append(el('p','Материал нужной толщины не найден.'));
    for(const m of matches)results.append(this.button(m.name+(m.article?' · '+m.article:''),()=>{this.app.bridge.cacheMaterial(m);this.patch(list,p.id,{material_id:m.variant_id});}));
   }catch(e){this.app.adapter.status(e.message);}
  });
  if(p.material_id)section.append(this.button('Сбросить материал фартука',()=>this.patch(list,p.id,{material_id:null})));
 }
}
