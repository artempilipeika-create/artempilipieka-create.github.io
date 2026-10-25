(function(root){
 'use strict';
 function drawing(it,system,side){
  const O=root.MF_OPEN_TALL,ys=O.shelves(it).map(y=>18+(it.height-18-y)/(it.height-136)*166).sort((a,b)=>a-b),profile=system==='lira-17.5x6.5';
  // Front view: each luminous segment ends at the wooden shelf, as in the model.
  let svg='<ellipse cx="60" cy="201" rx="42" ry="5" fill="#23352c" opacity=".12"/><path d="M22 8H98V192H22Z" fill="#d8dfd8" stroke="#718073" stroke-width="1.3"/><path d="M28 14H92V186H28Z" fill="#c5cec5"/><path d="M28 14L34 20V180L28 186Z" fill="#aab7ab"/><path d="M92 14L86 20V180L92 186Z" fill="#e4e9e0"/><path d="M34 20H86V180H34Z" fill="#dfe6da"/>';
  const starts=[18,...ys.map(y=>y+2)],ends=[...ys.map(y=>y-2),184];
  if(system!=='none')for(const s of side==='both'?['left','right']:[side]){
   const x=s==='left'?31:89;
   for(let i=0;i<starts.length;i++){
    if(profile)svg+=`<path d="M${x} ${starts[i]}V${ends[i]}" stroke="#38463c" stroke-width="5"/>`;
    svg+=`<path d="M${x} ${starts[i]}V${ends[i]}" stroke="#ffe8a1" stroke-width="${profile?10:7}" opacity=".36"/><path d="M${x} ${starts[i]}V${ends[i]}" stroke="#fff9d2" stroke-width="${profile?2.8:1.7}"/>`;
   }
  }
  for(const y of ys)svg+=`<path d="M34 ${y-4}H86L92 ${y}H28Z" fill="#f2f2e8"/><path d="M28 ${y}H92V${y+2.4}H28Z" fill="#9aa997"/>`;
  svg+='<path d="M28 184H92V188H28Z" fill="#ecefe6"/><path d="M29 193H91V200H29Z" fill="#8e9c8e"/>';
  return `<svg viewBox="0 0 120 210" xmlns="http://www.w3.org/2000/svg" focusable="false">${svg}</svg>`;
 }
 root.MF_OPEN_TALL_UI={sync(it){
  const O=root.MF_OPEN_TALL,box=document.getElementById('open-tall-controls'),v=O.info(it);if(!box)return;box.hidden=!v;if(!v)return;
  box.querySelector('#open-tall-lighting-choices').hidden=v.light_system==='none';
  for(const b of box.querySelectorAll('[data-open-tall-option]')){
   const key=b.dataset.openTallOption,value=b.dataset.openTallValue;
   b.setAttribute('aria-pressed',String(v[key]===value));
   b.querySelector('.ot-option-image').innerHTML=drawing(it,key==='light_system'?value:v.light_system,key==='lighting'?value:v.lighting==='none'?'left':v.lighting);
  }
  const n=O.shelves(it).length;
  document.getElementById('open-tall-shelf-count').textContent=String(n);
  document.getElementById('open-tall-shelf-minus').disabled=n<=1;
  document.getElementById('open-tall-shelf-plus').disabled=n>=8;
  document.getElementById('open-tall-shelf-reset').disabled=it.upper_shelf_count==null;
  const m=O.metrics(it);
  document.getElementById('open-tall-note').textContent='Корпус, задняя стенка и полки — ЛДСП 18 мм. Полки '+(it.width-36)+' × '+(it.depth-18-v.shelf_front_setback_mm)+' × 18 мм. '+
   (v.light_system==='none'?'Без подсветки. ':'Подсветка разделена по отделениям; лента '+m.led_order_length_m+' м. ')+
   (it.upper_shelf_count==null?'Исходная полка: центр 1050 мм от пола.':'Полки распределены равномерно. В БАЗИС количество, положение и присадку полок нужно изменить по экспортному заданию.');
 }};
})(globalThis);
