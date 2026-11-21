import {planAksPush} from './wardrobe-push-layout.mjs';
import pushKit from './wardrobe-push-open.json' with {type:'json'};
import {doorPushGap,hingeCatalogue,withMountingPlate,hingeProduct,installedSide,mountKey,insetDepth,middleDivider,settingFor,meetingGap} from './wardrobe-hinge-layout.mjs';
import {finishedFaceSize} from './wardrobe-edge-pulls.mjs';
import {doorSide,physicalProfiles} from './wardrobe-door-layout.mjs';
import {splitAt,levelOf,sectionOf,isRightBank} from './wardrobe-layout.mjs';
import {drawerHingeSpan,gapAxisRange,plateSpan,railSeat,spacerReachesHinge} from './wardrobe-hinge-fit.mjs';
import {hingeLoad,hingeAxes} from './wardrobe-fronts.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';

// Prefer a usable inter-front gap for each nominal axis inside a drawer bank.
// Joint optimisation keeps all hinge centres at least 64 mm apart.
function fitAxes(ideal,lo,hi,blocked,banks){
 const allowed=y=>y>=lo&&y<=hi&&blocked.every(([a,z])=>y<=a||y>=z);
 if(!banks.some(b=>ideal.some(y=>y>=b.low&&y<=b.high))&&
    ideal.every((y,i)=>allowed(y)&&(!i||y-ideal[i-1]>=64)))return ideal;
 const candidates=new Set(ideal);
 for(let y=Math.ceil(lo);y<=hi;y++)candidates.add(y);
 for(const b of banks)for(const g of b.gaps){candidates.add(g.center);candidates.add(g.low);candidates.add(g.high);}
 // Fractional gap centres and narrow free intervals are valid BAZIS drilling axes.
 for(const [a,z] of blocked){candidates.add(Math.floor(a*1000)/1000);candidates.add(Math.ceil(z*1000)/1000);}
 const positions=[...candidates].filter(allowed).sort((a,b)=>a-b);
 if(!positions.length)return null;
 const outside=(hi-lo+1)**2*(ideal.length+1)*3;
 const cost=ideal.map(target=>{
  const bank=banks.find(b=>target>=b.low&&target<=b.high);
  const gaps=bank?.gaps.filter(g=>positions.some(y=>y>=g.low&&y<=g.high))??[];
  return y=>{
   if(!gaps.length)return (y-target)**2;
   const gap=gaps.find(g=>y>=g.low&&y<=g.high);
   if(!gap)return outside+(y-target)**2;
   const mid=gap.center;
   return (target-mid)**2+(y-mid)**2;
  };
 });
 let costs=positions.map(cost[0]);
 const parents=[];
 for(const score of cost.slice(1)){
   let edge=0,best=-1;
   const back=[],next=[];
   for(const y of positions){
     while(edge<positions.length&&positions[edge]<=y-64){
       if(Number.isFinite(costs[edge])&&(best<0||costs[edge]<costs[best]))best=edge;
       edge++;
     }
     back.push(best);next.push(best<0?Infinity:costs[best]+score(y));
   }
   parents.push(back);costs=next;
 }
 let at=costs.indexOf(Math.min(...costs));
 if(!Number.isFinite(costs[at]))return null;
 const axes=[positions[at]];
 for(let i=parents.length-1;i>=0;i--){at=parents[i][at];axes.unshift(positions[at]);}
 return axes;
}

