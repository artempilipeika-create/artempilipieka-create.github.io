/* Native dishwasher fronts and row plinths. Geometry is derived from donor elastic planes. */
(function(root){
 'use strict';
 const variants=root.MF_ACCESSORY_VARIANTS||[],dishwashers=variants.filter(v=>v.kind==='dishwasher');
 const C=()=>root.MF_FURNITURE_CORE,round=x=>Math.round(x*10000)/10000;
 const info=it=>dishwashers.find(v=>v.id===it?.bazis_id&&v.source_sha256===it?.bazis_sha256)||null;
 const elastic=(v,a,x,delta)=>{const p=v.model_elastic.filter(p=>p.Axis===a),w=p.reduce((n,p)=>n+p.Weight,0);return round(x+(w?delta*p.filter(p=>x>p.Pos).reduce((n,p)=>n+p.Weight,0)/w:0));};
 function model(v){return {dishwasher:v,tier:'base',label:'Посудомойка',key:'base.dishwasher.'+v.variant,
  source_file:v.source_file,source_sha256:v.source_sha256,native_defaults:{width:600,height:820,depth:600},
  body_height:720,base_height:100,scene_depth:510,worktop_thickness:38,resize:true,
  limits:{w:[450,600],h:[700,1100],d:[450,700]},carcass:{type:'dishwasher_space',panel_thickness:18},
  facade:{thickness:18,gap_mm:1.5},back:null,shelves:[],doors:[],front:{kind:'doors',count:1},hardware:{native_fixed_items:true,items:[]}};}
 function dimensionError(it){
  if(!info(it))return 'Фрагмент посудомойки не совпадает с проверенным исходником';
  if(it.module_type!=='base_cabinet'||it.base==='wall'||(it.legHeightMm??it.base_height??100)!==100)return 'Посудомойка: исходная установка на отметке 100 мм';
  if(it.width<450||it.width>600||it.height<700||it.height>1100||it.depth<450||it.depth>700)return 'Посудомойка: ширина 450–600, высота 700–1100, глубина 450–700 мм';
  return '';
 }
 function panels(v,target,lookup=()=>null,materialId=null,moduleId='accessory'){
  const dims=[target.width,target.height,target.depth],delta=dims.map((n,i)=>n-v.frame.size[i]);
  const point=(a,x)=>elastic(v,a,x,delta[a])-[dims[0]/2,0,dims[2]/2][a];
  return v.panels.map(s=>{
   const lo=s.lo.map((x,a)=>point(a,x)),hi=s.lo.map((x,a)=>point(a,x+s.size[a]));
   const size=Object.fromEntries(['x','y','z'].map((a,i)=>[a,round(hi[i]-lo[i])])),position=Object.fromEntries(['x','y','z'].map((a,i)=>[a,round((hi[i]+lo[i])/2)]));
   const [length_axis,width_axis,thickness_axis]=s.axes.map(i=>['x','y','z'][i]),m=materialId?lookup(materialId):null;
   return {part_id:moduleId+':'+s.key,module_id:moduleId,key:s.key,name:s.name,role:s.role,type:'panel',size,position,
    length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},
    material:{variant_id:materialId,name:m?.name||(materialId?null:s.material_name),article:m?.article||(materialId?null:s.material_article)||null,material_id:m?.material_id||null,thickness:18},
    ...(s.role==='front'?{facade:{kind:'door',w:size.x,h:size.y,cx:position.x,cy:position.y}}:{})};
  });
 }
 const parts=(it,p,lookup=()=>null)=>panels(p.dishwasher,it,lookup,it.part_materials?.['front-1']||it.front_variant_id,it.item_id);
 const facades=(it,p)=>parts(it,p).map(p=>p.facade);
 const profiles=it=>{const v=info(it);return v?v.profiles.map(s=>({name:s.name,article:s.article,x:-it.width/2,length:it.width,
  contour_yz:s.contour_yz.map(([y,z])=>[elastic(v,1,y,it.height-820),elastic(v,2,z,it.depth-600)-it.depth/2])})):[];};
 const hardware=it=>({native_fixed_items:true,items:(info(it)?.profiles||[]).map(p=>({key:p.article,name:p.material_name,article:p.article,quantity:it.width/1000,unit:'m',cut_length_mm:it.width}))});
 function select(it,variant){const v=dishwashers.find(v=>v.variant===variant);if(!v)throw new Error('Не найдено исполнение посудомойки');return {...it,bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,handles:variant==='gola'?'handleless':'handles'};}
 const runFor=(state,id)=>C().kitchenRuns(state.items,state.room).find(r=>r.members.includes(id));
 function plans(state,lookup=()=>null){
  const runs=C().kitchenRuns(state.items,state.room),used=new Set();
  return (state.plinths||[]).map(e=>{
   const run=runs.find(r=>r.members.some(id=>e.members.includes(id)));
   const error=message=>({id:e.id,error:message,members:e.members,parts:[]});
   if(!run)return error('Ряд для цоколя удалён. Удалите его карточку.');
   if(e.members.some(id=>state.items.some(it=>it.item_id===id)&&!run.members.includes(id)))return error('Ряд разделён. Удалите цоколь и добавьте его к новым участкам.');
   if(run.members.some(id=>used.has(id)))return error('Два цоколя привязаны к одному ряду. Удалите лишний.');
   run.members.forEach(id=>used.add(id));
   const items=run.members.map(id=>state.items.find(it=>it.item_id===id)),first=items[0];
   if(items.some(it=>it.depth!==first.depth||C().heights(it).base_height!==C().heights(first).base_height))return error('Для общего цоколя глубина и высота основания в ряду должны совпадать.');
   const width=e.width??run.countertopActualLengthMm,height=e.height??C().heights(first).base_height;
   const inset=e.inset??40,depth=e.depth??first.depth-inset;
   if(![width,height,depth,inset].every(Number.isFinite)||width<100||width>6000||height<40||height>300||depth<40||depth>1200||inset<0||inset>=first.depth)return error('Проверьте размеры и отступ цоколя.');
   // L/U donors face native -Z. Rotate the complete native assembly, swapping L/P donors
   // so the UI's return side is always relative to the front of the kitchen row.
   const nativeShape={left:'right',right:'left'}[e.shape]||e.shape;
   const v=variants.find(v=>v.kind==='plinth'&&v.variant===nativeShape);if(!v)return error('Неизвестная форма цоколя');
   const straight=e.shape==='straight',target={width,height,depth:straight?depth+58:depth};
   const localZ=C().kitchenSettings(first).rearServiceGapMm+first.depth-inset-(straight?target.depth/2-40:target.depth/2);
   const shift=C().rotateXZ(0,localZ,run.rotation),rotation=(run.rotation+(straight?0:180))%360;
   const materialId=e.material_id??first.plinthMaterialId??null;
   const ps=panels(v,target,lookup,materialId,e.id);
   if(ps.some(p=>Math.abs(p.thickness-18)>.01||p.length<=0||p.width<=0))return error('Размер пересекает неизменяемую часть фрагмента. Увеличьте размер.');
   return {id:e.id,run_id:'plinth:'+e.id,members:run.members,shape:e.shape,source:v,target,rotation,
    position:{x:run.position.x+shift.x,y:C().elevation(first,state.room),z:run.position.z+shift.z},parts:ps,width,height,depth,inset,material_id:materialId};
  });
 }
 function nativeItems(state,lookup){return plans(state,lookup).map(p=>{
  if(p.error)throw new Error(p.error);
  const body=p.parts[0]?.material;
  return {name:'Цоколь ряда · '+names[p.shape],source_file:p.source.source_file,source_sha256:p.source.source_sha256,
   source_default:{width:600,height:100,depth:600},target:p.target,position:p.position,rotation:p.rotation,elastic_resize:true,
   material_assignments:{body},construction:{key:'row.plinth',parts:p.parts},production_note:'Цоколь на весь ряд. '+names[p.shape]+'. Детали по исходному FR3D; отступ от передней плоскости модуля '+p.inset+' мм.'};
 });}
 const names={straight:'Прямой',left:'Возврат слева',right:'Возврат справа',u:'П-образный'};
 function drawing(shape){const left=shape==='left'||shape==='u',right=shape==='right'||shape==='u';return '<svg viewBox="0 0 160 80" aria-hidden="true"><path d="M20 60H140'+(right?'V15':'')+(left?'M20 60V15':'')+'" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round"/><path d="M20 72H140" stroke="currentColor" opacity=".25"/><text x="80" y="35" text-anchor="middle" font-size="10" fill="currentColor">вид сверху</text></svg>';}
 root.MF_ACCESSORIES=Object.freeze({variants,dishwashers,info,model,dimensionError,parts,facades,profiles,hardware,select,panels,elastic,runFor,plans,nativeItems,names,drawing});
})(globalThis);
