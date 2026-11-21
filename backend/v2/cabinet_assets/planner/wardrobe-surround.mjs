import {blankEdgeCode} from './furniture-core.mjs';
import {blankItem,validateBlank} from './blanks-model.mjs';
import {footHeight} from './plinth-options.mjs';
import {backPanel,backSideTrim,backTrim,backCut,rearProjection} from './panel-machining.mjs';
import {frameDepth} from './wardrobe-hinge-layout.mjs';
import {frontProjection} from './wardrobe-drawers.mjs';

import {sideBottom,trimPieces,trimSides} from './wardrobe-trim-layout.mjs';
import {worldPoint,localPoint} from './blank-bindings.mjs';
export {trimSides};
export const upperPush=()=>({article:'70787',mount:'auto',support:'auto',heightMm:1050});
export const surroundPart=key=>key.startsWith('trim-')||key.startsWith('mezz-');
export const surroundFace=key=>/^trim-(?:left|right)-(?:\d+-)?(?:face|end)$|^trim-cap-(?:face|base)$|^mezz-door-/.test(key);
export const hasSurround=s=>Boolean(s?.left||s?.right||s?.upper||s?.cap);
const sideNames={left:'Левая',right:'Правая'};
const ranges=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error(label+' · от '+min+' до '+max+' мм.');};
export function surroundLayout(s,facades){
 const a=s.surround??{},bodyTop=footHeight(s)+s.height,upperTop=bodyTop+(a.upper?.height??0);
 const upperDepth=a.upper?.frame?frameDepth+2:20;
 const lower=frontProjection(s),sidePlane=s.depth/2+(s.front||lower?lower:(a.upper?upperDepth:18));
 let minX=-s.width/2,maxX=s.width/2,minZ=-s.depth/2-rearProjection(s),maxZ=s.depth/2+lower,height=upperTop+(a.cap?.height??0);
 const sides={},span=side=>a[side]?.kind==='end'?18:a[side]?.width??0;
 const over=a.cap?.fit==='over',capX=over?(span('right')-span('left'))/2:0;
 const capLength=over?s.width+span('left')+span('right'):a.cap?.length??s.width,capPlane=a.upper?s.depth/2+upperDepth:sidePlane;
 let minY=0;
 if(hasSurround(a)&&s.thickness!==18)throw Error('Для фальшпланок и антресоли выберите плиту корпуса 18 мм.');
 if(a.upper){
  ranges(a.upper.height,150,1500,'Высота антресоли');
  if(![1,2].includes(a.upper.leaves)||!['swing','lift'].includes(a.upper.opening)||!['left','right'].includes(a.upper.side))throw Error('Проверьте количество створок и открывание антресоли.');
  const leafWidth=s.width/a.upper.leaves-3;
  if(leafWidth>(a.upper.opening==='swing'?600:1200))throw Error('Створка антресоли слишком широкая. Измените число створок или открывание в шаге «Фасады».');
  if(a.upper.frame&&a.upper.opening!=='swing')throw Error('Рамка Z1 с этими петлями рассчитана на распашную антресоль.');
  maxZ=Math.max(maxZ,s.depth/2+upperDepth);
 }
 for(const side of trimSides){
  const t=a[side];if(!t)continue;
  const end=t.kind==='end',span=end?18:t.width,depth=end?t.depth:100;
  if(!end&&t.kind!=='filler')throw Error('Выберите исполнение боковой фальшпланки.');
  if(end){ranges(depth,40,1200,'Глубина торцевой стойки');ranges(t.projection,0,300,'Выступ от боковины');}
  else ranges(span,40,1200,'Ширина лица фальшпланки');
  const sign=side==='left'?-1:1,x=sign*(s.width+span)/2,front=end?s.depth/2+t.projection:sidePlane;
  const belowCap=Boolean(a.cap&&x-span/2<capX+capLength/2&&x+span/2>capX-capLength/2&&front>capPlane-100&&front-depth<capPlane);
  const bottom=sideBottom(s,side,t,facades),mode=t.heightMode??'body';
  if(t.start==null)ranges(bottom,0,4900,'Низ боковой детали');
  if(!['custom','body','full','assembly'].includes(mode))throw Error('Выберите привязку высоты боковой детали.');
  const top=mode==='custom'?bottom+t.height:mode==='body'?bodyTop:mode==='full'||belowCap||over?upperTop:upperTop+(a.cap?.height??0);
  if(s.overallHeight!=null&&top+s.elevation>s.overallHeight+.00001)throw Error('Боковая деталь выходит выше заданной общей высоты шкафа.');
  if(belowCap&&bottom<upperTop+a.cap.height&&top>upperTop)throw Error('Закладная пересекает боковую деталь. Выберите высоту планки до закладной или измените её длину.');
  const pieces=trimPieces(bottom,top,t.split,a.upper?bodyTop:null),h=top-bottom;
  sides[side]={end,span,depth,bottom,h,x,front,sign,pieces};
  minY=Math.min(minY,bottom);
  minX=Math.min(minX,x-span/2);maxX=Math.max(maxX,x+span/2);
  minZ=Math.min(minZ,front-depth);maxZ=Math.max(maxZ,front);height=Math.max(height,bottom+h);
 }
 if(a.cap){
  ranges(a.cap.height,40,1200,'Высота закладной');ranges(capLength,100,3000,'Длина закладной');
  minX=Math.min(minX,capX-capLength/2);maxX=Math.max(maxX,capX+capLength/2);
  minZ=Math.min(minZ,capPlane-100);maxZ=Math.max(maxZ,capPlane);
 }
 return {sides,bodyTop,upperTop,capLength,capPlane,capX,minX,maxX,minY,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ,height,centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2};
}

