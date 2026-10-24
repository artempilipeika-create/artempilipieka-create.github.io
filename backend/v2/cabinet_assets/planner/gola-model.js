/* Gola is a construction choice inside the existing lower cabinet families. */
(function(root){
 'use strict';
 const variants=root.MF_GOLA_VARIANTS||[],byId=new Map(variants.map(v=>[v.id,v]));
 const core=()=>root.MF_FURNITURE_CORE,D=()=>root.MF_DRAWERS;
 const legacyDoors=[['bazis.0211e4f77fc4',1,'left','shelf'],['bazis.784bf9af84f8',1,'right','shelf'],['bazis.3079d0656398',2,'double','shelf'],['bazis.facfa0cd038b',1,'left','sink'],['bazis.b226370aab54',1,'right','sink'],['bazis.5731630ddd87',2,'double','sink']];
 const families=[{door_count:1,default_id:legacyDoors[0][0],label:'Нижний шкаф · 1 дверь'},{door_count:2,default_id:legacyDoors[2][0],label:'Нижний шкаф · 2 двери'}];
 const choice=id=>byId.get(id)||null,info=it=>{const v=choice(it?.bazis_id);return v&&v.source_sha256===it.bazis_sha256?v:null;};
 function baseChoice(id){const v=choice(id);if(v)return v.kind==='doors'?v:null;
  const row=legacyDoors.find(v=>v[0]===id),p=core()?.PRODUCTION_MODELS[id];
  return row&&p?{id,door_count:row[1],side:row[2],purpose:row[3],execution:'standard',source_file:p.source_file,source_sha256:p.source_sha256}:null;
 }
 const baseChoices=()=>[...legacyDoors.map(r=>baseChoice(r[0])).filter(Boolean),...variants.filter(v=>v.kind==='doors')];
 const baseInfo=it=>{const v=baseChoice(it?.bazis_id);return v&&it.bazis_sha256===v.source_sha256?v:null;};
 const family=v=>families.find(f=>f.door_count===v?.door_count)||null;
 const available=(v,patch)=>v?baseChoices().find(n=>['door_count','side','purpose','execution'].every(k=>n[k]===(patch[k]??v[k])))||null:null;
 function select(it,patch,catalogue){
  const v=available(baseInfo(it),patch),t=v&&catalogue.find(t=>t.id===v.id&&t.source_sha256===v.source_sha256);
  if(!t)throw new Error('Такого исполнения нет среди проверенных фрагментов');
  const next={...structuredClone(it),bazis_id:v.id,bazis_file:t.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,handles:v.execution==='gola'?'handleless':'handles',shelves:[]};
  if(v.execution!=='gola')next.shelves=(core().PRODUCTION_MODELS[v.id].shelves||[]).map(s=>({...s}));
  const error=v.execution==='gola'?dimensionError(next):core().dimensionError(next,t);if(error)throw new Error(error);
  // Only carry assignments to a panel of the same role and thickness.
  const old=core().productionParts(it,{production:core().PRODUCTION_MODELS[it.bazis_id]}),fresh=core().productionParts(next,{production:core().PRODUCTION_MODELS[next.bazis_id]});
  next.part_materials=Object.fromEntries(fresh.filter(p=>old.some(o=>o.key===p.key&&o.role===p.role&&o.thickness===p.thickness)&&it.part_materials?.[p.key]).map(p=>[p.key,it.part_materials[p.key]]));
  return next;
 }
 const round=n=>Math.round(n*10000)/10000;
 const elastic=(v,a,x,delta)=>{const ps=v.model_elastic.filter(p=>p.Axis===a),w=ps.reduce((s,p)=>s+p.Weight,0);return round(x+(w?delta*ps.filter(p=>x>p.Pos).reduce((s,p)=>s+p.Weight,0)/w:0));};
 const delta=it=>[it.width-600,it.height-(it.legHeightMm??it.base_height??100)-720,it.depth-510];
 const point=(it,v,a,x)=>elastic(v,a,x,delta(it)[a])-[it.width/2,100-(it.legHeightMm??it.base_height??100),it.depth/2][a];
 const source=it=>info(it)||root.MF_PULLOUT_DRYERS?.info(it);
 const configuration=(it,v=source(it))=>D().configuration(it,v);
 function dimensionError(it,v=source(it)){
  if(!v)return 'Фрагмент Gola не совпадает с проверенным исходником';
  const base=it.legHeightMm??it.base_height??100,min=v.kind==='doors'?300:400,max=v.door_count===1?600:1200;
  if(it.module_type!=='base_cabinet'||it.base==='wall'||![80,100,150].includes(base))return 'Gola: нижний модуль на ножках 80, 100 или 150 мм';
  if(it.width<min||it.width>max||it.height-base<600||it.height-base>1000||it.depth<300||it.depth>700)return `Gola: ширина ${min}–${max}, корпус 600–1000, глубина 300–700 мм`;
  if(v.kind==='drawers')return configuration(it).error;
  return '';
 }
 function model(v){
  const metal=v.kind==='drawers'&&v.system!=='ball';
  const p=metal?D().model(v):{tier:'base',native_defaults:{width:600,height:820,depth:510},body_height:720,base_height:100,scene_depth:510,worktop_thickness:38,resize:true,
   carcass:{type:'gola',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},back:v.purpose==='sink'?null:{type:'overlay_nails',thickness:3,material_name:'ЛХДФ 3ММ Белый'},
   facade:{thickness:18,gap_mm:1.5,clearance_mm:0,material_name:'Evagloss P004'},shelves:[],doors:v.kind==='doors'?(v.side==='double'?['left','right']:[v.side]).map(side=>({side,hinge_count:2,open_angle:105})):[],
   hardware:{native_fixed_items:true,hinges_in_items:true,items:v.hardware_items},front:{kind:v.kind,count:v.kind==='doors'?v.door_count:v.front_heights.length}};
  return {...p,gola:v,label:v.label,key:'base.gola.'+v.id,source_file:v.source_file,source_sha256:v.source_sha256,limits:{w:[v.kind==='doors'?300:400,v.door_count===1?600:1200],h:[700,1100],d:[300,700]}};
 }
 function contour(it,v,s){return s.contour_yz?.map(([y,z])=>[point(it,v,1,y),point(it,v,2,z)]);}
 function parts(it,p,lookup=()=>null){
  const v=p.gola;
  if(p.metal_drawers)return D().parts(it,p,lookup).map(part=>{const s=v.panels.find(s=>s.key===part.key);return {...part,...(s.contour_yz?{contour_yz:contour(it,v,s)}:{})};});
  const config=v.kind==='drawers'?configuration(it):null;
  if(config?.error)throw new Error(config.error);
  return v.panels.map(s=>{
   let lo=s.lo.map((x,i)=>point(it,v,i,x)),hi=s.lo.map((x,i)=>point(it,v,i,x+s.size[i]));
   if(s.drawer_index){
    const slot=v.elastic_drawers[s.drawer_index-1],d=config.drawers[s.drawer_index-1],growth=d.height-slot.height,base=it.legHeightMm??it.base_height??100;
    lo[1]=s.lo[1]+d.y-slot.y+base-100;hi[1]=lo[1]+s.size[1]+(s.thickness===3?0:growth);
    // Wooden drawers retain the chosen rail length, mounted at the front plane.
    const length=d.kit.length_mm,dz=it.depth-510,dl=length-500;
    lo[2]=s.lo[2]+dz-(s.key.endsWith('front-box')?0:dl)-it.depth/2;
    hi[2]=lo[2]+s.size[2]+((s.key.endsWith('bottom')||s.key.includes('-side-'))?dl:0);
   }
   const sizes=hi.map((x,i)=>round(x-lo[i])),centers=hi.map((x,i)=>round((x+lo[i])/2)),size=Object.fromEntries(['x','y','z'].map((a,i)=>[a,sizes[i]])),position=Object.fromEntries(['x','y','z'].map((a,i)=>[a,centers[i]]));
   const id=it.part_materials?.[s.key]??(s.role==='front'?it.front_variant_id:s.role==='back'?it.back_variant_id:it.body_variant_id),mat=id?lookup(id):null;
   const [length_axis,width_axis,thickness_axis]=s.axes.map(i=>['x','y','z'][i]);
   const f=s.role==='front'?{kind:v.kind==='doors'?'door':'drawer',w:size.x,h:size.y,cx:position.x,cy:position.y}:null;
   const side=v.kind==='doors'?(v.side==='double'?(position.x<0?'left':'right'):v.side):null;
   return {part_id:it.item_id+':'+s.key,module_id:it.item_id,key:s.key,name:s.name,role:s.role,type:'panel',size,position,length:size[length_axis],width:size[width_axis],thickness:size[thickness_axis],orientation:{length_axis,width_axis,thickness_axis},
    material:{variant_id:id||null,name:mat?.name||(id?null:s.role==='front'?'Evagloss P004':s.role==='back'?'ЛХДФ 3ММ Белый':'ЛДСП- БЕЛЫЙ'),article:mat?.article||null,manufacturer:mat?.manufacturer||null,material_id:mat?.material_id||null},
    ...(s.drawer_index?{drawer_index:s.drawer_index}:{}),...(s.role==='back'?{back_type:s.back_type||'overlay_nails'}:{}),...(s.contour_yz?{contour_yz:contour(it,v,s)}:{}),
    ...(f?{facade:f,...(v.kind==='drawers'?{drawer_index:Number(s.key.split('-')[1])}:{hinge_side:side,open_angle:105,hinge_count:2,pivot:{x:f.cx+(side==='left'?-1:1)*f.w/2,y:0,z:position.z}})}:{})};
  });
 }
 const facades=(it,p)=>parts(it,p).filter(p=>p.facade).map(p=>p.facade);
 const profiles=it=>{const v=source(it);return v?v.profiles.map(s=>({name:s.name,article:s.article,contour_yz:contour(it,v,s),x:-it.width/2,length:it.width})):[];};
 function hardware(it,p){
  const v=p.gola,base=it.legHeightMm??it.base_height??100;
  const dynamic=p.metal_drawers?D().hardware(it,p):p.hardware;
  let items=p.metal_drawers?dynamic.items:v.hardware_items.map(x=>({...x}));
  if(v.system==='ball'){
   items=items.filter(h=>!h.name.startsWith('Направляющая шариковая'));
   for(const d of configuration(it).drawers){const h=d.kit.hardware.find(h=>h.name.includes('PRIME by AKS SOFT CLOSE'));if(h)items.push({...h,key:'ball-slide-'+d.index,unit:'set'});}
  }
  if(!p.metal_drawers&&base!==100)items=items.map(h=>/Опора регулируемая|Ножка пластиковая без базы/.test(h.name)?{...h,name:h.name.replace(/Н100|высота 100/,x=>x==='Н100'?'Н'+base:'высота '+base),article:null,note:'Артикул опоры этой высоты подобрать по каталогу'}:h);
  for(const s of v.profiles)items.push({key:s.article,name:s.material_name,article:s.article,quantity:it.width/1000,unit:'m',cut_length_mm:it.width,stock_length_mm:5500,note:'Отрезок на модуль; закупку хлыстов считать по раскрою всего ряда'});
  const merged=[];for(const h of items){const old=merged.find(x=>x.name===h.name&&x.article===h.article&&x.unit===h.unit);if(old)old.quantity+=h.quantity;else merged.push({...h});}
  return {...dynamic,items:merged,hinges_in_items:true,native_fixed_items:true,...(v.system==='ball'?{slide_length_mm:configuration(it).drawers[0]?.kit.length_mm,slide_type:'ball_bearing_soft_close'}:{})};
 }
 function adjustment(it){const v=source(it);if(!v)return null;const base=it.legHeightMm??it.base_height??100,notes=[...v.warnings];if(base!==100)notes.push(`В БАЗИС заменить опоры 100 мм на ${base} мм; высота корпуса ${it.height-base} мм.`);
  return notes.length?{kind:'gola',requires_manual_native_adjustment:true,note:notes.join(' ')}:null;
 }
 function brief(it){const v=info(it);if(!v)return '';const p=core().PRODUCTION_MODELS[v.id],fronts=facades(it,p).map(f=>String(f.h).replace('.',','));
  return (v.kind==='drawers'?'Gola II · L + C · '+v.series:'Gola L · '+(v.purpose==='sink'?'под мойку':'с полками'))+'. Фасады снизу вверх: '+fronts.join(' + ')+' мм. Чёрный профиль AKS '+v.profiles.map(p=>p.article).join(' + ')+'; крепления 118236. '+(v.kind==='drawers'?'Направляющие '+configuration(it).drawers.map(d=>d.kit.length_mm).filter((x,i,a)=>a.indexOf(x)===i).join(' / ')+' мм. ':'')+(adjustment(it)?.note||'');
 }
 root.MF_GOLA=Object.freeze({variants,choice,info,baseChoice,baseChoices,baseInfo,families,family,available,select,model,elastic,point,parts,facades,profiles,hardware,dimensionError,configuration,adjustment,brief});
})(globalThis);
