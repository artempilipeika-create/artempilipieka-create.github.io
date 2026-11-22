import {wardrobeHardware} from './wardrobe-aks-native.mjs';
import {canLight} from './wardrobe-lighting.mjs';
import {canMachine,rearClearance} from './panel-machining.mjs';
import {secureDoorShelf} from './wardrobe-door-layout.mjs';
import {settingFor} from './wardrobe-hinge-layout.mjs';
import {footPlan} from './wardrobe-feet.mjs';
import {lowerBodyHeight,savedTrimExtension} from './wardrobe-trim-layout.mjs';
import {footHeight} from './plinth-options.mjs';
import {validateJoints,nativeCarcassJoints,jointOptions} from './carcass-joints.mjs';
import {buildCarcass} from './carcass-model.mjs';
import {choice,defaultShelf,shelfRows} from './shelf-choices.mjs';
import {fitNicheBanks,prepareDrawerCovers,nicheSlot} from './wardrobe-niches.mjs';
export {sectionWidths} from './carcass-model.mjs';
export const WARDROBE_STEPS=['Корпус','Полки','Наполнение','Фасады','Материалы'];
export function resizeDividerChoices(fields){
 if(fields.thickness!==18||fields.sections<=1){delete fields.dividerJoints;return;}
 fields.dividerJoints=Array.from({length:fields.sections-1},(_,i)=>fields.dividerJoints?.[i]??{top:'confirmat',bottom:'confirmat'});
}
function hingesInGaps(built,bank){
 const zero=built.spec.elevation+(built.spec.feet?.article==='118779'?0:footHeight(built.spec));
 return built.hingeLocations.filter(h=>{
  const edge=h.side==='left'?bank.left:bank.right;
  return Math.abs(h.x-edge)<.01&&bank.faces.some((f,i)=>i&&h.y-zero>bank.faces[i-1].y+bank.faces[i-1].height&&h.y-zero<f.y);
 }).length;
}

// Trial the 5 mm clearance only when preparing the questionnaire. Old saved
// panels keep their actual depth until their owner applies the rebuilt wardrobe.
function fitDrawerHingeDepths(spec,group_id){
 const build=()=>buildCarcass(spec,{idPrefix:group_id});
 const candidates=[];
 for(const [i,bank] of (spec.drawerBanks??[]).entries()){
  if(!bank)continue;
  delete bank.hingeClearanceMm;
  if(spec.front&&bank.kind==='internal'&&bank.gap>=18&&bank.faces.length>1)candidates.push(i);
 }
 const original=build();
 if(!candidates.length)return original;
 for(const i of candidates)spec.drawerBanks[i].hingeClearanceMm=5;
 try{
  const trial=build();
  let retained=0;
  for(const i of candidates){
   const bank=trial.drawerBanks[i];
   if(bank.hingeSetback&&hingesInGaps(trial,bank)>hingesInGaps(original,original.drawerBanks[i]))retained++;
   else delete spec.drawerBanks[i].hingeClearanceMm;
  }
  if(!retained)return original;
  const fitted=retained===candidates.length?trial:build();
  if(fitted.hingeConflicts.length<=original.hingeConflicts.length)return fitted;
 }catch{
  // Only the trial depth failed (e.g. adjacent fitted hardware). The original
  // assembly above was already built and checked with its full guide length.
 }
 for(const i of candidates)delete spec.drawerBanks[i].hingeClearanceMm;
 return original;
}

