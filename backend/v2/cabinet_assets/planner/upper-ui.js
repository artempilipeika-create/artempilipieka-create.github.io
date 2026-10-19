(function(root){
 'use strict';
 function sync(it){
  const el=document.getElementById('upper-options-controls');if(!el)return;
  const U=root.MF_UPPERS,v=U.info(it);el.hidden=!v;if(!v)return;
  el.querySelector('#upper-side-options').hidden=v.door_count===2;
  for(const b of el.querySelectorAll('[data-upper-option]')){
   const key=b.dataset.upperOption,value=b.dataset.upperValue,target=U.available(v,{[key]:value});
   const error=target?U.dimensionError(it,target):'Нет такого фрагмента';
   b.disabled=Boolean(error);b.setAttribute('aria-pressed',String(v[key]===value));b.title=error;
  }
  el.querySelector('#upper-selection').textContent=U.brief(it);
 }
 root.MF_UPPER_UI=Object.freeze({sync});
})(globalThis);
