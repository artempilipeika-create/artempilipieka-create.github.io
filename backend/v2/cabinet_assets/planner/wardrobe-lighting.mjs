import systems from './vitrine-lighting.json' with {type:'json'};
import {panelMachiningPlan} from './panel-machining.mjs';
import {blankEdgeCode} from './furniture-core.mjs';

export const lightingSystems=systems;
export function lightFaces(key){
 if(key==='left')return [0];
 if(key==='right')return [1];
 if(/^divider-\d+$|^niche-\d+-\d+-divider$/.test(key))return [0,1];
 if(key==='top'||key==='bottom'||key.startsWith('shelf-'))return [0,1];
 return [];
}
export function canLight({key,item}){
 return lightFaces(key).length>0&&item.blank_thickness_mm>=10&&(!item.blank_shelf||item.blank_shelf.startsWith('board/'));
}
// Work in the finished panel's own length and depth. A shelf may have a setback,
// a side may run to the floor, and the two sides may have different depths.
export function lightSpans(part,parts,face){
 const p=part.item,length=p.blank_length_mm;
 if(p.blank_axis!=='side')return {range:[0,length],rooms:[]};
 const rel=q=>q.item.elevation_mm-p.elevation_mm;
 const bottom=parts.find(q=>q.key==='bottom'),roof=parts.find(q=>q.key==='top');
 const low=bottom?Math.max(0,rel(bottom)+bottom.item.height):0;
 const high=roof?Math.min(length,rel(roof)):length;
 const bound=face===0?'left_id':'right_id';
 const shelves=parts.filter(q=>q.key.startsWith('shelf-')&&q.item.blank_binding?.[bound]===p.item_id)
  .sort((a,b)=>rel(a)-rel(b));
 let start=low;
 const rooms=[];
 for(const q of shelves){
  if(rel(q)>start&&rel(q)<high)rooms.push({key:q.key,low:start,high:rel(q)});
  start=Math.max(start,rel(q)+q.item.height);
 }
 if(high>start)rooms.push({key:'top',low:start,high});
 return {range:[low,high],rooms};
}
export function lightingCut(part,parts,setting){
 const p=part.item,system=systems[setting.system];
 if(!system||!canLight(part)||!lightFaces(part.key).includes(setting.face))throw Error('Выберите пласть и модель подсветки для этой детали.');
 const width=system.groove_width_mm,depth=system.groove_depth_mm;
 const spans=lightSpans(part,parts,setting.face),room=spans.rooms.find(r=>r.key===setting.niche);
 if(setting.niche&&!room)throw Error('Для подсветки выберите существующую нишу.');
 const [low,high]=room?[room.low,room.high]:spans.range;
 const across=p.blank_width_mm,length=p.blank_length_mm;
 const centered=setting.anchor==='center';
 const offset=centered?(across-width)/2:setting.offset;
 if(!['front','back','center'].includes(setting.anchor)||!Number.isFinite(offset)||offset<0)throw Error('Проверьте расстояние до ближнего края паза подсветки.');
 const start=low+(setting.start??0),end=length-high+(setting.end??0);
 const op={kind:'groove',edge:setting.anchor==='back'?'x0':'x1',face:setting.face,width,depth,offset,lightSystem:setting.system};
 if(start)op.start=start;
 if(end)op.end=end;
 panelMachiningPlan(op,across,length,p.blank_thickness_mm);
 return op;
}
const interval=(op,width)=>op.edge==='x1'?width-op.offset-op.width:op.offset;
export function applyLighting(parts,settings){
 for(const part of parts){
  if(!canLight(part)||!settings[part.key]?.length)continue;
  const p=part.item;
  const cuts=[...(p.blank_machining??[])];
  for(const setting of settings[part.key]){
   let op;
   try{op=lightingCut(part,parts,setting);}catch(error){throw Error(part.label+' · '+error.message);}
   const w=p.blank_width_mm,l=p.blank_length_mm,x=interval(op,w);
   if(cuts.some(c=>{
    if(!['x0','x1'].includes(c.edge)||!['rabbet','groove'].includes(c.kind)||c.face!==op.face&&c.depth+op.depth<p.blank_thickness_mm)return false;
    const other=interval({...c,offset:c.offset??0},w);
    return x<other+c.width&&x+op.width>other&&(op.start??0)<l-(c.end??0)&&(c.start??0)<l-(op.end??0);
   }))throw Error(part.label+' · паз подсветки пересекает другую выборку. Измените отступ или длину.');
   cuts.push(op);
  }
  if(cuts.length>32)throw Error(part.label+' · допустимо до 32 обработок.');
  p.blank_machining=cuts;p.blank_edge_code=blankEdgeCode(p);
 }
}

export function panelLightMeshes(factory,group,it,ghost){
 const vertical=it.blank_axis==='side';
 for(const op of it.blank_machining??[]){
  if(!op.lightSystem)continue;
  const L=it.blank_length_mm,W=it.blank_width_mm,lo=op.start??0,hi=L-(op.end??0);
  const z=(op.edge==='x0'?1:-1)*(op.offset+op.width/2-W/2);
  const sign=vertical?(op.face?-1:1):(op.face?1:-1);
  function strip(role,width,thickness,above){
   const length=hi-lo,along=(hi+lo)/2;
   const surface=vertical?sign*it.width/2:op.face?it.height:0;
   const normal=surface+sign*above;
   const mesh=vertical?factory.box(group,role,thickness,length,width,normal,along,z,null,ghost,0):
    factory.box(group,role,length,thickness,width,along-L/2,normal,z,null,ghost,0);
   if(mesh)Object.assign(mesh.userData,{visualOnly:true,wardrobeLight:op.lightSystem});
  }
  if(op.lightSystem==='lira-17.5x6.5'){
   strip('lightProfile',24.4,.6,.3);strip('led',14,.3,.75);
  }else strip('led',op.width,.5,-.23);
 }
}
