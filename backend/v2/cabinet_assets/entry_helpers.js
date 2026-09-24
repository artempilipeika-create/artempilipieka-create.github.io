'use strict';
// Pure helpers shared by the grouped editor and Excel preview. Catalog IDs stay exact.
const MFEntry=(()=>{
 const fields=[['position','Позиция'],['name','Наименование'],['material','Материал / цвет'],['article','Артикул материала'],['length','Длина'],['width','Ширина'],['qty','Количество'],['texture','Текстура'],['rotation','Вращение'],['L1','L1 / X1'],['L2','L2 / X2'],['W1','W1 / Y1'],['W2','W2 / Y2'],['comments','Комментарий'],['thickness','Толщина материала'],['format_length','Длина листа'],['format_width','Ширина листа'],['manufacturer','Производитель'],['structure','Структура'],['row_type','Тип строки'],['X1','Отдельная колонка X1'],['X2','Отдельная колонка X2'],['Y1','Отдельная колонка Y1'],['Y2','Отдельная колонка Y2']];
 const aliases={'А':'A','В':'B','Е':'E','К':'K','М':'M','Н':'H','О':'O','Р':'P','С':'C','Т':'T','Х':'X'};
 const key=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/[АВЕКМНОРСТХ]/g,c=>aliases[c]).replace(/[^A-ZА-ЯЁ0-9]/g,'');
 const headerKey=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[^a-zа-яё0-9]/g,'');
 const num=v=>v===null||v===undefined||String(v).trim()===''?null:Number(String(v).replace(',','.'));
 const boardText=v=>/(?:^|[^a-zа-яё])(?:л?дсп|л?мдф|л?х?дф|двп|hdf|mdf|osb|фанера)(?:$|[^a-zа-яё])/i.test(String(v??''));
 function guess(value){
  const v=headerKey(value);
  if(/длиналиста|formatlength/.test(v))return 'format_length';
  if(/шириналиста|formatwidth/.test(v))return 'format_width';
  if(/длина|^length|размер[xх]/.test(v))return 'length';
  if(/ширина|^width|размер[yу]/.test(v))return 'width';
  if(/колич|колво|^qty$|^count$|^кол$/.test(v))return 'qty';
  if(/артикул|^article$/.test(v))return 'article';
  if(/материал|цветтолщин|^material$|^декор$/.test(v))return 'material';
  if(/наименован|назван|^name$|^детал[ьи]$/.test(v))return 'name';
  if(/текстур|^texture$/.test(v))return 'texture';
  if(/вращ|поворот|^rotation$/.test(v))return 'rotation';
  if(/примеч|коммент|^comments?$/.test(v))return 'comments';
  if(/толщ|^thickness$/.test(v))return 'thickness';
  if(/производ|^manufacturer$/.test(v))return 'manufacturer';
  if(/структур|^structure$/.test(v))return 'structure';
  if(/(?:l1|x1|х1)$/.test(v)||v==='в')return 'L1';
  if(/(?:l2|x2|х2)$/.test(v)||v==='н')return 'L2';
  if(/(?:w1|y1|у1)$/.test(v)||v==='л')return 'W1';
  if(/(?:w2|y2|у2)$/.test(v)||v==='п')return 'W2';
  if(/позици|^pos(ition)?$/.test(v)||String(value).trim()==='№')return 'position';
  return '';
 }
 const columns=rows=>[...new Set(rows.flatMap(r=>Object.keys(r.cells)))].sort((a,b)=>a.length-b.length||a.localeCompare(b));
 function headers(rows,start,end){
  const byRow=new Map(rows.map(r=>[r.row,r]));
  return Object.fromEntries(columns(rows).map(c=>[c,start===end?(byRow.get(end)?.cells[c]?.value??null):Array.from({length:end-start+1},(_,i)=>byRow.get(start+i)?.cells[c]?.value).filter(v=>v!==null&&v!==undefined&&v!=='').map(v=>String(v).trim()).join(' | ')||null]));
 }
 function detect(rows){
  let best={score:-1,start:1,end:1,mapping:{},inferred:[]};
  for(const row of rows.filter(r=>r.row<=24))for(let span=1;span<=3;span++){
   const start=row.row,end=start+span-1,h=headers(rows,start,end),mapping={};
   for(const [col,text]of Object.entries(h)){const f=guess(text);if(f&&!mapping[f])mapping[f]=col;}
   const score=Object.keys(mapping).reduce((s,k)=>s+({length:8,width:8,qty:5,article:4,material:4}[k]||1),0);
   if(score>best.score||score===best.score&&span<best.end-best.start+1)best={score,start,end,mapping,inferred:[]};
  }
  const h=headers(rows,best.start,best.end),used=new Set(Object.values(best.mapping));
  // A headerless dimension column is only a visible proposal, editable before import.
  if(best.mapping.qty&&(!best.mapping.length||!best.mapping.width)){
   const sample=rows.filter(r=>r.row>best.end&&num(r.cells[best.mapping.qty]?.value)>0).slice(0,12);
   const dims=columns(rows).filter(c=>!used.has(c)&&!h[c]&&sample.length>=2&&sample.filter(r=>num(r.cells[c]?.value)>10).length>=sample.length*.8);
   for(const f of ['length','width'])if(!best.mapping[f]&&dims.length){best.mapping[f]=dims.shift();best.inferred.push(f);}
  }
  best.blocks=rows.some(r=>Object.values(r.cells).some(c=>boardText(c.value))&&(r.row<=best.end||Object.values(r.cells).filter(c=>c.value!==null&&c.value!=='').length===1));
  return best;
 }
 function compatible(material,edge){return !!material&&num(material.thickness)>0&&num(edge.width)>=num(material.thickness);}
 function edgeCandidates(material,edges){
  if(!material?.article)return [];
  const article=key(String(material.article).replace(/\([^)]*\d+[^)]*(?:мм|mm)[^)]*\)/gi,''));
  return edges.filter(e=>compatible(material,e)&&(key(e.article)===article||key(e.designation)===article));
 }
 function edgeDefault(material,edges){const matches=edgeCandidates(material,edges);return matches.length===1?matches[0].edge_id:null;}
 function autoEdge(previous,edgeId){
  if(previous?.selection_mode==='manual'||previous?.edge_id&&previous.selection_mode!=='auto')return previous;
  return {edge_id:edgeId||null,supply_source:'company',selection_mode:'auto',unresolved:!edgeId};
 }
 function importGroupKey(row){
  const v=row.original.values;
  return JSON.stringify(['article','material','manufacturer','structure','thickness','format_length','format_width'].map(k=>String(v[k]??'').trim()).concat(row.resolution?.selected?.variant_id||''));
 }
 function previewGroups(rows){
  const groups=new Map();
  for(const row of rows){const k=importGroupKey(row);if(!groups.has(k))groups.set(k,{key:k,rows:[]});groups.get(k).rows.push(row);}
  return [...groups.values()];
 }
 return {fields,key,num,guess,columns,headers,detect,boardText,compatible,edgeCandidates,edgeDefault,autoEdge,previewGroups};
})();
