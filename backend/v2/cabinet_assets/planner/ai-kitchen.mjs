import {hingeCatalogue,hingeProduct} from './wardrobe-hinge-layout.mjs';
import {carcassSpec} from './carcass-model.mjs';
import {doorHardware} from './wardrobe-door-layout.mjs';

export const kitchenRails=Object.entries(doorHardware).filter(([,p])=>p.family==='rail').sort((a,b)=>a[1].pitch-b[1].pitch||a[1].finish.localeCompare(b[1].finish,'ru'));

export const kitchenModels=Object.freeze([
 {id:'base-swing',name:'Нижний распашной',description:'Царги, опоры и съёмные полки из ЛДСП',photo:'ai-base-swing',shelves:1,depth:510,elevation:0},
 {id:'wall-swing',name:'Верхний распашной',description:'Навесной шкаф с полками из ЛДСП',photo:'ai-wall-swing',shelves:1,depth:317,elevation:1458},
 {id:'wall-vitrine',name:'Верхняя витрина Z1',description:'Рамочный фасад, стеклянные полки и подсветка',photo:'ai-wall-vitrine',shelves:2,depth:317,elevation:1458}
]);
export function kitchenHinges(id){
 const frame=id==='wall-vitrine';
 return Object.values(hingeCatalogue).filter(p=>Boolean(p.frame)===frame&&['overlay','inset'].includes(p.kind));
}
export function kitchenFields(id,saved){
 const m=kitchenModels.find(model=>model.id===id);
 if(!m)throw Error('Выберите кухонный модуль ИИ.');
 const base=id==='base-swing',glass=id==='wall-vitrine';
 const s=saved,firstDoor=s?.front?.swing==='right'?'door-right':'door-left';
 const source=s?.lighting??{},left=source.left,right=source.right;
 const pull=s?.front?.handles?.[firstDoor];
 return {id,width:s?.width??600,height:s?.height??720,depth:s?.depth??m.depth,elevation:s?.elevation??m.elevation,
   shelves:s?.shelves??m.shelves,swing:s?.front?.swing??'left',hinge:s?hingeProduct(s.front,firstDoor).article:glass?'71B950A':'112595',
   feet:s?.feet?.article??'86502',handle:s?(pull?.article??'none'):(glass?'none':'79080'),
   orientation:pull&&['top','bottom'].includes(pull.edge)?'horizontal':'vertical',
   glassThickness:s?.shelfChoices?.[0]?.[0]?.split('/')[0]??'6',
   light:s?(left&&right?'both':left?'left':right?'right':'off'):(glass?'both':'off'),
   workLight:s?Boolean(source.bottom):false,
   lightSystem:Object.values(source)[0]?.[0]?.system??'lira-17.5x6.5'};
}
export function kitchenSpec(f){
 const model=kitchenModels.find(m=>m.id===f.id);
 if(!model)throw Error('Выберите кухонный модуль ИИ.');
 const base=f.id==='base-swing',glass=f.id==='wall-vitrine';
 if(!Number.isInteger(f.shelves)||f.shelves<0||f.shelves>3)throw Error('Выберите от нуля до трёх полок.');
 if(!['left','right','pair'].includes(f.swing)||!kitchenHinges(f.id).some(p=>p.article===f.hinge))throw Error('Выберите совместимую петлю и сторону открывания.');
 if(f.width>600&&f.swing!=='pair')throw Error('Для корпуса шире 600 мм выберите две двери.');
 if(f.width>1200)throw Error('Ширина модуля с двумя дверями до 1200 мм.');
 if(glass&&!['4','6','8'].includes(String(f.glassThickness)))throw Error('Выберите толщину стеклянной полки.');
 const s={kitchenModel:f.id,recipe:base?'base':'wall',width:f.width,height:f.height,depth:f.depth,thickness:18,shelves:f.shelves,
   sections:1,sectionShelves:[f.shelves],clearLayout:true,back:true,elevation:base?0:f.elevation,
   shelfSetback:base?20:5,shelfGap:1,edgeThickness:1,edgePolicy:'front',joints:{top:'confirmat',bottom:'confirmat'},
   front:{swing:f.swing,offset:90,autoHinges:true,hinges:{}}};
 if(base){
   if(!['86502','86503'].includes(f.feet))throw Error('Выберите высоту кухонной опоры.');
   s.bottomFit='overlay';s.feet={layout:'width',article:f.feet,front:75,rear:50};
 }
 for(const side of f.swing==='pair'?['left','right']:[f.swing]){
   const key='door-'+side;s.front.hinges[key]={article:f.hinge};
   if(!glass&&f.handle!=='none'){
    if(doorHardware[f.handle]?.family!=='rail'||!['vertical','horizontal'].includes(f.orientation))throw Error('Выберите ручку и её положение на фасаде.');
    const horizontal=f.orientation==='horizontal';
    const edge=horizontal?(base?'top':'bottom'):(side==='left'?'right':'left');
    const from=horizontal?(side==='left'?'end':'start'):(base?'end':'start');
    (s.front.handles??={})[key]={article:f.handle,edge,from,offset:50,inset:50};
   }
 }
 if(glass&&f.shelves)s.shelfChoices=[Array(f.shelves).fill(f.glassThickness+'/48846')];
 if(!base){
   if(!['off','left','right','both'].includes(f.light)||!['aq-4x8','lira-17.5x6.5'].includes(f.lightSystem))throw Error('Выберите вариант подсветки.');
   const lighting={};
   const line=face=>[{system:f.lightSystem,face,anchor:'front',offset:45,start:8,end:8}];
   if(f.workLight)lighting.bottom=line(0);
   if(f.light==='left'||f.light==='both')lighting.left=line(0);
   if(f.light==='right'||f.light==='both')lighting.right=line(1);
   if(Object.keys(lighting).length){s.lighting=lighting;s.lightKit={control:f.workLight?'wave':'door'};}
 }
 carcassSpec(s);
 return s;
}
