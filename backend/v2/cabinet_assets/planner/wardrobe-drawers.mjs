import aks from './aks-wardrobe.json' with {type:'json'};
import {fittedFaceHeights,mm} from './wardrobe-niches.mjs';
export const drawerSource='Мульти ящик AKS_доводчика.fr3d';

export const outerFront=s=>Boolean(s.front||s.drawerBanks?.some(b=>b?.kind==='external'));
export const drawerMember=(id,role)=>new RegExp(':drawer-\\d+-'+role+'$').test(id??'');
export const drawerBottom=id=>drawerMember(id,'\\d+-bottom');
export const drawerSide=id=>drawerMember(id,'\\d+-side-(?:left|right)');
export function railForOpening(depth,legacy=false){
 const length=legacy?Math.min(600,(Math.ceil(depth/50)-1)*50):Math.min(600,Math.floor((depth-5)/50)*50);
 if(!Number.isFinite(depth)||!aks.rails[length])throw Error('Для направляющей AKS 250 мм нужны монтажная глубина от 255 мм и запас 5 мм сзади.');
 return {length,article:aks.rails[length].article};
}

// PRIME 112595, installed H0: Y extents measured on its mesh inside the
// spacer (X 0..18, Z behind -21) and the internal front (Z -21..-3).
const overlaps=(lo,hi,a,b)=>lo<b&&a<hi;
export function spacerCuts(bottom,height,axes,side='left'){
 const slots=[];
 for(const axis of [...axes].sort((a,b)=>a-b)){
  if(!overlaps(bottom,bottom+height,axis-(side==='left'?25:26),axis+(side==='left'?26:25)))continue;
  const low=Math.max(0,axis-35-bottom),high=Math.min(height,axis+35-bottom);
  if(slots.length&&slots.at(-1)[1]>=low)slots.at(-1)[1]=Math.max(slots.at(-1)[1],high);
  else slots.push([low,high]);
 }
 return slots;
}
export function frontAtHinge(base,height,y,side){
 return overlaps(base,base+height,y-(side==='left'?30.72:30.8),y+(side==='left'?30.8:30.72));
}
export function drawerFit(b,axes,bank){
 const cuts={},issues=[];
 for(const [side,has] of [['left',b.spacerL],['right',b.spacerR]]){
  cuts[side]=has?spacerCuts(b.base,b.span,axes[side],side):[];
  for(const [i,f] of b.faces.entries()){
   if(cuts[side].some(([lo,hi])=>overlaps(f.railY-22.5,f.railY+22.5,b.base+lo,b.base+hi)))
    issues.push('Секция '+(b.section+1)+', шуфляда '+(i+1)+': направляющая попадает в вырез под петлю '+(side==='left'?'слева':'справа')+'. Измените высоту блока, фасада или отступ петли.');
  }
 }
 b.faces.forEach((f,i)=>{
  const near=(b.spacerL&&axes.left.some(y=>frontAtHinge(f.y,f.height,y,'left')))||(b.spacerR&&axes.right.some(y=>frontAtHinge(f.y,f.height,y,'right')));
  if(!near)return;
  const limit=b.mountWidth-3-16;
  if(bank.faces[i].width==null)f.width=limit;
  else if(f.width>limit)issues.push('Секция '+(b.section+1)+', фасад '+(i+1)+': возле петли допустимая ширина до '+limit+' мм.');
 });
 return {cuts,issues};
}

function frontHeights(bank,n){
 const rows=bank.faces;
 if(!Array.isArray(rows)||!rows.length||rows.length>24)throw Error('Секция '+n+': проверьте количество шуфляд.');
 if(bank.layout)return fittedFaceHeights(bank,n);
 const autos=rows.filter(f=>f?.height==null).length;
 if(autos>1||autos&&(!Number.isInteger(bank.height)||bank.height<100))throw Error('Секция '+n+': для остатка задайте высоту блока.');
 const remaining=bank.height-rows.reduce((sum,f)=>sum+(f?.height??0),0)-3*rows.length;
 return rows.map((f,i)=>{
  const h=f?.height??remaining;
  if(!Number.isInteger(h)||h<100||h>3000)throw Error('Секция '+n+', фасад '+(i+1)+': высота должна быть от 100 до 3000 мм.');
  return h;
 });
}

