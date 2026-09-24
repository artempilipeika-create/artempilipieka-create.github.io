'use strict';
const fileCategoryLabels={source:'Исходник / задание',drawing:'Чертёж',image:'Фото / эскиз',document:'Рабочий документ',internal_working:'Внутренний рабочий файл',production_internal:'Производственный файл',oblx:'OBLX',other:'Прочее вложение'};
const fileVisibilityLabels={client_visible:'Доступен клиенту',staff_internal:'Только сотрудникам',production_internal:'Внутренний · производственный'};
Object.assign(workspaceErrors,{UNSUPPORTED_FILE_FORMAT:'Этот формат пока не поддерживается.',UNSUPPORTED_FILE_CONTENT:'Содержимое не соответствует разрешённому формату.',ATTACHMENT_SIZE_LIMIT:'Максимальный размер файла — 10 МБ.',UNSAFE_FILENAME:'Уберите из имени пути и специальные символы.',EXECUTABLE_FILE_DENIED:'Исполняемые файлы и скрипты запрещены.',INVALID_OBLX:'Файл не распознан как OBLX.',UNSAFE_OFFICE_DOCUMENT:'Office-файл содержит неподдерживаемые или активные элементы. Сохраните обычный документ без макросов и внешних связей.',UNSAFE_XLS:'XLS повреждён или содержит неподдерживаемые активные элементы.',ACTIVE_DOCUMENT_DENIED:'PDF содержит активные или неподдерживаемые элементы.',ATTACHMENT_STORAGE_FAILED:'Файл не сохранён. Обновите список перед повторной загрузкой.',FILE_INTEGRITY_FAILED:'Не удалось подтвердить целостность файла.',INTERNAL_VISIBILITY_REQUIRED:'Для этой категории доступ клиента запрещён.',REVISION_ORDER_MISMATCH:'Редакция не принадлежит этому заказу.'});
async function orderFiles(orderId,parent=content){
 const block=node('section',undefined,'panel order-files');block.setAttribute('aria-label','Файлы заказа');block.append(node('h2','Файлы заказа'),node('p','Загрузка вложения не означает согласование заказа или разрешение производства.','muted'));parent.append(block);
 const state=node('p','Загружаем файлы…');state.setAttribute('role','status');block.append(state);
 try{
  const data=await api('/orders/'+encodeURIComponent(orderId)+'/attachments');state.remove();
  if(data.can_upload){
   const form=node('form',undefined,'attachment-form'),[fl,input]=field('Файл до 10 МБ','file','file','',true);input.accept=data.formats.map(x=>'.'+x).join(',');
   const[cl,category]=selectField('Тип файла','category',Object.entries(fileCategoryLabels),'document');
   const[vl,visibility]=selectField('Кому доступен','visibility',Object.entries(fileVisibilityLabels),'staff_internal');
   const[nl,note]=field('Комментарий для сотрудников (клиенту не показывается)','comment','textarea');note.maxLength=500;
   function visibilityRule(){const internal=['oblx','internal_working','production_internal'].includes(category.value);for(const o of visibility.options)o.disabled=internal&&o.value==='client_visible';if(internal&&visibility.value==='client_visible')visibility.value='staff_internal';if(category.value==='oblx')visibility.value='production_internal';}
   category.onchange=visibilityRule;input.onchange=()=>{if(input.files[0]?.name.toLowerCase().endsWith('.oblx')){category.value='oblx';visibilityRule();}};
   const send=node('button','Добавить файл');form.append(fl,cl,vl,nl,send,node('p','OBLX всегда внутренний. Существующий файл с таким же именем останется в истории.','muted'));
   form.onsubmit=e=>{e.preventDefault();run(async()=>{const f=input.files[0];if(!f)return;if(f.size>data.max_size_bytes)throw new Error('Максимальный размер файла — 10 МБ.');send.disabled=true;send.textContent='Загрузка…';try{
    const b64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Не удалось прочитать файл.'));reader.readAsDataURL(f);});
    const saved=await api('/orders/'+encodeURIComponent(orderId)+'/attachments','POST',{filename:f.name,content_base64:b64,category:category.value,visibility:visibility.value,comment:note.value});
    block.remove();await orderFiles(orderId,parent);message(saved.category==='oblx'?'Файл сохранён как внутренний OBLX. Производственные действия не запускались.':'Файл сохранён в заказе.');
   }finally{send.disabled=false;send.textContent='Добавить файл';}});};block.append(form);
  }
  if(!data.items.length){block.append(node('p','Прикреплённых файлов пока нет.','empty'));return;}
  const staff=!currentUser.roles.includes('client');
  const t=table(['Файл','Тип','Видимость',...(staff?['Комментарий сотрудника']:[]),'Кто добавил','Дата и время','Размер','Статус','Скачать'],data.items.map(f=>[f.name,fileCategoryLabels[f.category],fileVisibilityLabels[f.visibility],...(staff?[f.comment||'—']:[]),f.uploaded_by,new Date(f.created_at).toLocaleString('ru-RU'),(f.size_bytes/1024).toFixed(1)+' КБ','Сохранён','']));
  t.querySelectorAll('tbody tr').forEach((tr,i)=>{const f=data.items[i],a=link('Скачать',f.download_url);a.setAttribute('aria-label','Скачать '+f.name);tr.lastChild.append(a);if(f.revision_id)tr.firstChild.append(node('small',' · Привязан к редакции'));});block.append(t);
 }catch(e){state.textContent=e.message||'Не удалось загрузить файлы заказа.';state.className='notice';}
}
async function staffOrderFiles(order){const area=$('staff-content');area.replaceChildren(node('h2',order.business_name||'Заказ'),button('К очереди',staffQueue,true));await orderFiles(order.order_id,area);}
