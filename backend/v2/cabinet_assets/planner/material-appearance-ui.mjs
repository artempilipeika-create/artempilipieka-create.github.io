import {materialAppearance,materialVisual,SURFACE_FINISHES} from './material-visuals.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const targets={front_variant_id:'Фасады',body_variant_id:'Корпус',countertopMaterialId:'Столешница',plinthMaterialId:'Цоколь'};
export class MaterialAppearanceUI{
  constructor(app){
    this.app=app;this.fields={};
    const card=el('details');card.id='material-appearance';card.open=true;
    card.append(el('summary','Вид материала в 3D'));
    const content=el('div');content.className='material-appearance-content';card.append(content);
    const select=(key,label,options)=>{
      const wrap=el('label',label),input=el('select');input.setAttribute('aria-label',label);
      for(const [value,text]of Object.entries(options)){const o=el('option',text);o.value=value;input.append(o);}
      wrap.append(input);content.append(wrap);this.fields[key]=input;return input;
    };
    this.target=select('target','Настроить вид материала',targets);
    this.target.value='front_variant_id';app.listen(this.target,'change',()=>this.sync(true));
    const sample=el('div');sample.className='material-appearance-sample';
    this.image=el('img');this.image.alt='Образец выбранного материала';this.image.loading='lazy';this.image.hidden=true;
    this.name=el('p');sample.append(this.image,this.name);content.append(sample);
    app.listen(this.image,'error',()=>{this.image.hidden=true;});
    this.note=el('p');this.note.className='studio-hint';content.append(this.note);
    const scaleWrap=el('label','Масштаб рисунка, %'),scale=el('input');scale.type='number';scale.min=25;scale.max=400;scale.step=5;scale.setAttribute('aria-label','Масштаб рисунка, %');scaleWrap.append(scale);content.append(scaleWrap);this.fields.scale=scale;
    app.listen(scale,'change',()=>{
      const value=Number(scale.value);
      if(!scale.value||!Number.isFinite(value)||value<25||value>400){app.adapter.status('Масштаб рисунка — от 25 до 400%.');this.sync(true);return;}
      this.patch({scale:value/100});
    });
    const rotation=select('rotation','Поворот рисунка',{0:'Исходное направление',90:'Повернуть на 90°',180:'Повернуть на 180°',270:'Повернуть на 270°'});
    app.listen(rotation,'change',()=>this.patch({rotation:Number(rotation.value)}));
    const finish=select('finish','Поверхность в 3D',SURFACE_FINISHES);
    app.listen(finish,'change',()=>this.patch({finish:finish.value}));
    this.reset=el('button','Сбросить вид материала');this.reset.type='button';this.reset.className='secondary';content.append(this.reset);
    app.listen(this.reset,'click',()=>this.patch(null));
    content.append(el('p','Настройка действует на этот материал во всей кухне. Меняется только картинка; артикул и направление текстуры для распила остаются прежними.'));
    document.getElementById('front-search').closest('.mf3d-control-card').append(card);
  }
  selected(){
    const a=this.app.adapter,id=a.selected?.[this.target.value];return {id,data:id?a.material(id):null};
  }
  patch(patch){
    const {id}=this.selected();if(!id)return;
    const a=this.app.adapter;
    this.app.history.run('Вид материала',()=>{
      const display={...a.state.displaySettings},all={...display.materialAppearance};
      if(patch===null)delete all[id];else all[id]=materialAppearance({...materialAppearance(all[id]),...patch});
      a.state.displaySettings={...display,materialAppearance:all};a.notify();
    });
  }
  sync(force=false){
    const {id,data}=this.selected(),a=this.app.adapter,settings=materialAppearance(a.state.displaySettings?.materialAppearance?.[id]),visual=materialVisual(data);
    this.name.textContent=data?.name||'Сначала выберите материал выше.';
    const sample=visual.url||data?.visual?.preview_url;
    const safe=typeof sample==='string'&&/^\/(?!\/)[\w/.-]+\.(?:png|jpe?g|webp)$/i.test(sample)&&!sample.includes('..');
    if(safe){if(this.image.getAttribute('src')!==sample){this.image.src=sample;this.image.hidden=false;}}else{this.image.removeAttribute('src');this.image.hidden=true;}
    this.note.textContent=!id?'Выберите фасады, корпус, столешницу или цоколь с назначенным материалом.':!data?'Загрузка материала…':visual.url?(data.visual?.scale_confirmed===false?'Масштаб исходного изображения ориентировочный. 100% — исходный размер рисунка.':'100% — размер рисунка из данных материала.')+' При увеличении масштаба рисунок становится крупнее.':visual.status==='USER_PREVIEW'?'Цвет по образцу приблизительный. Фото образца не переносится на поверхность.':visual.source==='color'?'Однотонный материал: можно настроить поверхность.':'Текстура отсутствует — используется нейтральный материал.';
    for(const key of ['scale','rotation','finish']){
      const input=this.fields[key];input.disabled=!data||(key!=='finish'&&!visual.url);
      if(force||document.activeElement!==input)input.value=key==='scale'?Math.round(settings.scale*100):settings[key];
    }
    this.reset.disabled=!id||!Object.hasOwn(a.state.displaySettings?.materialAppearance||{},id);
  }
}
