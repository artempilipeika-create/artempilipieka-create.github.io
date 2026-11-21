import {machiningError} from './panel-machining.mjs';
import {blankEdgeCode} from './furniture-core.mjs';
import {isEdgePull,validateEdgePull} from './wardrobe-edge-pulls.mjs';
/** Universal rectangular board. Dimensions in mm, never inferred from a cabinet. */
import {drawerBottom,drawerSide,drawerMember} from './wardrobe-drawers.mjs';
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
  const code=blankEdgeCode({...input,module_type:'blank',blank_axis:axis},String(input.blank_edge_code??input.edges??'1000'));
  const elevation=Number(input.elevation_mm??input.elevation??0);
  return {length,width,thickness,axis,code,elevation,edgeThickness:Number(input.blank_edge_thickness_mm??1)};
}
export function blankMaterialError(item,material){
  const actual=Number(material?.thickness),required=Number(item.blank_thickness_mm);
  if(!(actual>0)||actual===required)return '';
  const name=material.name||material.article;
  return (name?'Материал «'+name+'»':'Назначенный материал')+' имеет толщину '+actual+' мм. Для детали требуется '+required+' мм.';
}
export function retainedBlankMaterial(item,previous,lookup){
  if(item.blank_front_frame||previous?.blank_front_frame)return item.body_variant_id;
  const saved=previous?.body_variant_id,selected=item.body_variant_id;
  if(!saved||saved===selected||Number(previous.blank_thickness_mm)!==Number(item.blank_thickness_mm))return selected;
  // A compatible manual decor wins. Repair a known mismatch only with a verified replacement.
  if(blankMaterialError(item,lookup(saved))&&selected&&Number(lookup(selected)?.thickness)===Number(item.blank_thickness_mm))return selected;
  return saved;
}
export function validateBlank(input,room,mount=input.assistant_carcass?.spec.backMount){
  const b=normalizeBlank(input);
  const post=b.axis==='side'&&/:niche-\d+-\d+-divider$/.test(input.item_id);
  const key=input.item_id?.split(':').at(-1);
  const hdf=mount?.layout&&key==='back'&&b.axis==='back';
  const fittedWidth=mount?.layout&&['top','bottom','left','right','back'].includes(key);
  const sidePart=/^trim-(left|right)(?:-([2-9]|[1-9]\d+))?-(face|return|end)$/.exec(key);
  const trimFace=sidePart?.[3]==='face'&&b.axis==='back';
  const trimPost=sidePart&&sidePart[3]!=='face'&&b.axis==='side';
  if((sidePart?.[2]||input.assistant_carcass?.spec?.surround?.[sidePart?.[1]]?.split)&&
    (trimFace||trimPost)&&(trimFace?b.width:b.length)>2780)return 'Длина одной части боковой планки не может превышать 2780 мм.';
  const minWidth=key==='trim-cap-upright'?22:40;
  const minLength=trimFace||drawerSide(input.item_id)||input.blank_edge_pull?40:100;
  const drawerFace=b.axis==='front'&&(input.blank_edge_pull||drawerMember(input.item_id,'\\d+-face'));
  const precise=value=>Number.isFinite(value)&&Math.abs(value*1000-Math.round(value*1000))<.000001;
  const door=b.axis==='front'&&/:(?:mezz-door-|door-(?:(?:lower|upper)-)?)(?:left|right)$/.test(input.item_id??'');
  if(!(drawerFace||trimPost?precise(b.length):Number.isInteger(b.length*(door||post||hdf?2:1)))||b.length<minLength||b.length>3000)return 'Длина заготовки: от '+minLength+' до 3000 мм.';
  if(!(trimFace?precise(b.width):Number.isInteger(b.width*(fittedWidth||b.axis==='front'||b.axis==='side'&&input.blank_machining?.some(op=>op.kind==='rabbet')?2:1)))||b.width<minWidth||b.width>(b.axis==='back'?3000:1200))return 'Ширина заготовки: от '+minWidth+' до '+(b.axis==='back'?3000:1200)+' мм.';
  if(input.assistant_carcass&&input.item_id===input.assistant_carcass.group_id+':plinth'&&b.code!=='1111')
    return 'У цоколя шкафа ПВХ обязателен по четырём торцам.';
  if(input.assistant_carcass?.spec?.backThickness&&input.item_id===input.assistant_carcass.group_id+':back'&&(b.axis!=='back'||b.code!==blankEdgeCode(input,'0000')||b.thickness!==input.assistant_carcass.spec.backThickness))return 'Проверьте толщину вкладной задней стенки и кромку вдоль выборки.';
  if(input.blank_edge_pull){
    const h=input.blank_edge_pull;
    if(b.axis!=='front'||!isEdgePull(h))return 'Проверьте врезную ручку фасада.';
    const issue=validateEdgePull(h,b.width,b.length,b.thickness);
    if(issue)return issue;
  }
  const framed=input.blank_front_frame==='Z1';
  if(framed&&(!door||b.thickness!==20.5||b.code!=='0000'||input.blank_edge_pull||input.blank_machining?.length||input.body_variant_id))return 'Для витрины Z1 нужны рамка 20,5 мм и стекло 4 мм.';
  if(!framed&&b.axis==='front'&&(b.code!=='1111'||b.edgeThickness!==2||b.thickness!==18))return 'Для фасада нужна плита 18 мм и ПВХ 2 мм в круг.';
  const machining=machiningError(input);if(machining)return machining;
  const thinBack=b.axis==='back'&&[3,4].includes(b.thickness)&&b.code==='0000';
  let glass=false;
  if(input.blank_shelf){
    try{
      const c=choice(input.blank_shelf,b.thickness);glass=c.kind==='glass';
      if(b.axis!=='horizontal'||(glass&&(b.code!=='0000'||b.thickness!==c.thickness||input.body_variant_id)))return 'Стеклянная полка должна сохранять толщину стекла и быть без ПВХ.';
    }catch(e){return e.message;}
  }
  const thinBottom=drawerBottom(input.item_id)&&b.axis==='horizontal'&&b.thickness===3&&b.code==='0000';
  if(!framed&&!glass&&!thinBack&&!thinBottom&&(!Number.isInteger(b.thickness)||b.thickness<10||b.thickness>40))return 'Толщина ЛДСП: от 10 до 40 мм; ХДФ: 3 или 4 мм, только задняя панель без ПВХ.';
  if(!AXES.includes(b.axis))return 'Неизвестная ориентация заготовки.';
  if(!/^[01]{4}$/.test(b.code))return 'Код ПВХ должен содержать четыре цифры 0/1.';
  if(!(drawerFace||trimFace||trimPost?precise(b.elevation):Number.isInteger(b.elevation*(b.axis==='front'||post||hdf||input.blank_binding?.gola_flush?2:1)))||b.elevation<0||b.elevation>5000)return 'Проверьте высоту низа детали в мм.';
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
    ...(input.blank_front_frame?{blank_front_frame:input.blank_front_frame}:{}),
    ...(input.blank_machining?.length?{blank_machining:structuredClone(input.blank_machining)}:{}),
    ...(input.blank_edge_pull?{blank_edge_pull:{...input.blank_edge_pull}}:{}),
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
  const rows=items.filter(it=>it.module_type==='blank').flatMap(it=>{
    if(it.blank_front_frame==='Z1'){
      const glassH=it.height-27.5,glassW=it.width-27.5;
      const row=(name,h,w,t,material,sku)=>[it.name+' · '+name,h,w,t,0,0,0,0,'0000','0,00',material,sku,'',h,w,''];
      return [row('Стекло',glassH,glassW,4,'Стекло 4 мм',''),
       ...[it.height,it.height,it.width,it.width].map((l,i)=>row((i<2?'Стойка':'Перекладина')+' Z1',l,19,20.5,'Алюминиевый профиль, рез 45°','Z1'))];
    }
    const b=normalizeBlank(it),material=it.body_variant_id?materialLookup(it.body_variant_id):null;
    return [[it.name,b.length,b.width,b.thickness,...b.code.split(''),b.code,edgeMeters(it).toFixed(2).replace('.',','),material?.name||(it.blank_shelf&&!it.blank_shelf.startsWith('board/')?'Стекло '+b.thickness+' мм':''),material?.article||'',it.body_variant_id||'',cuttingSize(it).length,cuttingSize(it).width,b.edgeThickness]];
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
  const {assistant_carcass,blank_plinth_run,blank_gola_runs,...detail}=source;
  return Array.from({length:count},(_,i)=>({...structuredClone(detail),...(axis!=='elevation_mm'?{blank_binding:null}:{}),item_id:crypto.randomUUID(),[axis]:(source[axis]||0)+step*(i+1)}));
}
