export const cutTitles={groove:'Паз в пласти',rabbet:'Четверть',miter:'Запил под 45°'};
export const edgeLabels={
 side:['Задний','Передний','Нижний','Верхний'],horizontal:['Задний','Передний','Левый','Правый'],
 front:['Левый','Правый','Нижний','Верхний'],back:['Верхний','Нижний','Левый','Правый']
};
export const faceLabels={side:['Правая','Левая'],horizontal:['Нижняя','Верхняя'],front:['Внутренняя','Лицевая'],back:['Задняя','Передняя']};
export const panelEdges=['x0','x1','y0','y1'];
export function canMachine(item){
 return item.blank_thickness_mm>=10&&(!item.blank_shelf||item.blank_shelf.startsWith('board/'));
}
export function defaultCut(kind,edge='x0',face=1){
 if(kind==='miter')return {kind,edge,face,land:0};
 if(kind==='rabbet')return {kind,edge,face,width:4,depth:8};
 return {kind,edge,face,width:4,depth:5,offset:18};
}

// Kept verbatim in the standalone BAZIS script. X is blank width, Y its length,
// Z its thickness. Counterclockwise travel puts the material on the left.
export function panelMachiningPlan(op,W,L,T){
 const {kind,edge,face}=op;
 const inset=op.offset??0,start=op.start??0,end=op.end??0;
 const alongY=edge==='x0'||edge==='x1',span=alongY?L:W,across=alongY?W:L;
 if(!['x0','x1','y0','y1'].includes(edge)||![0,1].includes(face)||
    ![start,end].every(v=>Number.isFinite(v)&&v>=0)||start+end>=span)
  throw Error('Проверьте торец, пласть и длину обработки.');
 const line={x0:[0,L-end,0,start],x1:[W,start,W,L-end],y0:[start,0,W-end,0],y1:[W-end,L,start,L]}[edge];
 const surface=face?T:0;
 let profile,name;
 if(kind==='miter'){
  const land=op.land,run=T-land;
  if(!Number.isFinite(land)||land<0||land>=T||run>=across)throw Error('Остаток у края должен быть от 0 до толщины детали.');
  profile=[[0,surface],[run,surface],[0,face?land:T-land]];
  name='Запил 45°';
 }else{
  if(!['groove','rabbet'].includes(kind)||!Number.isFinite(inset)||inset<0||
     !Number.isFinite(op.width)||op.width<=0||inset+op.width>=across||
     !Number.isFinite(op.depth)||op.depth<=0||op.depth>=T||kind==='rabbet'&&inset!==0)
   throw Error('Выборка должна помещаться в пласти, а её глубина должна быть меньше толщины детали.');
  const stop=face?T-op.depth:op.depth;
  profile=[[inset,surface],[inset+op.width,surface],[inset+op.width,stop],[inset,stop]];
  name=kind==='groove'?'Паз в пласти':'Четверть';
 }
 return {name,line,profile};
}
export function machiningError(item){
 const cuts=item.blank_machining;
 if(!cuts)return '';
 if(!Array.isArray(cuts)||cuts.length>32||!canMachine(item))return 'Обработку можно задать на детали из плиты.';
 try{
  for(const op of cuts){
   panelMachiningPlan(op,item.blank_width_mm,item.blank_length_mm,item.blank_thickness_mm);
   const occupied={left:'x0',right:'x1',bottom:'y0',top:'y1'}[item.blank_edge_pull?.edge];
   if(occupied===op.edge&&op.kind==='miter')throw Error('Этот торец занят врезной ручкой. Выберите другой торец для запила.');
  }
 }catch(error){return error.message;}
 return '';
}

export function defaultBackMount(option){
 if(option==='sides')return {kind:'groove',layout:'sides',width:4,depth:5,offset:6};
 if(option==='perimeter')return {kind:'groove',layout:'perimeter',width:4,depth:5,offset:10};
 if(option==='left'||option==='right')return {kind:'rabbet',layout:option,width:4,depth:8};
 return option==='groove'?{kind:'groove',width:4,depth:5,offset:18}:{kind:'rabbet',width:4,depth:8};
}
export function backMountLabel(b){
 if(b.layout==='sides')return 'ХДФ в пазах боковин · под гвозди';
 if(b.layout==='perimeter')return 'ХДФ в пазу по кругу';
 if(b.kind==='groove')return 'ХДФ в пазу';
 return b.layout==='left'?'ХДФ в левой четверти':'ХДФ в правой четверти';
}
// All machining offsets are measured to the start of the cut. The nailed
// panels meet the inner face of the HDF at the far edge of that cut.
export function backTrim(b){
 if(!b?.layout||b.layout==='perimeter')return 0;
 return (b.offset??0)+b.width;
}
export function backSideTrim(b,side){
 if(b?.kind!=='rabbet')return 0;
 if(!b.layout)return side==='right'?-b.width:0;
 return side===b.layout?0:b.width;
}
export function checkBackMount(s){
 const b=s.backMount;if(!b)return;
 const layouts=b.kind==='groove'?['sides','perimeter']:['left','right'];
 if(!s.back||s.backThickness||!['groove','rabbet'].includes(b.kind)||
   (b.layout!=null&&!layouts.includes(b.layout))||
   ![b.width,b.depth,b.offset??0].every(v=>Number.isFinite(v)&&Number.isInteger(v*2))||
   b.width<3||b.depth<=1||b.depth>=s.thickness||(b.offset??0)<0||
   b.kind==='groove'&&b.offset==null||(b.offset??0)+b.width>=s.depth||b.kind==='rabbet'&&(b.offset??0)!==0)
  throw Error('Проверьте посадку ХДФ 3 мм, глубину выборки и отступ от заднего торца.');
}
export function rearClearance(s){
 const b=s.backMount;
 return b?Math.ceil(b.kind==='groove'?b.offset+b.width:backTrim(b)):s.backThickness??0;
}
export function rearProjection(s){
 if(s.backMount)return s.backMount.kind==='rabbet'&&!s.backMount.layout?s.backMount.width:0;
 return s.back&&!s.backThickness?3:0;
}
export function backCut(s,key,legExtension){
 const b=s.backMount;
 const side=key==='left'||key==='right';
 if(!b||!side&&key!=='bottom'&&key!=='top'||b.layout==='sides'&&!side||
    b.kind==='rabbet'&&key!==(b.layout??'right'))return null;
 const face=key==='right'||key==='bottom'?1:0;
 const op={kind:b.kind,width:b.width,depth:b.depth,edge:'x0',face};
 if(b.offset!=null)op.offset=b.offset;
 if(side&&b.kind==='groove'){
  const base=s.bottom==='inset'?s.thickness-b.depth:0;
  const stop=b.layout==='perimeter'?Math.min(s.thickness/2,base):base;
  const start=legExtension+(b.layout==='sides'?0:Math.max(0,stop));
  const end=b.layout||s.top==='overlay'?0:Math.max(0,s.thickness-b.depth);
  if(start)op.start=start;if(end)op.end=end;
 }
 return op;
}
