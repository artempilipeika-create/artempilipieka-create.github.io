import {showModuleCost} from './wardrobe-estimate-ui.mjs';
import {fillingCards,fillingSource,fillingFamily,fillingCabinet,fillingClearanceError} from './kitchen-filling-geometry.mjs';
import {kitchenPlacementItems,assistantStamp} from './assistant-model.mjs';
import {lowerMembers} from './ai-kitchen-project.mjs';
import {kitchenPulls} from './ai-kitchen.mjs';
import {findSpace} from './placement.mjs';
import {dimensionPatch,productionParts,kitchenSettings,rotateXZ} from './furniture-core.mjs';
import {defaultBackMount,checkBackMount} from './panel-machining.mjs';
import {backMountControls} from './panel-machining-ui.mjs';
import {hardwareArtwork} from './hardware-photos.mjs';
import {kitchenPictureChoices} from './kitchen-picture-choices.mjs';
import photos from './door-photos/sources.json' with {type:'json'};

const node=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
const productPhotos=new Map(Object.values(photos).map(p=>[p.pictured_article,p.file]));
const systems={ball:'Шариковые с доводчиком',aq:'AQ LineBox',slimbox:'Slimbox Evolution'};
const cardFor=id=>fillingCards.find(c=>c.id===id);
function button(text,fn){const b=node('button',text);b.type='button';b.onclick=fn;return b;}
function choice(parent,label,rows,value,apply){
 const l=node('label',label),s=node('select');s.setAttribute('aria-label',label);
 for(const [v,title] of rows)s.add(new Option(title,String(v)));s.value=String(value);s.onchange=()=>apply(s.value);l.append(s);parent.append(l);return s;
}
function product(parent,label,src,pressed,fn){
 const b=button('',fn),img=node('img');img.src=src;img.alt='';img.loading='lazy';
 b.setAttribute('aria-pressed',String(pressed));b.append(img,node('span',label));parent.append(b);return b;
}
export class KitchenFillingUI{
 constructor(kitchen){
  this.kitchen=kitchen;this.app=kitchen.app;this.dialog=node('dialog');this.dialog.id='kitchen-filling-dialog';this.dialog.setAttribute('aria-labelledby','kitchen-filling-title');
  this.title=node('h2');this.title.id='kitchen-filling-title';const head=node('header');head.append(this.title,button('Закрыть',()=>this.dialog.close()));
  this.tabs=node('nav');this.tabs.className='ai-kitchen-tabs';this.tabs.setAttribute('aria-label','Параметры модуля');
  for(const [key,name] of [['inside','Наполнение'],['handles','Ручки'],['body','Корпус'],['materials','Материалы']]){
   const b=button(name,()=>{this.tab=key;this.render();this.body.scrollTop=0;});b.dataset.tab=key;this.tabs.append(b);
  }
  this.body=node('div');this.body.className='ai-kitchen-body';
  this.form=node('form');this.form.onsubmit=e=>{e.preventDefault();this.save();};const aside=node('aside');this.canvas=node('canvas');this.canvas.className='kitchen-filling-preview';this.canvas.setAttribute('aria-label','Предпросмотр модуля');
  this.toggle=button('',()=>{this.inside=!this.inside;this.draw();});aside.append(this.canvas,this.toggle);this.body.append(this.form,aside);
  this.cost=node('section');this.cost.id='kitchen-filling-cost';this.cost.className='cost-card';this.cost.setAttribute('aria-live','polite');this.cost.hidden=true;aside.append(this.cost);
  const foot=node('footer');this.status=node('p');this.status.setAttribute('role','status');this.apply=button('Применить изменения',()=>this.save());this.apply.className='primary';foot.append(this.status,this.apply);
  this.dialog.append(head,this.tabs,this.body,foot);document.body.append(this.dialog);
  this.dialog.onclose=()=>{this.updateCost(null);this.app.executions?.renderer?.cancel(this.canvas);};
 }
 add(id){
  if(this.app.workspace?.isClient())this.app.workspace.client();
  const a=this.app.adapter,card=cardFor(id);
  const ok=this.app.interaction.change('Добавить '+card.name,()=>{
   let draft=a.createDraft({bazis:fillingSource(id)});
   const lower=lowerMembers(a.items),active=a.selected?.assistant_carcass?.group_id??a.selected?.item_id;
   const height=(lower.find(m=>m.id===active)??lower.at(-1))?.height??820;
   const last=a.items.findLast(it=>it.assistant_carcass?.spec.kitchenMaterials)?.assistant_carcass.spec.kitchenMaterials;
   Object.assign(draft,{name:'ИИ · '+card.name,width:card.width,layout:'drawers',drawers:id==='cargo'?1:id==='drawers-three'?3:2,kitchenFilling:{kind:id}});
   if(last)Object.assign(draft,{body_variant_id:last.body,front_variant_id:last.front});
   draft=dimensionPatch(draft,{height},a.room);
   const occupied=kitchenPlacementItems(a.items),anchor=occupied.find(it=>it.item_id===active);
   const placed=findSpace(draft,occupied,a.room,anchor,{autoRotate:false});
   if(!placed)throw Error('Для модуля нет свободного места.');
   const error=a.validate(placed);if(error)throw Error(error);a.insert(placed);
  });
  if(ok){this.app.scene.cabinetSelection=null;this.app.workspace?.panel('right',false);this.app.sync();this.app.scene.fit('selected');a.status(card.name+' · нажмите на модуль, чтобы изменить наполнение.');}
 }
 open(it){
  if(!it?.kitchenFilling||!fillingFamily(it))return;
  this.app.workspace?.panel('right',false);this.original=structuredClone(it);this.draft=structuredClone(it);this.stamp=assistantStamp(this.app.adapter);
  this.tab='inside';this.inside=true;this.title.textContent=it.name;this.dialog.showModal();this.render();
 }
 variant(patch){
  try{
   const d=this.draft,current=fillingFamily(d);const v=current.variants.find(v=>Object.entries(patch).every(([k,value])=>k==='width'||v[k]===value)&&
    ['execution','opening','system','brand','dryer_brand'].every(k=>k in patch||v[k]===current.variant[k]));
   const copy=structuredClone(d);if(v&&(v.execution==='gola'||v.opening==='push'))delete copy.kitchenFilling.pull;
   this.draft=current.select(copy,patch,this.app.bridge.catalogue.bazisModules);
   this.render();
  }catch(e){this.status.textContent=e.message;}
 }
 number(grid,label,key,min,max){
  const l=node('label',label),i=node('input');i.type='number';i.required=true;i.min=min;i.max=max;i.step=1;i.value=this.draft[key];i.name=key;i.setAttribute('aria-label',label);
  i.oninput=()=>{this.draft[key]=i.valueAsNumber;if(key==='height')this.draft.body_height=this.draft.height-this.draft.base_height;this.draw();};
  l.append(i);grid.append(l);
 }
 render(){
  const d=this.draft,{family,variant:v,variants}=fillingFamily(d),o=d.kitchenFilling;
  this.form.replaceChildren();for(const b of this.tabs.children){if(b.dataset.tab===this.tab)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');}
  const grid=node('div');grid.className='ai-kitchen-grid';this.form.append(grid);
  if(this.tab==='inside'){
   const option=(key,names,title)=>{
    const peers=variants.filter(row=>['system','opening','execution','brand','dryer_brand'].every(k=>k===key||row[k]===v[k]));
    const options=[...new Set(peers.map(n=>n[key]))];
    const select=choice(grid,title,options.map(n=>[n,names[n]??n.toUpperCase()]),v[key],n=>this.variant({[key]:n}));
    kitchenPictureChoices(grid,select,value=>peers.find(row=>row[key]===value)?.id.slice(6));
   };
   if(family==='cargo')option('brand',{},'Комплект карго');
   if(family==='dryer')option('dryer_brand',{norwing:'NORWING',flat_line:'FLAT LINE'},'Комплект сушки');
   if(family!=='cargo')option('system',systems,'Направляющие');
   if(family==='drawers')option('opening',{soft:'С доводчиком',push:'Push to open'},'Открывание');
   const kit=family==='cargo'?globalThis.MF_CARGO.kit(d):family==='dryer'?globalThis.MF_PULLOUT_DRYERS.kit(d):null;
   const key=family==='cargo'?'brand':family==='dryer'?'dryer_brand':'system';
   const art=hardwareArtwork(d,family==='drawers'?'drawer':family,key,v[key]);
   if(art){const fig=node('figure'),img=node('img');fig.className='kitchen-kit-photo';img.src=art.src;img.alt=kit?.name??systems[v.system];fig.append(img,node('figcaption',kit?kit.name+' · '+kit.article:systems[v.system]));grid.append(fig);}
   this.inside=true;
  }
  if(this.tab==='handles'){
   this.inside=false;
   const group=node('section');group.className='ai-handle-catalogue';const cards=node('div');cards.className='ai-hinge-grid ai-handle-grid';group.append(cards);this.form.append(group);
   const mode=v.execution==='gola'?'gola':o.pull??'standard';
   const switchTo=(execution,article)=>{
    const patch={execution};if(v.opening==='push'&&(article||execution==='gola'))patch.opening='soft';
    try{const copy=structuredClone(d);delete copy.kitchenFilling.pull;
     const next=fillingFamily(copy).select(copy,patch,this.app.bridge.catalogue.bazisModules);if(article)next.kitchenFilling.pull=article;
     this.draft=next;this.render();
    }catch(e){this.status.textContent=e.message;}
   };
   const image=(article)=>'/account/planner/door-photos/'+productPhotos.get(article);
   const basic=button(v.opening==='push'?'Push to open':'Ручка исходного модуля',()=>switchTo('standard'));basic.setAttribute('aria-pressed',String(mode==='standard'));group.prepend(basic);
   const gola=product(cards,family==='cargo'?'Gola L под столешницей':'Gola L сверху и C между фасадами',image('118124'),mode==='gola',()=>switchTo('gola'));gola.dataset.pull='gola';
   for(const [id,p] of kitchenPulls.filter(([,p])=>p.family==='monblan')){
    const b=product(cards,'MONBLAN '+id+' · '+p.length+' мм',image(id),mode===id,()=>switchTo('standard',id));b.dataset.pull=id;b.disabled=p.length>d.width-3;if(b.disabled)b.title='Длина ручки превышает ширину фасада';
   }
  }
  if(this.tab==='body'){
   if(v.allowed_widths)choice(grid,'Ширина корпуса, мм',v.allowed_widths.map(n=>[n,n]),d.width,n=>this.variant({width:Number(n)}));else this.number(grid,'Ширина корпуса, мм','width',...(this.app.adapter.template(d)?.production?.limits?.w??[350,1200]));
   this.number(grid,'Высота с опорами, мм','height',700,1150);this.number(grid,'Глубина боковины, мм','depth',family==='drawers'?300:510,700);
   const b=o.backMount,method=b?.kind==='rabbet'?'quarter':b?.layout??'overlay';
   choice(grid,'Задняя стенка',[['overlay','Накладная ЛХДФ 3 мм'],['sides','Паз в боковинах · ХДФ под гвозди'],['perimeter','Паз по кругу'],['quarter','Четверть']],method,val=>{
    if(val==='overlay')delete o.backMount;else o.backMount=defaultBackMount(val==='quarter'?'right':val);this.render();
   });
   if(b)backMountControls({fields:fillingCabinet(d),form:this.form,select:choice,changed:()=>this.draw()});
  }
  if(this.tab==='materials'){
   for(const [title,field] of [['Корпус','body_variant_id'],['Фасады','front_variant_id']])this.kitchen.picker(grid,title,d[field],18,id=>{d[field]=id;},()=>this.render());
   const boards=(v.panels??[]).filter(p=>p.role==='drawer' && p.size[p.axes[2]]===16);
   if(boards.length){
    const ids=new Set(boards.map(p=>d.part_materials?.[p.key]??null));
    this.kitchen.picker(grid,'Дно и задние стенки шуфляд · 16 мм',ids.size===1?[...ids][0]:null,16,id=>{
     d.part_materials={...d.part_materials,...Object.fromEntries(boards.map(p=>[p.key,id]))};
    },()=>this.render(),ids.size>1?'Разные материалы деталей':'По декору корпуса, если есть плита 16 мм');
   }
  }
  this.draw();
 }
 position(){
  const a=this.original,d=this.draft,rotation=a.rotation||0;
  const dz=(d.depth-a.depth)/2+kitchenSettings(d).rearServiceGapMm-kitchenSettings(a).rearServiceGapMm;
  const shift=rotateXZ((d.width-a.width)/2,dz,rotation);
  return {...d,x:a.x+shift.x,z:a.z+shift.z,rearServiceGapMm:kitchenSettings(d).rearServiceGapMm};
 }
 updateCost(item){
  if(!item||!this.app.bridge.estimateAccess()){
   clearTimeout(this.priceTimer);this.priceKey=null;this.cost.hidden=true;return;
  }
  const scene=this.app.bridge.payload();
  scene.items=scene.items.map(current=>current.item_id===item.item_id?item:current);
  const key=JSON.stringify(scene);
  if(key===this.priceKey)return;
  this.priceKey=key;clearTimeout(this.priceTimer);this.cost.hidden=false;
  showModuleCost(this.cost,null);
  this.priceTimer=setTimeout(async()=>{
   try{
    const quote=await this.app.bridge.request('/3d-estimates/preview','POST',scene);
    if(this.priceKey!==key||!this.dialog.open)return;
    showModuleCost(this.cost,quote.modules?.find(it=>it.id===item.item_id),'Нет расчёта для выбранного модуля.',false);
   }catch{
    if(this.priceKey===key&&this.dialog.open)showModuleCost(this.cost,null,'Не удалось рассчитать стоимость.');
   }
  },300);
 }
 draw(){
  const d=this.draft;this.apply.disabled=true;this.toggle.textContent=this.inside?'Показать фасады':'Показать наполнение';
  try{
   if(!this.form.checkValidity())throw Error('Проверьте размеры модуля.');
   const it=this.position(),template=this.app.adapter.template(it);
   const error=this.app.adapter.validate(it);if(error)throw Error(error);
   const p=productionParts(it,template),v=fillingFamily(it).variant,pull=it.kitchenFilling.pull;
   if(pull&&kitchenPulls.find(([a])=>a===pull)[1].length>Math.min(...p.filter(p=>p.role==='front').map(p=>p.size.x)))throw Error('Ручка MONBLAN длиннее фасада. Выберите меньший размер.');
   checkBackMount(fillingCabinet(it));const clearance=fillingClearanceError(it,p);if(clearance)throw Error(clearance);
   this.apply.disabled=false;this.status.textContent=it.width+' × '+it.height+' × '+it.depth+' мм · '+(v.execution==='gola'?'Gola':pull?'MONBLAN '+pull:'Исполнение исходного модуля');
   this.updateCost(it);
   const renderer=this.app.executions?.ensureRenderer();this.canvas.hidden=!renderer;
   renderer?.request(this.canvas,it,{view:this.inside?'inside':'closed',sceneDisplayMode:true,dialog:true});
  }catch(e){this.updateCost(null);this.status.textContent=e.message;this.canvas.hidden=true;}
 }
 save(){
  if(this.apply.disabled)return;
  const a=this.app.adapter;
  if(this.stamp!==assistantStamp(a)||a.selected?.item_id!==this.original.item_id){this.status.textContent='Проект изменился. Откройте карточку заново.';return;}
  const it=this.position();try{
   const saved=this.kitchen.change('Параметры нижнего модуля',()=>{const err=a.validate(it);if(err)throw Error(err);a.replace(it);return true;});
   if(saved){this.dialog.close();this.app.sync();}
  }catch(e){this.status.textContent=e.message;}
 }
 dispose(){this.updateCost(null);this.dialog.close();this.dialog.remove();}
}
