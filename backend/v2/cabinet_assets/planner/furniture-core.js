/* Shared production geometry. Millimetres throughout; no renderer state. */
'use strict';
(function(root){
  const FACADE_GAP_MM=1.5, MM_TO_WORLD=0.001;
  const mmNumber=v=>Math.round(Number(v)*10)/10;
  // Versioned FR3D donor data. Old donor hashes remain valid through 3d.js legacyBazisById.
  const kitchenBase={
    tier:'base',native_defaults:{width:600,height:820,depth:510},body_height:720,base_height:100,worktop_thickness:38,scene_depth:510,
    carcass:{type:'bottom_side_two_rails',panel_thickness:18,rail_height:18,rail_depth:80,rail_orientation:'horizontal'},
    back:{type:'overlay_nails',thickness:3,inset:2,material_name:'ЛХДФ 3ММ Белый'},
    facade:{thickness:18,gap_mm:FACADE_GAP_MM,clearance_mm:2}
  };
  const doorBase={...kitchenBase,
    shelves:[{id:'shelf-1',enabled:true,offset_mm:360,thickness:18,width_clearance:36,depth_clearance:1,source_component:'_Базовые Элементы\\05.Общие элементы\\Наполнение\\Секции полок\\Полка на конферматы.fr3d'}]
  };
  const pilotDoor=(label,key,sha,sides)=>({...doorBase,label,key,source_sha256:sha,
    doors:sides.map(side=>({side,hinge_count:2,open_angle:105})),hardware:{hinge_article:'112602',hinge_count:2*sides.length}});
  const pilotDrawer=(label,key,sha,source_file,heights)=>({...kitchenBase,label,key,source_sha256:sha,source_file,
    carcass:{...kitchenBase.carcass,material_name:'ЛДСП- БЕЛЫЙ'},
    facade:{...kitchenBase.facade,material_name:'Evagloss P004'},
    front:{kind:'drawers',count:heights.length},shelves:[],doors:[],
    front_layout:{kind:'drawer',heights,gaps:heights.length===2?[1.5,3,1.5]:[1.5,2,2,1.5]},
    drawer_box:{panel_thickness:18,bottom_thickness:3,facade_to_box_delta:57,
      front_back_width_clearance:99,side_depth_clearance:10,bottom_width_clearance:67,bottom_depth_clearance:14,
      material_name:'ЛДСП- БЕЛЫЙ',bottom_material_name:'ЛХДФ 3ММ Белый'},
    hardware:{drawer_system:'AKS',slide_type:'ball_bearing_soft_close',slide_length_mm:500,drawer_count:heights.length}
  });
  const wallBase={
    tier:'wall',native_defaults:{width:600,height:720,depth:317},body_height:720,base_height:0,worktop_thickness:0,scene_depth:317,
    carcass:{type:'wall_box',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},
    back:{type:'overlay_nails',thickness:3,inset:2,material_name:'ЛХДФ 3ММ Белый'},
    facade:{thickness:18,gap_mm:FACADE_GAP_MM,clearance_mm:2,material_name:'Evagloss P004'},
    shelves:[{id:'shelf-1',enabled:true,offset_mm:360,thickness:18,width_clearance:38,depth_clearance:0,
      placement_source:'centered_visual_default'}]
  };
  const wallDoor=(label,key,sha,source_file,sides)=>({...wallBase,label,key,source_sha256:sha,source_file,
    doors:sides.map(side=>({side,hinge_count:2,open_angle:null})),
    hardware:{hinge_name:'Петля накладная с доводчиком 48мм h2 clip-on PRIME (саморезы, заглушки)',
      hinge_article:null,hinge_count:2*sides.length,items:[
        {key:'confirmat-7x50',name:'Конфермат 7х50 мм,Zn',quantity:8,unit:'pcs'},
        {key:'hanger-white',name:'Навес простой, белый',quantity:2,unit:'pcs'},
        {key:'screw-3x30',name:'Шуруп 3*30 мм,Zn',quantity:4,unit:'pcs'},
        {key:'nails-1.4x25',name:'Гвозди 1,4*25 РМЗ',quantity:52,unit:'pcs'},
        {key:'shelf-support-marcopol',name:'Полкодержатель, Marcopol, оцинкованный',quantity:4,unit:'pcs'}
      ]}});
  const freeze=value=>{Object.values(value).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(value);};
  const PILOT_PRODUCTION=freeze({
    'bazis.0211e4f77fc4':pilotDoor('Д1 L','base.standard.d1.left.600','7d029606fafc89c7a7f060106a3f2d30a8c4224a304a904bbfeffe3675645d64',['left']),
    'bazis.784bf9af84f8':pilotDoor('Д1 P','base.standard.d1.right.600','5ffe31ba623db8b5cdc3d7e65811d6b162da40ef96f30554e9030b2d764c7eeb',['right']),
    'bazis.3079d0656398':pilotDoor('Д2','base.standard.d2.600','7d6feef0bc55a52460670eaa9f738c2e9764edd947d52ca4269053fd5fed6d29',['left','right']),
    'bazis.39f282e08f0c':pilotDrawer('Нижний 2 ящика · с доводчиком','base.standard.drawers2.softclose.600','f5f5c16f716ba2716f829ba6860768ce09667e540a7135265dc6f182a7fc24b2','НМРШ2-600.З.С 3мм Гвозди Шариковые напр с довод.(1).fr3d',[357,357]),
    'bazis.5f5697e39e27':pilotDrawer('Нижний 3 ящика · с доводчиком','base.standard.drawers3.softclose.600','f1db2bfd1400b00c073ec4fc3598412fbf4532bde75d11968ae1beabda6e1ac0','НМРШ3-600.З.С 3мм Гвозди Шариковые напр с довод.(1).fr3d',[357,178,178])
  });
  const WALL_PRODUCTION=freeze({
    'bazis.858266606bc5':wallDoor('ВМД1 L','wall.standard.d1.left.600','858266606bc5e6f36a96635c155beb8f86161ce869956a8f961f27406db7ebc2','ВМД1-600. отк L.fr3d',['left']),
    'bazis.2175c60e84a6':wallDoor('ВМД1 P','wall.standard.d1.right.600','2175c60e84a6eb6eeefa62eaddc611f2180b6a3060a0ea3aa1b5305ffbcc6ed5','ВМД1-600. отк P.fr3d',['right']),
    'bazis.877ba2f68d92':wallDoor('ВМД2','wall.standard.d2.600','877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3','ВМД2-600..fr3d',['left','right'])
  });
  const PRODUCTION_MODELS=Object.freeze({...PILOT_PRODUCTION,...WALL_PRODUCTION});
  const KITCHEN_DEFAULTS=Object.freeze({legHeightMm:100,rearServiceGapMm:60,plinthMaterialId:null,
    countertopDepthMm:600,countertopStockLengthMm:4100,countertopThicknessMm:38,countertopMaterialId:null});
  function isKitchenModule(it){const p=PILOT_PRODUCTION[it.bazis_id];return Boolean(p&&(!it.bazis_sha256||it.bazis_sha256===p.source_sha256));}
  function kitchenSettings(it){
    if(!isKitchenModule(it))return null;
    const k={...KITCHEN_DEFAULTS};for(const key of Object.keys(k))if(it[key]!=null)k[key]=it[key];
    k.legHeightMm=it.legHeightMm??it.base_height??100;
    k.countertopThicknessMm=it.countertopThicknessMm??it.worktop_thickness??38;
    k.frontOverhangMm=k.countertopDepthMm-k.rearServiceGapMm-it.depth;
    return k;
  }
  function normalizeKitchen(it,room){
    const k=kitchenSettings(it);if(!k)return it;
    const {frontOverhangMm,...saved}=k;
    const result={...it,...saved,base_height:k.legHeightMm,body_height:it.body_height??it.height-k.legHeightMm,
      worktop_thickness:k.countertopThicknessMm};
    // Only old flush-to-wall pilot projects need the newly introduced service space.
    // Free-standing saved positions and projects already carrying the gap are untouched.
    if(room&&it.rearServiceGapMm==null){
      const n=rotateXZ(0,1,it.rotation||0),axis=n.x?'x':'z',wall=(axis==='x'?room.width:room.depth)/2;
      if(Math.abs(it[axis]*n[axis]-it.depth/2+wall)<1)result[axis]+=n[axis]*k.rearServiceGapMm;
    }
    return result;
  }
  // `height` remains the saved module envelope and the native FR3D target.
  // Old projects keep that envelope; a worktop has never been part of it.
  function heights(it){
    const k=kitchenSettings(it),base=k?k.legHeightMm:it.base==='wall'?0:(Number.isFinite(it.base_height)?it.base_height:it.base==='plinth'?80:60);
    const worktop=it.module_type==='base_cabinet'&&it.depth<=750
      ?(k?k.countertopThicknessMm:Number.isFinite(it.worktop_thickness)?it.worktop_thickness:32):0;
    return {body_height:it.height-base,base_height:base,module_height:it.height,
      worktop_thickness:worktop,overall_height_with_worktop:it.height+worktop};
  }
  function dimensionPatch(source,patch){
    if(isKitchenModule(source)){
      const old=heights(source),it=normalizeKitchen({...source,...patch});
      const leg=patch.legHeightMm??patch.base_height??old.base_height;
      const body=patch.body_height??(Object.hasOwn(patch,'height')?patch.height-leg:old.body_height);
      const thickness=patch.countertopThicknessMm??patch.worktop_thickness??old.worktop_thickness;
      return {...it,legHeightMm:leg,base_height:leg,body_height:body,height:body+leg,
        countertopThicknessMm:thickness,worktop_thickness:thickness};
    }
    const it={...source,...patch},old=heights(source);
    if(['height','body_height','base_height','base'].some(k=>Object.hasOwn(patch,k))){
      const base=it.base==='wall'?0:patch.base_height??(source.base==='wall'?100:old.base_height);
      const body=patch.body_height??(Object.hasOwn(patch,'height')?patch.height-base:source.bazis_id?source.height-base:old.body_height);
      Object.assign(it,{base_height:base,body_height:body,height:base+body});
    }
    return it;
  }
  function legacyFrontSpec(it){
    if(it.layout==='drawers')return{kind:'drawers',count:Math.max(1,it.drawers||1)};
    if(it.layout==='doors')return{kind:'doors',count:it.width>=900?2:1};
    if(it.layout==='combo')return{kind:'combo',drawerRows:Math.max(2,Math.min(3,it.drawers||2)),drawerRatio:.42,doors:it.width>=900?2:1};
    if(it.layout==='niche')return{kind:'niche',drawerRows:Math.max(2,it.drawers||2),nicheRatio:.35};
    return{kind:'doors',count:1};
  }
  // Arithmetic transferred from the accepted 8937f3e constructor, not redesigned.
  function facadeCells(it,template){
    const production=template?.production,custom=production?.front_layout;
    const spec=production?.doors?.length?{kind:'doors',count:production.doors.length}:template?.front||legacyFrontSpec(it);
    const baseH=heights(it).base_height;
    const x0=-it.width/2,y0=baseH,W=it.width,H=Math.max(1,it.height-baseH),g=FACADE_GAP_MM,cells=[];
    const cell=(kind,x,y,w,h)=>{
      const fw=Math.max(1,w-2*g),fh=Math.max(1,h-2*g);
      cells.push({kind,w:mmNumber(fw),h:mmNumber(fh),cx:mmNumber(x+w/2),cy:mmNumber(y+h/2)});
    };
    if(custom?.heights?.length){
      const gaps=custom.gaps||Array(custom.heights.length+1).fill(g),gapTotal=gaps.reduce((n,v)=>n+Number(v||0),0);
      const nominal=custom.heights.reduce((n,v)=>n+Number(v||0),0),scale=Math.max(1,H-gapTotal)/Math.max(1,nominal);
      let y=y0+Number(gaps[0]||0);
      for(let i=0;i<custom.heights.length;i++){
        const fh=mmNumber(Number(custom.heights[i])*scale),fw=mmNumber(Math.max(1,W-2*g));
        cells.push({kind:custom.kind||'drawer',w:fw,h:fh,cx:0,cy:mmNumber(y+fh/2)});
        y+=fh+Number(gaps[i+1]||0);
      }
      return cells;
    }
    if(spec.kind==='none')return cells;
    if(spec.kind==='doors'){
      const n=Math.max(1,spec.count||1),cw=W/n;
      for(let i=0;i<n;i++)cell('door',x0+i*cw,y0,cw,H);
    }else if(spec.kind==='drawers'){
      const n=Math.max(1,spec.count||it.drawers||1),ch=H/n;
      for(let i=0;i<n;i++)cell('drawer',x0,y0+i*ch,W,ch);
    }else if(spec.kind==='combo'){
      const topH=H*(spec.drawerRatio||.42),bottomH=H-topH;
      const doors=Math.max(1,spec.doors||1),doorW=W/doors;
      for(let i=0;i<doors;i++)cell('door',x0+i*doorW,y0,doorW,bottomH);
      const rows=Math.max(1,spec.drawerRows||1),rh=topH/rows;
      for(let i=0;i<rows;i++)cell('drawer',x0,y0+bottomH+i*rh,W,rh);
    }else if(spec.kind==='niche'){
      const nicheH=H*(spec.nicheRatio||.35),bottomH=H-nicheH,rows=Math.max(1,spec.drawerRows||2),rh=bottomH/rows;
      for(let i=0;i<rows;i++)cell('drawer',x0,y0+i*rh,W,rh);
    }
    return cells;
  }
  /** Canonical manufactured panels, in local module millimetres, with CLOSED facades.
   * Persist the donor SHA + dimensions/materials/shelf parameters, not a stale geometry cache.
   * Meshes, cutlist and native export all consume this same deterministic part list.
   * Orientation identifies the length/width/thickness axes of each board blank.
   */
  function productionParts(it,template,materialLookup=()=>null){
    const p=template?.production;if(!p?.carcass)return null;
    const {width:W,height:H,depth:D}=it,{body_height:B,base_height:base}=heights(it);
    const t=p.carcass.panel_thickness,rail=p.carcass.rail_depth||80,inner=W-2*t,parts=[];
    const add=(key,name,role,size,position,axes,variant=null,material=null,extra={})=>{
      const [length_axis,width_axis,thickness_axis]=axes;
      parts.push({part_id:it.item_id+':'+key,key,module_id:it.item_id,name,role,type:'panel',
        material:{variant_id:variant||null,name:material||null},length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],
        position,orientation:{length_axis,width_axis,thickness_axis},size,...extra});
    };
    if(p.carcass.type==='wall_box'){
      for(const [side,sign]of [['L',-1],['P',1]])add('side-'+side,side==='L'?'Левая Боковая':'Правая Боковая','body',
        {x:t,y:B,z:D},{x:sign*(W-t)/2,y:base+B/2,z:0},['y','z','x'],it.body_variant_id,p.carcass.material_name||null);
      add('top','Крыша','body',{x:inner,y:t,z:D},{x:0,y:base+B-t/2,z:0},['x','z','y'],it.body_variant_id,p.carcass.material_name||null);
      add('bottom','Дно','body',{x:inner,y:t,z:D},{x:0,y:base+t/2,z:0},['x','z','y'],it.body_variant_id,p.carcass.material_name||null);
      for(const shelf of it.shelves??p.shelves??[])if(shelf.enabled!==false)add(shelf.id,'Полка','shelf',
        {x:W-shelf.width_clearance,y:shelf.thickness,z:D-shelf.depth_clearance},
        {x:0,y:base+shelf.offset_mm,z:shelf.depth_clearance/2},['x','z','y'],shelf.material_variant_id||it.body_variant_id,p.carcass.material_name||null,
        {shelf_id:shelf.id,placement_source:shelf.placement_source||null});
      if(p.back){const b=p.back;add('back','З.С','back',
        {x:W-2*b.inset,y:B-2*b.inset,z:b.thickness},{x:0,y:base+B/2,z:-(D+b.thickness)/2},['y','x','z'],null,b.material_name,{back_type:b.type});}
      facadeCells(it,template).forEach((f,i)=>{
        const door=p.doors?.[i]||null,thickness=p.facade?.thickness||18,z=D/2+(p.facade?.clearance_mm??2)+thickness/2;
        const extra={facade:f};
        if(door)Object.assign(extra,{hinge_side:door.side,open_angle:door.open_angle,hinge_count:door.hinge_count,
          pivot:{x:f.cx+(door.side==='left'?-1:1)*f.w/2,y:0,z}});
        add('door-'+(i+1),'Фасад','front',{x:f.w,y:f.h,z:thickness},{x:f.cx,y:f.cy,z},['y','x','z'],
          it.front_variant_id,p.facade?.material_name||null,extra);
      });
      for(const part of parts){
        const id=it.part_materials?.[part.key]??(part.role==='back'?it.back_variant_id:null)??part.material.variant_id;
        const m=id?materialLookup(id):null;
        part.material={variant_id:id||null,name:m?.name||(id?null:part.material.name),article:m?.article||null,
          manufacturer:m?.manufacturer||null,material_id:m?.material_id||null};
      }
      return parts;
    }
    if(p.carcass.type!=='bottom_side_two_rails')return null;
    add('bottom','Дно','body',{x:W,y:t,z:D},{x:0,y:base+t/2,z:0},['x','z','y'],it.body_variant_id,p.carcass.material_name||null);
    for(const [side,sign]of [['L',-1],['P',1]])add('side-'+side,'Боковина '+side,'body',
      {x:t,y:B-t,z:D},{x:sign*(W-t)/2,y:base+t+(B-t)/2,z:0},['y','z','x'],it.body_variant_id,p.carcass.material_name||null);
    for(const [key,name,sign]of [['rear','задняя',-1],['front','передняя',1]])add('rail-'+key,'Царга '+name,'body',
      {x:inner,y:t,z:rail},{x:0,y:H-t/2,z:sign*(D-rail)/2},['z','x','y'],it.body_variant_id,p.carcass.material_name||null);
    for(const shelf of it.shelves??p.shelves??[])if(shelf.enabled!==false)add(shelf.id,'Полка','shelf',
      {x:W-shelf.width_clearance,y:shelf.thickness,z:D-shelf.depth_clearance},
      {x:0,y:base+shelf.offset_mm,z:shelf.depth_clearance/2},['x','z','y'],shelf.material_variant_id||it.body_variant_id,null,
      {source_component:shelf.source_component||null,shelf_id:shelf.id});
    if(p.back){const b=p.back;add('back','Задняя стенка','back',
      {x:W-2*b.inset,y:B-2*b.inset,z:b.thickness},{x:0,y:base+B/2,z:-(D+b.thickness)/2},['y','x','z'],null,b.material_name,{back_type:b.type});}
    const frontCells=facadeCells(it,template);
    if(p.drawer_box){
      const d=p.drawer_box,pt=d.panel_thickness||18,bt=d.bottom_thickness||3;
      const fbW=Math.max(1,W-(d.front_back_width_clearance||99)),sideD=Math.max(1,D-(d.side_depth_clearance||10));
      const bottomW=Math.max(1,W-(d.bottom_width_clearance||67)),bottomD=Math.max(1,D-(d.bottom_depth_clearance||14));
      const sideX=fbW/2+pt/2,frontZ=sideD/2-pt/2;
      frontCells.forEach((f,i)=>{
        const boxH=Math.max(1,mmNumber(f.h-(d.facade_to_box_delta||57))),cy=f.cy,key='drawer-'+(i+1)+'-';
        add(key+'rear','ЗАДНЯЯ ШУФ','drawer',{x:fbW,y:boxH,z:pt},{x:0,y:cy,z:-frontZ},['y','x','z'],null,d.material_name,{drawer_index:i+1});
        add(key+'front','Фронтальная ШУФ','drawer',{x:fbW,y:boxH,z:pt},{x:0,y:cy,z:frontZ},['y','x','z'],null,d.material_name,{drawer_index:i+1});
        add(key+'side-P','Боковая напр.P','drawer',{x:pt,y:boxH,z:sideD},{x:sideX,y:cy,z:0},['y','z','x'],null,d.material_name,{drawer_index:i+1});
        add(key+'side-L','Боковая напр.L','drawer',{x:pt,y:boxH,z:sideD},{x:-sideX,y:cy,z:0},['y','z','x'],null,d.material_name,{drawer_index:i+1});
        add(key+'bottom','З.С','back',{x:bottomW,y:bt,z:bottomD},{x:0,y:cy-boxH/2+bt/2,z:0},['x','z','y'],null,d.bottom_material_name,{drawer_index:i+1,back_type:'drawer_bottom'});
      });
    }
    frontCells.forEach((f,i)=>{
      const door=p.doors?.[i]||null,thickness=p.facade?.thickness||18,z=D/2+(p.facade?.clearance_mm??2)+thickness/2;
      const extra={facade:f,drawer_index:f.kind==='drawer'?i+1:null};
      if(door)Object.assign(extra,{hinge_side:door.side,open_angle:door.open_angle,hinge_count:door.hinge_count,
        pivot:{x:f.cx+(door.side==='left'?-1:1)*f.w/2,y:0,z}});
      add((f.kind==='drawer'?'drawer-front-':'door-')+(i+1),f.kind==='drawer'?'Фасад ящика':'Фасад двери','front',
        {x:f.w,y:f.h,z:thickness},{x:f.cx,y:f.cy,z},f.kind==='drawer'?['y','x','z']:['x','y','z'],
        it.front_variant_id,p.facade?.material_name||null,extra);
    });
    for(const part of parts){
      const id=it.part_materials?.[part.key]??(part.role==='back'?it.back_variant_id:null)??part.material.variant_id;
      const m=id?materialLookup(id):null;
      part.material={variant_id:id||null,name:m?.name||(id?null:part.material.name),article:m?.article||null,
        manufacturer:m?.manufacturer||null,material_id:m?.material_id||null};
    }
    return parts;
  }
  function elevation(it,room){
    return Number.isFinite(it.elevation_mm)?it.elevation_mm:
      it.module_type==='wall_cabinet'?Math.max(0,room.height-it.height-500):0;
  }
  function tier(it){return it.module_type==='wall_cabinet'?'wall':it.module_type==='base_cabinet'?'base':it.module_type==='tall_cabinet'?'tall':'other';}
  function rotateXZ(x,z,r){
    const a=r*Math.PI/180,c=Math.round(Math.cos(a)),s=Math.round(Math.sin(a));
    return{x:x*c-z*s||0,z:x*s+z*c||0};
  }
  /** One derived production plan for continuous kitchen runs. All coordinates are mm.
   * The frame origin is the middle of the rear countertop edge; local +Z faces the room.
   * Different decors produce adjacent, non-overlapping finish sections of the same run.
   */
  function kitchenRuns(items,room,materialLookup=()=>null){
    const groups=new Map(),runs=[];
    for(const it of items){
      const k=kitchenSettings(it);if(!k)continue;
      const rotation=it.rotation||0,local=rotateXZ(it.x,it.z,-rotation),level=elevation(it,room);
      const back=local.z-it.depth/2-k.rearServiceGapMm,top=level+it.height;
      const key=[rotation,mmNumber(back),top,k.countertopDepthMm,k.countertopThicknessMm].join('|');
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({it,k,rotation,back,top,level,lo:local.x-it.width/2,hi:local.x+it.width/2});
    }
    for(const members of groups.values()){
      members.sort((a,b)=>a.lo-b.lo);const contiguous=[];
      for(const m of members){const last=contiguous.at(-1);if(last&&Math.abs(last.hi-m.lo)<=1){last.hi=m.hi;last.members.push(m);}else contiguous.push({lo:m.lo,hi:m.hi,members:[m]});}
      for(const run of contiguous){
        const f=run.members[0],center=(run.lo+run.hi)/2,origin=rotateXZ(center,f.back,f.rotation);
        const plan={run_id:'kitchen:'+run.members.map(m=>m.it.item_id).join(':'),members:run.members.map(m=>m.it.item_id),rotation:f.rotation,
          position:{x:origin.x,y:0,z:origin.z},countertopActualLengthMm:run.hi-run.lo,countertopDepthMm:f.k.countertopDepthMm,
          countertopStockLengthMm:4100,countertopThicknessMm:f.k.countertopThicknessMm,parts:[]};
        const add=(role,lo,hi,z,depth,y,height,id,ids,suffix='')=>{
          const material=id?materialLookup(id):null;
          plan.parts.push({part_id:plan.run_id+':'+role+':'+plan.parts.length+suffix,name:role==='counter'?'Столешница':'Цоколь',role,type:'panel',module_ids:ids,
            material:{variant_id:id||null,name:material?.name||null,article:material?.article||null},
            size:{x:hi-lo,y:height,z:depth},position:{x:(lo+hi)/2-center,y,z},
            orientation:{length_axis:'x',width_axis:role==='counter'?'z':'y',thickness_axis:role==='counter'?'y':'z'},
            length:hi-lo,width:role==='counter'?depth:height,thickness:role==='counter'?height:depth});
        };
        for(const role of ['counter','plinth']){
          const sections=[];
          for(const m of run.members){
            const {k,it}=m,id=role==='counter'?k.countertopMaterialId:k.plinthMaterialId;
            const z=role==='counter'?k.countertopDepthMm/2:k.rearServiceGapMm+it.depth-60;
            const y=role==='counter'?m.top+k.countertopThicknessMm/2:m.level+k.legHeightMm/2;
            const height=role==='counter'?k.countertopThicknessMm:k.legHeightMm,depth=role==='counter'?k.countertopDepthMm:18;
            const last=sections.at(-1);
            if(last&&last.id===id&&last.z===z&&last.y===y&&last.height===height){last.hi=m.hi;last.ids.push(it.item_id);}
            else sections.push({lo:m.lo,hi:m.hi,z,y,height,depth,id,ids:[it.item_id]});
          }
          for(const s of sections){
            // Stock is a physical limit, not the displayed length of the kitchen.
            // Simple butt joints; production seam optimisation remains a later step.
            const limit=role==='counter'?plan.countertopStockLengthMm:s.hi-s.lo;
            for(let lo=s.lo;lo<s.hi;lo+=limit){
              const hi=Math.min(lo+limit,s.hi),ids=run.members.filter(m=>m.hi>lo&&m.lo<hi).map(m=>m.it.item_id);
              add(role,lo,hi,s.z,s.depth,s.y,s.height,s.id,ids);
            }
          }
        }
        // Returns at the two exposed ends; no doubled side panels between neighbours.
        for(const [m,sign]of [[run.members[0],-1],[run.members.at(-1),1]]){
          const d=m.it.depth-100,x=sign<0?run.lo:run.hi-18;
          add('plinth',x,x+18,m.k.rearServiceGapMm+m.it.depth/2-10,d,m.level+m.k.legHeightMm/2,m.k.legHeightMm,m.k.plinthMaterialId,[m.it.item_id],':return');
          const p=plan.parts.at(-1);p.length=d;p.width=m.k.legHeightMm;p.thickness=18;p.orientation={length_axis:'z',width_axis:'y',thickness_axis:'x'};
        }
        runs.push(plan);
      }
    }
    return runs;
  }
  function kitchenLegs(it){
    const k=kitchenSettings(it);if(!k)return null;
    return [-it.width/2+45,it.width/2-45].flatMap((x,i)=>[-it.depth/2+45,it.depth/2-95].map((z,j)=>({
      part_id:it.item_id+':leg-'+(i*2+j+1),module_id:it.item_id,name:'Опора регулируемая',role:'leg',type:'hardware',
      height:k.legHeightMm,position:{x,y:k.legHeightMm/2,z},orientation:{axis:'y'}})));
  }
  function bounds(it,room,includeFront=true){
    const points=[];
    const extension=includeFront?20:0;
    for(const x of[-it.width/2,it.width/2])for(const z of[-it.depth/2,it.depth/2+extension]){
      const p=rotateXZ(x,z,it.rotation||0);points.push({x:p.x+it.x,z:p.z+it.z});
    }
    const y=elevation(it,room);
    return{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z)),minY:y,maxY:y+it.height};
  }
  const overlaps=(a,b,tolerance=.5)=>a.minX<b.maxX-tolerance&&a.maxX>b.minX+tolerance&&
    a.minZ<b.maxZ-tolerance&&a.maxZ>b.minZ+tolerance&&a.minY<b.maxY-tolerance&&a.maxY>b.minY+tolerance;
  function placementError(it,items,room){
    if(![it.x,it.z,it.width,it.height,it.depth,elevation(it,room)].every(Number.isFinite))return 'Некорректные размеры или положение';
    if(it.width<150||it.height<250||it.depth<200)return 'Размер меньше допустимого';
    const b=bounds(it,room);
    if(b.minX<-room.width/2-.5||b.maxX>room.width/2+.5||b.minZ<-room.depth/2-.5||b.maxZ>room.depth/2+.5)return 'Модуль выходит за границы помещения';
    const k=kitchenSettings(it);
    if(k)for(const x of[-it.width/2,it.width/2])for(const z of[-it.depth/2-k.rearServiceGapMm,-it.depth/2-k.rearServiceGapMm+k.countertopDepthMm]){
      const p=rotateXZ(x,z,it.rotation||0);
      if(Math.abs(p.x+it.x)>room.width/2+.5||Math.abs(p.z+it.z)>room.depth/2+.5)return 'Столешница выходит за границы помещения';
    }
    if(b.minY<0||b.maxY>room.height+.5)return 'Модуль выходит за высоту помещения';
    const other=items.find(x=>x.item_id!==it.item_id&&overlaps(b,bounds(x,room)));
    return other?'Пересечение: '+other.name:'';
  }
  root.MF_FURNITURE_CORE=Object.freeze({FACADE_GAP_MM,MM_TO_WORLD,PILOT_PRODUCTION,WALL_PRODUCTION,PRODUCTION_MODELS,KITCHEN_DEFAULTS,isKitchenModule,kitchenSettings,normalizeKitchen,kitchenRuns,kitchenLegs,productionParts,heights,dimensionPatch,facadeCells,legacyFrontSpec,elevation,tier,rotateXZ,bounds,overlaps,placementError});
})(globalThis);
