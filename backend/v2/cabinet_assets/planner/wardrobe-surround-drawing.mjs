import {footHeight} from './plinth-options.mjs';
import {trimSides} from './wardrobe-surround.mjs';

const fmt=v=>Number(v.toFixed(2));
const frame='#355a54',muted='#506762',leaves='#e2eeea',upper='#b9d7cc',cap='#d5c5b2';
const sideColor={left:'#e7bb75',right:'#9abbd5'};
const rect=(x,y,w,h,fill,stroke=frame)=>'<rect x="'+fmt(x)+'" y="'+fmt(y)+'" width="'+fmt(w)+'" height="'+fmt(h)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1"/>';
const line=(x1,y1,x2,y2,stroke=frame)=>'<line x1="'+fmt(x1)+'" y1="'+fmt(y1)+'" x2="'+fmt(x2)+'" y2="'+fmt(y2)+'" stroke="'+stroke+'"/>';
const label=(x,y,value,anchor='start',size=11)=>'<text x="'+fmt(x)+'" y="'+fmt(y)+'" text-anchor="'+anchor+'" fill="'+frame+'" font-size="'+size+'">'+value+'</text>';
export function surroundDrawing(built,view){
 const s=built.spec,a=s.surround??{},g=built.envelope,k=Math.min(235/g.width,238/g.height),floor=258;
 const X=x=>148+(x-g.centerX)*k,Y=y=>floor-y*k,board=(x,y,w,h,fill)=>rect(X(x),Y(y+h),w*k,h*k,fill);
 const feet=footHeight(s),w=s.width,lo=-w/2;
 let art=board(lo,feet,w,s.height,'#f0f4f1');
 if(feet)art+=board(lo,0,w,feet,'#e3e5de');
 for(const leaf of built.doors??[])art+=board(lo+leaf.left,feet+leaf.bottom,leaf.width,leaf.height,leaves);
 if(!s.front){
  for(const p of built.parts.filter(p=>p.key.startsWith('shelf-')||/^divider-/.test(p.key))){
   const it=p.item;art+=board(it.x-it.width/2,it.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0),it.width,it.height,'#c4d2ca');
  }
 }
 if(a.upper){
  art+=board(lo,g.bodyTop,w,a.upper.height,upper);
  for(const p of built.parts.filter(p=>p.key.startsWith('mezz-door-'))){
   const it=p.item;art+=board(it.x-it.width/2,it.elevation_mm-s.elevation,it.width,it.height,upper);
   const x=X(it.x),y=Y(g.bodyTop+a.upper.height/2),dir=p.key.endsWith('left')?-1:1;
   art+=a.upper.opening==='lift'?line(x-5,y+3,x,y-3)+line(x,y-3,x+5,y+3):line(x-dir*3,y-4,x+dir*3,y)+line(x+dir*3,y,x-dir*3,y+4);
  }
  if(a.upper.divider)art+='<path d="M'+fmt(X(0))+' '+fmt(Y(g.upperTop))+'V'+fmt(Y(g.bodyTop))+'" stroke="'+frame+'" stroke-dasharray="3 3"/>';
 }
 for(const [side,t] of Object.entries(g.sides))art+=board(t.x-t.span/2,t.bottom,t.span,t.h,sideColor[side]);
 if(a.cap)art+=board(-g.capLength/2,g.upperTop,g.capLength,a.cap.height,cap);
 const left=X(g.minX),right=X(g.maxX),top=Y(g.height);
 art+=line(left,269,right,269)+line(left,265,left,273)+line(right,265,right,273)+label((left+right)/2,285,g.width+' мм','middle',12);
 art+=line(281,top,281,floor)+line(277,top,285,top)+line(277,floor,285,floor)+label(291,(top+floor)/2,g.height+' мм');
 let y=305;
 for(const [on,name,color] of [[g.sides.left,'Слева',sideColor.left],[g.sides.right,'Справа',sideColor.right],[a.upper,'Антресоль',upper],[a.cap,'Закладная',cap]]){
  if(!on)continue;const i=(y-305)/15;art+=rect(i%2?201:26,305+Math.floor(i/2)*16-8,9,9,color)+label(i%2?217:42,305+Math.floor(i/2)*16,name);y+=15;
 }
 const end=trimSides.find(side=>g.sides[side]?.end);
 if(end){
  const t=a[end],y0=356,span=Math.min(26,t.projection*.7),bodyX=end==='left'?52:36,postX=end==='left'?40:143;
  art+=label(26,y0-10,'Торцевая стойка '+(end==='left'?'слева':'справа')+' · вид сверху')+rect(bodyX,y0,107,16,'#ecf1ed')+rect(postX,y0,12,16+span,sideColor[end]);
  art+=line(postX+12,y0+16,175,y0+16,muted)+line(postX+12,y0+16+span,175,y0+16+span,muted)+line(171,y0+16,171,y0+16+span,muted)+label(181,y0+29,t.projection+' мм от боковины');
 }
 const widthTerms=[w,...trimSides.map(side=>g.sides[side]?.span??0).filter(Boolean)];
 const widthText=g.width===widthTerms.reduce((n,x)=>n+x,0)&&widthTerms.length>1?widthTerms.join(' + ')+' = '+g.width:g.width;
 const total='Ширина по месту '+widthText+' мм. От пола до верха '+(s.elevation+g.height)+' мм.';
 return {svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 370 '+(end?400:337)+'" role="img" aria-label="Шкаф в сборе" data-view="'+view+'">'+art+'</svg>',caption:total};
}

