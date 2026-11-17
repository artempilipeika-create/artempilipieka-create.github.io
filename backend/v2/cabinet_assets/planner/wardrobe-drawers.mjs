// Dimensions and series identity are taken from Мульти ящик AKS_доводчика.fr3d.
export const drawerSource='Мульти ящик AKS_доводчика.fr3d';
const articles=['63020','114793','114794','114795','114796','114797','114798','115632'];
export const outerFront=s=>Boolean(s.front||s.drawerBanks?.some(b=>b?.kind==='external'));
export const drawerMember=(id,role)=>new RegExp(':drawer-\\d+-'+role+'$').test(id??'');
export const drawerBottom=id=>drawerMember(id,'\\d+-bottom');
export const drawerSide=id=>drawerMember(id,'\\d+-side-(?:left|right)');
export function railForOpening(depth){
 if(!Number.isFinite(depth)||depth<=250||depth>1000)throw Error('Монтажная глубина для AKS должна быть больше 250 и до 1000 мм.');
 const length=Math.min(600,(Math.ceil(depth/50)-1)*50);
 return {length,article:articles[(length-250)/50]};
}

function frontHeights(bank,n){
 const rows=bank.faces;
 if(!Array.isArray(rows)||!rows.length||rows.length>24)throw Error('Секция '+n+': проверьте количество шуфляд.');
 const autos=rows.filter(f=>f?.height==null).length;
 if(autos>1||autos&&(!Number.isInteger(bank.height)||bank.height<100))throw Error('Секция '+n+': для остатка задайте высоту блока.');
 const remaining=bank.height-rows.reduce((sum,f)=>sum+(f?.height??0),0)-3*rows.length;
 return rows.map((f,i)=>{
  const h=f?.height??remaining;
  if(!Number.isInteger(h)||h<100||h>3000)throw Error('Секция '+n+', фасад '+(i+1)+': высота должна быть от 100 до 3000 мм.');
  return h;
 });
}

export function drawerSections(s,widths){
 if(s.drawerBanks&&s.drawerBanks.length!==widths.length)throw Error('Проверьте количество секций с шуфлядами.');
 let x=-s.width/2+s.thickness;
 return widths.map((clear,i)=>{
  const left=x,right=x+clear,bank=s.drawerBanks?.[i];x=right+s.thickness;
  if(!bank)return null;
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
  let bottom=internal?s.thickness:0;
  const faceFront=s.depth/2+(internal?-3:18);
  const bodyFront=faceFront-18;
  const clearDepth=bodyFront+s.depth/2-(s.backThickness??0);
  const rail=railForOpening(clearDepth);
  const faces=heights.map((height,j)=>{
   const width=bank.faces[j].width??maxWidth;
   if(!Number.isInteger(width*2)||width<40||width>maxWidth)throw Error('Секция '+n+', фасад '+(j+1)+': допустимая ширина 40–'+maxWidth+' мм.');
   const f={width,height,x:(lo+hi)/2,y:bottom+1.5,z:faceFront-9};bottom+=height+3;return f;
  });
  if(bottom>s.height-(internal?s.thickness:0))throw Error('Секция '+n+': блоку шуфляд не хватает '+(bottom-s.height+(internal?s.thickness:0))+' мм.');
  return {section:i,internal,spacerL,spacerR,left,right,mountWidth,center,bodyFront,rail,clearDepth,faces,top:bottom,span:bottom-(internal?s.thickness:0)};
 });
}

// Names and local axes match the board axes used by the planner.
export function buildDrawerBoards(spec,banks,add){
 const t=spec.thickness;
 for(const b of banks){
  if(!b)continue;
  const prefix='drawer-'+b.section+'-',section=' · секция '+(b.section+1);
  const spacerDepth=Math.floor(b.clearDepth),spacerZ=b.bodyFront-spacerDepth/2;
  for(const [side,width,x] of [['left',b.spacerL,b.left+9],['right',b.spacerR,b.right-9]]){
   if(width)add(prefix+'spacer-'+side,'Проставка 18 мм '+(side==='left'?'слева':'справа')+section,'side',b.span,spacerDepth,18,x,t,spacerZ,'1000');
  }
  b.faces.forEach((f,j)=>{
   const id=prefix+j+'-',name=' · шуфляда '+(j+1)+section,L=b.rail.length,W=b.mountWidth-27;
   const y=(j===0?t:Math.round(f.y-1.5))+13,h=Math.floor(f.y+f.height-10-y),z=b.bodyFront-L/2;
   if(h<40)throw Error('Шуфляда '+(j+1)+section+': увеличьте высоту фасада.');
   add(id+'face','Фасад'+name,'front',f.height,f.width,18,f.x,f.y,f.z,'1111');
   for(const [side,sign] of [['left',-1],['right',1]])
    add(id+'side-'+side,(sign<0?'Левая':'Правая')+' боковина'+name,'side',h,L,18,b.center+sign*(W-18)/2,y,z,'1000');
   for(const [end,sign] of [['front',1],['rear',-1]])
    add(id+end,(sign>0?'Передняя':'Задняя')+' стенка'+name,'back',W-36,h,18,b.center,y,z+sign*(L-18)/2,'1000');
   add(id+'bottom','Дно ЛХДФ'+name,'horizontal',W-4,L-4,3,b.center,y-3,z,'0000');
  });
 }
}

export function doorZones(s,leaves,banks){
 if(!banks.some(b=>b&&!b.internal))return leaves;
 const seam=s.sections===2&&leaves.length===2?(banks[0]?banks[0].right+s.thickness/2:banks[1].left-s.thickness/2)+s.width/2:null;
 return leaves.map((l,i)=>{
  const left=seam!==null&&i===1?seam+1.5:l.left;
  const width=seam===null?l.width:i?s.width-seam-3:seam-3;
  const a=left-s.width/2,covered=banks.filter(b=>b&&Math.min(a+width,b.right)>Math.max(a,b.left));
  const top=Math.max(0,...covered.filter(b=>!b.internal).map(b=>b.top));
  if(top&&covered.some(b=>b.internal))throw Error('Разделите створки для внутренних и наружных шуфляд по секциям.');
  return {...l,left,width,bottom:l.bottom+top,height:l.height-top};
 });
}
