/** Universal rectangular board. Dimensions in mm, never inferred from a cabinet. */
import {drawerBottom,drawerSide} from './wardrobe-drawers.mjs';
import {hookError} from './blank-hook.mjs';
import {choice} from './shelf-choices.mjs';
export const SOURCE_EDGE_CODES=Object.freeze(['0000','1000','1010','1110','1011','1111']);
export const AXES=Object.freeze(['horizontal','side','back','front']);
export const EDGES=Object.freeze([
  ['longFront','Длинный торец 1'],
  ['longRear','Длинный торец 2'],
  ['shortLeft','Короткий торец 1'],
  ['shortRight','Короткий торец 2']
]);
export function geometryFromBlank(length,width,thickness,axis='horizontal'){
  if(axis==='front')return {width,height:length,depth:thickness};
  if(axis==='side')return {width:thickness,height:length,depth:width};
  if(axis==='back')return {width:length,height:width,depth:thickness};
  return {width:length,height:thickness,depth:width};
}
export function normalizeBlank(input={}){
  const length=Number(input.blank_length_mm??input.length??720);
  const width=Number(input.blank_width_mm??input.partWidth??400);
  const thickness=Number(input.blank_thickness_mm??input.thickness??18);
  const axis=input.blank_axis??input.axis??'horizontal';
  const code=String(input.blank_edge_code??input.edges??'1000');
  const elevation=Number(input.elevation_mm??input.elevation??0);
  return {length,width,thickness,axis,code,elevation,edgeThickness:Number(input.blank_edge_thickness_mm??1)};
}
export function validateBlank(input,room){
  const b=normalizeBlank(input);
  const minLength=drawerSide(input.item_id)?40:100;
  if(!Number.isInteger(b.length)||b.length<minLength||b.length>3000)return 'Длина заготовки: от '+minLength+' до 3000 мм.';
  if(!Number.isInteger(b.width*(b.axis==='front'?2:1))||b.width<40||b.width>(b.axis==='back'?3000:1200))return 'Ширина заготовки: от 40 до '+(b.axis==='back'?3000:1200)+' мм.';
  if(input.assistant_carcass&&input.item_id===input.assistant_carcass.group_id+':plinth'&&b.code!=='1111')
    return 'У цоколя шкафа ПВХ обязателен по четырём торцам.';
  if(input.assistant_carcass?.spec?.backThickness&&input.item_id===input.assistant_carcass.group_id+':back'&&(b.axis!=='back'||b.code!=='0000'||b.thickness!==input.assistant_carcass.spec.backThickness))return 'Вкладная задняя стенка должна соответствовать выбранной толщине и быть без кромки.';
  if(b.axis==='front'&&(b.code!=='1111'||b.edgeThickness!==2||b.thickness!==18))return 'Для фасада нужна плита 18 мм и ПВХ 2 мм в круг.';
  const thinBack=b.axis==='back'&&[3,4].includes(b.thickness)&&b.code==='0000';
  let glass=false;
  if(input.blank_shelf){
    try{
      const c=choice(input.blank_shelf,b.thickness);glass=c.kind==='glass';
      if(b.axis!=='horizontal'||(glass&&(b.code!=='0000'||b.thickness!==c.thickness||input.body_variant_id)))return 'Стеклянная полка должна сохранять толщину стекла и быть без ПВХ.';
    }catch(e){return e.message;}
  }
  const thinBottom=drawerBottom(input.item_id)&&b.axis==='horizontal'&&b.thickness===3&&b.code==='0000';
  if(!glass&&!thinBack&&!thinBottom&&(!Number.isInteger(b.thickness)||b.thickness<10||b.thickness>40))return 'Толщина ЛДСП: от 10 до 40 мм; ХДФ: 3 или 4 мм, только задняя панель без ПВХ.';
  if(!AXES.includes(b.axis))return 'Неизвестная ориентация заготовки.';
  if(!/^[01]{4}$/.test(b.code))return 'Код ПВХ должен содержать четыре цифры 0/1.';
  if(!Number.isInteger(b.elevation*(b.axis==='front'?2:1))||b.elevation<0||b.elevation>5000)return 'Высота низа детали должна быть целым числом в мм.';
  if(!Number.isFinite(b.edgeThickness)||b.edgeThickness<0.4||b.edgeThickness>3)return 'Толщина ПВХ: от 0,4 до 3 мм.';
  const d=geometryFromBlank(b.length,b.width,b.thickness,b.axis);
  const hardwareError=hookError({...input,...d,blank_axis:b.axis});
  if(hardwareError)return hardwareError;
  if(room&&b.elevation+d.height>room.height)return 'Верх детали выходит за высоту помещения.';
  return '';
}
export function blankItem(input={}){
  const b=normalizeBlank(input),dims=geometryFromBlank(b.length,b.width,b.thickness,b.axis);
  return {
    ...dims,
    module_type:'blank',template_id:null,bazis_id:null,
    ...(input.blank_shelf?{blank_shelf:input.blank_shelf}:{}),
    ...(input.blank_hook?{blank_hook:{...input.blank_hook}}:{}),
    ...(input.blank_binding?{blank_binding:structuredClone(input.blank_binding)}:{}),
    item_id:input.item_id||crypto.randomUUID(),name:(input.name||'Заготовка ЛДСП').slice(0,160),
    x:input.x??0,z:input.z??0,rotation:input.rotation??0,elevation_mm:b.elevation,
    blank_length_mm:b.length,blank_width_mm:b.width,blank_thickness_mm:b.thickness,blank_axis:b.axis,blank_edge_code:b.code,blank_edge_thickness_mm:b.edgeThickness,
    base:'wall',base_height:0,body_height:dims.height,worktop_thickness:0,
    layout:'doors',drawers:0,handles:'handleless',shelves:[],
    body_variant_id:input.body_variant_id??null,front_variant_id:null
  };
}
export function updateBlank(source,patch){
  const fresh=blankItem({...source,...patch,item_id:source.item_id});
  return {...source,...fresh,...(patch.blank_hook===null?{blank_hook:null}:{}),...(patch.blank_binding===null?{blank_binding:null}:{})};
}
export function edgeMeters(blank){
  const b=normalizeBlank(blank);
  return Math.round((b.length*(Number(b.code[0])+Number(b.code[1]))+
    b.width*(Number(b.code[2])+Number(b.code[3])))/10)/100;
}
export function blanksCSV(items,materialLookup=()=>null){
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const header=['Название','Длина, мм','Ширина, мм','Толщина, мм','Кромка 1','Кромка 2','Кромка 3','Кромка 4','Код ПВХ','ПВХ, м','Материал','Артикул','Материал (ID)','Распил длина, мм','Распил ширина, мм','ПВХ толщина, мм'];
  const rows=items.filter(it=>it.module_type==='blank').map(it=>{
    const b=normalizeBlank(it),material=it.body_variant_id?materialLookup(it.body_variant_id):null;
    return [it.name,b.length,b.width,b.thickness,...b.code.split(''),b.code,edgeMeters(it).toFixed(2).replace('.',','),material?.name||(it.blank_shelf&&!it.blank_shelf.startsWith('board/')?'Стекло '+b.thickness+' мм':''),material?.article||'',it.body_variant_id||'',cuttingSize(it).length,cuttingSize(it).width,b.edgeThickness];
  });
  return '\ufeff'+[header,...rows].map(row=>row.map(quote).join(';')).join('\r\n')+'\r\n';
}

export function cuttingSize(input){
  const b=normalizeBlank(input),n=i=>Number(b.code[i]);
  return {length:Math.round((b.length-b.edgeThickness*(n(2)+n(3)))*100)/100,
    width:Math.round((b.width-b.edgeThickness*(n(0)+n(1)))*100)/100};
}
export function blankCopies(source,count,step,axis){
  if(!Number.isInteger(count)||count<1||count>30)throw Error('Количество копий: от 1 до 30.');
  if(!Number.isFinite(step)||!Number.isInteger(step*2)||step===0||!['x','z','elevation_mm'].includes(axis))throw Error('Укажите ненулевой шаг с точностью 0,5 мм и направление.');
  const {assistant_carcass,blank_plinth_run,...detail}=source;
  return Array.from({length:count},(_,i)=>({...structuredClone(detail),...(axis!=='elevation_mm'?{blank_binding:null}:{}),item_id:crypto.randomUUID(),[axis]:(source[axis]||0)+step*(i+1)}));
}