export function surroundParts(s,g,prefix,options={}){
 const parts=[],a=s.surround??{},name=options.name||s.label;
 const board=(key,label,axis,length,partWidth,x,y,z,edges,custom={})=>{
  const framed=axis==='front'&&a.upper?.frame==='Z1';
  const item=blankItem({item_id:prefix+':'+key,name:name+' · '+label+(framed?' · витрина Z1':''),axis,length,partWidth,thickness:framed?frameDepth:18,x,z,
   ...(framed?{blank_front_frame:'Z1'}:{}),
   elevation:s.elevation+y,edges:framed?'0000':edges,blank_edge_thickness_mm:axis==='front'?2:1,body_variant_id:framed?null:(surroundFace(key)?options.frontMaterialId:options.bodyMaterialId)??null,...custom});
  const error=validateBlank(item,null,s.backMount);if(error)throw Error(label+' · '+error);
  parts.push({key,label,item});
 };
 for(const [side,t] of Object.entries(g.sides)){
  t.pieces.forEach(({bottom,height},i)=>{
   const key='trim-'+side+'-'+(i?(i+1)+'-':'');
   const label=sideNames[side]+(t.end?' торцевая стойка':' фальшпланка')+(t.pieces.length>1?' · часть '+(i+1):'');
   if(t.end)board(key+'end',label,'side',height,t.depth,t.x,bottom,t.front-t.depth/2,'1111');
   else{
    board(key+'face',label+' · глухой фасад','back',t.span,height,t.x,bottom,t.front-9,'1111');
    board(key+'return',label+' · боковая проставка','side',height,82,t.sign*(s.width/2+9),bottom,t.front-59,'0111');
   }
  });
 }
 if(a.upper){
  const u=a.upper,w=s.width,d=s.depth,y=g.bodyTop;
  const upper={...s,height:u.height,top:'inset',bottom:'inset',back:true,backThickness:s.back?s.backThickness:18};
  const back=backPanel(upper),trim=backTrim(upper.backMount);
  const machining=key=>{
   const cut=backCut(upper,key,0);
   return cut?{blank_machining:[cut]}:{};
  };
  for(const [side,sign] of [['left',-1],['right',1]]){
   const cutback=backSideTrim(upper.backMount,side);
   board('mezz-'+side,'Антресоль · '+sideNames[side].toLowerCase()+' стойка','side',u.height,d-cutback,sign*(w-18)/2,y,cutback/2,'1011',machining(side));
  }
  board('mezz-bottom','Антресоль · дно','horizontal',w-36,d-trim,0,y,trim/2,'1000',machining('bottom'));
  board('mezz-top','Антресоль · крыша','horizontal',w-36,d-trim,0,g.upperTop-18,trim/2,'1000',machining('top'));
  board('mezz-back','Антресоль · задняя стенка','back',back.length,back.width,back.x,y+back.y,back.z,'0000',
   {thickness:back.thickness,body_variant_id:(s.back?options.backMaterialId:options.bodyMaterialId)??null});
  const clearance=Math.max(0,Math.ceil(d/2+back.z+back.thickness/2));
  if(u.divider)board('mezz-divider','Антресоль · перегородка','side',u.height-36,d-clearance,0,y+18,clearance/2,'1000');
  for(const side of u.leaves===2?trimSides:[u.side]){
   const x=u.leaves===2?(side==='left'?-1:1)*w/4:0;
   board('mezz-door-'+side,'Антресоль · '+(u.leaves===1?'фасад':side==='left'?'левый фасад':'правый фасад'),'front',u.height-3,w/u.leaves-3,x,y+1.5,d/2+2+(u.frame?frameDepth:18)/2,'1111');
  }
 }
 if(a.cap){
  const z=g.capPlane,w=g.capLength,y=g.upperTop,h=a.cap.height;
  board('trim-cap-face','Закладная под потолок · лицевая планка','back',w,h,g.capX,y,z-9,'1111');
  board('trim-cap-upright','Закладная под потолок · внутренняя планка','back',w,h-18,g.capX,y+18,z-27,'0000');
  board('trim-cap-base','Закладная под потолок · нижняя планка','horizontal',w,82,g.capX,y,z-59,'1011');
 }
 return parts;
}

