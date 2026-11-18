import {choice,defaultShelf} from './shelf-choices.mjs';

// A primary opening keeps its existing drawer slot. The right-hand bank has the
// same section/level indices in the second half of the slot table.
export const rightBankOffset=33;
export const levelOf=slot=>Math.floor((slot%rightBankOffset)/3);
export const splitAt=(s,section,level)=>s.nicheSplits?.find(z=>z.section===section&&z.level===level);
export const localBaseShelf=(s,section)=>s.bottomFit==='none'&&Boolean(s.drawerBanks?.[section]);
export const openingBase=(s,section)=>s.bottomFit==='none'?(localBaseShelf(s,section)?(s.braceOffset??0)+100+s.thickness:0):s.thickness;
export const splitKey=z=>'niche-'+z.section+'-'+z.level;
export function columnWidths(split,width){
 const left=split.leftWidth??Math.ceil((width-18)/2),right=width-left-18;
 if(!Number.isInteger(left)||Math.min(left,right)<100)throw Error('Для перегородки нужны две чистые ширины от 100 мм.');
 return [left,right];
}
export function clearGaps(height,thicknesses,locks){
 const count=thicknesses.length+1;
 if(locks.length!==count||locks.some(n=>n!=null&&(!Number.isInteger(n)||n<60)))throw Error('Чистая высота проёма должна быть от 60 мм.');
 const free=height-thicknesses.reduce((sum,t)=>sum+t,0)-locks.reduce((sum,n)=>sum+(n??0),0);
 const slots=locks.filter(n=>n==null).length;
 if(!slots&&free!==0||free<slots*60)throw Error('Заданным проёмам не хватает места или требуется один проём по остатку.');
 let i=0;
 return locks.map(n=>{
   if(n!=null)return n;
   const before=Math.round(i*free/slots);i++;
   return Math.round(i*free/slots)-before;
 });
}
export function columnOpenings(bottom,top,column,t){
 const locks=column.gaps,ts=locks.slice(1).map((_,i)=>choice(column.choices?.[i]??defaultShelf,t).thickness);
 const gaps=clearGaps(top-bottom,ts,locks);
 return gaps.map((gap,i)=>{const start=bottom;bottom+=gap+(ts[i]??0);return {bottom:start,top:start+gap};});
}
