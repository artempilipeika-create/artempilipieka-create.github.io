import {footHeight} from './plinth-options.mjs';
import {anchoredShelf,doorAnchorIndex,sectionSpans} from './wardrobe-door-layout.mjs';
import {rodCatalogue} from './wardrobe-rods.mjs';
import {sectionWidths} from './carcass-model.mjs';
import {measuredRooms} from './wardrobe-gola-shelves.mjs';
import {clearGaps,columnWidths,isRightBank,levelOf,nicheSlot,sectionOf,splitAt} from './wardrobe-layout.mjs';
import {nicheOpenings,trimBanks} from './wardrobe-niches.mjs';
import {defaultShelf,shelfRows} from './shelf-choices.mjs';
import {resizeDividerChoices} from './wardrobe-questionnaire.mjs';

export function resizeSections(f,n){
 if(!Number.isInteger(n)||n<1||n>4)throw Error('Выберите от одной до четырёх секций.');
 const oldCount=f.sections;
 if(n===oldCount)return;
 const d=f.front?.division;
 const joined=d&&n>oldCount?anchoredShelf(f):null;
 if(d&&d.section>=n){
   const match=anchoredShelf(f).matches.find(a=>a.section<n);
   if(!match)throw Error('Сначала выберите другую перегородку на шаге «Фасады».');
   Object.assign(d,{section:match.section,shelf:match.shelf});
 }
 if(f.dividerPositions){
   const positions=f.dividerPositions.slice(0,n-1);
   if(n>oldCount){
     const start=positions.length?positions.at(-1)+f.thickness:0;
     const lastCount=n-oldCount+1,remaining=f.width-2*f.thickness-start-(lastCount-1)*f.thickness;
     let x=start;
     for(let i=0;i<lastCount-1;i++){x+=Math.floor(remaining/lastCount)+(i<remaining%lastCount?1:0);positions.push(x);x+=f.thickness;}
   }
   if(n===1)delete f.dividerPositions;else f.dividerPositions=positions;
 }
 f.sections=n;
 f.sectionShelves=Array.from({length:n},(_,i)=>f.sectionShelves[i]??0);
 for(const key of ['shelfLevels','gapLocks','topGaps']){
   if(f[key])f[key]=Array.from({length:n},(_,i)=>f[key][i]??(key==='topGaps'?null:[]));
 }
 if(joined){
   const spans=sectionSpans(f),middle=n===2?spans[0].right:f.width/2;
   for(let section=oldCount;section<n;section++){
     const bay=spans[section];
     if(d.scope==='left'&&bay.left>=middle||d.scope==='right'&&bay.right<=middle)continue;
     f.sectionShelves[section]=1;
     f.shelfLevels??=f.sectionShelves.map(k=>Array(k).fill(null));
     f.shelfLevels[section]=[{mode:'floor',mm:joined.y+(f.elevation??0)+footHeight(f)}];
   }
 }
 if(f.shelfChoices)f.shelfChoices=shelfRows(f);
 if(f.rods){f.rods=f.rods.filter(r=>r.section<n);if(!f.rods.length)delete f.rods;}
 if(f.nicheSplits)f.nicheSplits=f.nicheSplits.filter(z=>z.section<n);
 if(f.drawerBanks)f.drawerBanks=trimBanks(f.drawerBanks.map((bank,i)=>sectionOf(i)<n?bank:null),n);
 resizeDividerChoices(f);
}

