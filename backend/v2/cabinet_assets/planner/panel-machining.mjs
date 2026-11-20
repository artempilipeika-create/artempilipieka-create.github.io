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

export const defaultBackMount=kind=>kind==='groove'?{kind,width:4,depth:5,offset:18}:{kind,width:4,depth:8};
export function checkBackMount(s){
 const b=s.backMount;if(!b)return;
 if(!s.back||s.backThickness||!['groove','rabbet'].includes(b.kind)||
   ![b.width,b.depth,b.offset??0].every(v=>Number.isFinite(v)&&Number.isInteger(v*2))||
   b.width<3||b.depth<=1||b.depth>=s.thickness||(b.offset??0)<0||
   b.kind==='groove'&&b.offset==null||(b.offset??0)+b.width>=s.depth||b.kind==='rabbet'&&(b.offset??0)!==0)
  throw Error('Проверьте посадку ХДФ 3 мм, глубину выборки и отступ от заднего торца.');
}
export function rearClearance(s){
 return s.backMount?.kind==='groove'?Math.ceil(s.backMount.offset+s.backMount.width):s.backThickness??0;
}
export function rearProjection(s){
 if(s.backMount)return s.backMount.kind==='rabbet'?s.backMount.width:0;
 return s.back&&!s.backThickness?3:0;
}
export function backCut(s,key,base){
 const b=s.backMount;
 if(!b||!['left','right','bottom','top'].includes(key)||b.kind==='rabbet'&&key!=='right')return null;
 const side=key==='left'||key==='right';
 const face=key==='right'||key==='bottom'?1:0;
 const op={...b,edge:'x0',face};
 if(side&&b.kind==='groove'){
  // Terminate at the bearing pieces. An overlay bottom/roof is already outside this side.
  const start=Math.max(0,base),end=s.top==='overlay'?0:Math.max(0,s.thickness-b.depth);
  if(start)op.start=start;if(end)op.end=end;
 }
 return op;
}
