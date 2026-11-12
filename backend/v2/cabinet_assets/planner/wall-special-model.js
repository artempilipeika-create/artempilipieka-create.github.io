/* Measured upper vitrines and blind corners. Native origins, contours and source identity stay intact. */
(function(root){
 'use strict';
 const variants=root.MF_WALL_SPECIAL_VARIANTS||[],byId=new Map(variants.map(v=>[v.id,v]));
 const labels={vitrine1:'ВМД1 · витрина',vitrine2:'ВМД2 · витрина',corner:'ВМУД1-1000 · угловой'};
 const families=Object.fromEntries(Object.entries(labels).map(([key,label])=>[key,{key,label,default_id:variants.find(v=>v.family===key&&v.opening!=='right'&&(v.light_system===null||v.light_system==='aq-4x8')&&(v.lighting===null||v.lighting==='left')&&v.execution!=='handleless')?.id}]));
 const choice=id=>byId.get(id)||null,info=it=>{const v=choice(it?.bazis_id);return v&&v.source_sha256===it?.bazis_sha256?v:null;},family=v=>families[v.family];
 const round=n=>Math.round(n*1e6)/1e6,axes=['x','y','z'];
 function model(v){const [w,h,d]=v.native_frame.size,corner=v.family==='corner';return {wall_special:v,key:'wall.'+v.family+'.'+v.id,label:family(v).label,tier:'wall',source_file:v.source_file,source_sha256:v.source_sha256,native_defaults:{width:w,height:h,depth:d-3},body_height:h,base_height:0,scene_depth:d-3,worktop_thickness:0,resize:true,limits:{w:corner?[800,1000]:v.door_count===1?[300,600]:[600,1200],h:[300,1400],d:[250,600]},carcass:{type:'wall_special',panel_thickness:18,material_name:'ЛДСП- БЕЛЫЙ'},back:{type:'overlay_nails',thickness:3,material_name:'ЛХДФ 3ММ Белый'},facade:corner?{thickness:18,gap_mm:1.5}:{thickness:4,gap_mm:v.door_count===1?2:1.5,profile:'Z1',material_name:'Стекло 4 мм'},front:{kind:'doors',count:v.door_count},doors:Array.from({length:v.door_count},(_,i)=>({side:v.opening==='double'?(i?'right':'left'):v.opening,open_angle:90})),shelves:[],hardware:{items:v.hardware_items,hinges_in_items:true,native_fixed_items:true}};}
 function dimensionError(it){const v=info(it);if(!v)return 'Исполнение не совпадает с исходным файлом БАЗИС';const p=model(v);if(it.module_type!=='wall_cabinet'||it.base!=='wall'||it.base_height!==0)return 'Верхний модуль — навесной, без цоколя';for(const [key,a]of [['width','w'],['height','h'],['depth','d']])if(!Number.isFinite(it[key])||it[key]<p.limits[a][0]||it[key]>p.limits[a][1])return 'Размер вне диапазона '+p.limits[a].join('–')+' мм';return '';}
 function available(v,patch){const o={...v,...patch};return variants.find(n=>n.family===v.family&&['opening','execution','light_system','lighting'].every(k=>n[k]===o[k]));}
 function select(it,patch,catalogue){const v=info(it),n=v&&available(v,patch);if(!n||!catalogue.some(m=>m.id===n.id&&m.source_sha256===n.source_sha256))throw Error('Исполнение не найдено');const next={...structuredClone(it),bazis_id:n.id,bazis_file:n.source_file,bazis_sha256:n.source_sha256,bazis_resize:true,handles:n.execution==='handles'?'handles':'handleless',doors_open:false,shelves:[]};if(n.family!=='corner')next.front_variant_id=null;const error=dimensionError(next);if(error)throw Error(error);return next;}
 function shelfCenters(it){const v=info(it),n=v.family==='corner'?1:2,gap=(it.height-36-n*18)/(n+1),th=v.family==='corner'?18:4;return Array.from({length:n},(_,i)=>round(18+(i+1)*gap+i*18+th/2));}
 function transfer(it,s,point){const v=info(it),[W,H,D]=v.native_frame.size,delta=[it.width-W,it.height-H,it.depth-(D-3)],q=[...point];
  if(s.role==='front'&&v.family!=='corner'){
   const index=s.door_index||0,leafW=W/v.door_count,dw=delta[0]/v.door_count,center=leafW*(index+.5);
   q[0]+=index*dw+(q[0]>center?dw:0);q[1]+=q[1]>H/2?delta[1]:0;
  }else{
   const xp=v.global_planes.find(p=>p.Axis===0).Pos;
   q[0]+=q[0]>xp?delta[0]:0;
   if(s.role==='shelf'){const ordered=v.panels.filter(p=>p.role==='shelf').sort((a,b)=>a.lo[1]-b.lo[1]),i=ordered.findIndex(p=>p.key===s.key);q[1]+=shelfCenters(it)[i]-(s.lo[1]+s.size[1]/2);}
   else q[1]+=q[1]>H/2?delta[1]:0;
  }
  // Native nested body planes: the central groove moves with the front.
  const zPlane=s.role==='shelf'?(v.family==='corner'?183:164):v.family==='corner'?(v.opening==='left'&&v.execution==='handleless'?205:280):115;
  if(s.role==='front'||q[2]>zPlane)q[2]+=delta[2];
  return q.map((x,i)=>round(x-[it.width/2,0,3+it.depth/2][i]));
 }
 function parts(it,p=model(info(it)),lookup=()=>null){const v=p.wall_special;
  return [...v.panels,...v.profiles].map(s=>{
   const lo=transfer(it,s,s.lo),hi=transfer(it,s,s.lo.map((x,i)=>x+s.size[i])),size=Object.fromEntries(axes.map((a,i)=>[a,round(hi[i]-lo[i])])),position=Object.fromEntries(axes.map((a,i)=>[a,round((hi[i]+lo[i])/2)]));
   const optical=s.optical_material,id=optical?null:it.part_materials?.[s.key]??(s.role==='back'?it.back_variant_id:s.role==='front'||/ФП Планка|Бленда/.test(s.name)?it.front_variant_id:it.body_variant_id),mat=id?lookup(id):null;
   const [length_axis,width_axis,thickness_axis]=s.axes.map(i=>axes[i]);
   const result={key:s.key,part_id:it.item_id+':'+s.key,module_id:it.item_id,name:s.name,role:s.role,type:s.native_profile?'profile':'panel',size,position,length:size[length_axis],width:size[width_axis],thickness:s.native_profile?20.5:s.thickness,orientation:{length_axis,width_axis,thickness_axis},material:{variant_id:id||null,name:mat?.name||(id?null:s.material_name),article:mat?.article||null,material_id:mat?.material_id||null},optical_material:optical,source_panel_id:s.native_id,source_edges:structuredClone(s.edges),texture_direction:s.texture_direction};
   if(s.role==='back')result.back_type='overlay_nails';
   if(s.role==='front')result.facade_component=true,result.door_index=s.door_index;
   if(s.front_vertices.length>4&&!s.native_profile)result.native_polygon={front:s.front_vertices.map(q=>transfer(it,s,q)),back:s.back_vertices.map(q=>transfer(it,s,q)),axes:s.axes};
   if(s.native_profile){result.native_profile=s.native_profile;result.length=Math.max(size.x,size.y);result.profile_axis=size.x>size.y?'x':'y';}
   if(s.cuts?.length)result.machining=s.cuts.map(c=>({kind:'led_groove',name:c.name,width_mm:v.light_system==='aq-4x8'?4:17.5,depth_mm:v.light_system==='aq-4x8'?8:6.5,trajectory:c.trajectory_world_surface.map(q=>transfer(it,s,q))}));
   return result;
  });
 }
 function facades(it){const v=info(it);if(!v)return [];const pp=parts(it);return Array.from({length:v.door_count},(_,i)=>{const row=pp.filter(p=>p.facade_component&&p.door_index===i),lo=[0,1,2].map((_,a)=>Math.min(...row.map(p=>p.position[axes[a]]-p.size[axes[a]]/2))),hi=[0,1,2].map((_,a)=>Math.max(...row.map(p=>p.position[axes[a]]+p.size[axes[a]]/2)));return {kind:'door',w:round(hi[0]-lo[0]),h:round(hi[1]-lo[1]),cx:round((hi[0]+lo[0])/2),cy:round((hi[1]+lo[1])/2),z:round((hi[2]+lo[2])/2),side:v.opening==='double'?(i?'right':'left'):v.opening};});}
 function adjustment(it){const v=info(it);return {kind:'wall_special_review',requires_manual_native_adjustment:it.width!==v.native_frame.size[0]||it.height!==v.native_frame.size[1]||it.depth!==v.native_frame.size[2]-3,source_warnings:v.warnings,native_dependency:v.native_dependency,shelf_centers_mm:shelfCenters(it),note:'Сохранены родные контуры, кромки и фурнитура FR3D. '+v.warnings.join(' ')+' После изменения размера проверить полки: центры '+shelfCenters(it).join('; ')+' мм от низа корпуса. Глубина 250–600 мм; пазы, фасады и доборы перемещаются по правилам родного фрагмента. После изменения глубины проверить пазы и полки в БАЗИС.'};}
 function pivot(it,index){const v=info(it),f=facades(it)[index];if(v.door_pivot){const q=transfer(it,{role:'front'},v.door_pivot);return {x:q[0],y:0,z:q[2]};}return {x:f.cx+(f.side==='left'?-1:1)*f.w/2,y:0,z:it.depth/2+2};}
 function hardware(it,p=model(info(it))){const v=info(it),items=p.hardware.items.map(h=>({...h}));if(v.family!=='corner'){const pp=parts(it),cuts=pp.filter(p=>p.type==='profile').map(p=>p.length),grooves=pp.flatMap(p=>p.machining||[]),length=grooves.reduce((n,c)=>n+Math.abs(c.trajectory.at(-1)[1]-c.trajectory[0][1]),0);items.push({key:'z1-profile',name:'Профиль фасадный Z1 · отрезки по модели',article:'Z1',quantity:round(cuts.reduce((a,b)=>a+b,0)/1000),unit:'m',cuts_mm:cuts});items.push({key:'led-upper',name:'Подсветка · метраж по пазам, комплект питания по монтажу',article:null,quantity:round(length/1000),unit:'m'});if(v.light_system==='lira-17.5x6.5')items.push({key:'light-profile-upper',name:'Профиль под паз 17,5 × 6,5 мм · подбор по монтажу',article:null,quantity:round(length/1000),unit:'m'});}return {...p.hardware,items};}
 function brief(it){const v=info(it);if(!v)return '';return family(v).label+' · '+(v.family==='corner'?'ЛДСП 18 мм · '+(v.execution==='handles'?'накладные ручки':'без ручек'):'Z1 · стекло 4 мм · две стеклянные полки · паз '+(v.light_system==='aq-4x8'?'4 × 8':'17,5 × 6,5')+' мм · '+({left:'подсветка слева',right:'подсветка справа',both:'подсветка с двух сторон'}[v.lighting]))+'. '+adjustment(it).note;}
 root.MF_WALL_SPECIAL=Object.freeze({variants,choice,info,family,families,model,dimensionError,available,select,parts,facades,pivot,shelfCenters,adjustment,hardware,brief});
})(globalThis);
