(function(root){
 'use strict';
 // Same line drawings and green selection treatment as the lower drawer cards.
 function drawing(option,value,current){
  const v={...current,[option]:value},double=v.door_count===2,side=v.side;
  const frame='<rect x="15" y="10" width="100" height="130" rx="3" fill="#e5ebe3" stroke="#526850" stroke-width="2"/>';
  let details='';
  if(option==='filling'){
   details='<rect x="21" y="16" width="88" height="118" fill="#fafbf8" stroke="#526850" stroke-width="1.5"/>';
   if(value==='shelves')details+='<path d="M21 74h88v5H21z" fill="#d3dfcf" stroke="#526850" stroke-width="1.5"/>';
   else{
    details+='<path d="M26 51h78v4H26zM26 119h78v5H26z" fill="#d3dfcf" stroke="#526850" stroke-width="1.5"/>';
    for(let x=30;x<101;x+=16)details+='<path d="M'+x+' 37v12h10V37m0 2h3v7h-3" fill="none" stroke="#526850" stroke-width="1.5"/>';
    for(let x=34;x<103;x+=11)details+='<ellipse cx="'+x+'" cy="100" rx="4" ry="18" fill="#edf2e9" stroke="#526850" stroke-width="1.5"/>';
   }
  }else{
   if(double)details+='<path d="M65 11v128" stroke="#526850" stroke-width="2"/>';
   const handles=double?[49,73]:[side==='right'?29:87];
   if(v.execution==='handles')for(const x of handles)details+='<path d="M'+x+' 122h14" stroke="#526850" stroke-width="4" stroke-linecap="round"/>';
   if(v.execution==='handleless')details+='<path d="M23 135h84" stroke="#526850" stroke-width="3"/><path d="M65 155v-11m-4 4 4-4 4 4" fill="none" stroke="#526850" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
   if(v.execution==='push')details+='<circle cx="92" cy="118" r="12" fill="#fafbf8" stroke="#526850" stroke-width="1.5" stroke-dasharray="3 3"/><path d="M113 139 94 120m0 9v-9h9" fill="none" stroke="#526850" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
   if(option==='side'){
    const x=side==='left'?15:109;
    details+='<path d="M'+x+' 35h6v12h-6zM'+x+' 103h6v12h-6z" fill="#526850"/>';
    details+=side==='left'?'<path d="M90 76H41m9-8-9 8 9 8" fill="none" stroke="#526850" stroke-width="2.5"/>':'<path d="M40 76h49m-9-8 9 8-9 8" fill="none" stroke="#526850" stroke-width="2.5"/>';
   }
  }
  return '<svg viewBox="0 0 130 160" aria-hidden="true" focusable="false">'+frame+details+'</svg>';
 }
 function sync(it){
  const el=document.getElementById('upper-options-controls');if(!el)return;
  const U=root.MF_UPPERS,v=U.info(it);el.hidden=!v;if(!v)return;
  el.querySelector('#upper-title').textContent='Верхний шкаф · ВМД'+v.door_count;
  el.querySelector('#upper-side-options').hidden=v.door_count===2;
  for(const b of el.querySelectorAll('[data-upper-option]')){
   const key=b.dataset.upperOption,value=b.dataset.upperValue,target=U.available(v,{[key]:value});
   const error=target?U.dimensionError(it,target):'Нет такого фрагмента';
   b.disabled=Boolean(error);b.setAttribute('aria-pressed',String(v[key]===value));b.title=error;
   const icon=b.querySelector('.upper-option-image');if(icon)icon.innerHTML=drawing(key,value,v);
  }
  el.querySelector('#upper-selection').textContent=(v.filling==='dryer'?'Сушка':'Полки')+' · '+U.executions[v.execution]+(v.door_count===1?' · '+(v.side==='left'?'L':'P'):'');
 }
 root.MF_UPPER_UI=Object.freeze({drawing,sync});
})(globalThis);
