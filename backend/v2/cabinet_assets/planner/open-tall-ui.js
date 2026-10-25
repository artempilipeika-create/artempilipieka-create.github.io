(function(root){
 root.MF_OPEN_TALL_UI={sync(it){
  const O=root.MF_OPEN_TALL,box=document.getElementById('open-tall-controls'),v=O.info(it);if(!box)return;box.hidden=!v;if(!v)return;
  for(const s of box.querySelectorAll('[data-open-tall-option]')){s.value=v[s.dataset.openTallOption];if(s.dataset.openTallOption==='lighting'){s.disabled=v.light_system==='none';if(s.disabled)s.value='left';}}
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