function automaticAxes(door,host,items,side,shelves,count,section,opposing,fit){
 const {group_id,spec}=door.assistant_carcass;
 const sign=side==='left'?1:-1,at=p=>localPoint(p,door.rotation);
 const zero=door.elevation_mm,wall=at(host).x+sign*host.width/2,back=at(door).z-door.depth/2;
 const pivot=sign*(at(door).x-wall)-door.width/2+1.5;
 const blocked=[...shelves.map(([lo,hi])=>[lo-32,hi+32]),...opposing.map(([a,b])=>[a-1,b+1])];
 const parts=new Map(items.map(item=>[item.item_id,item])),banks=[];
 function block(low,high,span){
  if(span)blocked.push([low-zero-span[1],high-zero-span[0]]);
 }
 function movingPanel(p){
  const edge=p.blank_edge_pull?.edge,finished=finishedFaceSize(p);
  const extra=finished.width-p.width,low=p.elevation_mm-(edge==='bottom'?finished.height-p.height:0);
  const x=at(p).x+(edge==='right'?extra/2:edge==='left'?-extra/2:0);
  const clear=sign*(x-wall)-finished.width/2,setback=back-at(p).z-p.depth/2;
  block(low,low+finished.height,drawerHingeSpan(fit,side,clear,setback,pivot,door.depth,true));
  return [low,low+finished.height];
 }
 (spec.drawerBanks??[]).forEach((bank,slot)=>{
   if(bank?.kind!=='internal'||sectionOf(slot)!==section)return;
   if(splitAt(spec,section,levelOf(slot))?.kind==='drawers'&&isRightBank(slot)!==(side==='right'))return;
   const key=group_id+':drawer-'+slot+'-',spacer=parts.get(key+'spacer-'+side);
   const gaps=[];let first,last;
   for(let i=0;i<bank.faces.length;i++){
     const face=parts.get(key+i+'-face'),box=parts.get(key+i+'-side-'+side);
     if(!face||!box)throw Error('Не найдены детали шуфляды для проверки петель.');
     const [bottom,top]=movingPanel(face);movingPanel(box);
     if(last!==undefined){
      const gap=gapAxisRange(fit,side,last-zero,bottom-zero);
      if(gap.low<=gap.high)gaps.push(gap);
     }
     first??=bottom;last=top;
     const seat=railSeat(bank,box),mount=spacer??host;
     const clear=sign*(at(mount).x-wall)+mount.width/2;
     const setback=back-at(box).z-box.depth/2;
     block(seat.bottom,seat.top,drawerHingeSpan(fit,side,clear,setback,pivot,door.depth,false));
     if(spacer&&spacerReachesHinge(fit,back,at(spacer).z+spacer.depth/2)){
       // The rail may bridge the mouth of a spacer cut. Its first fixing,
       // 37 mm behind the leading edge, still needs solid board around it.
       const [low,high]=plateSpan(fit,side);
       block(seat.screw-5,seat.screw+5,[low-2,high+2]);
     }
   }
   if(gaps.length)banks.push({low:first-zero,high:last-zero,gaps});
 });
 const offset=spec.front.offset,step=(door.height-2*offset)/(count-1);
 const ideal=Array.from({length:count},(_,i)=>Math.round(offset+i*step));
 const low=Math.max(31,host.elevation_mm-zero+26),high=Math.min(door.height-31,host.elevation_mm+host.height-zero-26);
 const axes=fitAxes(ideal,low,high,blocked,banks);
 if(axes)return axes;
 const index=Math.max(0,ideal.findIndex(y=>blocked.some(([a,b])=>y>=a&&y<=b)));
 const error=Error('Секция '+(section+1)+', '+(side==='left'?'левая':'правая')+' дверь: нет свободного положения для комплекта из '+count+' петель.');
 error.hingeConflict={side,section,y:zero+ideal[index],index};throw error;
}

