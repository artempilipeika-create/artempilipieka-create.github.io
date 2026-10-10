/* Z1 display cabinets: measured FR3D geometry. Coordinates are local mm, floor datum.
 * 4x8 is machining, not glass thickness. Glass is independently measured at 4 mm.
 */
(function(root){
  'use strict';
  const variants=root.MF_VITRINE_VARIANTS||[];
  const lightingSystems=root.MF_VITRINE_LIGHTING;
  const lighting=it=>lightingSystems[info(it)?.light_system||'aq-4x8'];
  const family={key:'vitrine.z1',label:'Пенал-витрина ПН-600',default_id:variants[0]?.id};
  const urls={led:'https://wline.by/svetodiodnaya_lenta_gibkaya_aq-220923-p/220925',
    profile:'https://petroplav.by/shop/profil-fasadnyj-z1-6mm/',seal:'https://petroplav.by/shop/uplotnitel-z1/',corner:'https://petroplav.by/shop/ugolki-z1/'};
  const round=n=>Math.round(n*1e6)/1e6;
  const info=it=>variants.find(v=>v.id===it?.bazis_id&&(v.source_sha256===it.bazis_sha256||v.previous_sources?.some(s=>s.source_sha256===it.bazis_sha256)))||null;
  function normalizeSource(it){
    const v=info(it);if(!v)return it;
    return {...it,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:v.global_elastic_defined};
  }
  const model=v=>({tier:'tall',label:family.label,key:family.key+'.'+(v.light_system==='aq-4x8'?'':v.light_system+'.')+v.lighting+'.'+v.opening,
    source_file:v.source_file,source_sha256:v.source_sha256,
    native_defaults:{width:600,height:2000,depth:600},body_height:1900,base_height:100,scene_depth:600,worktop_thickness:0,
    resize:v.global_elastic_defined,limits:v.global_elastic_defined?{w:[300,600],h:[1800,2800],d:[450,700]}:{w:[600,600],h:[2000,2000],d:[600,600]},
    vitrine:v,carcass:{type:'vitrine',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},
    facade:{thickness:4,gap_mm:2,clearance_mm:2,material_name:'Стекло 4 мм',profile:'Z1',finish:'black'},
    back:{type:'inset',thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},shelves:[],front:{kind:'doors',count:1},
    doors:[{side:v.opening,hinge_count:4,open_angle:105}],
    hardware:{hinge_count:4,hinges_in_items:true,native_fixed_items:true,items:v.hardware_items}});
  function select(it,patch,catalogue){
    const current=info(it);if(!current)throw new Error('Исходная витрина не найдена');
    const options={...current,...patch},v=variants.find(v=>v.lighting===options.lighting&&v.opening===options.opening&&v.light_system===options.light_system);
    const target=v&&catalogue.find(m=>m.id===v.id&&m.source_sha256===v.source_sha256);
    if(!target)throw new Error('Исходный вариант витрины не найден');
    return {...it,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:v.global_elastic_defined};
  }
  function dimensionError(it){
    const v=info(it);
    if(!v)return 'Исходный файл витрины не совпадает с проверенной моделью';
    if(it.module_type!=='tall_cabinet'||it.base==='wall'||it.base_height!==100)return 'Витрина устанавливается на опоры 100 мм';
    if(!v.global_elastic_defined&&(it.width!==600||it.height!==2000||it.depth!==600))return 'Две стороны + открывание L: исходный файл пока поддерживает только 600 × 2000 × 600 мм';
    if(it.width<300||it.width>600||it.height<1800||it.height>2800||it.depth<450||it.depth>700)return 'Витрина: ширина 300–600, высота 1800–2800, глубина 450–700 мм';
    if(it.glass_shelf_count!=null&&(!Number.isInteger(it.glass_shelf_count)||it.glass_shelf_count<0||it.glass_shelf_count>8))return 'Количество стеклянных полок — от 0 до 8';
    return '';
  }
  function shelves(it){
    // All native Y stretch planes are above the original shelf at 1043.
    if(it.glass_shelf_count==null)return [1043];
    const n=it.glass_shelf_count,gap=(it.height-136-n*4)/(n+1);
    return Array.from({length:n},(_,i)=>round(118+gap+2+i*(gap+4)));
  }
  function adjustment(it){
    if(!info(it)||it.glass_shelf_count==null)return null;
    return {kind:'vitrine_glass_shelves',requires_manual_native_adjustment:true,count:shelves(it).length,
      centers_from_floor_mm:shelves(it),thickness_mm:4,
      note:'В БАЗИС вручную изменить количество и положение стеклянных полок и KUBIC: 4 полкодержателя на полку. Исходный файл содержит одну полку.'};
  }
  function metrics(it){
    const v=info(it);if(!v)return null;
    const count=v.lighting==='both'?2:1,length=it.height-100,system=lighting(it),step=system.led_cut_step_mm;
    const ledCut=step?Math.ceil(length/step)*step:length;
    const cuts=[it.height-104,it.height-104,it.width-4,it.width-4];
    const stock=system.profile?system.profile.stock.find(s=>s.length_mm>=length):null;
    return {profile:'Z1',finish:'black',light_system:v.light_system,groove_width_mm:system.groove_width_mm,groove_depth_mm:system.groove_depth_mm,
      groove_length_each_mm:length,groove_total_m:round(length*count/1000),
      groove_z_from_back_mm:(it.depth+18)/2,
      lighting_sides:v.lighting==='both'?['left','right']:[v.lighting],
      led_article:system.led_article,led_length_m:round(length*count/1000),led_voltage_v:system.led_voltage_v,led_power_w:round(length*count/1000*system.led_power_w_per_m),
      led_cut_step_mm:step,led_cut_length_each_mm:step?ledCut:null,
      led_order_length_m:round(ledCut*count/1000),led_roll_length_m:5,
      light_profile_length_m:system.profile?round(length*count/1000):0,
      light_profile_cuts_mm:system.profile?Array(count).fill(length):[],
      light_profile_stock_mm:stock?.length_mm||null,light_profile_article:stock?.article||null,
      light_profile_stock_count:stock?count:0,light_profile_end_caps:system.profile?count*2:0,
      led_basis:step?'Расчёт по полной траектории паза; окончательный отрезок проверить при монтаже':'Предварительный метраж по траектории паза. Кратность резки уточнить по контактным площадкам ленты; окончательный отрезок проверить при монтаже',
      profile_cuts_mm:cuts,profile_length_m:round(cuts.reduce((n,x)=>n+x,0)/1000),profile_stock_mm:6000,
      seal_length_m:round(2*(it.width-31.5+it.height-131.5)/1000),
      seal_basis:'Расчёт по периметру стекла; расход и совместимость уплотнителя Z1 уточнить у поставщика',
      glass_size_mm:[round(it.width-31.5),round(it.height-131.5),4],glass_shelves:shelves(it)};
  }
  function hardware(it,p){
    const m=metrics(it);if(!m)return null;
    const system=lighting(it);
    const items=p.hardware.items.map(h=>({...h,quantity:h.key==='glass-shelf-support'?shelves(it).length*4:h.quantity}));
    const add=(key,name,quantity,unit,source_url,extra={})=>items.push({key,name,quantity,unit,article:null,source:'Расчёт по геометрии; товар поставщика',source_url,...extra});
    add(system.led_key,system.led_name,m.led_order_length_m,'m',system.led_url,{article:m.led_article,note:m.led_basis,net_length_m:m.led_length_m,cut_step_mm:m.led_cut_step_mm});
    if(system.profile){
      const profile=system.profile,stock=profile.stock.find(s=>s.length_mm===m.light_profile_stock_mm);
      add('light-profile-lira-'+m.light_profile_article,'LIRA-1707 · чёрный профиль с экраном · '+m.light_profile_stock_mm+' мм',m.light_profile_stock_count,'pcs',stock.url,
        {article:m.light_profile_article,cuts_mm:m.light_profile_cuts_mm,stock_length_mm:m.light_profile_stock_mm,net_length_m:m.light_profile_length_m,note:'Экран включён в комплект. По одному цельному отрезку на сторону; припуск на заглушки проверить при монтаже.'});
      add('light-profile-lira-end-cap','Заглушка LIRA-1707, чёрная',m.light_profile_end_caps,'pcs',profile.end_cap.url,{article:profile.end_cap.article,note:'По две на световую линию; вывод кабеля по месту.'});
      add('light-profile-lira-holder','Держатель врезного профиля LIRA-1707 · количество по монтажу',null,'pcs',profile.holder.url,{article:profile.holder.article,note:profile.mount_note});
      add('light-profile-lira-fasteners','Крепёж держателей LIRA-1707 · подбор по монтажу',null,'set',profile.holder.url,{note:'Размер и количество крепежа не заданы поставщиком; не включены в 20 корпусных саморезов.'});
    }
    add('profile-z1-black','Профиль фасадный Z1, чёрный',m.profile_length_m,'m',urls.profile,{cuts_mm:m.profile_cuts_mm,stock_length_mm:6000,note:'Чистый метраж. Хлысты 6 м и отходы рассчитываются по раскрою рамок всего заказа.'});
    add('seal-z1','Уплотнитель Z1 · расчёт по периметру стекла',m.seal_length_m,'m',urls.seal,{note:m.seal_basis,quantity_basis:'glass_perimeter_estimate'});
    add('corner-z1','Уголки Z1 для сборки рамки',4,'pcs',urls.corner,{note:'Четыре угла прямоугольной рамки; комплектацию винтами уточнить.'});
    add('kubic-screws','Саморез 3,5 × 16 мм, потайная головка · KUBIC',shelves(it).length*4,'pcs','https://www.italianaferramenta.it/en/catalog/kubic-209',
      {note:'По одному на KUBIC; отдельно от 20 исходных саморезов опор и клипс. Артикул поставщика подобрать.'});
    return {...p.hardware,items};
  }
  function parts(it,p,lookup=()=>null){
    const W=it.width,H=it.height,D=it.depth,B=H-100,m=metrics(it),result=[];
    function add(key,name,role,size,position,axes,extra={}){
      const optical=extra.optical_material,id=optical?null:it.part_materials?.[key]??(role==='back'?it.back_variant_id||it.body_variant_id:it.body_variant_id),mat=id?lookup(id):null;
      const [length_axis,width_axis,thickness_axis]=axes;
      const part={part_id:it.item_id+':'+key,key,module_id:it.item_id,name,role,type:'panel',size,position,
        length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},
        material:{variant_id:id||null,name:optical==='glass'?'Стекло 4 мм':optical==='frame'?'Профиль Z1, чёрный':mat?.name||(id?null:'ЛДСП- БЕЛЫЙ'),
          article:mat?.article||null,manufacturer:mat?.manufacturer||null,material_id:mat?.material_id||null},...extra};result.push(part);return part;
    }
    add('bottom','Дно','body',{x:W-36,y:18,z:D},{x:0,y:109,z:0},['x','z','y']);
    add('top','Крыша','body',{x:W-36,y:18,z:D},{x:0,y:H-9,z:0},['x','z','y']);
    for(const [side,sign]of [['left',-1],['right',1]]){
      const part=add('side-'+(side==='left'?'L':'P'),'Боковая Стойка '+(side==='left'?'L':'P'),'body',{x:18,y:B,z:D},{x:sign*(W/2-9),y:100+B/2,z:0},['y','z','x']);
      if(m.lighting_sides.includes(side))part.machining=[{kind:'led_groove',width_mm:m.groove_width_mm,depth_mm:m.groove_depth_mm,length_mm:B,surface:'inner',
        start:{x:sign*(W/2-18),y:100,z:9},end:{x:sign*(W/2-18),y:H,z:9}}];
    }
    add('back','З.С','back',{x:W-36,y:B-36,z:18},{x:0,y:100+B/2,z:-D/2+9},['y','x','z'],{back_type:'inset'});
    add('door-glass','Стекло фасада','front',{x:W-31.5,y:B-31.5,z:4},{x:.05,y:100+B/2-.05,z:D/2+19.5},['y','x','z'],{optical_material:'glass',facade_component:true});
    shelves(it).forEach((y,i)=>add('glass-shelf-'+(i+1),'Полка стеклянная','shelf',{x:W-44,y:4,z:D-20},{x:0,y,z:8},['x','z','y'],{optical_material:'glass',fixed:true}));
    for(const [side,sign]of [['L',-1],['P',1]])add('frame-'+side,'Z1 · стойка '+side,'front',{x:19,y:B-4,z:20.5},{x:sign*(W/2-11.5),y:100+B/2,z:D/2+12.25},['y','x','z'],{type:'profile',optical_material:'frame',facade_component:true,cut_length_mm:B-4,end_angle_deg:45});
    for(const [key,y]of [['bottom',111.5],['top',H-11.5]])add('frame-'+key,'Z1 · поперечина','front',{x:W-4,y:19,z:20.5},{x:0,y,z:D/2+12.25},['x','y','z'],{type:'profile',optical_material:'frame',facade_component:true,cut_length_mm:W-4,end_angle_deg:45});
    return result;
  }
  function brief(it){
    const v=info(it),m=metrics(it);if(!v)return '';
    const system=lighting(it);
    const lines=['ВИТРИНА Z1 · чёрный профиль. Петли '+(v.opening==='left'?'слева':'справа')+'. Подсветка: '+({left:'слева',right:'справа',both:'с двух сторон'}[v.lighting])+'.',
      'Паз: ширина '+m.groove_width_mm+' мм, глубина '+m.groove_depth_mm+' мм; ось '+m.groove_z_from_back_mm+' мм от заднего края. Общая фрезеровка '+m.groove_total_m+' м.',
      system.led_name+' · '+m.led_article+': '+m.led_order_length_m+' м (12 В, '+m.led_power_w+' Вт по чистой длине). '+m.led_basis+'. Питание, управление, провод и соединения подобрать для группы.',
      'Профиль Z1: '+m.profile_cuts_mm.join(' + ')+' мм = '+m.profile_length_m+' м, рез 45°. Уголки Z1: 4 шт.',
      'Уплотнитель Z1: ориентир '+m.seal_length_m+' м. '+m.seal_basis+'.',
      'Стекло и рамка — отдельные позиции от распила ЛДСП. Стекло фасада '+m.glass_size_mm.join(' × ')+' мм. Полки '+(it.width-44)+' × '+(it.depth-20)+' × 4 мм: '+shelves(it).length+' шт.; KUBIC: '+shelves(it).length*4+' шт.; саморез 3,5 × 16 мм с потайной головкой: '+shelves(it).length*4+' шт. дополнительно к исходным крепежам.'];
    if(system.profile)lines.push('LIRA-1707 с экраном: '+m.light_profile_cuts_mm.join(' + ')+' мм; '+m.light_profile_stock_count+' хлыст(а) '+m.light_profile_stock_mm+' мм, арт. '+m.light_profile_article+'. Заглушки '+system.profile.end_cap.article+': '+m.light_profile_end_caps+' шт. Экран отдельно не добавлять. '+system.profile.mount_note);
    const a=adjustment(it);if(a)lines.push(a.note+' Центры от пола: '+a.centers_from_floor_mm.join('; ')+' мм.');
    return lines.join('\n');
  }
  root.MF_VITRINE=Object.freeze({variants,family,model,info,normalizeSource,select,dimensionError,shelves,adjustment,metrics,hardware,parts,brief,urls,lighting,lightingSystems});
})(globalThis);
