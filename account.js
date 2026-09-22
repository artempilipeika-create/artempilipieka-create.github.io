'use strict';
const statusText={draft:'Черновик',manager_processing:'У менеджера на обработке',submitted:'Отправлен на проверку',review:'На проверке',approved:'Согласован',in_work:'В работе',ready:'Готов',issued:'Выдан',cancelled:'Отменён'};
const payText={unpaid:'Не оплачен',partial:'Частично оплачен',paid:'Оплачен'};
(async()=>{
  const u=await MFAuth.requireAuth();if(!u)return;
  hello.textContent='Здравствуйте, '+u.name;discount.textContent=(u.discountPercent||0)+'%';
  if(u.role==='admin'){const a=document.getElementById('adminNav');if(a)a.hidden=false;subState.textContent='Без ограничений';subUntil.textContent='Полный доступ администратора'}
  else if(u.subscription3dActive){subState.textContent='Активен';subUntil.textContent='до '+new Date(u.subscription3dUntil).toLocaleDateString('ru-RU')}
  else{subState.textContent='Не активен';subUntil.textContent='Для доступа нужна подписка на 30 дней'}
  if(u.isBlocked)blocked.innerHTML='<div class="notice warn"><b>Аккаунт заблокирован.</b> '+MFAuth.esc(u.blockReason||'Обратитесь в Martin Forest.')+'</div>';
  logout.onclick=MFAuth.logout;
  try{
    const x=await MFAuth.api('/api/orders');
    orders.innerHTML=x.orders.length?x.orders.map(o=>`<article class="order-card account-order"><div class="order-card-head"><div><b>${MFAuth.esc(o.orderNumber)} · ${MFAuth.esc(o.title)}</b><div class="muted">${new Date(o.createdAt).toLocaleDateString('ru-RU')}</div></div><div class="order-statuses"><span class="pill">${statusText[o.status]||o.status}</span><span class="pill pay-${o.paymentStatus}">${payText[o.paymentStatus]||o.paymentStatus}</span></div></div><div class="order-finance"><span>Сумма <b>${(o.finalTotal??o.preliminaryTotal).toFixed(2)} BYN</b></span><span>Оплачено <b>${o.paidAmount.toFixed(2)} BYN</b></span><span>Остаток <b>${o.balance.toFixed(2)} BYN</b></span></div><div class="actions-row">${o.hasSourceFile?`<a class="btn btn-ghost btn-sm" href="/api/orders/${o.id}/source">Исходный файл</a>`:''}${o.hasOblx?`<a class="btn btn-ghost btn-sm" href="/api/orders/${o.id}/oblx">OBLX</a>`:''}</div></article>`).join(''):'<div class="notice">Заказов пока нет. Создайте первый заказ.</div>';
  }catch(e){orders.innerHTML='<div class="notice warn">'+MFAuth.esc(e.message)+'</div>'}
})();
