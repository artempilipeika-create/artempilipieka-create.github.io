import {sectionWidths} from './carcass-model.mjs';
import {backRows} from './carcass-joints.mjs';
import {footPlan,feetCatalogue} from './wardrobe-feet.mjs';
import {footHeight,plinthPanel,floorSide} from './plinth-options.mjs';
import {turn} from './decor-feet.mjs';
import {doorLeaves,swingNames} from './door-swing.mjs';

export const drawingTitles={body:'Корпус',sections:'Секции и полки',feet:'Опоры',plinth:'Цоколь',back:'Задняя стенка',fronts:'Фасады'};
const edge='#495b54',accent='#19664f',wood='#e6dcc9',end='#c4b8a2';
const num=n=>Number(n.toFixed(2));
const points=p=>p.map(([x,y])=>num(x)+','+num(y)).join(' ');
const polygon=(p,fill)=>'<polygon points="'+points(p)+'" fill="'+fill+'" stroke="'+edge+'" stroke-width=".9" stroke-linejoin="round"/>';
const label=(x,y,s)=>'<text x="'+num(x)+'" y="'+num(y)+'" text-anchor="middle" fill="'+edge+'" font-size="12">'+s+'</text>';
const line=(x,y,a,b,style='')=>'<path d="M'+num(x)+' '+num(y)+' L'+num(a)+' '+num(b)+'" fill="none" stroke="'+edge+'" '+style+'/>';
const rect=(x,y,w,h,color,stroke=edge)=>'<rect x="'+num(x)+'" y="'+num(y)+'" width="'+num(w)+'" height="'+num(h)+'" fill="'+color+'" stroke="'+stroke+'" stroke-width=".9"/>';
const circle=(x,y,r,fill,stroke=accent)=>'<circle cx="'+num(x)+'" cy="'+num(y)+'" r="'+num(r)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1"/>';
const sheet=(view,body)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 324" role="img" aria-label="'+drawingTitles[view]+'" data-view="'+view+'">'+body+'</svg>';

