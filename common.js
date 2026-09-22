(function(){
  const t=document.querySelector('.menu-toggle'),m=document.querySelector('.mobile-menu');
  if(t&&m){t.addEventListener('click',()=>{const o=m.classList.toggle('open');t.classList.toggle('open',o);t.setAttribute('aria-expanded',String(o));document.body.classList.toggle('menu-open',o)});m.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{m.classList.remove('open');t.classList.remove('open');t.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));}
  window.MF = window.MF || {};
  MF.norm = function(v=''){const map={'А':'A','В':'B','С':'C','Е':'E','Н':'H','К':'K','М':'M','О':'O','Р':'P','Т':'T','Х':'X','а':'A','в':'B','с':'C','е':'E','н':'H','к':'K','м':'M','о':'O','р':'P','т':'T','х':'X'};return String(v).split('').map(c=>map[c]||c).join('').toUpperCase().replace(/[^A-Z0-9А-ЯЁ]+/g,'');};
  MF.esc = function(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));};
  MF.money = function(v,c='BYN'){return (typeof v==='number'&&isFinite(v))?`${v.toFixed(2)} ${c}`:'—';};
  MF.download = function(name,content,type='text/plain;charset=utf-8'){const b=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);};
  MF.uuid = function(){return (crypto.randomUUID?crypto.randomUUID():'xxxxxxx'.replace(/x/g,()=>Math.floor(Math.random()*16).toString(16)));};
})();
