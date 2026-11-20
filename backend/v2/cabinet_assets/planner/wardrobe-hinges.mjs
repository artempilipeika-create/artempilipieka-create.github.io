import pushKit from './wardrobe-push-open.json' with {type:'json'};
import {hingeProduct,installedSide,mountKey,insetDepth,middleDivider,settingFor,meetingGap} from './wardrobe-hinge-layout.mjs';
import {finishedFaceSize} from './wardrobe-edge-pulls.mjs';
import {doorSide,physicalProfiles} from './wardrobe-door-layout.mjs';
import {splitAt,levelOf,sectionOf,isRightBank} from './wardrobe-layout.mjs';
import {hingeLoad,hingeAxes} from './wardrobe-fronts.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';

// Minimise squared displacement from the original drilling axes. Prefix minima
// enforce 64 mm between neighbours without losing a solution to a greedy move.
function fitAxes(ideal,lo,hi,blocked){
 const positions=[];
 for(let y=Math.ceil(lo);y<=hi;y++)if(blocked.every(([a,b])=>y<a||y>b))positions.push(y);
 if(!positions.length)return null;
 if(ideal.every((y,i)=>positions.includes(y)&&(!i||y-ideal[i-1]>=64)))return ideal;
 let costs=positions.map(y=>(y-ideal[0])**2);
 const parents=[];
 for(const target of ideal.slice(1)){
   let edge=0,best=-1;
   const back=[],next=[];
   for(const y of positions){
     while(edge<positions.length&&positions[edge]<=y-64){
       if(Number.isFinite(costs[edge])&&(best<0||costs[edge]<costs[best]))best=edge;
       edge++;
     }
     back.push(best);next.push(best<0?Infinity:costs[best]+(y-target)**2);
   }
   parents.push(back);costs=next;
 }
 let at=costs.indexOf(Math.min(...costs));
 if(!Number.isFinite(costs[at]))return null;
 const axes=[positions[at]];
 for(let i=parents.length-1;i>=0;i--){at=parents[i][at];axes.unshift(positions[at]);}
 return axes;
}

function automaticAxes(door,host,items,side,shelves,count,section,opposing,reach){
 const {group_id,spec}=door.assistant_carcass;
 const sign=side==='left'?1:-1;
 const zero=door.elevation_mm,wall=localPoint(host,door.rotation).x+sign*host.width/2;
 const blocked=[...shelves.map(([lo,hi])=>[lo-31,hi+31]),...opposing];
 const parts=new Map(items.map(item=>[item.item_id,item]));
 (spec.drawerBanks??[]).forEach((bank,slot)=>{
   if(bank?.kind!=='internal'||sectionOf(slot)!==section)return;
   if(splitAt(spec,section,levelOf(slot))?.kind==='drawers'&&isRightBank(slot)!==(side==='right'))return;
   const key=group_id+':drawer-'+slot+'-';
   const spacer=parts.get(key+'spacer-'+side);
   for(let i=0;i<bank.faces.length;i++){
     const face=parts.get(key+i+'-face'),box=parts.get(key+i+'-side-'+side);
     if(!face||!box)throw Error('Не найдены детали шуфляды для проверки петель.');
     if(sign*(localPoint(face,door.rotation).x-wall)-face.width/2<reach)
       blocked.push([face.elevation_mm-zero-31,face.elevation_mm+face.height-zero+31]);
     if(spacer){
       const concealed=bank.railFamily==='concealed',push=bank.opening==='push';
       const bottom=box.elevation_mm+(concealed?(push?-20:-17):17.5);
       const top=bottom+(concealed?(push?47:46):45);
       blocked.push([Math.max(bottom-35,spacer.elevation_mm-26)-zero,
         Math.min(top+35,spacer.elevation_mm+spacer.height+26)-zero]);
     }
   }
 });
 const offset=spec.front.offset,step=(door.height-2*offset)/(count-1);
 const ideal=Array.from({length:count},(_,i)=>Math.round(offset+i*step));
 const low=Math.max(31,host.elevation_mm-zero+26),high=Math.min(door.height-31,host.elevation_mm+host.height-zero-26);
 const axes=fitAxes(ideal,low,high,blocked);
 if(axes)return axes;
 const index=Math.max(0,ideal.findIndex(y=>blocked.some(([a,b])=>y>=a&&y<=b)));
 const error=Error('Секция '+(section+1)+', '+(side==='left'?'левая':'правая')+' дверь: нет свободного положения для комплекта из '+count+' петель.');
 error.hingeConflict={side,section,y:zero+ideal[index],index};throw error;
}

