import {localPoint,worldPoint} from './blank-bindings.mjs';
import {updateBlank} from './blanks-model.mjs';
import {plinthFoot,plinthPanel} from './plinth-options.mjs';

function span(item,start,width){
 const p=localPoint(item,item.rotation);
 return updateBlank(item,{blank_length_mm:width,...worldPoint({x:start+width/2,z:p.z},item.rotation)});
}

// Reconstruct editable cabinet segments before resizing a cabinet in an existing row.
export function splitPlinths(items){
 // Older test projects used the entire foot height for the finished board.
 items=items.map(item=>{
  const meta=item.assistant_carcass;
  if(!meta||item.item_id!==meta.group_id+':plinth')return item;
  const leg=plinthFoot(meta.spec);
  if(!leg||item.height!==leg.height||item.blank_width_mm!==leg.height)return item;
  return updateBlank(item,{blank_width_mm:plinthPanel(meta.spec).height});
 });
 if(!items.some(it=>it.blank_plinth_run?.length))return items;
 const groups=new Map(items.filter(it=>it.assistant_carcass).map(it=>[it.assistant_carcass.group_id,it.assistant_carcass]));
 return items.flatMap(item=>{
  if(!item.blank_plinth_run?.length)return [item];
  const {blank_plinth_run:ids,...board}=item;
  let start=localPoint(item,item.rotation).x-item.width/2;
  const segments=ids.map(id=>{
   const meta=groups.get(id),panel=meta&&plinthPanel(meta.spec);
   if(!panel)throw Error('Для общего цоколя отсутствует корпус. Восстановите шкаф в проекте.');
   const it=span({...board,item_id:id+':plinth',assistant_carcass:meta},start,panel.width);
   start+=panel.width;return it;
  });
  if(segments.reduce((sum,it)=>sum+it.width,0)!==item.width)throw Error('Длина общего цоколя изменена вручную. Проверьте его перед пересборкой.');
  return segments;
 });
}

export function joinPlinths(items){
 const rows=new Map(),replacements=new Map();
 for(const it of items){
  if(!it.assistant_carcass||it.item_id!==it.assistant_carcass.group_id+':plinth'||it.production_note||it.blank_hook||it.blank_edge_code!=='1111')continue;
  const p=localPoint(it,it.rotation);
  const row=JSON.stringify([it.rotation,p.z,it.elevation_mm,it.height,it.depth,it.body_variant_id,it.blank_edge_thickness_mm]);
  if(!rows.has(row))rows.set(row,[]);
  rows.get(row).push({it,start:p.x-it.width/2});
 }
 for(const row of rows.values()){
  row.sort((a,b)=>a.start-b.start);
  let first,end,piece;
  for(const {it,start} of row){
   if(!first||start!==end||start+it.width-first.start>3000){first={it,start};piece=it;}
   else{
    const ids=piece.blank_plinth_run??[first.it.assistant_carcass.group_id];
    piece={...span(first.it,first.start,start+it.width-first.start),blank_plinth_run:[...ids,it.assistant_carcass.group_id]};
    replacements.set(first.it,piece);replacements.set(it,null);
   }
   end=start+it.width;
  }
 }
 return items.flatMap(it=>replacements.has(it)?replacements.get(it)??[]:it);
}
