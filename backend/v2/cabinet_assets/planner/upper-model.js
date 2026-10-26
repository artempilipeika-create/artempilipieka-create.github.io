/* Verified upper donor selection. Identity remains the exact FR3D SHA in saved projects. */
(function(root){
 'use strict';
 const variants=root.MF_UPPER_VARIANTS||[],archived=variants.flatMap(v=>v.previous_sources||[]),all=[...variants,...archived],byId=new Map(all.map(v=>[v.id,v]));
 const executions={handles:'Накладные ручки',handleless:'Без ручек',push:'Нажатие (tip-on)'};
 const families=[{door_count:1,label:'ВМД1 · верхний шкаф с одной дверью',default_id:'bazis.858266606bc5'},
  {door_count:2,label:'ВМД2 · верхний шкаф с двумя дверями',default_id:'bazis.6c187245284a'}];
 const choice=id=>byId.get(id)||null;
 const historicalSources={
  'bazis.60f79b573cd1':'60f79b573cd1ae910e0f5ec2796798e4250e3c2e0a2df0f52372d528dace9005',
  'bazis.1ac4fadd97b7':'1ac4fadd97b74ebaf1d52e9d37c5d3e8652857c9422032e64dd3d0671911a63b'
 };
 const info=it=>{
  const v=choice(it?.bazis_id);if(!v)return null;
  if(historicalSources[v.id]===it.bazis_sha256)return {...v,source_sha256:it.bazis_sha256,source_file:it.bazis_file||v.source_file};
  return !it.bazis_sha256||it.bazis_sha256===v.source_sha256?v:null;
 };
 const family=v=>families.find(f=>f.door_count===v?.door_count)||null;
 const available=(v,patch)=>{const target={...v,...patch};return variants.find(x=>['door_count','side','filling','execution'].every(k=>x[k]===target[k]))||null;};
 const limits=v=>({w:[v.filling==='dryer'?400:300,v.door_count===1?600:v.filling==='dryer'?900:1200],h:[v.filling==='dryer'?600:300,1400],d:[250,500]});
 function dimensionError(it,v=info(it)){
  if(!v)return 'Фрагмент верхнего шкафа не совпадает с проверенным исходником';
  const l=limits(v);
  for(const [key,axis,label]of [['width','w','Ширина'],['height','h','Высота'],['depth','d','Глубина']])
   if(!Number.isInteger(it[key])||it[key]<l[axis][0]||it[key]>l[axis][1])return label+' верхнего шкафа: '+l[axis][0]+'–'+l[axis][1]+' мм';
  if(v.filling==='dryer'&&it.width%100)return 'Для сушки выбирайте ширину с шагом 100 мм';
  if(it.base!=='wall'||Number(it.base_height||0)!==0)return 'Верхний шкаф — навесной, без основания';
  return '';
 }
 function shelves(it,p){
  const v=info(it);if(!v)return [];
  const count=it.height>850?(v.filling==='dryer'?1:2):(v.filling==='dryer'?0:1);
  return Array.from({length:count},(_,i)=>({id:'shelf-'+(i+1),enabled:true,
   offset_mm:v.filling==='dryer'?Math.round(it.height*2/3):Math.round(it.height*(i+1)/(count+1)*2)/2-(v.legacy?0:.5),
   thickness:18,width_clearance:v.filling==='dryer'&&!v.legacy?36:38,depth_clearance:0,source_component:null,material_variant_id:null}));
 }
 function hardware(it,p){
  const v=info(it),ss=shelves(it,p),items=v.hardware_items.map(h=>({...h}));
  for(const h of items){
   if(h.article==='PK 5.0X16B')h.quantity=4*ss.length;
   if(h.name.startsWith('Сушка для посуды')){h.key='dish-dryer';h.name='Сушка для посуды '+it.width+' MOUNT, белый AKS';h.width_mm=it.width;h.article=String(113270+(it.width-400)/100);}
   if(v.filling==='dryer'&&h.name.startsWith('Конфермат'))h.quantity+=4*ss.length;
  }
  return {hinge_name:items.find(h=>h.article==='112602')?.name,hinge_article:'112602',hinge_count:2*v.door_count,hinges_in_items:true,native_fixed_items:true,items};
 }
 function adjustment(it){
  const v=info(it);if(!v||v.legacy||it.height===720)return null;
  return {kind:'upper_shelves',requires_manual_native_adjustment:true,count:shelves(it).length,
   centers_from_bottom_mm:shelves(it).map(s=>s.offset_mm),thickness_mm:18,
   note:'Высота отличается от исходных 720 мм. В БАЗИС проверьте количество и отметки полок по спецификации сайта: родные правила FR3D отличаются от правила 850 мм.'};
 }
 function brief(it){
  const v=info(it);if(!v)return '';
  return executions[v.execution]+' · '+(v.filling==='dryer'?'Сушка MOUNT '+it.width+' мм':'Полки')+' · '+(v.side==='double'?'две створки':v.side==='left'?'петли слева':'петли справа')+'. '+
   'Полок: '+shelves(it).length+'. '+(v.filling==='dryer'?'Выше 850 мм добавляется верхняя полка.':'До 850 мм — одна полка, выше — две.')+
   (v.bottom_front_inset_mm?' Дно утоплено спереди на '+v.bottom_front_inset_mm+' мм.':'')+
   (adjustment(it)?' '+adjustment(it).note:'');
 }
 function select(it,patch,catalogue){
  const current=info(it),v=available(current,patch);if(!v)throw new Error('Такого исполнения нет среди проверенных фрагментов');
  if(catalogue&&!catalogue.some(t=>t.id===v.id&&t.source_sha256===v.source_sha256))throw new Error('Исходный вариант верхнего шкафа не найден');
  const next={...structuredClone(it),bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,
   handles:v.execution==='handles'?'handles':'handleless'};
  const error=dimensionError(next,v);if(error)throw new Error(error);
  next.shelves=shelves(next).map(s=>({...s,material_variant_id:it.shelves?.find(old=>old.id===s.id)?.material_variant_id||null}));return next;
 }
 function model(v,old){
  if(v.legacy)return {...old,upper:v,limits:limits(v)};
  return {label:v.label,key:'wall.'+v.door_count+'.'+v.side+'.'+v.filling+'.'+v.execution,source_file:v.source_file,source_sha256:v.source_sha256,
   tier:'wall',upper:v,resize:true,native_defaults:{width:600,height:720,depth:317},body_height:720,base_height:0,worktop_thickness:0,scene_depth:317,
   limits:limits(v),carcass:{type:'wall_box',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ',bottom_front_inset_mm:v.bottom_front_inset_mm},
   back:{type:'overlay_nails',thickness:3,inset:2,material_name:'ЛХДФ 3ММ Белый'},
   facade:{thickness:18,gap_mm:1.5,clearance_mm:v.facade_clearance_mm,material_name:'Evagloss P004'},
   shelves:[],shelf_rule:{threshold_mm:850,base_count:v.filling==='dryer'?0:1,tall_count:v.filling==='dryer'?1:2,mode:v.filling==='dryer'?'upper':'even'},
   ...(v.filling==='dryer'?{dryer:{manufacturer:'AKS',series:'MOUNT',width_equals_module:true,width_step_mm:100}}:{}),
   doors:(v.door_count===2?['left','right']:[v.side]).map(side=>({side,hinge_count:2,open_angle:null})),
   hardware:{hinges_in_items:true,hinge_count:2*v.door_count,hinge_article:'112602',native_fixed_items:true,items:v.hardware_items}};
 }
 root.MF_UPPERS=Object.freeze({variants,archived,all,executions,families,choice,info,family,available,limits,dimensionError,shelves,hardware,adjustment,brief,select,model});
})(globalThis);
