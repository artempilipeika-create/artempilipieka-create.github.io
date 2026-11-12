import {CARCASSES,buildCarcass,placeCarcass,insertCarcass} from './carcass-model.mjs';
import {cuttingSize} from './blanks-model.mjs';
import {findSpace} from './placement.mjs';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=(name,label,value,min,max)=>`<label>${label}<input name="corpus-${name}" type="number" min="${min}" max="${max}" step="1" value="${value}" required></label>`;
const codes=Array.from({length:16},(_,i)=>i.toString(2).padStart(4,'0'));

// A projection of the actual generated panels, shared by card and live preview.
export function carcassSVG(built,small=false){
  const {spec:s,parts}=built,points=[];
  const project=(x,y,z)=>{const p=[x+.48*z,-(y-s.elevation)+.25*z];points.push(p);return p;};
  const panels=parts.map(({key,item:i})=>{
    const X=i.x-i.width/2,Y=i.elevation_mm,Z=i.z-i.depth/2,w=i.width,h=i.height,d=i.depth;
    const p=(x,y,z)=>project(x,y,z),faces=[
      [p(X,Y,Z+d),p(X+w,Y,Z+d),p(X+w,Y+h,Z+d),p(X,Y+h,Z+d)],
      [p(X+w,Y,Z),p(X+w,Y,Z+d),p(X+w,Y+h,Z+d),p(X+w,Y+h,Z)],
      [p(X,Y+h,Z),p(X+w,Y+h,Z),p(X+w,Y+h,Z+d),p(X,Y+h,Z+d)]];
    const e=i.blank_axis==='side'?[
      [p(X+w,Y,Z+d),p(X+w,Y+h,Z+d)],[p(X+w,Y,Z),p(X+w,Y+h,Z)],
      [p(X+w,Y,Z),p(X+w,Y,Z+d)],[p(X+w,Y+h,Z),p(X+w,Y+h,Z+d)]]:i.blank_axis==='back'?[
      [p(X,Y,Z+d),p(X+w,Y,Z+d)],[p(X,Y+h,Z+d),p(X+w,Y+h,Z+d)],
      [p(X,Y,Z+d),p(X,Y+h,Z+d)],[p(X+w,Y,Z+d),p(X+w,Y+h,Z+d)]]:[
      [p(X,Y+h,Z+d),p(X+w,Y+h,Z+d)],[p(X,Y+h,Z),p(X+w,Y+h,Z)],
      [p(X,Y+h,Z),p(X,Y+h,Z+d)],[p(X+w,Y+h,Z),p(X+w,Y+h,Z+d)]];
    return {key,i,faces,e,sort:i.z-i.elevation_mm*.01};
  }).sort((a,b)=>a.sort-b.sort);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),W=Math.max(...xs)-minX,H=Math.max(...ys)-minY,pad=Math.max(W,H)*.08;
  return `<svg viewBox="${minX-pad} ${minY-pad} ${W+2*pad} ${H+2*pad}" role="img" aria-label="${escape(s.label)}: схема деталей корпуса">${panels.map(({key,i,faces,e})=>
    `<g>${faces.map((f,n)=>`<polygon points="${f.map(p=>p.join(',')).join(' ')}" fill="${key==='back'?'#e5e8df':['#e4d8bc','#b5a98e','#f5edda'][n]}" stroke="#6b7567" stroke-width="${Math.max(W,H)*.0017}"/>`).join('')}${e.map((line,n)=>i.blank_edge_code[n]==='1'?`<path d="M${line[0].join(',')}L${line[1].join(',')}" stroke="#15845b" stroke-width="${Math.max(W,H)*(small?.006:.0035)}" fill="none"/>`:'').join('')}</g>`).join('')}</svg>`;
}

