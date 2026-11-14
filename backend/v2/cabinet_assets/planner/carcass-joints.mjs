import {localPoint,worldPoint} from './blank-bindings.mjs';

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

export function nativeCarcassJoints(items) {
  const byId=new Map(items.map(it=>[it.item_id,it])),out=[];
  for (const panel of items) {
    const meta=panel.assistant_carcass;
    if (!meta?.spec.joints) continue;
    const level=['top','bottom'].find(key=>panel.item_id===meta.group_id+':'+key);
    if (!level) continue;
    const scheme=meta.spec.joints[level];
    if (scheme==='none') continue;
    validateJoints({...meta.spec,depth:panel.depth,thickness:panel.height});
    const binding=panel.blank_binding, angle=panel.rotation||0;
    const centre=localPoint(panel,angle), inset=scheme==='confirmat'?70:100;
    for (const side of ['left','right']) {
      const host=byId.get(binding?.[side+'_id']), sign=side==='left'?-1:1;
      const face=centre.x+sign*panel.width/2;
      if (!host || host.blank_axis!=='side' || host.width!==18 || host.rotation!==panel.rotation ||
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
      for (const direction of [-1,1]) {
        const z=centre.z+direction*(panel.depth/2-inset);
        if (scheme==='confirmat') place('confirmat',z);
        else {place('cam',z);place('dowel',z-direction*32);}
      }
    }
  }
  return out;
}
