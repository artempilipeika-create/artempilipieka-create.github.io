import {footHeight} from './plinth-options.mjs';
import {drawerFacades} from './wardrobe-door-layout.mjs';
import {trimSides} from './wardrobe-surround.mjs';

const fmt=v=>Number(v.toFixed(3));
const number=v=>fmt(v).toLocaleString('ru-RU',{useGrouping:false,maximumFractionDigits:3});
const frame='#355a54',muted='#506762',leaves='#e2eeea',upper='#b9d7cc',cap='#d5c5b2';
const sideColor={left:'#e7bb75',right:'#9abbd5'};
const rect=(x,y,w,h,fill,stroke=frame)=>'<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(w)+'" height="'+fmt(h)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="0.9"/>';
const line=(x1,y1,x2,y2,stroke=frame)=>'<line x1="'+fmt(x1)+'" y1="'+fmt(y1)+'" x2="'+fmt(x2)+'" y2="'+fmt(y2)+'" stroke="'+stroke+'"/>';
const label=(x,y,value,anchor='start',size=11)=>'<text x="'+fmt(x)+'" y="'+fmt(y)+'" text-anchor="'+anchor+'" fill="'+frame+'" font-size="'+size+'">'+value+'</text>';

function fillerPlan(parts,side,x,y){
 const board=key=>parts.find(p=>p.key===key).item;
 const face=board('trim-'+side+'-face'),spacer=board('trim-'+side+'-return'),wall=board(side);
 const left=side==='left',edge=wall.x+(left?-1:1)*wall.width/2;
 // Crop to the joint even when the face is much wider than this detail.
 const view=[edge-(left?120:40),face.z+face.depth/2-110,160,116].map(fmt).join(' ');
 const plan=(it,fill)=>rect(it.x-it.width/2,it.z-it.depth/2,it.width,it.depth,fill);
 return '<svg x="'+x+'" y="'+y+'" width="80" height="58" viewBox="'+view+'" overflow="hidden" data-filler-plan="'+side+'">'+
  plan(wall,'#d5e2db')+plan(spacer,sideColor[side])+plan(face,sideColor[side])+'</svg>'+
  label(x+40,y+70,left?'Слева':'Справа','middle',10);
}

