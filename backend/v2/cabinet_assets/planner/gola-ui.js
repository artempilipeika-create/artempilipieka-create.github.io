(function(root){
 'use strict';
 const C=()=>root.MF_FURNITURE_CORE,G=()=>root.MF_GOLA;
 const draft=v=>({item_id:'card',module_type:'base_cabinet',bazis_id:v.id,bazis_sha256:v.source_sha256,width:600,height:820,depth:510,body_height:720,base_height:100,base:'legs',handles:v.execution==='gola'?'handleless':'handles'});
 // Front elevations use the same dimensions as the production model.
 function drawing(v,{open=false,side=false}={}){
  if(!v)return '';
  const it=draft(v),p=C().PRODUCTION_MODELS[v.id],s=120/820,x=21,w=600*s,y=n=>137-n*s;
  let svg=`<ellipse cx="66" cy="140" rx="48" ry="5" fill="#dfe5da"/><path d="M${x+w} 17l12-7v105l-12 7z" fill="#c8d4c3" stroke="#7a8c72"/><path d="M${x} 17l12-7h${w}l-12 7z" fill="#e8ede2" stroke="#7a8c72"/><rect x="${x}" y="17" width="${w}" height="105.4" fill="${v.execution==='gola'?'#303832':'#d5dfce'}" stroke="#607357"/>`;
  svg+=`<path d="M${x+8} 123v13m${x+w-8}-13v13" stroke="#59684e" stroke-width="4"/>`;
  if(open){
   svg+=`<rect x="${x+3}" y="${v.execution==='gola'?23:20}" width="${w-6}" height="99" fill="#f4f5ed" stroke="#7a8c72"/>`;
   const shelves=C().productionParts(it,{production:p}).filter(n=>n.role==='shelf');
   const seen=new Set();for(const sh of shelves){const py=y(sh.position.y+sh.size.y/2);if(seen.has(py))continue;seen.add(py);svg+=`<path d="M${x+3} ${py}h${w-6}v3h-${w-6}z" fill="#c7d4bd" stroke="#7a8c72"/>`;}
   if(v.purpose==='sink')svg+='<path d="M50 38h34v6q0 12-12 12h-10q-12 0-12-12zM68 56v13q0 10 10 10h4" fill="none" stroke="#81917a" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"/>';
  }else{
   for(const f of C().facadeCells(it,{production:p})){
    const fx=x+(f.cx+300-f.w/2)*s,fy=y(f.cy+f.h/2),fw=f.w*s,fh=f.h*s;
    svg+=`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx=".7" fill="#f3f4e9" stroke="#7a8c72" stroke-width=".7"/>`;
    if(v.execution!=='gola'&&v.opening!=='push'){
     if(f.kind==='drawer'||f.kind==='drawers')svg+=`<path d="M${fx+fw*.35} ${fy+7}h${fw*.3}" stroke="#647354" stroke-width="2" stroke-linecap="round"/>`;
     else{const hx=v.side==='right'||(v.door_count===2&&f.cx>0)?fx+6:fx+fw-6;svg+=`<path d="M${hx} ${fy+fh*.4}v13" stroke="#647354" stroke-width="2" stroke-linecap="round"/>`;}
    }
   }
   if(v.layout==='inner')svg+='<rect x="32" y="31" width="66" height="13" rx="1" fill="#f8faf1" stroke="#5f7752" stroke-width="1.3" stroke-dasharray="3 2"/>';
  }
  if(side){const hx=v.side==='left'?x:x+w-3;svg+=`<path d="M${hx} 43h3v9h-3zM${hx} 96h3v9h-3z" fill="#526850"/>`;svg+=v.side==='left'?'<path d="M82 80H48m7-6-7 6 7 6" fill="none" stroke="#526850" stroke-width="2"/>':'<path d="M48 80h34m-7-6 7 6-7 6" fill="none" stroke="#526850" stroke-width="2"/>';}
  return '<svg viewBox="0 0 142 154" aria-hidden="true" focusable="false">'+svg+'</svg>';
 }
 function sync(it){
  const el=document.getElementById('base-options-controls');if(!el)return;
  const g=G(),v=g.baseInfo(it);el.hidden=!v;if(!v)return;
  el.querySelector('#base-selection').textContent=g.family(v).label+' · '+(v.execution==='gola'?'Gola L':'Обычное исполнение');
  for(const b of el.querySelectorAll('[data-base-option]')){
   const key=b.dataset.baseOption,value=b.dataset.baseValue,target=g.available(v,{[key]:value});
   b.disabled=!target;b.setAttribute('aria-pressed',String(v[key]===value));b.hidden=key==='side'&&v.door_count===2;
   const icon=b.querySelector('.gola-option-image');if(icon)icon.innerHTML=drawing(target,{open:key==='purpose',side:key==='side'});
  }
  const sideLabel=el.querySelector('#base-side-label');sideLabel.hidden=v.door_count===2;if(sideLabel.nextElementSibling)sideLabel.nextElementSibling.hidden=v.door_count===2;
  el.querySelector('#base-source-note').textContent=v.execution==='gola'?g.brief(it):(v.purpose==='sink'?'Тумба под мойку: без полок и задней стенки.':'Полка и задняя стенка.');
 }
 root.MF_GOLA_UI=Object.freeze({drawing,sync});
})(globalThis);