export function doorHinges(door,items){
 if(door.blank_axis!=='front')return [];
 const group=door.assistant_carcass,front=group?.spec?.front;
 if(!group)return [];
 const key=door.item_id.slice(group.group_id.length+1);
 const upper=group.spec.surround?.upper,mezz=/^mezz-door-(left|right)$/.exec(key);
 if(mezz&&upper?.frame==='Z1'&&upper.opening==='swing'){
  const side=mezz[1],host=items.find(p=>p.item_id===group.group_id+':mezz-'+side);
  if(!host)throw Error('Для рамки антресоли нужна боковая стойка.');
  const fit=withMountingPlate(hingeCatalogue['70T950A.TL'],upper.plate),angle=door.rotation,wall=localPoint(host,angle),leaf=localPoint(door,angle);
  const x=wall.x+(side==='left'?1:-1)*host.width/2,z=leaf.z-door.depth/2;
  const {count}=hingeLoad(door.width,door.height,null,'Z1');
  const offset=Math.min(90,Math.floor((door.height-64)/2));
  return hingeAxes(door.height,count,offset).map(y=>({name:'Петля Blum · '+door.name,article:fit.article,article_sku:fit.sku,finish:fit.finish,
   source_file:fit.file,source_sha256:fit.sha,wardrobe_z1_hinge:true,hinge_variant:fit.article,plate_sku:fit.plate.sku,door_side:side,host_blank_id:host.item_id,joined_panel_id:door.item_id,
   rotation:angle,position:{...worldPoint({x,z},angle),y:door.elevation_mm+y},elastic_resize:false}));
 }
 if(!front)return [];
 if(!doorSide(key))return [];
 const spec=group.spec,fit=hingeProduct(front,key),side=installedSide(front,key),hostKey=mountKey(spec,key);
 const host=items.find(i=>i.item_id===group.group_id+':'+hostKey);
 if(!host||host.blank_axis!=='side'||host.rotation!==door.rotation)throw Error('Проверьте стойку крепления выбранной двери.');
 const angle=door.rotation,sign=side==='left'?1:-1,at=localPoint(host,angle),leaf=localPoint(door,angle);
 const x=at.x+sign*host.width/2,z=leaf.z-door.depth/2;
 const overlay=fit.kind==='inset'?-1.5:fit.kind==='half'?(host.width-meetingGap(front,key))/2:host.width-1.5;
 const outer=items.find(i=>i.item_id===group.group_id+':left'),outerAt=localPoint(outer,angle);
 const expectedZ=outerAt.z+outer.depth/2+(fit.kind==='inset'?-door.depth-insetDepth(front,key):settingFor(front,key).push?doorPushGap:0);
 // Previously saved AQ overlay doors can carry the original 3 mm seat.
 const oldAQ=settingFor(front,key).push===true&&fit.kind!=='inset'&&Math.abs(z-expectedZ-1)<.01;
 if((Math.abs(z-expectedZ)>.01&&!oldAQ)||Math.abs(leaf.x-sign*door.width/2-(x-sign*overlay))>.01)
   throw Error('Проверьте положение фасада относительно выбранной стойки.');
 if(fit.plate?.pilots.some(([dz])=>z-dz+2>at.z+host.depth/2||z-dz-2<at.z-host.depth/2))throw Error('Крепление планки Blum выходит за глубину стойки.');
 if(!fit.plate&&(z-37+3>at.z+host.depth/2||z-37-3<at.z-host.depth/2))throw Error('Крепление петли выходит за глубину стойки.');
 const cupMargin=fit.cupFromHostMm+overlay-17.5;
 if(!fit.frame&&fit.kind!=='overlay'&&(cupMargin<3||cupMargin>7))throw Error('Эта толщина стойки требует другой планки или присадки PRIME. Проверьте наложение фасада.');
 const center=hostKey.startsWith('divider-');
 const section=center?middleDivider(spec).index+(side==='left'?1:0):side==='left'?0:spec.sections-1;
 const opposing=[];
 if(center&&side==='right')for(const peer of items){
  if(!peer.item_id.startsWith(group.group_id+':'))continue;
  const otherKey=peer.item_id.slice(group.group_id.length+1);
  if(!doorSide(otherKey)||installedSide(front,otherKey)!=='left'||mountKey(spec,otherKey)!==hostKey)continue;
  const other=hingeProduct(front,otherKey);
  if((fit.plate?10:fit.fixing==='euro'?13:16)+(other.plate?10:other.fixing==='euro'?13:16)<=host.width)continue;
  const otherZ=localPoint(peer,angle).z-peer.depth/2;
  const pilots=f=>f.plate?.pilots??[[37,-16],[37,16]];
  const offsets=new Set();
  for(const [dz,dy] of pilots(fit))for(const [oz,oy] of pilots(other))
    if(Math.abs(z-dz-(otherZ-oz))<=5)offsets.add(oy-dy);
  if(!offsets.size)continue;
  for(const h of doorHinges({...peer,assistant_carcass:group},items))for(const dy of offsets){
   const y=h.position.y-door.elevation_mm+dy;opposing.push([y-5,y+5]);
  }
 }
 const obstacles=items.filter(i=>i.blank_binding?.[side+'_id']===host.item_id&&i.item_id.startsWith(group.group_id+':shelf-')&&localPoint(i,angle).z+i.depth/2>=z-76)
   .map(i=>[i.elevation_mm-door.elevation_mm,i.elevation_mm+i.height-door.elevation_mm]);
 const roof=items.find(p=>p.item_id===group.group_id+':top');
 if(roof)for(const run of physicalProfiles(group.spec)){
   if(center?!(run.leftKey===hostKey||run.rightKey===hostKey):side==='left'?run.left!==0&&run.leftKey!=='left'&&!run.leftKey?.endsWith('spacer-left'):run.right!==group.spec.width&&run.rightKey!=='right'&&!run.rightKey?.endsWith('spacer-right'))continue;
   const top=roof.elevation_mm-group.spec.height+group.spec.thickness+run.top-door.elevation_mm;
   obstacles.push([top+(run.cutBottom-run.top),top+(run.cutTop-run.top)]);
 }
 const finished=finishedFaceSize(door),{count}=hingeLoad(finished.width,finished.height,front.massKg,fit.frame);
 const axes=front.autoHinges||front.hinges?automaticAxes(door,host,items,side,obstacles,count,section,opposing,fit):hingeAxes(door.height,count,front.offset,obstacles);
 const [plateLow,plateHigh]=fit.plate?plateSpan(fit,side):[-26,26];
 if(axes.some(y=>door.elevation_mm+y+plateLow<host.elevation_mm||door.elevation_mm+y+plateHigh>host.elevation_mm+host.height))
   throw Error('Ответная планка выходит за боковину. Проверьте высоту фасада.');
 const opening=settingFor(front,key).push;
 const native=opening&&opening!==true&&fit.pushNative?fit.pushNative:fit;
 return axes.map(y=>({
   name:'Петля '+(fit.plate?'Blum ':'')+fit.series+' · '+door.name,article:fit.sku??fit.article,source_file:native.file,source_sha256:native.sha,...(fit.plate?{...(fit.frame?{wardrobe_z1_hinge:true}:{}),hinge_variant:fit.article,plate_sku:fit.plate.sku,finish:fit.finish}:{}),
   door_side:side,host_blank_id:host.item_id,joined_panel_id:door.item_id,rotation:angle,
   position:{...worldPoint({x,z},angle),y:door.elevation_mm+y},elastic_resize:false
 }));
}

