import {footPlan} from './wardrobe-feet.mjs';
import {validateJoints,nativeCarcassJoints,jointOptions} from './carcass-joints.mjs';
import {buildCarcass} from './carcass-model.mjs';
import {choice,defaultShelf,shelfRows} from './shelf-choices.mjs';
import {fitNicheBanks,prepareDrawerCovers,nicheSlot} from './wardrobe-niches.mjs';
export {sectionWidths} from './carcass-model.mjs';
export const WARDROBE_STEPS=['Корпус','Секции','Наполнение','Фасады','Материалы'];
export function resizeDividerChoices(fields){
 if(fields.thickness!==18||fields.sections<=1){delete fields.dividerJoints;return;}
 fields.dividerJoints=Array.from({length:fields.sections-1},(_,i)=>fields.dividerJoints?.[i]??{top:'confirmat',bottom:'confirmat'});
}
export function wardrobeSpec(f){
 const sections=Number(f.sections),counts=f.sectionShelves;
 if(!Number.isInteger(sections)||sections<1||sections>4||!Array.isArray(counts)||counts.length!==sections)throw Error('Выберите от одной до четырёх секций.');
 if(counts.some(n=>!Number.isInteger(n)||n<0||n>10))throw Error('В секции может быть от 0 до 10 полок.');
 const spec={recipe:sections===1?'shelves':'divided',width:Number(f.width),height:Number(f.height),depth:Number(f.depth),thickness:Number(f.thickness),shelves:Math.max(...counts),sections,sectionShelves:[...counts],back:f.back,elevation:f.elevation??0,shelfSetback:1,dividerSetback:1,shelfGap:f.shelfGap??0,edgeThickness:f.edgeThickness??1,edgePolicy:f.edgePolicy??'front'};
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
 if(f.front)spec.front={...f.front,autoHinges:true};
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
       if(scheme==='cam_dowel'&&spec.depth-(spec.backThickness??0)-spec.dividerSetback<216)throw Error('Стойка '+(i+1)+': для эксцентрика со шкантом нужна глубина самой стойки от 216 мм.');
     }
     return {...row};
   });
 }
 validateJoints(spec);footPlan(spec);
 if(f.shelfChoices)spec.shelfChoices=shelfRows(f);
 if(f.drawerBanks?.some(Boolean))spec.drawerBanks=structuredClone(f.drawerBanks);
 const rows=prepareDrawerCovers(spec);
 for(const [section,row] of rows.entries())for(const [level,value] of row.entries()){
   const c=choice(value,spec.thickness);
   if(c.scheme&&spec.thickness!==18&&![nicheSlot(section,level),nicheSlot(section,level+1)].some(slot=>spec.drawerBanks?.[slot]?.layout))throw Error('Для этой толщины фиксированный крепёж задаётся в нише шуфляд.');
 }
 if(!rows.some(row=>row.some(value=>value!==defaultShelf)))delete spec.shelfChoices;
 if(spec.drawerBanks)spec.drawerBanks=fitNicheBanks(spec,spec.drawerBanks);
 const group_id='questionnaire';
 const built=buildCarcass(spec,{idPrefix:group_id});
 if(rows.some(row=>row.includes('board/confirmat')||row.includes('board/cam_dowel')))nativeCarcassJoints(built.items.map(i=>({...i,assistant_carcass:{spec,group_id}})));
 return spec;
}
export function questionnaireMaterialError(m,thickness){return !m?.variant_id?'Выберите материал из каталога.':Number(m.thickness)!==thickness?'Нужен материал толщиной '+thickness+' мм.':'';}
