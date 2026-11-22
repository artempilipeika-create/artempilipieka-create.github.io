import {backCut,backPanel,backSideTrim,backTrim,checkBackMount} from './panel-machining.mjs';
import catalogue from './wardrobe-handle-catalogue.json' with {type:'json'};

export const fillingCards=[
 {id:'drawers-two',name:'Две шуфляды',photo:'base-drawers',width:600,description:'Два наружных фасада · выбор направляющих'},
 {id:'drawers-three',name:'Три шуфляды',photo:'base-drawers',width:600,description:'Три наружных фасада · выбор направляющих'},
 {id:'dryer',name:'Нижняя выдвижная сушка',photo:'pullout-dryer',width:600,description:'Сушка сверху · шуфляда снизу'},
 {id:'cargo',name:'Карго',photo:'cargo',width:200,description:'Выдвижная корзина · выбор комплекта'}
];
export function fillingSource(id){
 if(id==='cargo')return globalThis.MF_CARGO.family.default_id;
 if(id==='dryer')return globalThis.MF_PULLOUT_DRYERS.family.default_id;
 return globalThis.MF_DRAWERS.choices().find(v=>v.layout===id.replace('drawers-','')&&v.system==='ball'&&v.execution==='standard')?.id;
}
export function fillingFamily(it){
 const C=globalThis.MF_CARGO,D=globalThis.MF_PULLOUT_DRYERS,B=globalThis.MF_DRAWERS;
 if(C.info(it)&&!C.info(it).waste)return {family:'cargo',variant:C.info(it),variants:C.variants.filter(v=>!v.waste),select:C.select};
 if(D.info(it))return {family:'dryer',variant:D.info(it),variants:D.variants,select:D.select};
 const v=B.familyInfo(it);
 if(v&&['two','three'].includes(v.layout))return {family:'drawers',variant:v,variants:B.choices().filter(k=>k.layout===v.layout),select:B.select};
 return null;
}
export function fillingCabinet(it){
 return {recipe:'base',top:'rails',bottom:'overlay',width:it.width,height:it.height-(it.legHeightMm??it.base_height??100),
  depth:it.depth,thickness:18,back:true,backMount:it.kitchenFilling?.backMount};
}
function resize(part){
 const a=part.orientation;
 return {...part,length:part.size[a.length_axis],width:part.size[a.width_axis],thickness:part.size[a.thickness_axis]};
}
const drawerBoard=p=>p.role==='drawer'||p.role==='back'&&p.orientation.thickness_axis==='y';
export function drawerDepth(it){
 const b=it.kitchenFilling?.backMount,v=globalThis.MF_DRAWERS.familyInfo(it);
 // The original ball-bearing box has five millimetres behind it. Keep one
 // millimetre free to the new inner HDF face and keep its front mounting datum.
 if(!b||v?.system!=='ball'||v.execution!=='standard')return it.depth;
 return it.depth-Math.max(0,Math.ceil((b.offset??0)+b.width-4));
}
export function fillingClearanceError(it,parts){
 const b=it.kitchenFilling?.backMount;if(!b)return '';
 const family=fillingFamily(it);
 const basket=family?.family==='dryer'?globalThis.MF_PULLOUT_DRYERS.basket(it):family?.family==='cargo'?globalThis.MF_CARGO.basket(it):null;
 const free=Math.min(...parts.filter(drawerBoard).map(p=>p.position.z-p.size.z/2),basket?basket.z-basket.depth/2:Infinity)+it.depth/2;
 return (b.offset??0)+b.width>free+.001?'Задняя стенка пересекает наполнение. Уменьшите утопление ХДФ или увеличьте глубину корпуса.':'';
}
export function fittedParts(it,parts,partsAt){
 const s=fillingCabinet(it),b=s.backMount;
 if(!b||!parts)return parts;
 checkBackMount(s);
 const base=it.height-s.height,trim=backTrim(b),depth=drawerDepth(it);
 let drawerParts;
 if(depth!==it.depth){
  if(depth<300)throw Error('Недостаточно глубины для шариковых направляющих за задней стенкой.');
  drawerParts=new Map(partsAt(depth).filter(drawerBoard).map(p=>[p.key,{...p,position:{...p.position,z:p.position.z+(it.depth-depth)/2},fitting_depth_mm:depth}]));
 }
 return parts.map(source=>{
  if(drawerParts?.has(source.key))return drawerParts.get(source.key);
  let key=source.key;
  if(source.role==='back'&&source.orientation.thickness_axis==='z')key='back';
  else if(key==='side-L'||key==='side-P')key=key==='side-L'?'left':'right';
  else if(source.role==='body'&&source.size.z===80&&source.position.z<0&&source.size.y===18)key='rail-rear';
  if(!['left','right','bottom','back','rail-rear'].includes(key))return source;
  const p={...source,size:{...source.size},position:{...source.position}};
  if(key==='back'){
   const h=backPanel(s);
   p.size={x:h.length,y:h.width,z:h.thickness};p.position={x:h.x,y:base+h.y+h.width/2,z:h.z};p.back_type=b.kind;
  }else{
   const side=key==='left'||key==='right';
   const inset=side?backSideTrim(b,key):trim;
   if(key==='rail-rear')p.position.z+=inset;
   else if(inset){
    p.size.z-=inset;p.position.z+=inset/2;
    if(p.contour_yz)p.contour_yz=p.contour_yz.map(([y,z])=>[y,Math.max(z,-s.depth/2+inset)]);
   }
   const cut=backCut(s,key,0);
   if(cut){p.panel_machining=[cut];p.machining_axis=side?'side':'horizontal';}
  }
  return resize(p);
 });
}
export function fillingPullRow(it){
 const article=it.kitchenFilling?.pull,p=catalogue[article];if(!p)return null;
 return {key:'kitchen-front-pull',article,name:'Ручка торцевая MONBLAN · '+p.pitch+' мм с крепежом',quantity:it.drawers,unit:'set'};
}
export function adjustmentNote(it){
 const o=it.kitchenFilling;if(!o)return '';
 const notes=[];
 if(o.pull)notes.push('Установить торцевые ручки MONBLAN '+o.pull+' по центру верхнего торца каждого наружного фасада.');
 const b=o.backMount;
 if(b)notes.push((b.kind==='groove'?'Паз':'Четверть')+' под ХДФ 3 мм, ширина '+b.width+' мм, глубина '+b.depth+' мм'+(b.kind==='groove'?', от заднего торца '+b.offset+' мм':'')+'. Посадка и размеры каждой детали указаны в деталировке.');
 return notes.join(' ');
}
globalThis.MF_KITCHEN_FILLINGS={fittedParts,fillingPullRow,drawerDepth,adjustmentNote};
