import {hingeCatalogue} from './wardrobe-hinge-layout.mjs';
import pullCatalogue from './wardrobe-handle-catalogue.json' with {type:'json'};
import {splitAt,levelOf,splitKey,sectionOf,isRightBank} from './wardrobe-layout.mjs';
import aks from './aks-wardrobe.json' with {type:'json'};
import prime from './wardrobe-prime.json' with {type:'json'};
import joinery from './prime-drawer-joinery.json' with {type:'json'};
import {fittings} from './carcass-joints.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';
import {doorSide} from './wardrobe-door-layout.mjs';
import {doorHinges} from './wardrobe-hinges.mjs';
import {spacerCuts,frontAtHinge} from './wardrobe-drawers.mjs';

const close=(a,b)=>Math.abs(a-b)<.01;
function hostHinges(group,host,items){
 return items.filter(i=>i.item_id.startsWith(group+':')&&doorSide(i.item_id.slice(group.length+1)))
   .flatMap(i=>doorHinges(i,items)).filter(h=>h.host_blank_id===host.item_id);
}
function sideAxes(group,side,items,rotation){
 const front=items.find(i=>i.assistant_carcass?.group_id===group)?.assistant_carcass.spec.front;
 return hostHinges(group,{item_id:group+':'+side},items).map(h=>front?.autoHinges||front?.hinges?{y:h.position.y,z:localPoint(h.position,rotation).z,article:h.article}:h.position.y);
}
export function installedCuts(panel,items){
 const meta=panel.assistant_carcass,match=/:drawer-(\d+)-spacer-(left|right)$/.exec(panel.item_id??'');
 if(!meta||!match)return [];
 return spacerCuts(panel.elevation_mm,panel.height,sideAxes(meta.group_id,match[2],items,panel.rotation),match[2],localPoint(panel,panel.rotation).z+panel.depth/2);
}

export function screwRows(bottom,height,rails){
 const count=Math.max(2,Math.ceil((height-50)/320)+1),positions=[];
 for(let i=0;i<count;i++){
  const target=bottom+25+(height-50)*i/(count-1);
  let best=null;
  for(let y=bottom+12;y<=bottom+height-12;y+=.5){
   if(rails.some(axis=>Math.abs(axis-y)<28)||positions.some(at=>Math.abs(at-y)<24))continue;
   if(best===null||Math.abs(y-target)<Math.abs(best-target))best=y;
  }
  if(best===null)throw Error('На проставке нет места для шурупов между направляющими.');
  positions.push(best);
 }
 return positions;
}

function faceScrews(face,fore,at,add,front,height){
 const grip=face.blank_edge_pull;
 let screwX=at(face).x,usable=Math.min(fore.width,face.width),screwY=height;
 if(grip){
  // Fix the two boards only where their wood overlaps, clear of the profile shank.
  const clearance=grip.grooveDepth??pullCatalogue[grip.article].trialGrooveDepth,margin=3;
  const lowX=Math.max(at(fore).x-fore.width/2,at(face).x-face.width/2+(grip.edge==='left'?clearance:0));
  const highX=Math.min(at(fore).x+fore.width/2,at(face).x+face.width/2-(grip.edge==='right'?clearance:0));
  const lowY=Math.max(fore.elevation_mm,face.elevation_mm+(grip.edge==='bottom'?clearance:0))+margin;
  const highY=Math.min(fore.elevation_mm+fore.height,face.elevation_mm+face.height-(grip.edge==='top'?clearance:0))-margin;
  if(highX-lowX<=4*margin||lowY>highY)throw Error('Для шурупов фасада шуфляды '+face.name+' не хватает места рядом с врезной ручкой.');
  screwX=(lowX+highX)/2;usable=highX-lowX;screwY=Math.max(lowY,Math.min(highY,screwY));
 }
 const inset=Math.min(100,usable/4);
 const positions=[screwX-usable/2+inset,screwX,screwX+usable/2-inset];
 for(const x of positions)add('face',aks.joints.face,'Шуруп AKS 5×30 · '+face.name,[fore,face],x,screwY,front-18);
 return {positions,y:screwY};
}

