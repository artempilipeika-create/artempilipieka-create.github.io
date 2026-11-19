import {columnOpenings,splitAt,splitKey} from './wardrobe-layout.mjs';
import {nicheOpenings} from './wardrobe-niches.mjs';
// Work from the original facade seam. Feeding the installed shelf height back
// into the seam would lift the same shelf again on every edit.
export function aboveGola(runs,left,width,bottom,thickness){
 let top=null;
 for(const run of runs){
  if(left>=run.right||left+width<=run.left)continue;
  const metalBottom=run.top-(run.kind==='S'?73:57);
  if(bottom>run.top+.000001||bottom+thickness<=metalBottom)continue;
  top=Math.max(top??bottom,run.top);
 }
 // Machined structural parts use half-millimetres. Always clear the metal.
 return top==null?null:Math.ceil((top-.000001)*2)/2;
}

export function installedShelfLevels(items,group){
 const prefix=group+':',roof=items.find(i=>i.item_id===prefix+'top');
 const levels=new Map();
 if(!roof||!items.some(i=>i.blank_binding?.gola_flush&&i.item_id.startsWith(prefix)))return levels;
 const floor=roof.elevation_mm+roof.height-roof.assistant_carcass.spec.height;
 for(const item of items)if(item.item_id.startsWith(prefix+'shelf-')){
  const y=item.elevation_mm-floor;
  levels.set(item.item_id.slice(prefix.length),{bottom:y,top:y+item.height});
 }
 return levels;
}

export function installedOpenings(rooms,heights,key,low=rooms[0]?.bottom,high=rooms.at(-1)?.top){
 if(!rooms.length)return [];
 return rooms.map((r,i)=>({...r,
  bottom:i===0?low:heights?.get(key(i-1))?.top??r.bottom,
  top:i===rooms.length-1?high:heights?.get(key(i))?.bottom??r.top
 }));
}

export function measuredRooms(spec,section,level,column,levels){
 const nominal=nicheOpenings(spec,section);
 const main=installedOpenings(nominal,levels,i=>'shelf-'+section+'-'+i);
 const zone=column==null?null:splitAt(spec,section,level),col=zone?.columns?.[column];
 if(!col)return main;
 const rooms=columnOpenings(nominal[level].bottom,nominal[level].top,col,spec.thickness);
 return installedOpenings(rooms,levels,i=>'shelf-'+splitKey(zone)+'-'+column+'-'+i,main[level].bottom,main[level].top);
}
