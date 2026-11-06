/** Universal rectangular board. Dimensions in mm, never inferred from a cabinet. */
export const SOURCE_EDGE_CODES=Object.freeze(['0000','1000','1010','1110','1011','1111']);
export const AXES=Object.freeze(['horizontal','side','back']);
export const EDGES=Object.freeze([
  ['longFront','Длинный торец 1'],
  ['longRear','Длинный торец 2'],
  ['shortLeft','Короткий торец 1'],
  ['shortRight','Короткий торец 2']
]);
export function geometryFromBlank(length,width,thickness,axis='horizontal'){
  if(axis==='side')return {width:thickness,height:length,depth:width};
  if(axis==='back')return {width:length,height:width,depth:thickness};
  return {width:length,height:thickness,depth:width};
}
export function normalizeBlank(input={}){
  const length=Number(input.blank_length_mm??input.length??720);
  const width=Number(input.blank_width_mm??input.partWidth??400);
  const thickness=Number(input.blank_thickness_mm??input.thickness??18);
  const axis=AXES.includes(input.blank_axis??input.axis)?input.blank_axis??input.axis:'horizontal';
  const code=String(input.blank_edge_code??input.edges??'1000');
  const elevation=Number(input.elevation_mm??input.elevation??0);
  return {length,width,thickness,axis,code,elevation};
}
export function validateBlank(input,room){
  const b=normalizeBlank(input);
  if(!Number.isInteger(b.length)||b.length<100||b.length>3000)return 'Длина заготовки: от 100 до 3000 мм.';
  if(!Number.isInteger(b.width)||b.width<100||b.width>1200)return 'Ширина заготовки: от 100 до 1200 мм.';
  if(!Number.isInteger(b.thickness)||b.thickness<10||b.thickness>40)return 'Толщина ЛДСП: от 10 до 40 мм.';
  if(!AXES.includes(b.axis))return 'Неизвестная ориентация заготовки.';
  if(!/^[01]{4}$/.test(b.code))return 'Код ПВХ должен содержать четыре цифры 0/1.';
  if(!Number.isInteger(b.elevation)||b.elevation<0||b.elevation>5000)return 'Высота низа детали должна быть целым числом в мм.';
  const d=geometryFromBlank(b.length,b.width,b.thickness,b.axis);
  if(room&&b.elevation+d.height>room.height)return 'Верх детали выходит за высоту помещения.';
  return '';
}
export function blankItem(input={}){
  const b=normalizeBlank(input),dims=geometryFromBlank(b.length,b.width,b.thickness,b.axis);
  return {
    ...dims,
    module_type:'blank',template_id:null,bazis_id:null,
    item_id:input.item_id||crypto.randomUUID(),name:(input.name||'Заготовка ЛДСП').slice(0,160),
    x:input.x??0,z:input.z??0,rotation:input.rotation??0,elevation_mm:b.elevation,
    blank_length_mm:b.length,blank_width_mm:b.width,blank_thickness_mm:b.thickness,blank_axis:b.axis,blank_edge_code:b.code,
    base:'wall',base_height:0,body_height:dims.height,worktop_thickness:0,
    layout:'doors',drawers:0,handles:'handleless',shelves:[],
    body_variant_id:input.body_variant_id??null,front_variant_id:null
  };
}
export function updateBlank(source,patch){
  const fresh=blankItem({...source,...patch,item_id:source.item_id});
  return {...source,...fresh};
}
export function edgeMeters(blank){
  const b=normalizeBlank(blank);
  return Math.round((b.length*(Number(b.code[0])+Number(b.code[1]))+
    b.width*(Number(b.code[2])+Number(b.code[3])))/10)/100;
}
export function blanksCSV(items,materialLookup=()=>null){
  const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const header=['Название','Длина, мм','Ширина, мм','Толщина, мм','Кромка 1','Кромка 2','Кромка 3','Кромка 4','Код ПВХ','ПВХ, м','Материал','Артикул','Материал (ID)'];
  const rows=items.filter(it=>it.module_type==='blank').map(it=>{
    const b=normalizeBlank(it),material=it.body_variant_id?materialLookup(it.body_variant_id):null;
    return [it.name,b.length,b.width,b.thickness,...b.code.split(''),b.code,edgeMeters(it).toFixed(2).replace('.',','),material?.name||'',material?.article||'',it.body_variant_id||''];
  });
  return '\ufeff'+[header,...rows].map(row=>row.map(quote).join(';')).join('\r\n')+'\r\n';
}