export class CarcassUI{
  constructor(app,root){
    this.app=app;this.edges={};this.root=document.createElement('section');this.root.className='mf-carcass';
    const old=root.querySelector('.mf-blank-card');
    const nav=document.createElement('div');nav.className='mf-blank-modes';nav.setAttribute('role','group');nav.setAttribute('aria-label','Способ сборки');
    nav.innerHTML='<button type="button" aria-pressed="true">Готовые корпуса</button><button type="button" aria-pressed="false">Отдельная деталь</button>';
    root.prepend(nav,this.root);old.hidden=true;
    [...nav.children].forEach((button,index)=>button.addEventListener('click',()=>{this.root.hidden=Boolean(index);old.hidden=!index;[...nav.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));}));
    this.root.innerHTML=`<div class="mf-blank-head"><span class="mf3d-kicker">СОБРАТЬ ИЗ ЗАГОТОВОК</span><h3>Выберите корпус</h3><p>Конструкция → размеры → детали с кромкой. Каждый элемент можно изменить после добавления.</p></div>
      <div class="mf-carcass-cards">${CARCASSES.map(r=>`<button type="button" data-carcass="${r.id}" aria-pressed="${r.id==='shelves'}">${carcassSVG(buildCarcass({recipe:r.id}),true)}<strong>${r.name}</strong><span>${r.description}</span></button>`).join('')}</div>
      <div class="mf-carcass-editor mf-blank-form"><h3 data-carcass-title>Шкаф с полками</h3>
        <div class="mf-blank-fields">${numeric('width','Ширина, мм',600,200,2400)}${numeric('height','Высота корпуса, мм',2200,200,3000)}${numeric('depth','Глубина ЛДСП, мм',577,200,1200)}</div>
        <div class="mf-blank-fields">${numeric('shelves','Полок в секции',4,0,10)}${numeric('sections','Секций',1,1,3)}${numeric('elevation','Низ от пола, мм',0,0,5000)}</div>
        <label>Задняя стенка<select name="corpus-back"><option value="yes">Накладная ХДФ 3 мм</option><option value="no">Без задней стенки</option></select></label>
        <p class="mf-blank-source">Высота — только корпус, без ножек. Задняя стенка добавляет 3 мм к глубине. Фасады и фурнитура не входят.</p>
        <details><summary>Материал, зазоры и кромка</summary><div class="mf-blank-form">
          ${numeric('thickness','Толщина ЛДСП, мм',18,10,40)}
          <p class="mf-blank-source">Для ЛДСП 18 мм — BYSPAN 605 PO. Другой материал и материал ХДФ выберите у деталей после добавления.</p>
          <div class="mf-blank-fields">${numeric('shelfGap','Зазор полки с каждой стороны, мм',1,0,10)}${numeric('shelfSetback','Отступ полки от переднего края, мм',20,0,100)}</div>
          <label>Начальная схема кромки<select name="corpus-edgePolicy"><option value="front">Передние торцы · крышка тумбы в круг</option><option value="all">Все торцы ЛДСП</option><option value="none">Без ПВХ</option></select></label>
          <label>Толщина ПВХ<select name="corpus-edgeThickness">${[.4,.8,1,2,3].map(v=>`<option value="${v}" ${v===1?'selected':''}>${v} мм</option>`).join('')}</select></label>
          <p class="mf-blank-source">Начальная схема — редактируемая настройка. Индексы рёбер E из альбомов не переносятся на другую деталь автоматически. Для мойки исходная схема без ПВХ.</p>
        </div></details>
        <div class="mf-carcass-preview" data-carcass-preview></div><p class="mf-blank-source">Зелёные линии — выбранные торцы с ПВХ.</p>
        <details class="mf-carcass-parts"><summary>Детали и поклейка <span data-part-count></span></summary><div data-carcass-parts></div></details>
        <p class="mf-blank-result" data-carcass-total aria-live="polite"></p>
        <p class="mf-blank-error" data-carcass-error role="alert" hidden></p>
        <button type="button" class="mf-blank-primary" data-carcass-add>Добавить корпус в проект</button>
        <p class="mf-blank-source">Добавление отменяется одним шагом. Полки связаны со стойками. Размеры корпуса задаются здесь до добавления; затем редактируются отдельные детали.</p>
      </div>`;
    this.recipe='shelves';
    this.root.addEventListener('input',e=>{e.stopPropagation();if(!e.target.matches('[data-part-edge]'))this.draw(false);});
    this.root.addEventListener('change',e=>{
      e.stopPropagation();
      if(e.target.matches('[data-part-edge]'))this.edges[e.target.dataset.partEdge]=e.target.value;
      if(e.target.name==='corpus-edgePolicy')this.edges={};
      this.draw(true);
    });
    for(const button of this.root.querySelectorAll('[data-carcass]'))button.addEventListener('click',()=>this.choose(button.dataset.carcass));
    this.root.querySelector('[data-carcass-add]').addEventListener('click',()=>this.add());this.draw(true);
  }
  field(name){return this.root.querySelector('[name="corpus-'+name+'"]');}
  spec(){
    const spec={recipe:this.recipe,back:this.field('back').value==='yes',edgePolicy:this.field('edgePolicy').value};
    for(const name of ['width','height','depth','thickness','shelves','sections','elevation','shelfGap','shelfSetback','edgeThickness'])spec[name]=Number(this.field(name).value);
    return spec;
  }
  choose(id){
    const r=CARCASSES.find(r=>r.id===id);this.recipe=id;this.edges={};
    for(const [key,value] of Object.entries({width:r.w,height:r.h,depth:r.d,shelves:r.shelves,sections:r.sections,elevation:0,back:r.back?'yes':'no',edgePolicy:r.id==='sink'?'none':'front'}))this.field(key).value=value;
    for(const key of ['back','shelves','sections'])this.field(key).disabled=r.id==='sink'||key==='sections'&&['base','cap'].includes(r.id);
    for(const b of this.root.querySelectorAll('[data-carcass]'))b.setAttribute('aria-pressed',String(b.dataset.carcass===id));
    this.root.querySelector('[data-carcass-title]').textContent=r.name;this.draw(true);
    this.root.querySelector('.mf-carcass-editor').scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  draw(rows){
    const error=this.root.querySelector('[data-carcass-error]'),add=this.root.querySelector('[data-carcass-add]');
    try{
      const spec=this.spec(),built=buildCarcass(spec,{idPrefix:'preview',edges:this.edges});
      if(spec.elevation+spec.height>this.app.adapter.room.height)throw Error('Корпус выходит выше потолка.');
      this.root.querySelector('[data-carcass-preview]').innerHTML=carcassSVG(built);
      this.root.querySelector('[data-part-count]').textContent='· '+built.items.length;
      if(rows)this.root.querySelector('[data-carcass-parts]').innerHTML=built.parts.map(({key,label,item})=>{
        const cut=cuttingSize(item),names=item.blank_axis==='side'?['спереди','сзади','снизу','сверху']:item.blank_axis==='back'?['снизу','сверху','слева','справа']:['спереди','сзади','слева','справа'];
        return `<div class="mf-carcass-part"><strong>${escape(label)}</strong><span>${item.blank_length_mm} × ${item.blank_width_mm} × ${item.blank_thickness_mm} мм</span><small>Распил: ${cut.length} × ${cut.width} мм</small><label>ПВХ · ${escape(label)}<select data-part-edge="${key}" ${key==='back'?'disabled':''}>${codes.map(code=>`<option value="${code}" ${code===item.blank_edge_code?'selected':''}>${code} · ${code==='0000'?'без ПВХ':code==='1111'?'в круг':names.filter((_,i)=>code[i]==='1').join(', ')}</option>`).join('')}</select></label></div>`;
      }).join('');
      this.root.querySelector('[data-carcass-total]').textContent=built.items.length+' деталей · ПВХ '+built.edgeMeters.toFixed(2)+' м · глубина со стенкой '+built.depth+' мм';
      error.hidden=true;error.textContent='';add.disabled=false;this.built=built;return true;
    }catch(e){error.textContent=e.message;error.hidden=false;add.disabled=true;this.built=null;return false;}
  }
  add(){
    if(!this.draw(true))return;
    const spec=this.spec(),number=this.app.adapter.items.filter(i=>i.name?.includes(' · Боковина левая')).length+1;
    const built=buildCarcass(spec,{edges:this.edges,name:this.built.spec.label+' '+number,
      bodyMaterialId:spec.thickness===18?(globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id||null):null});
    const ok=this.app.interaction.change('Добавление корпуса из заготовок',()=>{
      const envelope={module_type:'blank',item_id:'placement-envelope',name:built.spec.label,width:built.width,height:built.height,depth:built.depth,
        x:0,z:0,rotation:0,elevation_mm:spec.elevation,base:'wall',body_height:built.height,base_height:0,worktop_thickness:0};
      const position=findSpace(envelope,this.app.adapter.items,this.app.adapter.room,this.app.adapter.selected,{wallOffset:0,autoRotate:false});
      if(!position)throw Error('Для корпуса нет свободного места. Проверьте габариты помещения.');
      const items=placeCarcass(built,position);insertCarcass(this.app.adapter,items);
      this.app.adapter.select(items[0].item_id);
      this.app.adapter.status('Добавлен '+built.spec.label.toLowerCase()+' · '+items.length+' деталей. '+(spec.back?'Выберите материал ХДФ у задней стенки.':''));
    });
    if(ok)this.app.workspace?.panel('right',true,{focus:true});
  }
}
