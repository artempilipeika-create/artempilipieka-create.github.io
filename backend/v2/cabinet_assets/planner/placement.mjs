import {bounds,elevation,tier,rotateXZ,placementError} from './furniture-core.mjs';
const rounded=it=>({...it,x:Math.round(it.x),z:Math.round(it.z),elevation_mm:Math.round(it.elevation_mm)});
const verticalPeers=(a,b,room)=>Math.abs(elevation(a,room)-elevation(b,room))<180&&((tier(a)==='wall')===(tier(b)==='wall'));
/** A drag retains anchors, not mutations of the saved model. Release radius > capture. */
export function snapItem(raw,items,room,options={},previous={}){
  let it={...raw,elevation_mm:elevation(raw,room)};
  const threshold=Math.max(12,Math.min(100,options.threshold??45));
  const anchors={},guides=[];
  if(options.enabled===false)return{item:rounded(it),anchors,error:placementError(it,items,room),guides};
  const walls=[{r:0,axis:'z',edge:-room.depth/2,sign:1},{r:90,axis:'x',edge:room.width/2,sign:-1},
    {r:180,axis:'z',edge:room.depth/2,sign:-1},{r:270,axis:'x',edge:-room.width/2,sign:1}];
  const wallOffset=Number(options.wallOffset)||0;
  const candidates=[];
  for(const wall of walls){
    const position=wall.edge+wall.sign*(it.depth/2+wallOffset);
    const distance=Math.abs(it[wall.axis]-position);
    const limit=previous.wall===wall.r?threshold*1.65:threshold;
    if(distance<limit&&(options.autoRotate!==false||it.rotation===wall.r))candidates.push({wall,position,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  if(candidates.length){
    const {wall,position}=candidates[0];it.rotation=wall.r;it[wall.axis]=position;
    anchors.wall=wall.r;anchors[wall.axis]=position;
    guides.push({axis:wall.axis,value:wall.edge,text:'К стене · отступ '+wallOffset+' мм'});
  }
  const b=bounds(it,room,false),axis=it.rotation===90||it.rotation===270?'z':'x',cross=axis==='x'?'z':'x';
  const min=axis==='x'?'minX':'minZ',max=axis==='x'?'maxX':'maxZ';
  const peers=items.filter(x=>x.item_id!==it.item_id&&x.rotation===it.rotation&&verticalPeers(it,x,room));
  const choices=[];
  for(const other of peers){
    const ob=bounds(other,room,false),half=(b[max]-b[min])/2;
    for(const value of[ob[min]-half,ob[max]+half]){
      const distance=Math.abs(it[axis]-value),limit=previous[axis]===value?threshold*1.65:threshold;
      const crossDistance=Math.abs(it[cross]-other[cross]);
      if(distance<=limit&&crossDistance<Math.max(it.depth,other.depth)+threshold)choices.push({value,other,distance,ob});
    }
  }
  choices.sort((a,b)=>a.distance-b.distance);
  if(choices.length){
    const {value,other}=choices[0];it[axis]=value;anchors[axis]=value;
    guides.push({axis,value,text:'Стык боковин · 0 мм'});
    const front=rotateXZ(0,1,it.rotation),direction=front[cross];
    const line=options.alignment==='back'?'back':'front';
    const aligned=other[cross]+direction*(other.depth-it.depth)/2*(line==='front'?1:-1);
    // A wall anchor has priority over changing the wall clearance.
    if(anchors[cross]===undefined&&Math.abs(it[cross]-aligned)<threshold*2){
      it[cross]=aligned;anchors[cross]=aligned;
      guides.push({axis:cross,value:aligned+direction*it.depth/2*(line==='front'?1:-1),text:line==='front'?'Линия фасадов':'Линия задних стенок'});
    }
  }
  if(tier(it)==='wall'){
    const ys=[...new Set([options.upperRow??1500,...peers.map(x=>elevation(x,room))])];
    ys.sort((a,b)=>Math.abs(a-it.elevation_mm)-Math.abs(b-it.elevation_mm));
    if(ys.length&&Math.abs(ys[0]-it.elevation_mm)<(previous.y===ys[0]?threshold*1.65:threshold)){
      it.elevation_mm=ys[0];anchors.y=ys[0];guides.push({axis:'y',value:ys[0],text:'Навеска · '+ys[0]+' мм'});
    }
  }
  it=rounded(it);
  return{item:it,anchors,error:placementError(it,items,room),guides};
}
/** Click/duplicate placement never silently moves an existing cabinet. */
export function findSpace(draft,items,room,selected,options={}){
  const initial={...draft,elevation_mm:elevation(draft,room)};
  const starts=[];
  const peers=[selected,...items].filter((x,i,a)=>x&&a.indexOf(x)===i&&verticalPeers(initial,x,room));
  for(const peer of peers){
    const r=peer.rotation||0,axis=r===90||r===270?'z':'x',cross=axis==='x'?'z':'x';
    for(const sign of[1,-1]){
      const p={...initial,rotation:r,x:peer.x,z:peer.z};
      p[axis]+=sign*(peer.width+p.width)/2;
      const f=rotateXZ(0,1,r);p[cross]+=f[cross]*(peer.depth-p.depth)/2;
      starts.push(p);
    }
  }
  const clearance=options.wallOffset||0;
  starts.push({...initial,rotation:0,x:0,z:-room.depth/2+initial.depth/2+clearance});
  for(const p of starts)if(!placementError(p,items,room))return rounded(p);
  // A bounded grid search is used only for click placement, never in pointermove.
  for(const r of[0,90,180,270]){
    const sample={...initial,rotation:r};const b=bounds(sample,room);const ww=b.maxX-b.minX,dd=b.maxZ-b.minZ;
    for(let z=-room.depth/2+dd/2+clearance;z<=room.depth/2-dd/2;z+=Math.max(100,Math.min(dd,300)))
      for(let x=-room.width/2+ww/2;x<=room.width/2-ww/2;x+=Math.max(100,Math.min(ww,300))){
        const p={...sample,x,z};if(!placementError(p,items,room))return rounded(p);
      }
  }
  return null;
}
export function conflictList(items,room){return items.map(it=>({id:it.item_id,error:placementError(it,items,room)})).filter(x=>x.error);}
