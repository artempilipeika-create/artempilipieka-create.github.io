import {kitchenGroup,doorFamilyById,CORNER_FAMILY,TALL_FAMILY,APPLIANCE_TALL_FAMILY,VITRINE_FAMILY} from './furniture-core.mjs';
const el=(tag,text,id)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(id)n.id=id;return n;};
export class MobilityUI{
  constructor(app){
    this.app=app;this.group=null;
    const section=el('details',null,'module-replacement');section.className='mf3d-control-card';section.append(el('summary','Заменить модуль'));
    const label=el('label','Новый модуль');this.select=el('select',null,'replacement-module');label.append(this.select);
    const preserve=el('label');preserve.className='mf3d-mobility-check';this.keep=el('input',null,'replacement-keep-size');this.keep.type='checkbox';this.keep.checked=true;preserve.append(this.keep,document.createTextNode(' Сохранить габариты'));
    this.apply=el('button','Заменить выбранный','replacement-apply');this.apply.type='button';
    this.apply.onclick=()=>{if(this.select.value)app.interaction.replaceModule({bazis:this.select.value},this.keep.checked);};
    section.append(label,preserve,el('p','Положение, материалы и заметка сохраняются. Для отмены — Ctrl+Z.'),this.apply);
    document.getElementById('item-controls').prepend(section);this.section=section;
    const neighbour=el('label');neighbour.className='mf3d-mobility-check';this.shift=el('input',null,'move-neighbours');this.shift.type='checkbox';this.shift.checked=false;
    neighbour.append(this.shift,document.createTextNode(' При изменении ширины сдвигать соседей справа'));
    this.shift.onchange=()=>{app.options.shiftNeighbours=this.shift.checked;};
    document.getElementById('quick-widths').after(neighbour);
    document.getElementById('material-scope-hint').textContent='Группа подсвечивается на сцене. Перетаскивание, стрелки и координаты перемещают её целиком; материал применяется ко всей группе. Соседи сдвигаются только в сомкнутом прямом ряду.';
  }
  sync(){
    const selected=this.app.adapter.selected,group=kitchenGroup(selected||{});
    this.section.hidden=!selected||!group;this.shift.disabled=!selected;
    if(!selected)return;
    const signature=group+':'+selected.bazis_id;
    if(this.group===signature)return;this.group=signature;
    this.select.replaceChildren(new Option('Выберите модуль',''));
    for(const t of this.app.bridge.catalogue.bazisModules){
      const p=t.production;if(!p||kitchenGroup({module_type:t.module_type,bazis_id:t.id})!==group)continue;
      const family=doorFamilyById(t.id);
      if(family&&t.id!==family.left)continue;
      if(p.corner&&t.id!==CORNER_FAMILY.default_id)continue;
      if(p.tall&&t.id!==(p.tall.family==='appliance'?APPLIANCE_TALL_FAMILY:TALL_FAMILY).default_id)continue;
      if(p.vitrine&&t.id!==VITRINE_FAMILY.default_id)continue;
      if(t.id===selected.bazis_id)continue;
      const label=p.tall?(p.tall.family==='appliance'?APPLIANCE_TALL_FAMILY:TALL_FAMILY).label:p.corner?CORNER_FAMILY.label:family?.label||t.catalogue_label||t.label;
      this.select.append(new Option(label,t.id));
    }
    this.apply.disabled=this.select.options.length<2;
  }
}
