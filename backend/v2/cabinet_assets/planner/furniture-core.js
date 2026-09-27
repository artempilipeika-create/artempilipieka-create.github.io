/* Shared production geometry. Millimetres throughout; no renderer state. */
'use strict';
(function(root){
  const FACADE_GAP_MM=1.5, MM_TO_WORLD=0.001;
  const mmNumber=v=>Math.round(Number(v)*10)/10;
  // Versioned FR3D donor data. D1 L/P share every construction parameter except hinges.
  const pilotBase={
    native_defaults:{width:600,height:820,depth:510},body_height:720,base_height:100,worktop_thickness:38,scene_depth:510,
    carcass:{type:'bottom_side_two_rails',panel_thickness:18,rail_height:80},
    back:{type:'overlay_nails',thickness:3,inset:2,material_name:'ЛХДФ 3ММ Белый'},
    facade:{thickness:18,gap_mm:FACADE_GAP_MM,clearance_mm:2},
    shelves:[{id:'shelf-1',enabled:true,offset_mm:360,thickness:18,width_clearance:36,depth_clearance:1,source_component:'_Базовые Элементы\\05.Общие элементы\\Наполнение\\Секции полок\\Полка на конферматы.fr3d'}]
  };
  const pilot=(label,key,sha,sides)=>({...pilotBase,label,key,source_sha256:sha,
    doors:sides.map(side=>({side,hinge_count:2,open_angle:105})),hardware:{hinge_article:'112602',hinge_count:2*sides.length}});
  const freeze=value=>{Object.values(value).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(value);};
  const PILOT_PRODUCTION=freeze({
    'bazis.0211e4f77fc4':pilot('Д1 L','base.standard.d1.left.600','7d029606fafc89c7a7f060106a3f2d30a8c4224a304a904bbfeffe3675645d64',['left']),
    'bazis.784bf9af84f8':pilot('Д1 P','base.standard.d1.right.600','5ffe31ba623db8b5cdc3d7e65811d6b162da40ef96f30554e9030b2d764c7eeb',['right']),
    'bazis.3079d0656398':pilot('Д2','base.standard.d2.600','7d6feef0bc55a52460670eaa9f738c2e9764edd947d52ca4269053fd5fed6d29',['left','right'])
  });
  // `height` remains the saved module envelope and the native FR3D target.
  // Old projects keep that envelope; a worktop has never been part of it.
  function heights(it){
    const base=it.base==='wall'?0:(Number.isFinite(it.base_height)?it.base_height:it.base==='plinth'?80:60);
    const worktop=it.module_type==='base_cabinet'&&it.depth<=750
      ?(Number.isFinite(it.worktop_thickness)?it.worktop_thickness:32):0;
    return {body_height:it.height-base,base_height:base,module_height:it.height,
      worktop_thickness:worktop,overall_height_with_worktop:it.height+worktop};
  }
  function dimensionPatch(source,patch){
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
    const spec=template?.production?.doors?.length?{kind:'doors',count:template.production.doors.length}:template?.front||legacyFrontSpec(it);
    const baseH=heights(it).base_height;
    const x0=-it.width/2,y0=baseH,W=it.width,H=Math.max(1,it.height-baseH),g=FACADE_GAP_MM,cells=[];
    const cell=(kind,x,y,w,h)=>{
      const fw=Math.max(1,w-2*g),fh=Math.max(1,h-2*g);
      cells.push({kind,w:mmNumber(fw),h:mmNumber(fh),cx:mmNumber(x+w/2),cy:mmNumber(y+h/2)});
    };
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
    const p=template?.production;if(p?.carcass?.type!=='bottom_side_two_rails')return null;
    const {width:W,height:H,depth:D}=it,{body_height:B,base_height:base}=heights(it);
    const t=p.carcass.panel_thickness,rail=p.carcass.rail_height,inner=W-2*t,parts=[];
    const add=(key,name,role,size,position,axes,variant=null,material=null,extra={})=>{
      const [length_axis,width_axis,thickness_axis]=axes;
      parts.push({part_id:it.item_id+':'+key,key,module_id:it.item_id,name,role,type:'panel',
        material:{variant_id:variant||null,name:material||null},length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],
        position,orientation:{length_axis,width_axis,thickness_axis},size,...extra});
    };
    add('bottom','Дно','body',{x:W,y:t,z:D},{x:0,y:base+t/2,z:0},['x','z','y'],it.body_variant_id);
    for(const [side,sign]of [['L',-1],['P',1]])add('side-'+side,'Боковина '+side,'body',
      {x:t,y:B-t,z:D},{x:sign*(W-t)/2,y:base+t+(B-t)/2,z:0},['y','z','x'],it.body_variant_id);
    for(const [key,name,sign]of [['rear','задняя',-1],['front','передняя',1]])add('rail-'+key,'Царга '+name,'body',
      {x:inner,y:rail,z:t},{x:0,y:H-rail/2,z:sign*(D-t)/2},['y','x','z'],it.body_variant_id);
    for(const shelf of it.shelves??p.shelves??[])if(shelf.enabled!==false)add(shelf.id,'Полка','shelf',
      {x:W-shelf.width_clearance,y:shelf.thickness,z:D-shelf.depth_clearance},
      {x:0,y:base+shelf.offset_mm,z:shelf.depth_clearance/2},['x','z','y'],shelf.material_variant_id||it.body_variant_id,null,
      {source_component:shelf.source_component||null,shelf_id:shelf.id});
    if(p.back){const b=p.back;add('back','Задняя стенка','back',
      {x:W-2*b.inset,y:B-2*b.inset,z:b.thickness},{x:0,y:base+B/2,z:-(D+b.thickness)/2},['y','x','z'],null,b.material_name,{back_type:b.type});}
    facadeCells(it,template).forEach((f,i)=>{
      const door=p.doors[i],thickness=p.facade?.thickness||18,z=D/2+(p.facade?.clearance_mm??2)+thickness/2;
      add('door-'+(i+1),'Фасад двери','front',{x:f.w,y:f.h,z:thickness},{x:f.cx,y:f.cy,z},['x','y','z'],it.front_variant_id,null,
        {facade:f,hinge_side:door.side,open_angle:door.open_angle,hinge_count:door.hinge_count,
          pivot:{x:f.cx+(door.side==='left'?-1:1)*f.w/2,y:0,z}});
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
    if(b.minY<0||b.maxY>room.height+.5)return 'Модуль выходит за высоту помещения';
    const other=items.find(x=>x.item_id!==it.item_id&&overlaps(b,bounds(x,room)));
    return other?'Пересечение: '+other.name:'';
  }
  root.MF_FURNITURE_CORE=Object.freeze({FACADE_GAP_MM,MM_TO_WORLD,PILOT_PRODUCTION,productionParts,heights,dimensionPatch,facadeCells,legacyFrontSpec,elevation,tier,rotateXZ,bounds,overlaps,placementError});
})(globalThis);
