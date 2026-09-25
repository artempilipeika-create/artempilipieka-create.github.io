/* Martin Forest Studio 1.0 — a removable presentation adapter for 98d5a73c.
 * The original 3d.js, facade calculator, state schema, API and native exporter
 * remain unchanged. No additional framework, remote assets or storage.
 */
'use strict';
(function installMartinForestStudio(){
  if(!window.MF3D_KITCHEN || document.body.dataset.studioVersion)return;
  const get=id=>document.getElementById(id);
  const original={renderItems,updateAll,syncControls,applyCatalogueFilter,addCatalogueButton,
    renderModuleCatalogue,draw3d,draw2d,proj3,colorFor,saveProject,openProject,newProject,status};
  const categoryNames={base:'Нижние',wall:'Верхние',tall:'Пеналы',other:'Прочее'};
  const catalogue=new Map();
  let rowsSignature='',baseline=null,saving=false,geometryVersion=0,drawKey='';
  let cameraTarget={x:0,y:0,z:0};
  let busySave=null;
  const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const plural=(n,forms=['модуль','модуля','модулей'])=>{const a=n%100,b=n%10;return n+' '+forms[a>=11&&a<=14?2:b===1?0:b>=2&&b<=4?1:2];};
  const titleText=s=>String(s||'').toLocaleLowerCase('ru-RU').replaceAll('ё','е');
  const itemGroup=it=>categoryKey(it);
  function defaultItem(opt){
    const template=opt.bazis?bazisById.get(opt.bazis):opt.template?kitchenTemplates[opt.template]:null;
    const d=template?.defaults||moduleDefs[opt.module]||moduleDefs.chest;
    return{item_id:'preview',template_id:opt.template||null,bazis_id:opt.bazis||null,
      module_type:template?.module_type||opt.module||'chest',width:d.w,height:d.h,depth:d.d,
      layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles'};
  }
  function descriptionFor(it,source){
    const t=templateFor(it),front=t?.front||legacyFrontSpec(it);
    if(front.kind==='none')return 'Открытый модуль';
    if(front.kind==='drawers')return plural(front.count||it.drawers,['ящик','ящика','ящиков']);
    if(front.kind==='doors')return plural(front.count||1,['дверь','двери','дверей']);
    if(front.kind==='combo')return 'Ящики и двери';
    if(front.kind==='niche')return 'Ящики и открытая ниша';
    return source||'Свободная компоновка';
  }
  function paintPreview(c,it){
    const x=c.getContext('2d');if(!x)return;
    const w=c.width,h=c.height,s=Math.min(w*.57/it.width,h*.69/it.height);
    const W=it.width*s,H=it.height*s,D=Math.min(w*.19,it.depth*s*.34),rise=D*.39;
    const bx=(w-W-D)/2,by=h*.81-H;
    x.clearRect(0,0,w,h);
    const bg=x.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#f6f6f0');bg.addColorStop(1,'#ecefe6');x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h*.83);x.scale(1,.21);const shadow=x.createRadialGradient(0,0,0,0,0,Math.max(15,(W+D)*.75));shadow.addColorStop(0,'rgba(60,73,45,.20)');shadow.addColorStop(1,'rgba(60,73,45,0)');x.fillStyle=shadow;x.beginPath();x.arc(0,0,Math.max(15,(W+D)*.75),0,Math.PI*2);x.fill();x.restore();
    function polygon(points,fill,stroke){x.beginPath();points.forEach(([a,b],i)=>i?x.lineTo(a,b):x.moveTo(a,b));x.closePath();x.fillStyle=fill;x.fill();if(stroke){x.strokeStyle=stroke;x.lineWidth=.8;x.stroke();}}
    polygon([[bx+W,by],[bx+W+D,by-rise],[bx+W+D,by+H-rise],[bx+W,by+H]],'#c7b89b','#a99e86');
    polygon([[bx,by],[bx+D,by-rise],[bx+W+D,by-rise],[bx+W,by]],'#dfd8c6','#c0b8a4');
    x.fillStyle='#8e8a75';x.fillRect(bx,by,W,H);
    const cells=facadeCells(it);
    for(const f of cells){
      const px=bx+(f.cx+it.width/2-f.w/2)*s,py=by+H-(f.cy+f.h/2)*s;
      const fw=Math.max(1,f.w*s),fh=Math.max(1,f.h*s);
      const front=x.createLinearGradient(px,py,px+fw,py+fh);front.addColorStop(0,'#fbfaf4');front.addColorStop(1,'#e1e3d7');
      x.fillStyle=front;x.fillRect(px,py,fw,fh);x.strokeStyle='#bfc6b6';x.lineWidth=.65;x.strokeRect(px+.3,py+.3,Math.max(.5,fw-.6),Math.max(.5,fh-.6));
      // Handles are illustrative only, never part of project geometry or cutlist.
      if(it.handles==='handles'&&fw>9&&fh>11){x.fillStyle='#888c78';if(f.kind==='drawer')x.fillRect(px+fw*.34,py+Math.min(7,fh*.23),fw*.32,1.6);else x.fillRect(px+fw-5,py+fh*.41,1.5,Math.min(11,fh*.19));}
    }
    if(it.base==='plinth'){const bh=80*s;x.fillStyle='#8c8e79';x.fillRect(bx+W*.035,by+H-bh,W*.93,bh);}
    if(!cells.length){x.strokeStyle='#d8d1bf';x.lineWidth=Math.max(2,18*s);x.strokeRect(bx+1,by+1,W-2,H-2);}
  }
  function cardTags(opt,it){
    const t=templateFor(it),s=titleText([opt.label,opt.description,t?.group,t?.source_file].join(' '));
    const tags=new Set([itemGroup(it)]);
    if(opt.bazis)tags.add('bazis');
    if(s.includes('угл')||s.includes('нму'))tags.add('corner');
    if(s.includes('мойк'))tags.add('sink');
    if(s.includes('карго')||s.includes('cargo'))tags.add('cargo');
    if(it.drawers>0||t?.front?.kind==='drawers'||t?.front?.kind==='combo')tags.add('drawers');
    return tags;
  }
  addCatalogueButton=function studioCatalogueButton(root,opt){
    const it=defaultItem(opt),b=make('button','mf3d-module');b.type='button';
    b.dataset.category=itemGroup(it);b.dataset.search=titleText(opt.label+' '+opt.description);
    if(opt.module)b.dataset.module=opt.module;if(opt.template)b.dataset.template=opt.template;if(opt.bazis)b.dataset.bazis=opt.bazis;
    b.dataset.width=String(it.width);b.dataset.tags=[...cardTags(opt,it)].join(' ');
    b.setAttribute('aria-label','Добавить: '+opt.label+', '+it.width+' × '+it.height+' × '+it.depth+' мм');
    b.title=opt.label+' · '+(opt.description||'');
    const c=make('canvas','studio-preview');c.width=300;c.height=207;c.setAttribute('aria-hidden','true');paintPreview(c,it);
    const copy=make('span','mf3d-module-copy');copy.append(make('strong','',opt.label),make('span','',descriptionFor(it,opt.description)));
    const meta=make('span','studio-card-meta');meta.append(make('span','',it.width+' × '+it.height+' × '+it.depth));
    if(opt.bazis)meta.append(make('span','studio-source','БАЗИС'));
    b.append(c,copy,meta);
    b.onclick=()=>{if(!state)return;opt.bazis?addBazisModule(opt.bazis):opt.template?addTemplate(opt.template):addModule(opt.module);b.classList.add('studio-added');};
    catalogue.set(b,{opt,it});root.append(b);
  };
  applyCatalogueFilter=function studioCatalogueFilter(){
    const q=titleText(get('module-search').value.trim());let count=0;
    for(const b of get('module-catalogue').querySelectorAll('.mf3d-module')){
      const tags=new Set((b.dataset.tags||b.dataset.category||'other').split(' '));
      const matches=activeModuleFilter==='all'||(activeModuleFilter==='kitchen'?tags.has('base')||tags.has('wall')||tags.has('tall'):tags.has(activeModuleFilter));
      b.hidden=!(matches&&(!q||(b.dataset.search||'').includes(q)));if(!b.hidden)count++;
    }
    const sort=get('studio-sort').value;
    for(const group of get('module-catalogue').querySelectorAll('.mf3d-module-group')){
      const cards=[...group.querySelectorAll('.mf3d-module')];
      if(sort==='name')cards.sort((a,b)=>(a.dataset.search||'').localeCompare(b.dataset.search||'','ru'));
      else if(sort==='width')cards.sort((a,b)=>+a.dataset.width-+b.dataset.width);
      else cards.sort((a,b)=>Number(a.dataset.studioOrder)-Number(b.dataset.studioOrder));
      cards.forEach(b=>group.append(b));group.hidden=!cards.some(b=>!b.hidden);
    }
    get('studio-catalog-count').textContent=plural(count);
    get('studio-catalog-empty').hidden=count>0;
    get('module-tabs').querySelectorAll('button').forEach(b=>{const on=b.dataset.moduleFilter===activeModuleFilter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
  };
  renderModuleCatalogue=function studioCatalogue(){
    catalogue.clear();original.renderModuleCatalogue();
    get('module-catalogue').querySelectorAll('.mf3d-module').forEach((b,i)=>b.dataset.studioOrder=String(i));
    applyCatalogueFilter();
  };
  function showPane(name,focus=false){
    const tabs=[...document.querySelectorAll('[data-studio-tab]')];
    tabs.forEach(b=>{const on=b.dataset.studioTab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;get('pane-'+b.dataset.studioTab).hidden=!on;});
    if(focus)get('tab-'+name).focus();
  }
  document.querySelectorAll('[data-studio-tab]').forEach((b,i,all)=>{
    b.addEventListener('click',()=>showPane(b.dataset.studioTab));
    b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const j=e.key==='Home'?0:e.key==='End'?all.length-1:(i+(e.key==='ArrowRight'?1:all.length-1))%all.length;showPane(all[j].dataset.studioTab,true);});
  });
  function togglePanel(which,force){
    const cls='studio-'+which+'-open',on=force===undefined?!document.body.classList.contains(cls):force;
    document.body.classList.toggle(cls,on);
    if(on)document.body.classList.remove('studio-'+(which==='library'?'inspector':'library')+'-open');
    get('studio-toggle-library').setAttribute('aria-expanded',String(document.body.classList.contains('studio-library-open')));
    get('studio-toggle-inspector').setAttribute('aria-expanded',String(document.body.classList.contains('studio-inspector-open')));
  }
  get('studio-toggle-library').onclick=()=>togglePanel('library');
  get('studio-toggle-inspector').onclick=()=>togglePanel('inspector');
  get('studio-first-module').onclick=()=>{showPane('catalog');togglePanel('library',true);get('module-search').focus();};
  get('studio-sort').onchange=applyCatalogueFilter;
  get('studio-clear-search').onclick=()=>{get('module-search').value='';activeModuleFilter='all';applyCatalogueFilter();};
  get('studio-item-search').oninput=()=>renderItems();
  function focusItem(it){
    if(document.body.dataset.plannerRequested==='webgl'){if(it)document.dispatchEvent(new CustomEvent('mf:planner-focus',{detail:it.item_id}));return;}
    if(!it)return;
    selectItem(it);
    const lift=it.module_type==='wall_cabinet'?Math.max(0,state.room.height-it.height-500):0;
    cameraTarget={x:it.x/500,y:(lift+it.height*.5)/500,z:it.z/500};
    if(viewMode!=='3d')setMode('3d');
    zoom=Math.max(.55,Math.min(1.15,it.height/2400));
    drawKey='';status('Выбран модуль: '+it.name+'.');
  }
  renderItems=function studioItems(){
    if(!state)return;
    get('studio-item-count').textContent=String(state.items.length);
    const q=titleText(get('studio-item-search').value.trim());
    const signature=JSON.stringify([selectedId,q,state.items.map(it=>[it.item_id,it.name,it.width,it.height,it.depth,it.module_type,it.template_id,it.bazis_id,it.layout,it.drawers,it.base])]);
    if(signature!==rowsSignature){
      rowsSignature=signature;const root=get('scene-items');root.replaceChildren();let shown=0;
      for(const cat of ['base','wall','tall','other']){
        const items=state.items.filter(it=>itemGroup(it)===cat&&(!q||titleText(it.name+' '+it.bazis_file+' '+it.width+' '+it.height+' '+it.depth).includes(q)));
        if(!items.length)continue;
        const heading=make('div','studio-items-group');heading.append(make('span','',categoryNames[cat]),make('span','',String(items.length)));root.append(heading);
        for(const it of items){
          const row=make('div','studio-item-row'),b=make('button','mf3d-project'+(it.item_id===selectedId?' active':''));b.type='button';b.dataset.itemId=it.item_id;b.setAttribute('aria-pressed',String(it.item_id===selectedId));
          const c=make('canvas');c.width=76;c.height=80;c.setAttribute('aria-hidden','true');paintPreview(c,it);
          const copy=make('div');copy.append(make('strong','',it.name),make('span','',it.width+' × '+it.height+' × '+it.depth+' мм'));b.append(c,copy);b.onclick=()=>selectItem(it);
          const focus=make('button','secondary','◎');focus.type='button';focus.title='Перейти к модулю';focus.setAttribute('aria-label','Перейти к модулю: '+it.name);focus.onclick=()=>focusItem(it);row.append(b,focus);root.append(row);shown++;
        }
      }
      if(!shown){const empty=make('div','studio-empty-small');empty.append(make('strong','',state.items.length?'Модуль не найден':'Пока здесь пусто'),make('p','',state.items.length?'Попробуйте другое название.':'Добавьте первый модуль из каталога.'));root.append(empty);}
    }
    syncStudioMeta();
  };
  function syncStudioMeta(){
    const it=selected();
    get('studio-empty-scene').hidden=Boolean(state?.items.length);
    get('studio-inspector-empty').hidden=Boolean(it);
    get('studio-focus').disabled=!it;
    get('studio-zoom-in').disabled=viewMode!=='3d';get('studio-zoom-out').disabled=viewMode!=='3d';
    get('mode-2d').setAttribute('aria-pressed',String(viewMode==='2d'));get('mode-3d').setAttribute('aria-pressed',String(viewMode==='3d'));
    get('studio-selection-caption').textContent=it?it.name+' · '+it.width+' × '+it.height+' × '+it.depth+' мм':'Ни один модуль не выбран';
    if(it){
      if(document.activeElement!==get('studio-item-name'))get('studio-item-name').value=it.name;
      get('item-title').textContent=it.name;
      get('studio-item-type').textContent=(categoryNames[itemGroup(it)]||'Модуль')+(it.bazis_id?' · БАЗИС':'');
      const t=templateFor(it),lim=t?.limits;
      get('studio-size-limits').textContent=lim?'Диапазон Ш '+lim.w.join('–')+' · В '+lim.h.join('–')+' · Г '+lim.d.join('–')+' мм':'';
      get('studio-position-note').textContent=it.module_type==='wall_cabinet'?'Верхний модуль: высота размещения определяется текущим правилом проекта.':'Стрелки — точное перемещение. X/Z отсчитываются от центра помещения.';
      for(const id of ['width','height','depth'])get(id).setAttribute('aria-invalid',String(!get(id).validity.valid));
    }
    updateSaveState();
  }
  syncControls=function studioControls(){
    const result=original.syncControls();syncStudioMeta();return result;
  };
  get('studio-item-name').onchange=()=>{const it=selected();if(!it)return;const name=get('studio-item-name').value.trim().slice(0,160);if(name){it.name=name;updateAll();status('Название модуля обновлено.');}else get('studio-item-name').value=it.name;};
  document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>{
    const it=selected();if(!it)return;const n=Number(get('studio-nudge-step').value)||10;
    const direction=b.dataset.nudge;
    if(direction==='left')it.x-=n;if(direction==='right')it.x+=n;if(direction==='back')it.z-=n;if(direction==='front')it.z+=n;
    clampItemToRoom(it);get('pos-x').value=String(it.x);get('pos-z').value=String(it.z);updateAll();
  });
  get('studio-rotate').onclick=()=>{const it=selected();if(!it)return;get('rotation').value=String((Number(it.rotation)+90)%360);get('rotation').dispatchEvent(new Event('change',{bubbles:true}));};
  get('studio-focus').onclick=()=>focusItem(selected());
  get('studio-zoom-in').onclick=()=>{zoom=Math.max(.55,zoom-.12);};get('studio-zoom-out').onclick=()=>{zoom=Math.min(2,zoom+.12);};
  const reset=get('reset-view').onclick;
  function fitRoom(){
    if(document.body.dataset.plannerRequested==='webgl')return;
    if(!state)return;
    reset();cameraTarget={x:0,y:state.room.height*.44/500,z:0};
    const r=canvas.getBoundingClientRect(),points=[];
    for(const x of[-state.room.width/1000,state.room.width/1000])for(const y of[0,state.room.height/500])for(const z of[-state.room.depth/1000,state.room.depth/1000])points.push({x,y,z});
    for(zoom=.7;zoom<2;zoom+=.05){const projected=points.map(p=>proj3(p,r.width,r.height));if(projected.every(p=>p.x>r.width*.055&&p.x<r.width*.945&&p.y>r.height*.09&&p.y<r.height*.87))break;}
    zoom=Math.min(2,zoom);drawKey='';
  }
  get('reset-view').onclick=fitRoom;
  // Projection is shared by rendering, the original hit testing, and selection.
  proj3=function studioProjection(p,w,h){const q=original.proj3({x:p.x-cameraTarget.x,y:p.y-cameraTarget.y,z:p.z-cameraTarget.z},w,h);return{...q,y:q.y-h*.08};};
  colorFor=function studioColor(m,front=false){return m?original.colorFor(m,front):(front?'#e8e8dd':'#c5b494');};
  function path(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();}
  function drawSelection(w,h){
    const it=selected();if(!it)return;
    const b=itemRect3d(it,w,h);if(!Number.isFinite(b.left)||b.right<0||b.left>w||b.bottom<0||b.top>h)return;
    ctx.save();ctx.strokeStyle='rgba(74,124,78,.78)';ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.strokeRect(b.left-4,b.top-4,b.right-b.left+8,b.bottom-b.top+8);ctx.setLineDash([]);
    const text=it.width+' × '+it.height+' × '+it.depth+' мм';ctx.font='10px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';
    const tw=ctx.measureText(text).width+18,x=Math.max(tw/2+8,Math.min(w-tw/2-8,(b.left+b.right)/2)),y=Math.max(66,Math.min(h-50,b.top-24));
    ctx.fillStyle='#fffef3';ctx.fillRect(x-tw/2,y-11,tw,21);ctx.strokeStyle='#bdd0b0';ctx.lineWidth=.6;ctx.strokeRect(x-tw/2,y-11,tw,21);ctx.fillStyle='#597445';ctx.fillText(text,x,y+3);ctx.restore();
  }
  draw3d=function studio3d(w,h){
    const key=['3d',w,h,canvas.width,canvas.height,zoom,rotX,rotY,geometryVersion,selectedId,cameraTarget.x,cameraTarget.y,cameraTarget.z].join('|');
    if(drawKey===key)return;drawKey=key;
    ctx.clearRect(0,0,w,h);const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#f5f5ef');g.addColorStop(1,'#e9ece1');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const fs=[];
    for(let i=0;i<boxes.length;i++){
      const b={...boxes[i]};if(i===0)b.color='#e4e2d6';if(i===1)b.color='#f0f1e9';if(i===2)b.color='#e9ece2';
      const all=faces(b);all.forEach((f,j)=>{f.floorTop=i===0&&j===4;f.layer=i<3?0:2;fs.push(f);});
    }
    for(const it of state.items){
      if(it.module_type==='wall_cabinet')continue;
      const fp=itemFootprint(it),x=it.x/500,z=it.z/500,ww=fp.w/1000,dd=fp.d/1000;
      fs.push({verts:[{x:x-ww-.045,y:.006,z:z-dd-.045},{x:x+ww+.045,y:.006,z:z-dd-.045},{x:x+ww+.045,y:.006,z:z+dd+.045},{x:x-ww-.045,y:.006,z:z+dd+.045}],shadow:true,layer:1,c:'#748366',sh:1});
    }
    for(const f of fs){f.p=f.verts.map(v=>proj3(v,w,h));f.z=f.p.reduce((s,p)=>s+p.z,0)/4;}
    fs.sort((a,b)=>a.layer-b.layer||a.z-b.z);
    for(const f of fs){
      if(f.p.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
      path(f.p);
      if(f.shadow){ctx.fillStyle='rgba(81,92,61,.09)';ctx.fill();continue;}
      const yy=f.p.map(p=>p.y),gradient=ctx.createLinearGradient(0,Math.min(...yy),0,Math.max(...yy)+1);
      gradient.addColorStop(0,shade(f.c,f.sh*1.016));gradient.addColorStop(1,shade(f.c,f.sh*.987));ctx.fillStyle=gradient;ctx.fill();ctx.lineWidth=.6;ctx.strokeStyle='rgba(82,96,63,.12)';ctx.stroke();
      if(f.floorTop){
        ctx.save();path(f.p);ctx.clip();ctx.strokeStyle='rgba(108,127,83,.115)';ctx.lineWidth=.6;
        const r=state.room;for(let x=-r.width/2;x<=r.width/2;x+=500){const a=proj3({x:x/500,y:.001,z:-r.depth/1000},w,h),b=proj3({x:x/500,y:.001,z:r.depth/1000},w,h);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
        for(let z=-r.depth/2;z<=r.depth/2;z+=500){const a=proj3({x:-r.width/1000,y:.001,z:z/500},w,h),b=proj3({x:r.width/1000,y:.001,z:z/500},w,h);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.restore();
      }
    }
    drawSelection(w,h);
  };
  draw2d=function studio2d(w,h){
    const key=['2d',w,h,canvas.width,canvas.height,geometryVersion,selectedId].join('|');if(drawKey===key)return;drawKey=key;
    const m=room2dMetrics(),r=state.room;if(m.scale<=0)return original.draw2d(w,h);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#f0f2e8';ctx.fillRect(0,0,w,h);
    const left=m.ox-r.width*m.scale/2,top=m.oz-r.depth*m.scale/2;
    ctx.fillStyle='#fcfcf7';ctx.fillRect(left,top,r.width*m.scale,r.depth*m.scale);ctx.strokeStyle='#b8c6ac';ctx.lineWidth=1.5;ctx.strokeRect(left,top,r.width*m.scale,r.depth*m.scale);
    ctx.lineWidth=.5;ctx.strokeStyle='#e2e8da';for(let x=500;x<r.width;x+=500){ctx.beginPath();ctx.moveTo(left+x*m.scale,top);ctx.lineTo(left+x*m.scale,top+r.depth*m.scale);ctx.stroke();}for(let z=500;z<r.depth;z+=500){ctx.beginPath();ctx.moveTo(left,top+z*m.scale);ctx.lineTo(left+r.width*m.scale,top+z*m.scale);ctx.stroke();}
    for(const it of state.items){const fp=itemFootprint(it),ww=fp.w*m.scale,dd=fp.d*m.scale,x=m.ox+it.x*m.scale,y=m.oz+it.z*m.scale,on=it.item_id===selectedId;
      ctx.fillStyle=on?'#d5e3c8':it.module_type==='wall_cabinet'?'#eff3e7':'#e0e2d4';ctx.fillRect(x-ww/2,y-dd/2,ww,dd);ctx.strokeStyle=on?'#557c46':'#a9b69d';ctx.lineWidth=on?2:1;if(it.module_type==='wall_cabinet')ctx.setLineDash([4,2]);ctx.strokeRect(x-ww/2,y-dd/2,ww,dd);ctx.setLineDash([]);
      ctx.save();ctx.beginPath();ctx.rect(x-ww/2+3,y-dd/2+3,Math.max(0,ww-6),Math.max(0,dd-6));ctx.clip();ctx.fillStyle=on?'#466137':'#7b8a6b';ctx.font='10px "Segoe UI",Arial,sans-serif';ctx.textAlign='center';if(ww>45&&dd>20)ctx.fillText(it.name,x,y+3);ctx.restore();
    }
    ctx.font='10px "Segoe UI",Arial,sans-serif';ctx.fillStyle='#8c9b7c';ctx.textAlign='center';ctx.fillText(r.width+' мм',w/2,top-10);
  };
  function digest(){return state?JSON.stringify([get('project-name').value,state.room,state.items]):null;}
  function updateSaveState(){
    const el=get('studio-save-state'),dirty=baseline!==null&&digest()!==baseline;
    el.textContent=saving?'Сохранение…':dirty?'Есть несохранённые изменения':project?'Проект сохранён':'Новый проект · сохраните после настройки';el.dataset.dirty=String(dirty);
  }
  get('project-name').addEventListener('input',updateSaveState);
  updateAll=function studioUpdate(){geometryVersion++;drawKey='';const r=original.updateAll();if(state){get('item-badge').textContent=plural(state.items.length);syncStudioMeta();}return r;};
  saveProject=function studioSave(){
    if(busySave)return busySave;
    const sent=digest();saving=true;get('save-project').disabled=true;updateSaveState();
    busySave=original.saveProject().then(result=>{baseline=sent;return result;}).finally(()=>{saving=false;busySave=null;get('save-project').disabled=false;updateSaveState();});return busySave;
  };
  openProject=async function studioOpen(...args){
    const r=await original.openProject(...args);baseline=digest();fitRoom();updateSaveState();return r;
  };
  newProject=async function studioNew(...args){
    const r=await original.newProject(...args);baseline=digest();fitRoom();updateSaveState();return r;
  };
  function guardDiscard(event){
    if(!event.target.closest('button')||baseline===null||digest()===baseline)return;
    if(!confirm('Продолжить без сохранения текущих изменений?')){event.preventDefault();event.stopImmediatePropagation();}
  }
  get('new-project').addEventListener('click',guardDiscard,true);
  get('projects').addEventListener('click',guardDiscard,true);
  status=function studioStatus(message){
    const errors={PROJECT_3D_VERSION_CONFLICT:'Проект изменился на сервере. Откройте актуальную версию перед сохранением.',version_conflict:'Проект изменился на сервере. Откройте актуальную версию перед сохранением.',unauthorized:'Сессия завершена. Войдите в личный кабинет заново.',forbidden:'Для этого действия недостаточно прав.'};
    return original.status(errors[message]||message);
  };
  const help=get('studio-help-dialog');get('studio-help').onclick=()=>{document.querySelector('.studio-menu').open=false;help.showModal();};get('studio-help-close').onclick=()=>help.close();
  document.addEventListener('keydown',e=>{
    if(help.open){e.stopPropagation();return;}
    if(e.key==='Escape'){togglePanel('library',false);togglePanel('inspector',false);document.querySelector('.studio-menu').open=false;}
  },true);
  // Avoid destructive legacy keyboard shortcuts on focused interactive controls.
  document.addEventListener('keydown',e=>{if(e.target.closest?.('button,summary,a,[role=tablist]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(e.key))e.stopPropagation();});
  window.addEventListener('beforeunload',e=>{if(baseline!==null&&digest()!==baseline){e.preventDefault();e.returnValue='';}});
  window.addEventListener('resize',()=>{drawKey='';});
  document.body.dataset.studioVersion='1.0';
  // Auth startup may already have rendered the catalogue before this adapter loaded.
  renderModuleCatalogue();
  if(state){updateAll();fitRoom();if(baseline===null)baseline=digest();}
  window.MF3D_STUDIO=Object.freeze({version:'1.0',baseCommit:'98d5a73c2c1f55f00494cb5208b4bfe52773739d',showPane,focusItem});
})();
