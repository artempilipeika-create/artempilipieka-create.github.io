import {blankItem,updateBlank,normalizeBlank,validateBlank,edgeMeters,blanksCSV,SOURCE_EDGE_CODES,EDGES} from './blanks-model.mjs';
import {findSpace} from './placement.mjs';

const get=id=>document.getElementById(id);
const numberField=(form,key)=>Number(form.querySelector('[name="'+key+'"]').value);
const textField=(form,key)=>form.querySelector('[name="'+key+'"]').value;
const axisNames={horizontal:'Горизонтальная · полка / крышка',side:'Вертикальная · боковая стойка',back:'Вертикальная · задняя панель / фасад'};
const edgeNames=['Длинный торец 1','Длинный торец 2','Короткий торец 1','Короткий торец 2'];

function formHtml(kind){
  const catalog=kind==='catalog';
  return `<div class="mf-blank-card">
    <div class="mf-blank-head"><span class="mf3d-kicker">ОДНА КАРТОЧКА · ВСЕ ВАРИАНТЫ ПВХ</span>
      <h3>${catalog?'Заготовка ЛДСП':'Параметры заготовки'}</h3>
      <p>${catalog?'Добавьте отдельную деталь, затем копируйте и располагайте её в 3D-сцене.':'Изменения сохраняются вместе с проектом. Перемещение — на самой сцене.'}</p></div>
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
      <div class="mf-blank-fields">
        <label>Длина, мм<input name="length" type="number" min="100" max="3000" step="1" value="720" required></label>
        <label>Ширина, мм<input name="partWidth" type="number" min="100" max="1200" step="1" value="400" required></label>
        <label>Толщина ЛДСП, мм<input name="thickness" type="number" min="10" max="40" step="1" value="18" required></label>
      </div>
      <label>Положение детали<select name="axis">
        <option value="horizontal">Горизонтально · полка / крышка</option>
        <option value="side">Вертикально · боковая стойка</option>
        <option value="back">Вертикально · задняя панель / фасад</option>
      </select></label>
      <fieldset class="mf-blank-edges"><legend>Кромка ПВХ по торцам</legend>
        ${edgeNames.map((label,i)=>`<label><input type="checkbox" name="edge${i}" ${i===0?'checked':''}><span>${label}</span></label>`).join('')}
      </fieldset>
      ${!catalog?`<div class="mf-blank-fields">
        <label>X, мм<input name="x" type="number" step="0.5" value="0"></label>
        <label>Z, мм<input name="z" type="number" step="0.5" value="0"></label>
        <label>Низ от пола, мм<input name="elevation" type="number" min="0" max="5000" step="1" value="0"></label>
      </div>
      <label>Поворот<select name="rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>`:''}
      <p class="mf-blank-result" aria-live="polite" data-blank-summary></p>
      <p class="mf-blank-source" data-blank-source></p>
      <p class="mf-blank-error" data-blank-error role="alert" hidden></p>
      ${catalog?`<button type="button" class="mf-blank-primary" data-blank-add>+ Добавить заготовку в 3D</button>
      <button type="button" class="secondary mf-blank-export" data-blank-export>Деталировка заготовок · CSV</button>`:''}
    </div>
  </div>`;
}
function readForm(form){
  const code=EDGES.map((_,i)=>form.querySelector('[name="edge'+i+'"]').checked?'1':'0').join('');
  return {blank_length_mm:numberField(form,'length'),blank_width_mm:numberField(form,'partWidth'),
    blank_thickness_mm:numberField(form,'thickness'),blank_axis:textField(form,'axis'),
    blank_edge_code:code,
    ...(form.dataset.kind==='inspector'?{x:numberField(form,'x'),z:numberField(form,'z'),
      elevation_mm:numberField(form,'elevation'),rotation:numberField(form,'rotation')}:{elevation_mm:0})};
}
function draw(form,room){
  const v=readForm(form),error=validateBlank(v,room);
  form.querySelector('[data-blank-code]').textContent=v.blank_edge_code;
  for(let i=0;i<4;i++){
    const line=form.querySelector('[data-edge-line="'+i+'"]');
    line.setAttribute('stroke',v.blank_edge_code[i]==='1'?'#17815a':'#d8ddd8');
  }
  const m=edgeMeters(v),count=v.blank_edge_code.split('1').length-1;
  form.querySelector('[data-blank-summary]').textContent=error?'':
    v.blank_length_mm+' × '+v.blank_width_mm+' × '+v.blank_thickness_mm+' мм · '+count+' торц. · ПВХ '+m.toFixed(2)+' м';
  form.querySelector('[data-blank-source]').textContent=SOURCE_EDGE_CODES.includes(v.blank_edge_code)?
    'Есть вариант с этим кодом среди 6 исходных FR3D.':'Новая комбинация ПВХ: геометрия доступна, исходный FR3D пока не предоставлен.';
  const box=form.querySelector('[data-blank-error]');
  box.textContent=error;box.hidden=!error;
  return !error;
}
function values(form,item){
  const b=normalizeBlank(item);
  for(const [key,value] of [['length',b.length],['partWidth',b.width],['thickness',b.thickness],['axis',b.axis],
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
      form.addEventListener('input',()=>draw(form,this.app.adapter.room));
      form.addEventListener('change',()=>{
        if(form===this.inspector)this.commit();
        else draw(form,this.app.adapter.room);
      });
    }
    this.catalog.querySelector('[data-blank-add]').addEventListener('click',()=>this.add());
    this.catalog.querySelector('[data-blank-export]').addEventListener('click',()=>this.export());
    draw(this.catalog,this.app.adapter.room);
    this.sync();
  }
  add(){
    if(!draw(this.catalog,this.app.adapter.room))return;
    const spec=readForm(this.catalog);
    const draft=blankItem({...spec,body_variant_id:globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body||null});
    const ok=this.app.interaction.change('Добавление заготовки ЛДСП',()=>{
      const next=findSpace(draft,this.app.adapter.items,this.app.adapter.room,this.app.adapter.selected,{enabled:true,alignment:'front',wallOffset:0,autoRotate:false,allowElevation:true});
      if(!next)throw new Error('Для детали нет свободного места в помещении.');
      const err=this.app.adapter.validate(next);if(err)throw new Error(err);
      this.app.adapter.insert(next);
      this.app.adapter.status('Добавлена заготовка · ПВХ '+next.blank_edge_code);
    });
    if(ok)this.app.workspace?.panel('right',true,{focus:true});
  }
  commit(){
    const source=this.app.adapter.selected;if(source?.module_type!=='blank')return;
    if(!draw(this.inspector,this.app.adapter.room))return;
    const updated=updateBlank(source,readForm(this.inspector));
    const ok=this.app.interaction.change('Параметры заготовки',()=>{
      const error=this.app.adapter.validate(updated);if(error)throw new Error(error);
      this.app.adapter.replace(updated);
    });
    if(!ok)this.sync();
  }
  export(){
    const items=this.app.adapter.items.filter(it=>it.module_type==='blank');
    if(!items.length){this.app.adapter.status('Сначала добавьте заготовку в проект.');return;}
    const file=new Blob([blanksCSV(items)],{type:'text/csv;charset=utf-8'});
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
    values(this.inspector,item);draw(this.inspector,this.app.adapter.room);
  }
  dispose(){this.catalog.remove();this.inspector.remove();get('module-tabs')?.querySelector('[data-module-filter="blanks"]')?.remove();document.body.classList.remove('mf-blank-selected');}
}
