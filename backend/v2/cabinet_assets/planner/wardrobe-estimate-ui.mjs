const byId=id=>document.getElementById(id);
const money=value=>Number(value).toLocaleString('ru-BY',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const date=value=>value.split('-').reverse().join('.');
function element(tag,text,cls){
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  if(cls)node.className=cls;
  return node;
}

export class WardrobeEstimateUI{
  constructor(app){
    this.app=app;
    this.button=byId('estimate-open');this.dialog=byId('estimate-dialog');this.revision=0;
    this.button.onclick=()=>this.open();
    byId('estimate-close').onclick=()=>this.dialog.close();
    byId('estimate-pdf').onclick=()=>this.issue();
    byId('estimate-retry').onclick=()=>this.sync(true);
    this.onFocus=()=>{if(this.app.adapter.items.length)this.sync(true);};
    window.addEventListener('focus',this.onFocus);
  }
  sync(force=false){
    const hasPanels=this.app.bridge.estimateAccess()&&this.app.adapter.items.length;
    this.button.hidden=!hasPanels;
    if(!hasPanels){
      clearTimeout(this.timer);
      if(this.key!==null){this.key=null;this.revision++;this.quote=null;}
      if(this.dialog.open)this.dialog.close();
      return;
    }
    const scene=this.app.bridge.payload();
    const key=JSON.stringify([this.app.bridge.projectId(),scene.items,scene.materialIdentities,scene.plinths,scene.wallPanels,scene.countertopSettings,scene.room]);
    if(!force&&key===this.key)return;
    this.key=key;this.quote=null;
    const id=++this.revision;
    this.button.textContent='Смета · расчёт…';this.render();
    clearTimeout(this.timer);
    this.timer=setTimeout(async()=>{
      try{
        const quote=await this.app.bridge.request('/3d-estimates/preview','POST',scene);
        if(id!==this.revision)return;
        this.quote=quote;this.button.textContent=(quote.complete?'Смета · ':'Рассчитано · ')+money(quote.total);
        this.render();
      }catch(e){
        if(id!==this.revision)return;
        this.button.textContent='Смета · проверить';this.render('Не удалось рассчитать смету. '+(e.issues?.[0]?.message||'Повторите расчёт.'));
      }
    },force?0:300);
  }
  open(){
    if(!this.dialog.open)this.dialog.showModal();
    this.sync(true);this.history();
  }
  async history(){
    const pid=this.app.bridge.projectId();const root=byId('estimate-history');root.replaceChildren();root.hidden=true;
    if(!pid)return;
    try{
      const result=await this.app.bridge.request('/3d-projects/'+pid+'/estimates');
      if(pid!==this.app.bridge.projectId()||!result.items.length)return;
      root.append(element('summary','Выпущенные сметы · '+result.items.length));
      for(const row of result.items){
        const link=element('a',date(row.cost_date)+' · '+money(row.amount)+(row.complete?'':' · частичный расчёт')+' · версия '+row.project_version);
        link.href='/api/v2/3d-projects/'+pid+'/estimates/'+row.estimate_id+'.pdf';root.append(link);
      }
      root.hidden=false;
    }catch{ /* The live calculation remains available when history cannot load. */ }
  }
  render(error=''){
    this.app.roomPricing?.syncEstimate(error);
    const quote=this.quote, box=byId('estimate-result'), status=byId('estimate-status');
    box.replaceChildren();byId('estimate-pdf').disabled=this.issuing||!quote;
    byId('estimate-retry').hidden=!error;
    status.textContent=error||(!quote?'Считаем по деталям проекта…':quote.missing?'Требуют уточнения: '+quote.missing+' поз. В сумме учтены позиции с известной стоимостью.':'');
    if(!quote)return;
    byId('estimate-date').textContent='Расчёт на '+date(quote.date);
    const amounts=element('div',undefined,'estimate-amounts');
    for(const [label,value] of [['Стоимость Martin Forest',money(quote.base)],['Моя наценка',quote.markup.toLocaleString('ru-BY')+' %'],[quote.complete?'Цена для клиента':'Рассчитано для клиента',money(quote.total)]]){
      const group=element('div');group.append(element('span',label),element('strong',value));amounts.append(group);
    }
    box.append(amounts);
    if(quote.modules?.length){
      const section=element('details',undefined,'estimate-section estimate-modules');
      section.open=true;section.append(element('summary','Стоимость по модулям'));
      for(const m of quote.modules){
        const part=element('div',undefined,'estimate-module');
        const title=element('div',undefined,'estimate-row');
        const caption=element('div');caption.append(element('strong',m.name));
        if(m.width)caption.append(element('small',[m.width,m.height,m.depth].join(' × ')+' мм'));
        title.append(caption,element('b',(m.missing?'Рассчитано · ':'')+money(m.total)));part.append(title);
        for(const drawer of m.drawers){
          const line=element('div',undefined,'estimate-row estimate-drawer');
          line.append(element('span',drawer.name),element('span',(drawer.missing?'Рассчитано · ':'')+money(drawer.total)));part.append(line);
        }
        section.append(part);
      }
      box.append(section);
    }
    for(const group of Object.values(quote.groups)){
      const section=element('details',undefined,'estimate-section'),head=element('summary');
      head.append(element('strong',group.title),element('span',money(group.total)));
      if(group.missing)head.append(element('small','Уточнить '+group.missing));
      section.append(head);
      for(const row of group.rows){
        const line=element('div',undefined,'estimate-row'),label=element('div');
        label.append(element('strong',row.name));
        const info=[row.article?'арт. '+row.article:null,row.qty==null?null:row.qty.toLocaleString('ru-BY',{maximumFractionDigits:4})+' '+row.unit,
          row.photoSeries?'фото серии':null,row.reason].filter(Boolean).join(' · ');
        label.append(element('small',info));
        if(row.source){
          const source=/^https:\/\//.test(row.source)?element('a','Поставщик'):element('small',row.source);
          if(source.tagName==='A'){source.href=row.source;source.target='_blank';source.rel='noopener noreferrer';}
          if(row.checked)source.append(document.createTextNode(' · '+date(row.checked)));
          label.append(source);
        }
        if(row.photo&&!row.photo.includes('://')){
          const img=element('img');img.alt='';img.loading='lazy';img.width=44;img.height=44;
          img.src='/account/planner/'+row.photo;line.append(img);line.classList.add('with-photo');
        }
        line.append(label,element('b',row.amount==null?'Уточняется':money(row.amount)));section.append(line);
      }
      box.append(section);
    }
  }
  async issue(){
    if(this.issuing||!this.quote)return;
    const expected=this.quote.fingerprint;
    this.issuing=true;byId('estimate-pdf').disabled=true;
    byId('estimate-status').textContent='Готовим PDF…';
    try{
      await this.app.safety.flush(true);
      const meta=this.app.bridge.projectMeta();
      if(!meta)throw Error('Сохраните проект и повторите выпуск.');
      const result=await this.app.bridge.request('/3d-projects/'+meta.project_id+'/estimates','POST',{
        version:meta.version,fingerprint:expected,preview_data_url:this.app.bridge.estimatePreview()});
      if(this.app.bridge.projectId()!==meta.project_id)return;
      const link=element('a');link.href='/api/v2/3d-projects/'+meta.project_id+'/estimates/'+result.estimate_id+'.pdf';
      document.body.append(link);link.click();link.remove();
      await this.history();byId('estimate-status').textContent='Датированная смета готова.';
    }catch(error){
      if(error.status===409){this.sync(true);byId('estimate-status').textContent='Данные изменились. Проверьте пересчитанный итог перед выпуском.';}
      else byId('estimate-status').textContent='Не удалось выпустить смету. '+(error.issues?.[0]?.message||'Попробуйте ещё раз.');
    }finally{this.issuing=false;byId('estimate-pdf').disabled=!this.quote;}
  }
  dispose(){
    clearTimeout(this.timer);this.revision++;
    window.removeEventListener('focus',this.onFocus);
  }
}
