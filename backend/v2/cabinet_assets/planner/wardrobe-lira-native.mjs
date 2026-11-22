import lira1708 from './wardrobe-lira-1708.json' with {type:'json'};
import vitrine from './vitrine-lighting.json' with {type:'json'};
import {worldPoint} from './blank-bindings.mjs';

const profiles=new Map([['lira-17.5x6.5',vitrine['lira-17.5x6.5']],['lira-1708',lira1708]]);

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
   if(!profiles.has(cut.lightSystem))continue;
   const id=panel.assistant_carcass?.group_id??panel.item_id;
   if(!cabinets.has(id))cabinets.set(id,[]);
   cabinets.get(id).push({panel,cut,index,mount:lightPlacement(panel,cut)});
  }
 }
 const result=[];
 for(const lines of cabinets.values()){
  const runs=lines.map(({panel,cut,mount})=>({label:panel.name,system:cut.lightSystem,length:mount.span}));
  // Use the cabinet's actual purchasing cut plan: two short runs can share a 3 m bar.
  const quote=await request('/3d-assistant/lighting-estimate','POST',{runs});
  const stockByLine=new Map();
  for(const bar of quote.stock){
   for(const index of bar.lines){
    const model=profiles.get(lines[index]?.cut.lightSystem);
    const source=model?.profile.stock.find(s=>s.article===bar.article&&s.length_mm===bar.length);
    if(!source||stockByLine.has(index))throw Error('Некорректный раскрой профиля LIRA.');
    stockByLine.set(index,source);
   }
  }
  for(const [line,{panel,cut,index,mount}] of lines.entries()){
   const stock=stockByLine.get(line);
   const series=profiles.get(cut.lightSystem).label.split(' ')[0];
   if(!stock||!Number.isFinite(mount.span)||mount.span<=0||mount.span>stock.length_mm)throw Error('Не подобран хлыст '+series+' для детали '+panel.name+'.');
   const rotation=panel.rotation??0,delta=worldPoint({x:mount.x,z:mount.z},rotation);
   result.push({name:'Профиль '+series+' · '+mount.span+' мм · '+panel.name,
    wardrobe_lira:true,light_system:cut.lightSystem,article:stock.article,source_file:stock.file,source_sha256:stock.sha,span_mm:mount.span,
    host_blank_id:panel.item_id,joined_panel_id:panel.item_id,cut_index:index,axis:panel.blank_axis,face:cut.face,
    rotation,position:{x:panel.x+delta.x,y:panel.elevation_mm+mount.y,z:panel.z+delta.z},elastic_resize:false});
  }
 }
 return result;
}
