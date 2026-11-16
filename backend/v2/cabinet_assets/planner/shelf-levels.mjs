// Heights are measured to the underside. Existing projects keep their original
// nominal shelf pitch (including glass aligned at the upper face).
export function shelfUndersides(spec, section, base, ceiling, thicknesses, floor, hasDrawers=false){
 const limits=spec.shelfLevels?.[section];
 const count=thicknesses.length;
 if(!count)return [];
 if(!limits?.some(Boolean)&&!hasDrawers){
   const free=ceiling-base-count*spec.thickness;
   if(free<(count+1)*60)throw Error('Для полок недостаточно высоты.');
   return thicknesses.map((t,i)=>base+Math.round((i+1)*free/(count+1))+(i+1)*spec.thickness-t);
 }
 const levels=limits??Array(count).fill(null);
 if(levels.length!==count)throw Error('Проверьте число высот полок в секции '+(section+1)+'.');
 const out=[];
 let top=base;
 function place(i,bottom){
   if(!Number.isInteger(bottom)||bottom<top+60||bottom+thicknesses[i]>ceiling-60)
     throw Error('Секция '+(section+1)+', полка '+(i+1)+': оставьте чистый проём от 60 мм сверху и снизу.');
   out.push(bottom);top=bottom+thicknesses[i];
 }
 for(let i=0;i<count;){
   if(levels[i]?.mode==='floor'){place(i,levels[i].mm-floor);i++;continue;}
   let end=i,used=0,spaces=1;
   while(end<count&&levels[end]?.mode!=='floor'){
     const level=levels[end];
     if(level!=null&&(level.mode!=='gap'||!Number.isInteger(level.mm)||level.mm<60))
       throw Error('Секция '+(section+1)+', полка '+(end+1)+': проверьте чистый проём.');
     used+=thicknesses[end]+(level?.mm??0);
     if(!level)spaces++;
     end++;
   }
   const boundary=end<count?levels[end].mm-floor:ceiling;
   const free=boundary-top-used;
   if(free<60*spaces)throw Error('Секция '+(section+1)+': для заданных полок не хватает '+Math.ceil(60*spaces-free)+' мм.');
   let distributed=0;
   for(;i<end;i++){
     let gap=levels[i]?.mm;
     if(gap==null){gap=Math.round((distributed+1)*free/spaces)-Math.round(distributed*free/spaces);distributed++;}
     place(i,top+gap);
   }
 }
 return out;
}
