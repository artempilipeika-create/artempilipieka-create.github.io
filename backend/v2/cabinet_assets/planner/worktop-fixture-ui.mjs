import {defaultFixture,fixtureError,fixturePlans,fixtureNames,faucetNames} from './worktop-fixtures.mjs';
import {kitchenSettings} from './furniture-core.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export class WorktopFixtureUI{
  constructor(app){
    this.app=app;this.fields={};
    const card=el('section');card.id='worktop-fixture-card';card.className='mf3d-control-card worktop-fixture-card';
    card.append(el('h3','Мойка и варочная'),el('p','Добавьте над выбранным шкафом. Положение задаётся относительно его столешницы.'));
    const choices=el('div');choices.className='fixture-choices';this.buttons=[];
    for(const [kind,label]of Object.entries(fixtureNames)){
      const b=el('button',label);b.type='button';b.className='secondary';b.dataset.kind=kind;b.setAttribute('aria-label','Добавить: '+label);choices.append(b);this.buttons.push(b);
      app.listen(b,'click',()=>this.patch(defaultFixture(kind),'Добавить '+label.toLowerCase()));
    }
    card.append(choices);this.note=el('p');this.note.className='studio-hint';this.note.setAttribute('aria-live','polite');card.append(this.note);
    this.settings=el('div');this.settings.hidden=true;card.append(this.settings);
    const grid=el('div');grid.className='mf3d-grid';this.settings.append(grid);
    for(const [key,label,min,max]of [['width','Ширина модели, мм',300,1000],['depth','Глубина модели, мм',300,700],['offset_x','Смещение от центра, мм',-1500,1500],['front_offset','Отступ от переднего края, мм',20,880]]){
      const wrap=el('label',label),input=el('input');input.type='number';input.step=1;input.min=min;input.max=max;input.setAttribute('aria-label',label);wrap.append(input);grid.append(wrap);this.fields[key]=input;
      app.listen(input,'change',()=>{if(input.value===''||!Number.isInteger(Number(input.value))){app.adapter.status('Введите размер целыми миллиметрами.');this.sync(true);return;}this.patch({...app.adapter.selected.worktop_fixture,[key]:Number(input.value)});});
    }
    this.settings.append(el('p','Смещение: минус — влево, плюс — вправо, если смотреть на фасад.'));
    const center=el('button','По центру шкафа');center.type='button';center.className='secondary';this.settings.append(center);app.listen(center,'click',()=>this.patch({...app.adapter.selected.worktop_fixture,offset_x:0}));
    this.sink=el('div');this.settings.append(this.sink);
    for(const [key,label,options]of [['finish','Исполнение мойки',{steel:'Нержавеющая сталь',black:'Чёрная'}],['faucet','Смеситель',faucetNames],['faucet_finish','Цвет смесителя',{chrome:'Хром',black:'Чёрный'}]]){
      const wrap=el('label',label),select=el('select');select.setAttribute('aria-label',label);for(const [value,text]of Object.entries(options)){const o=el('option',text);o.value=value;select.append(o);}wrap.append(select);this.sink.append(wrap);this.fields[key]=select;
      app.listen(select,'change',()=>this.patch({...app.adapter.selected.worktop_fixture,[key]:select.value}));
    }
    const remove=el('button','Убрать со столешницы');remove.type='button';remove.className='secondary';this.settings.append(remove);app.listen(remove,'click',()=>this.patch(null,'Убрать мойку или варочную'));
    const hint=el('p','Модель для визуализации. Вырез и внутреннее наполнение шкафа уточняются по монтажной схеме выбранной техники.');hint.className='studio-hint';this.settings.append(hint);
    document.getElementById('countertop-module-control').after(card);
    // Discoverable entry beside the worktop in the catalogue, reusing the inspector.
    const shortcut=el('button','Мойка и варочная над выбранным шкафом');shortcut.type='button';shortcut.className='secondary';document.getElementById('countertop-card').append(shortcut);this.shortcut=shortcut;
    app.listen(shortcut,'click',()=>{app.workspace?.panel('right',true,{manual:true,focus:true});card.scrollIntoView({block:'center',behavior:'smooth'});});
  }
  patch(fixture,label='Положение мойки или варочной'){
    const a=this.app.adapter,it=a.selected;if(!it)return;
    try{
      const next={...it,worktop_fixture:fixture},error=fixtureError(next);if(error)throw Error(error);
      if(fixture){const plan=fixturePlans(a.items.map(x=>x.item_id===it.item_id?next:x),a.room).find(p=>p.itemId===it.item_id);if(plan?.error)throw Error(plan.error);}
      this.app.interaction.change(label,()=>a.replace(next));
    }catch(e){a.status(e.message);this.note.textContent=e.message;this.sync(true);}
  }
  sync(force=false){
    const a=this.app.adapter,it=a.selected,k=it&&kitchenSettings(it),f=it?.worktop_fixture;
    const available=Boolean(k?.countertopEnabled);this.shortcut.disabled=!available;
    for(const b of this.buttons){b.disabled=!available;b.setAttribute('aria-pressed',String(b.dataset.kind===f?.kind));}
    this.settings.hidden=!f;this.sink.hidden=f?.kind!=='sink';
    const error=f&&fixturePlans(a.items,a.room).find(p=>p.itemId===it.item_id)?.error;
    if(!force)this.note.textContent=error||(available?f?fixtureNames[f.kind]+' · '+f.width+' × '+f.depth+' мм · '+it.name:'Выбран шкаф: '+it.name:'Выберите нижний шкаф со столешницей.');
    if(f)for(const [key,input]of Object.entries(this.fields))if(force||document.activeElement!==input)input.value=f[key];
  }
}