// Keep complete pairs inside the mating edges. Short rear walls can be only 40 mm high.
function verticalPairs(panel,low=panel.elevation_mm,high=panel.elevation_mm+panel.height){
 const two=panel.height>=joinery.twoVerticalPairsFrom,span=high-low;
 const pitch=span>=(two?joinery.twoVerticalPairsFrom:joinery.pitch+24)?joinery.pitch:joinery.compactPitch;
 const minimum=(two?2*pitch+16:pitch)+24;
 if(span<minimum-.001)return [];
 if(!two){const cam=(low+high-pitch)/2;return [[cam,cam+pitch]];}
 const margin=Math.min(50,(span-2*pitch-16)/2);
 return [[low+margin,low+margin+pitch],[high-margin,high-margin-pitch]];
}

// The medium rear wall shares a dowel exactly between the two cam studs.
function rearFixings(panel){
 const low=panel.elevation_mm,high=low+panel.height;
 if(panel.height<joinery.twoVerticalPairsFrom){
  const [[cam,dowel]]=checkedPairs(verticalPairs(panel),panel);
  return {cams:[cam],dowels:[dowel]};
 }
 const cams=[low+joinery.rearEdgeMargin,high-joinery.rearEdgeMargin];
 const dowels=panel.height<joinery.secondRearDowelFrom?[(low+high)/2]:[cams[0]+joinery.pitch,cams[1]-joinery.pitch];
 return {cams,dowels};
}

function floorFacePairs(floor,face,at,push,gripDepth){
 const left=at(floor).x-floor.width/2,right=left+floor.width,faceLeft=at(face).x-face.width/2;
 const low=Math.max(left+8,faceLeft+8+(face.blank_edge_pull?.edge==='left'?gripDepth:0));
 const high=Math.min(right-8,faceLeft+face.width-8-(face.blank_edge_pull?.edge==='right'?gripDepth:0));
 const mid=(low+high)/2;
 // The front locks reach 68 / 78.5 mm from the edge of the floor. Leave room for the Ø15 cup.
 const clip=push?86:75.5;
 const slots=Math.min(face.width,floor.width)>=joinery.twoFloorPairsFrom?
   [[low,mid-8,left+100,-1],[mid+8,high,right-100,1]]:[[low,high,mid,1]];
 const pairs=slots.map(([lo,hi,target,preferred])=>{
  for(const pitch of [joinery.pitch,joinery.compactPitch]){
   let best=null;
   for(const sign of [preferred,-preferred]){
    const a=Math.max(left+clip,lo,lo-sign*pitch),b=Math.min(right-clip,hi,hi-sign*pitch);
    if(a>b+.001)continue;
    const cam=Math.max(a,Math.min(b,target)),offset=Math.abs(cam-target);
    if(!best||offset<best.offset)best={cam,dowel:cam+sign*pitch,offset};
   }
   if(best)return [best.cam,best.dowel];
  }
  return null;
 });
 return pairs.every(Boolean)?pairs:[];
}

function gripDepthOf(face){
 const grip=face.blank_edge_pull;
 return grip?(grip.grooveDepth??pullCatalogue[grip.article].trialGrooveDepth):0;
}
function frontSidePairs(side,face,gripDepth){
 const edge=face.blank_edge_pull?.edge;
 return verticalPairs(side,Math.max(side.elevation_mm,face.elevation_mm+(edge==='bottom'?gripDepth:0)),
  Math.min(side.elevation_mm+side.height,face.elevation_mm+face.height-(edge==='top'?gripDepth:0)));
}
function checkedPairs(rows,panel){
 if(!rows.length)throw Error(panel.name+' · недостаточно места для пары эксцентрик + шкант. Проверьте размеры соединения и паз ручки.');
 return rows;
}

// Cup centres in the local axes of the panel. The wooden dowels are buried in the mating edges.
export function drawerCamSeats(panel,items){
 const match=/:drawer-(\d+)-(\d+)-(rear|side-left|side-right|bottom)$/.exec(panel.item_id??'');
 const bank=match&&panel.assistant_carcass?.spec?.drawerBanks?.[Number(match[1])];
 if(bank?.railFamily!=='concealed')return [];
 const role=match[3],w=panel.width,d=panel.depth,base=panel.elevation_mm;
 if(role==='rear')return rearFixings(panel).cams.flatMap(y=>[-1,1].map(sign=>['z',sign*(w/2-34),y-base,-d/2+6.4]));
 const face=items.find(it=>it.item_id===panel.item_id.slice(0,-role.length)+'face');
 if(!face)return [];
 const gripDepth=gripDepthOf(face);
 if(role!=='bottom'){
  if(bank.faceFixing==='plank')return [];
  const sign=role==='side-left'?1:-1;
  return frontSidePairs(panel,face,gripDepth).map(([y])=>['x',sign*(w/2-6.4),y-base,d/2-34]);
 }
 const at=p=>localPoint(p,panel.rotation||0);
 const front=floorFacePairs(panel,face,at,bank.opening==='push',gripDepth);
 return [...front.map(([x])=>['y',x-at(panel).x,6.4,d/2-34]),
  ...[-1,1].flatMap(side=>[-1,1].map(end=>['y',side*(w/2-34),6.4,end*(d/2-100)]))];
}

