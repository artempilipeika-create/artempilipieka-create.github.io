import {hingeCatalogue,hingeProduct} from './wardrobe-hinge-layout.mjs';
import {carcassSpec} from './carcass-model.mjs';
import {doorHardware} from './wardrobe-door-layout.mjs';
import {feetCatalogue} from './wardrobe-feet.mjs';
import {choice} from './shelf-choices.mjs';
import {lightingSystems} from './wardrobe-lighting.mjs';

export const kitchenRails=Object.entries(doorHardware).filter(([,p])=>p.family==='rail').sort((a,b)=>a[1].pitch-b[1].pitch||a[1].finish.localeCompare(b[1].finish,'ru'));
export const kitchenFeet=feetCatalogue.filter(p=>['plinth','decor'].includes(p.category)&&!p.issue);
export const isBase=id=>Boolean(id?.startsWith('base-'));
export const isVitrine=id=>Boolean(id?.endsWith('-vitrine'));
export const kitchenModels=Object.freeze([
 {id:'base-swing',name:'Нижний распашной',description:'НМД1 / НМД2 · полки из ЛДСП',photo:'ai-base-swing',shelves:1,depth:510,elevation:0},
 {id:'base-sink',name:'Нижний под мойку',description:'Три вертикальные царги · место под коммуникации',photo:'ai-base-sink',shelves:0,depth:510,elevation:0},
 {id:'base-vitrine',name:'Нижняя витрина Z1',description:'Рамочные фасады · полки из стекла или ЛДСП',photo:'ai-base-vitrine',shelves:2,depth:510,elevation:0},
 {id:'wall-swing',name:'Верхний распашной',description:'ВМД1 / ВМД2 · полки из ЛДСП',photo:'ai-wall-swing',shelves:1,depth:317,elevation:1458},
 {id:'wall-vitrine',name:'Верхняя витрина Z1',description:'Рамочные фасады · полки из стекла или ЛДСП',photo:'ai-wall-vitrine',shelves:2,depth:317,elevation:1458}
]);
export const kitchenFoot=article=>kitchenFeet.find(p=>p.article===article);
export const shelfDefault=id=>isVitrine(id)?'4/48846':isBase(id)?'board/confirmat':'board/95388';
export const kitchenShelfFixings=Object.freeze({
 '95388':'Полкодержатели',confirmat:'Конфирмат',cam_dowel:'Эксцентрик со шкантом'
});
export function boardFixingChoices(values,fixing){
 if(!Object.hasOwn(kitchenShelfFixings,fixing))throw Error('Выберите крепление полки из ЛДСП.');
 return values.map(value=>value.startsWith('board/')?'board/'+fixing:value);
}
export function kitchenHinges(id){
 return Object.values(hingeCatalogue).filter(p=>Boolean(p.frame)===isVitrine(id)&&['overlay','inset'].includes(p.kind));
}
export function kitchenFields(id,s,projectFixing=null){
 const m=kitchenModels.find(model=>model.id===id);
 if(!m)throw Error('Выберите кухонный модуль ИИ.');
 const vitrine=isVitrine(id),firstDoor=s?.front?.swing==='right'?'door-right':'door-left';
 const source=s?.lighting??{},left=source.left,right=source.right,line=(left??right??source.bottom)?.[0];
 const pull=s?.front?.handles?.[firstDoor],shelves=s?.shelves??m.shelves;
 const shelfFixing=s?.kitchenShelfFixing??projectFixing;
 const standard=shelfFixing&&!isVitrine(id)?'board/'+shelfFixing:shelfDefault(id);
 const system=line?.system??'lira-17.5x6.5',groove=lightingSystems[system].groove_width_mm;
 // Legacy clear-opening profiles had 8 mm at either end. Editing converts them
 // to the source workshop run, while preserving their original depth position.
 const legacy=Boolean(line&&!line.fullPanel&&line.start===8&&line.end===8);
 return {id,width:s?.width??600,height:s?.height??720,depth:s?.depth??m.depth,elevation:s?.elevation??m.elevation,
   shelves,shelfFixing,shelfChoices:Array.from({length:3},(_,i)=>s&&i<shelves?(s.shelfChoices?.[0]?.[i]??'board/95388'):standard),
   swing:s?.front?.swing??(vitrine?'pair':'left'),hinge:s?hingeProduct(s.front,firstDoor).article:vitrine?'71B950A':'112595',
   feet:s?.feet?.article??'86502',handle:s?(pull?.article??'none'):(vitrine?'none':'79080'),
   orientation:pull&&['top','bottom'].includes(pull.edge)?'horizontal':'vertical',
   light:s?(left&&right?'both':left?'left':right?'right':'off'):(vitrine?'both':'off'),workLight:Boolean(source.bottom),
   lightSystem:system,lightAxis:line?(line.offset??0)+groove/2:vitrine?(m.depth/2):50,
   lightStart:legacy||!line?(id==='wall-vitrine'?9:0):line.start??0,lightEnd:legacy?0:line?.end??0,
   underAxis:source.bottom?source.bottom[0].offset+lightingSystems[source.bottom[0].system].groove_width_mm/2:50,
   materials:s?.kitchenMaterials?structuredClone(s.kitchenMaterials):null};
}
export function kitchenSpec(f){
 const model=kitchenModels.find(m=>m.id===f.id);
 if(!model)throw Error('Выберите кухонный модуль ИИ.');
 const base=isBase(f.id),glass=isVitrine(f.id),sink=f.id==='base-sink';
 if(!Number.isInteger(f.shelves)||f.shelves<0||f.shelves>3||sink&&f.shelves)throw Error(sink?'В шкафу под мойку оставьте место для коммуникаций.':'Выберите от нуля до трёх полок.');
 if(!['left','right','pair'].includes(f.swing)||!kitchenHinges(f.id).some(p=>p.article===f.hinge))throw Error('Выберите совместимую петлю и сторону открывания.');
 if(f.width>600&&f.swing!=='pair')throw Error('Для корпуса шире 600 мм выберите две двери.');
 if(f.width>1200)throw Error('Ширина модуля с двумя дверями до 1200 мм.');
 const s={kitchenModel:f.id,kitchenStandard:2,recipe:sink?'sink':base?'base':'wall',width:f.width,height:f.height,depth:f.depth,thickness:18,shelves:f.shelves,
   sections:1,sectionShelves:[f.shelves],clearLayout:true,back:!sink,elevation:base?0:f.elevation,
   shelfSetback:base?1:0,shelfGap:1,edgeThickness:1,edgePolicy:'front',joints:{top:'confirmat',bottom:'confirmat'},
   front:{swing:f.swing,offset:90,autoHinges:true,hinges:{}}};
 if(f.materials)s.kitchenMaterials=structuredClone(f.materials);
 if(!sink&&f.shelfFixing!=null){
   if(!Object.hasOwn(kitchenShelfFixings,f.shelfFixing))throw Error('Выберите крепление полки из ЛДСП.');
   s.kitchenShelfFixing=f.shelfFixing;
 }
 if(base){
   const foot=kitchenFoot(f.feet);if(!foot)throw Error('Выберите опору из присланных моделей.');
   s.bottomFit='overlay';s.feet={layout:'width',article:f.feet,front:foot.plinth?75:10,rear:foot.plinth?50:10};
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
 if(f.shelves)s.shelfChoices=[Array.from({length:f.shelves},(_,i)=>{
   const value=f.shelfChoices?.[i]??shelfDefault(f.id),c=choice(value,18);
   if(!glass&&c.kind==='glass')throw Error('Для распашного шкафа выберите полку из ЛДСП.');
   return value;
 })];
 if(!['off','left','right','both'].includes(f.light)||!Object.hasOwn(lightingSystems,f.lightSystem))throw Error('Выберите вариант подсветки.');
 const lighting={},half=lightingSystems[f.lightSystem].groove_width_mm/2;
 const line=(face,axis,start,end)=>{
   if(![axis,start,end].every(Number.isFinite)||axis<half||start<0||end<0)throw Error('Проверьте отступ оси паза от переднего торца и поля профиля.');
   return [{system:f.lightSystem,face,anchor:'front',offset:axis-half,start,end,fullPanel:true}];
 };
 if(f.workLight)lighting.bottom=line(0,f.underAxis,0,0);
 if(['left','both'].includes(f.light))lighting.left=line(0,f.lightAxis,f.lightStart,f.lightEnd);
 if(['right','both'].includes(f.light))lighting.right=line(1,f.lightAxis,f.lightStart,f.lightEnd);
 if(Object.keys(lighting).length){s.lighting=lighting;s.lightKit={control:f.workLight?'wave':'door'};}
 carcassSpec(s);return s;
}