// Old upper boxes have full-depth, unmachined panels. Upgrade only that exact
// assembly so a manually moved or machined panel is never overwritten.
export function fitSavedMezzanineBacks(items){
 const byId=new Map(items.map(item=>[item.item_id,item]));
 for(const base of [...items]){
  const meta=base.assistant_carcass,s=meta?.spec,u=s?.surround?.upper;
  if(!u||base.item_id!==meta.group_id+':mezz-bottom'||byId.has(meta.group_id+':mezz-back')||items.length>=100)continue;
  const prefix=meta.group_id,get=k=>byId.get(prefix+':'+k),rotation=base.rotation||0;
  const anchor=localPoint(base,rotation),y=base.elevation_mm;
  if(s.back&&!get('back'))continue;
  const parts=surroundParts({...s,elevation:0,surround:{upper:u}},{sides:{},bodyTop:0,upperTop:u.height},prefix,{
   name:meta.name||base.name.split(' · Антресоль')[0],bodyMaterialId:get('left')?.body_variant_id,backMaterialId:get('back')?.body_variant_id});
  const structure=parts.filter(p=>p.key!=='mezz-back'&&!p.key.startsWith('mezz-door-'));
  if(!structure.every(({key,item})=>{
   const old=get(key);
   if(!old||old.blank_axis!==item.blank_axis||(old.rotation||0)!==rotation||old.blank_machining?.length)return false;
   const point=localPoint(old,rotation);
   return old.depth===s.depth&&old.width===item.width&&old.height===item.height&&old.blank_thickness_mm===18&&
    Math.abs(point.x-anchor.x-item.x)<.001&&Math.abs(point.z-anchor.z)<.001&&Math.abs(old.elevation_mm-y-item.elevation_mm)<.001;
  }))continue;
  for(const {key,item} of [...structure,parts.find(p=>p.key==='mezz-back')]){
   const xyz=worldPoint({x:anchor.x+item.x,z:anchor.z+item.z},rotation),old=get(key);
   if(!old){
    const added={...item,...xyz,elevation_mm:y+item.elevation_mm,rotation,assistant_carcass:meta};
    items.push(added);byId.set(added.item_id,added);
   }else{
    Object.assign(old,xyz,{depth:item.depth,blank_width_mm:item.blank_width_mm});
    if(item.blank_machining){old.blank_machining=item.blank_machining;old.blank_edge_code=blankEdgeCode(old);}
   }
  }
 }
}