function plankFloorScrews(left,width,occupied){
 // Keep these vertical holes clear of the horizontal dowels, cam studs and facing screws.
 const clear=[],right=left+width;
 for(let x=left+43;x<=right-43;x+=.5){
  if(occupied.every(h=>Math.abs(x-h)>=10))clear.push(x);
 }
 const inset=Math.max(52,Math.min(100,width/4));
 const nearest=(xs,target)=>xs.reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a);
 if(!clear.length||clear.at(-1)-clear[0]<16)throw Error('Мало места для крепления передней планки к дну. Проверьте ширину фасада и положение ручки.');
 const first=nearest(clear.filter(x=>x<=clear.at(-1)-16),left+inset);
 return [first,nearest(clear.filter(x=>x>=first+16),right-inset)];
}

function concealedDrawer(bank,parts,hosts,at,add,joint){
 const {left,right,face,fore,rear,floor}=parts,depth=left.depth,length=depth+10;
 const push=bank.opening==='push',opening=push?'push':'soft',source=prime[opening][length];
 const y=left.elevation_mm,z=at(left).z+depth/2,sideX=[at(left).x,at(right).x];
 const supportX=[at(hosts[0]).x+hosts[0].width/2,at(hosts[1]).x-hosts[1].width/2];
 const span=supportX[1]-supportX[0],mountY=y-(push?20:17),mountZ=z-(push?4:0);
 if(!source||!close(sideX[0]-supportX[0],15.5)||!close(supportX[1]-sideX[1],15.5)||
  !close(right.depth,depth)||!close(floor.width,span-49)||!close(floor.elevation_mm,y+12)||
  !close(at(right).z,at(left).z)||!close(right.elevation_mm,y)||!close(at(face).z-9,z))
  throw Error('Проверьте посадку короба PRIME на обе направляющие.');
 const rail=add('concealed',source,'PRIME by AKS '+(push?'Push to open':'с доводчиком')+' · '+length+' мм · '+source.article,[hosts[0],left],supportX[0],mountY,mountZ);
 Object.assign(rail,{article:source.article,opening,length_mm:length,span_mm:span,other_host_id:hosts[1].item_id,...(push?{cut_mm:span-206}:{})});
 const grip=face.blank_edge_pull,gripDepth=gripDepthOf(face);
 const floorY=floor.elevation_mm+9,floorLeft=at(floor).x-floor.width/2;
 const faceLow=face.elevation_mm+(grip?.edge==='bottom'?gripDepth:0);
 const faceHigh=face.elevation_mm+face.height-(grip?.edge==='top'?gripDepth:0);
 const faceLeft=at(face).x-face.width/2+(grip?.edge==='left'?gripDepth:0);
 const faceRight=at(face).x+face.width/2-(grip?.edge==='right'?gripDepth:0);
 const pair=(host,panel,cam,dowel,yaw,roll=0,back=false)=>{
  joint('cam',host,panel,...cam,yaw,roll,back);
  joint('dowel',host,panel,...dowel,yaw,roll,back);
 };
 const rearRows=rearFixings(rear);
 for(const [k,side] of [left,right].entries()){
  const sign=k?-1:1,inner=sideX[k]+sign*9,outer=sideX[k]-sign*9;
  for(const signZ of [-1,1]){
   const axis=at(floor).z+signZ*(depth/2-100);
   pair(side,floor,[inner,floorY,axis],[inner,floorY,axis-signZ*joinery.pitch],k?180:0);
  }
  // The stud enters the side. The cup is drilled from the rear (-Z) face.
  for(const y of rearRows.cams)joint('cam',side,rear,inner,y,at(rear).z,0,k?180:0,true);
  for(const y of rearRows.dowels)joint('dowel',side,rear,inner,y,at(rear).z,0,k?180:0,true);
  if(fore){
   const margin=Math.min(50,fore.height/4);
   for(const h of [margin,fore.height-margin])
    add('bolt',aks.joints[k?'boltRight':'boltLeft'],'Конфирмат 7×50 · '+fore.name,[side,fore],outer,fore.elevation_mm+h,at(fore).z);
  }else{
   if(sideX[k]<faceLeft+4||sideX[k]>faceRight-4)throw Error(face.name+' · проверьте ширину фасада и паз ручки у крепления боковины.');
   for(const [cam,dowel] of checkedPairs(frontSidePairs(side,face,gripDepth),side))
    pair(face,side,[sideX[k],cam,z],[sideX[k],dowel,z],k?270:90,k?0:180,true);
  }
 }
 if(floorY<faceLow+4||floorY>faceHigh-4)throw Error(face.name+' · паз ручки пересекает нижнее крепление фасада.');
 const bottomPairs=checkedPairs(floorFacePairs(floor,face,at,push,gripDepth),face);
 for(const [cam,dowel] of bottomPairs)pair(face,floor,[cam,floorY,z],[dowel,floorY,z],270);
 const inset=Math.max(52,Math.min(100,floor.width/4)),floorTop=floor.elevation_mm+floor.height;
 for(const x of [floorLeft+inset,floorLeft+floor.width-inset])joint('confirmat',floor,rear,x,floorTop,at(rear).z,0,90);
 if(fore){
  const screws=faceScrews(face,fore,at,add,z,fore.elevation_mm+fore.height/2);
  const occupied=bottomPairs.flat();
  if(screws.y-floorTop<=39)occupied.push(...screws.positions);
  for(const x of plankFloorScrews(floorLeft,floor.width,occupied))joint('confirmat',floor,fore,x,floorTop,at(fore).z,0,90);
 }
 return {axis:mountY+(push?23.5:23),front:mountZ,length};
}

