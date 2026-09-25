import {clone,elevation,tier,placementError} from './furniture-core.mjs';
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
    const t=opt.bazis?all.bazisModules.find(x=>x.id===opt.bazis):opt.template?all.templates[opt.template]:null;
    if(opt.bazis&&!t)throw new Error('Исходный модуль БАЗИС не найден');
    const type=t?.module_type||opt.module||'chest',d=t?.defaults||all.moduleDefs[type];
    if(!d)throw new Error('Шаблон не найден');
    const name=t?.itemName||t?.label||d.name;
    const number=this.items.filter(x=>x.name===name||x.name.startsWith(name+' ')).length;
    const it={item_id:crypto.randomUUID(),module_type:type,template_id:opt.template||null,
      name:(name+(number?' '+(number+1):'')).slice(0,160),x:0,z:0,rotation:0,
      width:d.w,height:d.h,depth:d.d,layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',
      body_variant_id:null,front_variant_id:null};
    if(opt.bazis)Object.assign(it,{bazis_id:t.id,bazis_file:t.source_file,bazis_sha256:t.source_sha256,bazis_resize:Boolean(t.resize)});
    return it;
  }
  persistent(it){const value=clone(it);if(!this.bridge.supportsElevation)delete value.elevation_mm;return value;}
  insert(it){if(this.items.length>=100)throw new Error('В одном проекте поддерживается до 100 модулей');this.items.push(this.persistent(it));this.bridge.select(it.item_id);}
  replace(it){const idx=this.items.findIndex(x=>x.item_id===it.item_id);if(idx<0)return;this.items[idx]=this.persistent(it);this.notify();}
  remove(id){const idx=this.items.findIndex(x=>x.item_id===id);if(idx>=0)this.items.splice(idx,1);this.bridge.select(this.items[Math.min(idx,this.items.length-1)]?.item_id||null);}
  validate(it){
    if(!['x','z','width','height','depth'].every(k=>Number.isInteger(it[k])))return 'Размеры и координаты должны быть целыми миллиметрами';
    const t=this.template(it),limits=t?.limits||{w:[300,3000],h:[300,3000],d:[200,1200]};
    for(const [k,axis]of[['width','w'],['height','h'],['depth','d']]){
      if(!Number.isFinite(it[k])||it[k]<limits[axis][0]||it[k]>limits[axis][1])return 'Допустимый размер: '+limits[axis].join('–')+' мм';
    }
    if(![0,90,180,270].includes(it.rotation))return 'Допустим поворот с шагом 90°';
    if(t?.resize===false&&(it.width!==t.defaults.w||it.height!==t.defaults.h||it.depth!==t.defaults.d))return 'Этот модуль БАЗИС имеет фиксированный габарит';
    return placementError(it,this.items,this.room);
  }
  setElevation(){throw new Error('Отдельная высота навески недоступна в совместимом формате v2');}
}
