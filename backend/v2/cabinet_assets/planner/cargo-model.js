/* Cargo is an independent family; native donors are 150 mm, not their filename's 200. */
(function(root){
 'use strict';
 const variants=root.MF_CARGO_VARIANTS||[],byId=new Map(variants.map(v=>[v.id,v]));
 const family={label:'Карго',default_id:variants.find(v=>v.brand==='focus'&&v.execution==='standard')?.id};
 const choice=id=>byId.get(id)||null,info=it=>{const v=choice(it?.bazis_id);return v&&v.source_sha256===it.bazis_sha256?v:null;};
 const kit=(it,v=info(it))=>v?.kits.find(k=>k.width===it.width)||null,base=it=>it.legHeightMm??it.base_height??100;
 function dimensionError(it){
  const v=info(it);if(!v)return 'Карго не совпадает с проверенным исходником';
  const k=kit(it,v);if(k?.error)return k.error;
  if(!v.allowed_widths.includes(it.width))return 'Карго '+v.brand.toUpperCase()+': ширина только '+v.allowed_widths.join(', ')+' мм';
  if(it.module_type!=='base_cabinet'||it.base==='wall'||![80,100,150].includes(base(it)))return 'Карго: нижний модуль на ножках 80, 100 или 150 мм';
  if(it.height-base(it)<v.min_body_height||it.height-base(it)>1000||it.depth<510||it.depth>700)return 'Карго '+v.brand.toUpperCase()+': высота корпуса '+v.min_body_height+'–1000, глубина 510–700 мм';
  return '';
 }
 function model(v){return {cargo:v,label:v.label,key:'base.cargo.'+v.id,source_file:v.source_file,source_sha256:v.source_sha256,tier:'base',native_defaults:{width:150,height:820,depth:510},body_height:720,base_height:100,scene_depth:510,worktop_thickness:38,resize:true,
  carcass:{type:'cargo',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},back:{type:'overlay_nails',thickness:3,material_name:'ЛХДФ 3ММ Белый'},facade:{thickness:18,gap_mm:1.5,clearance_mm:0,material_name:'Evagloss P004'},shelves:[],doors:[],front:{kind:'drawers',count:1},hardware:{items:v.hardware_items,native_fixed_items:true,hinges_in_items:true},limits:{w:[v.allowed_widths[0],400],h:[100+v.min_body_height,1100],d:[510,700]}};}
 const round=n=>Math.round(n*10000)/10000;
 function point(it,s,a,x){
  if(a===0)return x+(x>80?it.width-150:0)-it.width/2;
  if(a===1)return x+(x>775?it.height-base(it)-720:0)+base(it)-100;
  // Rear rail keeps its 80 mm depth. The front rail and facade follow the front.
  return x+(s.key==='rail-rear'||s.role==='back'?0:x>0?it.depth-510:0)-it.depth/2;
 }
 function parts(it,p,lookup=()=>null){return p.cargo.panels.map(s=>{
  const lo=s.lo.map((x,a)=>point(it,s,a,x)),hi=s.lo.map((x,a)=>point(it,s,a,x+s.size[a]));
  const size=Object.fromEntries(['x','y','z'].map((a,i)=>[a,round(hi[i]-lo[i])])),position=Object.fromEntries(['x','y','z'].map((a,i)=>[a,round((hi[i]+lo[i])/2)]));
  const id=it.part_materials?.[s.key]??(s.role==='front'?it.front_variant_id:s.role==='back'?it.back_variant_id:it.body_variant_id),mat=id?lookup(id):null;
  const [length_axis,width_axis,thickness_axis]=s.axes.map(a=>['x','y','z'][a]);
  return {part_id:it.item_id+':'+s.key,module_id:it.item_id,key:s.key,name:s.name,role:s.role,type:'panel',size,position,length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},material:{variant_id:id||null,name:mat?.name||(id?null:s.role==='front'?'Evagloss P004':s.role==='back'?'ЛХДФ 3ММ Белый':'ЛДСП- БЕЛЫЙ'),article:mat?.article||null,manufacturer:mat?.manufacturer||null,material_id:mat?.material_id||null},
   ...(s.role==='back'?{back_type:'overlay_nails'}:{}),...(s.contour_yz?{contour_yz:s.contour_yz.map(([y,z])=>[point(it,s,1,y),point(it,s,2,z)])}:{}),
   ...(s.role==='front'?{drawer_index:1,facade:{kind:'drawer',w:size.x,h:size.y,cx:position.x,cy:position.y}}:{})};
 });}
 const facades=(it,p)=>parts(it,p).filter(p=>p.facade).map(p=>p.facade);
 const profiles=it=>(info(it)?.profiles||[]).map(p=>({name:p.name,article:p.article,x:-it.width/2,length:it.width,contour_yz:p.contour_yz.map(([y,z])=>[y+it.height-820,z+it.depth-510-it.depth/2])}));
 function hardware(it,p){
  const v=p.cargo,k=kit(it,v),error=dimensionError(it);if(error)throw new Error(error);
  let items=v.hardware_items.map(h=>({...h}));
  if(base(it)!==100)items=items.map(h=>/Опора регулируемая|Ножка пластиковая без базы/.test(h.name)?{...h,name:h.name.replace(/Н100|высота 100/,x=>x==='Н100'?'Н'+base(it):'высота '+base(it)),article:null,note:'Артикул опоры этой высоты подобрать по каталогу'}:h);
  items.push({key:'cargo-kit',name:k.name,article:k.article,quantity:1,unit:'set'});
  for(const s of v.profiles)items.push({key:s.article,name:s.material_name,article:s.article,quantity:it.width/1000,unit:'m',cut_length_mm:it.width,stock_length_mm:5500,note:'Отрезок на модуль; закупку хлыстов считать по раскрою всего ряда'});
  return {...p.hardware,items};
 }
 function select(it,patch,catalogue){
  const old=info(it),v=old&&variants.find(v=>['brand','execution'].every(k=>v[k]===(patch[k]??old[k])));
  if(!v||!catalogue.some(t=>t.id===v.id&&t.source_sha256===v.source_sha256))throw new Error('Такого исполнения карго нет');
  const next={...structuredClone(it),width:patch.width??it.width,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,layout:'drawers',drawers:1,shelves:[],handles:v.execution==='gola'?'handleless':'handles'};
  const error=dimensionError(next);if(error)throw new Error(error);return next;
 }
 function adjustment(it){if(!info(it))return null;const notes=[];
  if(base(it)!==100)notes.push('В БАЗИС заменить опоры 100 мм на '+base(it)+' мм.');
  if(it.depth!==510)notes.push('В БАЗИС проверить изменение глубины: задняя царга сохраняет 80 мм, передняя царга и комплект карго перемещаются к фасаду без растяжения.');
  return notes.length?{kind:'cargo',requires_manual_native_adjustment:true,note:notes.join(' ')}:null;
 }
 function brief(it){const v=info(it),k=kit(it);if(!v)return '';return v.brand.toUpperCase()+' · '+it.width+' мм · '+(v.execution==='gola'?'Gola L без подсветки':'накладная ручка')+'. Комплект '+(k?.article||'не выбран')+' · '+(k?.mounting==='side_left'?'боковое крепление слева':'нижнее крепление')+'. Один выдвижной фасад. '+(adjustment(it)?.note||'');}
 // Inspection geometry uses measured cache envelopes; metal kit never enters the wood cut list.
 function basket(it){const v=info(it),k=kit(it);if(!k)return null;const b=k.bounds,o=k.mount_origin;
  return {width:b.size[0],height:b.size[1],depth:b.size[2],x:o[0]+b.lo[0]+b.size[0]/2-it.width/2,y:o[1]+b.lo[1]+base(it)-100,z:it.depth/2+b.lo[2]+b.size[2]/2};}
 root.MF_CARGO=Object.freeze({variants,choice,info,kit,family,model,parts,facades,profiles,hardware,dimensionError,select,adjustment,brief,basket});
})(globalThis);
