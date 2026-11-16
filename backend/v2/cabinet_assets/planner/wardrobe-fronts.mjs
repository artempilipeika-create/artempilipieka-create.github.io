import {cuttingSize} from './blanks-model.mjs';

// Closed overlay fronts, measured from the lower left corner of the carcass.
// Dimensions include finished edging on all four edges. Feet are below this datum.
export function overlayFronts({width,height},count){
  if(![1,2].includes(count))throw Error('Выберите одну или две створки.');
  if(![width,height].every(n=>Number.isInteger(n)&&n>=200))throw Error('Проверьте габариты корпуса.');
  const edgeGap=1.5,meetingGap=3;
  const leafWidth=(width-2*edgeGap-(count-1)*meetingGap)/count;
  const leafHeight=height-2*edgeGap;
  const edges='1111',edgeThickness=2;
  const cut=cuttingSize({length:leafHeight,partWidth:leafWidth,edges,blank_edge_thickness_mm:edgeThickness});
  return Array.from({length:count},(_,i)=>({
    left:edgeGap+i*(leafWidth+meetingGap),bottom:edgeGap,
    width:leafWidth,height:leafHeight,edges,edgeThickness,cut:{...cut}
  }));
}

export const primeHinge={
 article:'112595',file:'Петля PRIME 3D, накладная с доводчиком, 45 мм, h0 clip-on саморез (112595).fr3d',
 sha:'fa4fb4dfa6310cdec87d25d683a7d5e1d5923470bed7ae25c3f35923cf7166a8'
};

// Published AKS chart for a 35 mm cup and a door up to 600 mm wide.
export function hingeLoad(width,height,massKg){
 const mass=massKg??width*height*18*700/1e9;
 const levels=[[900,8],[1600,13],[2000,17],[2400,22]];
 const level=levels.findIndex(([h,m])=>height<=h&&mass<=m);
 if(width>600||mass<=0||level<0)throw Error('Таблица AKS Ø35 охватывает створки до 600 × 2400 мм и до 22 кг. Проверьте размеры и массу одной створки.');
 return {mass,count:level+2};
}

export function hingeAxes(height,count,offset,shelves=[]){
 const span=height-2*offset,step=span/(count-1);
 if(step<64)throw Error('Между крайними петлями недостаточно места. Проверьте высоту и отступ.');
 const free=y=>shelves.every(([lo,hi])=>y+31<lo||y-31>hi);
 const axes=[];
 for(let i=0;i<count;i++){
   const end=i===0||i===count-1,ideal=end?(i?height-offset:offset):Math.round(offset+i*step);
   let y=ideal;
   if(!free(y)&&!end){
     // Search only this hinge's share of the span and keep neighbouring cups clear.
     const radius=Math.floor((step-64)/2);y=null;
     for(let d=1;d<=radius&&y===null;d++)for(const candidate of [ideal-d,ideal+d]){
       if(free(candidate)){y=candidate;break;}
     }
   }
   if(y===null||!free(y))throw Error('Петля пересекается с полкой. Измените отступ 90/130 мм или положение полки.');
   axes.push(y);
 }
 return axes;
}
