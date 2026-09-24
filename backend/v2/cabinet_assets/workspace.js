'use strict';
// Presentation adapters only. Prices, catalogue identity, validation and gates remain server-owned.
const workspaceErrors={PERMISSION_DENIED:'Недостаточно прав для этого действия.',AUTH_REQUIRED:'Войдите в кабинет. Несохранённые поля остаются на странице.',BAZIS_RUN_REQUIRED:'Итоговый расчёт ещё не подтверждён производством.',BAZIS_CALIBRATION_REQUIRED:'Производственная проверка пока недоступна.',APPROVED_FINAL_REQUIRED:'Нужен согласованный итоговый расчёт.',DRAFT_REQUIRED:'Редактирование этого черновика уже закрыто.',PARENT_REVISION_CONFLICT:'Редакция изменилась. Откройте актуальную версию; ваши поля не сброшены.',EXACT_RELEASED_ITEM_REQUIRED:'Выберите точный материал из закреплённого каталога.',CATALOGUE_NOT_PUBLISHED:'Каталог пока не опубликован. Попробуйте позже.',TEMPLATE_OR_SHEET_MISMATCH:'Лист или заголовки не совпали с шаблоном. Проверьте настройки импорта.',INVALID_OR_UNSAFE_XLSX:'Не удалось прочитать XLSX. Проверьте формат файла.',STAFF_NOT_FOUND:'Сотрудник не найден.',SUBMITTED_REQUIRED:'В проверку можно взять только отправленный заказ.'};
let registrationMode=location.pathname.startsWith('/register');
function authMode(){$('auth-submit').textContent=registrationMode?'Создать аккаунт':'Войти';$('form-title').textContent=registrationMode?'Регистрация':'Войти в кабинет';$('register').textContent=registrationMode?'У меня есть аккаунт':'Зарегистрироваться';$('password').autocomplete=registrationMode?'new-password':'current-password';$('password').minLength=registrationMode?12:1;}
function link(text,href,cls){const a=node('a',text,cls);a.href=href;return a;}
function field(label,name,type='text',val='',required=false){const l=node('label',label),i=node(type==='textarea'?'textarea':'input');i.name=name;i.id='f-'+crypto.randomUUID();l.htmlFor=i.id;if(type!=='textarea')i.type=type;i.value=val??'';i.required=required;i.maxLength=type==='textarea'?4000:200;l.append(i);return [l,i];}
function selectField(label,name,options,val){const l=node('label',label),s=node('select');s.name=name;s.setAttribute('aria-label',label);s.id='s-'+crypto.randomUUID();l.htmlFor=s.id;for(const [v,t]of options){const o=node('option',t);o.value=v;s.append(o);}if(val!==undefined)s.value=val;l.append(s);return[l,s];}
function heading(text,note){content.replaceChildren(node('p','Martin Forest / Рабочее пространство','eyebrow'),node('h1',text));if(note)content.append(node('p',note,'muted'));document.title=text+' | Martin Forest';}
function confirmAction(title,description){return new Promise(resolve=>{const d=node('dialog'),h=node('h2',title),p=node('p',description),actions=node('div',undefined,'actions');const yes=node('button','Подтвердить'),no=node('button','Отмена','secondary');actions.append(no,yes);d.append(h,p,actions);d.setAttribute('aria-label',title);let done=false;function close(v){if(done)return;done=true;d.close();d.remove();resolve(v);}yes.onclick=()=>close(true);no.onclick=()=>close(false);d.oncancel=e=>{e.preventDefault();close(false);};document.body.append(d);d.showModal();no.focus();});}
async function workspaceStart(){
 const path=location.pathname;
 if(path==='/constructor.html'){heading('3D-конструктор','Отдельный рабочий инструмент');content.append(node('p','В этой версии кабинета подключение проектов и подписки 3D ещё не завершено. Доступ к рабочему инструменту временно закрыт.','notice'),link('Подготовить деталировку','/order/','button'));return;}
 if(path==='/staff'||path==='/admin.html'){await staffHome();return;}
 if(path==='/editor'||path==='/order.html'){await editorStart();return;}
 if(!currentUser.roles.includes('client')){await staffHome();return;}
 if(location.hash&&/^[0-9a-f-]{36}$/.test(location.hash.slice(1)))await detail(location.hash.slice(1));else await list();
}
const statusLabels={draft:'Черновик',submitted:'Передан на обработку',review:'На проверке',awaiting_approval:'Ожидает согласования',approved:'Согласован',production:'В производстве',completed:'Завершён',cancelled:'Отменён'};
let editorOrder=null,manualRows=[],catalogueRelease=null,dirty=false,importId=null,activeRow=null,revisionComment="";
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
async function editorStart(){
 const id=new URLSearchParams(location.search).get('order');
 if(id){await openEditor(id);return;}
 heading('Новая заявка');
 const form=node('form',undefined,'panel'),[l,n]=field('Название заказа','business_name','text','',true);
 const paths=node('div',undefined,'preparation-paths');
 form.append(l,paths);
 for(const [mode,title,note]of [['self_prepared','Заполнить деталировку','Ввести детали или загрузить Excel, посмотреть расчёт и скачать PDF.'],['manager_assisted','Передать менеджеру','Прикрепить Excel. Менеджер подготовит деталировку и расчёт.']]){
  const box=node('div',undefined,'preparation-path');
  box.append(node('h2',title),node('p',note),button(title,async()=>{
   if(!form.reportValidity())return;
   const o=await api('/orders','POST',{business_name:n.value,preparation_mode:mode});
   history.replaceState(null,'','/editor?order='+encodeURIComponent(o.order_id));await openEditor(o.order_id);
  }));paths.append(box);
 }
 form.onsubmit=e=>e.preventDefault();content.append(form);
}
let catalogueMaterials=[],catalogueEdges=[],managerEditing=false;
const sideNames=['L1','L2','W1','W2'];
const grainNames={unknown:'Уточнить текстуру',length:'По длине',width:'По ширине',none:'Без текстуры'};
function blankDetail(){return {detail_id:crypto.randomUUID(),name:'',comments:'',length:'',width:'',qty:1,variant_id:null,materialLabel:'Материал не выбран',supply_source:'company',rotation:false,grain:'unknown',route:'solid',packaging:false,edges:{}};}
function materialLabel(m){return m?[m.manufacturer,m.raw_description||m.name,m.article,m.structure,m.thickness?m.thickness+' мм':'',m.length&&m.width?m.length+' × '+m.width+' мм':''].filter(Boolean).join(' · '):'Материал не выбран';}
function edgeLabel(e){return e?[e.article,e.name,e.width&&e.thickness?e.width+' × '+e.thickness+' мм':''].filter(Boolean).join(' · '):'Без кромки';}
function fromRevision(d){return {...blankDetail(),detail_id:d.detail_id,name:d.name||'',comments:d.comments||'',...(d.draft_row_id?{draft_row_id:d.draft_row_id,resolution_reason:d.resolution_reason||'Подтверждение деталировки в таблице'}:{}),length:d.length,width:d.width,qty:d.qty,variant_id:d.material?.variant_id||null,materialLabel:materialLabel(d.material),custom_customer:d.customer_material_key?{key:d.customer_material_key,article:d.material.article||'',manufacturer:d.material.manufacturer||'',name:d.material.name,thickness:d.material.thickness,length:d.material.length,width:d.material.width,reason:d.material.reason}:null,supply_source:d.supply_source,provided_sheets:d.provided_sheets,customer_reason:d.customer_reason,rotation:d.rotation,grain:d.grain,route:d.route,packaging:d.packaging,edges:Object.fromEntries(sideNames.map(s=>[s,{edge_id:d.edges[s]?.edge?.edge_id||null,supply_source:d.edges[s]?.supply_source||'company',unresolved:d.edges[s]?.state==='unresolved',selection_mode:d.edges[s]?.selection_mode||'manual'}]))};}
function fromImported(r){
 const s=r.snapshot,v=s.values||{},custom=s.resolution?.status==='custom_customer'?s.resolution.customer_material:null,m=custom||s.resolution?.selected;
 const customer=custom?{variant_id:null,custom_customer:{key:custom.key||r.draft_row_id,name:custom.name,article:custom.article||'',manufacturer:custom.manufacturer||'',thickness:custom.thickness,length:custom.length,width:custom.width,reason:custom.reason||s.resolution.reason},supply_source:'customer',provided_sheets:custom.provided_sheets,customer_reason:custom.reason||s.resolution.reason}:{};
 return {...blankDetail(),detail_id:r.draft_row_id,draft_row_id:r.draft_row_id,resolution_reason:'Подтверждение импортированной строки в таблице',name:String(v.name||''),comments:String(v.comments||''),length:v.length??'',width:v.width??'',qty:v.qty??'',variant_id:m?.variant_id||null,materialLabel:materialLabel(m),grain:grainNames[v.texture]?v.texture:'unknown',rotation:v.rotation===true,...customer,
  edges:Object.fromEntries(sideNames.map(side=>{const e=s.edges?.[side]||{};return [side,{edge_id:e.edge_id||null,supply_source:'company',unresolved:e.mark!=='none'&&!e.confirmed&&e.mode!=='manual_override',selection_mode:e.selection_mode||'manual'}];})),_source:'Excel: '+s.sheet+', строка '+s.row,_errors:(s.errors||[]).filter(e=>!sideNames.includes(e.field)||!s.edges?.[e.field]?.confirmed),_materialSource:String(v.article||v.material||'Материал не указан')};
}
async function loadCatalogue(){
 catalogueMaterials=[];catalogueEdges=[];
 for(const [kind,target]of [['materials',catalogueMaterials],['edges',catalogueEdges]]){
  let offset=0;while(true){const r=await api('/catalogue/'+kind+'?limit=250&offset='+offset+(catalogueRelease?'&release='+encodeURIComponent(catalogueRelease):''));catalogueRelease=catalogueRelease||r.catalogue_release;target.push(...r.items);offset+=r.items.length;if(offset>=r.total||!r.items.length)break;}
 }
}
async function openEditor(id){
 editorOrder=await api('/orders/'+encodeURIComponent(id));
 if(!currentUser.roles.some(r=>['client','manager','admin'].includes(r))){heading('Доступ ограничен');return;}
 manualRows=[];catalogueRelease=null;revisionComment='';dirty=false;managerEditing=false;
 if(editorOrder.active_revision_id){const r=await api('/orders/'+id+'/revisions/'+editorOrder.active_revision_id);catalogueRelease=r.catalogue_release_id;manualRows=r.details.map(fromRevision);}
 const draft=await api('/orders/'+id+'/draft/rows');editorOrder.optimistic_lock_version=draft.optimistic_lock_version;
 for(const r of draft.rows){if(!r.excluded_reason&&!manualRows.some(d=>d.draft_row_id===r.draft_row_id))manualRows.push(fromImported(r));}
 if(editorOrder.preparation_mode==='self_prepared'||!currentUser.roles.includes('client')){
  try{await loadCatalogue();}catch(e){if(e.code!=='CATALOGUE_NOT_PUBLISHED')throw e;catalogueMaterials=[];catalogueEdges=[];}
  if(!manualRows.length)manualRows.push(blankDetail());
 }
 await editorView();
}
async function sourceList(parent){
 const sources=await api('/orders/'+editorOrder.order_id+'/sources');
 if(sources.items.length){const list=node('ul');for(const f of sources.items){const li=node('li');li.append(link(f.name,f.download_url));list.append(li);}parent.append(list);}
 return sources.items;
}
async function managerPreparation(){
 const form=node('form',undefined,'panel'),[fl,file]=field('Прикрепить Excel','source','file');file.accept='.xlsx,.xls';
 const [cl,comment]=field('Комментарий менеджеру (необязательно)','comment','textarea');comment.maxLength=2000;
 form.append(node('p','Прикрепите файл с деталировкой. Менеджер проверит материалы и подготовит предварительный расчёт.'),fl,cl);
 const sources=await sourceList(form),send=node('button','Передать менеджеру');form.append(send);content.append(form);
 let uploaded=sources.length>0;const key=crypto.randomUUID();
 form.onsubmit=e=>{e.preventDefault();run(async()=>{
  if(file.files[0]){await api('/orders/'+editorOrder.order_id+'/source','POST',await filePayload(file.files[0]));uploaded=true;file.value='';}
  if(!uploaded)throw new Error('Прикрепите Excel с деталировкой.');
  const fresh=await api('/orders/'+editorOrder.order_id);
  await api('/orders/'+editorOrder.order_id+'/submit','POST',{comment:comment.value.trim()||'Прошу менеджера подготовить деталировку и предварительный расчёт по приложенному Excel.'},{'If-Match':String(fresh.optimistic_lock_version),'Idempotency-Key':key});
  dirty=false;await openEditor(editorOrder.order_id);message('Заявка и исходный Excel переданы менеджеру.');
 });};
}
async function editorView(){
 heading(editorOrder.business_name||'Деталировка');content.append(node('p',statusLabels[editorOrder.workflow_status]||'В обработке','badge'));
 const bar=node('div',undefined,'toolbar');bar.append(link(currentUser.roles.includes('client')?'Мои заказы':'Рабочая очередь',currentUser.roles.includes('client')?'/account':'/staff','button secondary'));content.append(bar);
 const client=currentUser.roles.includes('client');
 if(editorOrder.preparation_mode==='manager_assisted'&&(client||(!editorOrder.active_revision_id&&!managerEditing))){
  if(editorOrder.workflow_status==='draft'){await managerPreparation();if(!client)content.append(button('Заполнить деталировку',()=>{managerEditing=true;return editorView();},true));}else{content.append(node('p','Заявка у менеджера. После проверки он отправит вам предварительный расчёт.'));await sourceList(content);}
  return;
 }
 const editingAllowed=editorOrder.workflow_status==='draft'||!client;
 const importButton=button('Загрузить Excel',importForm,true);importButton.disabled=!editingAllowed;bar.append(importButton);
 content.append(node('p','Готовые размеры в миллиметрах. L1 и L2 — стороны по длине, W1 и W2 — по ширине.','muted'));
 if(!catalogueMaterials.length)content.append(node('p','Каталог материалов пока недоступен.','notice'));
 renderManual();
 if(!editingAllowed)$('manual-rows').querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
 const actions=node('div',undefined,'actions');const add=button('+ Добавить деталь',()=>{addGroupDetail(manualRows.at(-1));});add.disabled=!editingAllowed;
 const save=button('Сохранить',()=>saveRevision(),true);save.disabled=!editingAllowed;
 const calc=button('Предварительный расчёт',async()=>{if(dirty||!editorOrder.active_revision_id)await saveRevision(false);const c=await api('/orders/'+editorOrder.order_id+'/calculations','POST',{revision_id:editorOrder.active_revision_id});await showCalculation(c.calculation_id);});calc.disabled=!editingAllowed;
 actions.append(add,save,calc);content.append(actions);
 const [cl,ci]=field('Комментарий к заказу','revision_comment','textarea',revisionComment);content.append(cl);ci.oninput=()=>{dirty=true;revisionComment=ci.value;};
 if(!client){const sources=node('section',undefined,'panel');sources.append(node('h2','Исходные Excel'));await sourceList(sources);content.append(sources);await orderFiles(editorOrder.order_id);}
}
function normalSearch(v){return String(v||'').normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();}
function customerMaterialDialog(row){return new Promise(resolve=>{
 const d=node('dialog',undefined,'customer-material-dialog'),form=node('form'),grid=node('div',undefined,'grid'),old=row.custom_customer||{},controls={};
 d.setAttribute('aria-label','Свой материал');form.append(node('h2','Свой материал'),node('p','Материал клиента для этой заявки. Укажите формат листа и толщину; менеджер проверит его перед производством.'),grid);
 for(const [key,label,type,value,required]of [['article','Артикул / свой код','text',old.article,false],['name','Название своего материала','text',old.name,true],['manufacturer','Производитель (необязательно)','text',old.manufacturer,false],['thickness','Толщина своего материала, мм','number',old.thickness,true],['length','Длина своего листа, мм','number',old.length,true],['width','Ширина своего листа, мм','number',old.width,true],['provided_sheets','Листов клиента, шт.','number',row.provided_sheets,true],['reason','Комментарий к своему материалу','text',old.reason||'Материал клиента для этой заявки',true]]){
  const [l,i]=field(label,key,type,value,required);if(type==='number'){i.min=key==='provided_sheets'?'1':'0.001';i.max=key==='provided_sheets'?'10000':'100000';i.step=key==='provided_sheets'?'1':'0.001';}if(key==='reason'){i.minLength=3;i.maxLength=1000;}grid.append(l);controls[key]=i;
 }
 const owned=node('label','Подтверждаю: это материал клиента','check-label'),check=node('input');check.type='checkbox';check.required=true;check.checked=!!row.custom_customer;owned.prepend(check);form.append(owned);
 const actions=node('div',undefined,'actions'),save=node('button','Использовать свой материал'),cancel=button('Отмена',()=>end(null),true);actions.append(save,cancel);form.append(actions);
 function end(v){d.close();d.remove();resolve(v);}
 form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const c=Object.fromEntries(Object.entries(controls).map(([k,i])=>[k,i.value.trim()])),sheets=Number(c.provided_sheets);delete c.provided_sheets;c.key=old.key||crypto.randomUUID();end({variant_id:null,custom_customer:c,materialLabel:materialLabel(c)+' · материал клиента',supply_source:'customer',provided_sheets:sheets,customer_reason:c.reason});};
 d.oncancel=e=>{e.preventDefault();end(null);};d.append(form);document.body.append(d);d.showModal();controls.name.focus();
});}
function catalogSelect(r,index){
 const box=node('div',undefined,'material-cell'),q=node('input'),select=node('select'),info=node('small',r.materialLabel),results=node('div',undefined,'material-suggestions');
 const label=node('label','Поиск материала по артикулу или названию');q.id='material-search-'+crypto.randomUUID();label.htmlFor=q.id;
 q.type='search';q.placeholder='Например: 621 PO, дуб, Egger';q.autocomplete='off';q.setAttribute('aria-label','Поиск материала '+(index+1));select.setAttribute('aria-label','Материал '+(index+1));
 results.id='material-results-'+crypto.randomUUID();results.hidden=true;results.setAttribute('aria-label','Найденные материалы');q.setAttribute('aria-controls',results.id);q.setAttribute('aria-expanded','false');
 function hide(){results.hidden=true;q.setAttribute('aria-expanded','false');}
 function choose(m){select.value=m.variant_id;hide();select.onchange();}
 function suggest(){
  const found=MFEntry.materialMatches(catalogueMaterials,q.value);results.replaceChildren();results.hidden=false;q.setAttribute('aria-expanded','true');
  for(const m of found.slice(0,8)){const b=button(materialLabel(m),()=>choose(m),true);b.classList.add('material-suggestion');results.append(b);}
  if(!found.length)results.append(node('p','Материал не найден. Измените запрос или создайте свой материал для этой заявки.','muted'));
  if(found.length>8)results.append(node('small','Показано 8 из '+found.length+'. Уточните артикул, толщину или формат.'));
 }
 function options(){
  const found=MFEntry.materialMatches(catalogueMaterials,q.value);
  const selected=catalogueMaterials.find(m=>m.variant_id===r.variant_id);if(selected){const i=found.indexOf(selected);if(i>=0)found.splice(i,1);found.unshift(selected);}
  select.replaceChildren();const empty=node('option',r.custom_customer?r.materialLabel:'Выберите материал');empty.value='';select.append(empty);
  for(const m of found.slice(0,50)){const o=node('option',materialLabel(m));o.value=m.variant_id;select.append(o);}select.value=r.variant_id||'';
 }
 q.oninput=()=>{options();suggest();};q.onfocus=()=>{if(q.value.trim())suggest();};
 q.onkeydown=e=>{if(e.key==='Escape'){hide();return;}if(e.key==='ArrowDown'){e.preventDefault();if(results.hidden)suggest();results.querySelector('button')?.focus();}else if(e.key==='Enter'&&!results.hidden){e.preventDefault();results.querySelector('button')?.click();}};
 results.onkeydown=e=>{const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(e.key==='Escape'){q.focus();hide();}else if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}};
 box.onfocusout=e=>{if(!box.contains(e.relatedTarget))hide();};
 select.onchange=()=>{const m=catalogueMaterials.find(x=>x.variant_id===select.value);if(r.custom_customer){r.supply_source='company';delete r.provided_sheets;delete r.customer_reason;}r.variant_id=m?.variant_id||null;r.materialLabel=materialLabel(m);r.custom_customer=null;if(m?.grain&&grainNames[m.grain])r.grain=m.grain;else if(m?.texture===false)r.grain='none';info.textContent=r.materialLabel;hide();dirty=true;box.onMaterialChange?.();};
 const own=button(r.custom_customer?'Изменить свой материал':'+ Свой материал',async()=>{const value=await customerMaterialDialog(r);if(!value)return;Object.assign(r,value);info.textContent=r.materialLabel;options();hide();own.textContent='Изменить свой материал';dirty=true;box.onMaterialChange?.();},true);own.classList.add('custom-material-button');
 const ownHint=node('p','Не нашли нужный материал в каталоге? «+ Свой материал» создаёт материал клиента только для этой заявки.','muted');
 options();box.append(label,q,results,select,info,own,ownHint);return box;
}
function groupEdgePicker(material,selected,index,onChange){
 const box=node('div',undefined,'group-edge-picker'),matches=MFEntry.edgeCandidates(material,catalogueEdges),items=catalogueEdges.filter(e=>MFEntry.compatible(material,e)),current=catalogueEdges.find(e=>e.edge_id===selected);
 if(current&&!items.includes(current))items.unshift(current);
 const [el,select]=selectField('Кромка AUTO материала '+index,'group_edge',[['','Выберите кромку'],...[...matches,...items.filter(e=>!matches.includes(e))].map(e=>[e.edge_id,edgeLabel(e)])],selected||'');
 const legacyMatches=MFEntry.legacyEdgeCandidates(material,catalogueEdges);
 const legacySelected=selected&&legacyMatches.some(e=>e.edge_id===selected);
 const info=node('p',selected?'AUTO: '+edgeLabel(current)+(legacySelected?' · подбор из сохранённых связок v9':''):matches.length?'AUTO-кромка найдена. При необходимости выберите другой вариант.':'Автоподбор не найден. Подберите кромку из базы.','edge-auto-status');
 if(selected&&!MFEntry.compatible(material,current||{}))info.textContent+=' · Проверьте ширину кромки для нового материала.';
 const list=node('div',undefined,'edge-suggestions'),[sl,search]=field('Подбор кромки '+index,'edge_search','search');search.placeholder='Артикул, декор или размер';
 function show(){const query=MFEntry.key(search.value),found=query?items.filter(e=>MFEntry.key([edgeLabel(e),e.designation].join(' ')).includes(query)):matches;list.replaceChildren();for(const e of found.slice(0,8)){const b=button(edgeLabel(e),()=>{select.value=e.edge_id;select.onchange();},true);b.classList.add('edge-suggestion');b.setAttribute('aria-pressed',String(e.edge_id===selected));list.append(b);}if(query&&!found.length)list.append(node('p','Нет подходящей кромки. Проверьте артикул и толщину материала.','muted'));}
 select.onchange=()=>onChange(select.value||null);search.oninput=show;show();box.append(node('strong','Подбор кромки'),info,list,sl,el);
 if(matches.length>1)box.append(node('small','Автовыбор: ближайшая подходящая ширина, затем толщина кромки ближе к 1 мм. Размер можно изменить.'));
 return box;
}
function edgeChooser(e,label,onChange,autoId=undefined){
 const box=node('div',undefined,'edge-cell'),search=node('input');search.type='search';search.placeholder='Найти кромку';search.setAttribute('aria-label','Поиск кромки '+label);
 const [el,select]=selectField(label,'edge',[],undefined);el.classList.add('sr-label');
 let chosen=e.selection_mode==='auto'&&autoId!==undefined?'__auto__':e.unresolved?'?':e.edge_id||'';
 function options(){
  const terms=normalSearch(search.value).split(' ').filter(Boolean),items=catalogueEdges.filter(x=>terms.every(t=>normalSearch(edgeLabel(x)).includes(t))||search.value.trim()&&MFEntry.key(x.article).includes(MFEntry.key(search.value))).slice(0,50);
  const current=catalogueEdges.find(x=>x.edge_id===(chosen==='__auto__'?autoId:chosen));if(current&&!items.includes(current))items.unshift(current);
  const auto=autoId===undefined?[]:[['__auto__',autoId?'AUTO · '+edgeLabel(catalogueEdges.find(x=>x.edge_id===autoId)):'AUTO · выберите кромку материала']];
  select.replaceChildren();for(const [v,t]of [['?','Выберите кромку'],['','Без кромки'],...auto,...items.map(x=>[x.edge_id,edgeLabel(x)])]){const o=node('option',t);o.value=v;select.append(o);}select.value=chosen;select.title=select.selectedOptions[0]?.textContent||'';
 }
 const mark=node('label','Оклеить','edge-mark'),check=node('input');check.type='checkbox';check.setAttribute('aria-label','Оклеить '+label);check.checked=!!e.edge_id||e.selection_mode==='auto';mark.prepend(check);
 check.onchange=()=>{chosen=check.checked?'__auto__':'';options();onChange(check.checked?{edge_id:autoId||null,supply_source:'company',selection_mode:'auto',unresolved:!autoId}:{edge_id:null,supply_source:'company',selection_mode:'manual',unresolved:false});};
 search.oninput=options;select.onchange=()=>{
  chosen=select.value;select.title=select.selectedOptions[0]?.textContent||'';
  check.checked=chosen==='__auto__'||!!chosen&&chosen!=='?';
  onChange(chosen==='__auto__'?{edge_id:autoId||null,supply_source:'company',selection_mode:'auto',unresolved:!autoId}:{edge_id:chosen&&chosen!=='?'?chosen:null,supply_source:e.supply_source||'company',unresolved:chosen==='?',selection_mode:'manual'});
 };options();if(autoId!==undefined)box.append(mark);box.append(search,el);return {box,select};
}
let entryExpanded=false;
const groupEdgeDefaults=new Map();
function detailGroupKey(r){return r.custom_customer?'customer:'+r.custom_customer.key:r.variant_id?'material:'+r.variant_id+':'+r.supply_source:r._group||'source:'+(r._materialSource||'new');}
function groupedDetails(){
 const groups=new Map();manualRows.forEach((r,index)=>{const key=detailGroupKey(r);if(!groups.has(key))groups.set(key,{key,rows:[]});groups.get(key).rows.push({r,index});});return [...groups.values()];
}
function copyGroupMaterial(target,source){for(const k of ['variant_id','materialLabel','custom_customer','supply_source','provided_sheets','customer_reason','_group'])target[k]=structuredClone(source[k]);}
function addGroupDetail(source){const r=blankDetail();if(source){copyGroupMaterial(r,source);r.grain=source.grain;r.rotation=source.rotation;}manualRows.push(r);dirty=true;renderManual();document.querySelector('[data-detail-id="'+r.detail_id+'"] input')?.focus();}
function renderManual(){
 const section=node('section',undefined,entryExpanded?'entry-expanded':'entry-compact');section.id='manual-rows';
 const tools=node('div',undefined,'toolbar');tools.append(node('h2','Материалы и детали'),button(entryExpanded?'Компактный вид':'Расширенный вид',()=>{entryExpanded=!entryExpanded;renderManual();},true),button('+ Добавить материал',()=>{const r=blankDetail();r._group=crypto.randomUUID();manualRows.push(r);dirty=true;renderManual();},true));section.append(tools);
 const groups=groupedDetails();
 for(const [gi,group]of groups.entries()){
  const first=group.rows[0].r,firstIndex=group.rows[0].index,m=first.custom_customer?{...first.custom_customer,family:'customer'}:catalogueMaterials.find(x=>x.variant_id===first.variant_id);
  let defaultEdge=groupEdgeDefaults.has(group.key)?groupEdgeDefaults.get(group.key):group.rows.flatMap(({r})=>Object.values(r.edges)).find(e=>e.selection_mode==='auto'&&e.edge_id)?.edge_id||MFEntry.edgeDefault(m,catalogueEdges);
  const card=node('article',undefined,'material-group'),title=node('h3','Материал '+(gi+1)),settings=node('div',undefined,'material-settings');
  card.append(title,settings);section.append(card);
  const choice={...first},material=catalogSelect(choice,firstIndex),select=material.querySelector('select');
  material.onMaterialChange=()=>{const newMaterial=catalogueMaterials.find(x=>x.variant_id===choice.variant_id),next=MFEntry.edgeDefault(newMaterial,catalogueEdges);for(const {r}of group.rows){copyGroupMaterial(r,choice);for(const side of sideNames)if(r.edges[side]?.selection_mode==='auto')r.edges[side]={...r.edges[side],edge_id:next,unresolved:!next};}groupEdgeDefaults.set(detailGroupKey(first),next);dirty=true;renderManual();};
  settings.append(material);
  settings.append(groupEdgePicker(m,defaultEdge,gi+1,edgeId=>{groupEdgeDefaults.set(group.key,edgeId);for(const {r}of group.rows)for(const side of sideNames)if(r.edges[side]?.selection_mode==='auto')r.edges[side]={...r.edges[side],edge_id:edgeId,unresolved:!edgeId};dirty=true;renderManual();}));
  const [gl,grain]=selectField('Текстура материала '+(gi+1),'group_grain',Object.entries(grainNames),first.grain);settings.append(gl);
  grain.onchange=()=>{for(const {r}of group.rows)r.grain=grain.value;dirty=true;renderManual();};
  if(first._materialSource)card.append(node('p','Из Excel: '+first._materialSource,'muted'));
  card.append(node('p','Материал и формат выбираются для всей группы. AUTO следует выбранной кромке; ручные стороны сохраняются.','muted'));
  const wrap=table(['№','Название','Длина, мм','Ширина, мм','Кол-во','Текстура','Вращать','L1','L2','W1','W2','Примечание','Действия'],[]);wrap.classList.add('detail-grid');wrap.querySelectorAll('th')[11].classList.add('detail-extra');const body=wrap.querySelector('tbody');
  group.rows.forEach(({r,index})=>{
  const tr=node('tr');tr.dataset.detailId=r.detail_id;
  function cell(child){const td=node('td');td.append(child);tr.append(td);return td;}
  cell(node('span',index+1));
  function input(k,label,type='text'){const i=node('input');i.type=type;i.value=r[k]??'';i.setAttribute('aria-label',label+' '+(index+1));if(type==='number'){i.min=k==='qty'?'1':'0.001';i.step=k==='qty'?'1':'0.001';}else i.maxLength=k==='comments'?1000:200;i.oninput=()=>{r[k]=k==='qty'?(i.value===''?'':Number(i.value)):i.value;dirty=true;tr.classList.remove('invalid-row');};return i;}
  cell(input('name','Название'));cell(input('length','Длина','number'));cell(input('width','Ширина','number'));cell(input('qty','Количество','number'));
  const [gl,g]=selectField('Текстура '+(index+1),'grain',Object.entries(grainNames),r.grain);gl.classList.add('sr-label');g.onchange=()=>{r.grain=g.value;dirty=true;};cell(gl);
  const rotation=node('input');rotation.type='checkbox';rotation.checked=r.rotation;rotation.setAttribute('aria-label','Вращать '+(index+1));rotation.onchange=()=>{r.rotation=rotation.checked;dirty=true;};cell(rotation);
  for(const side of sideNames){
   cell(edgeChooser(r.edges[side]||{},side+' деталь '+(index+1),e=>{r.edges[side]=e;dirty=true;},defaultEdge).box);
  }
  cell(input('comments','Примечание')).classList.add('detail-extra');
  const actions=node('div',undefined,'row-actions');
  actions.append(button('Дублировать',()=>{const clone=structuredClone(r);clone.detail_id=crypto.randomUUID();delete clone.draft_row_id;delete clone.resolution_reason;delete clone._source;delete clone._errors;manualRows.splice(index+1,0,clone);dirty=true;renderManual();},true));
  if(index)actions.append(button('Материал ↑',()=>{for(const k of ['variant_id','materialLabel','custom_customer','supply_source','provided_sheets','customer_reason'])r[k]=structuredClone(manualRows[index-1][k]);dirty=true;renderManual();},true),button('Кромка ↑',()=>{r.edges=structuredClone(manualRows[index-1].edges);dirty=true;renderManual();},true));
  actions.append(button('Удалить',async()=>{if(r.draft_row_id){const fresh=await api('/orders/'+editorOrder.order_id);const res=await api('/orders/'+editorOrder.order_id+'/draft/rows/'+r.draft_row_id+'/exclude','POST',{reason:'Удалено пользователем из таблицы деталировки'},{'If-Match':String(fresh.optimistic_lock_version)});editorOrder.optimistic_lock_version=res.optimistic_lock_version;}manualRows.splice(index,1);if(!manualRows.length)manualRows.push(blankDetail());dirty=true;renderManual();},true));
  const more=node('details');more.append(node('summary','Дополнительно'),button('Материал клиента, склейка, упаковка',()=>editRow(index),true));actions.append(more);cell(actions);body.append(tr);
  if(r._source){const note=node('tr',undefined,'source-note'+(r._errors?.length?' error-note':'')),td=node('td',r._source+(r._errors?.length?' · '+r._errors.map(importIssue).join('; '):''));td.colSpan=13;note.append(td);body.append(note);}

  });card.append(wrap);
  const actions=node('div',undefined,'actions');actions.append(button('+ Деталь в этот материал',()=>addGroupDetail(first)));
  for(const [label,sides]of [...sideNames.map(s=>['AUTO '+s,[s]]),['AUTO 4 стороны',sideNames]])actions.append(button(label,()=>{
   if(!defaultEdge)throw new Error('Выберите кромку AUTO для этого материала.');let protectedSides=0;
   for(const {r}of group.rows)for(const side of sides){const previous=r.edges[side],next=MFEntry.autoEdge(previous,defaultEdge);if(next===previous)protectedSides++;r.edges[side]=next;}dirty=true;renderManual();message(protectedSides?'AUTO применён. Ручные назначения сохранены; отдельную сторону можно явно переключить в AUTO.':'AUTO применён к выбранным сторонам.');
  },true));card.append(actions);
 }
 const old=$('manual-rows');if(old)old.replaceWith(section);else content.append(section);
}
function picker(label,kind,release,onPick){const box=node('div'),[l,q]=field(label,'search','search'),results=node('div',undefined,'result-list'),search=button('Найти',async()=>{results.replaceChildren(node('p','Поиск…'));const d=await api('/catalogue/'+kind+'?q='+encodeURIComponent(q.value)+(release?'&release='+encodeURIComponent(release):'')+'&limit=50');results.replaceChildren();if(!d.items.length)results.append(node('p','Совпадений не найдено. Уточните артикул.'));for(const item of d.items)results.append(button(materialLabel(item),async()=>{await onPick(item,d.catalogue_release);results.replaceChildren(node('p','Выбрано: '+materialLabel(item),'selected-material'));},true));if(d.total>50)results.append(node('p','Показаны первые 50 вариантов. Уточните поиск по артикулу.'));},true);box.append(l,search,results);return box;}
async function editRow(index,source){
 activeRow=index;const old=manualRows[index];const r=source?structuredClone(source):old?structuredClone(old):{detail_id:crypto.randomUUID(),length:'',width:'',qty:1,variant_id:null,materialLabel:'Материал не выбран',supply_source:'company',rotation:false,grain:'unknown',route:'solid',packaging:false,edges:{}};
 const panel=node('section',undefined,'panel');panel.id='row-panel';panel.append(node('h2',old?'Изменить деталь':'Новая деталь'));const form=node('form',undefined,'row-editor'),grid=node('div',undefined,'grid');
 for(const [k,t]of [['length','Длина, мм'],['width','Ширина, мм'],['qty','Количество, шт.']]){const[l,i]=field(t,k,'number',r[k],true);i.min=k==='qty'?'0':'0.001';i.step=k==='qty'?'1':'0.001';grid.append(l);}
 const [gl,g]=selectField('Направление текстуры','grain',[['unknown','Не определено'],['length','По длине'],['width','По ширине'],['none','Без текстуры']],r.grain);const[rl,rot]=selectField('Вращение детали','rotation',[['false','Запрещено'],['true','Разрешено']],String(r.rotation));const[pl,route]=selectField('Конструкция','route',[['solid','Цельная плита'],['glued_18_18','Склейка 18 + 18']],r.route);const[packl,pack]=selectField('Упаковка','packaging',[['false','Без упаковки'],['true','Упаковать']],String(r.packaging));grid.append(gl,rl,pl,packl);form.append(grid);
 const selected=node('p',r.materialLabel,'selected-material');form.append(selected,picker('Поиск материала: артикул, структура','materials',catalogueRelease,async(m,release)=>{if(r.variant_id&&r.variant_id!==m.variant_id&&!await confirmAction('Заменить материал?',r.materialLabel+' → '+materialLabel(m)+'. Проверьте все ручные назначения кромки.'))return;r.variant_id=m.variant_id;r.custom_customer=null;r.materialLabel=materialLabel(m);catalogueRelease=catalogueRelease||release;selected.textContent=r.materialLabel;}));
 const [sl,supply]=selectField('Чей материал','supply_source',[['company','Материал компании'],['customer','Материал клиента']],r.supply_source);form.append(sl);const customer=node('details');customer.append(node('summary','Параметры материала клиента'));const cg=node('div',undefined,'grid');for(const[k,t,type,v]of[['provided_sheets','Передано листов, шт.','number',r.provided_sheets],['customer_reason','Основание / комментарий','text',r.customer_reason],['custom_name','Собственный материал вне каталога','text',r.custom_customer?.name],['custom_thickness','Толщина, мм','number',r.custom_customer?.thickness],['custom_length','Длина листа, мм','number',r.custom_customer?.length],['custom_width','Ширина листа, мм','number',r.custom_customer?.width]]){const[l,i]=field(t,k,type,v);if(type==='number'){i.min='0.001';i.step='0.001';}cg.append(l);}customer.append(cg);form.append(customer);
 const edges=node('fieldset');edges.append(node('legend','Кромка — четыре отдельные стороны'));
 for(const side of ['L1','L2','W1','W2']){const d=node('details');d.append(node('summary',side+' · '+(r.edges[side]?.edge_id?'Ручное назначение':'Без кромки')));const status=node('p',r.edges[side]?.edge_id?'Сохранено точное назначение':'Без кромки');d.append(status,picker('Кромка '+side,'edges',catalogueRelease,(e,release)=>{catalogueRelease=catalogueRelease||release;r.edges[side]={edge_id:e.edge_id,supply_source:'company'};status.textContent=materialLabel(e)+' · ручное назначение';d.querySelector('summary').textContent=side+' · '+(e.article||e.name||'Назначена');}),button('Без кромки',()=>{r.edges[side]={edge_id:null,supply_source:'company'};status.textContent='Без кромки';d.querySelector('summary').textContent=side+' · Без кромки';},true));const [el,es]=selectField('Источник кромки '+side,'edge_supply_'+side,[['company','Кромка компании'],['customer','Кромка клиента']],r.edges[side]?.supply_source||'company');d.append(el);edges.append(d);}
 form.append(edges,node('p','Ручные назначения не заменяются AUTO. Для импортированных строк AUTO доступен отдельно.','muted'));const actions=node('div',undefined,'actions');actions.append(node('button','Сохранить строку'),button('Отмена',()=>{panel.remove();},true));form.append(actions);
 form.onsubmit=e=>{e.preventDefault();run(async()=>{const f=new FormData(form);const qty=Number(f.get('qty'));if(!Number.isInteger(qty)||qty<1)throw new Error('Количество должно быть целым и больше нуля. Значение не исправлено автоматически.');r.length=f.get('length');r.width=f.get('width');r.qty=qty;r.grain=g.value;r.rotation=rot.value==='true';r.route=route.value;r.packaging=pack.value==='true';r.supply_source=supply.value;
 if(r.supply_source==='customer'){r.provided_sheets=Number(f.get('provided_sheets'));r.customer_reason=f.get('customer_reason');if(!Number.isInteger(r.provided_sheets)||r.provided_sheets<1||r.customer_reason.trim().length<3)throw new Error('Укажите количество листов клиента и основание.');if(f.get('custom_name')){r.variant_id=null;r.custom_customer={key:r.custom_customer?.key||crypto.randomUUID(),article:r.custom_customer?.article||'',manufacturer:r.custom_customer?.manufacturer||'',name:f.get('custom_name'),thickness:f.get('custom_thickness'),length:f.get('custom_length'),width:f.get('custom_width'),reason:r.customer_reason};if(['thickness','length','width'].some(k=>!(Number(r.custom_customer[k])>0)))throw new Error('Укажите толщину и формат собственного материала.');r.materialLabel=r.custom_customer.name+' · материал клиента';}}else{delete r.provided_sheets;delete r.customer_reason;r.custom_customer=null;}
 if(!r.variant_id&&!r.custom_customer)throw new Error('Выберите точный материал. Поисковая строка не является назначением.');for(const s of ['L1','L2','W1','W2'])r.edges[s]={...(r.edges[s]||{edge_id:null}),supply_source:f.get('edge_supply_'+s)};if(index===undefined)manualRows.push(r);else manualRows[index]=r;dirty=true;panel.remove();renderManual();message('Строка изменена локально. Сохраните новую редакцию заказа.');});};panel.append(form);$('row-panel')?.remove();content.append(panel);panel.scrollIntoView({block:'start'});form.querySelector('input').focus();
}
async function saveRevision(refresh=true){
 const details=[];
 for(const [i,r]of manualRows.entries()){
  if(!r.draft_row_id&&!r.variant_id&&!r.custom_customer&&!r.length&&!r.width&&!r.name&&!r.comments)continue;
  const fail=text=>{document.querySelector('[data-detail-id="'+r.detail_id+'"]')?.classList.add('invalid-row');throw new Error('Строка '+(i+1)+': '+text);};
  if(!r.variant_id&&!r.custom_customer)fail('выберите материал.');
  if(!(Number(r.length)>0))fail('укажите длину числом больше нуля.');
  if(!(Number(r.width)>0))fail('укажите ширину числом больше нуля.');
  if(!Number.isInteger(r.qty)||r.qty<1)fail('количество должно быть целым и больше нуля.');
  if(sideNames.some(s=>r.edges[s]?.unresolved))fail('выберите кромку или «Без кромки» для каждой стороны.');
  const {materialLabel,_source,_errors,_materialSource,_group,...data}=r;
  data.edges=Object.fromEntries(sideNames.map(s=>[s,{edge_id:r.edges[s]?.edge_id||null,supply_source:r.edges[s]?.supply_source||'company',selection_mode:r.edges[s]?.selection_mode||'manual'}]));details.push(data);
 }
 if(!details.length)throw new Error('Добавьте хотя бы одну деталь.');
 const r=await api('/orders/'+editorOrder.order_id+'/revisions','POST',{parent_revision_id:editorOrder.active_revision_id,catalogue_release_id:catalogueRelease,reason:'Сохранение деталировки пользователем',comment:revisionComment,details},{'If-Match':String(editorOrder.optimistic_lock_version)});
 editorOrder.active_revision_id=r.revision_id;editorOrder.optimistic_lock_version=r.optimistic_lock_version;dirty=false;for(const row of manualRows)delete row._errors;
 if(refresh)await editorView();message('Деталировка сохранена.');
}
function importIssue(e){const reason={missing_or_non_numeric:'пустое значение или не число',must_be_positive:'должно быть больше нуля',integer_quantity_required:'нужно целое количество',precision_requires_review_no_rounding:'слишком много знаков после запятой',formula_without_usable_cached_value:'формула без сохранённого результата',excel_error:'ошибка Excel',edge_requires_resolution:'выберите кромку',side_alias_conflict:'противоречивые обозначения стороны'}[e.reason]||'проверьте значение';return (importLabels[e.field]||e.field)+' «'+(e.raw??'пусто')+'»: '+reason;}
async function filePayload(file){if(file.size>20*1024*1024)throw new Error('Файл превышает 20 МБ.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {filename:file.name,content_base64:btoa(binary)};}
async function showCalculation(id){
 const c=await api('/calculations/'+id+'/preview');heading('Предварительный расчёт',editorOrder.business_name);
 content.append(node('p',c.status_label),node('p','Заявка ещё не отправлена менеджеру.','muted'));
 const actions=node('div',undefined,'actions');content.append(actions);
 actions.append(button('К деталировке',editorView,true));
 const doc=await api('/calculations/'+id+'/documents/preliminary','POST',{});
 const view=link('Посмотреть PDF','/api/v2/documents/'+doc.file_id+'?inline=true','button secondary');view.target='_blank';view.rel='noopener';
 const download=link('Скачать PDF','/api/v2/documents/'+doc.file_id,'button');download.download='';actions.append(view,download);
 if(c.synthetic)content.append(node('p','Тестовый расчёт с условными ценами.','notice'));
 content.append(node('h2','Деталировка'),table(['№','Название / материал','Д × Ш, мм','Количество','Текстура','L1','L2','W1','W2','Примечание'],c.details.map(d=>[d.number,[d.name,materialLabel(d.material)].filter(Boolean).join(' · '),d.length+' × '+d.width,d.qty,grainNames[d.grain],...sideNames.map(s=>d.unresolved_edges.includes(s)?'Уточняется':edgeLabel(d.edges[s])),d.comments])));
 content.append(node('h2','Материалы'),table(['Материал / формат','Листов','Цена, BYN','Сумма, BYN'],c.materials.map(m=>[materialLabel(m),m.quantity,m.unit_price,m.amount])));
 if(c.edges.length)content.append(node('h2','Кромка'),table(['Кромка','Метраж, м','Цена, BYN','Сумма, BYN'],c.edges.map(e=>[edgeLabel(e),e.billable_metres??e.net_metres,e.unit_price,e.amount])));
 content.append(node('h2','Услуги'),table(['Услуга','Объём','Тариф, BYN','Сумма, BYN'],c.services.map(s=>[s.name,s.quantity,s.unit_price,s.amount])),node('h2','Скидки'),table(['Категория','До скидки','Скидка, %','После скидки'],c.discounts.map(d=>[d.name,d.gross,d.percent,d.net])),node('h2',c.amount_label),node('p',c.amount===null?'Уточняется':c.amount+' BYN','amount'));
 if(c.unresolved.length){const ul=node('ul');c.unresolved.forEach(t=>ul.append(node('li',t)));content.append(ul);}content.append(node('p',c.disclaimer,'muted'));
 if(editorOrder.workflow_status==='draft'){
  const [cl,comment]=field('Комментарий менеджеру (необязательно)','comment','textarea');content.append(cl);let check=null;
  if(c.state!=='complete'){const l=node('label','Передать менеджеру для проверки позиций, требующих уточнения');check=node('input');check.type='checkbox';l.prepend(check);content.append(l);}
  const key=crypto.randomUUID();content.append(button('Отправить заявку',async()=>{const fresh=await api('/orders/'+editorOrder.order_id);await api('/orders/'+editorOrder.order_id+'/submit','POST',{revision_id:editorOrder.active_revision_id,preliminary_calculation_id:id,comment:comment.value,handoff_problematic:check?.checked||false},{'If-Match':String(fresh.optimistic_lock_version),'Idempotency-Key':key});await openEditor(editorOrder.order_id);message('Заявка передана менеджеру.');}));
 }
 message('Предварительный расчёт создан. PDF доступен для просмотра и скачивания.');
}
function renderImported(rows){
 const t=table(['Строка','Материал / статус','Д × Ш, мм','Количество','Ошибки / исключение','Действия'],rows.map(r=>{const s=r.snapshot,v=s.values||{},res=s.resolution||{};return[v.position??s.row,materialLabel(res.selected)+' / '+({exact_match:'Точное совпадение',manual_override:'Выбрано вручную',confirmed_mapping:'Подтверждено',ambiguous:'Нужно уточнение',not_found:'Не найдено',custom_customer:'Материал клиента'}[res.status]||'Требует проверки'),value(v.length)+' × '+value(v.width),v.qty,r.excluded_reason||((s.errors||[]).map(e=>e.field+': '+e.reason).join('; ')||'Нет ошибок исходных значений'),''];}));
 t.querySelectorAll('tbody tr').forEach((tr,i)=>{const r=rows[i];if(r.excluded_reason)return;tr.lastChild.append(button('Материал / кромка',()=>importedEditor(r),true),button('Исключить',async()=>{const reason=await reasonDialog('Исключить строку','Строка сохранится в истории с указанной причиной.');if(!reason)return;const result=await api('/orders/'+editorOrder.order_id+'/draft/rows/'+r.draft_row_id+'/exclude','POST',{reason},{'If-Match':String(editorOrder.optimistic_lock_version)});editorOrder.optimistic_lock_version=result.optimistic_lock_version;manualRows=manualRows.filter(x=>x.draft_row_id!==r.draft_row_id);await editorView();},true));});content.append(t);
}
function reasonDialog(title,text){return new Promise(resolve=>{const d=node('dialog'),form=node('form'),[l,i]=field('Причина','reason','textarea','',true);i.minLength=3;i.maxLength=500;form.append(node('h2',title),node('p',text),l,node('button','Подтвердить'));const no=node('button','Отмена','secondary');no.type='button';form.append(no);const end=v=>{d.close();d.remove();resolve(v);};no.onclick=()=>end(null);form.onsubmit=e=>{e.preventDefault();end(i.value);};d.oncancel=e=>{e.preventDefault();end(null);};d.append(form);document.body.append(d);d.showModal();i.focus();});}
async function importedEditor(r){const p=node('section',undefined,'panel');p.append(node('h2','Назначения импортированной строки'));
 const base='/orders/'+editorOrder.order_id+'/draft/rows/'+r.draft_row_id;
 p.append(button('Исправить размеры и количество',async()=>{
 const reason=await reasonDialog('Исправить исходную строку','Оригинальная строка сохранится. Исправление войдёт в новую редакцию с указанной причиной.');if(!reason)return;
 const s=r.snapshot,v=s.values||{},custom=s.resolution?.status==='custom_customer'?s.resolution.customer_material:null,m=custom||s.resolution?.selected;
 const customer=custom?{variant_id:null,custom_customer:{key:custom.key||r.draft_row_id,name:custom.name,article:custom.article||'',manufacturer:custom.manufacturer||'',thickness:custom.thickness,length:custom.length,width:custom.width,reason:custom.reason||s.resolution.reason},supply_source:'customer',provided_sheets:custom.provided_sheets,customer_reason:custom.reason||s.resolution.reason}:{};
 const index=manualRows.findIndex(x=>x.draft_row_id===r.draft_row_id);
 await editRow(index>=0?index:undefined,{detail_id:r.draft_row_id,draft_row_id:r.draft_row_id,resolution_reason:reason,length:v.length,width:v.width,qty:v.qty,variant_id:m?.variant_id||null,materialLabel:materialLabel(m),supply_source:'company',rotation:v.rotation===true,grain:['none','length','width'].includes(v.texture)?v.texture:'unknown',route:'solid',packaging:false,edges:Object.fromEntries(['L1','L2','W1','W2'].map(side=>[side,{edge_id:s.edges?.[side]?.confirmed?s.edges[side].edge_id:null,supply_source:'company'}]))});
 },true));
 async function mutate(url,body){if(manualRows.some(x=>x.draft_row_id===r.draft_row_id))throw new Error('Для этой строки уже подготовлено исправление редакции. Измените её через ручную деталировку, чтобы сохранить все назначения.');const result=await api(base+url,'POST',body,{'If-Match':String(editorOrder.optimistic_lock_version)});editorOrder.optimistic_lock_version=result.optimistic_lock_version;dirty=true;await editorView();message('Назначение сохранено в черновике. Создайте новую редакцию для расчёта.');}
 p.append(picker('Точный материал','materials',r.release_id,async(m)=>{const reason=await reasonDialog('Изменить материал','Новый материал: '+materialLabel(m)+'. AUTO будет проверен сервером, ручная кромка сохраняется.');if(reason)await mutate('/material',{variant_id:m.variant_id,reason});}));
 for(const side of ['L1','L2','W1','W2']){const d=node('details'),e=r.snapshot.edges?.[side];d.append(node('summary',side+' · '+({manual_override:'Ручное назначение',auto_suggestion:'Предложение AUTO',confirmed_mapping:'Подтверждено'}[e?.mode]||'Требует проверки')),node('p',e?.snapshot?materialLabel(e.snapshot):'Назначение отсутствует или требует подтверждения'),picker('Кромка '+side,'edges',r.release_id,async(edge)=>{const reason=await reasonDialog('Назначить кромку '+side,materialLabel(edge));if(reason)await mutate('/edges',{side,action:'manual',edge_id:edge.edge_id,reason});}),button('Без кромки '+side,async()=>{const reason=await reasonDialog('Убрать кромку '+side,'Будет сохранено явное ручное отсутствие кромки.');if(reason)await mutate('/edges',{side,action:'manual',edge_id:null,reason});},true),button('Сбросить '+side+' в AUTO',async()=>{const reason=await reasonDialog('Сбросить ручное назначение?',side+': ручное назначение будет снято только после вашего подтверждения.');if(reason)await mutate('/edges',{side,action:'reset_auto',reason});},true));p.append(d);}
 content.append(p);p.scrollIntoView();}
async function catalogueDiff(){const result=await api('/orders/'+editorOrder.order_id+'/draft/catalogue-update');const p=node('section',undefined,'panel');p.append(node('h2','Изменения каталога'),table(['Позиция','Точный вариант доступен','Ручная кромка'],result.diff.map((d,i)=>[i+1,d.variant_available?'Да':'Нет — сохранить закреплённый вариант',d.manual_edges_preserved?'Сохраняется':'Требует проверки'])),node('p','AUTO будет проверен заново. Ручные назначения сохраняются.','notice'),button('Применить к черновику',async()=>{const reason=await reasonDialog('Обновить каталог черновика?','Ранее созданные редакции, расчёты и документы не изменятся.');if(!reason)return;await api('/orders/'+editorOrder.order_id+'/draft/catalogue-update','POST',{release_id:result.release_id,reason},{'If-Match':String(editorOrder.optimistic_lock_version)});await editorView();}));content.append(p);}
async function staffHome(){
 if(currentUser.roles.includes('client')||currentUser.roles.includes('service_agent')){heading('Доступ ограничен');content.append(node('p','Рабочий кабинет доступен сотрудникам с соответствующими правами.','notice'),link('Мои заказы','/account','button'));return;}
 heading('Рабочий кабинет','Показываются только заказы, доступные по вашим текущим правам.');const tabs=node('div',undefined,'staff-tabs');tabs.append(button('Очередь заказов',staffQueue,true));if(currentUser.roles.includes('admin'))tabs.append(button('Сотрудники',staffList,true),button('Журнал действий',auditList,true),button('Каталог',catalogueView,true),button('Тарифы и профили',financialView,true));content.append(tabs);const area=node('div');area.id='staff-content';content.append(area);await staffQueue();
}
async function staffQueue(after='',append=false){const area=$('staff-content'),d=await api('/orders?after='+encodeURIComponent(after));if(!append)area.replaceChildren(node('h2','Очередь заказов'));if(!d.items.length&&!append)area.append(node('p','Доступных заказов пока нет.','empty'));for(const o of d.items){const a=node('article',undefined,'order');a.append(node('h3',o.business_name||'Заказ'),node('p',statusLabels[o.workflow_status]||'Статус уточняется'));if(currentUser.roles.some(r=>['manager','admin'].includes(r)))a.append(link('Открыть деталировку','/editor?order='+encodeURIComponent(o.order_id),'button secondary'));if(o.workflow_status==='submitted'&&currentUser.roles.some(r=>['manager','admin'].includes(r)))a.append(button('Взять на проверку',async()=>{const reason=await reasonDialog('Начать проверку заказа?',o.business_name||'Заказ');if(!reason)return;await api('/orders/'+o.order_id+'/review','POST',{reason},{'If-Match':String(o.optimistic_lock_version)});await staffQueue();}));if(currentUser.roles.includes('admin'))a.append(button('Назначить менеджера',()=>assignmentForm(o),true));a.append(button('Файлы заказа',()=>staffOrderFiles(o),true));area.append(a);}if(d.next){const more=button('Показать ещё',async()=>{more.remove();await staffQueue(d.next,true);},true);area.append(more);}}
async function assignmentForm(order){const staff=await api('/admin/staff'),area=$('staff-content'),form=node('form',undefined,'panel');const[l,s]=selectField('Менеджер','manager_id',[['','Без менеджера'],...staff.items.filter(u=>u.role==='manager'&&u.account_status==='active').map(u=>[u.user_id,u.email])],order.assigned_manager_id||'');const[rl,r]=field('Причина назначения','reason','text','',true);r.minLength=3;form.append(node('h2','Назначение менеджера'),l,rl,node('button','Сохранить назначение'));form.onsubmit=e=>{e.preventDefault();run(async()=>{await api('/orders/'+order.order_id+'/assign-manager','POST',{manager_id:s.value||null,reason:r.value});await staffQueue();message('Назначение сохранено.');});};area.append(form);}
async function staffList(){const d=await api('/admin/staff'),area=$('staff-content');area.replaceChildren(node('h2','Сотрудники'),node('p','Роль ограничивает доступ; отдельные разрешения проверяются сервером.','muted'));const t=table(['Email','Роль','Состояние','Управление'],d.items.map(u=>[u.email,u.role,u.account_status==='active'?'Активен':'Заблокирован','']));t.querySelectorAll('tbody tr').forEach((tr,i)=>{const u=d.items[i];tr.lastChild.append(button(u.account_status==='active'?'Заблокировать':'Разблокировать',async()=>{const blocked=u.account_status==='active';if(!await confirmAction(blocked?'Заблокировать сотрудника?':'Разблокировать сотрудника?',u.email+(blocked?'. Активные сессии будут отозваны.':'. Выданные права будут проверяться заново.')))return;await api('/admin/staff/'+u.user_id+'/state','PUT',{status:blocked?'blocked':'active'});await staffList();},true),button('Роль и разрешения',()=>grantForm(u),true));});area.append(t,button('Добавить сотрудника',staffCreate,true));}
async function staffCreate(){const f=node('form',undefined,'panel');const[el,email]=field('Email сотрудника','email','email','',true),[pl,password]=field('Временный пароль (от 12 символов)','password','password','',true);password.minLength=12;password.autocomplete='new-password';const[rl,role]=selectField('Роль','role',['manager','production','accounting','viewer','admin'].map(x=>[x,x]));f.append(node('h2','Новый сотрудник'),el,pl,rl,node('button','Создать сотрудника'));f.onsubmit=e=>{e.preventDefault();run(async()=>{await api('/admin/staff','POST',{email:email.value,password:password.value,role:role.value});password.value='';await staffList();message('Сотрудник создан. Разрешения выдаются отдельно.');});};$('staff-content').append(f);}
async function grantForm(user){const f=node('form',undefined,'panel');const[pl,p]=field('Точное разрешение (без *)','permission','text','',true),[sl,s]=selectField('Область доступа','scope',[['assigned','Назначенные заказы'],['order','Конкретный заказ'],['job','Конкретное производственное задание']]),[il,id]=field('ID области (для конкретного объекта)','scope_id');const[rl,role]=selectField('Роль сотрудника','role',['manager','production','accounting','viewer','admin'].map(x=>[x,x]),user.role);f.append(node('h2','Доступ: '+user.email),rl,button('Изменить роль',async()=>{if(await confirmAction('Изменить роль сотрудника?',user.role+' → '+role.value)){await api('/admin/staff/'+user.user_id+'/role','PUT',{role:role.value});await staffList();}},true),pl,sl,il,node('button','Выдать точное разрешение'));f.onsubmit=e=>{e.preventDefault();run(async()=>{if(p.value.includes('*'))throw new Error('Wildcard-разрешения запрещены.');if(!await confirmAction('Выдать разрешение?',p.value+' / '+s.value))return;await api('/admin/staff/'+user.user_id+'/grants','POST',{permission:p.value,scope_type:s.value,scope_id:id.value||null});message('Разрешение сохранено.');});};$('staff-content').append(f);}
async function auditList(){const d=await api('/admin/audit');$('staff-content').replaceChildren(node('h2','Журнал действий'),table(['Дата','Действие','Объект'],d.items.map(e=>[date(e.created_at),e.action,e.object_type])));}
async function catalogueView(){const d=await api('/catalogue/releases'),area=$('staff-content');area.replaceChildren(node('h2','Каталог'),node('p','Материал выбирается по точной идентичности. Поиск не меняет назначения в заказах.'));area.append(picker('Найти материал','materials',d.active_release,(m)=>message(materialLabel(m))),table(['Релиз','Дата','Состояние'],d.items.map(r=>[r.release_id,date(r.created_at),r.release_id===d.active_release?'Активный':'Архивный'])));}
async function financialView(){const d=await api('/financial/defaults');$('staff-content').replaceChildren(node('h2','Действующие версии расчёта'),node('p','Публикация новых цен и тарифов не входит в изменение дизайна. Старые расчёты используют закреплённые версии.','notice'),table(['Профиль','Версия'],[['Производственный профиль',d.production_profile_id],['Тарифы',d.tariff_book_id],['Цены',d.price_book_id],['Скидки',d.discount_profile_id]]));}
