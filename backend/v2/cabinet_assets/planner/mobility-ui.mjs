import {cornerCandidates,layoutJoints} from './corner-layout.mjs';
import {cornerReturnPlacement} from './furniture-core.mjs';
import {applyChanges} from './mobility.mjs';
import {kitchenGroup,doorFamilyById,CORNER_FAMILY,TALL_FAMILY,APPLIANCE_TALL_FAMILY,tallFamily,VITRINE_FAMILY} from './furniture-core.mjs';
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
    this.corner=el('section',null,'corner-connection');this.corner.className='mf3d-control-card';
    this.corner.append(el('h3','Угол 90°'));
    const anchorLabel=el('label','Угловой модуль');this.cornerSelect=el('select',null,'corner-anchor');anchorLabel.append(this.cornerSelect);
    this.cornerApply=el('button','Соединить под 90°','corner-connect');this.cornerApply.type='button';this.cornerNote=el('p');
    this.cornerApply.onclick=()=>app.interaction.change('Стык 90°',()=>{
      const it=app.adapter.selected,anchor=app.adapter.items.find(x=>x.item_id===this.cornerSelect.value),next=anchor&&cornerReturnPlacement(anchor,it);
      if(!next)throw Error('Выберите угловой модуль того же яруса.');
      applyChanges(app.adapter,[next]);app.adapter.status('Стык 90° сформирован. При изменении размеров соединение сохраняется.');
    });
    this.corner.append(anchorLabel,this.cornerApply,this.cornerNote);neighbour.after(this.corner);

    document.getElementById('material-scope-hint').textContent='Группа подсвечивается на сцене. Перетаскивание, стрелки и координаты перемещают её целиком; материал применяется ко всей группе. Соседи сдвигаются только в сомкнутом прямом ряду.';
  }
  sync(){
    const selected=this.app.adapter.selected,group=kitchenGroup(selected||{});
    this.section.hidden=!selected||!group;this.shift.disabled=!selected;

    const candidates=cornerCandidates(selected,this.app.adapter.items,this.app.adapter.room),previous=this.cornerSelect.value;
    this.corner.hidden=!selected||!candidates.length;
    this.cornerSelect.replaceChildren(...candidates.map(it=>new Option(it.name,it.item_id)));
    if(candidates.some(it=>it.item_id===previous))this.cornerSelect.value=previous;
    const joint=selected&&layoutJoints(this.app.adapter.items,this.app.adapter.room).find(j=>j.kind==='corner'&&j.b===selected.item_id);
    this.cornerNote.textContent=joint?'Соединён под 90°. Угол и сомкнутые ряды сохраняются при изменении глубины и ширины.':'Выберите угловой шкаф. Стык учитывает его бленду; свободное место проверяется перед соединением.';
    this.cornerApply.disabled=!candidates.length;
    if(!selected)return;
    const signature=group+':'+selected.bazis_id;
    if(this.group===signature)return;this.group=signature;
    this.select.replaceChildren(new Option('Выберите модуль',''));
    for(const t of this.app.bridge.catalogue.bazisModules){
      const p=t.production;if(!p||kitchenGroup({module_type:t.module_type,bazis_id:t.id})!==group)continue;
      const open=globalThis.MF_OPEN_TALL.choice(t.id),cargo=globalThis.MF_CARGO.choice(t.id);
      if(open&&t.id!==(open.wall?globalThis.MF_OPEN_TALL.wallFamily:globalThis.MF_OPEN_TALL.family).default_id)continue;
      if(cargo&&t.id!==(cargo.waste?globalThis.MF_CARGO.wasteFamily:globalThis.MF_CARGO.family).default_id)continue;
      const dryer=globalThis.MF_PULLOUT_DRYERS.choice(t.id);
      if(dryer&&(t.id!==globalThis.MF_PULLOUT_DRYERS.family.default_id||globalThis.MF_PULLOUT_DRYERS.info(selected)))continue;
      const lower=globalThis.MF_GOLA.baseChoice(t.id);
      if(lower&&(t.id!==globalThis.MF_GOLA.family(lower).default_id||globalThis.MF_GOLA.baseInfo(selected)?.door_count===lower.door_count))continue;
      const special=globalThis.MF_WALL_SPECIAL.choice(t.id);if(special&&t.id!==globalThis.MF_WALL_SPECIAL.family(special).default_id)continue;
      const modern=globalThis.MF_MODERN_CABINETS.choice(t.id);if(modern&&t.id!==globalThis.MF_MODERN_CABINETS.families[modern.family].default_id)continue;
      const upper=globalThis.MF_UPPERS.choice(t.id);if(upper)continue;
      if(upper&&(t.id!==globalThis.MF_UPPERS.family(upper).default_id||globalThis.MF_UPPERS.info(selected)?.door_count===upper.door_count))continue;
      const family=doorFamilyById(t.id);
      if(family&&t.id!==family.left)continue;
      if(p.corner&&t.id!==CORNER_FAMILY.default_id)continue;
      if(p.tall&&t.id!==tallFamily(p.tall).default_id)continue;
      if(p.vitrine&&t.id!==VITRINE_FAMILY.default_id)continue;
      if(globalThis.MF_DRAWERS.choice(t.id)&&(t.id!==globalThis.MF_DRAWERS.family.default_id||globalThis.MF_DRAWERS.familyInfo(selected)))continue;
      if(t.id===selected.bazis_id)continue;
      const label=dryer?globalThis.MF_PULLOUT_DRYERS.family.label:lower?globalThis.MF_GOLA.family(lower).label:upper?globalThis.MF_UPPERS.family(upper).label:p.tall?tallFamily(p.tall).label:p.corner?CORNER_FAMILY.label:family?.label||t.catalogue_label||t.label;
      this.select.append(new Option(label,t.id));
    }
    this.apply.disabled=this.select.options.length<2;
  }
}
