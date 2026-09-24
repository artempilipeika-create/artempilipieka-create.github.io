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
 function materialMatches(materials,query){
  const q=key(query),terms=String(query).trim().split(/\s+/).map(key).filter(Boolean);
  const score=m=>{const article=key(m.article),text=key([m.article,m.name,m.raw_description,m.manufacturer,m.structure,m.thickness,m.length,m.width].join(' '));return !q?1:article===q?400:article.startsWith(q)?300:article.includes(q)?200:terms.every(t=>text.includes(t))?100:0;};
  return materials.map((m,i)=>({m,i,score:score(m)})).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.m);
 }
 function materialSignature(m){return key([m.manufacturer,m.article,m.name,m.raw_description,m.structure,m.thickness,m.length,m.width].join('|'));}
 function exactMaterial(materials,articleText,descriptionText,facts={}){
  const unique=rows=>{if(!rows.length)return null;const sig=new Set(rows.map(materialSignature));return sig.size===1?rows[0]:null;};
  const filterFacts=rows=>rows.filter(m=>{
   for(const [field,raw]of [['thickness',facts.thickness],['length',facts.format_length],['width',facts.format_width]]){const n=num(raw);if(n!==null&&num(m[field])!==n)return false;}
   for(const [field,raw]of [['manufacturer',facts.manufacturer],['structure',facts.structure]])if(key(raw)&&key(m[field])!==key(raw))return false;
   return true;
  });
  const byDescription=rows=>{const q=String(descriptionText||'').trim();if(!q)return null;const ranked=materialMatches(rows,q);return ranked.length===1?ranked[0]:null;};
  const direct=key(articleText);if(direct){const rows=filterFacts(materials.filter(m=>key(m.article)===direct));return unique(rows)||byDescription(rows);}
  const hay=key(descriptionText);if(!hay)return null;let longest=0;const groups=new Map();
  for(const m of filterFacts(materials)){const a=key(m.article);if(a.length<4||!hay.includes(a))continue;if(a.length>longest){longest=a.length;groups.clear();}if(a.length===longest){if(!groups.has(a))groups.set(a,[]);groups.get(a).push(m);}}
  if(groups.size!==1)return null;const rows=[...groups.values()][0];return unique(rows)||byDescription(rows);
 }
 const legacyPairs=typeof window!=='undefined'&&Array.isArray(window.MF_V9_EDGE_PAIRS)?window.MF_V9_EDGE_PAIRS:[];
 function legacyMaterialScore(material,p){
  if(!material||material.family==='customer')return 0;
  const mm=key(material.manufacturer),pm=key(String(p.manufacturer||'').replace(/\\([^)]*\\)/g,''));
  if(pm&&mm&&pm!==mm&&!pm.includes(mm)&&!mm.includes(pm))return 0;
  const article=key(material.article),decor=key(p.decor),structure=key(p.structure),code=key((p.decor||'')+(p.structure||''));
  const text=key([material.article,material.decor,material.structure,material.name,material.raw_description].join(' '));let score=0;
  if(code&&article===code)score=500;else if(code&&text.includes(code))score=400;else if(decor&&text.includes(decor)&&(!structure||text.includes(structure)))score=250;else return 0;
  if(pm&&mm&&(pm===mm||pm.includes(mm)||mm.includes(pm)))score+=80;if(p.confirmed)score+=40;return score;
 }
 function legacyEdgeCandidates(material,edges){
  const ranked=legacyPairs.map((p,i)=>({p,i,score:legacyMaterialScore(material,p)})).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.i-b.i),out=[],seen=new Set();
  for(const {p}of ranked){const sku=key(p.edgeSku);if(!sku)continue;for(const e of edges){if(seen.has(e.edge_id)||key(e.article)!==sku||!compatible(material,e))continue;seen.add(e.edge_id);out.push(e);}}
  return out;
 }
 function containsArticle(text,article){
  // Spaces/punctuation and Cyrillic lookalikes may vary; the complete code may not.
  const normalized=String(text??'').normalize('NFKC').toUpperCase().replace(/[АВЕКМНОРСТХ]/g,c=>aliases[c]);
  return new RegExp('(^|[^A-ZА-ЯЁ0-9])'+[...article].join('[\\s._-]*')+'($|[^A-ZА-ЯЁ0-9])').test(normalized);
 }
 function edgeCandidates(material,edges){
  if(!material?.article||material.family==='customer')return [];
  const legacy=legacyEdgeCandidates(material,edges),seen=new Set(legacy.map(e=>e.edge_id));
  const article=key(String(material.article).replace(/\([^)]*\d+[^)]*(?:мм|mm)[^)]*\)/gi,''));
  if(!article)return legacy;
  const heuristic=edges.filter(e=>!seen.has(e.edge_id)&&compatible(material,e)&&(!material.manufacturer||!e.manufacturer||key(material.manufacturer)===key(e.manufacturer))&&(key(e.article)===article||containsArticle(e.designation,article)))
   .sort((a,b)=>num(a.width)-num(b.width)||Math.abs((num(a.thickness)||1)-1)-Math.abs((num(b.thickness)||1)-1)||String(a.edge_id).localeCompare(String(b.edge_id)));
  return [...legacy,...heuristic];
 }
 // The visible default uses the narrowest fitting width, then thickness nearest 1 mm.
 // Other sizes remain selectable; AUTO never changes a manually assigned side.
 function edgeDefault(material,edges){return edgeCandidates(material,edges)[0]?.edge_id||null;}
 function autoEdge(previous,edgeId){
  if(previous?.selection_mode==='manual'||previous?.edge_id&&previous.selection_mode!=='auto')return previous;
  return {edge_id:edgeId||null,supply_source:'company',selection_mode:'auto',unresolved:!edgeId};
 }
 function applyGroupEdgeSelection(rows,previousDefault,edgeId){
  let changed=0,protectedSides=0;
  for(const row of rows)for(const side of ['L1','L2','W1','W2']){
   const current=row.edges?.[side];
   const marked=!!current&&(current.selection_mode==='auto'||current.unresolved||!!current.edge_id);
   if(!marked)continue;
   const manualException=current.selection_mode==='manual'&&!current.unresolved;
   if(manualException){protectedSides++;continue;}
   row.edges[side]={...current,edge_id:edgeId||null,supply_source:current.supply_source||'company',selection_mode:'auto',unresolved:!edgeId};changed++;
  }
  return {changed,protectedSides};
 }
 function glueFlags(values={}){
  const text=[values.name,values.comments,values.material,values.article,values.row_type,values._sourceGlueText].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
  return {glue:/склейк/.test(text),thick36:/(?:тол(?:щина)?\s*[:=-]?\s*36|36\s*мм)/i.test(text),copy:/\(\s*копия\s*\)|\bкопия\b/i.test(text),ready:/гот\.?\s*дет|готов(?:ая|ой)?\s*дет/i.test(text)};
 }
 function glueHint(values={}){const f=glueFlags(values);return f.glue||f.thick36;}
 function sameGeometry(a,b){return num(a.length)===num(b.length)&&num(a.width)===num(b.width)&&num(a.qty)===num(b.qty);}
 function glueBackingFromRow(r){
  if(!r||(!r.variant_id&&!r.custom_customer))return null;
  return {draft_row_id:r.draft_row_id||null,resolution_reason:r.resolution_reason||null,variant_id:r.variant_id||null,custom_customer:r.custom_customer?{...r.custom_customer}:null,
    supply_source:r.supply_source||'company',provided_sheets:r.provided_sheets??null,customer_reason:r.customer_reason??null,materialLabel:r.materialLabel||'Материал подклейки'};
 }
 function recognizeGlueRows(rows){
  const result=[...rows],consumed=new Set(),groups=new Map();
  for(const r of result){if(!r?._sourcePosition&&!r?._sourceGlueText)continue;const pos=String(r._sourcePosition??'').trim();const k=pos?'p:'+pos:'g:'+String(r.length)+'|'+String(r.width)+'|'+String(r.qty);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  for(const group of groups.values()){
   group.sort((a,b)=>(a._sourceRow||0)-(b._sourceRow||0));
   let paired=false;
   for(let i=0;i<group.length&&!paired;i++)for(let j=i+1;j<group.length&&!paired;j++){
    const a=group[i],b=group[j];if(!sameGeometry(a,b))continue;const af=glueFlags({_sourceGlueText:a._sourceGlueText}),bf=glueFlags({_sourceGlueText:b._sourceGlueText});
    const samePos=String(a._sourcePosition??'').trim()!==''&&String(a._sourcePosition??'').trim()===String(b._sourcePosition??'').trim();
    const explicitSignal=af.copy||bf.copy||af.ready||bf.ready||af.glue||bf.glue||af.thick36||bf.thick36;
    if(!explicitSignal)continue;
    const score=(samePos?2:0)+2+(af.copy||bf.copy?2:0)+(af.ready||bf.ready?2:0)+(af.glue||bf.glue||af.thick36||bf.thick36?3:0);
    if(score<4)continue;
    const finished=af.copy&&!bf.copy?b:bf.copy&&!af.copy?a:(af.ready||af.thick36||af.glue)&&!(bf.ready||bf.thick36||bf.glue)?a:(bf.ready||bf.thick36||bf.glue)&&!(af.ready||af.thick36||af.glue)?b:a;
    const backing=finished===a?b:a,binfo=glueBackingFromRow(backing);if(!binfo)continue;
    finished.route='glued_18_18';finished.glue_backing=binfo;finished._glueAuto=true;finished._glueSourceRows=[a._sourceRow,b._sourceRow].filter(Boolean);consumed.add(backing);paired=true;
   }
   if(!paired)for(const r of group)if(glueHint({_sourceGlueText:r._sourceGlueText})){r.route='glued_18_18';if(r.glue_backing===undefined)r.glue_backing=null;}
  }
  return result.filter(r=>!consumed.has(r));
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
 return {fields,key,num,guess,columns,headers,detect,boardText,compatible,materialMatches,exactMaterial,legacyEdgeCandidates,edgeCandidates,edgeDefault,autoEdge,applyGroupEdgeSelection,glueFlags,glueHint,recognizeGlueRows,previewGroups};
})();
