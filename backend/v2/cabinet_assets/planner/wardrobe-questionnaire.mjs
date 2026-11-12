import {buildCarcass} from './carcass-model.mjs';
export const WARDROBE_STEPS=['Размеры','Секции','Наполнение','Фасады','Материалы'];
export function wardrobeSpec(f){
 const sections=Number(f.sections),counts=f.sectionShelves;
 if(!Number.isInteger(sections)||sections<1||sections>3||!Array.isArray(counts)||counts.length!==sections)throw Error('Выберите от одной до трёх секций.');
 if(counts.some(n=>!Number.isInteger(n)||n<0||n>10))throw Error('В секции может быть от 0 до 10 полок.');
 const spec={recipe:sections===1?'shelves':'divided',width:Number(f.width),height:Number(f.height),depth:Number(f.depth),thickness:Number(f.thickness),shelves:Math.max(...counts),sections,sectionShelves:[...counts],back:f.back,elevation:f.elevation??0,shelfSetback:f.shelfSetback??20,shelfGap:f.shelfGap??0,edgeThickness:f.edgeThickness??1,edgePolicy:f.edgePolicy??'front'};
 buildCarcass(spec);return spec;
}
export function sectionWidths(s){const clear=s.width-(s.sections+1)*s.thickness;return Array.from({length:s.sections},(_,i)=>Math.floor(clear/s.sections)+(i<clear%s.sections?1:0));}
export function questionnaireMaterialError(m,thickness){return !m?.variant_id?'Выберите материал из каталога.':Number(m.thickness)!==thickness?'Нужен материал толщиной '+thickness+' мм.':'';}