// A plain section redistributes evenly. Once it contains fittings or locked
// openings, change the count in free space and retain their physical datums.
export function setSectionShelfCount(f,section,count){
 const previous=f.sectionShelves[section];
 if(!Number.isInteger(count)||count<0||count>10)throw Error('Выберите от 0 до 10 полок.');
 if(count===previous)return [];
 const locks=f.gapLocks?.[section]??[];
 const occupied=new Set(locks);
 const d=f.front?.division;
 const anchor=doorAnchorIndex(f,section);
 for(const rod of f.rods??[])if(rod.section===section)occupied.add(rod.level);
 for(const zone of f.nicheSplits??[])if(zone.section===section)occupied.add(zone.level);
 for(const [slot,bank] of (f.drawerBanks??[]).entries())if(bank&&sectionOf(slot)===section)occupied.add(levelOf(slot));
 const legacy=f.drawerBanks?.[nicheSlot(section,0)];
 if(legacy&&!legacy.layout&&occupied.size>1)throw Error('Сначала привяжите старый блок шуфляд к выбранной нише.');
 if(anchor===-1&&(!occupied.size||legacy&&!legacy.layout)){
   const changes=[];
   for(let level=previous-1;level>=count;level--)changes.push({level,delta:-1});
   f.sectionShelves[section]=count;
   if(f.shelfLevels)f.shelfLevels[section]=Array.from({length:count},(_,j)=>f.shelfLevels[section]?.[j]??null);
   if(f.shelfChoices)f.shelfChoices=shelfRows(f);
   if(f.topGaps)f.topGaps[section]=null;
   if(legacy?.shelvesBelow>count)legacy.shelvesBelow=count;
   return changes;
 }
 const rooms=nicheOpenings(f,section);
 if(count>previous){
   let needed=count-previous;
   const free=rooms.map(({top,bottom},level)=>({level,height:top-bottom}))
     .filter(r=>!occupied.has(r.level)).sort((a,b)=>b.height-a.height||b.level-a.level);
   const changes=[];
   for(const room of free){
     const delta=Math.min(needed,Math.floor((room.height-60)/(60+f.thickness)));
     if(delta>0){changes.push({level:room.level,delta});needed-=delta;}
     if(!needed)break;
   }
   if(needed)throw Error('Для такого количества полок мало места в свободных проёмах.');
   changes.sort((a,b)=>b.level-a.level);
   for(const {level,delta} of changes)insertShelves(f,{section,level,column:null},delta);
   return changes;
 }
 const remove=[];
 for(let level=previous-1;level>=0&&remove.length<previous-count;level--){
   if(level!==anchor&&!occupied.has(level)&&!occupied.has(level+1))remove.push(level);
 }
 if(remove.length!==previous-count)throw Error('Минимум полок в этой секции — '+(previous-remove.length)+'. Они ограничивают установленное наполнение или закреплённый проём.');
 const shifted=level=>level-remove.filter(index=>index<level).length;
 if(d?.section===section)d.shelf=shifted(d.shelf);
 const newLocks=locks.map(shifted),sizes=[];
 let bottom=rooms[0].bottom;
 for(let i=0;i<previous;i++){
   if(remove.includes(i))continue;
   sizes.push(rooms[i].top-bottom);bottom=rooms[i+1].bottom;
 }
 sizes.push(rooms.at(-1).top-bottom);
 if(f.shelfChoices)f.shelfChoices[section]=shelfRows(f)[section].filter((_,i)=>!remove.includes(i));
 if(f.gapLocks)f.gapLocks[section]=newLocks;
 if(f.drawerBanks){
   const banks=[];
   f.drawerBanks.forEach((bank,slot)=>{
     if(bank)banks[sectionOf(slot)===section?nicheSlot(section,shifted(levelOf(slot)),Number(isRightBank(slot))):slot]=bank;
   });
   f.drawerBanks=trimBanks(banks,f.sections);
 }
 for(const rod of f.rods??[])if(rod.section===section)rod.level=shifted(rod.level);
 for(const zone of f.nicheSplits??[])if(zone.section===section)zone.level=shifted(zone.level);
 f.sectionShelves[section]=count;
 writeHeights(f,section,null,sizes,newLocks);
 return remove.map(level=>({level,delta:-1}));
}

export function cellGeometry(f,cell,levels){
 const {section,level}=cell,widths=sectionWidths(f);
 const zone=splitAt(f,section,level),local=zone!=null&&cell.column!=null;
 const column=local?zone.columns?.[cell.column]:null;
 const rooms=measuredRooms(f,section,level,cell.column,levels);
 const index=column?cell.opening:level;
 const sizes=rooms.map(room=>room.top-room.bottom);
 const locks=column?column.locks??[]:f.gapLocks?.[section]??[];
 return {zone,column,rooms,index,sizes,locks,widths:local?columnWidths(zone,widths[section]):widths,
   widthIndex:local?cell.column:section,local};
}

