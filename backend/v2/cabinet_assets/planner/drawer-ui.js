(function(root){
 'use strict';
 const D=root.MF_DRAWERS;
 function drawing(layout){
  const rows=layout==='three'?[[5,30],[38,30],[71,64]]:[[5,64],[72,63]];
  return '<svg viewBox="0 0 130 160" aria-hidden="true"><path d="M16 139v14m98-14v14" stroke="#475b4d" stroke-width="7"/>'+rows.map(([y,h])=>`<rect x="8" y="${y}" width="114" height="${h}" rx="3" fill="#e5ebe3" stroke="#526850" stroke-width="2"/><path d="M48 ${y+10}h34" stroke="#526850" stroke-width="3"/>`).join('')+(layout==='inner'?'<rect x="19" y="20" width="92" height="22" rx="2" fill="#fff" stroke="#526850" stroke-width="2" stroke-dasharray="4 3"/>':'')+'</svg>';
 }
 function sync(it,p){
  const el=document.getElementById('drawer-options-controls');if(!el)return;
  const v=D.familyInfo(it);el.hidden=!v;if(!v)return;
  const ordinary=v.system==='ball';
  for(const b of el.querySelectorAll('[data-drawer-option]')){
   const key=b.dataset.drawerOption,value=b.dataset.drawerValue,target=D.available(v,{[key]:value}),error=D.selectionError(it,target);
   b.disabled=Boolean(error);b.setAttribute('aria-pressed',String(v[key]===value));
   b.title=error;
   const icon=b.querySelector('.drawer-option-image');if(icon)icon.innerHTML=drawing(value);
  }
  el.querySelector('#drawer-selection').textContent=v.manufacturer+' · '+v.series+' · '+D.openings[v.opening];
  el.querySelector('#drawer-leg-note').textContent=D.adjustment(it)?.note||'';
  el.querySelector('#drawer-fronts').textContent='Фасады снизу вверх: '+D.frontHeights(it).map(x=>String(x).replace('.',',')).join(' + ')+' мм';
  el.querySelector('#drawer-inner-note').hidden=v.layout!=='inner';
  el.querySelector('#drawer-construction').textContent=ordinary
   ?'Ящики из ЛДСП 18 мм в декоре корпуса, днища — ЛХДФ 3 мм. Шариковые направляющие с доводчиком · '+root.MF_FURNITURE_CORE.drawerSlideLengthMm(it.depth)+' мм · подбор по глубине корпуса.'
   :'Белая фурнитура · длина 500 мм. Корпус 720 мм, глубина 510 мм. Дно и задние стенки ящиков — 16 мм в декоре корпуса.';
  el.querySelector('#drawer-board-material-controls').hidden=ordinary;
  el.querySelector('#drawer-material-note').textContent=ordinary
   ?'Стенки ящиков используют выбранный материал корпуса 18 мм. Для днищ и задника выберите ЛХДФ 3 мм.'
   :'В 3D ящики наследуют декор корпуса. Для распила выберите тот же декор в толщине 16 мм и материал задника 3 мм.';
  el.querySelector('#drawer-back-label').textContent=ordinary?'Днища ящиков и задник корпуса · 3 мм':'Задник корпуса · 3 мм';
  const restriction=ordinary?D.selectionError(it,D.available(v,{system:'aq'})):'';
  el.querySelector('#drawer-availability').textContent=(restriction?restriction+' ':'')+(v.system==='slimbox'&&(v.opening==='push'||v.layout==='inner')
   ?'Для перехода на обычные шариковые или AQ LineBox выберите 2 или 3 ящика и доводчик.'
   :'Обычные шариковые и AQ LineBox: 2 или 3 ящика с доводчиком. Push to open и внутренний ящик доступны у Slimbox Evolution.');
 }
 root.MF_DRAWER_UI=Object.freeze({drawing,sync});
})(globalThis);
