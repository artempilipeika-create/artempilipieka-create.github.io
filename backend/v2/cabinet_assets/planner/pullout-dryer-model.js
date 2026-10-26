/* A separate family: one lower drawer and one pull-out dish dryer. */
(function(root){
 'use strict';
 const variants=root.MF_PULLOUT_DRYER_VARIANTS||[],byId=new Map(variants.map(v=>[v.id,v]));
 const family={label:'Шкаф с выдвижной сушкой',default_id:variants.find(v=>v.dryer_brand==='norwing'&&v.system==='ball'&&v.execution==='standard')?.id};
 const choice=id=>byId.get(id)||null,info=it=>{
  const v=choice(it?.bazis_id);if(!v)return null;
  if(v.source_sha256===it.bazis_sha256)return v;
  const old=v.previous_sources?.find(p=>p.source_sha256===it.bazis_sha256);
  return old?{...v,...old}:null;
 };
 function normalizeSource(it){
  return it;
 }
 const brand=v=>v.dryer_brand==='norwing'?'NORWING':'FLAT LINE';
 const kit=(it,v=info(it))=>v?.dryer_kits.find(k=>k.width===it.width)||null;
 function dimensionError(it){
  const v=info(it);if(!v)return 'Сушка не совпадает с проверенным исходником';
  if(!v.allowed_widths.includes(it.width))return brand(v)+': ширина шкафа только '+v.allowed_widths.join(', ')+' мм';
  if(it.depth<v.min_depth||it.depth>700)return 'Шкаф с сушкой: глубина 510–700 мм';
  return root.MF_GOLA.dimensionError(it,v);
 }
 function model(v){return {...root.MF_GOLA.model(v),pullout_dryer:v,label:family.label,key:'base.pullout-dryer.'+v.id,
  limits:{w:[600,v.allowed_widths.at(-1)],h:[700,1100],d:[510,700]}};}
 function select(it,patch,catalogue){
  const old=info(it),v=old&&variants.find(n=>['dryer_brand','system','execution'].every(k=>n[k]===(patch[k]??old[k])));
  if(!v||!catalogue.some(t=>t.id===v.id&&t.source_sha256===v.source_sha256))throw new Error('Такого исполнения сушки нет');
  const next={...structuredClone(it),width:patch.width??it.width,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,layout:'drawers',drawers:2,handles:v.execution==='gola'?'handleless':'handles'};
  const error=dimensionError(next);if(error)throw new Error(error);
  const core=root.MF_FURNITURE_CORE,parts=x=>core.productionParts(x,{production:core.PRODUCTION_MODELS[x.bazis_id]}),before=parts(it),after=parts(next);
  next.part_materials=Object.fromEntries(after.filter(p=>before.some(o=>o.key===p.key&&o.role===p.role&&o.thickness===p.thickness)&&it.part_materials?.[p.key]).map(p=>[p.key,it.part_materials[p.key]]));
  return next;
 }
 function hardware(it,p){const h=root.MF_GOLA.hardware(it,p),k=kit(it);if(!k)throw new Error(dimensionError(it));
  return {...h,items:[...h.items,{key:'pullout-dryer',name:k.name,article:k.article,quantity:1,unit:'set'}]};}
 function brief(it){const v=info(it);if(!v)return '';const k=kit(it);
  return brand(v)+' · '+it.width+' мм · '+v.series+' · '+(v.execution==='gola'?'Gola II без подсветки':'накладные ручки')+'. Сверху выдвижная сушка, снизу один ящик. Комплект сушки '+(k?.article||'не выбран')+'. '+(v.warnings||[]).join(' ');}
 // A simplified inspection basket, using donor dimensions; never a cut-list panel.
 function basket(it){const v=info(it),k=kit(it);if(!k)return null;const b=v.dryer_bounds,base=it.legHeightMm??it.base_height??100;
  return {width:k.size[0],height:k.size[1],depth:k.size[2],x:b.lo[0]+k.size[0]/2-it.width/2,
   y:root.MF_GOLA.elastic(v,1,b.lo[1],it.height-base-720)+base-100,z:it.depth/2-k.size[2]/2+(v.dryer_front_offset||0)};}
 root.MF_PULLOUT_DRYERS=Object.freeze({variants,choice,info,normalizeSource,family,brand,kit,model,select,hardware,brief,basket,dimensionError});
})(globalThis);