export function setClearWidth(f,cell,value){
 const {widths,widthIndex:i,local,zone}=cellGeometry(f,cell);
 if(widths.length===1)throw Error('Ширина этого проёма задаётся шириной корпуса.');
 const other=i<widths.length-1?i+1:i-1,minimum=local?100:100+2*(f.shelfGap??0);
 const max=widths[i]+widths[other]-minimum;
 if(!Number.isInteger(value)||value<minimum||value>max)throw Error('Введите чистую ширину от '+minimum+' до '+max+' мм.');
 widths[other]+=widths[i]-value;widths[i]=value;
 if(local){zone.leftWidth=widths[0];return;}
 let x=0;
 f.dividerPositions=widths.slice(0,-1).map(w=>{x+=w;const edge=x;x+=f.thickness;return edge;});
}

function writeHeights(f,section,column,sizes,locks){
 // Leave one unlocked opening to take any subsequent change in carcass height.
 const free=sizes.findLastIndex((_,i)=>!locks.includes(i));
 const gaps=sizes.map((v,i)=>i===free?null:v);
 if(column){column.gaps=gaps;return;}
 f.shelfLevels??=f.sectionShelves.map(n=>Array(n).fill(null));
 f.shelfLevels[section]=gaps.slice(0,-1).map(mm=>mm==null?null:{mode:'gap',mm});
 f.topGaps??=Array(f.sections).fill(null);
 f.topGaps[section]=gaps.at(-1);f.clearLayout=true;
}
export function heightLimits(f,cell){
 const data=cellGeometry(f,cell),{sizes,index,locks,column}=data;
 const other=index<sizes.length-1?index+1:index-1;
 const legacy=f.drawerBanks?.[nicheSlot(cell.section,0)];
 let reason='';
 if(other<0)reason=column?'Высоту задают границы ниши с перегородкой.':'Высоту задают дно и крыша корпуса.';
 else if(locks.includes(index)||locks.includes(other))reason='Для перемещения полки снимите фиксацию размера.';
 else if(!column&&legacy&&!legacy.layout)reason='Положение задаётся в параметрах существующего блока шуфляд.';
 else if(!column&&f.drawerBanks?.[nicheSlot(cell.section,other)])reason='Эта полка ограничивает соседний блок шуфляд.';
 return {...data,other,min:60,max:other<0?sizes[index]:sizes[index]+sizes[other]-60,reason};
}
export function toggleHeightLock(f,cell){
 const {index,sizes,column,locks}=cellGeometry(f,cell);
 const next=locks.includes(index)?locks.filter(i=>i!==index):[...locks,index];
 if(column)column.locks=next;
 else{f.gapLocks??=f.sectionShelves.map(()=>[]);f.gapLocks[cell.section]=next;}
 writeHeights(f,cell.section,column,sizes,next);
}
export function setClearHeight(f,cell,value){
 const {sizes,index,other,locks,column,min,max,reason}=heightLimits(f,cell);
 if(value===sizes[index])return;
 if(reason)throw Error(reason);
 if(!Number.isInteger(value)||value<min||value>max)throw Error('Введите чистую высоту от '+min+' до '+max+' мм.');
 sizes[other]+=sizes[index]-value;sizes[index]=value;
 writeHeights(f,cell.section,column,sizes,locks);
}