export function doorHinges(door,items){
 if(door.blank_axis!=='front')return [];
 const group=door.assistant_carcass,front=group?.spec?.front;
 if(!front)return [];
 const key=door.item_id.slice(group.group_id.length+1);
 if(!doorSide(key))return [];
 const spec=group.spec,fit=hingeProduct(front,key),side=installedSide(front,key),hostKey=mountKey(spec,key);
 const host=items.find(i=>i.item_id===group.group_id+':'+hostKey);
 if(!host||host.blank_axis!=='side'||host.rotation!==door.rotation)throw Error('Проверьте стойку крепления выбранной двери.');
 const angle=door.rotation,sign=side==='left'?1:-1,at=localPoint(host,angle),leaf=localPoint(door,angle);
 const x=at.x+sign*host.width/2,z=leaf.z-door.depth/2;
 const overlay=fit.kind==='inset'?-1.5:fit.kind==='half'?(host.width-meetingGap(front,key))/2:host.width-1.5;
 const outer=items.find(i=>i.item_id===group.group_id+':left'),outerAt=localPoint(outer,angle);
 const expectedZ=outerAt.z+outer.depth/2+(fit.kind==='inset'?-door.depth-insetDepth(front,key):settingFor(front,key).push?3:0);
 if(Math.abs(z-expectedZ)>.01||Math.abs(leaf.x-sign*door.width/2-(x-sign*overlay))>.01)
   throw Error('Проверьте положение фасада относительно выбранной стойки.');
 if(z-37+3>at.z+host.depth/2||z-37-3<at.z-host.depth/2)throw Error('Крепление петли выходит за глубину стойки.');
 const cupMargin=fit.cupFromHostMm+overlay-17.5;
 if(fit.kind!=='overlay'&&(cupMargin<3||cupMargin>7))throw Error('Эта толщина стойки требует другой планки или присадки PRIME. Проверьте наложение фасада.');
 const center=hostKey.startsWith('divider-');
 const section=center?middleDivider(spec).index+(side==='left'?1:0):side==='left'?0:spec.sections-1;
 const opposing=[];
 if(center&&side==='right')for(const peer of items){
  if(!peer.item_id.startsWith(group.group_id+':'))continue;
  const otherKey=peer.item_id.slice(group.group_id.length+1);
  if(!doorSide(otherKey)||installedSide(front,otherKey)!=='left'||mountKey(spec,otherKey)!==hostKey)continue;
  const other=hingeProduct(front,otherKey);
  if((fit.fixing==='euro'?13:16)+(other.fixing==='euro'?13:16)<=host.width)continue;
  if(Math.abs(localPoint(peer,angle).z-peer.depth/2-z)>5)continue;
  for(const h of doorHinges({...peer,assistant_carcass:group},items))for(const dy of [-32,0,32]){
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
 const finished=finishedFaceSize(door),{count}=hingeLoad(finished.width,finished.height,front.massKg);
 const reach={overlay:23.6,half:33.6,inset:41.1}[fit.kind];
 const axes=front.autoHinges||front.hinges?automaticAxes(door,host,items,side,obstacles,count,section,opposing,reach):hingeAxes(door.height,count,front.offset,obstacles);
 if(axes.some(y=>door.elevation_mm+y-26<host.elevation_mm||door.elevation_mm+y+26>host.elevation_mm+host.height))
   throw Error('Ответная планка выходит за боковину. Проверьте высоту фасада.');
 return axes.map(y=>({
   name:'Петля '+fit.series+' · '+door.name,article:fit.article,source_file:fit.file,source_sha256:fit.sha,
   door_side:side,host_blank_id:host.item_id,joined_panel_id:door.item_id,rotation:angle,
   position:{...worldPoint({x,z},angle),y:door.elevation_mm+y},elastic_resize:false
 }));
}

// Choose a board face that carries both adapter screws. The catch is attached
// to the back of the door at the free edge, independently of its recess.
export function doorPush(door,items){
 const group=door.assistant_carcass;
 if(!group||door.blank_axis!=='front')return [];
 const key=door.item_id.slice(group.group_id.length+1),front=group.spec.front;
 if(!front||!doorSide(key)||!settingFor(front,key).push)return [];
 if(hingeProduct(front,key).closing!=='springless')throw Error('Толкателю AQ нужна петля без пружины.');
 const angle=door.rotation,sign=installedSide(front,key)==='left'?1:-1,at=localPoint(door,angle);
 const x=at.x+sign*(door.width/2-pushKit.workshopReference.bodyBoreFromDoorFreeEdgeMm),z=at.z-door.depth/2;
 const low=door.elevation_mm,high=low+door.height,boards=items.filter(p=>p.item_id.startsWith(group.group_id+':')&&p!==door&&p.item_id!==door.item_id);
 const candidates=[];
 for(const p of boards){
  const part=p.item_id.slice(group.group_id.length+1);
  if(p.blank_axis!=='horizontal'||p.blank_shelf&&!p.blank_shelf.startsWith('board/')||!/^((top|bottom)$|shelf-|rail-front$)/.test(part))continue;
  const c=localPoint(p,angle);
  if(Math.abs(x-c.x)+11>p.width/2||z-15+2>c.z+p.depth/2||z-67-2<c.z-p.depth/2)continue;
  for(const direction of [1,-1]){
   const y=p.elevation_mm+(direction===1?p.height:0),contact=y+direction*16.5021;
   if(contact-10<low||contact+10>high)continue;
   const a=Math.min(y,y+direction*28),b=Math.max(y,y+direction*28);
   const blocked=boards.some(other=>{
    if(other.item_id===p.item_id||a>=other.elevation_mm+other.height||b<=other.elevation_mm)return false;
    const q=localPoint(other,angle);
    return Math.abs(q.x-x)<other.width/2+11&&q.z+other.depth/2>z-83&&q.z-other.depth/2<z-3;
   });
   if(!blocked)candidates.push({p,y,direction,priority:Math.min(Math.abs(y-low),Math.abs(y-high))});
  }
 }
 candidates.sort((a,b)=>a.priority-b.priority||a.y-b.y);
 const chosen=candidates[0];
 if(!chosen)throw Error('Для толкателя AQ нужна свободная опорная пласть у края выбранной двери.');
 const native=pushKit.surface;
 return [{name:'Толкатель AQ ONE-PUSH с адаптером · '+door.name,article:'09.0019',source_file:native.supplierFile,source_sha256:native.sha256,
  host_blank_id:chosen.p.item_id,joined_panel_id:door.item_id,wardrobe_push_mount:chosen.direction===1?'top':'bottom',
  rotation:angle,position:{...worldPoint({x,z},angle),y:chosen.y},elastic_resize:false}];
}
