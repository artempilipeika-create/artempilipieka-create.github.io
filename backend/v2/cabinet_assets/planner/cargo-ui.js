(function(root){
 function sync(it){
  const C=root.MF_CARGO,box=document.getElementById('cargo-controls'),v=C.info(it);if(!box)return;box.hidden=!v;if(!v)return;box.querySelector('h3').textContent=v.waste?'Мусорные контейнеры GEO X':'Карго';
  const brand=box.querySelector('[data-cargo-option=brand]');if(v.waste){brand.replaceChildren(new Option('GEO X','geo'));}else if(!brand.querySelector('option[value=focus]'))brand.replaceChildren(...['focus','norwing','icon'].map(b=>new Option(b.toUpperCase(),b)));
  for(const s of box.querySelectorAll('[data-cargo-option]')){
   const key=s.dataset.cargoOption;
   if(key==='width')s.replaceChildren(...v.source_widths.map(w=>{const o=document.createElement('option');o.value=String(w);o.textContent=w+' мм'+(v.allowed_widths.includes(w)?'':' · требуется исправление');o.disabled=!v.allowed_widths.includes(w);return o;}));
   s.value=String(key==='width'?it.width:v[key]);
  }
  const nw=box.querySelector('[data-cargo-option="brand"] option[value="norwing"]');if(nw)nw.disabled=it.width===150;
  box.querySelector('#cargo-note').textContent=C.brief(it)+(v.brand==='norwing'?' '+v.warnings.join(' '):it.width===150?' Для перехода на NORWING сначала выберите ширину от 200 мм.':'');
 }
 root.MF_CARGO_UI={sync};
})(globalThis);