export function drawerSections(s,widths,legacy=false){
 const banks=s.drawerBanks??Array(widths.length).fill(null);
 if(banks.length<widths.length||banks.length>33)throw Error('Проверьте количество ниш с шуфлядами.');
 return banks.map((bank,slot)=>{
  if(!bank)return null;
  const i=slot%3,clear=widths[i];
  if(clear==null)throw Error('Проверьте секцию шуфляд.');
  const left=-s.width/2+s.thickness+widths.slice(0,i).reduce((sum,w)=>sum+w+s.thickness,0),right=left+clear;
  const internal=bank.kind==='internal';
  if(!internal&&bank.kind!=='external')throw Error('Выберите исполнение шуфляд.');
  const swing=s.front?.swing,n=i+1;
  if(internal&&!swing)throw Error('Секция '+n+': для внутренних шуфляд выберите распашную дверь.');
  const spacerL=internal&&i===0&&['left','pair'].includes(swing)?18:0;
  const spacerR=internal&&i===widths.length-1&&['right','pair'].includes(swing)?18:0;
  const mountWidth=clear-spacerL-spacerR;
  if(mountWidth<163)throw Error('Секция '+n+': монтажный проём AKS должен быть от 163 мм.');
  const center=(left+spacerL+right-spacerR)/2;
  const lo=internal?left+spacerL:left-(i===0?s.thickness:s.thickness/2);
  const hi=internal?right-spacerR:right+(i===widths.length-1?s.thickness:s.thickness/2);
  const maxWidth=hi-lo-3,heights=frontHeights(bank,n);
  const offset=bank.bottomOffset??0;
  if(!Number.isInteger(offset)||offset<0||offset>3000)throw Error('Положение блока задаётся в целых мм от 0 до 3000.');
  const base=(internal?s.thickness:0)+offset;
  let bottom=base;
  const faceFront=s.depth/2+(internal?-3:18);
  const bodyFront=faceFront-18;
  const clearDepth=bodyFront+s.depth/2-(s.backThickness??0);
  const rail=railForOpening(clearDepth,legacy);
  const faces=heights.map((height,j)=>{
   const width=bank.faces[j].width??maxWidth;
   if(!Number.isInteger(width*2)||width<40||width>maxWidth)throw Error('Секция '+n+', фасад '+(j+1)+': допустимая ширина 40–'+maxWidth+' мм.');
   const boxY=Math.round(Math.max(s.thickness,bottom))+13;
   const f={width,height,x:(lo+hi)/2,y:mm(bottom+1.5),z:faceFront-9,boxY,railY:boxY+40};
   bottom=mm(bottom+height+(bank.layout?bank.gap:3));return f;
  });
  if(bank.layout)bottom=base+bank.height;
  if(bottom>s.height-(internal?s.thickness:0))throw Error('Секция '+n+': блоку шуфляд не хватает '+(bottom-s.height+(internal?s.thickness:0))+' мм.');
  return {section:i,slot,legacy,base,internal,spacerL,spacerR,left,right,mountWidth,center,bodyFront,rail,clearDepth,faces,top:bottom,span:bottom-base};
 });
}

// Names and local axes match the board axes used by the planner.
export function buildDrawerBoards(spec,banks,add){
 for(const b of banks){
  if(!b)continue;
  const prefix='drawer-'+b.slot+'-',section=' · секция '+(b.section+1);
  const spacerDepth=b.legacy?Math.floor(b.clearDepth):b.rail.length,spacerZ=b.bodyFront-spacerDepth/2;
  for(const [side,width,x] of [['left',b.spacerL,b.left+9],['right',b.spacerR,b.right-9]]){
   if(width)add(prefix+'spacer-'+side,'Проставка 18 мм '+(side==='left'?'слева':'справа')+section,'side',b.span,spacerDepth,18,x,b.base,spacerZ,'1000');
  }
  b.faces.forEach((f,j)=>{
   const id=prefix+j+'-',name=' · шуфляда '+(j+1)+section,L=b.rail.length,W=b.mountWidth-27;
   const y=f.boxY,h=Math.floor(f.y+f.height-10-y),z=b.bodyFront-L/2;
   if(h<(b.legacy?40:63))throw Error('Шуфляда '+(j+1)+section+': увеличьте высоту фасада.');
   add(id+'face','Фасад'+name,'front',f.height,f.width,18,f.x,f.y,f.z,'1111');
   for(const [side,sign] of [['left',-1],['right',1]])
    add(id+'side-'+side,(sign<0?'Левая':'Правая')+' боковина'+name,'side',h,L,18,b.center+sign*(W-18)/2,y,z,b.legacy?'1000':'0101');
   for(const [end,sign] of [['front',1],['rear',-1]])
    add(id+end,(sign>0?'Передняя':'Задняя')+' стенка'+name,'back',W-36,h,18,b.center,y,z+sign*(L-18)/2,b.legacy?'1000':'0100');
   add(id+'bottom','Дно ЛХДФ'+name,'horizontal',W-4,L-4,3,b.center,y-3,z,'0000');
  });
 }
}

export function doorZones(s,leaves,banks){
 if(!banks.some(b=>b&&!b.internal))return leaves;
 const reference=banks.find(Boolean);
 const seam=s.sections===2&&leaves.length===2?(reference.section===0?reference.right+s.thickness/2:reference.left-s.thickness/2)+s.width/2:null;
 return leaves.map((l,i)=>{
  const left=seam!==null&&i===1?seam+1.5:l.left;
  const width=seam===null?l.width:i?s.width-seam-3:seam-3;
  const a=left-s.width/2,covered=banks.filter(b=>b&&Math.min(a+width,b.right)>Math.max(a,b.left));
  const top=Math.max(0,...covered.filter(b=>!b.internal).map(b=>b.top));
  if(top&&covered.some(b=>b.internal&&b.base<top))throw Error('Разделите створки для внутренних и наружных шуфляд по секциям.');
  return {...l,left,width,bottom:l.bottom+top,height:l.height-top};
 });
}
