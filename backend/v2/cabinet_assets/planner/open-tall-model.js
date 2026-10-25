/* Open tall cabinets: six measured 18 mm panels, no facade or glass fittings. */
(function(root){
 'use strict';
 const variants=root.MF_OPEN_TALL_VARIANTS||[],byId=new Map(variants.map(v=>[v.id,v]));
 const family={label:'Открытый пенал',default_id:variants.find(v=>v.light_system==='none')?.id};
 const choice=id=>byId.get(id)||null,info=it=>{const v=choice(it?.bazis_id);return v?.source_sha256===it?.bazis_sha256?v:null;};
 const round=n=>Math.round(n*1e6)/1e6;
 const lighting=it=>root.MF_VITRINE_LIGHTING[info(it)?.light_system]||null;
 function model(v){return {open_tall:v,label:family.label,key:'tall.open.'+v.id,tier:'tall',source_file:v.source_file,source_sha256:v.source_sha256,
  native_defaults:{width:600,height:2000,depth:600},body_height:1900,base_height:100,scene_depth:600,worktop_thickness:0,resize:true,
  limits:{w:[300,600],h:[1800,2800],d:[300,700]},carcass:{type:'open_tall',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},
  back:{type:'inset',thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},facade:null,front:{kind:'none',count:0},doors:[],shelves:[],hardware:{items:v.hardware_items,native_fixed_items:true,hinges_in_items:true}};}
 function dimensionError(it){
  if(!info(it))return 'Открытый пенал не совпадает с проверенным исходником';
  if(it.module_type!=='tall_cabinet'||it.base==='wall'||it.base_height!==100)return 'Открытый пенал устанавливается на опоры 100 мм';
  if(it.width<300||it.width>600||it.height<1800||it.height>2800||it.depth<300||it.depth>700)return 'Открытый пенал: ширина 300–600, высота 1800–2800, глубина 300–700 мм';
  if(it.upper_shelf_count!=null&&(!Number.isInteger(it.upper_shelf_count)||it.upper_shelf_count<1||it.upper_shelf_count>8))return 'Количество полок открытого пенала — от 1 до 8';
  return '';
 }
 function shelves(it){
  if(it.upper_shelf_count==null)return [1050];
  const n=it.upper_shelf_count,gap=(it.height-136-n*18)/(n+1);
  return Array.from({length:n},(_,i)=>round(118+gap+9+i*(gap+18)));
 }
 function adjustment(it){
  if(!info(it)||it.upper_shelf_count==null)return null;
  return {kind:'open_tall_shelves',requires_manual_native_adjustment:true,count:shelves(it).length,centers_from_floor_mm:shelves(it),thickness_mm:18,
   note:'В БАЗИС изменить количество и положение полок ЛДСП 18 мм и их присадку: четыре конфирмата 7 × 50 на полку. В исходнике одна полка с центром 1050 мм от пола.'};
 }
 function metrics(it){
  const v=info(it);if(!v)return null;
  const system=lighting(it),sides=v.lighting==='none'?[]:v.lighting==='both'?['left','right']:[v.lighting];
  const centers=shelves(it),starts=[118,...centers.map(y=>y+9)],ends=[...centers.map(y=>y-9),it.height-18];
  const segments=starts.map((start,i)=>({start_mm:round(start),end_mm:round(ends[i]),length_mm:round(ends[i]-start),led_cut_mm:system?Math.floor((ends[i]-start+1e-6)/system.led_cut_step_mm)*system.led_cut_step_mm:0}));
  const cuts=sides.flatMap(()=>segments.map(s=>s.length_mm)),ledCuts=sides.flatMap(()=>segments.map(s=>s.led_cut_mm));
  const stock=system?.profile?.stock.find(s=>s.length_mm>=it.height-100),ledLength=round(ledCuts.reduce((a,b)=>a+b,0)/1000);
  return {light_system:v.light_system,lighting_sides:sides,groove_width_mm:system?.groove_width_mm||0,groove_depth_mm:system?.groove_depth_mm||0,
   groove_length_each_mm:system?it.height-100:0,groove_total_m:round((it.height-100)*sides.length/1000),groove_z_from_back_mm:(it.depth+18)/2,
   segments,led_cuts_mm:ledCuts,led_order_length_m:ledLength,led_power_w:round(ledLength*(system?.led_power_w_per_m||0)),led_voltage_v:system?.led_voltage_v||null,
   light_profile_cuts_mm:stock?cuts:[],light_profile_stock_mm:stock?.length_mm||null,light_profile_article:stock?.article||null,light_profile_stock_count:stock?sides.length:0,
   light_profile_end_caps:stock?cuts.length*2:0,shelf_centers_mm:centers,
   lighting_note:system?'Подсветка отдельными отрезками между полками. Лента — рез по 25 мм, отрезки не длиннее проёма. Посадку заглушек и окончательную длину профиля проверить при монтаже. Проводка, соединения, управление и питание 12 В подбираются для группы.':''};
 }
 function hardware(it,p=model(info(it))){
  const v=info(it),error=dimensionError(it);if(error)throw new Error(error);
  const items=v.hardware_items.map(h=>({...h,quantity:h.quantity+(h.key===v.confirmat_key?4*(shelves(it).length-1):0)})),m=metrics(it),system=lighting(it);
  if(!system)return {...p.hardware,items};
  items.push({key:system.led_key,name:system.led_name,article:system.led_article,quantity:m.led_order_length_m,unit:'m',source_url:system.led_url,cuts_mm:m.led_cuts_mm,note:m.lighting_note});
  if(system.profile){
   const s=system.profile.stock.find(s=>s.article===m.light_profile_article);
   items.push({key:'light-profile-lira-'+s.article,name:'LIRA-1707 · чёрный профиль с экраном · '+s.length_mm+' мм',article:s.article,quantity:m.light_profile_stock_count,unit:'pcs',source_url:s.url,cuts_mm:m.light_profile_cuts_mm,stock_length_mm:s.length_mm,note:'Один хлыст на сторону; отрезки между полками, экран включён. Припуск на заглушки проверить при монтаже.'});
   items.push({key:'light-profile-lira-end-cap',name:'Заглушка LIRA-1707, чёрная',article:system.profile.end_cap.article,quantity:m.light_profile_end_caps,unit:'pcs',source_url:system.profile.end_cap.url});
   items.push({key:'light-profile-lira-holder',name:'Держатель LIRA-1707 · количество по монтажу',article:system.profile.holder.article,quantity:null,unit:'pcs',source_url:system.profile.holder.url,note:system.profile.mount_note});
   items.push({key:'light-profile-lira-fasteners',name:'Крепёж держателей LIRA-1707 · подбор по монтажу',article:null,quantity:null,unit:'set',note:'Количество и тип крепежа уточнить по монтажу.'});
  }
  return {...p.hardware,items};
 }
 function parts(it,p=model(info(it)),lookup=()=>null){
  const v=p.open_tall,W=it.width,H=it.height,D=it.depth,m=metrics(it),result=[];
  function add(s,key=s.key,y=null){
   const coords=s.lo.map((x,a)=>[x,x+s.size[a]].map(x=>{
    if(a===0)return x+(x>300?W-600:0)-W/2;
    if(a===1)return x+(x>1700?H-2000:0);
    return x+(x>300?D-600:0)-D/2;
   }));
   if(y!=null)coords[1]=[y-9,y+9];
   const axes=['x','y','z'],size=Object.fromEntries(axes.map((a,i)=>[a,round(coords[i][1]-coords[i][0])])),position=Object.fromEntries(axes.map((a,i)=>[a,round((coords[i][0]+coords[i][1])/2)]));
   const id=it.part_materials?.[key]??(s.role==='back'?it.back_variant_id||it.body_variant_id:it.body_variant_id),mat=id?lookup(id):null;
   const [length_axis,width_axis,thickness_axis]=s.axes.map(a=>axes[a]);
   const part={part_id:it.item_id+':'+key,key,module_id:it.item_id,name:s.name,role:s.role,type:'panel',size,position,length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},
    material:{variant_id:id||null,name:mat?.name||(id?null:'ЛДСП- БЕЛЫЙ'),article:mat?.article||null,manufacturer:mat?.manufacturer||null,material_id:mat?.material_id||null},...(s.role==='back'?{back_type:'inset'}:{}),...(s.role==='shelf'?{fixed:true}: {})};
   const side=key==='side-L'?'left':key==='side-P'?'right':null;
   if(side&&m.lighting_sides.includes(side)){const x=(side==='left'?-1:1)*(W/2-18);part.machining=[{kind:'led_groove',width_mm:m.groove_width_mm,depth_mm:m.groove_depth_mm,length_mm:H-100,surface:'inner',start:{x,y:100,z:9},end:{x,y:H,z:9}}];}
   result.push(part);
  }
  for(const s of v.panels)if(s.role!=='shelf')add(s);else shelves(it).forEach((y,i)=>add(s,'shelf-'+(i+1),y));
  return result;
 }
 function select(it,patch,catalogue){
  const old=info(it);if(!old)throw new Error('Исходный открытый пенал не найден');
  const options={...old,...patch};
  if(options.light_system==='none')options.lighting='none';else if(options.lighting==='none')options.lighting='left';
  const v=variants.find(v=>v.catalogue_primary&&v.light_system===options.light_system&&v.lighting===options.lighting);
  if(!v||!catalogue.some(m=>m.id===v.id&&m.source_sha256===v.source_sha256))throw new Error('Исполнение открытого пенала не найдено');
  const next={...structuredClone(it),bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,layout:'niche',drawers:0,handles:'handleless',front_variant_id:null,shelves:[],doors_open:false};
  const error=dimensionError(next);if(error)throw new Error(error);return next;
 }
 function brief(it){
  const v=info(it);if(!v)return '';const m=metrics(it),system=lighting(it);
  return 'Открытый пенал. Корпус, задняя стенка и полки — ЛДСП 18 мм. Полки: '+(it.width-36)+' × '+(it.depth-18-v.shelf_front_setback_mm)+' × 18 мм, '+shelves(it).length+' шт. '+
   (v.bottom_full_width?'Дно на всю ширину, боковины стоят на дне. ':'Дно между боковинами. ')+
   (system?system.label+' · '+({left:'слева',right:'справа',both:'с двух сторон'}[v.lighting])+'. Паз '+m.groove_width_mm+' × '+m.groove_depth_mm+' мм, ось '+m.groove_z_from_back_mm+' мм от заднего края. Фрезеровка '+m.groove_total_m+' м. Лента '+system.led_article+': '+m.led_cuts_mm.join(' + ')+' мм; '+m.led_power_w+' Вт. '+m.lighting_note:'Без подсветки и фрезеровки под неё.')+
   (system?.profile?' LIRA с экраном: отрезки '+m.light_profile_cuts_mm.join(' + ')+' мм; '+m.light_profile_stock_count+' хлыст(а) '+m.light_profile_stock_mm+' мм, арт. '+m.light_profile_article+'. Заглушки '+system.profile.end_cap.article+': '+m.light_profile_end_caps+' шт. Держатели и крепёж — по монтажу.':'')+
   (adjustment(it)?' '+adjustment(it).note+' Центры полок от пола: '+shelves(it).join('; ')+' мм.':' Центр исходной полки — 1050 мм от пола.');
 }
 root.MF_OPEN_TALL=Object.freeze({variants,family,choice,info,model,dimensionError,shelves,adjustment,metrics,hardware,parts,select,brief,lighting});
})(globalThis);
