(function(root){
 'use strict';
 const D=root.MF_DRAWERS;
 function drawing(layout){
  const rows=layout==='three'?[[5,30],[38,30],[71,64]]:[[5,64],[72,63]];
  return '<svg viewBox="0 0 130 160" aria-hidden="true"><path d="M16 139v14m98-14v14" stroke="#475b4d" stroke-width="7"/>'+rows.map(([y,h])=>`<rect x="8" y="${y}" width="114" height="${h}" rx="3" fill="#e5ebe3" stroke="#526850" stroke-width="2"/><path d="M48 ${y+10}h34" stroke="#526850" stroke-width="3"/>`).join('')+(layout==='inner'?'<rect x="19" y="20" width="92" height="22" rx="2" fill="#fff" stroke="#526850" stroke-width="2" stroke-dasharray="4 3"/>':'')+'</svg>';
 }
 function sync(it,p){
  const el=document.getElementById('drawer-options-controls');if(!el)return;
  const v=p?.metal_drawers;el.hidden=!v;if(!v)return;
  for(const b of el.querySelectorAll('[data-drawer-option]')){
   const key=b.dataset.drawerOption,value=b.dataset.drawerValue,ok=D.available(v,{[key]:value});
   b.disabled=!ok;b.setAttribute('aria-pressed',String(v[key]===value));
   b.title=ok?'':'Нет такого сочетания в загруженных фрагментах';
   const icon=b.querySelector('.drawer-option-image');if(icon)icon.innerHTML=drawing(value);
  }
  el.querySelector('#drawer-selection').textContent=v.manufacturer+' · '+v.series+' · '+D.openings[v.opening];
  el.querySelector('#drawer-leg-note').textContent=D.adjustment(it)?.note||'';
  el.querySelector('#drawer-fronts').textContent='Фасады снизу вверх: '+v.front_heights.map(x=>String(x).replace('.',',')).join(' + ')+' мм';
  el.querySelector('#drawer-inner-note').hidden=v.layout!=='inner';
  el.querySelector('#drawer-availability').textContent=v.system==='aq'?'AQ LineBox: 2 или 3 ящика с доводчиком. Для Push to open и внутреннего ящика выберите Slimbox Evolution.':(v.opening==='push'||v.layout==='inner')?'Для перехода на AQ LineBox выберите 2 или 3 ящика и доводчик.':'';
 }
 root.MF_DRAWER_UI=Object.freeze({drawing,sync});
})(globalThis);
