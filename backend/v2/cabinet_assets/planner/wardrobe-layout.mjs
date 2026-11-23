import {choice,defaultShelf} from './shelf-choices.mjs';

// The first three sections keep their historical item IDs. A fourth section
// appends eleven levels per column after the two original blocks of 33.
export const rightBankOffset=33;
export function nicheSlot(section,level,column=0){
 return section===3?66+level+11*column:section+3*level+rightBankOffset*column;
}
export const sectionOf=slot=>slot<66?slot%3:3;
export const levelOf=slot=>slot<66?Math.floor((slot%rightBankOffset)/3):(slot-66)%11;
export const isRightBank=slot=>slot<66?slot>=rightBankOffset:slot>=77;
export const splitAt=(s,section,level)=>s.nicheSplits?.find(z=>z.section===section&&z.level===level);
export const localBaseShelf=(s,section)=>s.bottomFit==='none'&&Boolean(s.drawerBanks?.[nicheSlot(section,0)]);
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

export function sectionWidths(s){
  const inner=s.width-2*s.thickness;
  if(s.dividerPositions!=null){
    if(!Array.isArray(s.dividerPositions)||s.dividerPositions.length!==s.sections-1||
       !s.dividerPositions.every(Number.isInteger))throw Error('Задайте положение каждой внутренней стойки в целых мм.');
    let start=0;
    return [...s.dividerPositions,inner].map(end=>{
      const width=end-start;start=end+s.thickness;return width;
    });
  }
  const clear=inner-(s.sections-1)*s.thickness;
  return Array.from({length:s.sections},(_,i)=>Math.floor(clear/s.sections)+(i<clear%s.sections?1:0));
}

export function sectionSpans(s){
 let x=0;
 return sectionWidths(s).map((width,i)=>{
  const end=x+width+s.thickness*(1+(i===0?.5:0)+(i===s.sections-1?.5:0));
  const span={left:x,right:end};x=end;return span;
 });
}
