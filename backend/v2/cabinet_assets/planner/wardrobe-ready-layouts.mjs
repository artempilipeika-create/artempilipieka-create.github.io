import {nicheSlot,sectionOf,openingBase,sectionWidths} from './wardrobe-layout.mjs';
import {defaultShelf,shelfRows} from './shelf-choices.mjs';
import {trimBanks,coverClearance,frontEdgeGap} from './wardrobe-niches.mjs';
import {resizeSections} from './wardrobe-cells.mjs';
import {newRod,planRods,rodRoom,rodWarnings} from './wardrobe-rods.mjs';
import {defaultFitting,fittingCatalogue,isFittedRod,planFitting} from './wardrobe-fittings.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {doorAnchorIndex} from './wardrobe-door-layout.mjs';

export const readyWardrobes={
 hall:{name:'Неглубокая прихожая',description:'Выдвижная вешалка и полки для обуви',sections:['shallow','shoes']},
 couple:{name:'Шкаф для двоих',description:'Длинная одежда, три шуфляды и две штанги для рубашек',sections:['long','daily','shirts']},
 business:{name:'Деловой гардероб',description:'Брючница, органайзер и верхняя зона для пиджаков',sections:['business','lift']},
 utility:{name:'Хозяйственный шкаф',description:'Высокий отсек для пылесоса, полки и гладильная доска',sections:['tall','ironing']}
};
export const readySections={
 long:'Длинная одежда', shirts:'Рубашки в два яруса', daily:'Три шуфляды для белья и футболок', deep:'Две высокие шуфляды',
 shallow:'Неглубокая секция с вешалкой', shoes:'Полки для обуви', business:'Брюки и аксессуары', lift:'Пиджаки на пантографе',
 tall:'Пылесос и высокие вещи', ironing:'Бельё и гладильная доска', shelves:'Открытые полки'
};

export function recommendWardrobe({room='bedroom',people='one',things=[]}={}){
 const wants=t=>things.includes(t);
 if(room==='utility'||wants('cleaning'))return {id:'utility'};
 if(room==='hall')return {id:'hall',sections:['shallow',wants('knit')&&!wants('shoes')?'deep':'shoes']};
 if(wants('suits'))return {id:'business'};
 const clothing=wants('shirts')&&!wants('long')?'shirts':'long';
 const drawers=wants('knit')?'deep':'daily';
 if(people==='one')return {id:'couple',name:'Гардероб для одного',sections:[clothing,drawers,...(wants('long')&&wants('shirts')?['shirts']:[]),...(wants('shoes')?['shoes']:[])]};
 return {id:'couple',sections:[clothing,drawers,wants('shoes')&&!wants('shirts')?'shoes':'shirts']};
}

