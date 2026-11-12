import {updateBlank} from './blanks-model.mjs';

// Exact quarter turns keep millimetre coordinates free of floating point drift.
export function localPoint(item,rotation=0){
  const {x,z}=item;
  return rotation===90?{x:z,z:-x}:rotation===180?{x:-x,z:-z}:rotation===270?{x:-z,z:x}:{x,z};
}
export function worldPoint(point,rotation){return localPoint(point,(360-rotation)%360);}
export function resolveBlankBindings(items){
  const byId=new Map(items.map(it=>[it.item_id,it]));
  return items.map(item=>{
    const b=item.blank_binding;if(!b)return item;
    const fail=message=>{throw Error(item.name+': '+message);};
    if(item.module_type!=='blank'||item.blank_axis!=='horizontal')fail('Привязка доступна только горизонтальной полке.');
    const left=byId.get(b.left_id),right=byId.get(b.right_id);
    if(!left||!right||left===right||[left,right].some(it=>it.module_type!=='blank'||it.blank_axis!=='side'||it.blank_binding))
      fail('Выберите две разные боковые стойки.');
    if(left.rotation!==right.rotation||item.rotation!==left.rotation)fail('Полка и обе стойки должны иметь одинаковый поворот.');
    if(![b.gap_left_mm,b.gap_right_mm].every(v=>Number.isInteger(v)&&v>=0&&v<=100)||!Number.isFinite(b.depth_offset_mm)||!Number.isInteger(b.depth_offset_mm*2)||Math.abs(b.depth_offset_mm)>1200)
      fail('Зазоры: целые мм от 0 до 100; смещение по глубине: шаг 0,5 мм.');
    const l=localPoint(left,left.rotation),r=localPoint(right,left.rotation);
    const start=l.x+left.width/2+b.gap_left_mm,end=r.x-right.width/2-b.gap_right_mm;
    const length=end-start,z=l.z+b.depth_offset_mm;
    if(!Number.isInteger(length)||length<100||length>3000)fail('Между стойками нет места для полки длиной 100–3000 мм. Проверьте порядок стоек.');
    for(const [support,p] of [[left,l],[right,r]]){
      if(z-item.depth/2<p.z-support.depth/2||z+item.depth/2>p.z+support.depth/2||
        (item.elevation_mm||0)<(support.elevation_mm||0)||(item.elevation_mm||0)+item.height>(support.elevation_mm||0)+support.height)
        fail('Полка выходит за глубину или высоту опорной стойки.');
    }
    const position=worldPoint({x:(start+end)/2,z},left.rotation);
    if(!Number.isInteger(position.x*2)||!Number.isInteger(position.z*2))fail('Положение полки должно иметь шаг 0,5 мм.');
    return updateBlank(item,{blank_length_mm:length,...position});
  });
}
export function assertRemovable(items,id){
  if(items.some(it=>it.blank_binding&&[it.blank_binding.left_id,it.blank_binding.right_id].includes(id)))
    throw Error('К стойке привязана полка. Сначала снимите привязку в разделе «Привязки и размеры».');
}
