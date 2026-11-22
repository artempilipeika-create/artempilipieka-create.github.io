import lira from './wardrobe-lira-1708.json' with {type:'json'};
import {worldPoint} from './blank-bindings.mjs';

// The same local mounting plane is used for the groove, preview and native FR3D.
export function lightPlacement(panel,cut){
 const vertical=panel.blank_axis==='side',length=panel.blank_length_mm,width=panel.blank_width_mm;
 const start=cut.start??0,span=length-start-(cut.end??0);
 const z=(cut.edge==='x0'?1:-1)*(cut.offset+cut.width/2-width/2);
 const sign=vertical?(cut.face?-1:1):(cut.face?1:-1);
 return {vertical,sign,span,z,x:vertical?sign*panel.width/2:start-length/2,
  y:vertical?start:cut.face?panel.height:0};
}

export async function nativeLiraProfiles(items,request){
 const cabinets=new Map();
 for(const panel of items){
  for(const [index,cut] of (panel.blank_machining??[]).entries()){
   if(cut.lightSystem!=='lira-1708')continue;
   const id=panel.assistant_carcass?.group_id??panel.item_id;
   if(!cabinets.has(id))cabinets.set(id,[]);
   cabinets.get(id).push({panel,cut,index,mount:lightPlacement(panel,cut)});
  }
 }
 const result=[];
 for(const lines of cabinets.values()){
  const runs=lines.map(({panel,mount})=>({label:panel.name,system:'lira-1708',length:mount.span}));
  // Use the cabinet's actual purchasing cut plan: two short runs can share a 3 m bar.
  const quote=await request('/3d-assistant/lighting-estimate','POST',{runs});
  const stockByLine=new Map();
  for(const bar of quote.stock){
   const source=lira.profile.stock.find(s=>s.article===bar.article&&s.length_mm===bar.length);
   for(const index of bar.lines){
    if(!source||!lines[index]||stockByLine.has(index))throw Error('Некорректный раскрой профиля LIRA-1708.');
    stockByLine.set(index,source);
   }
  }
  for(const [line,{panel,cut,index,mount}] of lines.entries()){
   const stock=stockByLine.get(line);
   if(!stock||mount.span<=0||mount.span>stock.length_mm)throw Error('Не подобран хлыст LIRA-1708 для детали '+panel.name+'.');
   const rotation=panel.rotation??0,delta=worldPoint({x:mount.x,z:mount.z},rotation);
   result.push({name:'Профиль LIRA-1708 · '+mount.span+' мм · '+panel.name,
    wardrobe_lira:true,article:stock.article,source_file:stock.file,source_sha256:stock.sha,span_mm:mount.span,
    host_blank_id:panel.item_id,joined_panel_id:panel.item_id,cut_index:index,axis:panel.blank_axis,face:cut.face,
    rotation,position:{x:panel.x+delta.x,y:panel.elevation_mm+mount.y,z:panel.z+delta.z},elastic_resize:false});
  }
 }
 return result;
}
