import {wardrobeDrawing,drawingTitles} from './wardrobe-drawing.mjs';
import {footHeight,plinthFoot,plinthPanel,plinthClearanceMm} from './plinth-options.mjs';
import {feetCatalogue} from './wardrobe-feet.mjs';
import {fittingImage,hingePhotoCard,jointPhotos} from './hardware-photos.mjs';
import {primeHinge} from './wardrobe-fronts.mjs';
import {sameAssistantSpec,selectedCarcass,assistantStamp,prepareAssistantPlan,applyAssistantPlan} from './assistant-model.mjs';
import {buildCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {jointOptions,jointQuantity,dividerScheme} from './carcass-joints.mjs';
import {shelfLevelControls,selectShelf,drawerControls} from './wardrobe-interior-ui.mjs';
import {shelfQuestionnaire} from './shelf-questionnaire.mjs';
import {shelfRows,choice,defaultShelf} from './shelf-choices.mjs';
import {WARDROBE_STEPS,resizeDividerChoices,wardrobeSpec,sectionWidths,questionnaireMaterialError} from './wardrobe-questionnaire.mjs';
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
export class AssistantUI{
 constructor(app){this.app=app;this.disposed=false;this.materials={};this.serial={body:0,back:0,front:0,drawer:0};this.start().catch(()=>{});}
 async start(){
  if(!this.app.bridge.assistantAccess?.())return;
  const status=await this.app.bridge.request('/3d-assistant/status');if(this.disposed)return;
  this.available=status.available;this.remainingCount=status.remaining;
  this.style=el('link');this.style.rel='stylesheet';this.style.href='/account/planner/assistant.css';document.head.append(this.style);
  this.button=button('Собрать с ИИ',()=>this.open());this.button.id='planner-assistant';this.button.className='secondary';document.getElementById('planner-tools').append(this.button);
  this.dialog=el('dialog');this.dialog.id='planner-assistant-dialog';this.dialog.className='assistant-wizard';this.dialog.setAttribute('aria-labelledby','assistant-title');
  const head=el('div');head.className='assistant-head';const title=el('h2','Собрать шкаф');title.id='assistant-title';head.append(title,button('Закрыть',()=>this.dialog.close()));
  this.mode=el('select');this.mode.setAttribute('aria-label','Действие со шкафом');this.mode.onchange=()=>this.reset();
  this.nav=el('nav');this.nav.setAttribute('aria-label','Шаги анкеты');this.nav.className='assistant-steps';
  this.steps=WARDROBE_STEPS.map((name,i)=>{const b=button((i+1)+'. '+name,()=>this.go(i));this.nav.append(b);return b;});
  const grid=el('div');grid.className='assistant-grid';this.form=el('div');this.form.className='assistant-fields';
  const aside=el('aside');aside.className='assistant-drawing';this.figureTitle=el('h3');this.drawing=el('div');this.drawing.className='wardrobe-figure';this.drawing.onclick=e=>this.pickShelf(e);
  this.drawing.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.pickShelf(e);}};this.dimensions=el('p');this.description=el('p');aside.append(this.figureTitle,this.drawing,this.dimensions,this.description);grid.append(this.form,aside);
  this.output=el('p');this.output.setAttribute('role','status');this.output.setAttribute('aria-live','polite');this.summary=el('ul');this.summary.hidden=true;
  const footer=el('div');footer.className='assistant-footer';this.previous=button('Назад',()=>this.go(this.step-1));this.next=button('Далее',()=>this.go(this.step+1));
  this.send=button('Проверить и собрать с ИИ',()=>this.ask());this.send.className='assistant-primary';this.apply=button('Добавить в проект',()=>this.commit());this.apply.className='assistant-primary';this.apply.hidden=true;
  footer.append(this.previous,this.next,this.send,this.apply);this.remaining=el('p');this.remaining.className='assistant-hint';
  this.dialog.append(head,el('p','Заполните пять шагов. Размеры и материалы сохраняются точно по анкете.'),this.mode,this.nav,grid,this.output,this.summary,footer,this.remaining);document.body.append(this.dialog);
  this.unsubscribe=this.app.bridge.subscribe(reason=>{if(reason==='before-project'||reason==='project'){this.epoch=(this.epoch||0)+1;this.pending=null;this.dialog.close();}});
 }
 open(mode='create'){
  if(this.app.workspace?.isClient())this.app.workspace.client();this.current=null;
  try{const c=selectedCarcass(this.app.adapter);if(c&&['shelves','divided'].includes(c.metadata.spec.recipe))this.current=c;}catch{}
  this.mode.replaceChildren();for(const [value,text]of [['create','Новый шкаф'],...(this.current?[['update','Изменить выбранный шкаф']]:[])]){const o=el('option',text);o.value=value;this.mode.append(o);}
  this.mode.value=mode==='update'&&this.current?'update':'create';this.reset();this.dialog.showModal();this.steps[0].focus();
 }
 reset(){
  this.epoch=(this.epoch||0)+1;this.serial.body++;this.serial.back++;this.serial.front++;this.serial.drawer++;
  const c=this.mode.value==='update'?this.current:null,s=c?.metadata.spec;
  this.fields=s?{...structuredClone(s),sectionShelves:s.sectionShelves?.slice()??Array(s.sections).fill(s.shelves)}:{width:800,height:2200,depth:577,thickness:18,sections:1,sectionShelves:[4],back:true};
  if(s?.thickness===18&&s.sections>1)this.fields.dividerJoints=Array.from({length:s.sections-1},(_,i)=>dividerScheme(s,i));
  this.view='body';this.activeSection=0;this.footOpen=false;this.footGroup=null;this.footFilter='all';
  this.shelfScopes={};this.shelfDrafts={};this.levelUnits={};this.levelIndex=0;this.previewBuilt=null;this.resetSideEdges=false;
  this.materials={};this.materialChanged={body:false,back:false};this.step=0;this.pending=null;this.busy=false;this.summary.hidden=true;
  this.output.textContent=this.available?'':'Помощник временно недоступен. Можно заполнить анкету и посмотреть схему.';this.render();
  this.loadMaterial('body',c?.items.find(i=>i.item_id.endsWith(':left'))?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id);
  this.loadMaterial('front',c?.items.find(i=>i.blank_axis==='front')?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.front_variant_id);
  this.loadMaterial('drawer',c?.items.find(i=>/:drawer-\d+-\d+-side-left$/.test(i.item_id))?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id);
  this.loadMaterial('back',c?.items.find(i=>i.item_id.endsWith(':back'))?.body_variant_id||(s?.backThickness?null:CARCASS_BACK_MATERIAL_ID));
 }
 async loadMaterial(role,id){
  if(!id)return;const epoch=this.epoch,serial=++this.serial[role];
  try{const m=this.app.bridge.material(id)||await this.app.bridge.request('/catalogue/materials/'+encodeURIComponent(id));
   if(this.disposed||epoch!==this.epoch||serial!==this.serial[role])return;
   this.app.bridge.cacheMaterial(m);this.materials[role]=m;if(this.step===4)this.render();
  }catch{if(epoch===this.epoch&&serial===this.serial[role]&&this.step===4)this.render();}
 }
 pickShelf(event){
  const hit=event.target.closest?.('[data-shelf-index]');if(hit)selectShelf(this,Number(hit.dataset.section),Number(hit.dataset.shelfIndex));
 }
 spec(){return wardrobeSpec(this.fields);}
 invalidate(){this.pending=null;this.apply.hidden=true;this.summary.hidden=true;this.output.textContent='';}
 changed(){this.invalidate();this.draw();this.controls();}
 number(key,label,min,max){
  const wrap=el('label',label),input=el('input');input.type='number';input.min=min;input.max=max;input.step='1';input.value=this.fields[key];input.setAttribute('aria-label',label);
  input.oninput=()=>{this.fields[key]=input.value===''?NaN:Number(input.value);this.changed();};wrap.append(input);this.form.append(wrap);
 }
 select(parent,label,choices,value,change){
  const wrap=el('label',label),s=el('select');s.setAttribute('aria-label',label);
  for(const [v,text,disabled]of choices){const o=el('option',text);o.value=v;o.disabled=Boolean(disabled);s.append(o);}s.value=String(value);s.onchange=()=>change(s.value);wrap.append(s);parent.append(wrap);return s;
 }
 error(step=this.step){
  try{const s=this.spec();if(s.height+s.elevation+footHeight(s)>this.app.adapter.room.height)throw Error('Шкаф выше помещения. Уменьшите высоту.');
   if(step>=4)for(const role of ['body',...(s.back?['back']:[]),...(s.front||s.drawerBanks?.some(Boolean)?['front']:[]),...(s.thickness!==18&&s.drawerBanks?.some(Boolean)?['drawer']:[])]){const e=questionnaireMaterialError(this.materials[role],role==='back'?(s.backThickness??3):role==='front'||role==='drawer'?18:s.thickness);if(e)throw Error((role==='back'?'Задняя стенка: ':role==='front'?'Фасад: ':role==='drawer'?'Короб шуфляды: ':'Корпус: ')+e);}
   return '';
  }catch(e){return e.message;}
 }
 go(index){if(this.busy||index<0||index>4)return;if(index>this.step && !(index===3&&(this.fields.front||this.fields.drawerBanks?.some(Boolean))) && !(index===1&&this.fields.dividerPositions) && !(index===2 && (this.fields.joints||this.fields.dividerJoints||this.fields.shelfChoices||this.fields.shelfLevels||this.fields.drawerBanks))){const e=this.error();if(e){this.output.textContent=e;return;}}this.step=index;this.view=['body','sections','sections','fronts','body'][index];this.render();this.steps[index].focus();}
 groupTabs(){
  const nav=el('nav');nav.className='wardrobe-subsections';nav.setAttribute('aria-label','Подразделы корпуса');
  for(const key of ['body','feet','plinth','back']){
   const b=button(drawingTitles[key],()=>{this.view=key;this.render();this.form.querySelector('[data-subsection="'+key+'"]').focus({preventScroll:true});});
   b.dataset.subsection=key;b.setAttribute('aria-pressed',String(this.view===key));nav.append(b);
  }
  this.form.append(nav);
 }
 sectionTabs(){
  const n=this.fields.sections;this.activeSection=Math.min(this.activeSection,n-1);
  if(n===1)return;
  const nav=el('div');nav.className='wardrobe-subsections';nav.setAttribute('role','group');nav.setAttribute('aria-label','Выбранная секция');
  for(let i=0;i<n;i++){
   const b=button('Секция '+(i+1),()=>{this.activeSection=i;this.render();this.form.querySelector('[data-section="'+i+'"]').focus({preventScroll:true});});
   b.dataset.section=i;b.setAttribute('aria-pressed',String(i===this.activeSection));nav.append(b);
  }this.form.append(nav);
 }
 render(){
  this.form.replaceChildren();this.steps.forEach((b,i)=>{b.setAttribute('aria-current',i===this.step?'step':'false');b.disabled=this.busy;});this.form.append(el('h3',WARDROBE_STEPS[this.step]));
  if(this.step===0){
   this.groupTabs();
   if(this.view==='body'){
   this.number('width','Ширина, мм',200,2400);this.number('height','Высота корпуса, мм',200,3000);this.number('depth','Глубина ЛДСП, мм',200,1200);
   this.select(this.form,'Толщина корпуса, мм',[...new Set([16,18,25,this.fields.thickness])].map(n=>[n,n+' мм']),this.fields.thickness,v=>{this.fields.thickness=Number(v);resizeDividerChoices(this.fields);if(Number(v)!==18)delete this.fields.joints;this.fields.shelfChoices=shelfRows(this.fields).map(row=>row.map(value=>{try{choice(value,Number(v));return value;}catch{return defaultShelf;}}));this.shelfDrafts={};this.serial.body++;this.materials.body=null;this.materialChanged.body=true;this.changed();});
   for(const [key,title,overlay] of [['bottomFit','Конструкция дна','Накладное дно'],['topFit','Конструкция крыши','Накладная крыша']])
    this.select(this.form,title,[['inset','Между боковинами'],['overlay',overlay]],this.fields[key]??'inset',v=>{this.fields[key]=v;this.changed();this.render();});
   }else if(this.view==='feet')this.footControls();
   else if(this.view==='plinth')this.plinthControls();
   else{
   this.select(this.form,'Задняя стенка',[['yes','Накладная ЛХДФ 3 мм'],...[16,18].map(n=>[String(n),'Вкладная ЛДСП '+n+' мм']),['no','Без задней стенки']],this.fields.back?(this.fields.backThickness??'yes'):'no',v=>{
    this.fields.back=v!=='no';delete this.fields.backThickness;
    if(['16','18'].includes(v))this.fields.backThickness=Number(v);
    this.serial.back++;this.materialChanged.back=true;this.materials.back=null;
    if(v==='yes')this.loadMaterial('back',CARCASS_BACK_MATERIAL_ID);
    else if(Number(this.materials.body?.thickness)===Number(v))this.materials.back=this.materials.body;
    this.changed();this.render();
   });
   this.form.append(el('p',this.fields.backThickness?'Вкладная стенка между стойками, дном и крышей. Без кромки. Чашки открываются сзади. На обеих боковинах эксцентрики стоят равномерно с шагом до 400 мм. На дне и крыше по 1 паре при длине детали до 800 мм и по 2 при большей длине.':this.fields.back?'Накладная ЛХДФ добавляет 3 мм к глубине.':'Задняя стенка отсутствует.'));
   if(this.fields.backThickness)this.form.append(jointPhotos('cam_dowel'));
   }
  }else if(this.step===1){
   const choices=el('div');choices.className='assistant-cards';
   for(const n of [1,2,3]){const b=button('',()=>{this.shelfScopes={};this.shelfDrafts={};this.activeSection=Math.min(this.activeSection,n-1);if(this.fields.dividerPositions&&n!==this.fields.sections){
      const positions=this.fields.dividerPositions;
      if(n===1)delete this.fields.dividerPositions;
      else if(n===2)this.fields.dividerPositions=positions.slice(0,1);
      else positions.push(positions[0]+this.fields.thickness+Math.ceil((this.fields.width-4*this.fields.thickness-positions[0])/2));
    }this.fields.sections=n;if(this.fields.drawerBanks)this.fields.drawerBanks=Array.from({length:n},(_,i)=>this.fields.drawerBanks[i]??null);resizeDividerChoices(this.fields);this.fields.sectionShelves=Array.from({length:n},(_,i)=>this.fields.sectionShelves[i]??4);this.fields.shelfChoices=shelfRows(this.fields);this.changed();this.render();});
    const pict=el('span');pict.className='assistant-section-icon';for(let i=0;i<n;i++)pict.append(el('i'));b.append(pict,el('strong',n===1?'Одна секция':n===2?'Две секции':'Три секции'));b.setAttribute('aria-pressed',String(this.fields.sections===n));choices.append(b);}
   this.form.append(choices);this.sectionTabs();this.sectionPositions();
   this.form.append(el('p','Передние кромки полок и внутренних стоек утоплены на 1 мм от переднего края боковин.'));
  }else if(this.step===2){
   this.sectionTabs();this.jointQuestionnaire();
   this.fields.sectionShelves.forEach((count,i)=>{const group=el('fieldset');group.append(el('legend','Секция '+(i+1)));if(i!==this.activeSection)return;
    this.select(group,'Полки в секции '+(i+1),[['shelves','С полками'],['empty','Без полок']],count?'shelves':'empty',v=>{this.fields.sectionShelves[i]=v==='empty'?0:4;this.fields.shelfChoices=shelfRows(this.fields);delete this.shelfScopes[i];delete this.shelfDrafts[i];this.changed();this.render();});
    if(count)this.select(group,'Полок в секции '+(i+1),Array.from({length:10},(_,n)=>[n+1,String(n+1)]),count,v=>{this.fields.sectionShelves[i]=Number(v);this.fields.shelfChoices=shelfRows(this.fields);delete this.shelfScopes[i];delete this.shelfDrafts[i];this.changed();this.render();});if(count){shelfLevelControls(this,group,i);shelfQuestionnaire(this,group,i);}drawerControls(this,group,i);this.form.append(group);
   });this.form.append(el('p','Полки пронумерованы снизу вверх. Базовый зазор по бокам — '+(this.fields.shelfGap??0)+' мм.'));
  }else if(this.step===3){
   this.select(this.form,'Исполнение фасада',[['none','Открытый шкаф'],['left','Одна створка · петли слева'],['right','Одна створка · петли справа'],['pair','Две равные створки']],this.fields.front?.swing??'none',value=>{
    if(value==='none')delete this.fields.front;else this.fields.front={...this.fields.front,swing:value,offset:this.fields.front?.offset??90};
    this.changed();this.render();
   });
   if(this.fields.front){
    const warning=el('p');warning.className='front-choice-warning';warning.setAttribute('role','status');warning.hidden=true;this.form.append(warning);
    const box=el('fieldset');box.className='wardrobe-hinge';box.append(el('legend','Накладная петля'));
    box.append(hingePhotoCard(primeHinge.article));
    this.select(box,'Отступ до оси чашки',[[90,'90 мм сверху и снизу'],[130,'130 мм сверху и снизу']],this.fields.front.offset,v=>{this.fields.front.offset=Number(v);this.changed();});
    const lbl=el('label','Масса одной готовой створки, кг'),input=el('input');
    input.type='number';input.min='0.01';input.max='22';input.step='0.01';input.placeholder='Авто · ЛДСП 700 кг/м³';input.value=this.fields.front.massKg??'';
    input.oninput=()=>{if(input.value==='')delete this.fields.front.massKg;else this.fields.front.massKg=Number(input.value);this.changed();};lbl.append(input);box.append(lbl);
    const hint=el('details');hint.append(el('summary','Как рассчитаны петли'),el('p','Петля и планка H0 идут комплектом на саморезах. Таблица AKS для чашки Ø35 учитывает высоту и массу одной двери шириной до 600 мм. Уточните массу, если известен вес готового фасада. Отступ 130 мм — схема мастерской.'));box.append(hint);this.form.append(box);
   }

  }else{
   if(this.mode.value==='update'){
    const label=el('label'),input=el('input');input.type='checkbox';input.checked=this.resetSideEdges;
    input.onchange=()=>{this.resetSideEdges=input.checked;this.changed();};
    label.append(input,document.createTextNode('Пересчитать кромку обеих стоек по конструкции'));this.form.append(label);
   }
   this.materialPicker('body','Материал корпуса',Number(this.fields.thickness));if(this.fields.drawerBanks?.some(Boolean)&&this.fields.thickness!==18)this.materialPicker('drawer','Короба и проставки шуфляд',18);if(this.fields.front||this.fields.drawerBanks?.some(Boolean))this.materialPicker('front','Материал фасадов',18);if(this.fields.back)this.materialPicker('back','Задняя стенка',this.fields.backThickness??3);
   this.form.append(el('p','Материалы из вашего каталога. Толщина должна совпадать с деталями. Ручные назначения отдельных деталей сохранятся, если здесь не выбирать другой материал.'));
  }this.draw();this.controls();
 }
 footControls(){
  const box=el('section');box.className='foot-picker';
  const selected=feetCatalogue.find(leg=>leg.article===this.fields.feet?.article);
  const current=plinthFoot(this.fields);
  const summary=el('div'),caption=el('small',selected?selected.name.split(' · ')[0]+(selected.finish?' · '+selected.finish:'')+(selected.plinth?(selected.white?', белая':', чёрная'):'')+' · '+selected.height+' мм · арт. '+selected.article:'Без опор');
  summary.append(caption);box.append(summary);this.form.append(box);
  const refresh=focus=>{
   this.footOpen=true;this.render();this.form.querySelector(focus)?.focus({preventScroll:true});
  };
  for(const [id,title] of [['plinth','Накладные под цоколь'],['decor','Декоративные опоры'],['end','Торцевые опоры']]){
   const group=el('details');group.className='foot-group';group.setAttribute('name','wardrobe-foot-category');
   group.open=this.footGroup===id;
   group.ontoggle=()=>{
    if(!group.isConnected)return;
    if(group.open){
     this.footGroup=id;
     for(const sibling of box.querySelectorAll('.foot-group'))if(sibling!==group)sibling.open=false;
    }else if(this.footGroup===id)this.footGroup=null;
   };
   group.append(el('summary',title));box.append(group);
   const models=feetCatalogue.filter(leg=>leg.category===id);
   if(id==='decor'){
    this.decorChoices(group,models,selected,refresh);
    continue;
   }
   if(!models.length){group.append(el('p','Модели пока не добавлены.'));continue;}
   if(id==='plinth'){
    const heights=[...new Set(models.map(leg=>leg.height))].sort((a,b)=>a-b);
    this.select(group,'Высота цокольных ножек, мм',[['all','Все высоты'],...heights.map(h=>[h,h+' мм'])],this.footFilter,v=>{
     this.footFilter=v;this.footGroup=id;refresh('.foot-group select');
    });
   }
   for(const leg of models){
    if(id==='plinth'&&this.footFilter!=='all'&&leg.height!==Number(this.footFilter))continue;
    const row=button('',()=>{
     const old=this.fields.feet;
     this.fields.feet={...(current&&leg.plinth?old:{}),article:leg.article,front:leg.plinth?(current?old.front:80):50,rear:current&&leg.plinth?old.rear:50};
     this.footGroup=id;this.invalidate();refresh('[data-foot="'+leg.article+'"]');
    });
    row.className='foot-row';row.dataset.foot=leg.article;row.setAttribute('aria-pressed',String(selected===leg));
    const image=fittingImage(leg.article,leg.name+' · '+leg.article);
    const text=el('span');text.append(el('strong',leg.name.split(' · ')[0]),el('small','Арт. '+leg.article+' · '+leg.height+' мм'+(leg.plinth?(leg.white?' · белая':' · чёрная'):'')));
    row.append(image,text);group.append(row);
   }
  }
  const none=button('Без опор',()=>{delete this.fields.feet;this.invalidate();refresh('.foot-clear');});
  none.className='foot-clear';none.setAttribute('aria-pressed',String(!selected));box.append(none);
  if(this.fields.feet){
   const decorative=selected?.category==='decor';
   for(const [key,title] of [['front',decorative?'Отступ опор от переднего края, мм':'От переднего края до оси, мм'],['rear',decorative?'Отступ опор от заднего края, мм':'От заднего края до оси, мм']]){
    const wrap=el('label',title),input=el('input');input.type='number';input.min=10;input.step=1;input.value=this.fields.feet[key];input.setAttribute('aria-label',title);
    input.oninput=()=>{this.fields.feet[key]=input.valueAsNumber;this.changed();};wrap.append(input);box.append(wrap);
   }
   if(!current&&!decorative)box.append(el('small','Пятка Ø20 мм · муфта М6 (106466) · присадка Ø8 × 16 мм'));
  }
 }
 plinthControls(){
  const current=plinthFoot(this.fields),box=el('fieldset');box.append(el('legend','Примыкания цоколя'));
  this.form.append(box);
  if(!current){
   box.append(el('p','Цоколь появляется при установке накладных кухонных опор.'),button('Выбрать опоры',()=>{this.view='feet';this.render();}));return;
  }
    for(const [key,label] of [['left','Слева'],['right','Справа']])
     this.select(box,label,[['end','До края корпуса / стены'],['side','До стойки в пол',this.fields.bottomFit==='overlay']],this.fields.feet[key]??'end',value=>{
      if(value==='side')this.fields.feet[key]='side';else delete this.fields.feet[key];this.changed();this.render();
     });
    box.append(el('small','Опора '+current.height+' мм · цоколь с кромкой '+plinthPanel(this.fields).height+' мм · зазор сверху '+plinthClearanceMm+' мм · ПВХ по четырём торцам · '+current.screws+' самореза на опору'));
 }
 decorChoices(group,models,selected,refresh){
  const choose=(leg,focus)=>{
   const old=selected?.category==='decor'?this.fields.feet:null;
   this.fields.feet={article:leg.article,front:old?.front??10,rear:old?.rear??10};
   this.footGroup='decor';this.invalidate();refresh(focus);
  };
  for(const family of new Set(models.map(f=>f.name))){
   const variants=models.filter(f=>f.name===family);
   const active=selected?.name===family?selected:null;
   const shown=active??variants.find(f=>!f.issue)??variants[0];
   const section=el('div');section.className='decor-family';
   const focus='[data-series="'+family+'"]';
   const card=button('',()=>choose(shown,focus));card.dataset.series=family;card.className='foot-row';
   card.setAttribute('aria-pressed',String(!!active));
   const photo=fittingImage(shown.article,family+' · '+shown.finish);
   const text=el('span');text.append(el('strong',family));
   const heights=[...new Set(variants.map(f=>f.height))].sort((a,b)=>a-b);
   text.append(el('small',shown.issue?'Проверяется высота фрагмента':active?active.height+' мм · '+active.finish+' · арт. '+active.article:heights.join(' / ')+' мм'));
   if(shown.article==='85881')text.append(el('small','На фото HELLY 130 мм · арт. 112445. Выбрана опора 150 мм · арт. 85881.'));
   card.append(photo,text);section.append(card);group.append(section);
   if(shown.issue){card.dataset.unavailable='true';card.disabled=true;continue;}
   if(!active)continue;
   if(heights.length>1)this.select(section,'Высота '+family+', мм',heights.map(h=>[h,h+' мм']),active.height,value=>{
    const candidates=variants.filter(f=>!f.issue&&f.height===Number(value));
    choose(candidates.find(f=>f.finish===active.finish)??candidates[0],'.decor-family select');
   });
   const finishes=el('div');finishes.className='decor-finishes';finishes.setAttribute('aria-label','Цвет '+family);
   for(const variant of variants.filter(f=>f.height===active.height)){
    const b=button('',()=>choose(variant,'[data-finish="'+variant.article+'"]'));
    b.dataset.finish=variant.article;b.setAttribute('aria-pressed',String(variant===active));
    const chip=el('i');chip.style.background=({'брашированное золото':'#b79a60','матовый хром':'#bdc2c4','чёрный хром':'#55595d','чёрный муар':'#383837'})[variant.finish]??'#292a29';
    b.append(chip,document.createTextNode(variant.finish+(variant.issue?' · проверяется артикул':'')));
    if(variant.issue){b.dataset.unavailable='true';b.disabled=true;}
    finishes.append(b);
   }
   section.append(finishes);
  }
 }
 sectionPositions(){
  const f=this.fields;
  if(f.sections>1)this.select(this.form,'Положение внутренних стоек',[['center','Равные секции'],['manual','Вручную, мм']],f.dividerPositions?'manual':'center',mode=>{
   if(mode==='manual'){
    let start=0;
    f.dividerPositions=sectionWidths(f).slice(0,-1).map(width=>{const end=start+width;start=end+f.thickness;return end;});
   }else delete f.dividerPositions;
   this.changed();this.render();
  });
  const sizes=el('p');
  const update=()=>{if(f.dividerPositions?.some(n=>!Number.isInteger(n))){sizes.textContent='';return;}const widths=sectionWidths(f);sizes.textContent=widths.every(n=>Number.isInteger(n)&&n>0)?'Чистая ширина секций слева направо: '+widths.join(' / ')+' мм.':'';};
  if(f.dividerPositions){
   this.form.append(el('p','От внутренней плоскости левой боковины до левой плоскости каждой стойки.'));
   f.dividerPositions.forEach((position,i)=>{
    const label='Положение стойки '+(i+1)+', мм',wrap=el('label',label),input=el('input');
    input.type='number';input.step='1';input.min='0';input.max=String(f.width-2*f.thickness);
    input.setAttribute('aria-label',label);input.value=Number.isFinite(position)?position:'';
    input.onfocus=()=>{this.activeSection=i;this.form.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.section)===i)));this.draw();};
    input.oninput=()=>{f.dividerPositions[i]=input.valueAsNumber;update();this.changed();};
    wrap.append(input);this.form.append(wrap);
   });
  }
  update();this.form.append(sizes);
 }
 jointQuestionnaire(){
  const box=el('fieldset');box.append(el('legend','Крепёж корпуса'));this.form.append(box);
  if(this.fields.thickness!==18){box.append(el('p','Эти схемы доступны для плиты 18 мм.'));return;}
  const current=this.fields.joints??{top:'none',bottom:'none'};
  for(const [key,label] of [['top','Крыша'],['bottom','Дно']]){
   const value=current[key];
   this.select(box,label+' · крепёж',Object.entries(jointOptions).map(([code,text])=>[code,text,code==='cam_dowel'&&this.fields.depth<276]),value,v=>{
    this.fields.joints={...current,[key]:v};this.changed();this.render();
   });
   if(value==='none')continue;
   box.append(jointPhotos(value));
   const ns='http://www.w3.org/2000/svg',diagram=document.createElementNS(ns,'svg');
   diagram.setAttribute('class','joint-layout');diagram.setAttribute('viewBox','0 0 500 28');diagram.setAttribute('aria-hidden','true');
   const cam=value==='cam_dowel',inset=cam?100:70,depth=this.fields.depth;
   const positions=cam?[inset,inset+32,depth-inset-32,depth-inset]:[inset,depth-inset];
   for(const [i,z] of positions.entries()){
    const isDowel=cam&&(i===1||i===2);
    const x=500*z/depth,dot=document.createElementNS(ns,'circle');
    dot.setAttribute('cx',x);dot.setAttribute('cy','14');dot.setAttribute('r',isDowel?'3.5':'5.5');
    dot.setAttribute('fill',isDowel?'#a57440':'#315e4d');diagram.append(dot);
   }
   box.append(diagram,el('small',jointQuantity(value)),el('small','Оси от переднего края, мм: '+positions.join(' · ')));
  }
  for(const [i,settings] of (this.fields.dividerJoints??[]).entries()){
   const group=el('fieldset'),number=i+1;
   group.append(el('legend','Внутренняя стойка '+number+' · между секциями '+number+' и '+(number+1)));
   for(const [end,direction] of [['top','сверху'],['bottom','снизу']]){
    const options=Object.entries(jointOptions).map(([code,text])=>[code,text,code==='cam_dowel'&&this.fields.depth-1-(this.fields.backThickness??0)<216]);
    this.select(group,'Стойка '+number+' · крепление '+direction,options,settings[end],value=>{
     settings[end]=value;this.changed();this.render();
    });
    if(settings[end]&&settings[end]!=='none')group.append(jointPhotos(settings[end]));
   }
   this.form.append(group);
  }
 }
 materialPicker(role,title,thickness){
  const card=el('fieldset');const activate=()=>{const view={body:'body',back:'back',front:'fronts',drawer:'sections'}[role];if(this.view!==view){this.view=view;this.draw();}};
  card.addEventListener('focusin',activate);card.addEventListener('click',activate);card.append(el('legend',title));const m=this.materials[role];card.append(el('p',m?m.name+' · '+m.thickness+' мм':'Материал не выбран'));
  const label=el('label','Поиск: '+title),input=el('input');input.type='search';input.placeholder='Название или артикул';input.setAttribute('aria-label','Поиск: '+title);label.append(input);card.append(label);
  const results=el('div');results.className='assistant-material-results';
  const search=button('Найти материал',async()=>{const epoch=this.epoch,serial=++this.serial[role];search.disabled=true;results.textContent='Поиск…';
   try{const r=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(input.value.trim())+'&thickness='+thickness+'&limit=100');if(this.disposed||epoch!==this.epoch||serial!==this.serial[role]||this.step!==4)return;
    const matches=r.items.filter(x=>Number(x.thickness)===thickness).slice(0,12);results.replaceChildren();
    for(const material of matches)results.append(button(material.name+' · '+material.thickness+' мм',()=>{this.serial[role]++;this.materials[role]=material;this.materialChanged[role]=true;this.app.bridge.cacheMaterial(material);this.changed();this.render();}));
    if(!matches.length)results.textContent='Нет подходящего материала '+thickness+' мм. Уточните название или артикул.';
   }catch{results.textContent='Поиск не выполнен. Попробуйте ещё раз.';}finally{search.disabled=false;}
  });input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search.click();}};card.append(search,results);this.form.append(card);
 }
 draw(){
  this.figureTitle.textContent=drawingTitles[this.view];
  const warning=this.form.querySelector('.front-choice-warning');
  if(warning)warning.hidden=true;
  try{
   const options={idPrefix:'questionnaire-preview'};
   let built,issue='';
   try{built=buildCarcass(this.spec(),options);}
   catch(error){
    if(this.view!=='fronts'||!this.fields.front)throw error;
    built=buildCarcass(wardrobeSpec({...this.fields,front:null}),options);
    issue=error.message;
   }
   this.previewBuilt=built;
   const {svg,caption}=wardrobeDrawing(built,this.view,this.activeSection,this.fields.front,this.step===2?(this.levelIndex??0):null);
   this.drawing.innerHTML=svg;
   this.dimensions.textContent='Ш '+built.width+' · В '+(built.height+footHeight(built.spec))+' · Г '+(built.depth+(issue?18:0))+' мм';
   this.description.textContent=caption;
   if(issue&&warning){warning.textContent=issue;warning.hidden=false;}
   else if(issue)this.description.textContent=issue;
  }catch(e){
   this.previewBuilt=null;
   if(this.drawing.querySelector('svg')?.dataset.view!==this.view)this.drawing.replaceChildren();
   this.dimensions.textContent='Проверьте параметры';this.description.textContent=e.message;
  }
 }
 controls(){
  this.previous.hidden=this.step===0;this.next.hidden=this.step===4;this.send.hidden=this.step!==4||Boolean(this.pending);this.send.disabled=this.busy||!this.available||this.remainingCount<=0;
  this.next.disabled=this.busy;this.previous.disabled=this.busy;this.mode.disabled=this.busy;this.steps.forEach(b=>b.disabled=this.busy);
  this.form.querySelectorAll('input,select,button').forEach(b=>b.disabled=this.busy||b.dataset.unavailable==='true');
  this.apply.hidden=!this.pending;this.apply.textContent=this.mode.value==='update'?'Применить изменения':'Добавить в проект';
  this.remaining.textContent='Проверка ИИ запускается только по кнопке. Пробных обращений на сайте осталось: '+this.remainingCount+'.';
 }
 materialOptions(){
  const options={frontMaterialId:this.materials.front?.variant_id,resetSideEdges:this.resetSideEdges,defaultMaterial:this.materials.body?.variant_id||null};
  if(this.mode.value==='create'||this.materialChanged.body)options.bodyMaterialId=this.materials.body?.variant_id||null;
  if(this.fields.thickness!==18&&(this.mode.value==='create'||this.materialChanged.drawer))options.drawerMaterialId=this.materials.drawer?.variant_id;
  if(this.mode.value==='create'||this.materialChanged.back)options.backMaterialId=this.materials.back?.variant_id||null;return options;
 }
 async ask(){
  if(this.busy||!this.available||this.remainingCount<=0)return;const error=this.error(4);if(error){this.output.textContent=error;return;}
  if(!this.app.interaction.editable()){this.output.textContent='Сначала задайте размеры помещения.';return;}
  this.invalidate();const epoch=this.epoch,stamp=assistantStamp(this.app.adapter);
  try{
   const spec=this.spec(),action=this.mode.value,options=this.materialOptions();
   const pending=prepareAssistantPlan(this.app.adapter,{action,spec},options);
   this.busy=true;this.controls();this.output.textContent='Проверяю выбранные параметры…';
   const response=await this.app.bridge.request('/3d-assistant/questionnaire','POST',{request_id:crypto.randomUUID(),action,spec,fronts:spec.front?'overlay':'none',...(spec.front||spec.drawerBanks?.some(Boolean)?{front_material_id:this.materials.front.variant_id}:{}),body_material_id:this.materials.body.variant_id,...(spec.drawerBanks?.some(Boolean)&&spec.thickness!==18?{drawer_material_id:this.materials.drawer.variant_id}:{}),back_material_id:spec.back?this.materials.back.variant_id:null,room_height:this.app.adapter.room.height});
   if(this.disposed||epoch!==this.epoch)return;if(response.remaining!=null)this.remainingCount=response.remaining;
   if(response.state!=='ready')throw Error(response.message||'Проверка пока не завершена.');
   if(assistantStamp(this.app.adapter)!==stamp)throw Error('Проект изменился. Проверьте анкету заново.');
   if(response.plan.action==='clarify'){this.output.textContent=response.plan.message;return;}
   if(response.plan.action!==action||Object.keys(spec).some(k=>!sameAssistantSpec(spec[k],response.plan.spec?.[k])))throw Error('Ответ не соответствует анкете. Проект не изменён.');
   this.output.textContent=action==='create'?'Проверьте состав нового шкафа и добавьте его в проект.':'Проверьте изменения выбранного шкафа.';
   this.pending=pending;this.summary.replaceChildren(...pending.summary.map(s=>el('li',s)),el('li','Корпус: '+this.materials.body.name));this.summary.hidden=false;
  }catch(e){if(!this.disposed&&epoch===this.epoch)this.output.textContent=e.message;}
  finally{if(!this.disposed&&epoch===this.epoch){this.busy=false;this.controls();}}
 }
 commit(){
  if(!this.pending)return;const ok=this.app.interaction.change('Шкаф по анкете',()=>applyAssistantPlan(this.app.adapter,this.pending));
  if(ok){this.pending=null;this.dialog.close();this.app.scene.fit('kitchen');this.app.adapter.status('Шкаф собран по анкете. Действие можно отменить одним шагом.');}
  else{this.invalidate();this.controls();this.output.textContent='Не удалось применить. Проверьте сообщение конструктора и повторите проверку анкеты.';}
 }
 dispose(){this.disposed=true;this.unsubscribe?.();this.button?.remove();this.dialog?.remove();this.style?.remove();}
}