// Layout returns one axis per hinge. The native export installs the leaf fitting
// and its cabinet plate from two independently pinned workshop files.
export function nativeDoorHinges(door,items){
 return doorHinges(door,items).flatMap(axis=>{
  if(!axis.plate_sku)return [axis];
  const plate=withMountingPlate(hingeCatalogue[axis.hinge_variant],axis.plate_sku).plate;
  const {wardrobe_z1_hinge,...common}=axis;
  return [{...axis,wardrobe_blum_part:'hinge',mount_blank_id:axis.joined_panel_id},
   {...common,name:'Ответная планка Blum '+plate.sku+' · '+door.name,article:plate.sku,
    wardrobe_blum_part:'plate',mount_blank_id:axis.host_blank_id,source_file:plate.file,source_sha256:plate.sha}];
 });
}

// Choose a board face that carries both adapter screws. The catch is attached
// to the back of the door at the free edge, independently of its recess.
export function doorPush(door,items){
 const group=door.assistant_carcass;
 if(!group||door.blank_axis!=='front')return [];
 const key=door.item_id.slice(group.group_id.length+1),front=group.spec.front;
 const upper=group.spec.surround?.upper,mezzSide=/^mezz-door-(left|right)$/.exec(key)?.[1];
 if(upper&&mezzSide){
  const setup=upper.opening==='lift'?{...upper.push,support:'bottom'}:upper.push;
  return planAksPush(door,items,setup,mezzSide,()=>[]);
 }
 if(!front||!doorSide(key)||!settingFor(front,key).push)return [];
 const setup=settingFor(front,key).push;
 if(setup!==true)return planAksPush(door,items,setup,installedSide(front,key),doorHinges);
 const angle=door.rotation,sign=installedSide(front,key)==='left'?1:-1,at=localPoint(door,angle);
 const free=at.x+sign*door.width/2,z=at.z-door.depth/2;
 const offsets=door.blank_front_frame?[pushKit.workshopReference.bodyBoreFromDoorFreeEdgeMm,14]:[pushKit.workshopReference.bodyBoreFromDoorFreeEdgeMm];
 const low=door.elevation_mm,high=low+door.height,boards=items.filter(p=>p.item_id.startsWith(group.group_id+':')&&p!==door&&p.item_id!==door.item_id);
 const candidates=[];
 for(const p of boards){
  const part=p.item_id.slice(group.group_id.length+1);
  if(p.blank_axis!=='horizontal'||p.blank_shelf&&!p.blank_shelf.startsWith('board/')||!/^((top|bottom)$|shelf-|rail-front$)/.test(part))continue;
  const c=localPoint(p,angle);
  for(const offset of offsets){
   const x=free-sign*offset;
   if(Math.abs(x-c.x)+11>p.width/2||z-15+2>c.z+p.depth/2||z-67-2<c.z-p.depth/2)continue;
   for(const direction of [1,-1]){
    const y=p.elevation_mm+(direction===1?p.height:0),contact=y+direction*16.5021;
    if(contact-10<low||contact+10>high)continue;
    if(door.blank_front_frame&&Math.min(offset,contact-low,high-contact)>15)continue;
    const a=Math.min(y,y+direction*28),b=Math.max(y,y+direction*28);
    const blocked=boards.some(other=>{
     if(other.item_id===p.item_id||a>=other.elevation_mm+other.height||b<=other.elevation_mm)return false;
     const q=localPoint(other,angle);
     return Math.abs(q.x-x)<other.width/2+11&&q.z+other.depth/2>z-83&&q.z-other.depth/2<z-3;
    });
    if(!blocked)candidates.push({p,x,y,direction,priority:Math.min(Math.abs(y-low),Math.abs(y-high))});
   }
  }
 }
 candidates.sort((a,b)=>a.priority-b.priority||a.y-b.y);
 const chosen=candidates[0];
 if(!chosen)throw Error('Для толкателя AQ нужна свободная опорная пласть у края выбранной двери.');
 const native=pushKit.surface;
 return [{name:'Толкатель AQ ONE-PUSH с адаптером · '+door.name,article:'09.0019',source_file:native.supplierFile,source_sha256:native.sha256,
  host_blank_id:chosen.p.item_id,joined_panel_id:door.item_id,wardrobe_push_mount:chosen.direction===1?'top':'bottom',
  rotation:angle,position:{...worldPoint({x:chosen.x,z},angle),y:chosen.y},elastic_resize:false}];
}
