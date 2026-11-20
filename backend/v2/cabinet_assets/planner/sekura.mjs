// The fragment origin is the intersection of the bearing surface and the inner panel face.
import {localPoint,worldPoint,shelfBearing} from './blank-bindings.mjs';
import {holders} from './shelf-donors.mjs';
import {choice} from './shelf-choices.mjs';
import {shelfMounting} from './furniture-core.mjs';
export {shelfMounting};
export const SEKURA='sekura-95388';
function rows(it,host){
  const bearing=it.blank_binding?.gola_flush?shelfBearing(it,host):{rear:-it.depth/2,front:it.depth/2,depth:it.depth};
  const inset=Math.min(37,bearing.depth/4);
  return [bearing.rear+inset,bearing.front-inset];
}
export function shelfSupportPlan(it,items){
  const mounting=shelfMounting(it);
  if(mounting==='none')return {parts:[]};
  const h=choice(it.blank_shelf||'board/95388',it.blank_thickness_mm).hardware;
  const hidden=['Casper','MYSTI'].includes(h.name);
  const topMounted=hidden && h.article!=='134762';
  const anchorY=topMounted?it.height:({'АК104':h.detail==='8–10 мм'?5:4,'АК133':4,'306':4.4}[h.name]??0);
  const parts=[],b=it.blank_binding, local=localPoint(it,it.rotation);
  for(const side of ['left','right']){
    const host=items.find(p=>p.item_id===b[side+'_id']);
    if(!host||host.blank_axis!=='side'||host.rotation!==it.rotation)return {parts:[],error:'Проверьте привязку к обеим стойкам.'};
    const center=localPoint(host,it.rotation);
    const face=center.x+(side==='left'?host.width:-host.width)/2;
    const gap=b['gap_'+side+'_mm'],sign=side==='left'?-1:1;
    const bearing=shelfBearing(it,host);
    if(Math.abs(local.x+sign*(it.width/2+gap)-face)>.01 || (bearing.rear>-it.depth/2+.01||bearing.depth<16||!b.gola_flush&&bearing.front<it.depth/2-.01))
      return {parts:[],error:'Полка не совпадает с положением опорных стоек.'};
    if(h.name.startsWith('SEKURA')&&host.width<=12)return {parts:[],error:'Глубина отверстия SEKURA 2 — 12 мм. Проверьте толщину стойки.'};
    if(hidden&&gap!==0)return {parts:[],error:'Для скрытого крепления нужен нулевой боковой зазор.'};
    if(gap>=(h.name==='SEKURA 6'?13.5:14.5))return {parts:[],error:'Боковой зазор выходит за опорную площадку '+h.name+'.'};
    if(h.name.startsWith('SEKURA')&&(it.elevation_mm||0)-(host.elevation_mm||0)<14.5)return {parts:[],error:'Под полкой не хватает высоты для SEKURA 2.'};
    const centers=rows(it,host);
    if(side==='left'&&host.width<=24){
      // The other section bears on the opposite face. Keep its reference row unchanged.
      const opposite=items.filter(p=>shelfMounting(p)!=='none'&&p.blank_binding?.right_id===host.item_id&&Math.abs((p.elevation_mm||0)-(it.elevation_mm||0))<(p.blank_shelf||it.blank_shelf?32:5))
        .flatMap(p=>rows(p,host).map(z=>localPoint(p,p.rotation).z-local.z+z));
      if(opposite.length){
        for(let i=0;i<2;i++){
          const direction=i===0?1:-1;
          const fits=z=>z>=bearing.rear+3.95&&z<=bearing.front-3.95 && (i===0?z<=-3.95:z>=3.95) && opposite.every(v=>Math.abs(v-z)>(it.blank_shelf||items.some(p=>p.blank_shelf&&p.blank_binding?.right_id===host.item_id)?25:5));
          if(!fits(centers[i])){
            const candidates=[32,8,16,24,-8,-16,-24,-32].map(d=>centers[i]+d*direction);
            const found=candidates.find(fits);if(found===undefined)return {parts:[],error:'Недостаточно места для встречных отверстий в перегородке.'};
            centers[i]=found;
          }
        }
      }
    }
    for(const z of centers)parts.push({x:sign*(it.width/2+gap),y:anchorY,z,rotation:hidden?(side==='left'?0:180):(side==='left'?270:90),side,host:host.item_id});
  }
  return {parts};
}
export function nativeShelfSupports(items){
  const out=[];
  for(const it of items){
    const {parts,error}=shelfSupportPlan(it,items);
    if(error)throw Error(it.name+': '+error);
    for(const p of parts){
      const point=worldPoint(p,it.rotation||0);
      const h=choice(it.blank_shelf||'board/95388',it.blank_thickness_mm).hardware;
      const version=h.article==='134286'?it.height+(p.side==='left'?'-L':'-R'):'default';
      const source=holders[h.article][version];
      out.push({name:h.name+' · '+h.finish+' · '+it.name,article:h.article,shelf_blank_id:it.item_id,host_blank_id:p.host,
        source_file:source.file,source_sha256:source.sha,
        ...(h.article==='134762'?{support_mount_face:'bottom'}:{}),
        position:{x:it.x+point.x,y:(it.elevation_mm||0)+p.y,z:it.z+point.z},rotation:((it.rotation||0)+p.rotation)%360,elastic_resize:false});
    }
  }
  return out;
}
