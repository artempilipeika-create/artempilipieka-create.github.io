import {plateSpan,spacerReachesHinge} from './wardrobe-hinge-fit.mjs';
import {hingeCatalogue,activeLeafKeys,hingeProduct,settingFor,bandKey,onDivider,insetDepth,depthBehindDoor,middleDivider,usesDivider} from './wardrobe-hinge-layout.mjs';
import {rearClearance} from './panel-machining.mjs';
import {sectionOf,isRightBank,levelOf,splitAt,columnWidths,nicheSlot} from './wardrobe-layout.mjs';
import aks from './aks-wardrobe.json' with {type:'json'};
import {anchoredShelf} from './wardrobe-door-layout.mjs';
import {fittedFaceHeights,frontEdgeGap,coverClearance,mm} from './wardrobe-niches.mjs';
import prime from './wardrobe-prime.json' with {type:'json'};
export function concealedRail(depth,opening='soft'){
 const length=Math.min(550,Math.floor((depth-3)/50)*50),product=prime[opening]?.[length];
 if(!product)throw Error('Для скрытых направляющих PRIME нужна монтажная глубина от 303 мм.');
 return {family:'concealed',opening,length,...product};
}
export const drawerSource='Мульти ящик AKS_доводчика.fr3d';

export function frontProjection(s){
 const faces=activeLeafKeys(s.front).map(key=>hingeProduct(s.front,key).kind==='inset'?0:18+(settingFor(s.front,key).push?3:0));
 return Math.max(0,...faces,...(s.drawerBanks??[]).map(b=>b?.kind==='external'?18+(b.railFamily==='concealed'&&b.opening==='push'?4:0):0));
}
export const outerFront=s=>frontProjection(s)>0;
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
export function spacerCuts(bottom,height,axes,side='left',front=Infinity){
 const slots=[];
 for(const entry of [...axes].sort((a,b)=>(a.y??a)-(b.y??b))){
  const axis=entry.y??entry,fit=hingeCatalogue[entry.article];
  if(fit&&!spacerReachesHinge(fit,entry.z,front))continue;
  const [a,b]=fit?plateSpan(fit,side):side==='left'?[-25,26]:[-26,25];
  if(!overlaps(bottom,bottom+height,axis+a-(fit?2:0),axis+b+(fit?2:0)))continue;
  const low=Math.max(0,axis+(fit?a-2:-35)-bottom),high=Math.min(height,axis+(fit?b+2:35)-bottom);
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
   if(cuts[side].some(([lo,hi])=>overlaps(f.railY-(b.railRadius??22.5),f.railY+(b.railRadius??22.5),b.base+lo,b.base+hi)))
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
 if(banks.length<widths.length||banks.length>88)throw Error('Проверьте количество ниш с шуфлядами.');
 return banks.map((bank,slot)=>{
  if(!bank)return null;
  const i=sectionOf(slot),sectionWidth=widths[i];
  if(sectionWidth==null)throw Error('Проверьте секцию шуфляд.');
  const split=splitAt(s,i,levelOf(slot)),shared=split?.kind==='drawers',rightBank=isRightBank(slot);
  if(rightBank&&!shared)throw Error('Для правого блока нужна общая перегородка.');
  const halves=shared?columnWidths(split,sectionWidth):null;
  const clear=shared?halves[Number(rightBank)]:sectionWidth;
  const left=-s.width/2+s.thickness+widths.slice(0,i).reduce((sum,w)=>sum+w+s.thickness,0)+(rightBank?halves[0]+18:0),right=left+clear;
  const internal=bank.kind==='internal';
  if(!internal&&bank.kind!=='external')throw Error('Выберите исполнение шуфляд.');
  const divide=s.front?.division,cut=divide?anchoredShelf(s):null,n=i+1;
  const above=cut&&(internal?s.thickness:0)+(bank.bottomOffset??0)>=cut.y;
  const onSide=side=>{const key=bandKey(s.front,side,above);return key&&!onDivider(s.front,key);};
  const spacerL=internal&&!rightBank&&i===0&&onSide('left')?18:0;
  const spacerR=internal&&(!shared||rightBank)&&i===widths.length-1&&onSide('right')?18:0;
  const mountWidth=clear-spacerL-spacerR;
  if(mountWidth<163)throw Error('Секция '+n+': монтажный проём AKS должен быть от 163 мм.');
  const center=(left+spacerL+right-spacerR)/2;
  let lo=internal?left+spacerL:left-(i===0?s.thickness:s.thickness/2);
  let hi=internal?right-spacerR:right+(i===widths.length-1?s.thickness:s.thickness/2);
  if(shared){
   const overlap=split.edge==='overlay'?9:0;
   if(rightBank)lo=left-overlap;else hi=right+overlap;
  }
  const maxWidth=hi-lo-3,heights=frontHeights(bank,n);
  const offset=bank.bottomOffset??0;
  if(!Number.isInteger(offset)||offset<0||offset>3000)throw Error('Положение блока задаётся в целых мм от 0 до 3000.');
  const base=(internal?s.thickness:0)+offset;
  // Equal cuts round down to 0.001 mm. Keep the specified shelf clearance exact.
  const rounding=bank.coverFixing?mm(bank.height-frontEdgeGap-coverClearance-bank.gap*(heights.length-1)-heights.reduce((sum,h)=>sum+h,0)):0;
  let bottom=mm(base+rounding);
  const seam=s.front?.hinges&&(usesDivider(s.front)||s.sections===2)?middleDivider(s).x:s.width/2;
  const rowKeys=['left','right'].flatMap(side=>{
   const key=bandKey(s.front,side,above);
   if(!key)return [];
   const paired=s.front?.division?(s.front.division.scope!=='all'||(above?s.front.division.above:s.front.division.below)==='pair'):s.front?.swing==='pair';
   if((paired||onDivider(s.front,key))&&(side==='left'?left+s.width/2>=seam:right+s.width/2<=seam))return [];
   return [key];
  });
  const insetSetback=Math.max(0,...rowKeys.map(key=>depthBehindDoor(s,key)));
  const concealed=bank.railFamily==='concealed',push=concealed&&bank.opening==='push';
  if(concealed&&(mountWidth<(push?226:200)||(push&&mountWidth>1206)))throw Error('Проверьте монтажную ширину PRIME: '+(push?'226–1206 мм с синхронизатором.':'от 200 мм.'));
  const setback=Math.max(3,insetSetback);
  let faceFront=s.depth/2+(internal?-setback:18+(push?4:0));
  let bodyFront=faceFront-18,clearDepth=bodyFront+s.depth/2-rearClearance(s);
  const rail=concealed?concealedRail(clearDepth-(push?4:0),bank.opening):railForOpening(clearDepth,legacy);
  let hingeSetback=0;
  if(internal&&bank.hingeClearanceMm&&rowKeys.length){
   const deepestDoor=Math.max(...rowKeys.map(key=>hingeProduct(s.front,key).kind==='inset'?
    18+insetDepth(s.front,key):settingFor(s.front,key).push?-3:0));
   const shift=deepestDoor+bank.hingeClearanceMm-setback;
   // Retain the selected guide and its specified rear installation allowance.
   if(shift>0&&clearDepth-shift-(push?4:0)>=rail.length+(concealed?3:5)){
    hingeSetback=shift;faceFront-=shift;bodyFront-=shift;clearDepth-=shift;
   }
  }
  const mountFront=bodyFront-(push?4:0),railLift=push?20:17,railRadius=concealed?(push?23.5:23):22.5;
  // Separate opposing screw axes on an 18 mm partition while keeping facade heights fixed.
  let stagger=0;
  if(concealed){
   const level=levelOf(slot),columns=widths.flatMap((_,section)=>splitAt(s,section,level)?.kind==='drawers'?[nicheSlot(section,level),nicheSlot(section,level,1)]:[nicheSlot(section,level)]);
   const at=columns.indexOf(slot);
   let adjacent=0;
   for(let k=at-1;k>=0&&banks[columns[k]]?.railFamily==='concealed';k--)adjacent++;
   stagger=adjacent%2*8;
  }
  const faces=heights.map((height,j)=>{
   const width=bank.faces[j].width??maxWidth;
   if(!Number.isInteger(width*2)||width<40||width>maxWidth)throw Error('Секция '+n+', фасад '+(j+1)+': допустимая ширина 40–'+maxWidth+' мм.');
   const boxY=Math.round(Math.max(s.thickness,bottom))+(concealed?railLift+stagger:13);
   const f={width,height,x:(lo+hi)/2,y:mm(bottom+frontEdgeGap),z:faceFront-9,boxY,hardwareBottom:concealed?boxY-railLift:boxY-3,railY:concealed?boxY-railLift+railRadius:boxY+40};
   bottom=mm(bottom+height+(bank.layout?bank.gap:3));return f;
  });
  if(bank.layout)bottom=base+bank.height;
  if(bottom>s.height-(internal?s.thickness:0))throw Error('Секция '+n+': блоку шуфляд не хватает '+(bottom-s.height+(internal?s.thickness:0))+' мм.');
  return {section:i,slot,legacy,base,internal,spacerL,spacerR,left,right,mountWidth,center,bodyFront,mountFront,rail,railRadius,hingeSetback,faceFixing:bank.faceFixing??'cam',clearDepth,faces,top:bottom,span:bottom-base};
 });
}

// Names and local axes match the board axes used by the planner.
export function buildDrawerBoards(spec,banks,add){
 for(const b of banks){
  if(!b)continue;
  const prefix='drawer-'+b.slot+'-',section=' · секция '+(b.section+1);
  const spacerDepth=b.legacy?Math.floor(b.clearDepth):b.rail.length,spacerZ=(b.mountFront??b.bodyFront)-spacerDepth/2;
  for(const [side,width,x] of [['left',b.spacerL,b.left+9],['right',b.spacerR,b.right-9]]){
   if(width)add(prefix+'spacer-'+side,'Проставка 18 мм '+(side==='left'?'слева':'справа')+section,'side',b.span,spacerDepth,18,x,b.base,spacerZ,'1000');
  }
  b.faces.forEach((f,j)=>{
   const id=prefix+j+'-',name=' · шуфляда '+(j+1)+section,L=b.rail.length,W=b.mountWidth-27;
   const y=f.boxY,h=Math.floor(Math.min(f.y+f.height-10,f.boxTop??Infinity)-y),z=b.bodyFront-L/2;
   if(b.rail.family==='concealed'){
    const depth=L-10,outer=b.mountWidth-13,inner=outer-36,cz=b.bodyFront-depth/2;
    if(h<70)throw Error('Шуфляда '+(j+1)+section+': для короба PRIME увеличьте высоту фасада.');
    if(b.faceFixing!=='plank'&&Math.abs(f.x-b.center)+(outer-18)/2+6>f.width/2)throw Error('Фасад слишком узкий для штоков в боковинах PRIME. Увеличьте ширину или выберите переднюю планку.');
    add(id+'face','Фасад'+name,'front',f.height,f.width,18,f.x,f.y,f.z,'1111');
    for(const [side,sign] of [['left',-1],['right',1]])
     add(id+'side-'+side,(sign<0?'Левая':'Правая')+' боковина'+name,'side',h,depth,18,b.center+sign*(outer-18)/2,y,cz,'0101');
    for(const [end,sign] of [['front',1],['rear',-1]]){
     if(sign>0&&b.faceFixing!=='plank')continue;
     add(id+end,(sign>0?'Передняя':'Задняя')+' стенка'+name,'back',inner,h-30,18,b.center,y+30,cz+sign*(depth-18)/2,'0100');
    }
    add(id+'bottom','Дно ЛДСП 18 мм'+name,'horizontal',inner,depth,18,b.center,y+12,cz,'0000');
    return;
   }
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
 const seam=s.sections===2&&leaves.length===2?(s.nicheSplits?.some(z=>z.kind==='drawers')?
   (s.dividerPositions?.[0]??Math.ceil((s.width-3*s.thickness)/2))+1.5*s.thickness:
   (reference.section===0?reference.right+s.thickness/2:reference.left-s.thickness/2)+s.width/2):null;
 return leaves.map((l,i)=>{
  const left=seam!==null&&i===1?seam+1.5:l.left;
  const width=seam===null?l.width:i?s.width-seam-3:seam-3;
  const a=left-s.width/2,covered=banks.filter(b=>b&&Math.min(a+width,b.right)>Math.max(a,b.left));
  const top=Math.max(0,...covered.filter(b=>!b.internal).map(b=>b.top));
  if(top&&covered.some(b=>b.internal&&b.base<top))throw Error('Разделите створки для внутренних и наружных шуфляд по секциям.');
  return {...l,left,width,bottom:l.bottom+top,height:l.height-top};
 });
}
