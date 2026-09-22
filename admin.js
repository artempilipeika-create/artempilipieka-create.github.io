'use strict';

const statusText={draft:'Черновик',manager_processing:'На обработке у менеджера',submitted:'Клиент подготовил',review:'На проверке',approved:'Согласован',in_work:'В работе',ready:'Готов',issued:'Выдан',cancelled:'Отменён'};
const payText={unpaid:'Не оплачен',partial:'Частично',paid:'Оплачен'};
const roleText={admin:'Администратор',manager:'Менеджер',production:'Производство',accounting:'Бухгалтерия',viewer:'Просмотр',customer:'Клиент'};
const templateStatusText={new:'Новый',verified:'Проверенный',working:'Рабочий'};
let me,users=[],orders=[],templates=[];
const esc=MFAuth.esc;
const el=id=>document.getElementById(id);
const hasPerm=p=>me?.role==='admin'||me?.permissions?.includes('*')||me?.permissions?.includes(p);
function dateInputValue(v){if(!v)return'';return new Date(v).toISOString().slice(0,10)}

function renderMetrics(m){
  el('metrics').innerHTML=`<article><small>Клиенты</small><strong>${m.customers}</strong></article><article><small>Заказы</small><strong>${m.orders}</strong></article><article><small>Нужна обработка</small><strong>${m.managerQueue||0}</strong></article><article><small>В работе</small><strong>${m.inWork}</strong></article><article><small>Готовы</small><strong>${m.ready}</strong></article><article><small>Не оплачено</small><strong>${(+m.unpaidAmount||0).toFixed(2)} BYN</strong></article>`;
}