export function insertShelves(f,cell,count){
 const {section,level}=cell;
 const {sizes,index,column,zone,locks}=cellGeometry(f,cell);
 if(!Number.isInteger(count)||count<1||sizes.length-1+count>10)throw Error('В колонке может быть до десяти полок.');
 if(locks.includes(index))throw Error('Снимите фиксацию высоты выбранной ниши.');
 const legacy=f.drawerBanks?.[nicheSlot(section,0)];
 if(!column&&(zone||f.drawerBanks?.[nicheSlot(section,level)]||legacy&&!legacy.layout))throw Error('Для полок выберите свободную нишу.');
 const affected=(f.rods??[]).filter(r=>r.section===section&&(column?r.level===level&&r.column===cell.column:true));
 const hits=affected.filter(r=>column?r.opening===index:r.level===level);
 const gaps=clearGaps(sizes[index],Array(count).fill(f.thickness),Array(count+1).fill(null));
 // Reassign a rail in the divided opening to the new opening containing its original axis.
 const changes=hits.map(rod=>{
   const axis=rod.anchor==='top'?sizes[index]-rod.offset:rod.offset;
   const bounds=rodCatalogue[rod.article].bounds;
   let base=0;
   for(const [i,gap] of gaps.entries()){
     if(axis+bounds[0]>=base&&axis+bounds[1]<=base+gap)return [rod,i,rod.anchor==='top'?base+gap-axis:axis-base];
     base+=gap+f.thickness;
   }
   throw Error('Новая полка пересекает держатель штанги. Сначала переместите штангу внутри ниши.');
 });
 const field=column?'opening':'level';
 for(const rod of affected)if(rod[field]>index)rod[field]+=count;
 for(const [rod,i,offset] of changes){rod[field]=index+i;rod.offset=offset;}
 const newLocks=locks.map(i=>i>index?i+count:i);
 sizes.splice(index,1,...gaps);
 if(column){
   if(column.choices)column.choices.splice(index,0,...Array(count).fill(defaultShelf));
   if(column.locks)column.locks=newLocks;
 }else{
   const rows=shelfRows(f);
   rows[section].splice(level,0,...Array(count).fill(defaultShelf));
   const d=f.front?.division;
   if(d?.section===section&&d.shelf>=level)d.shelf+=count;
   if(f.shelfChoices)f.shelfChoices=rows;
   if(f.gapLocks)f.gapLocks[section]=newLocks;
   if(f.drawerBanks){
     const banks=[];
     f.drawerBanks.forEach((bank,slot)=>{
       if(bank)banks[sectionOf(slot)===section&&levelOf(slot)>level?nicheSlot(section,levelOf(slot)+count,Number(isRightBank(slot))):slot]=bank;
     });
     f.drawerBanks=trimBanks(banks,f.sections);
   }
   for(const split of f.nicheSplits??[])if(split.section===section&&split.level>level)split.level+=count;
   f.sectionShelves[section]+=count;
 }
 writeHeights(f,section,column,sizes,newLocks);
}

// Part keys encode the shelf or niche index. Carry existing panel assignments to
// the same physical part when inserting below it inside a saved wardrobe.
export function keysAfterInsertion(keys,cell,count){
 if(!keys)return keys;
 const {section,level,column,opening}=cell;
 const result=new Map();
 for(const [key,original] of keys){
   let moved=key;
   if(column!=null){
     const local=/^shelf-niche-(\d+)-(\d+)-(\d+)-(\d+)$/.exec(key);
     if(local&&+local[1]===section&&+local[2]===level&&+local[3]===column&&+local[4]>=opening)moved=key.slice(0,key.lastIndexOf('-')+1)+(+local[4]+count);
   }else{
     moved=key.replace(/^shelf-(\d+)-(\d+)$/,(all,s,i)=>+s===section&&+i>=level?'shelf-'+s+'-'+(+i+count):all)
       .replace(/^(shelf-)?niche-(\d+)-(\d+)-/,(all,prefix,s,i)=>+s===section&&+i>level?(prefix??'')+'niche-'+s+'-'+(+i+count)+'-':all)
       .replace(/^drawer-(\d+)-/,(all,id)=>sectionOf(+id)===section&&levelOf(+id)>level?'drawer-'+nicheSlot(section,levelOf(+id)+count,Number(isRightBank(+id)))+'-':all);
   }
   result.set(moved,original);
 }
 return result;
}
