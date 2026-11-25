import {showModuleCost} from './wardrobe-estimate-ui.mjs';
import {WALLS} from './room-plan.mjs';
import {wallCoatings,roomById,wallCoating} from './render-rooms/catalogue.mjs';
import {RenderRoomPicker} from './render-room-picker.mjs';
import {ROOM_PRESETS,FLOOR_OPTIONS,LIGHT_OPTIONS,roomSettings,finishSettings,presetSettings,selectInterior,designedInterior} from './room-state.mjs';
const el=(tag,text,id)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(id)e.id=id;return e;};
const select=(id,title,options)=>{const label=el('label',title),s=el('select',undefined,id);s.setAttribute('aria-label',title);for(const [value,text]of Object.entries(options)){const o=el('option',text);o.value=value;s.append(o);}label.append(s);return label;};
export class RoomPricingUI{
  constructor(app){
    this.app=app;
    const d=el('details',undefined,'planner-room-settings');d.append(el('summary','Интерьер'));
    const controls=el('div');controls.className='room-controls';
    const measure=el('button','Размеры комнаты','room-open-measure');measure.type='button';measure.onclick=()=>app.roomSetup.open();controls.append(measure);
    this.measureSummary=el('p',undefined,'room-measure-summary');controls.append(this.measureSummary);
    const interiors=select('room-preset','Оформление стен',Object.fromEntries(Object.entries(ROOM_PRESETS).map(([k,v])=>[k,v.label])));
    const previous=el('optgroup');previous.label='Прежние обстановки';
    const choices=interiors.querySelector('select');
    for(const name of ['studio','warm','showroom'])previous.append(choices.querySelector('option[value="'+name+'"]'));
    choices.append(previous);
    const wall=el('label','Оттенок стен'),input=el('input',undefined,'room-wall-color');input.type='color';input.setAttribute('aria-label','Цвет стен');wall.append(input);
    controls.prepend(interiors,select('room-floor','Пол',{palette:'По варианту отделки',...FLOOR_OPTIONS}));
    controls.append(wall,select('room-lighting','Свет',{palette:'По варианту отделки',...LIGHT_OPTIONS}));
    this.applyPreset=el('button','','room-preset-apply');this.applyPreset.type='button';this.applyPreset.hidden=true;
    const apply=next=>app.history.run('Интерьер комнаты',()=>{
      app.adapter.state.displaySettings={...app.adapter.state.displaySettings,...next};
      app.bridge.refresh();
    });
    this.wallEditor=el('section',undefined,'room-wall-finishes');
    const toggle=el('button','Отделка отдельных стен');
    toggle.type='button';toggle.setAttribute('aria-controls','room-wall-options');
    toggle.setAttribute('aria-expanded','false');
    const options=el('div',undefined,'room-wall-options');options.hidden=true;
    toggle.onclick=()=>{options.hidden=!options.hidden;toggle.setAttribute('aria-expanded',String(!options.hidden));};
    this.wallEditor.append(toggle,options);
    const face=select('room-wall-face','Стена',WALLS);
    const coating=select('room-wall-coating','Покрытие',{palette:'По варианту отделки',
      ...Object.fromEntries(Object.entries(wallCoatings).map(([id,f])=>[id,f.name+' · '+(f.surface==='paint'?'матовая краска':'штукатурка')]))});
    this.face=face.querySelector('select');this.coating=coating.querySelector('select');
    this.swatch=el('span');this.swatch.className='room-wall-swatch';this.swatch.ariaHidden='true';
    options.append(face,coating,this.swatch);controls.insertBefore(this.wallEditor,measure);
    this.face.onchange=()=>this.syncCoating();
    this.coating.onchange=()=>{
      const wallFinishes={...app.adapter.state.displaySettings?.wallFinishes};
      if(this.coating.value==='palette')delete wallFinishes[this.face.value];
      else wallFinishes[this.face.value]=this.coating.value;
      apply({wallFinishes});
    };
    this.roomPicker=new RenderRoomPicker(app,apply);controls.prepend(this.roomPicker.element);
    this.applyPreset.onclick=()=>{
      const current=roomSettings(app.adapter.state.displaySettings),preset=presetSettings(current.environmentPreset);
      apply(designedInterior(current.environmentPreset)?{...current,wallColor:preset.wallColor}:preset);
    };
    this.defaultRoom=el('button','Вернуть сцену «'+roomById(1).name+'»','room-restore-default');
    this.defaultRoom.type='button';
    this.defaultRoom.onclick=()=>apply({...presetSettings('graphite'),renderRoomId:1,usePaletteFloor:true,usePaletteLight:true,wallFinishes:{}});
    controls.append(this.applyPreset,this.defaultRoom);d.append(controls);document.querySelector('.mf3d-canvas-wrap').append(d);
    for(const [id,key]of [['room-preset','environmentPreset'],['room-wall-color','wallColor'],['room-floor','floorMaterial'],['room-lighting','lightingPreset']]){
      document.getElementById(id).onchange=e=>{
        const value=e.target.value;
        const current=roomSettings(app.adapter.state.displaySettings);
        if(key==='environmentPreset')apply(selectInterior(current,value));
        else if(app.adapter.state.displaySettings?.renderRoomId&&['floorMaterial','lightingPreset'].includes(key)){
          const use=key==='floorMaterial'?'usePaletteFloor':'usePaletteLight';
          apply(value==='palette'?{[use]:true}:{[use]:false,[key]:value});
        }else apply({[key]:value});
      };
    }
    this.module=el('section',undefined,'module-cost');this.module.className='mf3d-control-card cost-card';document.getElementById('item-controls').append(this.module);
    this.kitchen=el('section',undefined,'kitchen-cost');this.kitchen.className='cost-card';document.getElementById('pane-items').append(this.kitchen);
    this.visualNotice=el('div',undefined,'room-visual-notice');this.visualNotice.setAttribute('role','status');document.querySelector('.mf3d-canvas-wrap').append(this.visualNotice);
  }
  syncCoating(){
    const display=this.app.adapter.state.displaySettings||{};
    const finish=wallCoating(display,this.face.value);
    this.coating.value=display.wallFinishes?.[this.face.value]||'palette';
    const schemeFinish=wallCoating({...display,wallFinishes:{}},this.face.value);
    this.coating.options[0].textContent=schemeFinish?'По варианту · '+schemeFinish.name:'По варианту отделки';
    this.swatch.style.backgroundColor=finish?.color||roomSettings(display).wallColor;
  }
  sync(){
    const p=this.app,a=p.adapter,display=a.state.displaySettings||{},s=finishSettings(display);
    this.measureSummary.textContent=`${a.room.width} × ${a.room.depth} × ${a.room.height} мм · `+(a.room.setup_complete===true?'размеры заданы':a.room.setup_complete===false?'требуется замер':'замер не подтверждён');
    for(const [id,key]of [['room-preset','environmentPreset'],['room-wall-color','wallColor'],['room-floor','floorMaterial'],['room-lighting','lightingPreset']])document.getElementById(id).value=s[key];
    const photographic=this.roomPicker.sync({...s,renderRoomId:a.state.displaySettings?.renderRoomId});
    this.defaultRoom.hidden=s.renderRoomId===1&&display.usePaletteFloor&&display.usePaletteLight&&
      s.environmentPreset==='graphite'&&s.wallColor.toLowerCase()===ROOM_PRESETS.graphite.wallColor&&!Object.keys(s.wallFinishes).length;
    for(const id of ['room-preset','room-wall-color'])document.getElementById(id).closest('label').hidden=photographic;
    const scheme=roomById(s.renderRoomId);
    for(const [id,follow,key,options] of [['room-floor','usePaletteFloor','floor',FLOOR_OPTIONS],['room-lighting','usePaletteLight','lighting',LIGHT_OPTIONS]]){
      const field=document.getElementById(id);
      field.options[0].hidden=!photographic;
      if(scheme){
        field.options[0].textContent='По варианту · '+options[scheme[key]];
        if(display[follow])field.value='palette';
      }
    }
    this.syncCoating();
    const preset=presetSettings(s.environmentPreset);
    const designed=designedInterior(s.environmentPreset);
    this.applyPreset.hidden=photographic||(designed?['wallColor']:['wallColor','floorMaterial','lightingPreset']).every(key=>s[key]===preset[key]);
    this.applyPreset.textContent=(designed?'Вернуть оттенок «':'Применить «')+ROOM_PRESETS[s.environmentPreset].label+'»';
    this.syncEstimate();
    this.syncVisualNotice();
  }
  syncEstimate(error=''){
    const app=this.app, a=app.adapter, it=a.selected, quote=app.estimate?.quote;
    const available=app.bridge.estimateAccess() && a.items.some(p=>['base_cabinet','wall_cabinet','tall_cabinet'].includes(p.module_type)||p.assistant_carcass?.spec.kitchenModel);
    this.module.hidden=!available||!it;
    this.kitchen.hidden=!available;
    if(!available)return;
    const money=n=>n.toLocaleString('ru-BY',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
    const label=m=>(m.missing?'Рассчитано · ':'')+money(m.total);
    const selected=quote?.modules?.find(m=>m.id===(it?.assistant_carcass?.group_id??it?.item_id));
    const waiting=error||'Считаем по деталям…';
    showModuleCost(this.module,selected,waiting);
    this.kitchen.dataset.priceStatus=quote?(quote.complete?'PRICED':'PARTIAL'):'PENDING';
    this.kitchen.replaceChildren(el('h3','Стоимость кухни'),el('strong',quote?label(quote):waiting));
    if(quote){
      const button=el('button','Открыть смету');button.type='button';button.onclick=()=>app.estimate.open();this.kitchen.append(button);
    }
  }
  syncVisualNotice(){
    const a=this.app.adapter,missing=new Set(),approximate=new Set(),sampleColors=new Set();
    for(const item of a.items)for(const id of [item.body_variant_id,item.front_variant_id,item.back_variant_id,item.plinthMaterialId,item.countertopMaterialId,...Object.values(item.part_materials||{}),...(item.shelves||[]).map(s=>s.material_variant_id)]){
      if(!id)continue;const m=a.material(id);if(!m?.visual?.texture_url&&!m?.visual?.preview_url&&!m?.visual?.render_color)missing.add(id);
      if(m?.visual?.scale_confirmed===false)approximate.add(id);
      if(m?.visual?.color_confirmed===false)sampleColors.add(id);
    }
    for(const root of [this.app.scene?.root,this.app.scene?.dressing])root?.traverse(m=>{if(m.material?.userData?.variantId&&m.material.userData.visualStatus==='MISSING_VISUAL')missing.add(m.material.userData.variantId);});
    const notices=[];
    if(missing.size)notices.push('Без точного изображения: '+missing.size+' · показан нейтральный материал');
    if(approximate.size)notices.push('Для '+approximate.size+' материалов масштаб рисунка ориентировочный');
    if(sampleColors.size)notices.push('Для '+sampleColors.size+' материалов показан приблизительный цвет по образцу');
    this.visualNotice.hidden=!notices.length;this.visualNotice.textContent=notices.join('. ');
  }
}