function renderOrders(){
  el('ordersTab').innerHTML=`<div class="panel-title"><span>01</span><h2>Все заказы</h2></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Заказ</th><th>Клиент</th><th>Статус</th><th>Оплата</th><th>Сумма</th><th>Оплачено</th><th>Остаток</th><th>Файлы</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr data-id="${o.id}"><td><b>${esc(o.orderNumber)}</b><br><small>${esc(o.title)}</small></td><td>${esc(o.customerName||'')}<br><small>${esc(o.customerPhone||'')}</small></td><td><select data-f="status">${Object.entries(statusText).map(([k,v])=>`<option value="${k}" ${o.status===k?'selected':''}>${v}</option>`).join('')}</select></td><td><select data-f="paymentStatus">${Object.entries(payText).map(([k,v])=>`<option value="${k}" ${o.paymentStatus===k?'selected':''}>${v}</option>`).join('')}</select></td><td><input data-f="finalTotal" type="number" step="0.01" value="${o.finalTotal??o.preliminaryTotal}"></td><td><input data-f="paidAmount" type="number" step="0.01" value="${o.paidAmount}"></td><td><b>${(+o.balance).toFixed(2)}</b></td><td><div class="file-actions">${o.hasSourceFile?`<a class="btn btn-ghost btn-sm" href="/api/orders/${o.id}/source">Исходник</a>`:''}${o.hasOblx?`<a class="btn btn-ghost btn-sm" href="/api/orders/${o.id}/oblx">OBLX</a>`:''}${!o.hasSourceFile&&!o.hasOblx?'—':''}</div></td><td><button class="btn btn-ghost btn-sm" data-save>Сохранить</button></td></tr>`).join('')}</tbody></table></div>`;
  el('ordersTab').querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{const tr=b.closest('tr'),body={};tr.querySelectorAll('[data-f]').forEach(x=>body[x.dataset.f]=['finalTotal','paidAmount'].includes(x.dataset.f)?+x.value:x.value);try{await MFAuth.api('/api/admin/orders/'+tr.dataset.id,{method:'PATCH',body});await loadOrdersAndMetrics()}catch(e){alert(e.message)}});
}

function renderCustomers(){
  const customers=users.filter(u=>u.role==='customer');
  el('customersTab').innerHTML=`<div class="panel-title"><span>02</span><h2>Клиенты</h2></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Клиент</th><th>Телефон</th><th>Скидка %</th><th>3D до</th><th>Статус</th><th>Причина</th><th></th></tr></thead><tbody>${customers.map(u=>`<tr data-id="${u.id}"><td><b>${esc(u.name)}</b><br><small>${esc(u.email)}</small></td><td>${esc(u.phone||'')}</td><td><input data-f="discountPercent" type="number" min="0" max="100" step="0.5" value="${u.discountPercent||0}"></td><td><input data-f="subscription3dUntil" type="date" value="${dateInputValue(u.subscription3dUntil)}"></td><td><select data-f="isBlocked"><option value="false" ${!u.isBlocked?'selected':''}>Активен</option><option value="true" ${u.isBlocked?'selected':''}>Заблокирован</option></select></td><td><input data-f="blockReason" value="${esc(u.blockReason||'')}" placeholder="Причина"></td><td><button class="btn btn-ghost btn-sm" data-save>Сохранить</button></td></tr>`).join('')}</tbody></table></div>`;
  el('customersTab').querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{const tr=b.closest('tr'),body={};tr.querySelectorAll('[data-f]').forEach(x=>{let v=x.value;if(x.dataset.f==='discountPercent')v=+v;if(x.dataset.f==='isBlocked')v=v==='true';if(x.dataset.f==='subscription3dUntil')v=v?new Date(v+'T23:59:59Z').toISOString():null;body[x.dataset.f]=v});if(body.subscription3dUntil===null)delete body.subscription3dUntil;try{await MFAuth.api('/api/admin/users/'+tr.dataset.id,{method:'PATCH',body});await loadUsers()}catch(e){alert(e.message)}});
}

function renderStaff(){
  const staff=users.filter(u=>u.role!=='customer');
  el('staffTab').innerHTML=`<div class="panel-title"><span>03</span><h2>Сотрудники</h2></div><form id="staffForm" class="staff-form"><div class="field"><label>Имя</label><input id="sfName" required></div><div class="field"><label>Email</label><input id="sfEmail" type="email" required></div><div class="field"><label>Телефон</label><input id="sfPhone"></div><div class="field"><label>Роль</label><select id="sfRole"><option value="manager">Менеджер</option><option value="production">Производство</option><option value="accounting">Бухгалтерия</option><option value="viewer">Только просмотр</option></select></div><div class="field"><label>Временный пароль</label><input id="sfPassword" value="MartinForest2026!" required></div><button class="btn btn-primary">Добавить</button></form><div class="table-wrap" style="margin-top:18px"><table class="admin-table"><thead><tr><th>Имя</th><th>Email</th><th>Роль</th><th>Права</th><th>Статус</th></tr></thead><tbody>${staff.map(u=>`<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${roleText[u.role]||u.role}</td><td><small>${esc((u.permissions||[]).join(', '))}</small>${u.role!=='admin'?`<br><button class="btn btn-ghost btn-sm" data-perms data-id="${u.id}">Изменить права</button>`:''}</td><td>${u.isBlocked?'Заблокирован':'Активен'}</td></tr>`).join('')}</tbody></table></div>`;
  document.getElementById('staffForm').onsubmit=async e=>{e.preventDefault();try{await MFAuth.api('/api/admin/staff',{method:'POST',body:{name:el('sfName').value,email:el('sfEmail').value,phone:el('sfPhone').value,role:el('sfRole').value,password:el('sfPassword').value}});await loadUsers();alert('Сотрудник добавлен')}catch(x){alert(x.message)}};
  el('staffTab').querySelectorAll('[data-perms]').forEach(b=>b.onclick=async()=>{const u=users.find(x=>String(x.id)===String(b.dataset.id));if(!u)return;const hint='orders.read, orders.status, orders.process, payments.write, customers.read, files.read, templates.manage';const raw=prompt(`Права сотрудника ${u.name}. Введите через запятую.\n\nДоступные основные права:\n${hint}`,(u.permissions||[]).join(', '));if(raw===null)return;const permissions=[...new Set(raw.split(',').map(x=>x.trim()).filter(Boolean))];try{await MFAuth.api('/api/admin/users/'+u.id,{method:'PATCH',body:{permissions}});await loadUsers()}catch(e){alert(e.message)}});
}

const templateMapLabels={pos:'Позиция',name:'Наименование',article:'Артикул материала',material:'Материал / цвет',len:'Длина',wid:'Ширина',qty:'Количество',texture:'Текстура',rotate:'Вращение',l1:'L1 / X1',l2:'L2 / X2',w1:'W1 / Y1',w2:'W2 / Y2',comment:'Комментарий',dataStart:'Первая строка данных'};
async function editTemplateMapping(t){
  let history=[];try{const h=await MFAuth.api(`/api/import-templates/${t.id}/history`);history=h.versions||[]}catch{}
  const d=document.createElement('dialog');d.className='import-dialog';
  const keys=Object.keys(templateMapLabels),inputs=keys.map(k=>{const raw=t.mapping?.[k];const shown=k==='dataStart'?(Number.isFinite(+raw)?+raw+1:''):(Number.isFinite(+raw)&&+raw>=0?+raw+1:'');return `<div class="field"><label>${templateMapLabels[k]}</label><input data-map="${k}" type="number" min="${k==='dataStart'?1:0}" value="${shown}"></div>`}).join('');
  d.innerHTML=`<div class="import-dialog-card"><div class="panel-title"><span>Шаблон</span><h2>${esc(t.name)} · v${t.version}</h2></div><div class="notice">Номера колонок показываются как в Excel: A=1, B=2 и т.д. Пустое поле означает, что колонка не используется. Сохранение структуры создаёт новую версию.</div><div class="import-mapping">${inputs}</div>${history.length?`<div class="field"><label>История версий</label><select id="tplHistory">${history.map(v=>`<option value="${v.version}">v${v.version} · ${new Date(v.createdAt).toLocaleString('ru-RU')}</option>`).join('')}</select></div>`:''}<div class="actions-row import-dialog-actions"><button class="btn btn-ghost" data-close>Закрыть</button>${history.length?'<button class="btn btn-ghost" data-rollback>Вернуть выбранную версию</button>':''}<button class="btn btn-primary" data-save-map>Сохранить новую версию</button></div></div>`;
  document.body.appendChild(d);d.showModal();
  d.querySelector('[data-close]').onclick=()=>{d.close();d.remove()};
  d.querySelector('[data-save-map]').onclick=async()=>{const mapping={...(t.mapping||{})};d.querySelectorAll('[data-map]').forEach(i=>{const k=i.dataset.map,v=i.value.trim();if(k==='dataStart')mapping[k]=v?Math.max(0,+v-1):0;else mapping[k]=v?Math.max(-1,+v-1):-1});try{await MFAuth.api('/api/import-templates/'+t.id,{method:'PATCH',body:{mapping}});d.close();d.remove();await renderTemplates()}catch(e){alert(e.message)}};
  const rb=d.querySelector('[data-rollback]');if(rb)rb.onclick=async()=>{const v=+d.querySelector('#tplHistory').value;if(!confirm(`Вернуть структуру из версии v${v}? Текущая версия сохранится в истории.`))return;try{await MFAuth.api(`/api/admin/import-templates/${t.id}/rollback/${v}`,{method:'POST'});d.close();d.remove();await renderTemplates()}catch(e){alert(e.message)}};
}

async function renderTemplates(){
  if(!hasPerm('templates.manage')){el('templatesTab').innerHTML='<div class="notice warn">Нет права управлять шаблонами импорта.</div>';return}
  try{
    const x=await MFAuth.api('/api/admin/import-templates');templates=x.templates||[];
    el('templatesTab').innerHTML=`<div class="panel-title"><span>04</span><h2>Шаблоны импорта клиентов</h2></div><div class="notice"><b>Шаблон создаёт зарегистрированный клиент после первого Excel.</b> Здесь менеджер может проверить структуру, перевести её в рабочую и отключить ошибочный шаблон. Каждое изменение структуры создаёт новую версию.</div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Клиент</th><th>Шаблон</th><th>Версия</th><th>Статус</th><th>Активен</th><th>Структура</th><th></th></tr></thead><tbody>${templates.map(t=>`<tr data-id="${t.id}"><td><b>${esc(t.customerName||'')}</b><br><small>${esc(t.customerEmail||'')}</small></td><td><input data-f="name" value="${esc(t.name)}"></td><td>v${t.version}</td><td><select data-f="status">${Object.entries(templateStatusText).map(([k,v])=>`<option value="${k}" ${t.status===k?'selected':''}>${v}</option>`).join('')}</select></td><td><select data-f="isActive"><option value="true" ${t.isActive?'selected':''}>Да</option><option value="false" ${!t.isActive?'selected':''}>Нет</option></select></td><td><small>${esc(t.fingerprint)}</small></td><td><div class="file-actions"><button class="btn btn-ghost btn-sm" data-columns>Колонки</button><button class="btn btn-ghost btn-sm" data-save>Сохранить</button></div></td></tr>`).join('')}</tbody></table></div>`;
    el('templatesTab').querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{const tr=b.closest('tr'),body={};tr.querySelectorAll('[data-f]').forEach(x=>body[x.dataset.f]=x.dataset.f==='isActive'?x.value==='true':x.value);try{await MFAuth.api('/api/import-templates/'+tr.dataset.id,{method:'PATCH',body});await renderTemplates()}catch(e){alert(e.message)}});
    el('templatesTab').querySelectorAll('[data-columns]').forEach(b=>b.onclick=()=>{const t=templates.find(x=>String(x.id)===b.closest('tr').dataset.id);if(t)editTemplateMapping(t)});
  }catch(e){el('templatesTab').innerHTML='<div class="notice warn">'+esc(e.message)+'</div>'}
}

async function renderAudit(){
  try{const x=await MFAuth.api('/api/admin/audit');el('auditTab').innerHTML=`<div class="panel-title"><span>05</span><h2>Журнал действий</h2></div><table class="admin-table"><thead><tr><th>Дата</th><th>Пользователь ID</th><th>Действие</th><th>Объект</th></tr></thead><tbody>${x.items.map(a=>`<tr><td>${new Date(a.createdAt).toLocaleString('ru-RU')}</td><td>${a.actorUserId??'—'}</td><td>${esc(a.action)}</td><td>${esc(a.targetType)} ${esc(a.targetId)}</td></tr>`).join('')}</tbody></table>`}catch(e){el('auditTab').innerHTML='<div class="notice warn">'+esc(e.message)+'</div>'}
}

async function loadOrdersAndMetrics(){const [d,o]=await Promise.all([MFAuth.api('/api/admin/dashboard'),MFAuth.api('/api/admin/orders')]);orders=o.orders||[];renderMetrics(d.metrics);renderOrders()}
async function loadUsers(){if(me.role!=='admin')return;const u=await MFAuth.api('/api/admin/users');users=u.users||[];renderCustomers();renderStaff()}
async function loadAll(){await loadOrdersAndMetrics();await loadUsers()}

(async()=>{
  me=await MFAuth.me();
  if(!me||!['admin','manager','production','accounting','viewer'].includes(me.role)){location.href='login.html?next=admin.html';return}
  el('logout').onclick=MFAuth.logout;
  if(me.role!=='admin'){
    const c=document.querySelector('[data-tab=customers]'),s=document.querySelector('[data-tab=staff]'),a=document.querySelector('[data-tab=audit]');
    if(c)c.hidden=true;if(s)s.hidden=true;if(a)a.hidden=true;
  }
  if(!hasPerm('templates.manage')){const t=document.querySelector('[data-tab=templates]');if(t)t.hidden=true}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=async()=>{
    document.querySelectorAll('.admin-tab').forEach(x=>x.hidden=true);
    const target=el(b.dataset.tab+'Tab');if(target)target.hidden=false;
    document.querySelectorAll('[data-tab]').forEach(x=>x.className='btn btn-ghost');b.className='btn btn-primary';
    if(b.dataset.tab==='audit')await renderAudit();
    if(b.dataset.tab==='templates')await renderTemplates();
  });
  await loadAll();
})();
