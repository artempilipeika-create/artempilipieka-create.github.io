import {kitchenModels,kitchenFields,kitchenHinges,kitchenRails,kitchenSpec,kitchenFeet,kitchenFoot,isBase,isVitrine} from './ai-kitchen.mjs';
import {buildCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {carcassSVG} from './carcass-ui.mjs';
import {WardrobePreview} from './wardrobe-preview.mjs';
import railPhotos from './door-photos/sources.json' with {type:'json'};
import {hingePhotoCard,fittingPhotoUrl,hardwareArtwork} from './hardware-photos.mjs';
import {kitchenMaterials,materialRole,lowerMembers,kitchenRow,standardFields,saveKitchen} from './ai-kitchen-project.mjs';
import {choice,fittings,shelfDescription} from './shelf-choices.mjs';
import {defaultFixture} from './worktop-fixtures.mjs';
import {selectedCarcass,assistantStamp} from './assistant-model.mjs';

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
  const aside=el('aside');this.preview=new WardrobePreview(app,()=>{});this.showOpen=true;this.preview.onPart=key=>this.pickPart(key);
  this.view=button('Закрыть двери',()=>{this.showOpen=!this.showOpen;this.draw();});this.drawing=el('div');this.drawing.className='ai-kitchen-drawing';aside.append(this.preview.root,this.drawing,this.view);
  this.fitted=el('div');this.fitted.className='ai-fitted';aside.append(this.fitted);
  this.railDetails=el('details');this.railSummary=el('summary');this.railChoices=el('div');this.railChoices.className='ai-hinge-grid';this.railDetails.append(this.railSummary,this.railChoices);
  this.hingeDetails=el('details');this.hingeSummary=el('summary');this.choices=el('div');this.choices.className='ai-hinge-grid';this.hingeDetails.append(this.hingeSummary,this.choices);
  content.append(this.form,aside);const foot=el('footer');this.status=el('p');this.status.setAttribute('role','status');this.saveButton=button('',()=>this.save());this.saveButton.className='primary';
  foot.append(this.status,this.saveButton);this.dialog.append(head,content,foot);document.body.append(this.dialog);
  this.dialog.addEventListener('close',()=>this.preview.release());
  const linked=new URLSearchParams(location.search).get('catalog')==='ai';
  const openLinkedCatalogue=()=>{if(linked)app.workspace?.panel('left',true);};
  this.unsubscribe=app.bridge.subscribe(reason=>{
   if(reason==='before-project'||reason==='project')this.dialog.close();
   if(reason==='project')queueMicrotask(openLinkedCatalogue);
  });
  document.getElementById('room-setup')?.addEventListener('close',openLinkedCatalogue,{signal:this.events.signal});
  document.addEventListener('mf:ai-kitchen-catalogue',e=>this.cards(e.detail),{signal:this.events.signal});
  document.dispatchEvent(new Event('mf:ai-kitchen-ready'));
  openLinkedCatalogue();
 }
 cards(root){
  const group=el('div');group.className='mf3d-module-group';group.dataset.category='ai';group.append(el('h3','Кухонные модули ИИ'));
  for(const m of kitchenModels){
   const b=button('',()=>this.add(m.id));b.className='mf3d-module';b.dataset.tags='ai';b.dataset.category='ai';b.dataset.aiKitchen=m.id;b.dataset.width='600';b.dataset.search=(m.name+' '+m.description+' ИИ').toLowerCase();b.setAttribute('aria-label',m.name);
   const visual=el('span');visual.className='studio-card-visual';const img=el('img');img.className='studio-preview studio-preview-tripo';img.src='/account/planner/module-card-images/'+m.photo+'.webp';img.alt='';img.loading='lazy';visual.append(img);
   const copy=el('span');copy.className='mf3d-module-copy';copy.append(el('strong',m.name),el('span',m.description));b.append(visual,copy);group.append(b);
  }
  const finish=button('Материалы кухни',()=>{
   const a=this.app.adapter,last=a.selected?.assistant_carcass?.spec.kitchenModel?a.selected:a.items.findLast(it=>it.assistant_carcass?.spec.kitchenModel);
   if(!last){a.status('Сначала добавьте шкаф.');return;}
   a.select(last.item_id);this.edit('materials',true);
  });finish.className='ai-project-materials';group.append(finish);root.append(group);
 }
 add(id){
  const a=this.app.adapter;
  try{
   if(this.app.workspace?.isClient())this.app.workspace.client();
   const fields=standardFields(a,id);
   const gid=this.change('Добавить кухонный шкаф',()=>saveKitchen(a,{fields}));
   if(gid){this.app.scene.cabinetSelection=gid;this.app.workspace?.panel('right',false);this.app.sync();this.app.scene.fit('selected');
    a.status(modelFor(id).name+' добавлен. Нажмите на шкаф, чтобы изменить его.');}
  }catch(error){a.status(error.message);}
 }
 change(label,run){
  let value;
  let problem;const ok=this.app.interaction.change(label,()=>{try{value=run();}catch(e){problem=e;throw e;}});
  if(problem)throw problem;return ok?value:null;
 }
 edit(tab='size',wholeKitchen=false){
  try{const c=selectedCarcass(this.app.adapter);if(c?.metadata.spec.kitchenModel)this.open(c,tab,wholeKitchen);}
  catch(error){this.app.adapter.status(error.message);}
 }
 open(current,tab='size',wholeKitchen=false){
  if(this.app.workspace?.isClient())this.app.workspace.client();
  this.app.workspace?.panel('right',false);
  this.current=current;const id=current.metadata.spec.kitchenModel;
  this.fields=kitchenFields(id,current.metadata.spec);this.fields.materials=kitchenMaterials(current);
  this.fixture=current.items.find(it=>it.item_id.endsWith(':bottom'))?.worktop_fixture;
  this.fixture=this.fixture?structuredClone(this.fixture):null;
  this.stamp=assistantStamp(this.app.adapter);this.showOpen=true;this.tab=tab;
  this.heightScope='one';this.chosenIds=new Set();this.wholeKitchen=wholeKitchen;this.changedRoles=new Set();this.partKey=null;
  this.hingeDetails.open=false;this.railDetails.open=false;this.title.textContent=current.metadata.name;
  this.saveButton.textContent='Применить изменения';if(!this.dialog.open)this.dialog.showModal();this.render();
  this.form.querySelector('[aria-current="step"]')?.focus();
 }
 render(){
  const f=this.fields,base=isBase(f.id),glass=isVitrine(f.id),sink=f.id==='base-sink';
  this.form.replaceChildren();
  const nav=el('nav');nav.className='ai-kitchen-tabs';nav.setAttribute('aria-label','Параметры шкафа');
  for(const [id,title] of [['size','Размеры'],['inside',sink?'Мойка':'Полки'],['hardware','Фурнитура'],['light','Подсветка'],['materials','Материалы']]){
   const b=button(title,()=>{this.tab=id;this.render();});b.dataset.tab=id;if(id===this.tab)b.setAttribute('aria-current','step');nav.append(b);
  }
  this.form.append(nav);
  const grid=el('div');grid.className='ai-kitchen-grid';this.form.append(grid);
  const number=(key,name,value,min,max,change,step=1)=>{
   const i=el('input');i.type='number';Object.assign(i,{name:key,value,min,max,step,required:true});const label=el('label',name);i.setAttribute('aria-label',name);label.append(i);grid.append(label);
   i.oninput=()=>{change(i.valueAsNumber);this.draw();};return i;
  };
  const select=(key,name,value,options,change)=>{
   const s=el('select');s.name=key;s.setAttribute('aria-label',name);
   for(const [v,label] of options)s.add(new Option(label,String(v)));s.value=String(value);
   const label=el('label',name);label.append(s);grid.append(label);
   s.onchange=()=>{change(s.value);this.render();};return s;
  };
  if(this.tab==='size'){
   number('width','Ширина корпуса, мм',f.width,200,1200,v=>f.width=v);
   number('depth','Глубина боковины, мм',f.depth,200,1200,v=>f.depth=v);
   if(base){
    const h=kitchenFoot(f.feet).height;
    const installed=number('installed','От пола до низа столешницы, мм',f.height+h,200+h,2400+h,v=>f.height=v-h);
    const presets=el('div');presets.className='ai-presets';
    for(const value of [820,900])presets.append(button(value+' мм',()=>{f.height=value-h;installed.value=value;this.draw();}));grid.append(presets);
    select('heightScope','Применить высоту',this.heightScope,[['one','Этот шкаф'],['row','Весь нижний ряд'],['selected','Выбранные нижние шкафы']],v=>this.heightScope=v);
    const members=lowerMembers(this.app.adapter.items),gid=this.current.metadata.group_id;
    if(this.heightScope==='row')grid.append(el('p','В ряду шкафов: '+kitchenRow(members,gid).length));
    if(this.heightScope==='selected'){
     const list=el('fieldset'),legend=el('legend','Шкафы для изменения высоты');list.append(legend);list.className='ai-span';
     for(const m of members.filter(m=>m.id!==gid)){
      const l=el('label'),box=el('input');box.type='checkbox';box.checked=this.chosenIds.has(m.id);box.onchange=()=>box.checked?this.chosenIds.add(m.id):this.chosenIds.delete(m.id);l.append(box,document.createTextNode(m.name+' · '+m.height+' мм'));list.append(l);
     }
     grid.append(list);
    }
   }else{
    number('height','Высота корпуса, мм',f.height,200,2400,v=>f.height=v);
    number('elevation','Низ от пола, мм',f.elevation,0,4800,v=>f.elevation=v);
   }
   select('swing','Открывание',f.swing,[['left','Петли слева'],['right','Петли справа'],['pair','Две двери']],v=>f.swing=v);
  }
  if(this.tab==='inside'&&!sink){
   select('shelves','Количество полок',f.shelves,[0,1,2,3].map(n=>[n,n]),v=>f.shelves=Number(v));
   for(let i=0;i<f.shelves;i++){
    const [size,article]=f.shelfChoices[i].split('/'),board=size==='board',name='Полка '+(i+1);
    const title=el('h3',name);title.className='ai-span';grid.append(title);
    if(glass)select('shelf-'+i,name+' · материал',size,[['board','ЛДСП 18 мм'],...['4','6','8'].map(n=>[n,'Стекло '+n+' мм'])],v=>{
     f.shelfChoices[i]=v==='board'?'board/95388':v+'/'+(fittings.some(p=>p.article===article&&p.kind==='glass'&&p.sizes.includes(Number(v)))?article:'48846');
    });
    const schemes=[['95388','Полкодержатели'],['confirmat','Конфирматы'],['cam_dowel','Шкант + эксцентрик']];
    select('fix-'+i,name+' · крепление',board&&!['confirmat','cam_dowel'].includes(article)?'95388':article,
     board?schemes:fittings.filter(p=>p.kind==='glass'&&p.sizes.includes(Number(size))).map(p=>[p.article,p.name+' · '+p.article]),v=>f.shelfChoices[i]=size+'/'+v);
   }
  }
  if(this.tab==='inside'&&sink){
   select('sink','Мойка на столешнице',Boolean(this.fixture),[['true','Установлена'],['false','Только тумба']],v=>this.fixture=v==='true'?defaultFixture('sink'):null);
   if(this.fixture){
    for(const [key,label,min,max] of [['width','Ширина мойки, мм',300,1000],['depth','Глубина мойки, мм',300,700],['front_offset','От переднего края столешницы, мм',20,880],['offset_x','Смещение от центра, мм',-1500,1500]])
     number('sink-'+key,label,this.fixture[key],min,max,v=>this.fixture[key]=v);
    select('sink-finish','Исполнение мойки',this.fixture.finish,[['steel','Нержавеющая сталь'],['black','Чёрная']],v=>this.fixture.finish=v);
    select('faucet','Смеситель',this.fixture.faucet,[['arch','Высокий дуговой'],['angled','Г-образный'],['compact','Компактный']],v=>this.fixture.faucet=v);
   }
  }
  if(this.tab==='hardware'){
   if(base){
    for(const [category,title] of [['plinth','Накладные под цоколь'],['decor','Декоративные опоры']]){
     const group=el('details');group.className='ai-feet';group.append(el('summary',title));const list=el('div');
     for(const p of kitchenFeet.filter(p=>p.category===category)){
      const b=button('',()=>{f.height+=kitchenFoot(f.feet).height-p.height;f.feet=p.article;this.draw();});
      b.dataset.foot=p.article;b.append(productCard(fittingPhotoUrl(p.article),p.name+' · '+p.height+' мм · '+(p.finish??(p.white?'белая':'чёрная'))+' · '+p.article));list.append(b);
     }group.append(list);this.form.append(group);
    }
   }
   this.choices.replaceChildren();
   for(const p of kitchenHinges(f.id)){const b=button('',()=>{f.hinge=p.article;this.draw();});b.dataset.hingeArticle=p.article;b.append(hingePhotoCard(p.article));this.choices.append(b);}
   this.form.append(this.hingeDetails);
   if(!glass){
    select('orientation','Положение ручки',f.orientation,[['vertical','Вертикально'],['horizontal','Горизонтально']],v=>f.orientation=v);
    this.railChoices.replaceChildren();const none=button('Без ручки',()=>{f.handle='none';this.draw();});none.dataset.railArticle='none';this.railChoices.append(none);
    for(const [article,p] of kitchenRails){const photo=railPhotosByArticle.get(article),b=button('',()=>{f.handle=article;this.draw();});b.dataset.railArticle=article;b.append(productCard('/account/planner/door-photos/'+photo.file,p.pitch+' мм · '+p.finish+' · '+article));this.railChoices.append(b);}
    this.form.append(this.railDetails);
   }
  }
  if(this.tab==='light'){
   select('light','Внутренняя подсветка',f.light,[['off','Выключена'],['left','Слева'],['right','Справа'],['both','С обеих сторон']],v=>f.light=v);
   select('workLight','Подсветка под дном',f.workLight,[['false','Выключена'],['true','Включена']],v=>f.workLight=v==='true');
   if(f.light!=='off'||f.workLight)select('lightSystem','Профиль подсветки',f.lightSystem,[['lira-17.5x6.5','LIRA-1707 с экраном'],['aq-4x8','AQ LED-LINE 4 мм']],v=>f.lightSystem=v);
   if(f.light!=='off'){
    number('lightAxis','От переднего торца до оси, мм',f.lightAxis,0,1200,v=>f.lightAxis=v,.25);
    number('lightStart','От низа боковины, мм',f.lightStart,0,2400,v=>f.lightStart=v,.5);
    number('lightEnd','От верха боковины, мм',f.lightEnd,0,2400,v=>f.lightEnd=v,.5);
   }
   if(f.workLight)number('underAxis','От переднего торца дна до оси, мм',f.underAxis,0,1200,v=>f.underAxis=v,.25);
  }
  if(this.tab==='materials'){
   select('scope','Материалы корпуса и фасадов',this.wholeKitchen?'all':'one',[['one','Этот шкаф'],['all','Все шкафы ИИ в проекте']],v=>this.wholeKitchen=v==='all');
   this.picker(grid,'Корпус',f.materials.body,18,m=>{f.materials.body=m;this.changedRoles.add('body');});
   if(!glass||this.wholeKitchen)this.picker(grid,'Фасады',f.materials.front,18,m=>{f.materials.front=m;this.changedRoles.add('front');});
   else grid.append(el('p','Фасады витрины · рамка Z1 и стекло.'));
   const parts=this.previewParts().filter(p=>materialRole(p.key,p.item));
   const key=this.partKey&&parts.some(p=>p.key===this.partKey)?this.partKey:'';
   select('part','Отдельная деталь',key,[['','Выберите на модели или из списка'],...parts.map(p=>[p.key,p.label])],v=>this.partKey=v);
   const part=parts.find(p=>p.key===key);
   if(part){
    const override=f.materials.parts[key],role=materialRole(key,part.item);
    this.picker(grid,part.label,override??f.materials[role]??part.item.body_variant_id,part.item.blank_thickness_mm,id=>f.materials.parts[key]=id);
    if(override)grid.append(button('Вернуть материал детали по умолчанию',()=>{delete f.materials.parts[key];this.render();}));
   }
  }
  this.draw();
 }
 picker(grid,title,id,thickness,assign){
  const card=el('fieldset');card.className='ai-picker ai-span';card.append(el('legend',title));
  const material=this.app.adapter.material(id),defaultIds=globalThis.MF_FURNITURE_CORE.DEFAULT_MATERIALS;
  const known=id===defaultIds.body_variant_id?'BYSPAN 605 PO':id===defaultIds.front_variant_id?'BYSPAN 890 PO':id===CARCASS_BACK_MATERIAL_ID?'ЛХДФ белый':'Материал проекта';
  const active=el('strong',material?.name??known);card.append(active);
  const input=el('input');input.type='search';input.placeholder='Название или артикул';input.setAttribute('aria-label','Поиск · '+title);
  const matches=el('div');matches.className='ai-material-results';
  let sequence=0,timer;
  const search=async()=>{
   const ticket=++sequence;matches.textContent='Поиск…';
   try{const r=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(input.value.trim())+'&thickness='+thickness+'&limit=40');
    if(ticket!==sequence||!card.isConnected)return;
    matches.replaceChildren();
    for(const m of r.items.filter(x=>Number(x.thickness)===thickness)){
     const b=button('',()=>{this.app.bridge.cacheMaterial(m);assign(m.variant_id);this.render();});
     const chip=el('i');chip.style.backgroundColor=m.visual?.render_color??'#dedfd9';
     const src=m.visual?.texture_url??m.visual?.preview_url;if(src?.startsWith('/')){const img=el('img');img.src=src;img.alt='';img.loading='lazy';chip.append(img);}
     b.append(chip,document.createTextNode(m.name+' · '+m.thickness+' мм'));matches.append(b);
    }if(!matches.children.length)matches.textContent='Материал этой толщины не найден.';
   }catch{if(ticket===sequence)matches.textContent='Каталог материалов сейчас недоступен.';}
  };
  input.oninput=()=>{sequence++;clearTimeout(timer);timer=setTimeout(search,250);};
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);search();}};
  const go=button('Найти',search);card.append(input,go,matches);grid.append(card);
 }
 pickPart(key){
  if(!this.current)return;
  const part=this.previewParts().find(p=>p.key===key);if(!part||!materialRole(key,part.item))return;
  this.partKey=key;this.tab='materials';this.render();
  this.form.querySelector('[name=part]')?.scrollIntoView({block:'nearest'});
 }
 previewParts(){try{return this.build().parts;}catch{return [];}}
 build(){
  const f=this.fields,s=kitchenSpec(f),m=f.materials;
  const built=buildCarcass(s,{idPrefix:'questionnaire-preview',bodyMaterialId:m.body,frontMaterialId:m.front,backMaterialId:CARCASS_BACK_MATERIAL_ID});
  for(const {key,item} of built.parts){if(materialRole(key,item)&&m.parts[key])item.body_variant_id=m.parts[key];}
  return built;
 }
 draw(){
  const f=this.fields,base=isBase(f.id);
  this.fitted.replaceChildren();const seen=new Set();
  for(const value of f.shelfChoices.slice(0,f.shelves)){
   if(seen.has(value))continue;seen.add(value);const c=choice(value,18),n=f.shelfChoices.slice(0,f.shelves).filter(v=>v===value).length;
   const art=c.scheme==='cam_dowel'?'cam':c.hardware.article;
   this.fitted.append(productCard(fittingPhotoUrl(art),shelfDescription(c,n)));
  }
  if(base)this.fitted.append(productCard(fittingPhotoUrl(f.feet),kitchenFoot(f.feet).height+' мм · '+f.feet));
  if(f.light!=='off'||f.workLight){const p=hardwareArtwork(null,'vitrine','light_system',f.lightSystem);if(p)this.fitted.append(productCard(p.src,p.article+' · '+(f.lightSystem==='aq-4x8'?'AQ LED-LINE':'LIRA-1707')));}
  this.railSummary.textContent='Рейлинговые ручки AKS · '+(f.handle==='none'?'Без ручки':f.handle);this.hingeSummary.textContent='Петли · '+f.hinge;
  for(const b of this.form.querySelectorAll('[data-foot],[data-rail-article],[data-hinge-article]'))b.setAttribute('aria-pressed',String(b.dataset.foot===f.feet||b.dataset.railArticle===f.handle||b.dataset.hingeArticle===f.hinge));
  this.view.textContent=this.showOpen?'Закрыть двери':'Открыть двери';this.saveButton.disabled=true;
  try{
   const b=this.build();if(b.hingeConflicts.length)throw Error(b.hingeConflicts.join(' '));
   if(b.spec.elevation+b.envelope.height>this.app.adapter.room.height)throw Error('Шкаф выходит выше потолка.');
   const lights=b.parts.flatMap(({key,item})=>(item.blank_machining??[]).filter(op=>op.lightSystem).map(op=>({key,length:item.blank_length_mm-(op.start??0)-(op.end??0)})));
   const side=lights.find(p=>p.key!=='bottom'),under=lights.find(p=>p.key==='bottom');
   this.status.textContent=[base?'Корпус '+f.height+' мм + опоры '+kitchenFoot(f.feet).height+' мм = '+b.envelope.height+' мм':'Корпус '+f.width+' × '+f.height+' × '+(f.depth+3)+' мм',side?'Боковой профиль '+side.length+' мм':null,under?'Под дном '+under.length+' мм':null].filter(Boolean).join(' · ');
   this.saveButton.disabled=!this.form.checkValidity();this.preview.sync(b,this.showOpen?0:null,this.current,{body:true,front:true,back:true});
   this.drawing.hidden=!this.preview.root.hidden;
   if(!this.drawing.hidden)this.drawing.innerHTML=carcassSVG({...b,parts:this.showOpen?b.parts.filter(p=>!p.key.startsWith('door-')):b.parts},true);
  }catch(error){this.preview.hide();this.drawing.hidden=true;this.status.textContent=error.message;}
 }
 save(){
  if(this.saveButton.disabled||!this.form.reportValidity())return;
  try{
   const a=this.app.adapter,id=this.current.metadata.group_id,targets=this.heightScope==='row'?kitchenRow(lowerMembers(a.items),id).map(x=>x.id):this.heightScope==='selected'?[...this.chosenIds]:[];
   const gid=this.change('Параметры кухонных шкафов',()=>saveKitchen(a,{fields:this.fields,current:this.current,heightIds:targets,materialRoles:[...this.changedRoles],
    wholeKitchen:this.wholeKitchen,fixture:this.fixture,stamp:this.stamp}));
   if(gid){this.dialog.close();this.app.scene.cabinetSelection=gid;this.app.sync();a.status('Изменения применены.');}
  }catch(error){this.status.textContent=error.message;}
 }
 dispose(){this.events.abort();this.unsubscribe?.();this.preview.dispose();this.dialog.remove();}
}