export function wardrobeHardware(items){
 const groups=new Map(),out=[];
 for(const i of items){
  const g=i.assistant_carcass;
  if(!g?.spec.drawerBanks?.some(Boolean))continue;
  if(!groups.has(g.group_id))groups.set(g.group_id,new Map());
  groups.get(g.group_id).set(i.item_id.slice(g.group_id.length+1),i);
 }
 for(const parts of groups.values()){
  const get=key=>{
    const p=parts.get(key);
    if(!p)throw Error('Для крепежа шуфляд не хватает детали '+key+'. Пересоберите шкаф по анкете.');
    return p;
  };
  const origin=get('left'),rotation=origin.rotation,spec=origin.assistant_carcass.spec;
  const at=p=>localPoint(p,rotation);
  const add=(kind,source,label,hosts,x,y,z)=>{
   if(hosts.some(p=>p.rotation!==rotation))throw Error(label+' · проверьте поворот соединяемых деталей.');
   out.push({name:label,aks_kind:kind,source_file:source.file,source_sha256:source.sha,
    host_blank_id:hosts[0].item_id,joined_panel_id:hosts[1].item_id,
    position:{...worldPoint({x,z},rotation),y},rotation,elastic_resize:false});
   return out.at(-1);
  };
  const joint=(kind,host,joined,x,y,z,yaw,roll=0,back=false)=>{
   const [source_file,source_sha256]=fittings[kind];
   out.push({name:source_file.slice(0,-5)+' · '+joined.name,joint_part:kind,source_file,source_sha256,
    host_blank_id:host.item_id,joined_panel_id:joined.item_id,position:{...worldPoint({x,z},rotation),y},
    rotation:(rotation+yaw)%360,joint_roll_deg:roll,...(back?{joint_back_face:true}:{}),elastic_resize:false});
  };
  const automatic=Boolean(spec.front?.autoHinges||spec.front?.hinges);
  const sharedSeats=new Map();
  spec.drawerBanks.forEach((bank,slot)=>{
   if(!bank)return;
   const section=sectionOf(slot),prefix='drawer-'+slot+'-',railAxes=[],sides=['left','right'];
   const panels=sides.map((side,k)=>get(k===0?(section===0?'left':'divider-'+(section-1)):(section===spec.sections-1?'right':'divider-'+section)));
   const split=splitAt(spec,section,levelOf(slot)),shared=split?.kind==='drawers',innerSide=isRightBank(slot)?0:1;
   if(shared)panels[innerSide]=get(splitKey(split)+'-divider');
   const spacers=sides.map(side=>parts.get(prefix+'spacer-'+side));
   const hinges=panels.map((p,k)=>hostHinges(origin.assistant_carcass.group_id,p,items).filter(h=>h.door_side===sides[k]));
   const cuts=spacers.map(p=>p?installedCuts(p,items):[]);
   let railFront,railLength;
   bank.faces.forEach((_,index)=>{
    const key=prefix+index+'-',sideParts=sides.map(s=>get(key+'side-'+s)),face=get(key+'face'),fore=parts.get(key+'front'),rear=get(key+'rear');
    if(bank.railFamily==='concealed'){
     const hosts=panels.map((p,k)=>spacers[k]??p);
     const {axis,front,length}=concealedDrawer(bank,{left:sideParts[0],right:sideParts[1],face,fore,rear,floor:get(key+'bottom')},hosts,at,add,joint);
     for(const [k,host] of hosts.entries()){
      const r=bank.opening==='push'?23.5:23;
      if(!automatic&&cuts[k].some(([lo,hi])=>axis+r>host.elevation_mm+lo&&axis-r<host.elevation_mm+hi))throw Error('Направляющая PRIME попадает в вырез под петлю.');
     }
     railAxes.push(axis);railFront=front;railLength=length;
     return;
    }
    if(!fore)throw Error('Пересоберите переднюю стенку шариковой шуфляды.');
    const [left,right]=sideParts,L=left.depth,cat=aks.rails[L],y=left.elevation_mm,ax=y+40;
    const front=at(left).z+L/2,xl=at(left).x-left.width/2,xr=at(right).x+right.width/2;
    if(!cat||right.depth!==L||!close(at(left).z,at(right).z)||!close(y,right.elevation_mm))throw Error('Нарушена геометрия боковин шуфляды '+(index+1)+'.');
    railAxes.push(ax);railFront=front;railLength=L;
    for(const [k,side] of sides.entries()){
     const sign=k?-1:1,host=spacers[k]??panels[k],mount=at(host).x+sign*host.width/2,box=k?xr:xl;
     if(!close((box-mount)*sign,13.5))throw Error('Секция '+(section+1)+': направляющей нужно 13,5 мм с каждой стороны.');
     if(!automatic&&cuts[k].some(([lo,hi])=>ax+22.5>host.elevation_mm+lo&&ax-22.5<host.elevation_mm+hi))throw Error('Шуфляда '+(index+1)+': направляющая попадает в вырез под петлю. Измените положение блока.');
     const faceClear=sign*(at(face).x-(at(panels[k]).x+sign*panels[k].width/2))-face.width/2;
     if(!automatic&&hinges[k].some(h=>faceClear<{overlay:23.6,half:33.6,inset:41.1}[hingeCatalogue[h.article].kind]&&frontAtHinge(face.elevation_mm,face.height,h.position.y,side)))throw Error('Фасад шуфляды '+(index+1)+' пересекает петлю. Пересчитайте ширину фасада в анкете шкафа.');
     const label='PRIME by AKS '+cat.article+' · '+L+' мм · '+(k?'правая':'левая')+' · '+face.name;
     let source=cat[side];
     if(shared&&k===innerSide){
       const used=sharedSeats.get(host.item_id)??[];
       source=[cat.shared[side],cat.sharedAlt[side]].find(pattern=>pattern.fixed.every(([z,dy])=>used.every(p=>Math.hypot(p.y-ax-dy,p.z-front+z)>=4)));
       if(!source)throw Error('Встречные шурупы 18 мм на общей стойке. Проверьте уровни направляющих.');
       for(const [z,dy] of source.fixed)used.push({z:front-z,y:ax+dy});
       sharedSeats.set(host.item_id,used);
     }
     add('rail',source,label,[host,sideParts[k]],mount,ax,front);
     const inset=Math.min(50,left.height/3);
     for(const end of [fore,rear])for(const level of [y+inset,y+left.height-inset]){
      add('bolt',aks.joints[k?'boltRight':'boltLeft'],'Конфирмат 7×50 · '+end.name,[sideParts[k],end],box,level,at(end).z);
     }
    }
    faceScrews(face,fore,at,add,front,y+left.height/2);
   });
   for(const [k,p] of spacers.entries()){
    if(!p)continue;
    const x=at(p).x+(k?-1:1)*p.width/2;
    for(const y of screwRows(p.elevation_mm,p.height,railAxes))for(const z of [railFront-75,railFront-railLength+40]){
     add('spacer',aks.joints[k?'spacerRight':'spacerLeft'],'AKS 12867 · '+p.name,[p,panels[k]],x,y,z);
    }
   }
  });
 }
 return out;
}
