(function(root){
 'use strict';
 const D=root.MF_DRAWERS;
 function drawing(layout,gola=false){
  const rows=layout==='three'?[[5,30],[38,30],[71,64]]:[[5,64],[72,63]];
  return '<svg viewBox="0 0 130 160" aria-hidden="true"><path d="M16 139v14m98-14v14" stroke="#475b4d" stroke-width="7"/>'+rows.map(([y,h])=>`<rect x="8" y="${y}" width="114" height="${h}" rx="3" fill="#e5ebe3" stroke="#526850" stroke-width="2"/>${gola?'':`<path d="M48 ${y+10}h34" stroke="#526850" stroke-width="3"/>`}`).join('')+(gola?'<path d="M8 3h114M8 69h114" stroke="#252b29" stroke-width="6"/>':'')+(layout==='inner'?'<rect x="19" y="20" width="92" height="22" rx="2" fill="#fff" stroke="#526850" stroke-width="2" stroke-dasharray="4 3"/>':'')+'</svg>';
 }
 function sync(it,p){
  const el=document.getElementById('drawer-options-controls');if(!el)return;
  const v=D.familyInfo(it);el.hidden=!v;if(!v)return;
  const ordinary=v.system==='ball';
  for(const b of el.querySelectorAll('[data-drawer-option]')){
   const key=b.dataset.drawerOption,value=b.dataset.drawerValue,target=D.available(v,{[key]:value}),error=D.selectionError(it,target);
   b.disabled=Boolean(error);b.setAttribute('aria-pressed',String(v[key]===value));
   b.title=error;
   const icon=b.querySelector('.drawer-option-image');if(icon)icon.innerHTML=drawing(value,v.execution==='gola');
   if(key==='execution'&&value==='standard'){const caption=b.querySelector('small');if(caption)caption.textContent=target?.opening==='push'?'Push to open':'Накладные ручки';}
   const executionImage=b.querySelector('.gola-option-image');if(executionImage)executionImage.innerHTML=root.MF_GOLA_UI?.drawing(target||D.choices().find(n=>n.execution===value&&n.system===v.system&&n.layout===v.layout))||'';
  }
  el.querySelector('#drawer-selection').textContent=v.manufacturer+' · '+v.series+' · '+D.openings[v.opening]+(v.execution==='gola'?' · Gola II':'');
  el.querySelector('#drawer-leg-note').textContent=(v.execution==='gola'?root.MF_GOLA.adjustment(it):D.adjustment(it))?.note||'';
  const fronts=D.frontHeights(it);
  el.querySelector('#drawer-fronts').textContent='Фасады снизу вверх: '+fronts.map(x=>String(x).replace('.',',')).join(' + ')+' мм'+(v.execution==='gola'&&v.system==='aq'&&v.layout==='three'&&fronts[1]===162.5?' · два верхних фасада по 162,5 мм':'');
  el.querySelector('#drawer-inner-note').hidden=v.layout!=='inner';
  el.querySelector('#drawer-construction').textContent=ordinary
   ?'Ящики из ЛДСП 18 мм в декоре корпуса, днища — ЛХДФ 3 мм. Шариковые направляющие с доводчиком · '+(v.execution==='gola'?root.MF_GOLA.configuration(it).drawers[0]?.kit.length_mm:root.MF_FURNITURE_CORE.drawerSlideLengthMm(it.depth))+' мм · подбор по глубине корпуса.'
   :'Белая фурнитура · направляющие '+D.railLengths(it).join(' / ')+' мм. Корпус '+(it.height-(it.legHeightMm??it.base_height??100))+' мм, глубина '+it.depth+' мм. Типы ящиков и длины направляющих подбираются по правилам фрагмента. Дно и задние стенки ящиков — 16 мм в декоре корпуса.';
  el.querySelector('#drawer-board-material-controls').hidden=ordinary;
  el.querySelector('#drawer-material-note').textContent=ordinary
   ?'Стенки ящиков используют выбранный материал корпуса 18 мм. Для днищ и задника выберите ЛХДФ 3 мм.'
   :'Без отдельного выбора ящики в 3D наследуют цвет корпуса. Для распила выберите плиту 16 мм и задник 3 мм. Выбранный материал ящиков 16 мм сохраняется при смене корпуса.';
  el.querySelector('#drawer-back-label').textContent=ordinary?'Днища ящиков и задник корпуса · 3 мм':'Задник корпуса · 3 мм';
  const restriction=ordinary?D.selectionError(it,D.available(v,{system:'aq'})):'';
  el.querySelector('#drawer-availability').textContent=(v.execution==='gola'?'Gola II: профиль L сверху и C между фасадами. Push to open для этих исходников не предусмотрен. ':'')+(restriction?restriction+' ':'')+(v.system==='slimbox'&&(v.opening==='push'||v.layout==='inner')
   ?'Для перехода на обычные шариковые или AQ LineBox выберите 2 или 3 ящика и доводчик.'
   :'Обычные шариковые и AQ LineBox: 2 или 3 ящика с доводчиком. '+(v.execution==='gola'?'Внутренний ящик доступен у Slimbox Evolution.':'Push to open и внутренний ящик доступны у Slimbox Evolution.'));
 }
 root.MF_DRAWER_UI=Object.freeze({drawing,sync});
})(globalThis);
