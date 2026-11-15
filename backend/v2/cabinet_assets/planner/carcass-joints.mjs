import {localPoint,worldPoint} from './blank-bindings.mjs';

import {fixedShelfScheme} from './shelf-choices.mjs';
import {shelfSupportPlan} from './sekura.mjs';
export const jointOptions = {
  none: 'Без крепежа',
  confirmat: 'Конфирмат 7×50',
  cam_dowel: 'Эксцентрик + шкант 8×35'
};
const fittings = {
  confirmat: ['Конфермат.fr3d','af876819d041ee19ab0217cc9d266210c70480206a1de1652847c12d7af65783'],
  cam: ['Эксцентриковая Стяжка.fr3d','0f16c55b1530f9e49d3208b7e5b17d58076c491658bd01d5a3110850da36291c'],
  dowel: ['Шкант.fr3d','9b2679f72e617fd3eb989d95f65b5c2f5ac979380e2963d8cb272228597f6589']
};
export function validateJoints(spec) {
  if (!spec.joints) return;
  if (spec.thickness !== 18 || !['shelves','divided'].includes(spec.recipe)) throw Error('Крепёж рассчитан на вкладные детали корпуса 18 мм.');
  for (const scheme of [spec.joints.top,spec.joints.bottom]) {
    if (!Object.hasOwn(jointOptions,scheme)) throw Error('Выберите схему крепежа крыши и дна.');
    if (scheme==='cam_dowel' && spec.depth < 276) throw Error('Для двух пар эксцентрик + шкант нужна глубина от 276 мм.');
  }
}
export function jointQuantity(scheme) {
  if (scheme==='cam_dowel') return '4 эксцентрика + 4 шканта · отступ 100 мм, шаг пары 32 мм';
  if (scheme==='confirmat') return '4 конфирмата · отступ 70 мм';
  return 'Без крепежа';
}

export function jointRows(scheme,depth,isShelf){
 const inset=isShelf||scheme==='confirmat'?70:100,rows=[];
 for(const direction of [-1,1]){
   const z=direction*(depth/2-inset);
   if(scheme==='confirmat')rows.push({kind:'confirmat',z});
   else rows.push({kind:'cam',z},{kind:'dowel',z:z-direction*32});
 }
 return rows;
}

export function dividerScheme(spec,index){
 const saved=spec?.dividerJoints?.[index];
 if(saved)return {...saved};
 // Before stand-specific settings existed, each end followed the outer joint,
 // with confirmats also installed when the outer joint was disabled.
 const legacy=level=>spec?.joints?.[level]==='cam_dowel'?'cam_dowel':'confirmat';
 return {top:legacy('top'),bottom:legacy('bottom')};
}

export function dividerEnds(it){
 if(it?.module_type!=='blank'||it.blank_axis!=='side'||it.width!==18)return [];
 const match=/^(.*):divider-(\d+)$/.exec(it.item_id);
 if(!match)return [];
 const joints=dividerScheme(it.assistant_carcass?.spec,Number(match[2]));
 return ['bottom','top'].filter(level=>joints[level]!=='none').map(level=>({
   level,hostId:match[1]+':'+level,scheme:joints[level],roll:level==='bottom'?90:-90
 }));
}

function dividerJoints(it,byId){
 const result=[],rotation=it.rotation||0,centre=localPoint(it,rotation);
 for(const {level,hostId,scheme,roll} of dividerEnds(it)){
   const host=byId.get(hostId),bottom=level==='bottom',y=it.elevation_mm+(bottom?0:it.height);
   const at=host&&localPoint(host,rotation);
   if(!host||host.blank_axis!=='horizontal'||host.height!==18||rotation!==(host.rotation||0)||
       y!==host.elevation_mm+(bottom?host.height:0)||Math.abs(centre.x-at.x)+9>host.width/2+.01||
       Math.abs(centre.z-at.z)+it.depth/2>host.depth/2+.01||it.depth<(scheme==='cam_dowel'?216:152))
     throw Error(it.name+' · проверьте контакт с '+(bottom?'дном':'крышей')+' и глубину для крепежа.');
   for(const {kind,z} of jointRows(scheme,it.depth,true)){
     const point=worldPoint({x:centre.x,z:centre.z+z},rotation);
     const [source_file,source_sha256]=fittings[kind];
     result.push({name:source_file.slice(0,-5)+' · '+it.name+' · '+(bottom?'снизу':'сверху'),
       joint_part:kind,joined_panel_id:it.item_id,host_blank_id:hostId,source_file,source_sha256,
       rotation,joint_roll_deg:roll,position:{x:point.x,y,z:point.z},elastic_resize:false});
   }
 }
 return result;
}

