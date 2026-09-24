'use strict';
const importLabels=Object.fromEntries(MFEntry.fields);

async function importForm(){
 $('import-panel')?.remove();
 const panel=node('section',undefined,'panel excel-entry');panel.id='import-panel';
 const top=node('div',undefined,'toolbar');top.append(node('h2','Загрузить Excel'),button('Закрыть импорт',()=>panel.remove(),true));panel.append(top);
 panel.append(node('p','Выберите файл. Колонки и материалы подберутся автоматически — перед импортом их можно поправить.','muted'));
 const [fl,file]=field('Файл Excel','file','file');file.accept='.xlsx,.xls';panel.append(fl);
 const area=node('div');panel.append(area);content.append(panel);panel.scrollIntoView({block:'start'});file.focus();
 file.onchange=()=>run(async()=>{
  if(!file.files[0])return;
  const payload=await filePayload(file.files[0]);area.replaceChildren(node('p','Читаем Excel…'));
  const [book,saved]=await Promise.all([api('/imports/workbook','POST',{...payload,order_id:editorOrder.order_id}),api('/import-templates?order_id='+editorOrder.order_id)]);
  const templates=saved.items,detected=book.sheets.map(s=>({...MFEntry.detect(s.rows),sheet:s.name}));
  let activeTemplate=null,controls=new Map(),currentHeaders={},previewVersion=0;
  const recommended=[...detected].sort((a,b)=>b.score-a.score)[0];
  const [sl,sheet]=selectField('Лист Excel','sheet',book.sheets.map(s=>[s.name,s.name+' ('+s.row_count+' строк)']),recommended.sheet);
  const [tl,template]=selectField('Сохранённый шаблон','template',[['','Определить автоматически'],...templates.map(t=>[t.template_revision_id,t.name+' · версия '+t.version])]);
  const [hl,header]=field('Последняя строка заголовка','header','number',1);header.min=1;header.max=100;
  const [hsl,headerStart]=field('Первая строка заголовка','header_start','number',1);headerStart.min=1;headerStart.max=100;
  const [dl,dataStart]=field('Первая строка деталей','data_start','number',2);dataStart.min=2;dataStart.max=10001;
  const [nl,name]=field('Название шаблона','template_name','text',file.files[0].name.replace(/\.[^.]+$/,''));name.maxLength=100;
  const saveLabel=node('label',undefined,'check-label'),saveTemplate=node('input');saveTemplate.type='checkbox';saveTemplate.checked=true;saveLabel.append(saveTemplate,node('span','Сохранить настройки как мой шаблон'));
  const [ul,units]=selectField('Единицы размеров','units',[['mm','мм'],['cm','см'],['m','м']],'mm');
  const [el,emptyEdges]=selectField('Пустая ячейка кромки','empty_edge',[['none','Без кромки'],['unknown','Нужно уточнение']],'none');
  const [il,inherit]=selectField('Где указан материал','inheritance',[['none','В каждой строке детали'],['fill','В колонке; пустые ячейки относятся к материалу выше'],['blocks','Отдельной строкой над блоком деталей']],'none');
  const grid=node('div'),rawPreview=node('details'),preview=node('div');preview.id='import-preview';
  const status=node('p',undefined,'notice'),settings=node('div',undefined,'grid');settings.append(sl,tl);
  const advanced=node('details');advanced.append(node('summary','Строки Excel, единицы и шаблон'),hsl,hl,dl,ul,el,il,saveLabel,nl);
  const check=button('Проверить деталировку',checkPreview);area.replaceChildren(settings,status,grid,advanced,rawPreview,check,preview);
  function currentSheet(){return book.sheets.find(s=>s.name===sheet.value);}
  function invalidate(){previewVersion++;preview.replaceChildren(node('p','Настройки изменены. Нажмите «Проверить деталировку».','notice'));}
  function mapping(){return Object.fromEntries([...controls].filter(([,s])=>s.value).map(([f,s])=>[f,s.value]));}
  function drawMapping(definition=null){
   grid.replaceChildren();controls=new Map();
   const rows=currentSheet().rows;currentHeaders=MFEntry.headers(rows,Number(headerStart.value),Number(header.value));
   const cols=MFEntry.columns(rows);if(cols.length>80)throw new Error('В листе больше 80 колонок. Выберите лист с деталировкой.');
   const detected=MFEntry.detect(rows),guessed={};for(const [col,text]of Object.entries(currentHeaders)){const f=MFEntry.guess(text);if(f&&!guessed[f])guessed[f]=col;}
   const automatic=definition?.mapping||(detected.start===Number(headerStart.value)&&detected.end===Number(header.value)?detected.mapping:guessed);
   const form=node('div',undefined,'import-field-grid'),extra=node('details'),extraGrid=node('div',undefined,'import-field-grid');
   extra.append(node('summary','Дополнительные колонки'),extraGrid);
   MFEntry.fields.forEach(([f,label],index)=>{
    const options=[['','Нет колонки'],...cols.map((c,i)=>[c,(i+1)+'. '+(currentHeaders[c]??'Без заголовка')])];
    const [l,s]=selectField(label+' — колонка Excel','mapping_'+f,options,automatic[f]||'');
    s.onchange=invalidate;controls.set(f,s);(index<14?form:extraGrid).append(l);
   });grid.append(node('h3','Сопоставление колонок'),form,extra);
   rawPreview.replaceChildren(node('summary','Посмотреть исходные строки Excel'),table(['Строка',...cols.map(c=>currentHeaders[c]??'Без заголовка')],rows.filter(r=>r.row>=Number(dataStart.value)).slice(0,8).map(r=>[r.row,...cols.map(c=>r.cells[c]?.value??'')])));
  }
  function applySettings(def){
   header.value=def.sheet_policy.header_row;headerStart.value=def.sheet_policy.header_start||header.value;dataStart.value=def.sheet_policy.data_start||Number(header.value)+1;
   units.value=def.units.length||'mm';emptyEdges.value=def.edge_dictionary['']||'unknown';
   inherit.value=def.inheritance.material_blocks?'blocks':def.inheritance.fill_down?'fill':'none';
  }
  function selectSheet(){
   const rows=currentSheet().rows,detection=MFEntry.detect(rows);
   activeTemplate=templates.find(t=>{
    const d=t.definition;if(!d.sheet_policy.sheets?.includes(sheet.value))return false;
    const h=MFEntry.headers(rows,d.sheet_policy.header_start||d.sheet_policy.header_row,d.sheet_policy.header_row);
    return Object.entries(d.headers).every(([c,v])=>(h[c]??null)===v);
   })||null;
   template.value=activeTemplate?.template_revision_id||'';
   if(activeTemplate){applySettings(activeTemplate.definition);name.value=activeTemplate.name;status.textContent='Применён шаблон «'+activeTemplate.name+'».';}
   else{
    headerStart.value=detection.start;header.value=detection.end;dataStart.value=detection.end+1;inherit.value=detection.blocks&&!detection.mapping.material&&!detection.mapping.article?'blocks':'none';
    status.textContent=detection.inferred.length?'Размеры предложены по числовым колонкам без заголовков. Проверьте «Длина» и «Ширина».':'Колонки определены автоматически. Проверьте назначения и нажмите «Проверить деталировку».';
   }
   drawMapping(activeTemplate?.definition);invalidate();
  }
  sheet.onchange=selectSheet;
  template.onchange=()=>{activeTemplate=templates.find(t=>t.template_revision_id===template.value)||null;if(activeTemplate){applySettings(activeTemplate.definition);name.value=activeTemplate.name;}drawMapping(activeTemplate?.definition);invalidate();};
  for(const i of [header,headerStart])i.onchange=()=>{activeTemplate=null;template.value='';dataStart.value=Number(header.value)+1;drawMapping();invalidate();};
  for(const i of [dataStart,units,emptyEdges,inherit,name,saveTemplate])i.addEventListener('change',invalidate);
  function makeDefinition(){
   const map=mapping(),cols=Object.values(map);
   if(new Set(cols).size!==cols.length)throw new Error('Одна колонка назначена нескольким полям. Проверьте сопоставление.');
   for(const f of ['length','width','qty'])if(!map[f])throw new Error('Выберите колонку «'+importLabels[f]+'».');
   if(!map.material&&!map.article&&inherit.value!=='blocks')throw new Error('Выберите колонку материала или режим «Отдельной строкой над блоком деталей».');
   const start=Number(headerStart.value),end=Number(header.value),first=Number(dataStart.value);
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end-start>2||end>100||!Number.isInteger(first)||first<=end)throw new Error('Проверьте строки заголовка и первую строку деталей.');
   const inherited=inherit.value==='none'?(activeTemplate?.definition.inheritance?.header_marker?activeTemplate.definition.inheritance:{enabled:false,blank_resets:true}):{enabled:true,confirmed:true,blank_resets:true,...(inherit.value==='blocks'?{material_blocks:true}:{fill_down:true})};
   return {headers:Object.fromEntries(cols.map(c=>[c,currentHeaders[c]??null])),sheet_policy:{mode:'named',sheets:[sheet.value],header_row:end,...(start!==end?{header_start:start}:{}),...(first!==end+1?{data_start:first}:{})},mapping:map,inheritance:inherited,edge_dictionary:{'0':'none','нет':'none','no':'none','false':'none','-':'none','*':'present','1':'present',...activeTemplate?.definition.edge_dictionary,'':emptyEdges.value},units:{...activeTemplate?.definition.units,length:units.value,width:units.value}};
  }
  async function checkPreview(){
   const definition=makeDefinition(),stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='revision_name').sort(([a],[b])=>a.localeCompare(b))):x);
   const same=activeTemplate&&stable(activeTemplate.definition)===stable(definition)&&activeTemplate.name===name.value.trim()&&(!saveTemplate.checked||activeTemplate.status==='active');
   const saved=same?activeTemplate:await api(activeTemplate?'/import-templates/'+activeTemplate.template_id+'/revisions':'/import-templates','POST',{name:name.value.trim()||'Мой Excel',order_id:editorOrder.order_id,definition,status:saveTemplate.checked?'active':'draft'});
   if(!same){activeTemplate={...saved,name:name.value.trim()||'Мой Excel',definition,status:saveTemplate.checked?'active':'draft'};if(saveTemplate.checked){templates.unshift(activeTemplate);const o=node('option',activeTemplate.name+' · версия '+saved.version);o.value=saved.template_revision_id;template.prepend(o);template.value=o.value;}}
   const result=await api('/imports/preview','POST',{...payload,order_id:editorOrder.order_id,template_revision_id:saved.template_revision_id,selected_sheets:[sheet.value],catalogue_release:catalogueRelease});
   const version=++previewVersion;
   renderExcelPreview(preview,result,version,()=>previewVersion);
  }
  selectSheet();
  if(['length','width','qty'].every(k=>controls.get(k).value)&&(controls.get('material').value||controls.get('article').value||inherit.value==='blocks'))await checkPreview();
 });
}

