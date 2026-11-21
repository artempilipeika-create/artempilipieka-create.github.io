import {blankItem,validateBlank} from './blanks-model.mjs';
import {footHeight} from './plinth-options.mjs';
import {rearProjection} from './panel-machining.mjs';
import {frontProjection} from './wardrobe-drawers.mjs';

export const trimSides=['left','right'];
export const upperPush=()=>({article:'70787',mount:'auto',support:'auto',heightMm:1050});
export const surroundPart=key=>key.startsWith('trim-')||key.startsWith('mezz-');
export const surroundFace=key=>/^trim-(?:left|right)-(?:face|end)$|^trim-cap-(?:face|base)$|^mezz-door-/.test(key);
export const hasSurround=s=>Boolean(s?.left||s?.right||s?.upper||s?.cap);
const sideNames={left:'Левая',right:'Правая'};
const ranges=(v,min,max,label)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error(label+' · от '+min+' до '+max+' мм.');};
export function surroundLayout(s){
 const a=s.surround??{},bodyTop=footHeight(s)+s.height,upperTop=bodyTop+(a.upper?.height??0);
 const lower=frontProjection(s),sidePlane=s.depth/2+(s.front||lower?lower:(a.upper?20:18));
 let minX=-s.width/2,maxX=s.width/2,minZ=-s.depth/2-rearProjection(s),maxZ=s.depth/2+lower,height=upperTop+(a.cap?.height??0);
 const sides={};
 if(hasSurround(a)&&s.thickness!==18)throw Error('Для фальшпланок и антресоли выберите плиту корпуса 18 мм.');
 if(a.upper){
  ranges(a.upper.height,150,1500,'Высота антресоли');
  if(![1,2].includes(a.upper.leaves)||!['swing','lift'].includes(a.upper.opening)||!['left','right'].includes(a.upper.side))throw Error('Проверьте количество створок и открывание антресоли.');
  const leafWidth=s.width/a.upper.leaves-3;
  if(leafWidth>(a.upper.opening==='swing'?600:1200))throw Error('Створка антресоли слишком широкая. Измените число створок или открывание в шаге «Фасады».');
  maxZ=Math.max(maxZ,s.depth/2+20);
 }
 for(const side of trimSides){
  const t=a[side];if(!t)continue;
  const end=t.kind==='end',span=end?18:t.width,depth=end?t.depth:100;
  if(!end&&t.kind!=='filler')throw Error('Выберите исполнение боковой фальшпланки.');
  if(end){ranges(depth,40,1200,'Глубина торцевой стойки');ranges(t.projection,0,300,'Выступ от боковины');}
  else ranges(span,40,1200,'Ширина лица фальшпланки');
  const bottom=t.bottom??0,mode=t.heightMode??'body';
  ranges(bottom,0,4900,'Низ боковой детали');
  if(!['custom','body','full'].includes(mode))throw Error('Выберите привязку высоты боковой детали.');
  const h=mode==='custom'?t.height:(mode==='full'?upperTop:bodyTop)-bottom;
  ranges(h,100,3000,'Высота боковой детали');
  const sign=side==='left'?-1:1,x=sign*(s.width+span)/2,front=end?s.depth/2+t.projection:sidePlane;
  sides[side]={end,span,depth,bottom,h,x,front,sign};
  minX=Math.min(minX,x-span/2);maxX=Math.max(maxX,x+span/2);
  minZ=Math.min(minZ,front-depth);maxZ=Math.max(maxZ,front);height=Math.max(height,bottom+h);
 }
 const capLength=a.cap?.length??s.width,capPlane=a.upper?s.depth/2+20:sidePlane;
 if(a.cap){
  ranges(a.cap.height,40,1200,'Высота закладной');ranges(capLength,100,3000,'Длина закладной');
  if(capLength>s.width&&Object.values(sides).some(t=>t.bottom<upperTop+a.cap.height&&t.bottom+t.h>upperTop&&t.front>capPlane-100&&t.front-t.depth<capPlane))
    throw Error('Удлинённая закладная пересекает боковую деталь. Уменьшите её длину или высоту боковой детали.');
  minX=Math.min(minX,-capLength/2);maxX=Math.max(maxX,capLength/2);
  minZ=Math.min(minZ,capPlane-100);maxZ=Math.max(maxZ,capPlane);
 }
 return {sides,bodyTop,upperTop,capLength,capPlane,minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ,height,centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2};
}

export function surroundParts(s,g,prefix,options={}){
 const parts=[],a=s.surround??{},name=options.name||s.label;
 const board=(key,label,axis,length,partWidth,x,y,z,edges)=>{
  const item=blankItem({item_id:prefix+':'+key,name:name+' · '+label,axis,length,partWidth,thickness:18,x,z,
   elevation:s.elevation+y,edges,blank_edge_thickness_mm:axis==='front'?2:1,body_variant_id:(surroundFace(key)?options.frontMaterialId:options.bodyMaterialId)??null});
  const error=validateBlank(item);if(error)throw Error(label+' · '+error);
  parts.push({key,label,item});
 };
 for(const [side,t] of Object.entries(g.sides)){
  const key='trim-'+side+'-',label=sideNames[side];
  if(t.end)board(key+'end',label+' торцевая стойка','side',t.h,t.depth,t.x,t.bottom,t.front-t.depth/2,'1111');
  else{
   board(key+'face',label+' фальшпланка · глухой фасад','back',t.span,t.h,t.x,t.bottom,t.front-9,'1111');
   board(key+'return',label+' фальшпланка · боковая проставка','side',t.h,82,t.sign*(s.width/2+t.span-9),t.bottom,t.front-59,'0111');
  }
 }
 if(a.upper){
  const u=a.upper,w=s.width,d=s.depth,y=g.bodyTop;
  for(const [side,sign] of [['left',-1],['right',1]])
   board('mezz-'+side,'Антресоль · '+sideNames[side].toLowerCase()+' стойка','side',u.height,d,sign*(w-18)/2,y,0,'1011');
  board('mezz-bottom','Антресоль · дно','horizontal',w-36,d,0,y,0,'1000');
  board('mezz-top','Антресоль · крыша','horizontal',w-36,d,0,g.upperTop-18,0,'1000');
  if(u.divider)board('mezz-divider','Антресоль · перегородка','side',u.height-36,d,0,y+18,0,'1000');
  for(const side of u.leaves===2?trimSides:[u.side]){
   const x=u.leaves===2?(side==='left'?-1:1)*w/4:0;
   board('mezz-door-'+side,'Антресоль · '+(u.leaves===1?'фасад':side==='left'?'левый фасад':'правый фасад'),'front',u.height-3,w/u.leaves-3,x,y+1.5,d/2+11,'1111');
  }
 }
 if(a.cap){
  const z=g.capPlane,w=g.capLength,y=g.upperTop,h=a.cap.height;
  board('trim-cap-face','Закладная под потолок · лицевая планка','back',w,h,0,y,z-9,'1111');
  board('trim-cap-upright','Закладная под потолок · внутренняя планка','back',w,h-18,0,y+18,z-27,'0000');
  board('trim-cap-base','Закладная под потолок · нижняя планка','horizontal',w,82,0,y,z-59,'1011');
 }
 return parts;
}

