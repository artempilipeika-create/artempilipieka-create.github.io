import catalogue from './wardrobe-light-kit.json' with {type:'json'};

const controls = {touch:'Сенсорная кнопка',wave:'Взмах руки',motion:'Датчик движения',door:'Открытие двери',external:'Внешнее управление заказчика'};
const num = value => value.toLocaleString('ru-RU',{maximumFractionDigits:2});
const money = value => value.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
function el(tag,text){
  const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  return node;
}

export function lightKitControls(ui){
  if(!Object.values(ui.fields.lighting??{}).some(list=>list.length))return;
  const section=el('details');section.className='wardrobe-kit';
  section.open=Boolean(ui.kitOpen);
  section.ontoggle=()=>{if(section.isConnected)ui.kitOpen=section.open;};
  section.append(el('summary','Комплект и смета подсветки'));
  const selected=ui.fields.lightKit?.control??'touch';
  ui.select(section,'Управление подсветкой',Object.entries(controls),selected,value=>{
    ui.kitOpen=section.open;(ui.fields.lightKit??={}).control=value;ui.changed(true);
  });
  if(Object.values(ui.fields.lighting).some(rows=>rows.some(row=>row.system==='lira-17.5x6.5'))){
    const holderLabel=el('label','Держатели LIRA‑1707, шт.'),count=el('input');count.type='number';count.step='1';
    count.min='0';count.max='32000';count.placeholder='Авто · 4 шт. на 2 м';count.value=ui.fields.lightKit?.holders??'';
    count.setAttribute('aria-label','Количество держателей LIRA-1707');
    count.onchange=()=>{
      if(!count.reportValidity())return;
      const settings=ui.fields.lightKit??={};
      if(count.value==='')delete settings.holders;else settings.holders=count.valueAsNumber;
      ui.changed();
    };holderLabel.append(count);section.append(holderLabel);
  }
  const article=catalogue.controls[selected];
  if(article){
    const product=catalogue.products[article],figure=el('figure'),img=el('img');
    img.src='/account/planner/light-kit-photos/'+article+'.webp';img.alt=controls[selected];img.width=94;img.height=66;
    figure.append(img,el('figcaption',product.name+' · арт. '+article+'. Установка на месте.'));section.append(figure);
  }
  const quote=el('div');quote.dataset.lightKitQuote='';quote.setAttribute('aria-live','polite');section.append(quote);
  ui.form.append(section);
}

function showQuote(ui,box,quote){
  const pricingWasOpen=box.querySelector('.light-kit-prices')?.open??false;
  const cutsWereOpen=box.querySelector('.light-kit-cuts')?.open??false;
  const output=document.createDocumentFragment();
  output.append(el('strong',(quote.complete?'Итого подсветка':'По известным ценам')+' · '+money(quote.subtotal)+' BYN'));
  for(const [i,group] of quote.groups.entries()){
    const label=quote.groups.length>1?'Группа '+(i+1)+' · ':'';
    output.append(el('p',label+group.lines.length+' лин. · '+num(group.watts)+' Вт · блок '+group.rated+' Вт / 12 В'));
  }
  const prices=el('details');prices.className='light-kit-prices';prices.open=pricingWasOpen;
  prices.append(el('summary','Состав и цены в BYN'),el('small','Розничные цены на '+quote.checked.split('-').reverse().join('.')+'. Для этого шкафа можно указать свою цену за единицу.'));
  const table=el('table'),thead=el('thead'),heading=el('tr'),body=el('tbody');
  for(const title of ['Позиция','Кол-во','Цена','Сумма'])heading.append(el('th',title));
  thead.append(heading);table.append(thead,body);
  for(const row of quote.rows){
    const tr=el('tr'),name=el('td'),source=el('a','арт. '+row.article);source.href=row.url;source.target='_blank';source.rel='noopener noreferrer';
    name.append(el('span',row.name),source);
    const value=el('td'),input=el('input');input.type='number';input.min='0';input.max='100000';input.step='.01';
    input.setAttribute('aria-label','Цена за единицу '+row.article+', BYN');
    input.value=ui.fields.lightKit?.prices?.[row.article]??'';
    input.placeholder=catalogue.products[row.article].price===null?'Уточнить':money(catalogue.products[row.article].price);
    input.onchange=()=>{
      if(!input.reportValidity())return;
      const settings=ui.fields.lightKit??={},overrides=settings.prices??={};
      if(input.value==='')delete overrides[row.article];else overrides[row.article]=input.valueAsNumber;
      ui.changed();
    };
    value.append(input);tr.append(name,el('td',String(row.qty)),value,el('td',row.amount===null?'Уточнить':money(row.amount)));body.append(tr);
  }
  prices.append(table);output.append(prices);
  const cuts=el('details');cuts.className='light-kit-cuts';cuts.open=cutsWereOpen;cuts.append(el('summary','Отрезки и подключение'));
  for(const [i,line] of quote.lines.entries())cuts.append(el('p',(i+1)+'. '+line.label+' · паз '+num(line.length)+' мм · лента '+num(line.fitted)+' мм'));
  for(const bar of quote.stock)cuts.append(el('p','LIRA '+bar.length+' мм · отрезки '+bar.lines.map(i=>num(quote.lines[i].length)).join(' + ')+' мм'));
  for(const [i,g] of quote.groups.entries())cuts.append(el('p','Блок '+(i+1)+' · арт. '+g.supply+' · линии '+g.lines.map(n=>n+1).join(', ')));
  cuts.append(el('small','До 80% мощности блока и до шести линий на группу. Между отрезками одного профиля заложен пропил 4,4 мм.'));
  for(const note of quote.notes)cuts.append(el('p',note));output.append(cuts);
  box.replaceChildren(output);
}

export function updateLightQuote(ui,built,issue=''){
  const box=ui.form.querySelector('[data-light-kit-quote]');
  if(!box)return;
  const runs=[];
  for(const part of built?.parts??[]){
    for(const cut of part.item.blank_machining??[])if(cut.lightSystem)runs.push({label:part.label,system:cut.lightSystem,
      length:part.item.blank_length_mm-(cut.start??0)-(cut.end??0)});
  }
  if(issue||!runs.length){box.dataset.requestKey='';box.textContent=issue||'Проверьте размеры линий подсветки.';return;}
  const payload={runs,settings:ui.fields.lightKit??{}},key=JSON.stringify(payload);
  if(box.dataset.requestKey===key)return;
  box.dataset.requestKey=key;
  if(ui.lightKitResult?.key===key){showQuote(ui,box,ui.lightKitResult.result);return;}
  if(!box.children.length)box.textContent='Расчёт комплекта…';
  clearTimeout(ui.lightKitTimer);
  ui.lightKitTimer=setTimeout(async()=>{
    if(!box.isConnected||box.dataset.requestKey!==key)return;
    try{
      const result=await ui.app.bridge.request('/3d-assistant/lighting-estimate','POST',payload);
      if(!box.isConnected||box.dataset.requestKey!==key)return;
      ui.lightKitResult={key,result};showQuote(ui,box,result);
    }catch{
      if(!box.isConnected||box.dataset.requestKey!==key)return;
      const retry=el('button','Повторить расчёт');retry.type='button';
      retry.onclick=()=>{delete box.dataset.requestKey;updateLightQuote(ui,ui.previewBuilt);};
      box.replaceChildren(el('p','Не удалось получить смету подсветки.'),retry);
    }
  },180);
}
