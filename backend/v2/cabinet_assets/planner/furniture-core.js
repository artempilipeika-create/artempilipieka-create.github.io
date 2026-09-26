/* Shared production geometry. Millimetres throughout; no renderer state. */
'use strict';
(function(root){
  const FACADE_GAP_MM=1.5, MM_TO_WORLD=0.001;
  const mmNumber=v=>Math.round(Number(v)*10)/10;
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
    const spec=template?.front||legacyFrontSpec(it);
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
  root.MF_FURNITURE_CORE=Object.freeze({FACADE_GAP_MM,MM_TO_WORLD,heights,dimensionPatch,facadeCells,legacyFrontSpec,elevation,tier,rotateXZ,bounds,overlaps,placementError});
})(globalThis);
