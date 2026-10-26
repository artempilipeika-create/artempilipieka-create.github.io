/* One drawer family; each system retains its own audited construction and source. */
(function(root){
  'use strict';
  const ballIds=['bazis.39f282e08f0c','bazis.5f5697e39e27'];
  const variants=(root.MF_DRAWER_VARIANTS||[]).map(v=>({...v,execution:'standard'})),family={label:'Нижний шкаф с ящиками',default_id:ballIds[0]};
  const layouts={two:'2 ящика',three:'3 ящика',inner:'2 + внутренний'},openings={soft:'С доводчиком',push:'Push to open'};
  const metalChoices=()=>[...variants,...(root.MF_GOLA?.variants||[]).filter(v=>v.kind==='drawers'&&v.system!=='ball')];
  const info=it=>{
    const dryer=root.MF_PULLOUT_DRYERS?.info(it);
    if(dryer&&dryer.system!=='ball')return dryer;
    return metalChoices().find(v=>v.id===it?.bazis_id&&v.source_sha256===it.bazis_sha256)||null;
  };
  function choice(id){
    const metal=variants.find(v=>v.id===id)||(root.MF_GOLA?.choice(id)?.kind==='drawers'?root.MF_GOLA.choice(id):null);if(metal)return metal;
    const p=ballIds.includes(id)&&root.MF_FURNITURE_CORE?.PILOT_PRODUCTION[id];
    return p?{id,execution:'standard',system:'ball',manufacturer:'AKS',series:'Обычные шариковые',layout:p.front_layout.heights.length===2?'two':'three',opening:'soft',
      drawer_count:p.front_layout.heights.length,front_heights:p.front_layout.heights,source_file:p.source_file,source_sha256:p.source_sha256,label:p.label}:null;
  }
  const choices=()=>[...ballIds.map(choice).filter(Boolean),...variants,...(root.MF_GOLA?.variants||[]).filter(v=>v.kind==='drawers')];
  const familyInfo=it=>{const v=choice(it?.bazis_id);return v&&v.source_sha256===it.bazis_sha256?v:null;};
  const available=(v,patch)=>v?choices().find(n=>['system','layout','opening','execution'].every(k=>n[k]===(patch[k]??v[k])))||null:null;
  const selectedSource=(it,v)=>({...it,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,layout:'drawers',drawers:v.drawer_count,
    handles:v.opening==='push'||v.execution==='gola'?'handleless':'handles'});
  const selectionError=(it,v)=>!v?'Такого сочетания нет среди проверенных фрагментов':v.execution==='gola'?root.MF_GOLA.dimensionError(selectedSource(it,v)):v.system==='ball'?'':dimensionError(selectedSource(it,v));
  function model(v){return {tier:'base',key:'base.metal-drawers.'+v.system+'.'+v.layout+'.'+v.opening,label:family.label,source_file:v.source_file,source_sha256:v.source_sha256,
    native_defaults:{width:600,height:820,depth:510},body_height:720,base_height:100,scene_depth:510,worktop_thickness:38,resize:true,
    limits:{w:[400,1200],h:[700,1100],d:[300,700]},metal_drawers:v,
    carcass:{type:'metal_drawers',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},
    facade:{thickness:18,gap_mm:1.5,clearance_mm:0,material_name:'Evagloss P004'},back:{type:'overlay_nails',thickness:3,material_name:'ЛХДФ 3ММ Белый'},
    front:{kind:'drawers',count:v.front_heights.length},shelves:[],doors:[],
    hardware:{native_fixed_items:true,items:v.hardware_items,system:v.series,opening:v.opening,length_mm:500}};}
  function select(it,patch,catalogue){
    const current=familyInfo(it),v=current&&available(current,patch);
    if(!v||!catalogue.some(m=>m.id===v.id&&m.source_sha256===v.source_sha256))throw new Error('Такого сочетания нет среди проверенных фрагментов. Выберите доступную систему и открывание.');
    const error=selectionError(it,v);if(error)throw new Error(error);
    const next=selectedSource(it,v);
    if((current.system!==v.system||current.execution!==v.execution)&&it.part_materials){
      const core=root.MF_FURNITURE_CORE,parts=value=>core.productionParts(value,{production:core.PRODUCTION_MODELS[value.bazis_id]});
      const old=parts(it),fresh=parts(next),materials={};
      for(const target of fresh){
        // Matching keys can refer to boards of different thickness: e.g. a 16 mm
        // metal-system bottom becomes 3 mm HDF in an ordinary wooden drawer.
        const source=old.find(p=>p.role===target.role&&p.thickness===target.thickness&&
          (p.key===target.key||(p.role==='front'&&p.drawer_index===target.drawer_index)));
        if(source&&it.part_materials[source.key])materials[target.key]=it.part_materials[source.key];
      }
      next.part_materials=materials;
    }
    return next;
  }
  function dimensionError(it){
    const v=info(it);if(!v)return 'Фрагмент ящиков не совпадает с проверенным исходником';
    const base=it.legHeightMm??it.base_height??100;
    if(it.module_type!=='base_cabinet'||it.base==='wall'||![80,100,150].includes(base))return 'Нижний шкаф с ящиками устанавливается на ножки 80, 100 или 150 мм';
    if(it.height-base<600||it.height-base>1000||it.depth<300||it.depth>700||it.width<400||it.width>1200)return 'Размеры шкафа: корпус 600–1000 мм, глубина 300–700 мм, ширина 400–1200 мм.';
    return configuration(it,v).error;
  }
  const round=n=>Math.round(n*10000)/10000;
  // FR3D RelX rows describe (previous Length, Length] intervals.
  const matches=(rules,value)=>(rules.find(r=>value<=r.Length+1e-7)?.Count||0)===1;
  function elastic(v,axis,value,delta){
    const planes=v.model_elastic.filter(p=>p.Axis===axis),weight=planes.reduce((n,p)=>n+p.Weight,0);
    return value+(weight?delta*planes.filter(p=>value>p.Pos).reduce((n,p)=>n+p.Weight,0)/weight:0);
  }
  function configuration(it,v=info(it)){
    if(!v)return {drawers:[],error:'Фрагмент ящиков не совпадает с проверенным исходником'};
    const dh=it.height-(it.legHeightMm??it.base_height??100)-720;
    const drawers=v.elastic_drawers.map((d,index)=>{
      const y=elastic(v,1,d.y,dh),height=elastic(v,1,d.y+d.height,dh)-y;
      const h=d.heights.find(h=>matches(h.rules,height)),kit=h?.lengths.find(k=>matches(k.rules,it.depth));
      const error=!h?'Для этой высоты в исходном фрагменте нет подходящего ящика':!kit?'Для этой глубины в исходном фрагменте нет подходящих направляющих':kit.error||'';
      return {index:index+1,y,height,kit,error};
    });
    const bad=drawers.find(d=>d.error);
    return {drawers,error:bad?`Ящик ${bad.index}: ${bad.error}.`:''};
  }
  const railLengths=it=>[...new Set(configuration(it).drawers.map(d=>d.kit?.length_mm).filter(Boolean))];
  function parts(it,p,lookup=()=>null){
    const v=p.metal_drawers,dw=it.width-600,dy=(it.legHeightMm??it.base_height??100)-100,dh=it.height-dy-820,dd=it.depth-510;
    const selected=configuration(it,v);if(selected.error)throw new Error(selected.error);
    return v.panels.map(s=>{
      let sizes,centers;
      if(s.role==='drawer'){
        const d=selected.drawers[s.drawer_index-1],key=s.key.split('-').pop(),b=d.kit.boards[key],correction=v.elastic_drawers[s.drawer_index-1].native_corrections[key];
        sizes=[b.size[0]+dw,b.size[1],b.size[2]].map((x,i)=>round(x+(v.elastic_drawers[s.drawer_index-1].native_size_corrections?.[key]?.[i]||0)));
        centers=[b.center[0]+18-300,b.center[1]+d.y+dy,b.center[2]+it.depth/2].map((x,i)=>round(x+correction[i]));
      }else{
        const offset=[300,0,255],delta=[dw,dh,dd],target=[it.width/2,-dy,it.depth/2];
        const lo=s.center.map((c,i)=>elastic(v,i,c-s.size[i]/2+offset[i],delta[i])-target[i]);
        const hi=s.center.map((c,i)=>elastic(v,i,c+s.size[i]/2+offset[i],delta[i])-target[i]);
        sizes=hi.map((x,i)=>round(x-lo[i]));centers=hi.map((x,i)=>round((x+lo[i])/2));
      }
      const size={x:sizes[0],y:sizes[1],z:sizes[2]},position={x:centers[0],y:centers[1],z:centers[2]};
      let id=it.part_materials?.[s.key]??(s.role==='drawer'?null:s.role==='front'?it.front_variant_id:s.role==='back'?it.back_variant_id:it.body_variant_id),mat=id?lookup(id):null;
      // Inherit only the carcass appearance. An 18 mm SKU must never be emitted as
      // the purchasing/native material of a 16 mm board, including old bad overrides.
      if(s.role==='drawer'&&(id===it.body_variant_id||(mat&&Number(mat.thickness)!==16))){id=null;mat=null;}
      const [length_axis,width_axis,thickness_axis]=s.axes.map(i=>['x','y','z'][i]);
      return {part_id:it.item_id+':'+s.key,module_id:it.item_id,key:s.key,name:s.name,role:s.role,type:'panel',size,position,
        length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},
        material:{variant_id:id||null,name:mat?.name||(id||s.role==='drawer'?null:s.role==='front'?'Evagloss P004':s.role==='back'?'ЛХДФ 3ММ Белый':'ЛДСП- БЕЛЫЙ'),article:mat?.article||null,manufacturer:mat?.manufacturer||null,material_id:mat?.material_id||null,thickness:mat?.thickness??null},
        ...(s.role==='drawer'?{visual_variant_id:id||it.body_variant_id||null}:{}),
        ...(s.role==='front'?{facade:{kind:'drawer',w:size.x,h:size.y,cx:position.x,cy:position.y},drawer_index:Number(s.key.split('-')[1])}:{}),
        ...(s.drawer_index?{drawer_index:s.drawer_index}:{}),...(s.role==='back'?{back_type:'overlay_nails'}:{})};
    });
  }
  const facades=(it,p)=>parts(it,p).filter(p=>p.role==='front').map(p=>p.facade);
  function hardware(it,p){
    const height=it.legHeightMm??it.base_height??100;
    const selected=configuration(it,p.metal_drawers);if(selected.error)throw new Error(selected.error);
    const items=p.hardware.items.filter(h=>!h.name.startsWith('Система ящиков')&&!/^Ящик (высокий|средний|низкий) AQ/.test(h.name)&&!h.name.startsWith('AQ LineBox Направляющая,')).map(h=>height!==100&&(/Опора регулируемая|Ножка пластиковая без базы/.test(h.name))?{...h,name:h.name.replace(/Н100|высота 100/,m=>m==='Н100'?'Н'+height:'высота '+height),article:null,note:'Артикул опоры этой высоты подобрать по каталогу'}:{...h});
    function add(name,article,quantity,unit){const row=items.find(h=>h.name===name&&h.article===article);if(row)row.quantity+=quantity;else items.push({key:'elastic-'+items.length,name,article,quantity,unit,source:'Эластичный комплект из FR3D'});}
    for(const {kit} of selected.drawers){
      if(p.metal_drawers.system==='aq')add('AQ LineBox Направляющая, '+kit.length_mm,null,2,'pcs');
      add(kit.name,kit.article,1,'set');
    }
    const lengths=railLengths(it);
    return {...p.hardware,length_mm:lengths.length===1?lengths[0]:null,lengths_mm:lengths,items};
  }
  function adjustment(it){
    const height=it.legHeightMm??it.base_height??100;
    return info(it)&&height!==100?{kind:'drawer_legs',requires_manual_native_adjustment:true,leg_height_mm:height,body_height_mm:it.height-height,note:'В БАЗИС заменить исходные опоры 100 мм на '+height+' мм и выставить корпус на эту отметку; высота корпуса '+(it.height-height)+' мм.'}:null;
  }
  function frontHeights(it){
    const v=familyInfo(it)||root.MF_PULLOUT_DRYERS?.info(it);if(!v)return [];
    return root.MF_FURNITURE_CORE.facadeCells(it,{production:root.MF_FURNITURE_CORE.PRODUCTION_MODELS[v.id]}).map(f=>f.h);
  }
  function brief(it){const v=familyInfo(it);if(!v)return '';if(v.execution==='gola')return root.MF_GOLA.brief(it);
    if(v.system==='ball')return `AKS · обычные шариковые направляющие с доводчиком; ${layouts[v.layout]}. Длина направляющих ${root.MF_FURNITURE_CORE.drawerSlideLengthMm(it.depth)} мм, подбор по глубине корпуса. Стенки ящиков: ЛДСП 18 мм в декоре корпуса; днища ящиков и задник корпуса: ЛХДФ 3 мм. Фасады снизу вверх: ${frontHeights(it).join(' + ')} мм.`;
    return `${v.manufacturer} · ${v.series}; ${layouts[v.layout]}; ${openings[v.opening]}. Белая фурнитура, направляющие ${railLengths(it).join(' / ')} мм. Фасады снизу вверх: ${frontHeights(it).join(' + ')} мм. Дно и задние стенки ящиков: ЛДСП 16 мм в декоре корпуса. Задник корпуса: ЛХДФ 3 мм.`+
      (v.layout==='inner'?' Внутренний ящик H84 — с доводчиком; держатель 113187 и ручка с поводком 94123.':'')+
      (adjustment(it)?' '+adjustment(it).note:'')+' Номинальные размеры фасадов округлены до 0,1 мм; контур исходного FR3D больше на 0,04 мм. Исходный файл сохранён.';}
  // Simplified white metal sides for inspection, never a cutting-list panel.
  function metalParts(it,p){const boards=parts(it,p),v=p.metal_drawers,result=[],selected=configuration(it,v);
    for(let i=1;i<=v.drawer_count;i++){
      const rear=boards.find(b=>b.key===`drawer-${i}-rear`),bottom=boards.find(b=>b.key===`drawer-${i}-bottom`);
      if(!rear||!bottom)continue;
      const h=rear.size.y+(v.system==='aq'?20:0),length=selected.drawers[i-1].kit.length_mm;
      for(const sign of [-1,1])result.push({size:{x:13,y:h,z:length},position:{x:sign*(it.width/2-49),y:bottom.position.y-bottom.size.y/2+h/2,z:bottom.position.z+bottom.size.z/2-length/2},drawer_index:i});
      if(v.layout==='inner'&&i===3)result.push({size:{x:it.width-110,y:84,z:8},position:{x:0,y:rear.position.y,z:bottom.position.z+bottom.size.z/2-4},drawer_index:i});
    }return result;
  }
  root.MF_DRAWERS=Object.freeze({variants,family,layouts,openings,info,choice,choices,familyInfo,available,selectionError,frontHeights,model,select,dimensionError,configuration,railLengths,parts,facades,brief,metalParts,hardware,adjustment});
})(globalThis);
