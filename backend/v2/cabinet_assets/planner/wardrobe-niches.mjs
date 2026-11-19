import {shelfUndersides} from './shelf-levels.mjs';
import {choice,defaultShelf,shelfRows} from './shelf-choices.mjs';
import {levelOf,openingBase,nicheSlot,sectionOf} from './wardrobe-layout.mjs';
import {footHeight} from './plinth-options.mjs';

export {nicheSlot};
export const mm=value=>Math.round(value*1000)/1000;
export const mmText=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:3});

export function openingLabel(level,count){
  if(!count)return 'Весь проём';
  if(level===0)return 'Под полкой 1';
  if(level===count)return 'Над полкой '+count;
  return 'Между полками '+level+' и '+(level+1);
}

export function nicheOpenings(spec,section){
  const count=spec.sectionShelves?.[section]??spec.shelves;
  const thick=Array.from({length:count},(_,i)=>choice(spec.shelfChoices?.[section]?.[i]??defaultShelf,spec.thickness).thickness);
  const ceiling=spec.height-spec.thickness;
  const levels=shelfUndersides(spec,section,openingBase(spec,section),ceiling,thick,(spec.elevation??0)+footHeight(spec));
  return [...levels,ceiling].map((top,i)=>({
    bottom:i?levels[i-1]+thick[i-1]:openingBase(spec,section),top,
    overlayBottom:i?Math.round(levels[i-1]+thick[i-1]/2):Math.max(0,openingBase(spec,section)-spec.thickness),
    overlayTop:i<count?Math.round(top+thick[i]/2):spec.height
  }));
}

export function trimBanks(banks,sections){
  const result=Array.from(banks,entry=>entry??null);
  while(result.length>sections&&!result.at(-1))result.pop();
  while(result.length<sections)result.push(null);
  return result;
}

export function fitNicheBanks(spec,banks){
  const result=trimBanks(banks,spec.sections),openings=new Map();
  return result.map((bank,slot)=>{
    if(!bank)return null;
    const section=sectionOf(slot),level=levelOf(slot);
    if(section>=spec.sections)throw Error('Проверьте секцию блока шуфляд.');
    if(!bank.layout){
      if(level)throw Error('Свободный блок шуфляд должен быть привязан к своей секции.');
      return bank;
    }
    if(level&&result[nicheSlot(section,0)]&&!result[nicheSlot(section,0)].layout)throw Error('Сначала привяжите существующий блок этой секции к нише.');
    if(!openings.has(section))openings.set(section,nicheOpenings(spec,section));
    const opening=openings.get(section)[level];
    if(!opening)throw Error('Секция '+(section+1)+': для выбранной ниши не хватает полок.');
    const inside=bank.kind==='internal',base=inside?opening.bottom:opening.overlayBottom,top=inside?opening.top:opening.overlayTop;
    return {...bank,bottomOffset:base-(inside?spec.thickness:0),height:top-base};
  });
}

export const frontEdgeGap=1.5, coverClearance=30;
export const topReveal=bank=>bank.coverFixing?coverClearance:frontEdgeGap;
export const isInternalNiche=bank=>bank?.kind==='internal'&&Boolean(bank.layout);

// Called on questionnaire data only. Previously saved assemblies keep their original
// geometry until the manager applies the recalculated wardrobe.
export function prepareDrawerCovers(spec){
  const rows=shelfRows(spec);
  for(const [slot,bank] of (spec.drawerBanks??[]).entries()){
    if(!bank?.layout||!isInternalNiche(bank)&&!spec.drawerFixing)continue;
    const section=sectionOf(slot),level=levelOf(slot),row=rows[section];
    if(!row||level>row.length)throw Error('Для выбранной ниши не хватает полок.');
    const previous=row[level];
    const fixing=spec.drawerFixing??bank.coverFixing??(previous==='board/confirmat'?'confirmat':'cam_dowel');
    if(bank.kind==='internal')bank.coverFixing=fixing;
    if(!['cam_dowel','confirmat'].includes(fixing))throw Error('Выберите крепление полки над шуфлядами.');
    if(previous===undefined||!previous.startsWith('board/')||spec.drawerFixing&&level>0&&!row[level-1].startsWith('board/')){
      const openings=nicheOpenings({...spec,shelfChoices:rows},section);
      const floor=(spec.elevation??0)+footHeight(spec);
      spec.shelfLevels??=spec.sectionShelves.map(n=>Array(n).fill(null));
      spec.shelfLevels[section]=openings.slice(0,-1).map(room=>({mode:'floor',mm:room.top+floor}));
      if(previous===undefined){
        if(row.length>=10)throw Error('Выберите нишу под существующей полкой.');
        spec.shelfLevels[section].push({mode:'floor',mm:openings[level].top-60-spec.thickness+floor});
        spec.sectionShelves[section]++;
        spec.shelves=Math.max(...spec.sectionShelves);
      }
    }
    row[level]='board/'+fixing;
    if(spec.drawerFixing&&level>0)row[level-1]='board/'+fixing;
  }
  if(rows.some(row=>row.some(value=>value!==defaultShelf)))spec.shelfChoices=rows;
  return rows;
}

export function fittedFaceHeights(bank,section){
  const count=bank.faces.length,gap=bank.gap;
  if(!Number.isFinite(gap)||gap<0||gap>3000||mm(gap)!==gap)throw Error('Секция '+section+': введите зазор от 0 до 3000 мм.');
  // Perimeter reveals remain independent of the gap between adjacent fronts.
  const available=mm(bank.height-frontEdgeGap-topReveal(bank)-gap*(count-1));
  const fixed=bank.faces.reduce((sum,face)=>sum+(face.height??0),0);
  const remaining=mm(available-fixed);
  if(bank.layout==='manual'&&bank.faces.filter(f=>f.height==null).length!==1)throw Error('Укажите один фасад по остатку.');
  const equal=Math.floor((available/count+1e-9)*1000)/1000;
  return bank.faces.map((face,i)=>{
    const height=bank.layout==='equal'?equal:(face.height??remaining);
    if(!Number.isFinite(height)||height<100||height>3000)throw Error('Секция '+section+', фасад '+(i+1)+': в нише нужно от 100 до 3000 мм на фасад с учётом зазоров.');
    return height;
  });
}
