import {kitchenModels,kitchenFields,kitchenHinges,kitchenRails,kitchenSpec} from './ai-kitchen.mjs';
import {buildCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {carcassSVG} from './carcass-ui.mjs';
import {WardrobePreview} from './wardrobe-preview.mjs';
import railPhotos from './door-photos/sources.json' with {type:'json'};
import {hingePhotoCard,fittingPhotoUrl,hardwareArtwork} from './hardware-photos.mjs';
import {prepareAssistantPlan,applyAssistantPlan,selectedCarcass,assistantStamp} from './assistant-model.mjs';

const el=(tag,text='')=>Object.assign(document.createElement(tag),{textContent:text});
function button(text,action){
 const b=el('button',text);b.type='button';b.addEventListener('click',action);return b;
}
const railPhotosByArticle=new Map(Object.values(railPhotos).map(p=>[p.pictured_article,p]));
function productCard(url,label){
 const fig=el('figure'),img=el('img');img.src=url;img.alt=label;img.loading='lazy';fig.append(img,el('figcaption',label));return fig;
}
const modelFor=id=>kitchenModels.find(m=>m.id===id);

export class AIKitchenUI{
 constructor(app){
  this.app=app;this.events=new AbortController();
  this.dialog=el('dialog');this.dialog.id='ai-kitchen-dialog';this.dialog.setAttribute('aria-labelledby','ai-kitchen-name');
  const head=el('header');this.title=el('h2');this.title.id='ai-kitchen-name';
  head.append(this.title,button('Закрыть',()=>this.dialog.close()));
  const content=el('div');content.className='ai-kitchen-body';this.form=el('form');this.form.onsubmit=e=>{e.preventDefault();this.save();};
  const aside=el('aside');this.preview=new WardrobePreview(app,()=>{});this.showOpen=true;
  this.view=button('Закрыть двери',()=>{this.showOpen=!this.showOpen;this.draw();});this.drawing=el('div');this.drawing.className='ai-kitchen-drawing';aside.append(this.preview.root,this.drawing,this.view);
  this.fitted=el('div');this.fitted.className='ai-fitted';aside.append(this.fitted);
  this.railDetails=el('details');this.railSummary=el('summary');this.railChoices=el('div');this.railChoices.className='ai-hinge-grid';this.railDetails.append(this.railSummary,this.railChoices);
  this.hingeDetails=el('details');this.hingeSummary=el('summary');this.choices=el('div');this.choices.className='ai-hinge-grid';this.hingeDetails.append(this.hingeSummary,this.choices);
  content.append(this.form,aside);const foot=el('footer');this.status=el('p');this.status.setAttribute('role','status');this.saveButton=button('',()=>this.save());this.saveButton.className='primary';
  foot.append(this.status,this.saveButton);this.dialog.append(head,content,foot);document.body.append(this.dialog);
  this.dialog.addEventListener('close',()=>this.preview.release());
  this.unsubscribe=app.bridge.subscribe(reason=>{if(reason==='before-project'||reason==='project')this.dialog.close();});
  document.addEventListener('mf:ai-kitchen-catalogue',e=>this.cards(e.detail),{signal:this.events.signal});
  document.dispatchEvent(new Event('mf:ai-kitchen-ready'));
  if(new URLSearchParams(location.search).get('catalog')==='ai')app.workspace?.panel('left',true);
 }
 cards(root){
  const group=el('div');group.className='mf3d-module-group';group.dataset.category='ai';group.append(el('h3','Кухонные модули ИИ'));
  for(const m of kitchenModels){
   const b=button('',()=>this.open(m.id));b.className='mf3d-module';b.dataset.tags='ai';b.dataset.category='ai';b.dataset.aiKitchen=m.id;b.dataset.width='600';b.dataset.search=(m.name+' '+m.description+' ИИ').toLowerCase();b.setAttribute('aria-label',m.name);
   const visual=el('span');visual.className='studio-card-visual';const img=el('img');img.className='studio-preview studio-preview-tripo';img.src='/account/planner/module-card-images/'+m.photo+'.webp';img.alt='';img.loading='lazy';visual.append(img);
   const copy=el('span');copy.className='mf3d-module-copy';copy.append(el('strong',m.name),el('span',m.description));b.append(visual,copy);group.append(b);
  }
  root.append(group);
 }
 edit(){
  try{const c=selectedCarcass(this.app.adapter);if(c?.metadata.spec.kitchenModel)this.open(c.metadata.spec.kitchenModel,c);}
  catch(error){this.app.adapter.status(error.message);}
 }
 open(id,current=null){
  if(this.app.workspace?.isClient())this.app.workspace.client();
  this.current=current;this.fields=kitchenFields(id,current?.metadata.spec);
  this.stamp=assistantStamp(this.app.adapter);this.showOpen=true;this.hingeDetails.open=false;this.railDetails.open=false;
  this.title.textContent=modelFor(id).name;this.saveButton.textContent=current?'Применить изменения':'Добавить в проект';
  this.dialog.showModal();this.render();this.form.querySelector('input')?.focus();
 }
 render(){
  const f=this.fields,base=f.id==='base-swing',glass=f.id==='wall-vitrine';this.form.replaceChildren();
  const grid=el('div');grid.className='ai-kitchen-grid';this.form.append(grid);
  const field=(key,name,control,read)=>{
   const label=el('label',name);control.name=key;control.setAttribute('aria-label',name);label.append(control);grid.append(label);
   control.addEventListener(control.type==='number'?'input':'change',()=>{f[key]=read(control);this.draw();});
  };
  const number=(key,name,min,max)=>{const i=el('input');i.type='number';i.min=min;i.max=max;i.step=1;i.required=true;i.value=f[key];field(key,name,i,c=>c.valueAsNumber);};
  const select=(key,name,options,read=c=>c.value)=>{
   const s=el('select');for(const [v,label] of options)s.add(new Option(label,String(v)));s.value=String(f[key]);field(key,name,s,read);
  };
  number('width','Ширина корпуса, мм',200,1200);number('height','Высота корпуса, мм',200,2400);number('depth','Глубина боковины, мм',200,1200);
  if(base)select('feet','Высота опор',[['86502','100 мм'],['86503','150 мм']]);else number('elevation','Низ от пола, мм',0,4800);
  select('shelves','Количество полок',[0,1,2,3].map(n=>[n,String(n)]),c=>Number(c.value));
  select('swing','Открывание',[['left','Петли слева'],['right','Петли справа'],['pair','Две двери']]);
  if(glass)select('glassThickness','Стеклянные полки',[4,6,8].map(n=>[n,n+' мм']));
  else select('orientation','Положение ручки',[['vertical','Вертикально'],['horizontal','Горизонтально']]);
  if(!base){
   select('light','Свет внутри',[['off','Выключен'],['left','Слева'],['right','Справа'],['both','С обеих сторон']]);
   select('workLight','Свет над столешницей',[['false','Выключен'],['true','Под дном']],c=>c.value==='true');
   select('lightSystem','Система подсветки',[['lira-17.5x6.5','LIRA-1707 с экраном'],['aq-4x8','AQ LED-LINE 4 мм']]);
  }
  this.choices.replaceChildren();
  for(const fit of kitchenHinges(f.id)){
   const card=button('',()=>{f.hinge=fit.article;this.draw();});
   card.dataset.hingeArticle=fit.article;card.append(hingePhotoCard(fit.article));this.choices.append(card);
  }
  this.form.append(this.hingeDetails);
  if(!glass){
   this.railChoices.replaceChildren();
   const none=button('Без ручки',()=>{f.handle='none';this.draw();});none.dataset.railArticle='none';this.railChoices.append(none);
   for(const [article,p] of kitchenRails){
    const photo=railPhotosByArticle.get(article);
    const b=button('',()=>{f.handle=article;this.draw();});b.dataset.railArticle=article;
    b.append(productCard('/account/planner/door-photos/'+photo.file,p.pitch+' мм · '+p.finish+' · '+article));this.railChoices.append(b);
   }
   this.form.append(this.railDetails);
  }
  this.draw();
 }
 draw(){
  const f=this.fields;
  this.fitted.replaceChildren();
  if(f.shelves){const glass=f.id==='wall-vitrine',article=glass?'48846':'95388';this.fitted.append(productCard(fittingPhotoUrl(article),(glass?'SEKURA 0.8':'SEKURA 2')+' · '+article+' · '+(4*f.shelves)+' шт.'));}
  if(f.id==='base-swing')this.fitted.append(productCard(fittingPhotoUrl(f.feet),'Опора · '+f.feet));
  if(f.light!=='off'||f.workLight){const pic=hardwareArtwork(null,'vitrine','light_system',f.lightSystem);if(pic)this.fitted.append(productCard(pic.src,pic.article+' · '+(f.lightSystem==='aq-4x8'?'AQ LED-LINE':'LIRA-1707')));}
  if(f.id!=='wall-vitrine'){
   this.railSummary.textContent='Рейлинговые ручки AKS · '+(f.handle==='none'?'Без ручки':f.handle);
   for(const card of this.railChoices.children)card.setAttribute('aria-pressed',String(card.dataset.railArticle===f.handle));
   const photo=railPhotosByArticle.get(f.handle);if(photo)this.fitted.append(productCard('/account/planner/door-photos/'+photo.file,'Ручка · '+f.handle));
  }
  this.hingeSummary.textContent='Петли · '+f.hinge;
  for(const card of this.choices.children)card.setAttribute('aria-pressed',String(card.dataset.hingeArticle===f.hinge));
  this.view.textContent=this.showOpen?'Закрыть двери':'Открыть двери';
  this.saveButton.disabled=true;
  try{
   const spec=kitchenSpec(f);
   const materials=globalThis.MF_FURNITURE_CORE.DEFAULT_MATERIALS;
   const built=buildCarcass(spec,{idPrefix:'questionnaire-preview',bodyMaterialId:materials.body_variant_id,frontMaterialId:materials.front_variant_id,backMaterialId:CARCASS_BACK_MATERIAL_ID});
   if(built.hingeConflicts.length)throw Error(built.hingeConflicts.join(' '));
   if(spec.elevation+built.envelope.height>this.app.adapter.room.height)throw Error('Шкаф выходит выше потолка.');
   this.status.textContent='Полок — '+spec.shelves+' · петель — '+built.hingeLocations.length+(spec.feet?' · высота с опорами '+built.envelope.height+' мм':'');
   this.saveButton.disabled=!this.form.checkValidity();this.preview.sync(built,this.showOpen?0:null,this.current);
   this.drawing.hidden=!this.preview.root.hidden;
   if(!this.drawing.hidden){
    const visible=this.showOpen?built.parts.filter(p=>!p.key.startsWith('door-')):built.parts;
    this.drawing.innerHTML=carcassSVG({...built,parts:visible},true);
   }
  }catch(error){this.preview.hide();this.drawing.hidden=true;this.status.textContent=error.message;}
 }
 save(){
  if(this.saveButton.disabled||!this.form.reportValidity())return;
  try{
   const a=this.app.adapter,f=this.fields,spec=kitchenSpec(f),mats=globalThis.MF_FURNITURE_CORE.DEFAULT_MATERIALS;
   if(this.stamp!==assistantStamp(a)||this.current&&a.selected?.assistant_carcass?.group_id!==this.current.metadata.group_id)throw Error('Проект изменился. Откройте карточку шкафа заново.');
   const names=new Set(a.items.map(it=>it.assistant_carcass?.name));const base='ИИ · '+modelFor(f.id).name;let number=1;while(names.has(base+' '+number))number++;
   const plan=prepareAssistantPlan(a,{action:this.current?'update':'create',spec},{cabinetName:this.current?.metadata.name??base+' '+number,defaultMaterial:mats.body_variant_id,...(!this.current?{frontMaterialId:mats.front_variant_id}:{})});
   if(this.app.interaction.change('Кухонный модуль ИИ',()=>applyAssistantPlan(a,plan))){
    this.dialog.close();this.app.scene.cabinetSelection=a.selected.assistant_carcass.group_id;this.app.sync();this.app.scene.fit('selected');a.status('Кухонный модуль сохранён в проекте.');
   }
  }catch(error){this.status.textContent=error.message;}
 }
 dispose(){this.events.abort();this.unsubscribe?.();this.preview.dispose();this.dialog.remove();}
}