export function wardrobeSpec(f){
 const sections=Number(f.sections),counts=f.sectionShelves;
 if(!Number.isInteger(sections)||sections<1||sections>4||!Array.isArray(counts)||counts.length!==sections)throw Error('Выберите от одной до четырёх секций.');
 if(counts.some(n=>!Number.isInteger(n)||n<0||n>10))throw Error('В секции может быть от 0 до 10 полок.');
 const spec={recipe:sections===1?'shelves':'divided',width:Number(f.width),height:Number(f.height),depth:Number(f.depth),thickness:Number(f.thickness),shelves:Math.max(...counts),sections,sectionShelves:[...counts],back:f.back,elevation:f.elevation??0,shelfSetback:1,dividerSetback:1,shelfGap:f.shelfGap??0,edgeThickness:f.edgeThickness??1,edgePolicy:f.edgePolicy??'front'};
 if(f.overallHeight!=null){
  if(!Number.isInteger(f.overallHeight)||f.overallHeight<200||f.overallHeight>5000)throw Error('Общая высота от пола должна быть от 200 до 5000 мм.');
  // Older, deliberately taller bespoke trims can project above the ceiling panel.
  if(!savedTrimExtension(f))spec.overallHeight=f.overallHeight;
  spec.height=lowerBodyHeight(f);
  if(spec.height<200||spec.height>3000)throw Error('На основной корпус остаётся '+spec.height+' мм. Допустимо от 200 до 3000 мм. Проверьте общую высоту, опоры, антресоль и закладную.');
 }
 if(f.surround&&Object.values(f.surround).some(Boolean))spec.surround=structuredClone(f.surround);
 if(f.machining&&Object.keys(f.machining).length)spec.machining=structuredClone(f.machining);
 if(f.back&&f.backMount)spec.backMount={...f.backMount};
 if(f.lighting&&Object.keys(f.lighting).length)spec.lighting=structuredClone(f.lighting);
 if(f.fittings?.length)spec.fittings=structuredClone(f.fittings);
 if(f.doorFittings&&f.front)spec.doorFittings=structuredClone(f.doorFittings);
 if(f.rods?.length)spec.rods=structuredClone(f.rods);
 if(f.clearLayout)spec.clearLayout=true;
 if(f.drawerFixing||f.bottomFit==='none'||f.nicheSplits?.length)spec.drawerFixing=f.drawerFixing??'cam_dowel';
 if(spec.drawerFixing&&!['cam_dowel','confirmat'].includes(spec.drawerFixing))throw Error('Выберите крепёж полок у шуфляд.');
 if(f.gapLocks?.some(row=>row?.length))spec.gapLocks=counts.map((n,i)=>(f.gapLocks[i]??[]).filter(k=>k<=n));
 if(f.topGaps?.some(n=>n!=null))spec.topGaps=Array.from({length:sections},(_,i)=>f.topGaps[i]??null);
 if(f.nicheSplits?.length)spec.nicheSplits=structuredClone(f.nicheSplits);
 if(f.bottomFit==='none'){spec.bottomFit='none';if(f.braceOffset)spec.braceOffset=f.braceOffset;}
 if(f.shelfLevels){
   const levels=counts.map((count,section)=>Array.from({length:count},(_,i)=>f.shelfLevels[section]?.[i]??null));
   if(levels.some(row=>row.some(Boolean)))spec.shelfLevels=levels;
 }
 if(f.front){
   spec.front={...f.front,autoHinges:true};
   if(f.front.hinges)spec.front.hinges=Object.fromEntries(Object.keys(f.front.hinges).map(key=>[key,settingFor(f.front,key)]));
 }
 if(f.back&&f.backThickness)spec.backThickness=f.backThickness;
 for(const key of ['topFit','bottomFit'])if(f[key]==='overlay')spec[key]='overlay';
 if(f.feet)spec.feet={layout:'width',article:f.feet.article,front:f.feet.front,rear:f.feet.rear,...(f.feet.left==='side'?{left:'side'}:{}),...(f.feet.right==='side'?{right:'side'}:{})};
 if(f.dividerPositions!=null&&sections>1)spec.dividerPositions=[...f.dividerPositions];
 if(f.joints && (f.joints.top!=='none'||f.joints.bottom!=='none'))spec.joints={...f.joints,...(spec.bottomFit==='none'?{bottom:'none'}:{})};
 if(sections>1&&spec.thickness===18){
   const settings={...f};resizeDividerChoices(settings);
   spec.dividerJoints=settings.dividerJoints.map((row,i)=>{
     for(const scheme of [row.top,row.bottom]){
       if(!Object.hasOwn(jointOptions,scheme))throw Error('Выберите крепёж внутренней стойки '+(i+1)+'.');
       if(scheme==='cam_dowel'&&spec.depth-rearClearance(spec)-spec.dividerSetback<216)throw Error('Стойка '+(i+1)+': для эксцентрика со шкантом нужна глубина самой стойки от 216 мм.');
     }
     return {...row};
   });
 }
 validateJoints(spec);footPlan(spec);
 if(f.shelfChoices)spec.shelfChoices=shelfRows(f);
 if(f.drawerBanks?.some(Boolean))spec.drawerBanks=structuredClone(f.drawerBanks);
 prepareDrawerCovers(spec);
 secureDoorShelf(spec);
 const rows=shelfRows(spec);
 for(const [section,row] of rows.entries())for(const [level,value] of row.entries()){
   const c=choice(value,spec.thickness);
   if(c.scheme&&spec.thickness!==18&&!spec.front?.division&&![nicheSlot(section,level),nicheSlot(section,level+1)].some(slot=>spec.drawerBanks?.[slot]?.layout))throw Error('Для этой толщины фиксированный крепёж задаётся в нише шуфляд.');
 }
 if(!rows.some(row=>row.some(value=>value!==defaultShelf)))delete spec.shelfChoices;
 if(spec.drawerBanks)spec.drawerBanks=fitNicheBanks(spec,spec.drawerBanks);
 const group_id='questionnaire';
 const built=fitDrawerHingeDepths(spec,group_id);
 if(spec.lighting){
   const eligible=new Set(built.parts.filter(canLight).map(p=>p.key));
   spec.lighting=Object.fromEntries(Object.entries(spec.lighting).filter(([key])=>eligible.has(key)));
   if(!Object.keys(spec.lighting).length)delete spec.lighting;
   else if(f.lightKit){
     spec.lightKit={control:f.lightKit.control??'touch'};
     if(Object.keys(f.lightKit.prices??{}).length)spec.lightKit.prices={...f.lightKit.prices};
     if(f.lightKit.holders!=null&&Object.values(spec.lighting).some(rows=>rows.some(row=>row.system==='lira-17.5x6.5')))spec.lightKit.holders=f.lightKit.holders;
     if(f.lightKit.holders1708!=null&&Object.values(spec.lighting).some(rows=>rows.some(row=>row.system==='lira-1708')))spec.lightKit.holders1708=f.lightKit.holders1708;
   }
 }
 if(spec.machining){
   const panels=new Set(built.parts.filter(p=>canMachine(p.item)).map(p=>p.key));
   spec.machining=Object.fromEntries(Object.entries(spec.machining).filter(([key])=>panels.has(key)));
   if(!Object.keys(spec.machining).length)delete spec.machining;
 }
 const fixedShelves=rows.some(row=>row.includes('board/confirmat')||row.includes('board/cam_dowel'));
 const primeDrawers=spec.drawerBanks?.some(b=>b?.railFamily==='concealed');
 if(fixedShelves||primeDrawers){
  const panels=built.items.map(i=>({...i,assistant_carcass:{spec,group_id}}));
  if(fixedShelves)nativeCarcassJoints(panels);
  if(primeDrawers&&!built.drawerIssues.length)wardrobeHardware(panels);
 }
 return spec;
}
export function questionnaireMaterialError(m,thickness){return !m?.variant_id?'Выберите материал из каталога.':Number(m.thickness)!==thickness?'Нужен материал толщиной '+thickness+' мм.':'';}
