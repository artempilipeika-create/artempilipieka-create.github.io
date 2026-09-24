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
function fromRevision(d){return {...blankDetail(),detail_id:d.detail_id,name:d.name||'',comments:d.comments||'',...(d.draft_row_id?{draft_row_id:d.draft_row_id,resolution_reason:d.resolution_reason||'Подтверждение деталировки в таблице'}:{}),length:d.length,width:d.width,qty:d.qty,variant_id:d.material?.variant_id||null,materialLabel:materialLabel(d.material),custom_customer:d.customer_material_key?{key:d.customer_material_key,name:d.material.name,thickness:d.material.thickness,length:d.material.length,width:d.material.width,reason:d.material.reason}:null,supply_source:d.supply_source,provided_sheets:d.provided_sheets,customer_reason:d.customer_reason,rotation:d.rotation,grain:d.grain,route:d.route,packaging:d.packaging,edges:Object.fromEntries(sideNames.map(s=>[s,{edge_id:d.edges[s]?.edge?.edge_id||null,supply_source:d.edges[s]?.supply_source||'company',unresolved:d.edges[s]?.state==='unresolved'}]))};}
function fromImported(r){
 const s=r.snapshot,v=s.values||{},m=s.resolution?.selected;
 return {...blankDetail(),detail_id:r.draft_row_id,draft_row_id:r.draft_row_id,resolution_reason:'Подтверждение импортированной строки в таблице',name:String(v.name||''),comments:String(v.comments||''),length:v.length??'',width:v.width??'',qty:v.qty??'',variant_id:m?.variant_id||null,materialLabel:materialLabel(m),grain:grainNames[v.texture]?v.texture:'unknown',rotation:v.rotation===true,
  edges:Object.fromEntries(sideNames.map(side=>{const e=s.edges?.[side]||{};return [side,{edge_id:e.edge_id||null,supply_source:'company',unresolved:e.mark!=='none'&&!e.confirmed&&e.mode!=='manual_override'}];})),_source:'Excel: '+s.sheet+', строка '+s.row,_errors:s.errors||[]};
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
 const actions=node('div',undefined,'actions');const add=button('+ Добавить деталь',()=>{const r=blankDetail();manualRows.push(r);dirty=true;renderManual();$('manual-rows').querySelector('tbody tr:last-child input')?.focus();});add.disabled=!editingAllowed;
 const save=button('Сохранить',()=>saveRevision(),true);save.disabled=!editingAllowed;
 const calc=button('Предварительный расчёт',async()=>{if(dirty||!editorOrder.active_revision_id)await saveRevision(false);const c=await api('/orders/'+editorOrder.order_id+'/calculations','POST',{revision_id:editorOrder.active_revision_id});await showCalculation(c.calculation_id);});calc.disabled=!editingAllowed;
 actions.append(add,save,calc);content.append(actions);
 const [cl,ci]=field('Комментарий к заказу','revision_comment','textarea',revisionComment);content.append(cl);ci.oninput=()=>{dirty=true;revisionComment=ci.value;};
 if(!client){const sources=node('section',undefined,'panel');sources.append(node('h2','Исходные Excel'));await sourceList(sources);content.append(sources);await orderFiles(editorOrder.order_id);}
}
function normalSearch(v){return String(v||'').normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();}
function catalogSelect(r,index){
 const box=node('div',undefined,'material-cell'),q=node('input'),select=node('select'),info=node('small',r.materialLabel);
 q.type='search';q.placeholder='Артикул или название';q.setAttribute('aria-label','Поиск материала '+(index+1));select.setAttribute('aria-label','Материал '+(index+1));
 function options(){
  const terms=normalSearch(q.value).split(' ').filter(Boolean);const found=catalogueMaterials.filter(m=>terms.every(t=>normalSearch(materialLabel(m)).includes(t)));
  const selected=catalogueMaterials.find(m=>m.variant_id===r.variant_id);if(selected){const i=found.indexOf(selected);if(i>=0)found.splice(i,1);found.unshift(selected);}
  select.replaceChildren();const empty=node('option',r.custom_customer?r.materialLabel:'Выберите материал');empty.value='';select.append(empty);
  for(const m of found.slice(0,50)){const o=node('option',materialLabel(m));o.value=m.variant_id;select.append(o);}select.value=r.variant_id||'';
 }
 q.oninput=options;select.onchange=()=>{const m=catalogueMaterials.find(x=>x.variant_id===select.value);r.variant_id=m?.variant_id||null;r.materialLabel=materialLabel(m);r.custom_customer=null;if(m?.grain&&grainNames[m.grain])r.grain=m.grain;else if(m?.texture===false)r.grain='none';info.textContent=r.materialLabel;dirty=true;};
 options();box.append(q,select,info);return box;
}
function edgeChooser(e,label,onChange){
 const box=node('div'),search=node('input');search.type='search';search.placeholder='Найти кромку';search.setAttribute('aria-label','Поиск кромки '+label);
 const [el,select]=selectField(label,'edge',[],undefined);el.classList.add('sr-label');let chosen=e.unresolved?'?':e.edge_id||'';
 function options(){const terms=normalSearch(search.value).split(' ').filter(Boolean),items=catalogueEdges.filter(x=>terms.every(t=>normalSearch(edgeLabel(x)).includes(t))).slice(0,50);const current=catalogueEdges.find(x=>x.edge_id===chosen);if(current&&!items.includes(current))items.unshift(current);select.replaceChildren();for(const [v,t]of [['?','Выберите кромку'],['','Без кромки'],...items.map(x=>[x.edge_id,edgeLabel(x)])]){const o=node('option',t);o.value=v;select.append(o);}select.value=chosen;select.title=select.selectedOptions[0]?.textContent||'';}
 search.oninput=options;select.onchange=()=>{chosen=select.value;select.title=select.selectedOptions[0]?.textContent||'';onChange({edge_id:chosen&&chosen!=='?'?chosen:null,supply_source:e.supply_source||'company',unresolved:chosen==='?'});};options();box.append(search,el);return {box,select};
}
function renderManual(){
 const section=node('section');section.id='manual-rows';section.append(node('h2','Деталировка'));
 const wrap=table(['№','Название','Материал / формат листа','Длина, мм','Ширина, мм','Кол-во','Текстура','L1','L2','W1','W2','Примечание','Действия'],[]);wrap.classList.add('detail-grid');const body=wrap.querySelector('tbody');
 manualRows.forEach((r,index)=>{
  const tr=node('tr');tr.dataset.detailId=r.detail_id;
  function cell(child){const td=node('td');td.append(child);tr.append(td);return td;}
  cell(node('span',index+1));
  function input(k,label,type='text'){const i=node('input');i.type=type;i.value=r[k]??'';i.setAttribute('aria-label',label+' '+(index+1));if(type==='number'){i.min=k==='qty'?'1':'0.001';i.step=k==='qty'?'1':'0.001';}else i.maxLength=k==='comments'?1000:200;i.oninput=()=>{r[k]=k==='qty'?(i.value===''?'':Number(i.value)):i.value;dirty=true;tr.classList.remove('invalid-row');};return i;}
  cell(input('name','Название'));cell(catalogSelect(r,index));cell(input('length','Длина','number'));cell(input('width','Ширина','number'));cell(input('qty','Количество','number'));
  const [gl,g]=selectField('Текстура '+(index+1),'grain',Object.entries(grainNames),r.grain);gl.classList.add('sr-label');g.onchange=()=>{r.grain=g.value;r.rotation=g.value==='none';dirty=true;};cell(gl);
  for(const side of sideNames){
   cell(edgeChooser(r.edges[side]||{},side+' деталь '+(index+1),e=>{r.edges[side]=e;dirty=true;}).box);
  }
  cell(input('comments','Примечание'));
  const actions=node('div',undefined,'row-actions');
  actions.append(button('Дублировать',()=>{const clone=structuredClone(r);clone.detail_id=crypto.randomUUID();delete clone.draft_row_id;delete clone.resolution_reason;delete clone._source;delete clone._errors;manualRows.splice(index+1,0,clone);dirty=true;renderManual();},true));
  if(index)actions.append(button('Материал ↑',()=>{for(const k of ['variant_id','materialLabel','custom_customer','supply_source','provided_sheets','customer_reason'])r[k]=structuredClone(manualRows[index-1][k]);dirty=true;renderManual();},true),button('Кромка ↑',()=>{r.edges=structuredClone(manualRows[index-1].edges);dirty=true;renderManual();},true));
  actions.append(button('Удалить',async()=>{if(r.draft_row_id){const fresh=await api('/orders/'+editorOrder.order_id);const res=await api('/orders/'+editorOrder.order_id+'/draft/rows/'+r.draft_row_id+'/exclude','POST',{reason:'Удалено пользователем из таблицы деталировки'},{'If-Match':String(fresh.optimistic_lock_version)});editorOrder.optimistic_lock_version=res.optimistic_lock_version;}manualRows.splice(index,1);if(!manualRows.length)manualRows.push(blankDetail());dirty=true;renderManual();},true));
  const more=node('details');more.append(node('summary','Дополнительно'),button('Материал клиента, склейка, упаковка',()=>editRow(index),true));actions.append(more);cell(actions);body.append(tr);
  if(r._source){const note=node('tr',undefined,'source-note'+(r._errors?.length?' error-note':'')),td=node('td',r._source+(r._errors?.length?' · '+r._errors.map(importIssue).join('; '):''));td.colSpan=13;note.append(td);body.append(note);}
 });section.append(wrap);
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
 if(r.supply_source==='customer'){r.provided_sheets=Number(f.get('provided_sheets'));r.customer_reason=f.get('customer_reason');if(!Number.isInteger(r.provided_sheets)||r.provided_sheets<1||r.customer_reason.trim().length<3)throw new Error('Укажите количество листов клиента и основание.');if(f.get('custom_name')){r.variant_id=null;r.custom_customer={key:r.custom_customer?.key||crypto.randomUUID(),name:f.get('custom_name'),thickness:f.get('custom_thickness'),length:f.get('custom_length'),width:f.get('custom_width'),reason:r.customer_reason};if(['thickness','length','width'].some(k=>!(Number(r.custom_customer[k])>0)))throw new Error('Укажите толщину и формат собственного материала.');r.materialLabel=r.custom_customer.name+' · материал клиента';}}else{delete r.provided_sheets;delete r.customer_reason;r.custom_customer=null;}
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
  const {materialLabel,_source,_errors,...data}=r;
  data.edges=Object.fromEntries(sideNames.map(s=>[s,{edge_id:r.edges[s]?.edge_id||null,supply_source:r.edges[s]?.supply_source||'company'}]));details.push(data);
 }
 if(!details.length)throw new Error('Добавьте хотя бы одну деталь.');
 const r=await api('/orders/'+editorOrder.order_id+'/revisions','POST',{parent_revision_id:editorOrder.active_revision_id,catalogue_release_id:catalogueRelease,reason:'Сохранение деталировки пользователем',comment:revisionComment,details},{'If-Match':String(editorOrder.optimistic_lock_version)});
 editorOrder.active_revision_id=r.revision_id;editorOrder.optimistic_lock_version=r.optimistic_lock_version;dirty=false;for(const row of manualRows)delete row._errors;
 if(refresh)await editorView();message('Деталировка сохранена.');
}
const importFields=[['','Игнорировать колонку'],['position','№'],['name','Название детали'],['material','Материал'],['article','Артикул материала'],['length','Длина'],['width','Ширина'],['qty','Количество'],['L1','L1'],['L2','L2'],['W1','W1'],['W2','W2'],['texture','Текстура'],['rotation','Вращение'],['comments','Примечание'],['manufacturer','Производитель'],['structure','Структура'],['thickness','Толщина'],['format_length','Длина листа'],['format_width','Ширина листа']];
const importLabels=Object.fromEntries(importFields);
function excelColumn(n){let out='';for(n++;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
function guessField(value){const v=String(value||'').toLowerCase().replace(/[^a-zа-яё0-9]/g,'');
 if(/длиналиста|formatlength/.test(v))return 'format_length';if(/шириналиста|formatwidth/.test(v))return 'format_width';
 if(/длина|^length|размерx/.test(v))return 'length';if(/ширина|^width|размерy/.test(v))return 'width';if(/колич|колво|^qty$|^count$/.test(v))return 'qty';
 if(/артикул/.test(v)||v==='article')return 'article';if(/материал|^material$|^декор$/.test(v))return 'material';if(/наименован|назван|^name$|^деталь$/.test(v))return 'name';
 if(/текстур|^texture$|^orient$/.test(v))return 'texture';if(/вращ|поворот|^rotation$/.test(v))return 'rotation';if(/примеч|коммент|^comments?$/.test(v))return 'comments';
 if(/толщ|^thickness$/.test(v))return 'thickness';if(/производ|^manufacturer$/.test(v))return 'manufacturer';if(/структур|^structure$/.test(v))return 'structure';
 if(/(?:l1|x1)$/.test(v))return 'L1';if(/(?:l2|x2)$/.test(v))return 'L2';if(/(?:w1|y1)$/.test(v))return 'W1';if(/(?:w2|y2)$/.test(v))return 'W2';
 return ({l1:'L1',x1:'L1',х1:'L1',l2:'L2',x2:'L2',х2:'L2',w1:'W1',y1:'W1',у1:'W1',w2:'W2',y2:'W2',у2:'W2',position:'position',позиция:'position'})[v]||'';
}
function importIssue(e){const reason={missing_or_non_numeric:'пустое значение или не число',must_be_positive:'должно быть больше нуля',integer_quantity_required:'нужно целое количество',precision_requires_review_no_rounding:'слишком много знаков после запятой',formula_without_usable_cached_value:'формула без сохранённого результата',excel_error:'ошибка Excel',edge_requires_resolution:'выберите кромку',side_alias_conflict:'противоречивые обозначения стороны'}[e.reason]||'проверьте значение';return (importLabels[e.field]||e.field)+' «'+(e.raw??'пусто')+'»: '+reason;}
async function filePayload(file){if(file.size>20*1024*1024)throw new Error('Файл превышает 20 МБ.');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return {filename:file.name,content_base64:btoa(binary)};}
async function importForm(){
 $('import-panel')?.remove();const panel=node('section',undefined,'panel');panel.id='import-panel';panel.append(node('h2','Загрузить Excel'));
 const [fl,file]=field('Файл Excel','file','file');file.accept='.xlsx,.xls';panel.append(fl);const area=node('div');panel.append(area);content.append(panel);file.focus();
 let payload=null,book=null,templates=[],activeTemplate=null;
 file.onchange=()=>run(async()=>{
  if(!file.files[0])return;payload=await filePayload(file.files[0]);
  book=await api('/imports/workbook','POST',{...payload,order_id:editorOrder.order_id});
  templates=(await api('/import-templates?order_id='+editorOrder.order_id)).items;
  area.replaceChildren();const [sl,sheet]=selectField('Лист Excel','sheet',book.sheets.map(s=>[s.name,s.name]),book.sheets[0].name);
  const [hl,header]=field('Строка заголовков','header','number',1);header.min=1;header.max=100;
  const [tl,template]=selectField('Сохранённый шаблон','template',[['','Определить колонки'],...templates.map(t=>[t.template_revision_id,t.name+' · версия '+t.version])]);
  const grid=node('div'),preview=node('div');preview.id='import-preview';const settings=node('div',undefined,'grid');settings.append(sl,hl,tl);area.append(settings,grid);
  const [nl,name]=field('Название шаблона','template_name','text',file.files[0].name.replace(/\.[^.]+$/,''));name.maxLength=100;
  const [ul,units]=selectField('Единицы размеров','units',[['mm','мм'],['cm','см'],['m','м']],'mm');
  const [el,emptyEdges]=selectField('Пустая ячейка кромки означает','empty_edge',[['none','Без кромки'],['unknown','Нужно уточнение']],'none');
  const extra=node('details');extra.append(node('summary','Шаблон и единицы'),nl,ul,el);area.append(extra);
  let controls=new Map(),headers={};
  function currentSheet(){return book.sheets.find(s=>s.name===sheet.value);}
  function headerValues(row){return Object.fromEntries(Object.entries(row?.cells||{}).map(([c,v])=>[c,v.value??null]));}
  function buildMapping(useTemplate=false){
   preview.replaceChildren();grid.replaceChildren();controls=new Map();
   const rows=currentSheet().rows,h=rows.find(r=>r.row===Number(header.value));headers=headerValues(h);
   const cols=[...new Set(rows.flatMap(r=>Object.keys(r.cells)))].sort((a,b)=>a.length-b.length||a.localeCompare(b));
   if(cols.length>80)throw new Error('В листе больше 80 колонок. Выберите лист с деталировкой.');
   const t=table(cols.map(c=>c+' · '+(headers[c]??'без заголовка')),rows.filter(r=>r.row>Number(header.value)).slice(0,6).map(r=>cols.map(c=>r.cells[c]?.value??'')));
   const mappingRow=node('tr'),used=new Set();
   for(const col of cols){const selected=useTemplate?Object.entries(activeTemplate.definition.mapping).find(([,c])=>c===col)?.[0]||'':guessField(headers[col]);
    const [l,s]=selectField('Колонка '+col,'column_'+col,importFields,used.has(selected)?'':selected);if(s.value)used.add(s.value);s.onchange=()=>{preview.replaceChildren();};controls.set(col,s);const th=node('th');th.append(l);mappingRow.append(th);
   }t.querySelector('thead').append(mappingRow);grid.append(node('p','Выберите назначение колонок. Ниже — первые строки вашего файла.','muted'),t);
  }
  function selectSheet(){
   const rows=currentSheet().rows;
   const best=[...rows].sort((a,b)=>Object.values(b.cells).filter(c=>['length','width','qty'].includes(guessField(c.value))).length-Object.values(a.cells).filter(c=>['length','width','qty'].includes(guessField(c.value))).length)[0];header.value=best?.row||1;
   const match=templates.find(t=>{const d=t.definition;const row=rows.find(r=>r.row===d.sheet_policy.header_row);return d.sheet_policy.sheets?.includes(sheet.value)&&Object.entries(d.headers).every(([c,v])=>(row?.cells[c]?.value??null)===v);});
   activeTemplate=match||null;template.value=match?.template_revision_id||'';
   if(match){header.value=match.definition.sheet_policy.header_row;name.value=match.name;units.value=match.definition.units.length||'mm';emptyEdges.value=match.definition.edge_dictionary['']||'unknown';}
   buildMapping(!!match);
  }
  sheet.onchange=selectSheet;header.onchange=()=>{activeTemplate=null;template.value='';buildMapping();};template.onchange=()=>{activeTemplate=templates.find(t=>t.template_revision_id===template.value)||null;if(activeTemplate){header.value=activeTemplate.definition.sheet_policy.header_row;name.value=activeTemplate.name;units.value=activeTemplate.definition.units.length||'mm';emptyEdges.value=activeTemplate.definition.edge_dictionary['']||'unknown';}buildMapping(!!activeTemplate);};
  for(const x of [name,units,emptyEdges])x.addEventListener('change',()=>preview.replaceChildren());
  area.append(button('Проверить деталировку',async()=>{
   const mapping={},expected={};for(const [col,s]of controls){if(!s.value)continue;if(mapping[s.value])throw new Error('Поле «'+importLabels[s.value]+'» назначено дважды.');mapping[s.value]=col;expected[col]=headers[col]??null;}
   for(const k of ['length','width','qty'])if(!mapping[k])throw new Error('Выберите колонку «'+importLabels[k]+'».');
   if(!mapping.article&&!mapping.material)throw new Error('Выберите колонку «Материал» или «Артикул материала».');
   const definition={headers:expected,sheet_policy:{mode:'named',header_row:Number(header.value),sheets:[sheet.value]},mapping,inheritance:activeTemplate?.definition.inheritance||{enabled:false,blank_resets:true},edge_dictionary:{'0':'none','нет':'none','no':'none','false':'none','-':'none','*':'present','1':'present','':emptyEdges.value},units:{length:units.value,width:units.value}};
   const clean=d=>Object.fromEntries(Object.entries(d).filter(([k])=>k!=='revision_name'));
   const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
   const same=activeTemplate&&stable(clean(activeTemplate.definition))===stable(definition);
   // Reuse the existing owner-scoped, versioned template API. No local-only template store.
   const saved=same?activeTemplate:await api(activeTemplate?'/import-templates/'+activeTemplate.template_id+'/revisions':'/import-templates','POST',{name:name.value.trim()||'Мой Excel',order_id:editorOrder.order_id,definition});
   if(!same){activeTemplate={...saved,name:name.value,definition};templates.unshift(activeTemplate);const o=node('option',name.value+' · версия '+saved.version);o.value=saved.template_revision_id;template.prepend(o);template.value=o.value;}
   const result=await api('/imports/preview','POST',{...payload,order_id:editorOrder.order_id,template_revision_id:saved.template_revision_id,selected_sheets:[sheet.value],catalogue_release:catalogueRelease});
   importId=result.import_id;preview.replaceChildren(node('h3','Проверьте деталировку перед импортом'));const rows=result.rows.filter(r=>['valid','problematic'].includes(r.original.disposition));
   const selections=new Map(),edgeSelections=new Map();
   const t=table(['Строка Excel','Материал из Excel','Выбранный материал / формат','Название','Длина','Ширина','Количество','Текстура','L1','L2','W1','W2','Примечание','Проверка'],rows.map(r=>{const v=r.original.values;return [r.original.row,v.article||v.material||'','',''+(v.name||''),v.length,v.width,v.qty,grainNames[v.texture]||'Уточнить','','','','',v.comments||'',(r.original.errors||[]).filter(e=>!sideNames.includes(e.field)).map(importIssue).join('; ')||''];}));
   t.querySelectorAll('tbody tr').forEach((tr,i)=>{
    const r=rows[i],res=r.resolution||{},candidates=catalogueMaterials.filter(m=>(res.candidates||[]).includes(m.variant_id));
    const chosen=res.selected?.variant_id||(candidates.length===1?candidates[0].variant_id:'');
    const pick={...blankDetail(),variant_id:chosen,materialLabel:materialLabel(catalogueMaterials.find(m=>m.variant_id===chosen))},picker=catalogSelect(pick,r.original.row-1),s=picker.querySelector('select');s.setAttribute('aria-label','Материал в строке '+r.original.row);tr.children[2].append(picker);selections.set(r.row_id,s);
    const state=node('p',chosen?'Проверьте выбранный вариант':'Материал «'+(r.original.values.article||r.original.values.material||'пусто')+'» не определён. Выберите из списка.','muted');tr.children[2].append(state);
    const sides={};for(const [j,side]of sideNames.entries()){
     const e=r.original.edges[side],exact=catalogueEdges.filter(x=>String(x.article||'').trim()===String(e.raw_sku??'').trim());
     const picked=e.mark==='none'?'':exact.length===1?exact[0].edge_id:'?';
     const chooser=edgeChooser({edge_id:picked&&picked!=='?'?picked:null,unresolved:picked==='?'},side+' в строке '+r.original.row,()=>{});tr.children[8+j].append(chooser.box);sides[side]=chooser.select;
    }edgeSelections.set(r.row_id,sides);
   });preview.append(t,node('p','Импорт подтверждает показанные материалы и кромки. Строки с ошибками останутся в таблице для исправления.','muted'));
   const confirm=button('Импортировать деталировку',async()=>{
    if(!rows.length)throw new Error('На выбранном листе нет деталей. Проверьте строку заголовков.');
    for(const r of rows){const selected=selections.get(r.row_id).value;if(selected&&selected!==r.resolution?.selected?.variant_id)await api('/imports/'+result.import_id+'/rows/'+r.row_id+'/resolution','POST',{variant_id:selected,reason:'Пользователь подтвердил материал в предпросмотре Excel'});}
    const fresh=await api('/orders/'+editorOrder.order_id);await api('/imports/'+result.import_id+'/confirm','POST',{mode:'add'},{'If-Match':String(fresh.optimistic_lock_version)});
    const draft=await api('/orders/'+editorOrder.order_id+'/draft/rows');let version=draft.optimistic_lock_version;
    const added=draft.rows.filter(d=>rows.some(r=>r.row_id===d.source_row_id)).sort((a,b)=>rows.findIndex(r=>r.row_id===a.source_row_id)-rows.findIndex(r=>r.row_id===b.source_row_id));
    for(const d of added){const sides=edgeSelections.get(d.source_row_id);for(const side of sideNames){const chosen=sides[side].value;if(chosen==='?')continue;const e=d.snapshot.edges[side];if(chosen===''&&e.mark==='none')continue;const updated=await api('/orders/'+editorOrder.order_id+'/draft/rows/'+d.draft_row_id+'/edges','POST',{side,action:'manual',edge_id:chosen||null,reason:'Пользователь подтвердил кромку в предпросмотре Excel'},{'If-Match':String(version)});version=updated.optimistic_lock_version;d.snapshot=updated.snapshot;}}
    editorOrder.optimistic_lock_version=version;
    manualRows=manualRows.filter(r=>r.draft_row_id||r.variant_id||r.custom_customer||r.length||r.width||r.name||r.comments);
    for(const d of added)if(!manualRows.some(r=>r.draft_row_id===d.draft_row_id))manualRows.push(fromImported(d));
    dirty=true;await editorView();message('Деталировка импортирована. Проверьте строки и нажмите «Предварительный расчёт».');
   });preview.append(confirm);
  }),preview);selectSheet();
 });
}
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
 const s=r.snapshot,v=s.values||{},m=s.resolution?.selected;
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