function renderExcelPreview(preview,result,version,currentVersion){
 const rows=result.rows.filter(r=>['valid','problematic'].includes(r.original.disposition));
 preview.replaceChildren(node('h3','Проверьте деталировку перед импортом'));
 const groups=MFEntry.previewGroups(rows),choices=new Map(),cards=node('div');
 const qty=rows.reduce((n,r)=>n+(Number.isInteger(MFEntry.num(r.original.values.qty))&&MFEntry.num(r.original.values.qty)>0?MFEntry.num(r.original.values.qty):0),0);
 preview.append(node('p','Материалов: '+groups.length+' · Позиций: '+rows.length+' · Деталей с корректным количеством: '+qty,'import-metrics'),cards);
 groups.forEach((group,groupIndex)=>{
  const first=group.rows[0],source=String(first.original.values.article||first.original.values.material||'Материал не указан');
  const candidates=catalogueMaterials.filter(m=>group.rows.every(r=>(r.resolution?.candidates||[]).includes(m.variant_id)));
  const exact=MFEntry.exactMaterial(catalogueMaterials,first.original.values.article,first.original.values.material,first.original.values);
  const selected=first.resolution?.selected?.variant_id||(candidates.length===1?candidates[0].variant_id:exact?.variant_id||null);
  let automaticSelection=!!selected&&!first.resolution?.selected?.variant_id;
  const state={...blankDetail(),variant_id:selected,materialLabel:materialLabel(catalogueMaterials.find(m=>m.variant_id===selected))};
  let defaultEdge=MFEntry.edgeDefault(catalogueMaterials.find(m=>m.variant_id===selected),catalogueEdges);
  const card=node('article',undefined,'material-group import-material-group'),settings=node('div',undefined,'material-settings'),status=node('p',undefined,'muted');
  card.append(node('h3','Материал '+(groupIndex+1)+': '+source),status,settings);
  const picker=catalogSelect(state,first.original.row-1),select=picker.querySelector('select');select.setAttribute('aria-label','Материал в строке '+first.original.row);settings.append(picker);
  const edgeArea=node('div');settings.append(edgeArea);
  const items=[];
  for(const r of group.rows){
   const rowChoice={variant_id:selected,edges:{}};
   for(const side of sideNames){
    const e=r.original.edges[side];const exact=e.raw_sku===null||e.raw_sku===undefined?[]:catalogueEdges.filter(x=>MFEntry.key(x.article)===MFEntry.key(e.raw_sku));
    rowChoice.edges[side]=e.conflict?{edge_id:null,unresolved:true,selection_mode:'manual'}:e.mark==='none'?{edge_id:null,selection_mode:'manual'}:exact.length===1?{edge_id:exact[0].edge_id,selection_mode:'manual'}:e.mark==='present'?{edge_id:defaultEdge,selection_mode:'auto',unresolved:!defaultEdge}:{edge_id:null,unresolved:true,selection_mode:'manual'};
   }
   choices.set(r.row_id,rowChoice);items.push({r,rowChoice});
  }
  const tableArea=node('div');card.append(tableArea);cards.append(card);
  function updateStatus(){status.textContent=state.custom_customer?'Свой материал клиента: '+state.custom_customer.name+'. Будет назначен всем '+group.rows.length+' строкам этой группы.':state.variant_id?(automaticSelection?'✓ Материал найден автоматически. Проверьте вариант и AUTO-кромку перед импортом.':'Материал выбран. Нажатие «Импортировать деталировку» подтвердит его для '+group.rows.length+' строк.'):candidates.length>1?'Есть несколько вариантов толщины или формата. Выберите нужный один раз для всего материала.':'Материал не найден. Найдите его в каталоге или создайте свой материал.';}
  function refreshEdges(){
   const m=state.custom_customer?{...state.custom_customer,family:'customer'}:catalogueMaterials.find(x=>x.variant_id===state.variant_id);
   edgeArea.replaceChildren(groupEdgePicker(m,defaultEdge,groupIndex+1,id=>{const previousDefault=defaultEdge;const applied=MFEntry.applyGroupEdgeSelection(items.map(x=>x.rowChoice),previousDefault,id);defaultEdge=id;refreshEdges();message(id?'Кромка материала применена к '+applied.changed+' отмеченным сторонам Excel.'+(applied.protectedSides?' Ручных исключений сохранено: '+applied.protectedSides+'.':''):'AUTO-кромка снята с '+applied.changed+' отмеченных сторон Excel.');}));
   for(const {rowChoice}of items){rowChoice.variant_id=state.variant_id;rowChoice.custom_customer=state.custom_customer?{...state.custom_customer,provided_sheets:state.provided_sheets,ownership_confirmed:true}:null;for(const side of sideNames)if(rowChoice.edges[side].selection_mode==='auto')rowChoice.edges[side]={...rowChoice.edges[side],edge_id:defaultEdge,unresolved:!defaultEdge};}
   renderRows();updateStatus();
  }
  function renderRows(){
   const t=table(['Строка Excel','Наименование','Длина','Ширина','Количество','Текстура','L1','L2','W1','W2','Комментарий','Проверка'],items.map(({r})=>{const v=r.original.values;return[r.original.row,v.name||'',v.length,v.width,v.qty,grainNames[v.texture]||'Уточнить','','','','',v.comments||'',(r.original.errors||[]).filter(e=>!sideNames.includes(e.field)).map(importIssue).join('; ')];}));
   t.querySelectorAll('tbody tr').forEach((tr,i)=>{
    const {r,rowChoice}=items[i];for(const [j,side]of sideNames.entries()){
     const e=rowChoice.edges[side],chooser=edgeChooser(e,side+' в строке '+r.original.row,next=>{rowChoice.edges[side]=next;},defaultEdge);
     tr.children[6+j].append(chooser.box);
    }
   });tableArea.replaceChildren(t);
  }
  picker.onMaterialChange=()=>{automaticSelection=false;defaultEdge=MFEntry.edgeDefault(catalogueMaterials.find(m=>m.variant_id===state.variant_id),catalogueEdges);refreshEdges();};refreshEdges();
 });
 preview.append(node('p','Материал и AUTO-кромка выбираются один раз на группу. При смене AUTO-кромки она сразу применяется ко всем отмеченным кромлением сторонам этого материала; пустые стороны и ручные исключения сохраняются. Строки с ошибками останутся для исправления.','muted'));
 preview.append(button('Импортировать деталировку',async()=>{
  if(version!==currentVersion())throw new Error('Настройки изменились. Повторите проверку деталировки.');
  if(!rows.length)throw new Error('На листе нет деталей. Проверьте первую строку деталей.');
  if(rows.length>1000)throw new Error('За один импорт можно добавить до 1000 позиций. Разделите файл на несколько заявок.');
  const confirmed=Object.fromEntries([...choices].map(([id,c])=>[id,{variant_id:c.variant_id||null,...(c.custom_customer?{custom_customer:c.custom_customer}:{}),edges:Object.fromEntries(Object.entries(c.edges).filter(([,e])=>!e.unresolved).map(([s,e])=>[s,{edge_id:e.edge_id||null,selection_mode:e.selection_mode}]))}]));
  const fresh=await api('/orders/'+editorOrder.order_id);
  await api('/imports/'+result.import_id+'/confirm','POST',{mode:'add',choices:confirmed},{'If-Match':String(fresh.optimistic_lock_version)});
  const draft=await api('/orders/'+editorOrder.order_id+'/draft/rows');editorOrder.optimistic_lock_version=draft.optimistic_lock_version;
  const ids=new Map(rows.map((r,i)=>[r.row_id,i])),added=draft.rows.filter(d=>ids.has(d.source_row_id)&&!d.excluded_reason).sort((a,b)=>ids.get(a.source_row_id)-ids.get(b.source_row_id));
  manualRows=manualRows.filter(r=>r.draft_row_id||r.variant_id||r.custom_customer||r.length||r.width||r.name||r.comments);
  for(const d of added)if(!manualRows.some(r=>r.draft_row_id===d.draft_row_id||r.glue_backing?.draft_row_id===d.draft_row_id))manualRows.push(fromImported(d));
  manualRows=MFEntry.recognizeGlueRows(manualRows,catalogueMaterials);
  dirty=true;await editorView();message('Импортировано '+added.length+' исходных позиций. Материалы и кромки сгруппированы; пары 18+18 показаны как готовые детали 36 мм.');
 }));
}
