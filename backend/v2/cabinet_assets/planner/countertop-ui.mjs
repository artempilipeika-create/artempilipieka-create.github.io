import {kitchenSettings,kitchenRuns} from './furniture-core.mjs';
const C=globalThis.MF_COUNTERTOPS;
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export class CountertopUI{
  constructor(app){
    this.app=app;
    const card=el('section');card.id='countertop-card';card.className='mf3d-control-card countertop-card';
    card.append(el('h3','Столешница'),el('p','Добавляется вместе с нижними шкафами. Форма и длина следуют за расстановкой.'));
    const choices=el('div');choices.className='countertop-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','Соединение столешницы');
    this.buttons=[];
    for(const [value,label]of [['standard','Обычная'],['euro','Еврозапил']]){
      const b=el('button');b.type='button';b.className='secondary';b.dataset.joint=value;
      const photo=el('img');photo.className='surface-card-photo';photo.src='/account/planner/module-card-images/countertop-'+value+'.webp?v=20261025-lively-cards';photo.alt='';photo.width=640;photo.height=480;photo.loading='lazy';photo.draggable=false;app.listen(photo,'error',()=>photo.remove());
      const diagram=el('span');diagram.className='surface-card-diagram';diagram.innerHTML=globalThis.MF_CHOICE_CARDS?.jointDetail(value)||C.drawing('left',value);diagram.setAttribute('aria-hidden','true');
      b.append(photo,el('strong',label),el('small',value==='euro'?'Фрезерованный переход':'Прямой стык'),diagram);choices.append(b);this.buttons.push(b);
      app.listen(b,'click',()=>app.interaction.change('Соединение столешницы',()=>{
        app.adapter.state.countertopSettings={joint:value};
        for(const item of app.adapter.items)if(kitchenSettings(item))item.countertopJoint=value;
        app.bridge.refresh();app.adapter.status(value==='euro'?'Еврозапил выбран для кухни и новых модулей':'Выбрано обычное соединение столешницы');
      }));
    }
    card.append(choices);this.summary=el('p');this.summary.className='studio-hint';this.summary.setAttribute('aria-live','polite');card.append(this.summary);
    this.outlines=el('div');this.outlines.className='countertop-outlines';card.append(this.outlines);
    const sources=el('details');sources.append(el('summary','Исходные фрагменты · 38 мм'));
    for(const v of C.variants){const a=el('a',C.names[v.shape]+' · '+(v.joint==='euro'?'еврозапил':'обычная'));a.href='/account/planner/countertop-sources/'+encodeURIComponent(v.source_file);a.download=v.source_file;sources.append(a);}
    card.append(sources);document.getElementById('module-catalogue').before(card);
    this.control=el('section');this.control.id='countertop-module-control';this.control.className='mf3d-control-card';
    const label=el('label','Столешница над этим модулем');this.enabled=el('input');this.enabled.id='countertop-enabled';this.enabled.type='checkbox';label.prepend(this.enabled);this.control.append(label);
    this.moduleNote=el('p');this.moduleNote.className='studio-hint';this.control.append(this.moduleNote);
    document.getElementById('kitchen-controls').after(this.control);
    app.listen(this.enabled,'change',()=>{
      const it=app.adapter.selected;if(!kitchenSettings(it))return;
      if(it.worktop_fixture&&!this.enabled.checked){this.enabled.checked=true;app.adapter.status('Сначала уберите мойку или варочную со столешницы.');return;}
      app.interaction.modify({countertopEnabled:this.enabled.checked},'Столешница над модулем');app.bridge.refresh();
    });
  }
  sync(){
    const a=this.app.adapter,choice=a.state.countertopSettings?.joint||'standard',it=a.selected,k=it&&kitchenSettings(it);
    for(const b of this.buttons)b.setAttribute('aria-pressed',String(b.dataset.joint===choice));
    const runs=kitchenRuns(a.items,a.room),groups=C.assemblies(runs);
    this.control.hidden=!k;
    if(k){this.enabled.checked=k.countertopEnabled;this.moduleNote.textContent=k.countertopEnabled?
      'Корпус и ножки: '+it.height+' мм. Со столешницей: '+(it.height+k.countertopThicknessMm)+' мм.':
      'Над этим шкафом столешница отключена. Высота корпуса и ножек сохранена.';}
    const disabled=a.items.filter(it=>kitchenSettings(it)&&it.countertopEnabled===false).length;
    this.summary.textContent=groups.length?'Участков: '+groups.length+' · угловых стыков: '+groups.reduce((s,g)=>s+g.joint_count,0)+(disabled?' · отключено над модулями: '+disabled:''):
      a.items.some(it=>kitchenSettings(it))?'Столешницы отключены над нижними модулями.':'Поставьте первый нижний шкаф — столешница появится сразу.';
    if(groups.some(g=>!g.native_supported))this.summary.textContent+=' · есть участки для доработки в БАЗИС';
    const key=JSON.stringify(groups.map(g=>[g.shape,g.joint,g.target,g.euro_joint_count,g.members]));
    if(this.key!==key){this.key=key;this.outlines.replaceChildren();
      for(const g of groups){const n=el('div');n.className='countertop-outline';n.innerHTML=C.drawing(g.shape,g.joint);
        n.append(el('span',g.label+' · '+g.target.width+' × '+g.target.depth+' × '+g.target.height+' мм'));this.outlines.append(n);}
    }
  }
}
