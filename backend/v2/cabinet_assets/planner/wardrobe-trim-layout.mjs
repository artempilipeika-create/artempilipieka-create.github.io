import {footHeight,plinthPanel} from './plinth-options.mjs';
import {sectionWidths} from './wardrobe-layout.mjs';
import {drawerSections} from './wardrobe-drawers.mjs';
import {facadeLayout,drawerFacades} from './wardrobe-door-layout.mjs';

export const trimLimit=2780;
const minPiece=100;
export const trimSides=['left','right'];
const mm=value=>Math.round(value*1000)/1000;

function stackOutsideBody(s){
 return (s.elevation??0)+footHeight(s)+(s.surround?.upper?.height??0)+(s.surround?.cap?.height??0);
}
export const assemblyHeight=s=>s.height+stackOutsideBody(s);
function customTop(s){
 let top=0;
 for(const side of trimSides){
  const t=s.surround?.[side];
  if(t?.heightMode!=='custom')continue;
  try{top=Math.max(top,(s.elevation??0)+sideBottom(s,side,t)+t.height);}
  catch{/* The assembly preview reports an unresolved plinth or facade selection. */}
 }
 return top;
}
export function savedTrimExtension(s){
 return s.savedTrimGap&&s.overallHeight===customTop(s)?s.savedTrimGap:0;
}
export const lowerBodyHeight=s=>s.overallHeight-stackOutsideBody(s)-savedTrimExtension(s);

// Upgrade only the editable copy. Existing scene boards still rebuild from their saved specification.
export function prepareHeightFields(fields){
 if(fields.overallHeight==null){
  const stack=assemblyHeight(fields),top=customTop(fields);
  fields.overallHeight=Math.max(stack,top);
  if(top>stack)fields.savedTrimGap=top-stack;
 }
 for(const side of trimSides){
  const t=fields.surround?.[side];
  if(!t)continue;
  if(t.start==null){
   const floor=(fields.elevation??0)+(t.bottom??0);
   t.start=floor?'custom':'floor';t.bottom=floor;
  }
  t.split??='auto';
 }
}

export function sideBottom(s,side,t,facades){
 if(t.start==null)return t.bottom??0;
 switch(t.start){
 case 'floor':return -(s.elevation??0);
 case 'custom':{
  if(!Number.isFinite(t.bottom)||mm(t.bottom)!==t.bottom||t.bottom<0||t.bottom>4900)throw Error('Введите нижнюю отметку от пола от 0 до 4900 мм.');
  return t.bottom-(s.elevation??0);
 }
 case 'plinth':return footHeight(s);
 case 'plinthEdge':{
  const panel=plinthPanel(s);
  if(!panel)throw Error('Для привязки к кромке цоколя выберите опоры под цоколь в разделе «Опоры».');
  return panel.height;
 }
 case 'facade':{
  const widths=sectionWidths(s);
  const layout=facades??facadeLayout(s,drawerSections(s,widths));
  const faces=[...layout.doors,...drawerFacades(s,layout.banks).filter(f=>!f.internal)];
  // A line through the outer quarter of the opening also catches inset drawer fronts.
  const inset=s.thickness+widths[side==='left'?0:widths.length-1]/4;
  const x=side==='left'?inset:s.width-inset;
  const near=faces.filter(f=>f.left<=x&&f.left+f.width>=x);
  if(!near.length)throw Error('У этой стороны нет наружного фасада основного шкафа. Добавьте его в шаге «Фасады» или выберите другой нижний край планки.');
  return mm(footHeight(s)+Math.min(...near.map(f=>f.bottom)));
 }
 default:throw Error('Выберите нижний край планки.');
 }
}

function equalPieces(low,high,count){
 const pieces=[];let bottom=low;
 for(let i=1;i<=count;i++){
  const offset=(high-low)*i/count;
  const cut=i===count?high:mm(low+(count>2?Math.round(offset*4)/4:offset));
  pieces.push({bottom,height:mm(cut-bottom)});bottom=cut;
 }
 return pieces;
}
export function trimPieces(bottom,top,split,joint){
 const length=mm(top-bottom);
 if(!Number.isFinite(length)||length<minPiece)throw Error('Высота боковой детали должна быть не меньше 100 мм.');
 if(split==null){
  if(!Number.isInteger(length)||length>3000)throw Error('Высота боковой детали · от 100 до 3000 мм.');
  return [{bottom,height:length}];
 }
 if(!['auto','joint','equal'].includes(split))throw Error('Выберите способ деления боковой планки.');
 if(split==='auto'&&length<=trimLimit)return [{bottom,height:length}];
 const jointFits=joint!=null&&joint-bottom>=minPiece&&top-joint>=minPiece;
 if(split==='joint'&&!jointFits)throw Error('Для стыка по антресоли нужны антресоль и минимум 100 мм планки с каждой стороны стыка.');
 const bounds=split!=='equal'&&jointFits?[bottom,joint,top]:[bottom,top];
 const pieces=bounds.slice(1).flatMap((end,i)=>{
  const start=bounds[i],count=Math.max(split==='equal'?2:1,Math.ceil(mm(end-start)/trimLimit));
  return equalPieces(start,end,count);
 });
 if(pieces.some(p=>p.height<minPiece||p.height>trimLimit))throw Error('Каждая часть планки должна быть от 100 до 2780 мм. Измените положение стыка.');
 return pieces;
}
