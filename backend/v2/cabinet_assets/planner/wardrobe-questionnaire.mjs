import {footPlan} from './wardrobe-feet.mjs';
import {validateJoints,nativeCarcassJoints,jointOptions} from './carcass-joints.mjs';
import {buildCarcass} from './carcass-model.mjs';
import {choice,defaultShelf,shelfRows} from './shelf-choices.mjs';
export {sectionWidths} from './carcass-model.mjs';
export const WARDROBE_STEPS=['Размеры','Секции','Наполнение','Фасады','Материалы'];
export function resizeDividerChoices(fields){
 if(fields.thickness!==18||fields.sections<=1){delete fields.dividerJoints;return;}
 fields.dividerJoints=Array.from({length:fields.sections-1},(_,i)=>fields.dividerJoints?.[i]??{top:'confirmat',bottom:'confirmat'});
}
export function wardrobeSpec(f){
 const sections=Number(f.sections),counts=f.sectionShelves;
 if(!Number.isInteger(sections)||sections<1||sections>3||!Array.isArray(counts)||counts.length!==sections)throw Error('Выберите от одной до трёх секций.');
 if(counts.some(n=>!Number.isInteger(n)||n<0||n>10))throw Error('В секции может быть от 0 до 10 полок.');
 const spec={recipe:sections===1?'shelves':'divided',width:Number(f.width),height:Number(f.height),depth:Number(f.depth),thickness:Number(f.thickness),shelves:Math.max(...counts),sections,sectionShelves:[...counts],back:f.back,elevation:f.elevation??0,shelfSetback:1,dividerSetback:1,shelfGap:f.shelfGap??0,edgeThickness:f.edgeThickness??1,edgePolicy:f.edgePolicy??'front'};
 if(f.back&&f.backThickness)spec.backThickness=f.backThickness;
 for(const key of ['topFit','bottomFit'])if(f[key]==='overlay')spec[key]='overlay';
 if(f.feet)spec.feet={layout:'width',article:f.feet.article,front:f.feet.front,rear:f.feet.rear,...(f.feet.left==='side'?{left:'side'}:{}),...(f.feet.right==='side'?{right:'side'}:{})};
 if(f.dividerPositions!=null&&sections>1)spec.dividerPositions=[...f.dividerPositions];
 if(f.joints && (f.joints.top!=='none'||f.joints.bottom!=='none'))spec.joints={...f.joints};
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
 const rows=shelfRows(f);
 for(const row of rows)for(const value of row)choice(value,spec.thickness);
 if(rows.some(row=>row.some(value=>value!==defaultShelf)))spec.shelfChoices=rows;
 const built=buildCarcass(spec);
 if(rows.some(row=>row.includes('board/confirmat')||row.includes('board/cam_dowel')))nativeCarcassJoints(built.items);
 return spec;
}
export function questionnaireMaterialError(m,thickness){return !m?.variant_id?'Выберите материал из каталога.':Number(m.thickness)!==thickness?'Нужен материал толщиной '+thickness+' мм.':'';}