export function surroundDrawing(built,view){
 const s=built.spec,a=s.surround??{},g=built.envelope,floor=301,total=(s.elevation??0)+g.height;
 const k=Math.min(235/g.width,280/total),X=x=>156+(x-g.centerX)*k,Y=y=>floor-(y+s.elevation)*k;
 const board=(x,y,w,h,fill)=>rect(X(x),Y(y+h),w*k,h*k,fill);
 const feet=footHeight(s),w=s.width,lo=-w/2;
 let art=board(lo,feet,w,s.height,'#f0f4f1');
 const plinth=built.parts.find(p=>p.key==='plinth')?.item;
 if(plinth)art+=board(plinth.x-plinth.width/2,0,plinth.width,plinth.height,'#d6ded5');
 if(!s.front){
  for(const p of built.parts.filter(p=>p.key.startsWith('shelf-')||p.key.startsWith('divider-'))){
   const it=p.item;art+=board(it.x-it.width/2,it.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0),it.width,it.height,'#c4d2ca');
  }
 }
 for(const f of [...(built.doors??[]),...drawerFacades(s,built.drawerBanks??[]).filter(f=>!f.internal)])
  art+=board(lo+f.left,feet+f.bottom,f.width,f.height,leaves);
 if(a.upper){
  art+=board(lo,g.bodyTop,w,a.upper.height,upper);
  for(const p of built.parts.filter(p=>p.key.startsWith('mezz-door-'))){
   const it=p.item;art+=board(it.x-it.width/2,it.elevation_mm-s.elevation,it.width,it.height,upper);
   const x=X(it.x),y=Y(g.bodyTop+a.upper.height/2),dir=p.key.endsWith('left')?-1:1;
   art+=a.upper.opening==='lift'?line(x-5,y+3,x,y-3)+line(x,y-3,x+5,y+3):line(x-dir*3,y-4,x+dir*3,y)+line(x+dir*3,y,x-dir*3,y+4);
  }
  if(a.upper.divider)art+='<path d="M'+fmt(X(0))+' '+fmt(Y(g.upperTop))+'V'+fmt(Y(g.bodyTop))+'" stroke="'+frame+'" stroke-dasharray="3 3"/>';
 }
 for(const [side,t] of Object.entries(g.sides)){
  for(const [i,piece] of t.pieces.entries()){
   const x=t.x-t.span/2;
   art+='<g data-trim-side="'+side+'" data-piece="'+(i+1)+'"><title>'+number(piece.height)+' мм</title>'+board(x,piece.bottom,t.span,piece.height,sideColor[side]);
   if(i){
    const left=X(x),right=X(x+t.span),y=Y(piece.bottom);
    art+=line(left-3,y,right+3,y,'#543915');
   }
   art+='</g>';
  }
 }
 if(a.cap)art+=board(g.capX-g.capLength/2,g.upperTop,g.capLength,a.cap.height,cap);
 const left=X(g.minX),right=X(g.maxX),top=Y(g.height);
 art+=line(left,311,right,311)+line(left,308,left,315)+line(right,308,right,315)+label((left+right)/2,328,g.width+' мм','middle',12);
 const dimX=right+14;
 art+=line(dimX,top,dimX,floor)+line(dimX-4,top,dimX+4,top)+line(dimX-4,floor,dimX+4,floor)+label(dimX+7,(top+floor)/2,number(total)+' мм');
 if(a.upper){
  const y=Y(g.bodyTop);
  art+=line(left-12,y,left,y,muted)+label(left-15,y+3,number(s.elevation+g.bodyTop),'end',10);
 }
 let row=349;
 for(const side of trimSides){
  const t=g.sides[side];if(!t)continue;
  const lengths=t.pieces.map(p=>number(p.height)).join(' + ');
  art+=rect(46,row-9,9,9,sideColor[side])+label(62,row,(side==='left'?'Слева':'Справа')+' · '+lengths+' мм');row+=16;
 }
 const fillers=trimSides.filter(side=>g.sides[side]&&!g.sides[side].end);
 if(fillers.length){
  art+=label(46,row+3,'Примыкание фальшпланки к боковине · вид сверху','start',10);
  for(const [i,side] of fillers.entries())art+=fillerPlan(built.parts,side,46+i*104,row+9);
  row+=89;
 }
 const end=trimSides.find(side=>g.sides[side]?.end);
 if(end){
  const t=a[end],y=row+14,span=Math.min(26,t.projection*.7),bodyX=end==='left'?72:56,postX=end==='left'?60:163;
  art+=label(46,y-5,'Торцевая стойка '+(end==='left'?'слева':'справа')+' · вид сверху','start',10)+rect(bodyX,y,107,14,'#ecf1ed')+rect(postX,y,12,14+span,sideColor[end]);
  art+=line(postX+12,y+14,193,y+14,muted)+line(postX+12,y+14+span,193,y+14+span,muted)+line(189,y+14,189,y+14+span,muted)+label(199,y+19,t.projection+' мм от боковины','start',10);
  row=y+20+span;
 }
 const terms=[w,...trimSides.map(side=>g.sides[side]?.span??0).filter(Boolean)];
 const widthText=g.width===terms.reduce((n,x)=>n+x,0)&&terms.length>1?terms.join(' + ')+' = '+g.width:g.width;
 return {svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 370 '+(row+5)+'" role="img" aria-label="Шкаф в сборе" data-view="'+view+'">'+art+'</svg>',
  caption:'Ширина по месту '+widthText+' мм. От пола до верха '+number(total)+' мм.'};
}
