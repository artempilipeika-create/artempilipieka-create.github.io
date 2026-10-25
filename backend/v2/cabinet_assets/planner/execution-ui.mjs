import {ExecutionPreviews} from './execution-previews.mjs';
import {buttonFamilies,optionDescriptor,previewVariant} from './execution-options.mjs';
import {PRODUCTION_MODELS} from './furniture-core.mjs';
import {executionArtwork} from './execution-artwork.mjs';
import {hardwareArtwork} from './hardware-photos.mjs';
const get=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
const makeButton=(text)=>{const b=el('button','secondary',text);b.type='button';return b;};
const families={base:'base-options-controls',upper:'upper-options-controls',drawer:'drawer-options-controls',corner:'corner-options-controls',tall:'tall-options-controls',vitrine:'vitrine-options-controls','open-tall':'open-tall-controls',cargo:'cargo-controls',dryer:'pullout-dryer-controls',door:'door-opening-controls',dishwasher:'dishwasher-options'};

export class ExecutionUI{
 constructor(app){
  this.app=app;this.proxies=[];this.view='closed';this.failedArtwork=new Set();
  this.root=el('section','mf3d-control-card execution-hero');this.root.id='module-execution-preview';this.root.hidden=true;
  this.root.append(el('h3','','Выбранное исполнение'));
  this.visual=el('div','execution-hero-visual');this.canvas=el('canvas','execution-canvas');this.canvas.setAttribute('role','img');this.visual.append(this.canvas);this.root.append(this.visual);
  this.caption=el('p','execution-caption');this.caption.setAttribute('aria-live','polite');this.root.append(this.caption);
  const views=el('div','execution-views');views.setAttribute('role','group');views.setAttribute('aria-label','Вид выбранного исполнения');this.viewButtons=[];
  for(const [key,title]of [['closed','С фасадами'],['inside','Наполнение']]){const b=makeButton(title);b.dataset.executionView=key;this.viewButtons.push(b);views.append(b);app.listen(b,'click',()=>{this.view=key;this.sync();});}this.root.append(views);
  this.note=el('p','studio-hint execution-preview-note','Вид конструкции в выбранных размерах. Материалы — на основной сцене.');this.root.append(this.note);
  get('base-options-controls').before(this.root);
  for(const [family,id]of Object.entries(families)){const root=get(id);if(root)root.classList.add('execution-family');}
  for(const [family,selector,keyAttr]of [['cargo','[data-cargo-option]','cargoOption'],['dryer','[data-dryer-option]','dryerOption']])for(const select of get(families[family]).querySelectorAll(selector))this.proxy(select,family,select.dataset[keyAttr]);
  this.proxy(get('vitrine-light-system'),'vitrine','light_system');
  this.generic=el('section','mf3d-control-card execution-family');this.generic.id='execution-generic-grip';this.generic.append(el('h3','','Фасады'));get('door-opening-controls').after(this.generic);
  this.proxy(get('handles'),'generic','handles',this.generic);
  this.onSourceChange=()=>this.sync();app.listen(get('item-controls'),'change',this.onSourceChange);
 }
 proxy(select,family,key,host=null){
  const label=host||select.closest('label'),group=el('div',key==='width'?'execution-widths':'execution-grid');group.setAttribute('role','group');group.setAttribute('aria-label',family==='generic'?'Ручки фасада':(label.childNodes[0]?.textContent||key).trim());
  select.classList.add('execution-source-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');if(host)host.append(group);else select.after(group);
  this.proxies.push({select,family,key,group,label,buttons:new Map()});
 }
 ensureRenderer(){const owner=this.app.scene;if(owner?.isFallback||!owner?.renderer){this.renderer?.dispose();this.renderer=null;return null;}if(this.renderer?.owner!==owner){this.renderer?.dispose();this.renderer=new ExecutionPreviews(owner);}return this.renderer;}
 decorate(button,descriptor){
  if(!button.querySelector(':scope > .execution-visual')){
   for(const child of [...button.childNodes]){if(child.nodeType===3){const wrap=el('span','execution-original');wrap.textContent=child.textContent;child.replaceWith(wrap);}else child.classList.add('execution-original');}
   button.classList.add('execution-choice');const visual=el('span','execution-visual');visual.setAttribute('aria-hidden','true');visual.append(el('canvas','execution-canvas'));button.append(visual,el('strong','execution-title'),el('small','execution-hint'),el('small','execution-reason'));
  }
  const visual=button.querySelector(':scope > .execution-visual');button.querySelector('.execution-title').textContent=descriptor.title;button.querySelector('.execution-hint').textContent=descriptor.hint;
  button.setAttribute('aria-label',descriptor.title+' · '+descriptor.hint);
  visual.classList.toggle('execution-tall',Boolean(descriptor.tall&&!descriptor.focus));
  if(descriptor.art||descriptor.photo){let img=visual.querySelector('img');if(!img){img=el('img','execution-photo');img.alt='';img.loading='lazy';img.decoding='async';visual.append(img);}const src=descriptor.art||globalThis.MF_CHOICE_CARDS.image(descriptor.photo);if(img.getAttribute('src')!==src)img.src=src;img.classList.toggle('execution-tripo-photo',Boolean(descriptor.art&&!descriptor.hardware));img.classList.toggle('execution-hardware-photo',Boolean(descriptor.hardware));visual.querySelector('canvas').hidden=true;}
  else{visual.querySelector('img')?.remove();visual.querySelector('canvas').hidden=false;}
  button.classList.toggle('execution-hardware-choice',Boolean(descriptor.hardware));
  let action=visual.querySelector('.execution-action');if(descriptor.action){if(!action){action=el('span','execution-action');visual.append(action);}action.textContent=descriptor.action;}else action?.remove();
  button.parentElement.classList.add('execution-grid');return visual;
 }
 update(button,it,family,key,value,sourceDisabled=false){
  const descriptor=optionDescriptor(family,key,value);let target,error='';
  try{target=previewVariant(it,family,key,value,this.app.bridge.catalogue.bazisModules);}catch(e){error=e.message;}
  if(target){const hardware=hardwareArtwork(target,family,key,value);if(hardware&&!this.failedArtwork.has(hardware.src)){descriptor.art=hardware.src;descriptor.hardware=hardware;descriptor.hint=hardware.hint;}else{const art=executionArtwork(it,family,key,value);if(art&&!this.failedArtwork.has(art))descriptor.art=art;}}
  const visual=this.decorate(button,descriptor);
  if(target&&family==='cargo'&&key==='brand'&&!descriptor.hardware){const kit=globalThis.MF_CARGO.kit(target);descriptor.hint=(value==='norwing'?'Хром':'Графит')+' · '+(kit?.mounting==='side_left'?'крепление слева':'крепление снизу')+(kit?.article?' · '+kit.article:'');button.querySelector('.execution-hint').textContent=descriptor.hint;button.setAttribute('aria-label',descriptor.title+' · '+descriptor.hint);}
  if(sourceDisabled&&!error)error=button.title||'Недоступно для выбранного исполнения';
  button.disabled=Boolean(error);button.title=error;button.querySelector('.execution-reason').textContent=error;button.querySelector('.execution-reason').hidden=!error;
  const canvas=visual.querySelector('canvas');visual.classList.toggle('execution-unavailable',Boolean(error));
  if(target&&!descriptor.photo&&!descriptor.art){const renderer=this.ensureRenderer();if(renderer)renderer.request(canvas,target,descriptor);else visual.classList.add('execution-failed');}
  else{this.renderer?.cancel(canvas);if(error){canvas.width=1;canvas.height=1;delete canvas.dataset.previewReady;}}
  if(descriptor.art){visual.classList.remove('execution-failed');const img=visual.querySelector('img');img.onerror=()=>{this.failedArtwork.add(descriptor.art);img.remove();canvas.hidden=false;delete descriptor.art;this.ensureRenderer()?.request(canvas,target,descriptor);};}
 }
 syncProxies(it){
  for(const row of this.proxies){
   const {select,family,key,group,buttons}=row;if(family==='generic'&&this.generic.hidden)continue;
   if(family!=='generic'&&get(families[family]).hidden)continue;
   const values=new Set([...select.options].map(o=>o.value));for(const [value,b]of buttons)if(!values.has(value)){b.remove();buttons.delete(value);}
   for(const option of select.options){
    let b=buttons.get(option.value);if(!b){b=makeButton('');b.dataset.executionProxy=family+':'+key+':'+option.value;group.append(b);buttons.set(option.value,b);this.app.listen(b,'click',()=>{if(b.disabled||select.value===option.value)return;select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));});}
    b.setAttribute('aria-pressed',String(select.value===option.value));
    if(key==='width'){b.classList.add('execution-chip');b.textContent=option.value+' мм';b.disabled=option.disabled;b.title=option.disabled?'Недоступно для выбранной фурнитуры':'';}
    else this.update(b,it,family,key,option.value,option.disabled);
   }
  }
 }
 sync(){
  if(this.closed)return;const it=this.app.adapter.selected,p=PRODUCTION_MODELS[it?.bazis_id];this.root.hidden=!it||!p;
  const handles=get('handles');handles.classList.toggle('execution-source-select',Boolean(p));if(p){handles.tabIndex=-1;handles.setAttribute('aria-hidden','true');}else{handles.removeAttribute('tabindex');handles.removeAttribute('aria-hidden');}
  if(!it||!p){this.generic.hidden=true;return;}
  if(this.selectedId!==it.item_id){this.selectedId=it.item_id;this.view='closed';}
  const noFront=Boolean(p.open_tall);this.viewButtons[0].textContent=noFront?'Общий вид':'С фасадами';
  this.viewButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.executionView===this.view)));
  this.caption.textContent=`${it.width} × ${it.height} × ${it.depth} мм · ${this.view==='inside'?'наполнение':noFront?'открытые полки':'внешний вид'}`;
  this.canvas.setAttribute('aria-label',it.name+' · '+this.caption.textContent);
  const options={view:this.view,tall:p.tier==='tall'},renderer=this.ensureRenderer();this.visual.hidden=!renderer;this.note.textContent=renderer?'Вид конструкции в выбранных размерах. Материалы — на основной сцене.':'3D-предпросмотр недоступен. Выбор параметров работает ниже.';renderer?.request(this.canvas,it,options);
  this.generic.hidden=get('handles').disabled||get('handles').parentElement.hidden||Boolean(globalThis.MF_GOLA.baseInfo(it)||globalThis.MF_UPPERS.info(it)||globalThis.MF_DRAWERS.familyInfo(it)||globalThis.MF_CARGO.info(it)||globalThis.MF_PULLOUT_DRYERS.info(it)||p.dishwasher);
  this.syncProxies(it);
  for(const family of buttonFamilies){
   const root=get(families[family]);if(!root||root.hidden)continue;
   for(const b of root.querySelectorAll('[data-'+family+'-option]')){
    if(b.hidden)continue;const key=b.getAttribute('data-'+family+'-option'),value=b.getAttribute('data-'+family+'-value');
    if(key==='row_height'){b.classList.add('execution-number-choice');continue;}
    this.update(b,it,family,key,value);
   }
  }
  const doors=get('door-opening-controls');if(!doors.hidden)for(const b of doors.querySelectorAll('[data-door-side]'))this.update(b,it,'door','opening',b.dataset.doorSide);
  const dish=get('dishwasher-options');if(dish&&!dish.hidden)for(const b of dish.querySelectorAll('[data-variant]'))this.update(b,it,'dishwasher','execution',b.dataset.variant);
  document.body.classList.add('execution-cards-ready');
 }
 dispose(){this.closed=true;this.renderer?.dispose();this.root.remove();this.generic.remove();for(const p of this.proxies){p.group.remove();p.select.classList.remove('execution-source-select');p.select.removeAttribute('aria-hidden');p.select.removeAttribute('tabindex');}document.body.classList.remove('execution-cards-ready');}
}
