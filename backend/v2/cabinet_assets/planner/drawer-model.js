/* Metal drawer systems. Nominal shop sizes are 0.1 mm; donor coordinates are audited separately. */
(function(root){
  'use strict';
  const variants=root.MF_DRAWER_VARIANTS||[],family={label:'Нижний шкаф с ящиками',default_id:variants[0]?.id};
  const layouts={two:'2 ящика',three:'3 ящика',inner:'2 + внутренний'},openings={soft:'С доводчиком',push:'Push to open'};
  const info=it=>variants.find(v=>v.id===it?.bazis_id&&v.source_sha256===it.bazis_sha256)||null;
  const available=(v,patch)=>variants.find(n=>['system','layout','opening'].every(k=>n[k]===(patch[k]??v[k])))||null;
  function model(v){return {tier:'base',key:'base.metal-drawers.'+v.system+'.'+v.layout+'.'+v.opening,label:family.label,source_file:v.source_file,source_sha256:v.source_sha256,
    native_defaults:{width:600,height:820,depth:510},body_height:720,base_height:100,scene_depth:510,worktop_thickness:38,resize:true,
    limits:{w:[400,1200],h:[820,820],d:[510,510]},metal_drawers:v,
    carcass:{type:'metal_drawers',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},
    facade:{thickness:18,gap_mm:1.5,clearance_mm:0,material_name:'Evagloss P004'},back:{type:'overlay_nails',thickness:3,material_name:'ЛХДФ 3ММ Белый'},
    front:{kind:'drawers',count:v.front_heights.length},shelves:[],doors:[],
    hardware:{native_fixed_items:true,items:v.hardware_items,system:v.series,opening:v.opening,length_mm:500}};}
  function select(it,patch,catalogue){
    const current=info(it),v=current&&available(current,patch);
    if(!v||!catalogue.some(m=>m.id===v.id&&m.source_sha256===v.source_sha256))throw new Error('Такого сочетания нет среди проверенных фрагментов. Выберите доступную систему и открывание.');
    return {...it,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,layout:'drawers',drawers:v.drawer_count,
      ...(v.opening==='push'?{handles:'handleless'}:{})};
  }
  function dimensionError(it){
    if(!info(it))return 'Фрагмент ящиков не совпадает с проверенным исходником';
    const base=it.legHeightMm??it.base_height??100;
    if(it.module_type!=='base_cabinet'||it.base==='wall'||![80,100,150].includes(base))return 'Нижний шкаф с ящиками устанавливается на ножки 80, 100 или 150 мм';
    if(it.height-base!==720||it.depth!==510||it.width<400||it.width>1200)return 'Для этих фрагментов: корпус 720 мм, глубина 510 мм, ширина 400–1200 мм. Направляющие 500 мм.';
    return '';
  }
  function parts(it,p,lookup=()=>null){
    const v=p.metal_drawers,dw=it.width-600,dy=(it.legHeightMm??it.base_height??100)-100;
    return v.panels.map(s=>{
      const size={x:s.size[0],y:s.size[1],z:s.size[2]},position={x:s.center[0],y:s.center[1]+dy,z:s.center[2]};
      // Two equal native X elastic planes lie inside every horizontal board.
      if(s.key==='side-L')position.x-=dw/2;else if(s.key==='side-P')position.x+=dw/2;else size.x+=dw;
      const id=it.part_materials?.[s.key]??(s.role==='front'?it.front_variant_id:s.role==='back'?it.back_variant_id:it.body_variant_id),mat=id?lookup(id):null;
      const [length_axis,width_axis,thickness_axis]=s.axes.map(i=>['x','y','z'][i]);
      return {part_id:it.item_id+':'+s.key,module_id:it.item_id,key:s.key,name:s.name,role:s.role,type:'panel',size,position,
        length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},
        material:{variant_id:id||null,name:mat?.name||(id?null:s.role==='front'?'Evagloss P004':s.role==='back'?'ЛХДФ 3ММ Белый':'ЛДСП- БЕЛЫЙ'),article:mat?.article||null,manufacturer:mat?.manufacturer||null,material_id:mat?.material_id||null},
        ...(s.role==='front'?{facade:{kind:'drawer',w:size.x,h:size.y,cx:position.x,cy:position.y},drawer_index:Number(s.key.split('-')[1])}:{}),
        ...(s.drawer_index?{drawer_index:s.drawer_index}:{}),...(s.role==='back'?{back_type:'overlay_nails'}:{})};
    });
  }
  const facades=(it,p)=>parts(it,p).filter(p=>p.role==='front').map(p=>p.facade);
  function hardware(it,p){
    const height=it.legHeightMm??it.base_height??100;
    return {...p.hardware,items:p.hardware.items.map(h=>height!==100&&(/Опора регулируемая|Ножка пластиковая без базы/.test(h.name))?{...h,name:h.name.replace(/Н100|высота 100/,m=>m==='Н100'?'Н'+height:'высота '+height),article:null,note:'Артикул опоры этой высоты подобрать по каталогу'}:{...h})};
  }
  function adjustment(it){
    const height=it.legHeightMm??it.base_height??100;
    return info(it)&&height!==100?{kind:'drawer_legs',requires_manual_native_adjustment:true,leg_height_mm:height,body_height_mm:720,note:'В БАЗИС заменить исходные опоры 100 мм на '+height+' мм и выставить корпус на эту отметку; корпус 720 мм не растягивать.'}:null;
  }
  function brief(it){const v=info(it);if(!v)return '';
    return `${v.manufacturer} · ${v.series}; ${layouts[v.layout]}; ${openings[v.opening]}. Белая фурнитура, направляющие 500 мм. Фасады снизу вверх: ${v.front_heights.join(' + ')} мм. Дно и задние стенки ящиков: ЛДСП 16 мм в декоре корпуса. Задник корпуса: ЛХДФ 3 мм.`+
      (v.layout==='inner'?' Внутренний ящик H84 — с доводчиком; держатель 113187 и ручка с поводком 94123.':'')+
      (adjustment(it)?' '+adjustment(it).note:'')+' Номинальные размеры фасадов округлены до 0,1 мм; контур исходного FR3D больше на 0,04 мм. Исходный файл сохранён.';}
  // Simplified white metal sides for inspection, never a cutting-list panel.
  function metalParts(it,p){const boards=parts(it,p),v=p.metal_drawers,result=[];
    for(let i=1;i<=v.drawer_count;i++){
      const rear=boards.find(b=>b.key===`drawer-${i}-rear`),bottom=boards.find(b=>b.key===`drawer-${i}-bottom`);
      if(!rear||!bottom)continue;
      const h=rear.size.y+(v.system==='aq'?20:0);
      for(const sign of [-1,1])result.push({size:{x:13,y:h,z:500},position:{x:sign*(it.width/2-49),y:bottom.position.y-bottom.size.y/2+h/2,z:5},drawer_index:i});
      if(v.layout==='inner'&&i===3)result.push({size:{x:it.width-110,y:84,z:8},position:{x:0,y:rear.position.y,z:bottom.position.z+bottom.size.z/2-4},drawer_index:i});
    }return result;
  }
  root.MF_DRAWERS=Object.freeze({variants,family,layouts,openings,info,available,model,select,dimensionError,parts,facades,brief,metalParts,hardware,adjustment});
})(globalThis);
