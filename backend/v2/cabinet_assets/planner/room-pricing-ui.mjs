import {ROOM_PRESETS,FLOOR_OPTIONS,LIGHT_OPTIONS,roomSettings,presetSettings} from './room-state.mjs';
import {modulePriceBreakdown,kitchenPriceBreakdown} from './pricing.mjs';
const el=(tag,text,id)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(id)e.id=id;return e;};
const select=(id,title,options)=>{const label=el('label',title),s=el('select',undefined,id);s.setAttribute('aria-label',title);for(const [value,text]of Object.entries(options)){const o=el('option',text);o.value=value;s.append(o);}label.append(s);return label;};
export class RoomPricingUI{
  constructor(app){
    this.app=app;
    const d=el('details',undefined,'planner-room-settings');d.append(el('summary','Комната'));
    const controls=el('div');controls.className='room-controls';
    const measure=el('button','Размеры и коммуникации','room-open-measure');measure.type='button';measure.onclick=()=>app.roomSetup.open();controls.append(measure);
    this.measureSummary=el('p',undefined,'room-measure-summary');controls.append(this.measureSummary);
    controls.append(select('room-preset','Обстановка',Object.fromEntries(Object.entries(ROOM_PRESETS).map(([k,v])=>[k,v.label]))));
    const wall=el('label','Стены'),input=el('input',undefined,'room-wall-color');input.type='color';input.setAttribute('aria-label','Цвет стен');wall.append(input);controls.append(wall);
    controls.append(select('room-floor','Пол',FLOOR_OPTIONS),select('room-lighting','Свет',LIGHT_OPTIONS));d.append(controls);document.querySelector('.mf3d-canvas-wrap').append(d);
    for(const [id,key]of [['room-preset','environmentPreset'],['room-wall-color','wallColor'],['room-floor','floorMaterial'],['room-lighting','lightingPreset']]){
      document.getElementById(id).onchange=e=>{
        const value=e.target.value;
        app.history.begin('Комната');
        app.adapter.state.displaySettings=key==='environmentPreset'?presetSettings(value):roomSettings({...roomSettings(app.adapter.state.displaySettings),[key]:value});
        app.bridge.refresh();app.history.commit();
      };
    }
    this.module=el('section',undefined,'module-cost');this.module.className='mf3d-control-card cost-card';document.getElementById('item-controls').append(this.module);
    this.kitchen=el('section',undefined,'kitchen-cost');this.kitchen.className='cost-card';document.getElementById('pane-items').append(this.kitchen);
    this.visualNotice=el('div',undefined,'room-visual-notice');this.visualNotice.setAttribute('role','status');document.querySelector('.mf3d-canvas-wrap').append(this.visualNotice);
  }
  sync(){
    const p=this.app,a=p.adapter,s=roomSettings(a.state.displaySettings);
    this.measureSummary.textContent=`${a.room.width} × ${a.room.depth} × ${a.room.height} мм · `+(a.room.setup_complete===true?((a.room.features||[]).length+' объектов'):a.room.setup_complete===false?'требуется замер':'замер не подтверждён');
    for(const [id,key]of [['room-preset','environmentPreset'],['room-wall-color','wallColor'],['room-floor','floorMaterial'],['room-lighting','lightingPreset']])document.getElementById(id).value=s[key];
    const it=a.selected;
    this.module.replaceChildren(el('h3','Стоимость'));
    if(it){
      const b=modulePriceBreakdown(it,a.template(it),id=>a.material(id));
      this.module.dataset.priceStatus=b.totals.status;
      const lines=[b.label,'Фактическая ширина: '+b.actualWidthMm+' мм','Ценовая категория: '+(b.status==='CUSTOM'?'CUSTOM · нестандарт':b.pricingWidthMm+' мм'),'Цена: не настроена'];
      lines.forEach(t=>this.module.append(el('p',t)));
      const details=el('details'),summary=el('summary','Состав расчёта');details.append(summary);
      for(const [title,rows]of [['Листовые материалы',b.sheetMaterials],['Кромка',b.edging],['Фурнитура',b.hardware],['Операции',b.operations]]){
        details.append(el('strong',title));
        for(const r of rows)details.append(el('p',r.label+': '+(r.quantity===null?'правило расчёта не задано':r.quantity.toLocaleString('ru-RU',{maximumFractionDigits:3})+' '+({m2:'м²',pcs:'шт.',m:'м'}[r.unit]||r.unit)+' · цена не настроена')));
      }
      details.append(el('strong','Итого'),el('p','Себестоимость: не рассчитана'),el('p','Наценка: правило не задано'),el('p','Цена продажи: не рассчитана'));
      details.append(el('p','Количество для цены — по ценовой категории. Столешница и цоколь учитываются один раз в стоимости кухни.'));this.module.append(details);
    }
    const k=kitchenPriceBreakdown(a.items,a.room,it=>a.template(it),id=>a.material(id));
    this.kitchen.dataset.priceStatus=k.status;this.kitchen.replaceChildren(el('h3','Стоимость кухни'),el('p',k.notice));
    for(const m of k.modules)this.kitchen.append(el('p',m.label+' · '+(m.pricingWidthMm===null?'нестандарт':m.pricingWidthMm+' мм')+' · цена не настроена'));
    if(k.extras.length){this.kitchen.append(el('strong','Общие элементы кухни'));for(const r of k.extras)this.kitchen.append(el('p',r.label+': '+r.quantity.toLocaleString('ru-RU',{maximumFractionDigits:3})+' м² · цена не настроена'));}
    this.kitchen.append(el('p','Себестоимость, наценка и цена продажи: не рассчитаны'));
    this.kitchen.append(el('p','Материалы и фасады — в составе модулей. Столешница, цоколь и дополнительные элементы — отдельные позиции.'));
    this.syncVisualNotice();
  }
  syncVisualNotice(){
    const a=this.app.adapter,missing=new Set();
    for(const item of a.items)for(const id of [item.body_variant_id,item.front_variant_id,item.back_variant_id,item.plinthMaterialId,item.countertopMaterialId,...Object.values(item.part_materials||{}),...(item.shelves||[]).map(s=>s.material_variant_id)]){
      if(!id)continue;const m=a.material(id);if(!m?.visual?.texture_url&&!m?.visual?.preview_url&&!m?.visual?.render_color)missing.add(id);
    }
    for(const root of [this.app.scene?.root,this.app.scene?.dressing])root?.traverse(m=>{if(m.material?.userData?.variantId&&m.material.userData.visualStatus==='MISSING_VISUAL')missing.add(m.material.userData.variantId);});
    this.visualNotice.hidden=!missing.size;this.visualNotice.textContent=missing.size?'Без точного изображения: '+missing.size+' · показан нейтральный материал':'';
  }
}
