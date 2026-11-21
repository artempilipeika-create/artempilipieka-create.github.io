import catalogue from './wardrobe-prime-hinges.json' with {type:'json'};
import z1 from './wardrobe-z1-data.json' with {type:'json'};
import pulls from './wardrobe-handle-catalogue.json' with {type:'json'};
import {sectionWidths} from './wardrobe-layout.mjs';

export const hingeCatalogue=Object.fromEntries([...catalogue,...z1.boardHinges,...z1.hinges].map(p=>[p.article,p]));
export const blumPlates=z1.plates;
export const hingeBrand=fit=>fit?.brand??'AKS';
export function withMountingPlate(fit,selection){
 if(hingeBrand(fit)!=='Blum')return fit;
 const sku=selection??(fit.frame?'175H3100':'173H7100');
 const plate=blumPlates.find(p=>p.sku===sku&&p.finish===fit.finish);
 if(!plate)throw Error('Для петли Blum выберите планку H0 в отделке петли.');
 return {...fit,plate,plateSpan:plate.plateSpan,plateReach:plate.plateReach,plateDepth:plate.plateDepth};
}
export const closingNames={standard:'с пружиной',soft:'с доводчиком',springless:'без пружины',reverse:'с пружиной обратного действия'};
export const doorPushGap=2;
export const hingeKinds={overlay:'Накладная',half:'Полунакладная',inset:'Вкладная'};
export function hingeName(article){
 const p=hingeCatalogue[article];
 return p?'Петля '+(p.brand==='Blum'?'Blum ':'')+p.series+(p.angle?' '+p.angle+'° ':' ')+hingeKinds[p.kind].toLowerCase()+' '+closingNames[p.closing]+' · '+(p.fixing==='euro'?'еврошурупы':'саморезы'):'';
}
export const frameDepth=20.5;
export const leafDepth=(f,key)=>hingeCatalogue[settingFor(f,key).article]?.frame==='Z1'?frameDepth:18;
export function selectLeafFrame(front,key,frame){
 const current=settingFor(front,key),product=hingeProduct(front,key);
 const next=chooseHinge(product.kind,current.push,current.article,frame);
 if(!next)return false;
 const setting={...current,article:next.article};
 if(next.brand!=='Blum')delete setting.plate;
 (front.hinges??={})[key]=setting;
 if(frame==='Z1'&&front.handles?.[key]&&!['118124','118129'].includes(front.handles[key].article)){
  delete front.handles[key];
  if(!Object.keys(front.handles).length)delete front.handles;
 }
 return true;
}
const defaultSetting={article:'112595'};
export const nominalSide=key=>/^door-(?:(?:lower|upper)-)?(left|right)$/.exec(key)?.[1];
export const compatibleHinge=(hinge,push)=>!push||hinge.closing==='springless';
export function chooseHinge(kind,push,preferred,frame=hingeCatalogue[preferred]?.frame??'board',brand=frame==='Z1'?'Blum':hingeCatalogue[preferred]?.frame?'AKS':hingeBrand(hingeCatalogue[preferred])){
 const current=hingeCatalogue[preferred];
 if(hingeBrand(current)===brand&&current?.kind===kind&&(current.frame??'board')===frame&&compatibleHinge(current,push))return current;
 const score=p=>Number(p.fixing!==(current?.fixing??'screw'))*8+Number(p.closing!==(push?'springless':current?.closing??'soft'))*4+Number(p.series!==current?.series)*2+Number(p.finish==='ONS');
 return Object.values(hingeCatalogue).filter(p=>hingeBrand(p)===brand&&(p.frame??'board')===frame&&p.kind===kind&&compatibleHinge(p,push))
  .sort((a,b)=>score(a)-score(b)||a.article.localeCompare(b.article))[0];
}
export function settingFor(front,key){
 const setting=front?.hinges?.[key]??defaultSetting,product=hingeCatalogue[setting.article];
 if(setting.push&&product?.closing==='reverse')return {...setting,article:chooseHinge(product.kind,setting.push,setting.article).article};
 return setting;
}
export function hingeProduct(f,key){
 const setting=settingFor(f,key),p=hingeCatalogue[setting.article];
 if(!p)throw Error('Выберите петлю из каталога для этого фасада.');
 if(!compatibleHinge(p,setting.push))throw Error('Для открывания нажатием выберите петлю без пружины.');
 return withMountingPlate(p,setting.plate);
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
   frame:fit.frame,faceOffset:inset?-insetDepth(f,p.key):leafDepth(f,p.key)+(settingFor(f,p.key).push?doorPushGap:0),hostKey:mountKey(s,p.key)};
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
 return hingeProduct(s.front,key).kind==='inset'?Math.ceil(leafDepth(s.front,key)+insetDepth(s.front,key)+(setting.push?doorPushGap:1)):0;
}
