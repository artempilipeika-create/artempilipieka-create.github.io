(function(root){
 const D=()=>root.MF_PULLOUT_DRYERS;
 function sync(it){
  const box=document.getElementById('pullout-dryer-controls'),v=D().info(it);if(!box)return;box.hidden=!v;if(!v)return;
  for(const s of box.querySelectorAll('[data-dryer-option]')){
   const key=s.dataset.dryerOption;
   if(key==='width'){s.replaceChildren(...v.allowed_widths.map(w=>{const o=document.createElement('option');o.value=String(w);o.textContent=w+' мм';return o;}));s.value=String(it.width);}
   else s.value=v[key];
  }
  const norwing=box.querySelector('[data-dryer-option="dryer_brand"] option[value="norwing"]');norwing.disabled=it.width===900;
  box.querySelector('#pullout-dryer-note').textContent=D().brief(it)+(it.width===900?' Для NORWING сначала выберите ширину 600, 700 или 800 мм.':'');
 }
 root.MF_PULLOUT_DRYER_UI={sync};
})(globalThis);
