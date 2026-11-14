import {selectedCarcass,assistantStamp,prepareAssistantPlan,applyAssistantPlan} from './assistant-model.mjs';
import {buildCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {shelfQuestionnaire} from './shelf-questionnaire.mjs';
import {shelfRows,choice,defaultShelf} from './shelf-choices.mjs';
import {carcassSVG} from './carcass-ui.mjs';
import {WARDROBE_STEPS,wardrobeSpec,sectionWidths,questionnaireMaterialError} from './wardrobe-questionnaire.mjs';
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
export class AssistantUI{
 constructor(app){this.app=app;this.disposed=false;this.materials={};this.serial={body:0,back:0};this.start().catch(()=>{});}
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
  const aside=el('aside');aside.className='assistant-drawing';this.drawing=el('div');this.dimensions=el('p');this.description=el('p');aside.append(this.drawing,this.dimensions,this.description);grid.append(this.form,aside);
  this.output=el('p');this.output.setAttribute('role','status');this.output.setAttribute('aria-live','polite');this.summary=el('ul');this.summary.hidden=true;
  const footer=el('div');footer.className='assistant-footer';this.previous=button('Назад',()=>this.go(this.step-1));this.next=button('Далее',()=>this.go(this.step+1));
  this.send=button('Проверить и собрать с ИИ',()=>this.ask());this.send.className='assistant-primary';this.apply=button('Добавить в проект',()=>this.commit());this.apply.className='assistant-primary';this.apply.hidden=true;
  footer.append(this.previous,this.next,this.send,this.apply);this.remaining=el('p');this.remaining.className='assistant-hint';
  this.dialog.append(head,el('p','Заполните пять шагов. Размеры и материалы сохраняются точно по анкете.'),this.mode,this.nav,grid,this.output,this.summary,footer,this.remaining);document.body.append(this.dialog);
  this.unsubscribe=this.app.bridge.subscribe(reason=>{if(reason==='before-project'||reason==='project'){this.epoch=(this.epoch||0)+1;this.pending=null;this.dialog.close();}});
 }
 open(){
  if(this.app.workspace?.isClient())this.app.workspace.client();this.current=null;
  try{const c=selectedCarcass(this.app.adapter);if(c&&['shelves','divided'].includes(c.metadata.spec.recipe))this.current=c;}catch{}
  this.mode.replaceChildren();for(const [value,text]of [['create','Новый шкаф'],...(this.current?[['update','Изменить выбранный шкаф']]:[])]){const o=el('option',text);o.value=value;this.mode.append(o);}
  this.mode.value=this.current?'update':'create';this.reset();this.dialog.showModal();this.steps[0].focus();
 }
 reset(){
  this.epoch=(this.epoch||0)+1;this.serial.body++;this.serial.back++;
  const c=this.mode.value==='update'?this.current:null,s=c?.metadata.spec;
  this.fields=s?{...structuredClone(s),sectionShelves:s.sectionShelves??Array(s.sections).fill(s.shelves)}:{width:800,height:2200,depth:577,thickness:18,sections:1,sectionShelves:[4],back:true};
  this.shelfScopes={};this.shelfDrafts={};
  this.materials={};this.materialChanged={body:false,back:false};this.step=0;this.pending=null;this.busy=false;this.summary.hidden=true;
  this.output.textContent=this.available?'':'Помощник временно недоступен. Можно заполнить анкету и посмотреть схему.';this.render();
  this.loadMaterial('body',c?.items.find(i=>i.item_id.endsWith(':left'))?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id);
  this.loadMaterial('back',c?.items.find(i=>i.item_id.endsWith(':back'))?.body_variant_id||CARCASS_BACK_MATERIAL_ID);
 }
 async loadMaterial(role,id){
  if(!id)return;const epoch=this.epoch,serial=++this.serial[role];
  try{const m=this.app.bridge.material(id)||await this.app.bridge.request('/catalogue/materials/'+encodeURIComponent(id));
   if(this.disposed||epoch!==this.epoch||serial!==this.serial[role])return;
   this.app.bridge.cacheMaterial(m);this.materials[role]=m;if(this.step===4)this.render();
  }catch{if(epoch===this.epoch&&serial===this.serial[role]&&this.step===4)this.render();}
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
  try{const s=this.spec();if(s.height+s.elevation>this.app.adapter.room.height)throw Error('Шкаф выше помещения. Уменьшите высоту.');
   if(step>=4)for(const role of ['body',...(s.back?['back']:[])]){const e=questionnaireMaterialError(this.materials[role],role==='back'?3:s.thickness);if(e)throw Error((role==='back'?'Задняя стенка: ':'Корпус: ')+e);}
   return '';
  }catch(e){return e.message;}
 }
 go(index){if(this.busy||index<0||index>4)return;if(index>this.step){const e=this.error();if(e){this.output.textContent=e;return;}}this.step=index;this.render();this.steps[index].focus();}
 render(){
  this.form.replaceChildren();this.steps.forEach((b,i)=>{b.setAttribute('aria-current',i===this.step?'step':'false');b.disabled=this.busy;});this.form.append(el('h3',WARDROBE_STEPS[this.step]));
  if(this.step===0){
   this.number('width','Ширина, мм',200,2400);this.number('height','Высота корпуса, мм',200,3000);this.number('depth','Глубина ЛДСП, мм',200,1200);
   this.select(this.form,'Толщина корпуса, мм',[...new Set([16,18,25,this.fields.thickness])].map(n=>[n,n+' мм']),this.fields.thickness,v=>{this.fields.thickness=Number(v);this.fields.shelfChoices=shelfRows(this.fields).map(row=>row.map(value=>{try{choice(value,Number(v));return value;}catch{return defaultShelf;}}));this.shelfDrafts={};this.serial.body++;this.materials.body=null;this.materialChanged.body=true;this.changed();});
   this.select(this.form,'Задняя стенка',[['yes','Накладная ХДФ 3 мм'],['no','Без задней стенки']],this.fields.back?'yes':'no',v=>{this.fields.back=v==='yes';this.changed();});
   this.form.append(el('p','Высота без ножек и цоколя. Задняя стенка добавляет 3 мм к глубине.'));
  }else if(this.step===1){
   const choices=el('div');choices.className='assistant-cards';
   for(const n of [1,2,3]){const b=button('',()=>{this.shelfScopes={};this.shelfDrafts={};this.fields.sections=n;this.fields.sectionShelves=Array.from({length:n},(_,i)=>this.fields.sectionShelves[i]??4);this.fields.shelfChoices=shelfRows(this.fields);this.changed();this.render();});
    const pict=el('span');pict.className='assistant-section-icon';for(let i=0;i<n;i++)pict.append(el('i'));b.append(pict,el('strong',n===1?'Одна секция':n===2?'Две секции':'Три секции'));b.setAttribute('aria-pressed',String(this.fields.sections===n));choices.append(b);}
   this.form.append(choices,el('p','Секции равной ширины, с общими перегородками.'));try{this.form.append(el('p','Внутренняя ширина: '+sectionWidths(this.spec()).join(' / ')+' мм.'));}catch{}
  }else if(this.step===2){
   this.fields.sectionShelves.forEach((count,i)=>{const group=el('fieldset');group.append(el('legend','Секция '+(i+1)));
    this.select(group,'Наполнение секции '+(i+1),[['shelves','Полки'],['empty','Пустая ниша'],['drawers','Ящики — комплект для шкафа ещё не подключён',true],['rod','Штанга — заготовка ещё не подключена',true]],count?'shelves':'empty',v=>{this.fields.sectionShelves[i]=v==='empty'?0:4;this.fields.shelfChoices=shelfRows(this.fields);delete this.shelfScopes[i];delete this.shelfDrafts[i];this.changed();this.render();});
    if(count)this.select(group,'Полок в секции '+(i+1),Array.from({length:10},(_,n)=>[n+1,String(n+1)]),count,v=>{this.fields.sectionShelves[i]=Number(v);this.fields.shelfChoices=shelfRows(this.fields);delete this.shelfScopes[i];delete this.shelfDrafts[i];this.changed();this.render();});if(count)shelfQuestionnaire(this,group,i);this.form.append(group);
   });this.form.append(el('p','Полки пронумерованы снизу вверх. Базовый зазор по бокам — '+(this.fields.shelfGap??0)+' мм.'));
  }else if(this.step===3){
   const card=el('div');card.className='assistant-choice';card.append(el('strong','Открытый шкаф'),el('p','Без фасадов. Наполнение видно и доступно.'));this.form.append(card);
   const unavailable=el('div');unavailable.className='assistant-unavailable';unavailable.append(el('strong','Распашные и раздвижные фасады'),el('p','Для этой сборки пока не подключены подходящие заготовки фасадов с петлями и ручками. Сейчас можно собрать открытый шкаф.'));this.form.append(unavailable);
  }else{
   this.materialPicker('body','Материал корпуса',Number(this.fields.thickness));if(this.fields.back)this.materialPicker('back','Задняя стенка',3);
   this.form.append(el('p','Материалы из вашего каталога. Толщина должна совпадать с деталями. Ручные назначения отдельных деталей сохранятся, если здесь не выбирать другой материал.'));
  }this.draw();this.controls();
 }
 materialPicker(role,title,thickness){
  const card=el('fieldset');card.append(el('legend',title));const m=this.materials[role];card.append(el('p',m?m.name+' · '+m.thickness+' мм':'Материал не выбран'));
  const label=el('label','Поиск: '+title),input=el('input');input.type='search';input.placeholder='Название или артикул';input.setAttribute('aria-label','Поиск: '+title);label.append(input);card.append(label);
  const results=el('div');results.className='assistant-material-results';
  const search=button('Найти материал',async()=>{const epoch=this.epoch,serial=++this.serial[role];search.disabled=true;results.textContent='Поиск…';
   try{const r=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(input.value.trim())+'&limit=100');if(this.disposed||epoch!==this.epoch||serial!==this.serial[role]||this.step!==4)return;
    const matches=r.items.filter(x=>Number(x.thickness)===thickness).slice(0,12);results.replaceChildren();
    for(const material of matches)results.append(button(material.name+' · '+material.thickness+' мм',()=>{this.serial[role]++;this.materials[role]=material;this.materialChanged[role]=true;this.app.bridge.cacheMaterial(material);this.changed();this.render();}));
    if(!matches.length)results.textContent='Нет подходящего материала '+thickness+' мм. Уточните название или артикул.';
   }catch{results.textContent='Поиск не выполнен. Попробуйте ещё раз.';}finally{search.disabled=false;}
  });input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search.click();}};card.append(search,results);this.form.append(card);
 }
 draw(){
  try{const built=buildCarcass(this.spec(),{idPrefix:'questionnaire-preview'});this.drawing.innerHTML=carcassSVG(built);this.dimensions.textContent=built.spec.width+' × '+built.spec.height+' × '+built.depth+' мм';this.description.textContent=built.items.length+' деталей · '+built.spec.sectionShelves.reduce((a,b)=>a+b,0)+' полок · '+(built.spec.back?'с ХДФ':'без задней стенки');}
  catch(e){this.drawing.replaceChildren();this.dimensions.textContent='Проверьте размеры';this.description.textContent=e.message;}
 }
 controls(){
  this.previous.hidden=this.step===0;this.next.hidden=this.step===4;this.send.hidden=this.step!==4||Boolean(this.pending);this.send.disabled=this.busy||!this.available||this.remainingCount<=0;
  this.next.disabled=this.busy;this.previous.disabled=this.busy;this.mode.disabled=this.busy;this.steps.forEach(b=>b.disabled=this.busy);
  this.form.querySelectorAll('input,select,button').forEach(b=>b.disabled=this.busy);
  this.apply.hidden=!this.pending;this.apply.textContent=this.mode.value==='update'?'Применить изменения':'Добавить в проект';
  this.remaining.textContent='Проверка ИИ запускается только по кнопке. Пробных обращений на сайте осталось: '+this.remainingCount+'.';
 }
 materialOptions(){
  const options={defaultMaterial:this.materials.body?.variant_id||null};
  if(this.mode.value==='create'||this.materialChanged.body)options.bodyMaterialId=this.materials.body?.variant_id||null;
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
   const response=await this.app.bridge.request('/3d-assistant/questionnaire','POST',{request_id:crypto.randomUUID(),action,spec,fronts:'none',body_material_id:this.materials.body.variant_id,back_material_id:spec.back?this.materials.back.variant_id:null,room_height:this.app.adapter.room.height});
   if(this.disposed||epoch!==this.epoch)return;if(response.remaining!=null)this.remainingCount=response.remaining;
   if(response.state!=='ready')throw Error(response.message||'Проверка пока не завершена.');
   if(assistantStamp(this.app.adapter)!==stamp)throw Error('Проект изменился. Проверьте анкету заново.');
   if(response.plan.action==='clarify'){this.output.textContent=response.plan.message;return;}
   if(response.plan.action!==action||Object.keys(spec).some(k=>JSON.stringify(spec[k])!==JSON.stringify(response.plan.spec?.[k])))throw Error('Ответ не соответствует анкете. Проект не изменён.');
   this.output.textContent='Параметры совместимы. Проверьте состав шкафа и добавьте его в проект.';
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
