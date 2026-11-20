import catalogue from './wardrobe-handle-catalogue.json' with {type:'json'};

const roll={top:0,bottom:180,left:90,right:-90};
export const isEdgePull=h=>h?.article==='67698'||h?.article==='75975';
export const verticalEdge=edge=>edge==='left'||edge==='right';

export function gripCut(h){
 if(!isEdgePull(h)||h.grooveWidth!=null||h.grooveDepth!=null)return h;
 const part=catalogue[h.article];
 return {...h,grooveWidth:part.trialGrooveWidth,grooveDepth:part.trialGrooveDepth};
}

export function fittedPull(spec,key){
 const drawer=/^drawer-(\d+)-(\d+)-face$/.exec(key);
 const value=drawer?spec.drawerBanks?.[+drawer[1]]?.faces?.[+drawer[2]]?.handle:spec.front?.handles?.[key];
 return isEdgePull(value)?value:null;
}

export function validateEdgePull(h,width,height,thickness,hingeSide){
 const part=catalogue[h.article],vertical=verticalEdge(h.edge);
 if(!isEdgePull(h)||!Object.hasOwn(roll,h.edge)||thickness!==part.facadeThickness)
  return 'Врезной профиль AKS рассчитан на торец фасада 18 мм.';
 if(hingeSide&&h.edge===hingeSide)return 'На этом торце установлены петли. Выберите свободный торец фасада для врезной ручки.';
 if((vertical?height:width)>part.usableLength)return 'Длина профиля превышает полезную длину хлыста '+part.usableLength+' мм.';
 const available=vertical?width:height;
 if(available<40)return 'После установки профиля осталось слишком мало плиты для фасада.';
 const {grooveWidth:w,grooveDepth:d}=gripCut(h);
 if(!Number.isFinite(w)||w<=0||w>=thickness||!Number.isFinite(d)||d<part.shankDepth||d>=available-2)
  return 'Проверьте ширину паза и глубину от '+part.shankDepth+' мм по рабочему инструменту.';
 return '';
}

// The layout describes finished facades. The panel and cutting list describe the board.
export function trimFace(h,height,width,x,y){
 const rise=catalogue[h.article].edgeRise;
 if(verticalEdge(h.edge))return {height,width:width-rise,x:x+(h.edge==='left'?1:-1)*rise/2,y};
 return {height:height-rise,width,x,y:y+(h.edge==='bottom'?rise:0)};
}

export function finishedFaceSize(board){
 const h=board.blank_edge_pull;
 if(!h)return {width:board.width,height:board.height};
 const rise=catalogue[h.article].edgeRise;
 return {width:board.width+(verticalEdge(h.edge)?rise:0),height:board.height+(verticalEdge(h.edge)?0:rise)};
}

export function installedEdgePull(board,h){
 const {width:w,height:b}=board,vertical=verticalEdge(h.edge);
 return {edgePull:true,article:h.article,part:catalogue[h.article],edge:h.edge,vertical,back:false,
  span:vertical?b:w,angle:roll[h.edge],x:vertical?(h.edge==='left'?0:w):w/2,
  y:vertical?b/2:h.edge==='bottom'?0:b};
}
export function nativeGrip(h){
 const cut=gripCut(h);
 return {article:h.article,edge:h.edge,groove_width_mm:cut.grooveWidth,groove_depth_mm:cut.grooveDepth};
}

// Split the wood or PVC only where the registered cutter passes through this box.
// The origin in a front mesh is the centre of its bottom edge and mid-thickness.
export function groovedBoxes(low,high,board,grip){
 grip=gripCut(grip);
 if(!grip?.grooveWidth)return [[low,high]];
 const axis=verticalEdge(grip.edge)?0:1,positive=grip.edge==='right'||grip.edge==='top';
 const end=axis===0?(positive?board.width/2:-board.width/2):(positive?board.height:0);
 const stop=end+(positive?-1:1)*grip.grooveDepth;
 const boxes=[];
 function add(a,b){if(a.every((n,i)=>n<b[i]))boxes.push([a,b]);}
 const wholeLow=[...low],wholeHigh=[...high],tipLow=[...low],tipHigh=[...high];
 if(positive){wholeHigh[axis]=Math.min(high[axis],stop);tipLow[axis]=Math.max(low[axis],stop);}
 else{wholeLow[axis]=Math.max(low[axis],stop);tipHigh[axis]=Math.min(high[axis],stop);}
 add(wholeLow,wholeHigh);
 add(tipLow,[tipHigh[0],tipHigh[1],Math.min(tipHigh[2],-grip.grooveWidth/2)]);
 add([tipLow[0],tipLow[1],Math.max(tipLow[2],grip.grooveWidth/2)],tipHigh);
 return boxes;
}
