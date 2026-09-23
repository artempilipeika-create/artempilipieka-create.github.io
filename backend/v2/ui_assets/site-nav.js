'use strict';
fetch('/api/v2/auth/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(u=>{if(u)document.querySelectorAll('[data-account-link]').forEach(a=>{a.textContent='Личный кабинет';a.href='/account';});}).catch(()=>{});
document.querySelectorAll('.mf-menu').forEach(menu=>{menu.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}});});
