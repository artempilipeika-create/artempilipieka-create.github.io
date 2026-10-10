(function(root){
  'use strict';
  const names={left:'Слева',right:'Справа',both:'Две стороны'};
  function drawing(lighting,opening='left',count=1){
    const sides=lighting==='both'?['left','right']:[lighting];
    let s='<rect x="2" y="2" width="596" height="1896" rx="2" fill="#dbe5de" stroke="#202a25" stroke-width="19"/>';
    for(let i=1;i<=count;i++)s+=`<path d="M22 ${1896*i/(count+1)}H578" stroke="#849f96" stroke-width="9"/>`;
    for(const side of sides)s+=`<path d="M${side==='left'?30:570} 24V1876" stroke="#fff8ce" stroke-width="18"/>`;
    s+=`<path d="M${opening==='left'?2:598} 120v60m0 480v60m0 480v60m0 480v60" stroke="#202a25" stroke-width="30"/><path d="M55 1900v100M545 1900v100" stroke="#53664f" stroke-width="24"/>`;
    return `<svg viewBox="-25 -25 650 2050" role="img" aria-label="Подсветка: ${names[lighting]}">${s}</svg>`;
  }
  function sync(it,p){
    const el=document.getElementById('vitrine-options-controls');if(!el)return;
    const v=p?.vitrine;el.hidden=!v;if(!v)return;
    const V=root.MF_VITRINE,m=V.metrics(it),n=V.shelves(it).length;
    el.querySelector('#vitrine-light-system').value=v.light_system;
    el.querySelector('#vitrine-light-note').textContent=V.lighting(it).ui_note;
    for(const b of el.querySelectorAll('[data-vitrine-option]')){
      b.setAttribute('aria-pressed',String(v[b.dataset.vitrineOption]===b.dataset.vitrineValue));
      const icon=b.querySelector('.vt-option-image');if(icon)icon.innerHTML=drawing(b.dataset.vitrineValue,v.opening,n);
    }
    el.querySelector('#vitrine-shelf-count').textContent=n;
    el.querySelector('#vitrine-shelf-minus').disabled=n===0;el.querySelector('#vitrine-shelf-plus').disabled=n===8;
    el.querySelector('#vitrine-shelf-reset').disabled=it.glass_shelf_count==null;
    el.querySelector('#vitrine-shelf-note').textContent=it.glass_shelf_count==null?'Исходная стеклянная полка 4 мм.':n+' полк. · равные промежутки. Количество и отметки переданы конструктору для изменения полок в БАЗИС.';
    el.querySelector('#vitrine-quantities').textContent=`Лента: ${m.led_order_length_m} м${m.light_profile_length_m?` · LIRA с экраном: ${m.light_profile_stock_count} × ${m.light_profile_stock_mm/1000} м · заглушки: ${m.light_profile_end_caps} шт.`:''} · Z1: ${m.profile_length_m} м · уплотнитель: ≈ ${m.seal_length_m} м · уголки: 4 шт. · KUBIC: ${n*4} шт.`;
    el.querySelector('#vitrine-native-size-note').hidden=v.global_elastic_defined;
  }
  root.MF_VITRINE_UI=Object.freeze({drawing,sync});
})(globalThis);
