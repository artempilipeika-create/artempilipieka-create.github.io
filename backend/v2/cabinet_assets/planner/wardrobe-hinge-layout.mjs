import catalogue from './wardrobe-prime-hinges.json' with {type:'json'};
import pulls from './wardrobe-handle-catalogue.json' with {type:'json'};
import {sectionWidths} from './wardrobe-layout.mjs';

export const hingeCatalogue=Object.fromEntries(catalogue.map(p=>[p.article,p]));
export const closingNames={soft:'с доводчиком',springless:'без пружины',reverse:'с пружиной обратного действия'};
export const doorPushGap=2;
export const hingeKinds={overlay:'Накладная',half:'Полунакладная',inset:'Вкладная'};
export function hingeName(article){
 const p=hingeCatalogue[article];
 return p?'Петля '+p.series+' '+hingeKinds[p.kind].toLowerCase()+' '+closingNames[p.closing]+' · '+(p.fixing==='euro'?'еврошурупы':'саморезы'):'';
}
const defaultSetting={article:'112595'};
export const nominalSide=key=>/^door-(?:(?:lower|upper)-)?(left|right)$/.exec(key)?.[1];
export const settingFor=(f,key)=>f?.hinges?.[key]??defaultSetting;
export function hingeProduct(f,key){
 const p=hingeCatalogue[settingFor(f,key).article];
 if(!p)throw Error('Выберите петлю PRIME из каталога.');
 return p;
}
export const onDivider=(f,key)=>hingeProduct(f,key).kind==='half'||settingFor(f,key).central===true;
export const installedSide=(f,key)=>onDivider(f,key)?(nominalSide(key)==='left'?'right':'left'):nominalSide(key);
export const insetDepth=(f,key)=>settingFor(f,key).recess??2;
export const usesDivider=f=>Object.keys(f?.hinges??{}).some(key=>onDivider(f,key));
export function dividerAxes(s){
 let x=s.thickness;
 return sectionWidths(s).slice(0,-1).map(w=>{x+=w+s.thickness;return x-s.thickness/2;});
}
export function middleDivider(s){
 const axes=dividerAxes(s);
 const index=s.front?.hingeDivider??axes.reduce((best,x,i)=>Math.abs(x-s.width/2)<Math.abs(axes[best]-s.width/2)?i:best,0);
 if(axes[index]==null)throw Error('Для петель на общей стойке добавьте перегородку в разделе «Полки» и выберите её в фасадах.');
 return {index,x:axes[index]};
}
export function mountKey(s,key){return onDivider(s.front,key)?'divider-'+middleDivider(s).index:installedSide(s.front,key);}
const near=(a,b)=>Math.abs(a-b)<.01;
export function activeLeafKeys(f){
 if(!f)return [];
 const band=(row,mode)=>(mode==='pair'?['left','right']:mode==='open'?[]:[mode]).map(side=>'door-'+row+side);
 const d=f.division;
 if(!d)return band('',f.swing);
 return [...band('lower-',d.below),...band('upper-',d.above),...(d.scope==='all'?[]:band('',d.scope==='left'?'right':'left'))];
}
export function meetingGap(front,key){
 const base=key.replace(/(left|right)$/,'');
 const at=(side,edge)=>{const h=front.handles?.[base+side];return h?.edge===edge&&pulls[h.article]?.family==='monblan';};
 return at('left','right')&&at('right','left')?4:3;
}
export function adjustedHingeDoors(s,rows,anchor){
 const f=s.front;
 if(!f?.hinges)return rows;
 const hasCenter=usesDivider(f),axes=dividerAxes(s);
 const center=hasCenter?middleDivider(s).x:s.sections===2?axes[0]:s.width/2;
 return rows.map(p=>{
  const fit=hingeProduct(f,p.key),side=installedSide(f,p.key),inset=fit.kind==='inset';
  let a=p.left,b=a+p.width,low=p.bottom,high=low+p.height;
  if(onDivider(f,p.key)){
   const reveal=inset?1.5:meetingGap(f,p.key)/2;
   if(nominalSide(p.key)==='left')b=center-reveal;
   else a=center+reveal;
  }
  if(inset){
   if(near(a,1.5))a+=s.thickness;
   else if(axes.some(x=>near(a,x+1.5)||near(a,x+2)))a=Math.max(a,center+s.thickness/2+1.5);
   if(near(b,s.width-1.5))b-=s.thickness;
   else if(axes.some(x=>near(b,x-1.5)||near(b,x-2)))b=Math.min(b,center-s.thickness/2-1.5);
   if(near(low,1.5)&&s.bottomFit!=='none')low+=s.thickness;
   if(near(high,s.height-1.5))high-=s.thickness;
   if(anchor&&p.key.includes('upper-'))low=Math.max(low,anchor.y+s.thickness+1.5);
   if(anchor&&p.key.includes('lower-'))high=Math.min(high,anchor.y-1.5);
  }
  if(b<=a||high<=low)throw Error('Недостаточно места для выбранного фасада.');
  return {...p,side,left:a,width:b-a,bottom:low,height:high-low,
   faceOffset:inset?-insetDepth(f,p.key):18+(settingFor(f,p.key).push?doorPushGap:0),hostKey:mountKey(s,p.key)};
 });
}
export function bandKey(f,side,above){
 if(!f)return null;
 const d=f.division,inBand=d&&(d.scope==='all'||d.scope===side),mode=inBand?(above?d.above:d.below):f.swing;
 if(mode==='open')return null;
 if(!inBand&&d&&d.scope!=='all')return 'door-'+side;
 if(mode!=='pair'&&mode!==side)return null;
 return 'door-'+(inBand?(above?'upper-':'lower-'):'')+side;
}
// The back of an inset door needs free space in front of the fittings it covers.
export function depthBehindDoor(s,key){
 const setting=settingFor(s.front,key);
 return hingeProduct(s.front,key).kind==='inset'?18+insetDepth(s.front,key)+(setting.push?doorPushGap:1):0;
}
