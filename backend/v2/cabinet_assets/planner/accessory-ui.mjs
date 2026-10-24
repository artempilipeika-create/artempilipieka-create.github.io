const A=globalThis.MF_ACCESSORIES;
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const button=text=>{const b=el('button',text);b.type='button';b.className='secondary';return b;};
export class AccessoryUI{
 constructor(app){
  this.app=app;
  const card=el('section');card.id='plinth-card';card.className='mf3d-control-card accessory-card';
  card.append(el('h3','Цоколь'),el('p','Автоматически следует за нижними шкафами: длина, углы, разрывы и высота опор.'));
  this.auto=el('div');this.auto.className='automatic-finish';card.append(this.auto);
  const preview=el('div');preview.className='accessory-preview';preview.innerHTML=A.drawing('straight');card.append(preview);
  this.add=button('Добавить цоколь на выбранный ряд');card.append(this.add);
  this.note=el('p');this.note.className='studio-hint';this.note.setAttribute('aria-live','polite');card.append(this.note);
  this.list=el('div');card.append(this.list);document.getElementById('module-catalogue').before(card);
  app.listen(this.add,'click',()=>{
   const s=app.adapter.state,run=A.runFor(s,app.adapter.selected?.item_id);if(!run)return;
   this.change('Добавить цоколь',()=>{
    s.plinths=s.plinths||[];
    if(s.plinths.some(p=>p.members.some(id=>run.members.includes(id))))throw new Error('Для этого ряда цоколь уже добавлен. Настройки — в карточке ниже.');
    s.plinths.push({id:crypto.randomUUID(),members:run.members,shape:'straight',inset:40});
   });
  });
  this.dish=el('section');this.dish.id='dishwasher-options';this.dish.className='mf3d-control-card accessory-card';
  this.dish.append(el('h3','Посудомойка'),el('p','Фасад без мебельного корпуса. Размер ниши и зазоры сверяйте с выбранной техникой.'));
  const choices=el('div');choices.className='accessory-choices';this.dishButtons=[];
  for(const [key,label]of [['standard','Обычное'],['gola','Gola L']]){
   const b=button(label);b.dataset.variant=key;choices.append(b);this.dishButtons.push(b);
   app.listen(b,'click',()=>this.change('Исполнение посудомойки',()=>{
    const next=A.select(app.adapter.selected,key),error=app.adapter.validate(next);if(error)throw new Error(error);app.adapter.replace(next);
   }));
  }
  this.dish.append(choices);const copy=button('Фасад как у соседнего шкафа');this.dish.append(copy);
  app.listen(copy,'click',()=>this.change('Материал фасада посудомойки',()=>{
   const it=app.adapter.selected,run=A.runFor(app.adapter.state,it.item_id);
   const neighbour=app.adapter.items.filter(n=>n.item_id!==it.item_id&&run?.members.includes(n.item_id)&&n.front_variant_id).sort((a,b)=>Math.hypot(a.x-it.x,a.z-it.z)-Math.hypot(b.x-it.x,b.z-it.z))[0];
   if(!neighbour)throw new Error('В этом ряду нет соседнего шкафа с выбранным материалом фасада.');
   const part_materials={...it.part_materials};delete part_materials['front-1'];app.adapter.replace({...it,front_variant_id:neighbour.front_variant_id,part_materials});
  }));
  this.frontNote=el('p');this.frontNote.className='studio-hint';this.dish.append(this.frontNote);
  document.getElementById('kitchen-controls').before(this.dish);
 }
 change(label,fn){try{this.app.interaction.change(label,()=>{fn();this.app.bridge.refresh();});}catch(e){this.app.adapter.status(e.message);}}
 automatic(){
  const s=this.app.adapter.state;
  // Preserve per-row material choices when replacing frozen manual plans.
  for(const p of s.plinths||[])if(p.material_id)for(const it of s.items)if(p.members?.includes(it.item_id))it.plinthMaterialId=p.material_id;
  s.plinths=[{id:crypto.randomUUID(),members:[],shape:'straight',automatic:true,excluded_members:[]}];
 }
 patch(id,patch){this.change('Параметры цоколя',()=>{
  const s=this.app.adapter.state,next=s.plinths.map(p=>p.id===id?{...p,...patch}:p),plan=A.plans({...s,plinths:next}).find(p=>(p.id===id||p.setting_id===id)&&p.error);
  if(plan?.error)throw new Error(plan.error);s.plinths=next;
 });}
 sync(){
  const a=this.app.adapter,s=a.state,run=A.runFor(s,a.selected?.item_id),dish=A.info(a.selected);
  this.dish.hidden=!dish;for(const b of this.dishButtons)b.setAttribute('aria-pressed',String(b.dataset.variant===dish?.variant));
  if(dish){const p=A.parts(a.selected,{dishwasher:dish})[0];this.frontNote.textContent=`Фасад ${p.length} × ${p.width} × ${p.thickness} мм. Материал выбирается в разделе «Фасады».`;}
  this.add.disabled=!run;this.note.textContent=run?`Выбран ряд: ${run.members.length} мод. · ${run.countertopActualLengthMm} мм`:'Выберите нижний шкаф или посудомойку на плане.';
  const plans=A.plans(s,id=>a.material(id)),key=JSON.stringify([plans,s.plinths,a.selected?.item_id]);
  if(key===this.key)return;this.key=key;this.list.replaceChildren();this.auto.replaceChildren();
  const setting=(s.plinths||[]).find(p=>p.automatic);this.add.hidden=!!setting;
  const toggle=el('label','Цоколь по расстановке'),enabled=el('input');enabled.type='checkbox';enabled.checked=!!setting;enabled.setAttribute('aria-label','Цоколь по расстановке');toggle.prepend?toggle.prepend(enabled):toggle.append(enabled);this.auto.append(toggle);
  this.app.listen(enabled,'change',()=>this.change('Автоматический цоколь',()=>{
   if(enabled.checked)this.automatic();else s.plinths=s.plinths.filter(p=>!p.automatic);
  }));
  if(!setting&&s.plinths?.length)this.auto.append(el('p','Включение переведёт ручные цоколи на автоматический расчёт. Материалы сохранятся.'));
  if(setting){
   const autoPlans=plans.filter(p=>p.automatic),note=el('p',autoPlans.length?'Участки: '+autoPlans.map(p=>p.error||p.width+' × '+(p.height-3)+' × 18').join(' / ')+' мм.':'Добавьте нижние шкафы — цоколь появится автоматически.');note.className='studio-hint';this.auto.append(note);
   if(a.selected&&run){const label=el('label','Цоколь у выбранного модуля'),input=el('input');input.type='checkbox';input.checked=!(setting.excluded_members||[]).includes(a.selected.item_id);input.setAttribute('aria-label','Цоколь у выбранного модуля');label.append(input);this.auto.append(label);
    this.app.listen(input,'change',()=>this.change('Участок цоколя',()=>{const ids=new Set(setting.excluded_members||[]);input.checked?ids.delete(a.selected.item_id):ids.add(a.selected.item_id);setting.excluded_members=[...ids];}));
   }
   this.auto.append(el('p',setting.material_id?'Общий материал: '+(a.material(setting.material_id)?.name||'назначен'):'Материал — из настройки «Цоколь» каждого шкафа.'));
   const search=el('input');search.type='search';search.placeholder='Общий материал цоколя · 18 мм';search.setAttribute('aria-label','Общий материал цоколя');this.auto.append(search);const results=el('div');results.className='material-results';this.auto.append(results);let request=0;
   this.app.listen(search,'input',async()=>{const token=++request,q=search.value.trim();results.replaceChildren();if(q.length<2)return;
    try{const data=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(q)+'&limit=12','GET');if(token!==request||!search.isConnected)return;const matches=data.items.filter(m=>Number(m.thickness)===18);
     if(!matches.length)results.append(el('p','Материал 18 мм не найден.'));for(const m of matches){const b=button(m.name+(m.article?' · '+m.article:''));this.app.listen(b,'click',()=>{this.app.bridge.cacheMaterial(m);this.patch(setting.id,{material_id:m.variant_id});});results.append(b);}
    }catch(e){a.status(e.message);}
   });
   if(setting.material_id){const reset=button('Материалы из модулей');this.app.listen(reset,'click',()=>this.patch(setting.id,{material_id:null}));this.auto.append(reset);}
  }
  for(const [index,p]of plans.filter(p=>!p.automatic).entries()){
   const saved=s.plinths.find(e=>e.id===p.id),section=el('section');section.className='plinth-settings';section.append(el('h4','Цоколь ряда '+(index+1)));
   if(p.error)section.append(el('p',p.error));
   else{
    const choices=el('div');choices.className='plinth-shapes';
    for(const [shape,label]of Object.entries(A.names)){const b=button('');b.innerHTML=A.drawing(shape);b.append(el('span',label));b.setAttribute('aria-pressed',String(p.shape===shape));this.app.listen(b,'click',()=>this.patch(p.id,{shape}));choices.append(b);}
    section.append(choices);const grid=el('div');grid.className='plinth-dimensions';
    for(const [field,label,min,max]of [['width','Длина, мм',100,6000],['height','Рамка по высоте, мм',40,300],['depth','Глубина возвратов, мм',40,1200],['inset','Отступ от модуля, мм',0,300]]){
     if(field==='depth'&&p.shape==='straight')continue;
     const wrap=el('label',label),input=el('input');input.type='number';input.min=min;input.max=max;input.step=1;input.value=p[field];input.setAttribute('aria-label',label);wrap.append(input);grid.append(wrap);
     this.app.listen(input,'change',()=>{const value=Number(input.value);if(!input.value||!Number.isInteger(value)||value<min||value>max){a.status('Проверьте размер: '+min+'–'+max+' мм');input.value=p[field];return;}this.patch(p.id,{[field]:value});});
    }
    section.append(grid,el('p','Детали: '+p.parts.map(x=>x.length+' × '+x.width+' × '+x.thickness).join(' / ')+' мм.'));
    const reset=button('Снова взять размеры ряда');this.app.listen(reset,'click',()=>this.patch(p.id,{width:null,height:null,depth:null,inset:40}));section.append(reset);
    const current=a.material(p.material_id),label=el('p','Материал: '+(current?.name||p.parts[0]?.material.name||'из исходного фрагмента'));label.className='studio-hint';section.append(label);
    const search=el('input');search.type='search';search.placeholder='Найти материал цоколя · 18 мм';search.setAttribute('aria-label','Материал цоколя');section.append(search);const results=el('div');results.className='material-results';section.append(results);let request=0;
    this.app.listen(search,'input',async()=>{
     const token=++request,q=search.value.trim();results.replaceChildren();if(q.length<2)return;
     try{const data=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(q)+'&limit=8','GET');if(token!==request||!search.isConnected)return;
      const options=data.items.filter(m=>Number(m.thickness)===18);if(!options.length)results.append(el('p','Материал 18 мм не найден.'));
      for(const m of options){const b=button(m.name+(m.article?' · '+m.article:''));this.app.listen(b,'click',()=>{this.app.bridge.cacheMaterial(m);this.patch(p.id,{material_id:m.variant_id});});results.append(b);}
     }catch(e){if(token===request)a.status(e.message);}
    });
    const link=el('a','Скачать исходный FR3D');link.href='/account/planner/accessory-sources/'+encodeURIComponent(p.source.source_file);link.download=p.source.source_file;section.append(link);
   }
   const remove=button('Удалить цоколь');this.app.listen(remove,'click',()=>this.change('Удалить цоколь',()=>{s.plinths=s.plinths.filter(e=>e.id!==saved.id);}));section.append(remove);const automatic=button('Следовать за всей кухней');this.app.listen(automatic,'click',()=>this.change('Автоматический цоколь',()=>{this.automatic();}));section.append(automatic);this.list.append(section);
  }
 }
}
