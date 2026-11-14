// Selectable sizes belong to a specific fitting. Open bearing pads have no upper jaw.
const board=[16,18,25], glass=[4,6,8];
const chrome='хром', nickel='никель', black='чёрный матовый';
export const fittings=[
 ['95388','SEKURA 2',nickel,'board',board],
 ['70245','SEKURA 6',nickel,'board',board,'50 шт./уп.'],
 ['60714','SEKURA 6',nickel,'board',board,'1000 шт./уп.'],
 ['134286','Casper','скрытый','board',[16,18]],
 ['134762','MYSTI','тёмный никель','board',[16,18,25],'12 × 22 мм'],
 ['134763','MYSTI','тёмный никель','board',[16,18,25],'14 × 16 мм'],
 ['13110','GS04',chrome,'board',[],'Декоративный держатель'],
 ['48846','SEKURA 0.8',nickel,'glass',glass,'20 шт./уп.'],
 ['48848','SEKURA 0.8',nickel,'glass',glass,'100 шт./уп.'],
 ['39544','SEKURA 0.8',nickel,'glass',glass,'1000 шт./уп.'],
 ['48862','L-003B',chrome,'glass',glass,'20 шт./уп.'],
 ['39543','L-003B',chrome,'glass',glass,'1000 шт./уп.'],
 ['80936','АК133',chrome,'glass',[6,8],'6–8 мм'],
 ['103819','АК133',black,'glass',[6,8],'6–8 мм'],
 ['103816','АК104',chrome,'glass',[6,8],'6–8 мм'],
 ['103817','АК104',black,'glass',[6,8],'6–8 мм'],
 ['64145','АК104',chrome,'glass',[8],'8–10 мм'],
 ['103818','АК104',black,'glass',[8],'8–10 мм'],
 ['103814','306',chrome,'glass',[6,8],'6–8 мм'],
 ['80054','MV-09',nickel,'glass',[]],
 ['103820','MV-09',chrome,'glass',[]],
 ['38334','WP2710',chrome,'glass',[]],
 ['39653','WZH-006',chrome,'glass',[]],
 ['64149','АК045',chrome,'glass',[]]
].map(([article,name,finish,kind,sizes,detail=''])=>({article,name,finish,kind,sizes,detail}));
export const defaultShelf='board/95388';
export function choice(value,boardThickness){
 const [size,article]=String(value).split('/');
 const hardware=fittings.find(f=>f.article===article);
 const kind=size==='board'?'board':'glass';
 const thickness=kind==='board'?boardThickness:Number(size);
 if(!hardware || hardware.kind!==kind || value!==size+'/'+article ||
    (article!=='95388'&&!hardware.sizes.includes(thickness)) ||
    (kind==='glass'&&!['4','6','8'].includes(size)))throw Error('Выберите держатель для материала и толщины полки.');
 return {kind,thickness,hardware};
}
export function shelfRows(fields){
 return fields.sectionShelves.map((count,section)=>Array.from({length:count},(_,i)=>fields.shelfChoices?.[section]?.[i]||defaultShelf));
}
export function fittingGap(article){
 // Minimum whole-mm clearance to the back of the slot, measured in each FR3D.
 if(['80936','103819'].includes(article))return 8;
 if(['103814','103816','103817','64145','103818'].includes(article))return 3;
 return 0;
}
