(function(root){
 'use strict';
 function sync(it){
  const el=document.getElementById('base-options-controls');if(!el)return;
  const G=root.MF_GOLA,v=G.baseInfo(it);el.hidden=!v;if(!v)return;
  el.querySelector('#base-selection').textContent=G.family(v).label+' · '+(v.execution==='gola'?'Gola L':'Обычное исполнение');
  for(const b of el.querySelectorAll('[data-base-option]')){
   const key=b.dataset.baseOption,value=b.dataset.baseValue,target=G.available(v,{[key]:value});
   b.disabled=!target;b.setAttribute('aria-pressed',String(v[key]===value));
   b.hidden=key==='side'&&v.door_count===2;
  }
  el.querySelector('#base-side-label').hidden=v.door_count===2;
  el.querySelector('#base-source-note').textContent=v.execution==='gola'?G.brief(it):(v.purpose==='sink'?'Тумба под мойку: без полок и задней стенки.':'Полка и задняя стенка.');
 }
 root.MF_GOLA_UI=Object.freeze({sync});
})(globalThis);
