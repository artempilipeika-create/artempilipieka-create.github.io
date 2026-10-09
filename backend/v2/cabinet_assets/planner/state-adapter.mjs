import {clone,elevation,tier,heights,dimensionError,placementError,normalizeKitchen,kitchenSettings,productionShelves,TALL_FAMILY,APPLIANCE_TALL_FAMILY,tallDefaultId} from './furniture-core.mjs';
export class StateAdapter{
  constructor(bridge){this.bridge=bridge;}
  get state(){return this.bridge.state();}
  get items(){return this.state?.items||[];}
  get room(){return this.state?.room||{width:4200,depth:3200,height:2700};}
  get selected(){return this.bridge.selected();}
  get projectId(){return this.bridge.projectId();}
  template(it){return this.bridge.template(it);}
  material(id){return this.bridge.material(id);}
  snapshot(){return clone(this.bridge.snapshot());}
  restore(value){this.bridge.restore(clone(value));}
  notify(){this.bridge.refresh();}
  select(id){this.bridge.select(id);}
  status(message){this.bridge.status(message);}
  createDraft(opt){
    const all=this.bridge.catalogue;
    for(const family of [TALL_FAMILY,APPLIANCE_TALL_FAMILY])if(opt.bazis===family.default_id){opt={...opt,bazis:tallDefaultId(this.items,this.selected,family)};break;}
    const t=opt.bazis?all.bazisModules.find(x=>x.id===opt.bazis):opt.template?all.templates[opt.template]:null;
    if(opt.bazis&&!t)throw new Error('Исходный модуль БАЗИС не найден');
    const type=t?.module_type||opt.module||'chest',d=t?.defaults||all.moduleDefs[type];
    if(!d)throw new Error('Шаблон не найден');
    const name=t?.itemName||t?.catalogue_label||t?.label||d.name;
    const number=this.items.filter(x=>x.name===name||x.name.startsWith(name+' ')).length;
    const it={item_id:crypto.randomUUID(),module_type:type,template_id:opt.template||null,
      name:(name+(number?' '+(number+1):'')).slice(0,160),x:0,z:0,rotation:0,
      width:d.w,height:d.h,depth:d.d,layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',
      body_variant_id:null,front_variant_id:null};
    if(opt.bazis)Object.assign(it,{bazis_id:t.id,bazis_file:t.source_file,bazis_sha256:t.source_sha256,bazis_resize:Boolean(t.resize)});
    if(opt.bazis&&t.production){
      const p=t.production;
      Object.assign(it,{height:p.body_height+p.base_height,depth:p.scene_depth??it.depth,
        body_height:p.body_height,base_height:p.base_height,worktop_thickness:p.worktop_thickness,doors_open:false});
      it.shelves=clone(productionShelves(it,p));
    }else if(!opt.bazis){
      const base=it.base==='wall'?0:type==='base_cabinet'?100:it.base==='plinth'?80:60;
      Object.assign(it,{body_height:it.height-base,base_height:base,worktop_thickness:type==='base_cabinet'&&it.depth<=750?38:0});
    }
    return normalizeKitchen(it);
  }
  persistent(it){const value=clone(it);if(!this.bridge.supportsElevation)delete value.elevation_mm;return value;}
  insert(it){if(this.items.length>=100)throw new Error('В одном проекте поддерживается до 100 модулей');this.items.push(this.persistent(it));this.bridge.select(it.item_id);}
  replace(it){const idx=this.items.findIndex(x=>x.item_id===it.item_id);if(idx<0)return;this.items[idx]=this.persistent(it);this.notify();}
  remove(id){const idx=this.items.findIndex(x=>x.item_id===id);if(idx>=0)this.items.splice(idx,1);this.bridge.select(this.items[Math.min(idx,this.items.length-1)]?.item_id||null);}
  validate(it){
    if(!['width','height','depth'].every(k=>Number.isInteger(it[k]))||!['x','z'].every(k=>Number.isInteger(it[k]*2)))return 'Размеры — целые миллиметры; координаты — с шагом 0,5 мм';
    const ruleError=dimensionError(it,this.template(it));if(ruleError)return ruleError;
    const h=heights(it);
    if(h.body_height<150||h.base_height<0||h.base_height>300||h.worktop_thickness<0||h.worktop_thickness>100||
      ['body_height','base_height','worktop_thickness'].some(k=>it[k]!=null&&!Number.isInteger(it[k]))||
      (it.body_height!=null&&it.body_height!==h.body_height))return 'Проверьте высоту корпуса, основания и столешницы';
    const kitchen=kitchenSettings(it);
    if(kitchen&&it.base==='wall')return 'Нижний модуль устанавливается на ножки; выберите их высоту в параметрах кухонного ряда';
    if(kitchen&&(![80,100,150].includes(kitchen.legHeightMm)||!Number.isInteger(kitchen.rearServiceGapMm)||kitchen.rearServiceGapMm!==50||(it.rearServiceGapMm!=null&&it.rearServiceGapMm!==50)||
      !Number.isInteger(kitchen.countertopDepthMm)||kitchen.countertopDepthMm<300||kitchen.countertopDepthMm>1200||kitchen.countertopStockLengthMm!==4100||
      !Number.isInteger(kitchen.countertopThicknessMm)||kitchen.countertopThicknessMm<12||kitchen.countertopThicknessMm>100))return 'Проверьте ножки, задний зазор и размеры столешницы';
    const production=this.template(it)?.production;
    if(production?.dryer?.width_step_mm&&it.width%production.dryer.width_step_mm!==0)
      return 'Для сушки ширина модуля должна изменяться шагом '+production.dryer.width_step_mm+' мм';
    if(Array.isArray(it.shelves))for(const shelf of production?productionShelves(it,production):it.shelves){
      const thickness=Number(shelf?.thickness)||18,offset=Number(shelf?.offset_mm);
      if(shelf?.enabled!==false&&(!Number.isInteger(offset)||offset<(production?.carcass?.panel_thickness||0)+thickness/2||offset>h.body_height-(production?.carcass?.rail_height||0)-thickness/2))
        return 'Полка выходит за внутреннюю высоту корпуса';
      if(shelf?.enabled!==false&&(it.width-shelf.width_clearance<=0||it.depth-shelf.depth_clearance<=0))return 'Полка не помещается в корпус';
    }
    if(elevation(it,this.room)+h.overall_height_with_worktop>this.room.height)return 'Столешница выходит за высоту помещения';
    const t=this.template(it),limits=t?.limits||{w:[300,3000],h:[300,3000],d:[200,1200]};
    for(const [k,axis]of[['width','w'],['height','h'],['depth','d']]){
      const offset=axis==='h'&&kitchen&&production?kitchen.legHeightMm-production.base_height:0;
      const range=limits[axis].map(v=>v+offset);
      if(!Number.isFinite(it[k])||it[k]<range[0]||it[k]>range[1])return 'Допустимый размер: '+range.join('–')+' мм';
    }
    if(![0,90,180,270].includes(it.rotation))return 'Допустим поворот с шагом 90°';
    if(t?.resize===false&&(it.width!==t.defaults.w||it.height!==t.defaults.h||it.depth!==t.defaults.d))return 'Этот модуль БАЗИС имеет фиксированный габарит';
    return placementError(it,this.items,this.room);
  }
  setElevation(){throw new Error('Отдельная высота навески недоступна в совместимом формате v2');}
}
