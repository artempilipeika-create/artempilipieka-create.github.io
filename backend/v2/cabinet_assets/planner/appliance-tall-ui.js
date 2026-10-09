/* Exact, dimension-based diagrams for the appliance cabinet selector. */
(function(){
  const labels={door_oven:'Дверь + духовка',door_oven_micro:'Дверь + духовка + микроволновка',drawer_oven:'Шуфляда + духовка',drawer_oven_micro:'Шуфляда + духовка + микроволновка'};
  function drawing(v,height=v.native_height){
    const H=height,y=n=>H-n,lower=v.panels.find(p=>p.key==='front-lower'),upper=v.panels.find(p=>p.key==='door-upper');
    const rect=(x,b,w,h,cls)=>`<rect class="${cls}" x="${x}" y="${y(b+h)}" width="${w}" height="${h}"/>`;
    let s=rect(0,100,600,H-100,'ap-carcass');
    for(const p of [lower,upper]){const h=p.size[1]+(p===upper?H-v.native_height:0);s+=rect(1.5,p.center[1]-p.size[1]/2,597,h,'ap-front');}
    function appliance(bottom,h,extendBefore=0,extendAfter=0){s+=rect(18,bottom-extendBefore,564,h+extendBefore+extendAfter,'ap-device')+rect(64,bottom+40,472,h-145,'ap-glass')+`<path class="ap-handle" d="M100 ${y(bottom+h-65)}H500"/>`;}
    appliance(v.oven_bottom,595,0,v.microwave?9:0);if(v.microwave)appliance(v.oven_bottom+613,380,9,0);
    const hx=v.opening==='left'?535:65,upperY=y(upper.center[1]-upper.size[1]/2+60),lowerY=y(lower.center[1]+lower.size[1]/2-60);
    s+=`<path class="ap-handle" d="M${hx} ${upperY}v-95${v.drawer?` M210 ${lowerY}h180`:` M${hx} ${lowerY}v95`}"/>`;
    s+=`<path class="ap-leg" d="M65 ${y(100)}v100M535 ${y(100)}v100"/>`;
    return `<svg viewBox="-25 -25 650 ${H+50}" role="img" aria-label="${labels[v.layout]}">${s}</svg>`;
  }
  function sync(it,v){
    const root=document.getElementById('appliance-tall-choice');if(!root)return;
    root.hidden=v?.family!=='appliance';
    document.getElementById('tall-options-title').textContent=v?.family==='appliance'?'Пенал под технику':'Пенал с полками';
    document.querySelector('[data-tall-value="double"]').hidden=v?.family==='appliance';
    if(root.hidden)return;
    root.querySelector('#appliance-tall-preview').innerHTML=drawing(v,it.height);
    root.querySelector('#appliance-tall-size').textContent=`600 × 600 × ${it.height} мм · с ножками 100 мм`;
    for(const b of root.querySelectorAll('[data-tall-option="layout"]')){
      const option=globalThis.MF_FURNITURE_CORE.APPLIANCE_TALL_VARIANTS.find(x=>x.layout===b.dataset.tallValue&&x.row_height===v.row_height&&x.opening===v.opening);
      b.querySelector('.ap-option-image').innerHTML=drawing(option,Math.max(it.height,option.min_height));
    }
    const select=root.querySelector('#appliance-tall-height');
    select.replaceChildren();
    for(const h of [...new Set([2000,2200,2400,2600,2800,it.height])].sort((a,b)=>a-b)){
      if(h<v.min_height)continue;const o=document.createElement('option');o.value=h;o.textContent=h+' мм';o.selected=h===it.height;select.append(o);
    }
    root.querySelector('#appliance-tall-niches').textContent='Ниша духовки: 564 × 595 мм'+(v.microwave?' · СВЧ: 564 × 380 мм':'')+'. Техника показана условно.';
  }
  globalThis.MF_APPLIANCE_TALL_UI=Object.freeze({drawing,sync,labels});
})();