function openCabinet(built){
 const s=built.spec,H=built.height+footHeight(s),D=s.depth,W=s.width;
 const scale=Math.min(326/(W+.46*D),270/(H+.2*D));
 const point=(x,y,z)=>[200+(x-.46*z)*scale,160+((H/2-y)+.20*z)*scale];
 const order=({key,item})=>key==='back'?-1e5:key==='right'?1e5:key==='top'?2e5:key==='left'?-1e4:item.elevation_mm;
 const panels=built.parts.filter(p=>p.item.blank_axis!=='front').sort((a,b)=>order(a)-order(b));
 return panels.map(({key,item:i})=>{
   const x=i.x-i.width/2,X=x+i.width,y=i.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0),Y=y+i.height;
   const z=i.z-i.depth/2,Z=z+i.depth,glass=i.blank_shelf&&!i.blank_shelf.startsWith('board/');
   return '<g data-panel="'+key+'">'+polygon([point(x,Y,z),point(X,Y,z),point(X,Y,Z),point(x,Y,Z)],glass?'#d2e7e3':'#f3ebdd')+
     polygon([point(X,y,z),point(X,Y,z),point(X,Y,Z),point(X,y,Z)],glass?'#c0d6d0':end)+
     polygon([point(x,y,Z),point(X,y,Z),point(X,Y,Z),point(x,Y,Z)],glass?'#d6e7e0':key==='back'?'#dedbcc':wood)+'</g>';
 }).join('');
}
function elevationView(built,view,section,front){
 const s=built.spec,H=built.height+footHeight(s),W=s.width;
 const zoom=view==='plinth',height=zoom?Math.min(H,Math.max(240,footHeight(s)+W*.22)):H;
 const facade=view==='fronts';
 const k=Math.min(328/W,(zoom?200:facade?224:258)/height),bottom=zoom?238:facade?253:289;
 const X=x=>200+x*k,Y=y=>bottom-y*k;
 const panel=i=>({x:i.x-i.width/2,y:i.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0),w:i.width,h:i.height});
 let drawing='';
 const ordered=built.parts.filter(p=>p.item.blank_axis!=='front').sort((a,b)=>panelOrder(a)-panelOrder(b));
 function panelOrder(p){return p.key==='back'?-3:p.key==='plinth'?2:0;}
 for(const {key,item} of ordered){
   const q=panel(item);if(q.y>=height)continue;
   const grey=key==='back'?'#edece5':wood;
   drawing+=rect(X(q.x),Y(Math.min(height,q.y+q.h)),q.w*k,(Math.min(height,q.y+q.h)-q.y)*k,key==='plinth'&&zoom?'#bed9cd':grey);
 }
 if(facade&&front)drawing+=doorLeaves(s,front.swing,X(-W/2),Y(footHeight(s)),k,40)+label(200,312,swingNames[front.swing]);
 if(view==='sections'){
   const widths=sectionWidths(s);section=Math.max(0,Math.min(widths.length-1,section));
   const left=-W/2+s.thickness+widths.slice(0,section).reduce((sum,w)=>sum+w+s.thickness,0);
   const y=footHeight(s)+s.thickness;
   drawing+='<rect x="'+num(X(left))+'" y="'+num(Y(H-s.thickness))+'" width="'+num(widths[section]*k)+'" height="'+num((H-s.thickness-y)*k)+'" fill="'+accent+'" fill-opacity=".07" stroke="'+accent+'" stroke-width="1.8"/>';
   drawing+=label(200,313,'Секция '+(section+1)+' · '+widths[section]+' мм');
 }
 if(zoom){
   drawing+=line(X(-W/2)-10,Y(0)+1,X(W/2)+10,Y(0)+1);
   for(const [key,sign] of [['left',-1],['right',1]]){
     const x=X(sign*W/2);
     drawing+=line(x,Y(0)+2,x,257)+line(x,257,200+sign*98,257)+label(200+sign*98,279,plinthPanel(s)?floorSide(s,key)?'Стойка в пол':'До края / стены':'Без цоколя');
   }
 }
 return drawing;
}
function underside(s){
 const k=Math.min(318/s.width,222/s.depth),L=200-s.width*k/2,T=162-s.depth*k/2;
 const X=x=>200+x*k,Y=z=>162+z*k;
 let d=rect(L,T,s.width*k,s.depth*k,wood),t=s.thickness*k;
 for(const edgeX of [L,L+s.width*k-t])d+=rect(edgeX,T,t,s.depth*k,end);
 const board=plinthPanel(s);if(board)d+=rect(X(board.x-board.width/2),Y(board.z-s.thickness/2),board.width*k,t,'#c2d2c8');
 const fitting=feetCatalogue.find(f=>f.article===s.feet?.article);
 for(const f of footPlan(s)){
   const x=X(f.x),y=Y(f.z),r=Math.max(4,(fitting?.radius??12)*k);
   if(fitting?.hull&&!f.centre)d+=polygon(fitting.hull.map(v=>{const [a,b]=turn(v,f.yaw);return [X(f.x+a),Y(f.z+b)];}),'#bdd8cd');
   d+=circle(x,y,r,'#d3e6dc')+circle(x,y,Math.max(2,r*.42),accent);
 }
 return d+label(200,T-12,'Задний край')+label(200,T+s.depth*k+22,'Передний край');
}
function rear(built){
 const s=built.spec,W=s.width,H=s.height+footHeight(s),k=Math.min(320/W,263/H);
 const X=x=>200-x*k,Y=y=>294-y*k;
 let d=rect(X(W/2),Y(H),W*k,s.height*k,wood);
 const p=built.parts.find(p=>p.key==='back')?.item;
 if(!p)return openBack();
 const y=p.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0);
 d+=rect(X(p.width/2),Y(y+p.height),p.width*k,p.height*k,s.backThickness?'#ede3cf':'#f5f4ee');
 const meta={spec:s,group_id:p.item_id.slice(0,-5)};
 const rows=backRows({...p,assistant_carcass:meta});
 for(const r of rows){
   const cam=r.kind==='cam',inset=cam?34:14;
   d+=circle(X(r.x+r.dx*inset),Y(y+r.y+r.dy*inset),cam?2.9:1.75,cam?accent:'#fff');
 }
 return d;
 function openBack(){
   return built.parts.filter(({item:i})=>i.blank_axis!=='front').map(({item:i})=>{
     const y=i.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0);
     return rect(X(i.x+i.width/2),Y(y+i.height),i.width*k,i.height*k,wood);
   }).join('');
 }
}
export function wardrobeDrawing(built,view='body',section=0,front=built.spec.front){
 const s=built.spec,feet=footPlan(s),shelves=(s.sectionShelves??Array(s.sections).fill(s.shelves)).reduce((a,b)=>a+b,0);
 const art=view==='body'?openCabinet(built):view==='back'?rear(built):view==='feet'?underside(s):elevationView(built,view,section,front);
 const notes={body:s.sections+' секц. · полок '+shelves+' · плита '+s.thickness+' мм',sections:'Вид спереди · чистая ширина выделенной секции',
   feet:feet.length?'Установлено опор: '+feet.length+' · арт. '+s.feet.article:'Опоры не выбраны',
   plinth:plinthPanel(s)?'Планка '+plinthPanel(s).height+' мм · верхний зазор 3 мм':'Цоколь для этого исполнения отсутствует',
   back:s.backThickness?'ЛДСП '+s.backThickness+' мм · ● эксцентрик   ○ шкант':s.back?'Накладная ЛХДФ 3 мм':'Открытый корпус без задней стенки',
   fronts:front?'Зазор по периметру 1,5 мм'+(front.swing==='pair'?' · между створками 3 мм':''):'Открытый шкаф'};
 return {svg:sheet(view,art),caption:notes[view]};
}
