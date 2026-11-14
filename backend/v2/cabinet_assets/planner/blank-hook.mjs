// Measurements from AKKORD 68416 FR3D, referenced to the midpoint of its fixing holes.
export const defaultHookFace=it=>it.blank_axis==='side'&&it.item_id?.endsWith(':right')?'negative':'positive';
export function hookPlacement(it,index=0){
  const h=it.blank_hook, side=it.blank_axis==='side', sign=h.face==='positive'?1:-1;
  const span=side?it.depth:it.width,count=h.count??1;
  const along=(h.along_mm??span/2)-span/2+(index-(count-1)/2)*span/count;
  const y=h.height_mm??it.height/2;
  return side?{x:sign*it.width/2,y,z:along,rotation:sign===1?270:90}
    :{x:along,y,z:sign*it.depth/2,rotation:sign===1?0:180};
}
export function hookError(it){
  const h=it.blank_hook;if(!h)return '';
  if(!['side','back'].includes(it.blank_axis))return 'Для крючка выберите вертикальную заготовку или снимите крючок.';
  if(h.article!=='68416'||!['positive','negative'].includes(h.face))return 'Выберите крючок и сторону крепления.';
  const span=it.blank_axis==='side'?it.depth:it.width,along=h.along_mm??span/2,y=h.height_mm??it.height/2;
  const count=h.count??1;
  if(!Number.isInteger(count)||count<1||count>4)return 'Выберите от одного до четырёх крючков.';
  const halfRow=(count-1)*span/(2*count);
  if(![along,y].every(v=>Number.isInteger(v*2))||along-halfRow<15||along+halfRow+15>span||(count>1&&span/count<30)||y<27.592||y+98.148>it.height)return 'Крючок выходит за край детали. Проверьте отступ и высоту оси крепления.';
  return '';
}
export function hookNativeItem(it,index=0){
  const error=hookError(it);if(error)throw Error(it.name+': '+error);
  const h=hookPlacement(it,index),angle=(it.rotation||0)*Math.PI/180,c=Math.round(Math.cos(angle)),s=Math.round(Math.sin(angle));
  return {name:'Крючок AKKORD 68416 · '+it.name+((it.blank_hook.count??1)>1?' · '+(index+1)+' из '+it.blank_hook.count:''),host_blank_id:it.item_id,
    source_file:'Крючок 2-рожк AКKORD античная латунь матовая  (68416).fr3d',
    source_sha256:'0c7176c2b675cfb48eb2f5de2ba6adbebb09d7c315c30b6f6d07628808dac3db',elastic_resize:false,
    rotation:((it.rotation||0)+h.rotation)%360,
    position:{x:it.x+c*h.x-s*h.z,y:(it.elevation_mm||0)+h.y,z:it.z+s*h.x+c*h.z}};
}
