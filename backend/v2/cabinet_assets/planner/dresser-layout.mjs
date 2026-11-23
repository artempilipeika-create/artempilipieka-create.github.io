import {nicheSlot,sectionSpans,sectionWidths} from './wardrobe-layout.mjs';
import {nicheOpenings} from './wardrobe-niches.mjs';

export const dresserSteps=['Корпус','Секции','Наполнение','Фасады и ручки','Материалы'];
export const bayNames={drawers:'Шуфляды',shelves:'Полки за дверцей',mixed:'Шуфляды снизу, полки за дверцей',media:'Открытая ниша для техники'};
export const dresserPresets=[
 {id:'classic',name:'Три шуфляды',kinds:['drawers']},
 {id:'side',name:'Шуфляды и полки',kinds:['drawers','shelves']},
 {id:'media',name:'Комод с нишей для техники',kinds:['drawers','media','shelves']}
];
export const hasDrawers=b=>['drawers','mixed'].includes(b.kind);
export const hasDoor=b=>['shelves','mixed'].includes(b.kind);
export const defaultDresserFoot=()=>({article:'86502',front:80,rear:50});
export function newBay(kind,count){
 const bay={kind};
 if(hasDrawers(bay))bay.drawers=count??(kind==='mixed'?2:3);
 if(hasDoor(bay))bay.shelves=kind==='mixed'?1:2;
 return bay;
}
export function newDresser(){
 return {width:1000,height:750,depth:450,thickness:18,topFit:'overlay',back:true,elevation:0,feet:defaultDresserFoot(),
   sections:1,sectionShelves:[0],clearLayout:true,dresser:{installation:'floor',bays:[newBay('drawers')]}};
}
export function setDresserLayout(f,kinds,count){
 if(kinds.length!==f.sections)delete f.dividerPositions;
 f.dresser.bays=kinds.map(kind=>newBay(kind,hasDrawers({kind})?count:undefined));
 f.sections=kinds.length;
}
export function resizeDresser(f,n){
 if(!Number.isInteger(n)||n<1||n>4)throw Error('Выберите от одной до четырёх секций.');
 if(n===f.sections)return;
 f.dresser.bays=Array.from({length:n},(_,i)=>f.dresser.bays[i]??newBay('shelves'));
 f.sections=n;delete f.dividerPositions;
}
export function setDresserWidth(f,index,mm){
 const widths=sectionWidths(f),partner=index===widths.length-1?index-1:index+1;
 if(partner<0||!Number.isInteger(mm)||mm<100||widths[partner]+widths[index]-mm<100)throw Error('Оставьте в обеих секциях минимум 100 мм в свету.');
 widths[partner]+=widths[index]-mm;widths[index]=mm;
 let end=0;f.dividerPositions=widths.slice(0,-1).map((w,i)=>(end+=w+(i?f.thickness:0)));
}
export function dresserSwing(bay,section,width,total){
 if(bay.swing&&bay.swing!=='auto')return bay.swing;
 return width-3>600?'pair':section<total/2?'left':'right';
}
export const dresserDoorKey=(section,side)=>'door-section-'+section+'-'+side;
export function dresserLeaves(s,spans,banks){
 if(!s.front)return [];
 return s.dresser.bays.flatMap((bay,i)=>{
   if(!hasDoor(bay))return [];
   const span=spans[i],swing=dresserSwing(bay,i,span.right-span.left,s.sections);
   const sides=swing==='pair'?['left','right']:[swing],width=(span.right-span.left)/sides.length-3;
   const bank=banks[nicheSlot(i,0)],bottom=bank?bank.top+1.5:bay.kind==='mixed'?nicheOpenings(s,i)[0].overlayTop+1.5:1.5;
   return sides.map((side,j)=>({key:dresserDoorKey(i,side),side,section:i,left:span.left+1.5+j*(width+3),
     bottom,width,height:s.height-1.5-bottom,faceOffset:18,
     hostKey:side==='left'?(i===0?'left':'divider-'+(i-1)):(i===s.sections-1?'right':'divider-'+i)}));
 });
}
function handle(article,side){
 if(!article)return undefined;
 return side?{article,edge:side==='left'?'right':'left',from:'end',offset:34,inset:40}:
   {article,edge:'top',from:'center',offset:0,inset:30,centerHeight:true};
}
function makeBank(f,b,i){
 const n=b.drawers,room=nicheOpenings(f,i)[0],gap=b.gap??3;
 if(!Number.isInteger(n)||n<1||n>24)throw Error('Проверьте количество шуфляд в секции '+(i+1)+'.');
 const bank={kind:'external',layout:'equal',gap,faces:Array.from({length:n},()=>({height:null}))};
 if(b.rail&&b.rail!=='ball')Object.assign(bank,{railFamily:'concealed',opening:b.rail,faceFixing:'cam'});
 const pull=handle(b.drawerPull);
 if(pull)bank.faces.forEach(face=>{face.handle={...pull};});
 const fixed=b.heights??[];
 if(fixed.some(v=>v!=null)){
   const heights=Array.from({length:n},(_,j)=>fixed[j]??null);
   const usable=room.overlayTop-room.overlayBottom-3-gap*(n-1);
   const remainder=usable-heights.reduce((sum,v)=>sum+(v??0),0),free=heights.filter(v=>v==null).length;
   if(!free&&Math.abs(remainder)>.001)throw Error('Оставьте один фасад по остатку или укажите высоты на весь проём.');
   if(free&&remainder/free<100)throw Error('На каждый оставшийся фасад нужно минимум 100 мм.');
   const last=free?heights.lastIndexOf(null):n-1;
   bank.layout='manual';bank.faces.forEach((face,j)=>{face.height=j===last?null:heights[j]??Math.floor(remainder/free*1000)/1000;});
 }
 return bank;
}
// Only the production fields derived from a bay are rebuilt. Carcass dimensions,
// materials, mounting, rear machining and the saved assembly identity stay independent.
export function syncDresser(f){
 const bays=f.dresser.bays,t=f.thickness;
 f.sections=bays.length;
 f.sectionShelves=bays.map(b=>(hasDoor(b)?b.shelves:0)+(b.kind==='mixed'||b.kind==='media'&&b.clearHeight!=null?1:0));
 f.shelfChoices=bays.map((b,i)=>Array.from({length:f.sectionShelves[i]},(_,j)=>
   b.kind==='mixed'&&j===0?(t===18?'board/cam_dowel':'board/95388'):(b.fixing??'board/95388')));
 f.shelfLevels=bays.map((b,i)=>Array.from({length:f.sectionShelves[i]},(_,j)=>{
   if(j===0&&(b.kind==='mixed'||b.kind==='media'&&b.clearHeight!=null)){
     const mm=b.clearHeight??Math.round((f.height-3*t)*.53);
     return {mode:'gap',mm};
   }
   const gap=b.shelfGaps?.[j-(b.kind==='mixed'?1:0)];return gap!=null?{mode:'gap',mm:gap}:null;
 }));
 const spans=sectionSpans(f),front={swing:'pair',offset:90,autoHinges:true,hinges:{}},banks=Array(f.sections).fill(null);
 delete f.front;delete f.drawerBanks;delete f.drawerFixing;
 bays.forEach((b,i)=>{
   if(hasDrawers(b))banks[nicheSlot(i,0)]=makeBank(f,b,i);
   if(!hasDoor(b))return;
   const swing=dresserSwing(b,i,spans[i].right-spans[i].left,f.sections);
   for(const side of swing==='pair'?['left','right']:[swing]){
     const key=dresserDoorKey(i,side),outer=side==='left'?i===0:i===f.sections-1;
     front.hinges[key]={article:outer?'112595':'112644'};
     const pull=handle(b.doorPull,side);if(pull)(front.handles??={})[key]=pull;
   }
 });
 if(Object.keys(front.hinges).length)f.front=front;
 if(banks.some(Boolean))f.drawerBanks=Array.from(banks,v=>v??null);
 return f;
}
export function dresserCableMarks(s){
 if(!s.dresser||!s.back)return [];
 const widths=sectionWidths(s);let start=s.thickness;
 return s.dresser.bays.flatMap((b,i)=>{
   const left=start;start+=widths[i]+s.thickness;
   if(b.kind!=='media'||!b.cable)return [];
   const x=left+(b.cable==='left'?50:b.cable==='right'?widths[i]-50:widths[i]/2);
   const room=nicheOpenings(s,i)[0];
   return [{section:i,x,y:Math.round((room.top+room.bottom)/2)}];
 });
}
