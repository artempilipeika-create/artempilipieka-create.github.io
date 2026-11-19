import pullCatalogue from './wardrobe-handle-catalogue.json' with {type:'json'};
import {splitAt,levelOf,splitKey,sectionOf,isRightBank} from './wardrobe-layout.mjs';
import aks from './aks-wardrobe.json' with {type:'json'};
import {localPoint,worldPoint} from './blank-bindings.mjs';
import {doorSide} from './wardrobe-door-layout.mjs';
import {doorHinges} from './wardrobe-hinges.mjs';
import {spacerCuts,frontAtHinge} from './wardrobe-drawers.mjs';

const close=(a,b)=>Math.abs(a-b)<.01;
function sideAxes(group,side,items){
 return items.filter(i=>i.item_id.startsWith(group+':')&&doorSide(i.item_id.slice(group.length+1))===side)
   .flatMap(i=>doorHinges(i,items).map(h=>h.position.y)).sort((a,b)=>a-b);
}
export function installedCuts(panel,items){
 const meta=panel.assistant_carcass,match=/:drawer-(\d+)-spacer-(left|right)$/.exec(panel.item_id??'');
 if(!meta||!match)return [];
 return spacerCuts(panel.elevation_mm,panel.height,sideAxes(meta.group_id,match[2],items),match[2]);
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
  };
  const sharedSeats=new Map();
  spec.drawerBanks.forEach((bank,slot)=>{
   if(!bank)return;
   const section=sectionOf(slot),prefix='drawer-'+slot+'-',railAxes=[],sides=['left','right'];
   const panels=sides.map((side,k)=>get(k===0?(section===0?'left':'divider-'+(section-1)):(section===spec.sections-1?'right':'divider-'+section)));
   const split=splitAt(spec,section,levelOf(slot)),shared=split?.kind==='drawers',innerSide=isRightBank(slot)?0:1;
   if(shared)panels[innerSide]=get(splitKey(split)+'-divider');
   const spacers=sides.map(side=>parts.get(prefix+'spacer-'+side));
   const axes=sides.map((side,k)=>spacers[k]?sideAxes(origin.assistant_carcass.group_id,side,items):[]);
   const cuts=spacers.map(p=>p?installedCuts(p,items):[]);
   let railFront,railLength;
   bank.faces.forEach((_,index)=>{
    const key=prefix+index+'-',sideParts=sides.map(s=>get(key+'side-'+s)),face=get(key+'face'),fore=get(key+'front'),rear=get(key+'rear');
    const [left,right]=sideParts,L=left.depth,cat=aks.rails[L],y=left.elevation_mm,ax=y+40;
    const front=at(left).z+L/2,xl=at(left).x-left.width/2,xr=at(right).x+right.width/2;
    if(!cat||right.depth!==L||!close(at(left).z,at(right).z)||!close(y,right.elevation_mm))throw Error('Нарушена геометрия боковин шуфляды '+(index+1)+'.');
    railAxes.push(ax);railFront=front;railLength=L;
    for(const [k,side] of sides.entries()){
     const sign=k?-1:1,host=spacers[k]??panels[k],mount=at(host).x+sign*host.width/2,box=k?xr:xl;
     if(!close((box-mount)*sign,13.5))throw Error('Секция '+(section+1)+': направляющей нужно 13,5 мм с каждой стороны.');
     if(cuts[k].some(([lo,hi])=>ax+22.5>host.elevation_mm+lo&&ax-22.5<host.elevation_mm+hi))throw Error('Шуфляда '+(index+1)+': направляющая попадает в вырез под петлю. Измените положение блока.');
     const faceClear=sign*(at(face).x-(at(panels[k]).x+sign*panels[k].width/2))-face.width/2;
     if(faceClear<23.6&&axes[k].some(y=>frontAtHinge(face.elevation_mm,face.height,y,side)))throw Error('Фасад шуфляды '+(index+1)+' пересекает петлю. Пересчитайте ширину фасада в анкете шкафа.');
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
    const grip=face.blank_edge_pull;
    let screwX=at(face).x,usable=Math.min(fore.width,face.width),screwY=y+left.height/2;
    if(grip){
     // Fix the two boards only where their wood overlaps, clear of the profile shank.
     const clearance=grip.grooveDepth??pullCatalogue[grip.article].shankDepth,margin=3;
     const lowX=Math.max(at(fore).x-fore.width/2,at(face).x-face.width/2+(grip.edge==='left'?clearance:0));
     const highX=Math.min(at(fore).x+fore.width/2,at(face).x+face.width/2-(grip.edge==='right'?clearance:0));
     const lowY=Math.max(fore.elevation_mm,face.elevation_mm+(grip.edge==='bottom'?clearance:0))+margin;
     const highY=Math.min(fore.elevation_mm+fore.height,face.elevation_mm+face.height-(grip.edge==='top'?clearance:0))-margin;
     if(highX-lowX<=4*margin||lowY>highY)throw Error('Для шурупов фасада шуфляды '+(index+1)+' не хватает места рядом с врезной ручкой.');
     screwX=(lowX+highX)/2;usable=highX-lowX;screwY=Math.max(lowY,Math.min(highY,screwY));
    }
    const inset=Math.min(100,usable/4);
    for(const dx of [-usable/2+inset,0,usable/2-inset]){
     add('face',aks.joints.face,'Шуруп AKS 5×30 · '+face.name,[fore,face],screwX+dx,screwY,front-18);
    }
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
