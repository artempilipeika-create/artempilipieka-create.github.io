import './blanks-native.mjs';
import {defaultHookFace,hookHeightLimits} from './blank-hook.mjs';
import {blankItem,updateBlank,normalizeBlank,validateBlank,edgeMeters,blanksCSV,blankCopies,cuttingSize,SOURCE_EDGE_CODES,EDGES} from './blanks-model.mjs';
import {findSpace} from './placement.mjs';
import {localPoint} from './blank-bindings.mjs';
import {CarcassUI} from './carcass-ui.mjs';

const get=id=>document.getElementById(id);
const numberField=(form,key)=>Number(form.querySelector('[name="'+key+'"]').value);
const textField=(form,key)=>form.querySelector('[name="'+key+'"]').value;
const edgeNames=['Длинный торец 1','Длинный торец 2','Короткий торец 1','Короткий торец 2'];

function formHtml(kind){
  const catalog=kind==='catalog';
  return `<div class="mf-blank-card">
    <div class="mf-blank-head"><span class="mf3d-kicker">ДЕТАЛИ ВАШЕГО ПРОЕКТА</span>
      <h3>${catalog?'Заготовка ЛДСП':'Параметры заготовки'}</h3>
      <p>${catalog?'Полка, стойка или фасад — задайте размер и отметьте нужные торцы.':'Изменения сохраняются вместе с проектом. Перемещение — на самой сцене.'}</p></div>
    <div class="mf-blank-hero" aria-hidden="true"><span class="mf-blank-chip">ЛДСП · <b data-hero-thickness>18</b> мм</span><div class="mf-blank-board"><i></i></div><span class="mf-blank-hero-label">Точная деталь. Ваша конструкция.</span></div>
    <div class="mf-blank-sketch">
      <svg viewBox="0 0 320 210" role="img" aria-label="Схема четырёх торцов прямоугольной детали">
        <rect x="64" y="31" width="192" height="136" rx="2" fill="#d2b58a" stroke="#8e704b" stroke-width="1.6"/>
        <path d="M72 38 Q96 75 71 156 M122 36 Q135 92 121 157 M187 37 Q202 98 183 156 M225 37 Q220 91 232 161" fill="none" stroke="#a98e68" opacity=".45" stroke-width="2"/>
        <path data-edge-line="0" d="M64 167H256" stroke="#d8ddd8" stroke-width="8"/>
        <path data-edge-line="1" d="M64 31H256" stroke="#d8ddd8" stroke-width="8"/>
        <path data-edge-line="2" d="M64 31V167" stroke="#d8ddd8" stroke-width="8"/>
        <path data-edge-line="3" d="M256 31V167" stroke="#d8ddd8" stroke-width="8"/>
        <g fill="#31493d" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">
          <text x="160" y="194">1 · длинный</text><text x="160" y="20">2 · длинный</text>
          <text x="32" y="103">3</text><text x="283" y="103">4</text>
        </g>
      </svg>
      <span class="mf-blank-code">Код ПВХ: <strong data-blank-code>1000</strong></span>
    </div>
    <div class="mf-blank-form">
      ${catalog?`<label>Название детали<select name="partName"><option>Полка</option><option>Стойка</option><option>Крышка</option><option>Днище</option><option>Перегородка</option><option>Фасад</option></select></label>`:''}
      <div class="mf-blank-section-title">01 <span>Готовый размер с кромкой</span></div><div class="mf-blank-fields">
        <label>Длина, мм<input name="length" type="number" min="100" max="3000" step="1" value="720" required></label>
        <label>Ширина, мм<input name="partWidth" type="number" min="40" max="3000" step="1" value="400" required></label>
        <label>Толщина материала, мм<input name="thickness" type="number" min="3" max="40" step="1" value="18" required></label>
      </div>
      <label>Положение детали<select name="axis">
        <option value="horizontal">Горизонтально · полка / крышка</option>
        <option value="side">Вертикально · боковая стойка</option>
        <option value="back">Вертикально · задняя панель / фасад</option>
      </select></label>
      <div class="mf-blank-section-title">02 <span>Схема оклейки</span></div><div class="mf-blank-presets" role="group" aria-label="Схемы оклейки">
        ${SOURCE_EDGE_CODES.map(code=>`<button type="button" data-blank-preset="${code}" aria-pressed="${code==='1000'}"><svg viewBox="0 0 64 44" aria-hidden="true"><rect x="12" y="8" width="40" height="28" fill="#f0e8d9"/>${['M12 36H52','M12 8H52','M12 8V36','M52 8V36'].map((d,i)=>`<path d="${d}" fill="none" stroke="${code[i]==='1'?'#247a58':'#cdd4cc'}" stroke-width="4"/>`).join('')}</svg><span>${code==='0000'?'Без ПВХ':code==='1111'?'В круг':code}</span></button>`).join('')}
      </div>
      <fieldset class="mf-blank-edges"><legend>Кромка ПВХ по торцам</legend>
        ${edgeNames.map((label,i)=>`<label><input type="checkbox" name="edge${i}" ${i===0?'checked':''}><span>${label}</span></label>`).join('')}
      </fieldset>
      <label>Толщина ПВХ, мм<select name="edgeThickness"><option value="0.4">0,4 мм</option><option value="0.8">0,8 мм</option><option value="1" selected>1 мм · как в ваших FR3D</option><option value="2">2 мм</option><option value="3">3 мм</option></select></label>
      ${!catalog?`<div class="mf-blank-fields">
        <label>X, мм<input name="x" type="number" step="0.5" value="0"></label>
        <label>Z, мм<input name="z" type="number" step="0.5" value="0"></label>
        <label>Низ от пола, мм<input name="elevation" type="number" min="0" max="5000" step="1" value="0"></label>
      </div>
      <label>Поворот<select name="rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>`:''}
      ${!catalog?`<fieldset class="mf-blank-binding"><legend>Привязки и размеры</legend>
        <label><input type="checkbox" name="bound"> Полка между двумя стойками</label>
        <p>Длина считается между внутренними сторонами стоек с учётом зазоров. Высоту полки задайте в поле «Низ от пола».</p>
        <label>Левая стойка<select name="leftSupport"></select></label>
        <label>Правая стойка<select name="rightSupport"></select></label>
        <div class="mf-blank-fields"><label>Зазор слева, мм<input name="gapLeft" type="number" min="0" max="100" step="1" value="0"></label>
        <label>Зазор справа, мм<input name="gapRight" type="number" min="0" max="100" step="1" value="0"></label></div>
        <label>Смещение от центра левой стойки по глубине, мм<input name="depthOffset" type="number" min="-1200" max="1200" step="0.5" value="0"></label>
        <p data-binding-result aria-live="polite"></p>
      </fieldset>`:''}
      ${!catalog?`<fieldset data-hook-panel><legend>Фурнитура</legend>
        <label>Крючок<select name="hook"><option value="">Без крючка</option><option value="68416">AKKORD · два рожка · античная латунь · 68416</option></select></label>
        <div data-hook-controls><label>Количество крючков<select name="hookCount"><option value="1">1 шт.</option><option value="2">2 шт.</option><option value="3">3 шт.</option><option value="4">4 шт.</option></select></label><label>Сторона крепления<select name="hookFace"></select></label>
        <label><span data-hook-along-label></span><input name="hookAlong" type="number" min="0" step="0.5" placeholder="По центру"></label>
        <label>Высота крючков от низа детали до оси, мм<input name="hookHeight" type="number" step="0.5" placeholder="По центру"></label>
        <input name="hookHeightSlider" type="range" step="0.5" aria-label="Передвинуть ряд крючков по высоте">
        <output data-hook-height-note></output>
        <small>Крючки в ряду стоят на одной высоте с равным шагом. Оставьте отступ пустым, чтобы ряд оставался по центру детали.</small></div>
      </fieldset>`:''}
      <p class="mf-blank-cut"  data-blank-cut></p><p class="mf-blank-result" aria-live="polite" data-blank-summary></p>
      <p class="mf-blank-source" data-blank-source></p>
      <p class="mf-blank-error" data-blank-error role="alert" hidden></p>
      ${catalog?`<button type="button" class="mf-blank-primary" data-blank-add>+ Добавить заготовку в 3D</button>
      <button type="button" class="secondary mf-blank-export" data-blank-export>Деталировка заготовок · CSV</button>
      <button type="button" class="mf-blank-primary" data-blank-bazis>Экспорт проекта в БАЗИС</button>
      <div class="mf-blank-downloads"><a href="/account/planner/bazis-drawers-import.js?v=20261114-blank-hooks" download="Martin_Forest_Import_v9_9_16.js">Импортёр 9.9.16 ↓</a></div>`:''}
      ${!catalog?`<details class="mf-blank-repeat"><summary>Копировать с шагом</summary><div class="mf-blank-fields"><label>Копий<input name="copyCount" type="number" min="1" max="30" value="1"></label><label>Шаг, мм<input name="copyStep" type="number" step="0.5" value="300"></label></div><label>Направление<select name="copyAxis"><option value="elevation_mm">По высоте</option><option value="x">По X</option><option value="z">По Z</option></select></label><button type="button" data-blank-copy>Создать копии</button></details>`:''}
    </div>
  </div>`;
}
function readForm(form){
  const code=EDGES.map((_,i)=>form.querySelector('[name="edge'+i+'"]').checked?'1':'0').join('');
  const hook=form.elements.hook;
  const offset=name=>form.elements[name].value===''?null:numberField(form,name);
  return {...(hook?{blank_hook:hook.value?{article:hook.value,count:numberField(form,'hookCount'),face:textField(form,'hookFace'),along_mm:offset('hookAlong'),height_mm:offset('hookHeight')}:null}:{}),blank_length_mm:numberField(form,'length'),blank_width_mm:numberField(form,'partWidth'),
    blank_thickness_mm:numberField(form,'thickness'),blank_axis:textField(form,'axis'),
    ...(form.dataset.kind==='catalog'?{name:textField(form,'partName')}:{}),
    blank_edge_code:code,blank_edge_thickness_mm:numberField(form,'edgeThickness'),
    ...(form.dataset.kind==='inspector'?{x:numberField(form,'x'),z:numberField(form,'z'),
      elevation_mm:numberField(form,'elevation'),rotation:numberField(form,'rotation')}:{elevation_mm:0})};
}
function draw(form,room){
  const v=readForm(form),error=validateBlank(v,room);
  if(form.elements.hook){
    form.querySelector('[data-hook-controls]').hidden=!v.blank_hook;
    if(v.blank_hook){
      const height=v.blank_axis==='side'?v.blank_length_mm:v.blank_width_mm;
      const {min,max}=hookHeightLimits(height),input=form.elements.hookHeight,slider=form.elements.hookHeightSlider;
      input.min=slider.min=min;input.max=slider.max=Math.max(min,max);slider.disabled=max<min;
      const y=v.blank_hook.height_mm??height/2;
      slider.value=y;input.placeholder='По центру · '+height/2;
      form.querySelector('[data-hook-height-note]').textContent=max<min?'Крючок не помещается по высоте.':'Ось крепления: '+y+' мм. Диапазон '+min+'–'+max+' мм.';
    }
  }
  form.querySelector('[data-blank-code]').textContent=v.blank_edge_code;
  for(const button of form.querySelectorAll('[data-blank-preset]'))button.setAttribute('aria-pressed',String(button.dataset.blankPreset===v.blank_edge_code));
  for(let i=0;i<4;i++){
    const line=form.querySelector('[data-edge-line="'+i+'"]');
    line.setAttribute('stroke',v.blank_edge_code[i]==='1'?'#17815a':'#d8ddd8');
  }
  form.querySelector('[data-hero-thickness]').textContent=v.blank_thickness_mm;
  const cut=cuttingSize(v);form.querySelector('[data-blank-cut]').textContent=error?'':'Размер распила: '+cut.length+' × '+cut.width+' мм';
  const m=edgeMeters(v),count=v.blank_edge_code.split('1').length-1;
  form.querySelector('[data-blank-summary]').textContent=error?'':
    v.blank_length_mm+' × '+v.blank_width_mm+' × '+v.blank_thickness_mm+' мм · '+count+' торц. · ПВХ '+m.toFixed(2)+' м';
  form.querySelector('[data-blank-source]').textContent='Кромка остаётся на выбранных торцах при повороте детали. В деталировке и БАЗИС толщина ПВХ вычитается из готового размера.';
  const box=form.querySelector('[data-blank-error]');
  box.textContent=error;box.hidden=!error;
  return !error;
}
function values(form,item){
  const b=normalizeBlank(item);
  for(const [key,value] of [['length',b.length],['partWidth',b.width],['thickness',b.thickness],['axis',b.axis],['edgeThickness',b.edgeThickness],
    ['x',item.x],['z',item.z],['elevation',b.elevation],['rotation',item.rotation]]){
    const el=form.querySelector('[name="'+key+'"]');if(el)el.value=String(value??0);
  }
  for(let i=0;i<4;i++)form.querySelector('[name="edge'+i+'"]').checked=b.code[i]==='1';
}
export class BlanksUI{
  constructor(app){
    this.app=app;
    const tab=document.createElement('button');tab.type='button';tab.dataset.moduleFilter='blanks';tab.setAttribute('aria-pressed','false');tab.textContent='Заготовки';
    get('module-tabs').append(tab);
    this.catalog=document.createElement('form');this.catalog.id='mf-blank-catalog';this.catalog.className='mf-blank-catalog';this.catalog.dataset.kind='catalog';this.catalog.hidden=true;this.catalog.innerHTML=formHtml('catalog');
    get('module-catalogue').after(this.catalog);
    this.inspector=document.createElement('form');this.inspector.id='mf-blank-inspector';this.inspector.className='mf-blank-inspector';this.inspector.dataset.kind='inspector';this.inspector.hidden=true;this.inspector.innerHTML=formHtml('inspector');
    get('item-controls').insertBefore(this.inspector,get('template-info'));
    this.itemControls=get('item-controls');
    for(const form of [this.catalog,this.inspector]){
      form.addEventListener('submit',e=>e.preventDefault());
      for(const button of form.querySelectorAll('[data-blank-preset]'))button.addEventListener('click',()=>{
        for(let i=0;i<4;i++)form.querySelector('[name="edge'+i+'"]').checked=button.dataset.blankPreset[i]==='1';
        if(form===this.inspector)this.commit();
        else draw(form,this.app.adapter.room);
      });
      form.querySelector('[data-blank-copy]')?.addEventListener('click',()=>this.copy());
      form.addEventListener('input',e=>{
        const name=e.target.name;
        if(name==='hookHeightSlider')form.elements.hookHeight.value=e.target.value;
        const valid=draw(form,this.app.adapter.room);
        if(name==='hookHeightSlider'||name==='hookHeight'){
          const it=this.app.adapter.selected;
          if(it?.blank_hook){
            const height=valid?readForm(form).blank_hook.height_mm:it.blank_hook.height_mm;
            this.app.scene?.previewHookHeight?.(it.item_id,height??it.height/2);
          }
        }
      });
      form.elements.hookHeight?.addEventListener('keydown',e=>{
        if(e.key==='Enter'){e.preventDefault();e.target.blur();}
      });
      form.addEventListener('change',e=>{
        if(e.target.closest('.mf-blank-binding')&&e.target.name!=='bound'&&!form.querySelector('[name="bound"]').checked)return;
        if(form===this.inspector)this.commit();
        else draw(form,this.app.adapter.room);
      });
    }
    this.catalog.querySelector('[data-blank-add]').addEventListener('click',()=>this.add());
    this.catalog.querySelector('[data-blank-bazis]').addEventListener('click',()=>get('export-bazis').click());
    this.catalog.querySelector('[data-blank-export]').addEventListener('click',()=>this.export());
    draw(this.catalog,this.app.adapter.room);
    this.carcasses=new CarcassUI(app,this.catalog);
    // One export section remains visible in both catalogue modes.
    const exports=document.createElement('section');exports.className='mf-blank-card mf-blank-form';
    exports.setAttribute('aria-label','Экспорт корпусов');
    for(const selector of ['[data-blank-bazis]','[data-blank-export]','.mf-blank-downloads'])exports.append(this.catalog.querySelector(selector));
    const help=document.createElement('details');
    help.innerHTML='<summary>Как открыть в БАЗИС</summary><ol><li>Скачайте импортёр 9.9.16 и замените им действующий скрипт Martin Forest. Старую копию сохраните вне папки Scripts.</li><li>Распакуйте «Исходные заготовки» в отдельную подпапку вашей общей библиотеки модулей. Имена FR3D не меняйте.</li><li>Нажмите «Экспорт проекта в БАЗИС»: скачается файл .mf-bazis.json.</li><li>В БАЗИС откройте новую пустую модель и запустите импортёр. Он найдёт последний экспорт в Загрузках; при запросе укажите общую папку модулей.</li><li>Проверьте модель и сохраните её как B3D.</li></ol><p class="mf-blank-source">Если материал не выбран, экспорт укажет деталь. Выберите её в проекте и назначьте материал нужной толщины в панели справа.</p>';
    exports.append(help);this.catalog.append(exports);
    this.sync();
  }
  add(){
    if(!draw(this.catalog,this.app.adapter.room))return;
    const spec=readForm(this.catalog);
    const draft=blankItem({...spec,
      // 605 PO is an 18 mm donor. Never label a thinner/thicker board as 18 mm stock.
      body_variant_id:spec.blank_thickness_mm===18?(globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id||null):null
    });
    const ok=this.app.interaction.change('Добавление заготовки ЛДСП',()=>{
      const next=findSpace(draft,this.app.adapter.items,this.app.adapter.room,this.app.adapter.selected,{enabled:true,alignment:'front',wallOffset:0,autoRotate:false,allowElevation:true});
      if(!next)throw new Error('Для детали нет свободного места в помещении.');
      const err=this.app.adapter.validate(next);if(err)throw new Error(err);
      this.app.adapter.insert(next);
      this.app.adapter.status('Добавлена заготовка · ПВХ '+next.blank_edge_code+
        (!next.body_variant_id?' · выберите ЛДСП '+next.blank_thickness_mm+' мм в материалах.':''));
    });
    if(ok)this.app.workspace?.panel('right',true,{focus:true});
  }
  commit(){
    const source=this.app.adapter.selected;if(source?.module_type!=='blank')return;
    if(!draw(this.inspector,this.app.adapter.room))return;
    const form=this.inspector,bound=form.querySelector('[name="bound"]').checked;
    const binding=bound?{left_id:textField(form,'leftSupport'),right_id:textField(form,'rightSupport'),
      gap_left_mm:numberField(form,'gapLeft'),gap_right_mm:numberField(form,'gapRight'),depth_offset_mm:numberField(form,'depthOffset')}:null;
    const updated=updateBlank(source,{...readForm(form),blank_binding:binding});
    const ok=this.app.interaction.change('Параметры заготовки',()=>{
      this.app.adapter.replace(updated);
    });
    if(!ok)this.sync();
  }
  copy(){
    const source=this.app.adapter.selected;if(source?.module_type!=='blank')return;
    this.app.interaction.change('Копирование заготовок с шагом',()=>{
      const copies=blankCopies(source,numberField(this.inspector,'copyCount'),numberField(this.inspector,'copyStep'),textField(this.inspector,'copyAxis'));
      const all=[...this.app.adapter.items];
      if(all.length+copies.length>100)throw Error('В проекте поддерживается до 100 деталей и модулей.');
      for(const copy of copies){const error=this.app.adapter.validate(copy,all);if(error)throw Error(error);all.push(copy);}
      for(const copy of copies)this.app.adapter.insert(copy);
    });
  }
  export(){
    const items=this.app.adapter.items.filter(it=>it.module_type==='blank');
    if(!items.length){this.app.adapter.status('Сначала добавьте заготовку в проект.');return;}
    const file=new Blob([blanksCSV(items,id=>this.app.adapter.material(id))],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='Martin_Forest_Заготовки.csv';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  sync(){
    const item=this.app.adapter.selected,isBlank=item?.module_type==='blank';
    this.inspector.hidden=!isBlank;
    document.body.classList.toggle('mf-blank-selected',Boolean(isBlank));
    const allow=el=>el===this.inspector||el.classList.contains('mf3d-section-head')||
      el.classList.contains('studio-rename')||el.id==='item-brief-details'||el.classList.contains('mf3d-item-head-actions')||
      Boolean(el.querySelector('#body-search'));
    for(const child of this.itemControls.children)child.classList.toggle('mf-blank-hidden',Boolean(isBlank)&&!allow(child));
    for(const el of this.itemControls.querySelectorAll('.mf3d-material')){
      el.classList.toggle('mf-blank-hidden',Boolean(isBlank)&&!el.querySelector('#body-search'));
    }
    if(!isBlank)return;
    const badge=get('studio-item-type');if(badge)badge.textContent='Заготовка';
    const controls=this.inspector.elements, hook=item.blank_hook, side=item.blank_axis==='side';
    this.inspector.querySelector('[data-hook-panel]').hidden=item.blank_axis==='horizontal'&&!hook;
    controls.hook.value=hook?.article||'';controls.hookCount.value=String(hook?.count??1);
    controls.hookFace.replaceChildren(new Option(side?'Вправо · внутрь левой боковины':'Вперёд · в шкаф','positive'), new Option(side?'Влево · внутрь правой боковины':'Назад','negative'));
    controls.hookFace.value=hook?.face||defaultHookFace(item);
    controls.hookAlong.value=hook?.along_mm??'';controls.hookHeight.value=hook?.height_mm??'';
    this.inspector.querySelector('[data-hook-along-label]').textContent=side?'От заднего края до центра ряда, мм':'От левого края до центра ряда, мм';
    this.inspector.querySelector('[data-hook-controls]').hidden=!hook;
    values(this.inspector,item);draw(this.inspector,this.app.adapter.room);
    const form=this.inspector,b=item.blank_binding,field=form.querySelector('.mf-blank-binding');
    field.hidden=item.blank_axis!=='horizontal';
    const supports=this.app.adapter.items.filter(it=>it.module_type==='blank'&&it.blank_axis==='side'&&it.rotation===item.rotation);
    for(const [name,id] of [['leftSupport',b?.left_id],['rightSupport',b?.right_id]]){
      const select=form.querySelector('[name="'+name+'"]');select.replaceChildren(new Option('Выберите стойку',''));
      for(const support of supports){const p=localPoint(support,item.rotation);select.add(new Option(support.name+' · '+support.blank_thickness_mm+' мм · позиция '+p.x+' мм',support.item_id));}
      select.value=id||'';
    }
    form.querySelector('[name="bound"]').checked=Boolean(b);
    for(const [name,value] of [['gapLeft',b?.gap_left_mm],['gapRight',b?.gap_right_mm],['depthOffset',b?.depth_offset_mm]])form.querySelector('[name="'+name+'"]').value=value??0;
    for(const name of ['length','x','z','rotation','axis'])form.querySelector('[name="'+name+'"]').disabled=Boolean(b);
    form.querySelector('[data-binding-result]').textContent=b?'Расчётная длина: '+item.blank_length_mm+' мм. При изменении стоек полка пересчитывается автоматически. Чтобы двигать её отдельно, снимите привязку.':'Выберите стойки и зазоры, затем включите привязку.';
  }
  dispose(){this.catalog.remove();this.inspector.remove();get('module-tabs')?.querySelector('[data-module-filter="blanks"]')?.remove();document.body.classList.remove('mf-blank-selected');}
}