const scopedPart=(key,section)=>{
 const shelf=/^shelf-(?:niche-)?(\d+)-/.exec(key),split=/^niche-(\d+)-/.exec(key),drawer=/^drawer-(\d+)-/.exec(key);
 return shelf?Number(shelf[1])===section:split?Number(split[1])===section:drawer?sectionOf(Number(drawer[1]))===section:false;
};
export function sectionContents(f,i){
 const banks=(f.drawerBanks??[]).filter((b,slot)=>b&&sectionOf(slot)===i);
 const splits=(f.nicheSplits??[]).filter(r=>r.section===i);
 const shelves=(f.sectionShelves[i]??0)+splits.reduce((sum,z)=>sum+(z.columns??[]).reduce((n,c)=>n+c.gaps.length-1,0),0);
 const fittings=(f.fittings??[]).filter(r=>r.section===i),fittedRods=fittings.filter(isFittedRod).length;
 const rods=(f.rods??[]).filter(r=>r.section===i).length+fittedRods;
 return [[shelves,'полок'],[banks.reduce((sum,b)=>sum+b.faces.length,0),'шуфляд'],[rods,'штанг'],[fittings.length-fittedRods,'механизмов'],[splits.length,'перегородок']]
  .filter(([n])=>n).map(([n,word])=>word+' — '+n).join(', ');
}
function clearSection(f,section){
 if(f.front?.division&&doorAnchorIndex(f,section)>=0)throw Error('Секция '+(section+1)+' задаёт стык распашных фасадов. Сначала перенесите стык на шаге «Фасады».');
 for(const prop of ['rods','fittings','nicheSplits'])if(f[prop])f[prop]=f[prop].filter(v=>v.section!==section);
 if(f.drawerBanks)f.drawerBanks=trimBanks(f.drawerBanks.map((v,i)=>sectionOf(i)===section?null:v),f.sections);
 for(const prop of ['shelfLevels','shelfChoices','gapLocks'])if(f[prop])f[prop][section]=[];
 if(f.topGaps)f.topGaps[section]=null;
 for(const prop of ['machining','lighting'])if(f[prop])for(const key of Object.keys(f[prop]))if(scopedPart(key,section))delete f[prop][key];
 f.sectionShelves[section]=0;
}
function setShelves(f,i,gaps,topGap=null,fixed=[]){
 f.sectionShelves[i]=gaps.length;
 f.shelfLevels??=f.sectionShelves.map(()=>[]);
 f.shelfLevels[i]=gaps.map(mm=>mm==null?null:{mode:'gap',mm});
 f.topGaps??=Array(f.sections).fill(null);f.topGaps[i]=topGap;
 f.shelfChoices=shelfRows(f);f.shelfChoices[i]=gaps.map((_,j)=>fixed.includes(j)?'board/'+(f.drawerFixing??'cam_dowel'):defaultShelf);
 f.clearLayout=true;
}
function hanger(f,cell,lower=false){
 const room=rodRoom(f,cell),rod=newRod(cell,room);
 if(lower){rod.anchor='bottom';rod.offset=Math.round((room.high-room.low-rod.offset)/2);}
 const previous=planRods(f);
 for(const shift of [0,8,-8,16,-16]){
  const item=shift?{...rod,fromBack:Math.round(room.usableDepth/2)+shift}:rod;
  const [placed]=planRods({...f,rods:[item]});
  if(!rodWarnings([...previous,placed],f.thickness).length){(f.rods??=[]).push(item);return placed;}
 }
 throw Error('Секция '+(cell.section+1)+' — пересекаются держатели штанг. Измените положение соседней штанги.');
}
function fitting(f,key,section,level,offset){
 const item=defaultFitting(key,{section,level});if(offset!=null)item.offset=offset;
 planFitting(f,item);(f.fittings??=[]).push(item);
}
const seasonal=h=>Math.min(325,Math.max(100,Math.round(h*.14)));
function fillSection(f,i,kind,notes,choices){
 if(!readySections[kind])throw Error('Выберите схему секции.');
 const cell={section:i,level:0};
 // A bottomless cabinet gets a local shelf below an internal drawer bank.
 if(kind==='daily'||kind==='deep'){
  f.drawerBanks??=[];f.drawerBanks[nicheSlot(i,0)]={kind:'internal',railFamily:'ball',layout:'equal',gap:30,faces:[]};
 }
 const h=f.height-f.thickness-openingBase(f,i),t=f.thickness,w=sectionWidths(f)[i],top=seasonal(h);
 const note=s=>notes.push('Секция '+(i+1)+'. '+s);
 if(kind==='daily'||kind==='deep'){
  const daily=kind==='daily',bank=f.drawerBanks[nicheSlot(i,0)],count=daily?3:2;
  const available=Math.min(daily?630:645,Math.round(h*.43));
  const overhead=coverClearance+frontEdgeGap+(count-1)*bank.gap;
  if(available-overhead<count*100)throw Error('Секция '+(i+1)+' слишком низкая для выбранного числа шуфляд.');
  const extra=h-available-t-top;
  const above=Math.max(0,Math.min(2,Math.floor((extra-110)/260)));
  setShelves(f,i,[available,...Array(above).fill(null),null],top,[0]);
  const lower=Math.floor((available-overhead-Math.max(105,Math.min(145,(available-overhead)*.24)))/2);
  bank.layout=daily?'manual':'equal';bank.faces=daily?[{height:lower},{height:lower},{height:null}]:[{height:null},{height:null}];
 }else if(['long','shirts','shallow','tall'].includes(kind)){
  let upper=top;
  if((kind==='long'||kind==='shallow')&&choices.garmentLength){
   upper=Math.min(upper,h-t-105-choices.garmentLength);
   if(upper<60)throw Error('Секция '+(i+1)+' слишком низкая для вещи длиной '+choices.garmentLength+' мм на плечиках.');
  }
  setShelves(f,i,[null],upper);
  if(kind==='shallow'){
   const depth=rodRoom(f,cell).usableDepth;
   if(depth<255)throw Error('Для выдвижной вешалки GRIDLI требуется не менее 255 мм полезной глубины.');
   fitting(f,depth>=305?'113951':'113950',i,0);
  }else if(kind!=='tall'){hanger(f,cell);if(kind==='shirts')hanger(f,cell,true);}
 }else if(kind==='shoes'||kind==='shelves'){
  const count=kind==='shoes'?5:4;
  setShelves(f,i,[...(kind==='shoes'?[Math.min(380,Math.round(h*.17))]:[]),...Array(count-(kind==='shoes'?1:0)).fill(null)],top);
 }else if(kind==='business'){
  setShelves(f,i,[Math.min(870,Math.round(h*.39)),Math.min(302,Math.round(h*.14)),null,null],top,t===18?[0]:[]);
  const room=rodRoom(f,cell);
  if(t===18&&w>=360&&room.usableDepth>=475)fitting(f,'115591',i,0);else note('Под BRUNO нужна закреплённая полка. Для этой сборки подходят плита 18 мм, ширина от 360 мм и глубина от 475 мм. Нижняя ниша будет свободна.');
  const tray=fittingCatalogue['115597'];
  if(t<=18&&w>=tray.span[0]&&w<=tray.span[1]&&room.usableDepth>=480)fitting(f,'115597',i,1,70);
  else note('Органайзер BRUNO 600 не помещается. Для аксессуаров предусмотрена полка.');
 }else if(kind==='lift'){
  setShelves(f,i,[Math.min(280,Math.round(h*.12)),null],top);
  const room=rodRoom(f,{section:i,level:1});
  const variant=['123793','123794','123795'].find(k=>{const [a,b]=fittingCatalogue[k].span;return w>=a&&w<=b;});
  if(variant&&t<=18&&room.usableDepth>=500&&room.high-room.low>=915)fitting(f,variant,i,1);
  else{hanger(f,{section:i,level:1});note('VENTO не подходит к размерам или толщине боковин. В этой компоновке будет обычная штанга.');}
 }else if(kind==='ironing'){
  setShelves(f,i,[Math.min(940,Math.round(h*.40)),null,null],top,t===18?[0]:[]);
  if(t===18&&w>=500&&rodRoom(f,{section:i,level:1}).usableDepth>=457){fitting(f,'114784',i,1);note('Для раскрытой гладильной доски предусмотрите 725 мм перед шкафом.');}
  else note('Для доски нужна закреплённая полка. В этой сборке — плита 18 мм, ширина от 500 мм и полезная глубина от 457 мм. В секции будут полки для белья.');
 }
}
function twoBayWidths(f,id){
 const clear=f.width-3*f.thickness;
 if(clear<200)return;
 if(id==='hall')f.dividerPositions=[Math.round(clear*.577)];
 if(id==='business'&&clear>=564+520)f.dividerPositions=[564];
 if(id==='utility'&&clear>=750)f.dividerPositions=[clear-Math.min(564,Math.max(500,Math.round(clear*.539)))];
}
export function planReadyLayout(fields,request){
 const f=structuredClone(fields),changes=[],notes=[],oldCount=f.sections,whole=request.section==null;
 const template=whole?readyWardrobes[request.id]:null;
 const kinds=whole?(request.sections??template?.sections):[request.id];
 if(!kinds?.length||whole&&!template)throw Error('Выберите готовое наполнение.');
 const targets=whole?Array.from({length:oldCount},(_,i)=>i):[request.section];
 for(const i of targets){
  if(!Number.isInteger(i)||i<0||i>=oldCount)throw Error('Выберите существующую секцию.');
  const existing=sectionContents(f,i);if(existing)changes.push('Секция '+(i+1)+' — '+existing);
  clearSection(f,i);
 }
 if(whole){
  const configured=oldCount===kinds.length&&Array.isArray(f.dividerPositions);
  if(!configured)delete f.dividerPositions;
  resizeSections(f,kinds.length);
  if(kinds.length===2&&!configured)twoBayWidths(f,request.id);
 }
 kinds.forEach((kind,j)=>fillSection(f,whole?j:request.section,kind,notes,request));
 wardrobeSpec(f);
 return {fields:f,changes,notes,kinds,widths:sectionWidths(f),targets};
}
export function layoutSourceKeys(keys,targets,sections){
 if(!keys)return keys;
 return new Map([...keys].filter(([key])=>!targets.some(i=>scopedPart(key,i))&&!(key.startsWith('divider-')&&Number(key.split('-')[1])>=sections-1)));
}