export function nativeCarcassJoints(items) {
  const byId=new Map(items.map(it=>[it.item_id,it])),out=[];
  for (const panel of items) {
    const meta=panel.assistant_carcass;
    const shelfScheme=fixedShelfScheme(panel);
    if (!shelfScheme && !meta?.spec.joints) continue;
    const level=['top','bottom'].find(key=>panel.item_id===meta?.group_id+':'+key);
    if (!shelfScheme && !level) continue;
    const scheme=shelfScheme || meta.spec.joints[level];
    if (scheme==='none') continue;
    if(shelfScheme){
      if(panel.height!==18 || panel.depth<(scheme==='cam_dowel'?216:152))throw Error(panel.name+' · проверьте толщину и глубину полки.');
    }else validateJoints({...meta.spec,depth:panel.depth,thickness:panel.height});
    const binding=panel.blank_binding, angle=panel.rotation||0;
    const centre=localPoint(panel,angle);
    for (const side of ['left','right']) {
      const host=byId.get(binding?.[side+'_id']), sign=side==='left'?-1:1;
      const face=centre.x+sign*panel.width/2;
      if (!host || host.blank_axis!=='side' || host.width!==18 || host.rotation!==panel.rotation ||
          (binding['gap_'+side+'_mm']||0)!==0 ||
          Math.abs(localPoint(host,angle).x-sign*host.width/2-face)>0.01 ||
          Math.abs(centre.z-localPoint(host,angle).z)+panel.depth/2>host.depth/2+.01 ||
          panel.elevation_mm<host.elevation_mm || panel.elevation_mm+panel.height>host.elevation_mm+host.height)
        throw Error(panel.name+' · проверьте толщину и привязку боковин.');
      function place(kind,z) {
        const point=worldPoint({x:face,z},angle);
        const [source_file,source_sha256]=fittings[kind];
        out.push({name:source_file.slice(0,-5)+' · '+panel.name,joint_part:kind,joined_panel_id:panel.item_id,
          host_blank_id:host.item_id,source_file,source_sha256,rotation:(angle+(side==='left'?0:180))%360,
          position:{x:point.x,y:panel.elevation_mm+9,z:point.z},elastic_resize:false});
      }
      for(const row of jointRows(scheme,panel.depth,Boolean(shelfScheme)))place(row.kind,centre.z+row.z);
    }
  }
  // On a shared divider the two drilling patterns enter from opposite faces.
  const seats=new Map();
  for(const part of out){
    const list=seats.get(part.host_blank_id)??[];
    list.push(part);seats.set(part.host_blank_id,list);
  }
  function check(a,b,radius){
    if(a.rotation!==b.rotation && Math.hypot(a.position.y-b.position.y,
       localPoint(a.position,a.rotation).z-localPoint(b.position,a.rotation).z)<4+radius)
      throw Error('Встречная присадка в общей перегородке. Измените высоту полки или крепление соседней секции.');
  }
  for(const list of seats.values())for(let i=0;i<list.length;i++)for(const other of list.slice(i+1))check(list[i],other,4);
  for(const shelf of items){
    if(!shelf.blank_binding||fixedShelfScheme(shelf))continue;
    for(const mount of shelfSupportPlan(shelf,items).parts){
      const list=seats.get(mount.host);if(!list)continue;
      const q=worldPoint(mount,shelf.rotation);
      const pt={rotation:((shelf.rotation||0)+(mount.side==='left'?0:180))%360,
        position:{x:shelf.x+q.x,z:shelf.z+q.z,y:shelf.elevation_mm+mount.y}};
      for(const a of list)check(a,pt,10);
    }
  }
  for(const it of items)out.push(...dividerJoints(it,byId));
  return out;
}
