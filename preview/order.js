'use strict';

const DATA=window.MF_DATA||{materials:[],edges:[],edgePairs:[]};
const RATES=window.MF_RATES||{services:{},rules:{},edgeTariffs:[]};
const CFG=window.MF_CONFIG||{};
const IMP=window.MF_IMPORTER;
const N=MF.norm,E=MF.esc;
const CATALOG=IMP.buildCatalog(DATA.materials||[]);

let state={id:MF.uuid(),created:new Date().toISOString(),materials:[]};
let currentUser=null;
let importTemplates=[];
let lastSourceFile=null;
let lastImportMeta=null;
let pendingImport=null;
const root=document.getElementById('materialsRoot');

function uid(){return MF.uuid()}
function safeNum(v){const n=+v;return Number.isFinite(n)?n:0}
function materialText(m){
  if(!m)return'';
  const code=m.article||`${m.decor||''} ${m.structure||''}`;
  return `${m.manufacturer||''} ${code||''} — ${m.name||''}`.replace(/\s+/g,' ').trim();
}
function materialCode(m){return String(m?.article||`${m?.decor||''} ${m?.structure||''}`).trim()}
function materialMatchCode(m){return N(materialCode(m).replace(/\([^)]*(?:MM|ММ|\d+)[^)]*\)/gi,'').replace(/\b(?:10|16|18|25)\s*MM\b/gi,''))}
function conflictForArticle(article){
  const rows=CATALOG.byArticle.get(N(article))||[];
  if(rows.length<2)return false;
  return new Set(rows.map(m=>N(`${m.manufacturer}|${m.article}|${m.name}|${m.thickness}|${m.format}`))).size>1;
}
function scoreMaterial(m,q){
  const nq=N(q);if(!nq)return 0;
  const code=N(materialCode(m));
  if(!code)return 0;
  // Catalog identity is strictly the article. Names/manufacturers never decide
  // which material is selected; partial input is only a convenience to list articles.
  if(code===nq)return 300;
  if(code.startsWith(nq))return 120;
  if(code.includes(nq))return 70;
  return 0;
}
function findMaterials(q,limit=12){
  return (DATA.materials||[]).map(m=>({m,s:scoreMaterial(m,q)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit);
}
function parseThickness(size=''){
  const s=String(size).replace(',','.');
  const a=s.split(/[×xX*]/);
  return safeNum(a[a.length-1])||0;
}
function parseSheetFormat(value=''){
  const m=String(value).replace(/,/g,'.').match(/(\d+(?:\.\d+)?)\s*[xх×*]\s*(\d+(?:\.\d+)?)/i);
  return m?{length:+m[1],width:+m[2]}:null;
}
function edgeSupplier(name=''){
  const n=N(name);
  if(n.includes('LIGNA'))return'Lignadecor';
  if(n.includes('ELMECH'))return'El-mech-Plast';
  if(n.includes('CROMLEXDESIGN'))return'Cromlex DESIGN';
  if(n.includes('CROMLEX'))return'Cromlex';
  if(n.includes('AQ'))return'AQ';
  if(n.includes('AKC')||n.includes('АКС'))return'АКС';
  if(n.includes('ABC'))return'ABC Egger';
  return'';
}
function invoiceEdgePrice(mat,size){
  const key=N(`${mat?.decor||''}${mat?.structure||''}${mat?.article||''}`);
  for(const o of RATES.invoiceEdgeOverrides||[])if(key.includes(N(o.match))&&N(size)===N(o.size))return{price:o.price,currency:o.currency,source:o.source,exact:true};
  return null;
}
function tariffEdgePrice(mat,pair){
  const inv=invoiceEdgePrice(mat,pair.edgeSize);if(inv)return inv;
  const supplier=edgeSupplier(pair.edgeName||'');if(!supplier)return null;
  let candidates=(RATES.edgeTariffs||[]).filter(t=>t.priceList==='Мартин Форест'&&N(t.supplier)===N(supplier)&&N(t.size)===N(pair.edgeSize)&&t.currency==='BYN');
  if(!candidates.length)candidates=(RATES.edgeTariffs||[]).filter(t=>N(t.supplier)===N(supplier)&&N(t.size)===N(pair.edgeSize)&&t.currency==='BYN');
  if(!candidates.length)return null;
  const white=(mat?.name||'').toLowerCase().includes('бел');
  let pref=candidates.find(t=>white&&String(t.decorGroup).toLowerCase().includes('бел'));
  if(!pref)pref=candidates.find(t=>String(t.decorGroup).toLowerCase().includes('декор'));
  if(!pref)pref=candidates[0];
  return{price:+pref.price,currency:pref.currency,source:pref.source,exact:false};
}
function rawEdgeObj(e,confirmed=false){
  return{id:`catalog:${e.id}`,label:`${e.sku||''} ${e.size||''} ${e.name||''}`.replace(/\s+/g,' ').trim(),code:e.sku||'',size:e.size||'',thickness:+e.thickness||parseThickness(e.size),price:e.pricePerM??null,currency:e.currency||'BYN',priceSource:e.source||'',confirmed,custom:false,clientOwned:false,needsApproval:!confirmed,catalogId:e.id,designation:e.designation||''};
}
function suggestedEdges(mat){
  if(!mat||mat.clientOwned)return[];
  const mc=materialMatchCode(mat),mm=N(mat.manufacturer||'');
  let pairs=(DATA.edgePairs||[]).filter(e=>{const pc=N(`${e.decor||''}${e.structure||''}`);return pc===mc&&(!mm||!e.manufacturer||N(e.manufacturer)===mm)});
  const seen=new Set(),out=[];
  for(const p of pairs){
    const k=N(`${p.edgeSku}|${p.edgeSize}|${p.edgeName}`);if(seen.has(k))continue;seen.add(k);
    const ep=tariffEdgePrice(mat,p);
    out.push({id:`pair:${k}`,label:`${p.edgeSku||''} ${p.edgeSize||''} ${p.edgeName||''}`.replace(/\s+/g,' ').trim(),code:p.edgeSku||'',size:p.edgeSize||'',thickness:parseThickness(p.edgeSize),price:ep?.price??null,currency:ep?.currency||'BYN',priceSource:ep?.source||'',confirmed:String(p.status||'').toLowerCase().includes('подтвержд'),custom:false,clientOwned:false,needsApproval:!String(p.status||'').toLowerCase().includes('подтвержд')});
  }
  for(const e of DATA.edges||[]){
    const des=N(e.designation||'');if(!des||!mc||!des.includes(mc))continue;
    const k=N(`${e.sku}|${e.size}|${e.name}`);if(seen.has(k))continue;seen.add(k);out.push(rawEdgeObj(e,true));
  }
  return out.slice(0,40);
}
function searchEdgeCatalog(q,limit=12){
  const nq=N(q);if(!nq)return[];
  return(DATA.edges||[]).map(e=>{const sku=N(e.sku||''),des=N(e.designation||''),hay=N(`${e.sku||''} ${e.name||''} ${e.designation||''} ${e.size||''}`);let s=0;if(sku===nq)s+=200;if(des===nq)s+=170;if(hay.includes(nq))s+=70;if(des.includes(nq))s+=50;return{e,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit);
}

function makeGroup(title='Материал'){
  return{id:uid(),manualName:title,sourceArticle:'',sourceMaterialText:'',material:null,clientOwned:false,materialConflict:false,requiresApproval:true,defaultTexture:true,edges:[],defaultEdgeId:'',details:[]};
}
function makeDetail(g,d={}){
  const texture=d.texture??g.defaultTexture;
  return{id:uid(),toCut:d.toCut!==false,pos:d.pos??(g.details.length+1),name:d.name||'',len:safeNum(d.len),wid:safeNum(d.wid),qty:safeNum(d.qty)||1,texture,canRotate:d.canRotate??!texture,glue:!!d.glue,l1:d.l1||'',l2:d.l2||'',w1:d.w1||'',w2:d.w2||'',l1Mode:d.l1Mode||(d.l1?'auto':'none'),l2Mode:d.l2Mode||(d.l2?'auto':'none'),w1Mode:d.w1Mode||(d.w1?'auto':'none'),w2Mode:d.w2Mode||(d.w2?'auto':'none'),comment:d.comment||'',sourceRow:d.sourceRow||null};
}
function addGroup(title='Материал',doRender=true){
  const g=makeGroup(title);g.details.push(makeDetail(g));state.materials.push(g);if(doRender)renderAll();return g;
}
function applyMaterial(g,m){
  const oldEdges=[...(g.edges||[])],manualBySide=new Map();
  for(const d of g.details)for(const k of ['l1','l2','w1','w2'])if(d[k]&&d[k+'Mode']==='manual'){const e=oldEdges.find(x=>x.id===d[k]);if(e)manualBySide.set(d.id+'|'+k,e)}
  g.material=m;g.clientOwned=!!m.clientOwned;g.manualName=materialText(m);g.sourceArticle=m.article||g.sourceArticle||'';g.requiresApproval=!!m.clientOwned;g.materialConflict=false;g.edges=suggestedEdges(m);g.defaultEdgeId=g.edges.find(x=>x.confirmed)?.id||g.edges[0]?.id||'';
  for(const d of g.details)for(const k of ['l1','l2','w1','w2']){
    const manual=manualBySide.get(d.id+'|'+k);
    if(manual){if(!g.edges.some(e=>e.id===manual.id))g.edges.push(manual);d[k]=manual.id;d[k+'Mode']='manual'}
    else if(d[k]){d[k]=g.defaultEdgeId||'__required__';d[k+'Mode']='auto'}
  }
}
function selectMaterial(g,m){applyMaterial(g,m);renderAll()}
function setClientMaterial(g){
  const article=prompt('Артикул / условный код материала клиента:',g.sourceArticle||'')?.trim();if(article===undefined||article===null)return;
  const name=prompt('Название материала:',g.sourceMaterialText||g.manualName||'Материал клиента')?.trim();if(name===undefined||name===null)return;
  const thickness=safeNum(String(prompt('Толщина, мм:',g.material?.thickness?String(g.material.thickness):'')||'').replace(',','.'));
  const fmtText=prompt('Формат полного листа, мм (например 2800×2070):',g.material?.format||'')||'';
  const manufacturer=prompt('Производитель (необязательно):',g.material?.manufacturer==='Материал клиента'?'':(g.material?.manufacturer||''))?.trim()||'';
  const fmt=parseSheetFormat(fmtText);
  const m={id:`CUSTOM:${uid()}`,article:article||'',articleExact:article||'',manufacturer:manufacturer||'Материал клиента',type:'Пользовательский',name:name||'Материал клиента',thickness:thickness||null,format:fmt?`${fmt.length}×${fmt.width}`:fmtText,formats:fmt?[fmt]:[],sqmPrice:0,currency:'BYN',clientOwned:true,custom:true};
  g.sourceArticle=article||'';g.sourceMaterialText=name||'';applyMaterial(g,m);g.requiresApproval=true;renderAll();
}
function addCustomEdge(g){
  const q=prompt('Найти кромку в базе M2 по артикулу, декору или названию.\nОставьте пустым — для ручного ввода:','');
  if(q!==null&&q.trim()){
    const found=searchEdgeCatalog(q.trim(),10);
    if(found.length){
      const list=found.map((x,i)=>`${i+1}. ${x.e.sku||''} ${x.e.size||''} — ${x.e.name||''}${x.e.designation?` [${x.e.designation}]`:''}`).join('\n');
      const pick=prompt(`Найдено ${found.length}. Введите номер кромки:\n\n${list}`,'1'),n=parseInt(pick,10);
      if(n>=1&&n<=found.length){const e=rawEdgeObj(found[n-1].e,false);if(!g.edges.some(x=>x.catalogId===e.catalogId))g.edges.push(e);const saved=g.edges.find(x=>x.catalogId===e.catalogId)||e;if(!g.defaultEdgeId)g.defaultEdgeId=saved.id;renderAll();return}
    }else alert('В базе M2 ничего не найдено. Можно ввести кромку вручную.');
  }
  const name=prompt('Название / артикул кромки:','Кромка вручную');if(!name)return;
  const size=prompt('Размер кромки (например 22×0,8):','22×0,8')||'';
  const clientOwned=confirm('Это кромка заказчика?\nОК — кромка клиента, стоимость материала 0 BYN.\nОтмена — наша/неизвестная кромка, цену проверит менеджер.');
  const e={id:uid(),label:`${name} ${size}`.trim(),code:name,size,thickness:parseThickness(size),price:clientOwned?0:null,currency:'BYN',custom:true,clientOwned,confirmed:false,needsApproval:true};
  g.edges.push(e);if(!g.defaultEdgeId)g.defaultEdgeId=e.id;renderAll();
}
function edgeOptions(g,val,mode='none'){
  const missing=val&&val!=='__required__'&&!g.edges.some(e=>e.id===val);
  let out='<option value="">— без кромки —</option>';
  if(val==='__required__'||missing)out+='<option value="__required__" selected>⚠ требуется выбрать кромку</option>';
  if(g.defaultEdgeId){const de=g.edges.find(e=>e.id===g.defaultEdgeId);out+=`<option value="__auto__" ${mode==='auto'&&val&&val!=='__required__'?'selected':''}>AUTO · ${E(de?.label||'кромка материала')}</option>`}
  out+=g.edges.map(e=>`<option value="${e.id}" ${mode==='manual'&&val===e.id?'selected':''}>${E(e.label)}${e.clientOwned?' · клиента':''}${e.needsApproval?' ⚠':''}</option>`).join('');
  return out;
}

function groupStatus(g){
  if(g.materialConflict)return'<span class="pill danger">конфликт артикула</span>';
  if(g.clientOwned)return'<span class="pill warn">материал клиента · 0 BYN</span>';
  if(g.material&&!g.requiresApproval)return'<span class="pill">материал найден</span>';
  return'<span class="pill warn">требует согласования</span>';
}
function renderAll(){root.innerHTML=state.materials.map((g,gi)=>renderGroup(g,gi)).join('');attachHandlers();updateSummary()}
function renderGroup(g,gi){
  const title=g.material?materialText(g.material):g.manualName;
  const source=(g.sourceMaterialText&&g.sourceMaterialText!==title)?`<div class="source-material">Из Excel: ${E(g.sourceMaterialText)}</div>`:'';
  return`<article class="material-group" data-gid="${g.id}">
    <div class="material-group-head"><div class="material-group-title"><h3>Материал ${gi+1}: ${E(title||'не выбран')}</h3>${groupStatus(g)}${source}</div><div class="material-tools"><button class="btn btn-ghost btn-sm" data-act="manual-mat">Материал клиента</button><button class="btn btn-danger btn-sm" data-act="remove-group">Удалить</button></div></div>
    <div class="material-settings"><div class="field search-wrap"><label>Поиск материала в базе по артикулу</label><input class="mat-search" value="${E(g.material&&!g.clientOwned?materialText(g.material):'')}" placeholder="Например: 621 PO, 621 PE, H305 ST12"><div class="results hidden"></div></div><div class="field"><label>Текстура по умолчанию</label><select class="default-texture"><option value="1" ${g.defaultTexture?'selected':''}>Да</option><option value="0" ${!g.defaultTexture?'selected':''}>Нет</option></select></div><div class="field"><label>Кромка по умолчанию</label><select class="default-edge"><option value="">Не назначена</option>${g.edges.map(e=>`<option value="${e.id}" ${g.defaultEdgeId===e.id?'selected':''}>${E(e.label)}</option>`).join('')}</select></div></div>
    <div class="edge-library"><div class="toolbar"><span class="muted" style="font-size:12px"><b>Подбор кромки:</b> стороны AUTO меняются вместе с материалом; ручные назначения сохраняются.</span>${g.edges.length?'':'<span class="pill warn">кромка не выбрана</span>'}<button class="btn btn-ghost btn-sm" data-act="add-edge">+ Кромка из базы / клиента</button></div><div class="edge-tags">${g.edges.map(e=>`<span class="edge-tag"><b>${E(e.code||'ручная')}</b> ${E(e.size||'')} ${e.clientOwned?'· клиента · 0 BYN':e.price!=null?`· ${e.price.toFixed(2)} ${E(e.currency)}/м`:''}${e.needsApproval?' · ⚠':''}</span>`).join('')}</div></div>
    <div class="table-wrap"><table class="details"><thead><tr><th class="col-extended">Кроить</th><th>Поз.</th><th>Наименование</th><th>Длина</th><th>Ширина</th><th>Кол.</th><th class="col-extended">Текстура</th><th>Вращать</th><th class="col-extended">Склейка</th><th>L1</th><th>L2</th><th>W1</th><th>W2</th><th class="col-extended">Тех. размер</th><th class="col-extended">Комментарий</th><th></th></tr></thead><tbody>${g.details.map(d=>renderDetail(g,d)).join('')}</tbody></table></div>
    <div class="group-actions"><button class="btn btn-primary btn-sm" data-act="add-detail">+ Деталь</button><button class="btn btn-ghost btn-sm" data-act="texture-all">Текстура всем</button><button class="btn btn-ghost btn-sm" data-act="rotate-all">Вращать всем</button><button class="btn btn-ghost btn-sm" data-act="rotate-none">Не вращать всем</button><button class="btn btn-ghost btn-sm" data-act="edge-l1-all">AUTO L1 всем</button><button class="btn btn-ghost btn-sm" data-act="edge-l2-all">AUTO L2 всем</button><button class="btn btn-ghost btn-sm" data-act="edge-w1-all">AUTO W1 всем</button><button class="btn btn-ghost btn-sm" data-act="edge-w2-all">AUTO W2 всем</button><button class="btn btn-ghost btn-sm" data-act="edge-all-sides">AUTO 4 стороны всем</button><button class="btn btn-ghost btn-sm" data-act="edge-clear-all">Очистить кромки</button></div>
  </article>`;
}
function renderDetail(g,d){
  const complex=Math.min(d.len||99999,d.wid||99999)<(RATES.rules.complexEdgeThresholdMm||60);
  const cls=[complex?'complex-row':'',d.glue?'glue-row':''].join(' ');
  const tech=d.glue&&d.len&&d.wid?`${d.len+20}×${d.wid+20} ×2 слоя`:d.len&&d.wid?`${d.len}×${d.wid}`:'—';
  return`<tr class="${cls}" data-did="${d.id}">
    <td class="col-extended" data-label="Кроить"><input class="c-check" data-field="toCut" type="checkbox" ${d.toCut?'checked':''}></td>
    <td data-label="Поз."><input class="pos" data-field="pos" value="${E(d.pos)}"></td>
    <td data-label="Наименование"><input class="name" data-field="name" value="${E(d.name)}" placeholder=""></td>
    <td data-label="Длина"><input data-field="len" type="number" min="1" value="${d.len||''}"></td>
    <td data-label="Ширина"><input data-field="wid" type="number" min="1" value="${d.wid||''}"></td>
    <td data-label="Количество"><input data-field="qty" type="number" min="1" value="${d.qty||1}"></td>
    <td class="col-extended" data-label="Текстура"><input class="c-check" data-field="texture" type="checkbox" ${d.texture?'checked':''}></td>
    <td data-label="Вращать"><input class="c-check" data-field="canRotate" type="checkbox" ${d.canRotate?'checked':''}></td>
    <td class="col-extended" data-label="Склейка"><input class="c-check" data-field="glue" type="checkbox" ${d.glue?'checked':''}></td>
    ${['l1','l2','w1','w2'].map(k=>`<td data-label="${k.toUpperCase()}"><select class="edge-select" data-field="${k}">${edgeOptions(g,d[k],d[k+'Mode'])}</select></td>`).join('')}
    <td class="tech col-extended" data-label="Тех. размер">${E(tech)}${complex?'<br><span class="pill warn">сложная оклейка</span>':''}</td>
    <td class="col-extended" data-label="Комментарий"><input class="comment" data-field="comment" value="${E(d.comment)}"></td>
    <td data-label="Удалить"><button class="row-delete" data-act="remove-detail">Удалить</button></td>
  </tr>`;
}
function attachHandlers(){
  document.querySelectorAll('.material-group').forEach(el=>{
    const g=state.materials.find(x=>x.id===el.dataset.gid);if(!g)return;
    const srch=el.querySelector('.mat-search'),res=el.querySelector('.results');
    srch?.addEventListener('input',()=>{
      const items=findMaterials(srch.value);
      res.innerHTML=items.map((x,i)=>`<div class="result" data-i="${i}"><strong>${E(x.m.manufacturer||'')} · ${E(x.m.article||'без артикула')} ${conflictForArticle(x.m.article)?'<span class="pill danger">конфликт</span>':''}</strong><small>${E(x.m.name)} · ${E(x.m.type||'')} · ${x.m.thickness||'—'} мм · ${E(x.m.format||'формат не указан')} · ${+x.m.sqmPrice>0?`${x.m.sqmPrice} ${E(x.m.currency||'BYN')}/м²`:'цена уточняется'}</small></div>`).join('');
      res.classList.toggle('hidden',!items.length);
      res.querySelectorAll('.result').forEach((r,i)=>r.onclick=()=>{const m=items[i].m;if(conflictForArticle(m.article)){g.material=null;g.materialConflict=true;g.requiresApproval=true;g.sourceArticle=m.article;g.manualName=`Артикул ${m.article}`;renderAll();return alert(`Конфликт артикула ${m.article}. В базе есть разные материалы с одинаковым артикулом. Требуется проверка менеджера.`)}selectMaterial(g,m)});
    });
    el.querySelector('.default-texture')?.addEventListener('change',e=>{g.defaultTexture=e.target.value==='1'});
    el.querySelector('.default-edge')?.addEventListener('change',e=>{g.defaultEdgeId=e.target.value;for(const d of g.details)for(const k of ['l1','l2','w1','w2'])if(d[k+'Mode']==='auto'&&d[k])d[k]=g.defaultEdgeId||'__required__';renderAll()});
    el.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>handleAction(g,b.closest('tr')?.dataset.did,b.dataset.act)));
    el.querySelectorAll('tr[data-did] [data-field]').forEach(inp=>inp.addEventListener('change',()=>updateField(g,inp.closest('tr').dataset.did,inp)));
    el.querySelectorAll('tr[data-did] input:not([type=checkbox])').forEach(inp=>inp.addEventListener('input',()=>updateField(g,inp.closest('tr').dataset.did,inp,false)));
  });
}
function updateField(g,did,inp,struct=true){
  const d=g.details.find(x=>x.id===did);if(!d)return;
  const f=inp.dataset.field;
  if(['toCut','texture','canRotate','glue'].includes(f))d[f]=inp.checked;
  else if(['len','wid','qty'].includes(f))d[f]=safeNum(inp.value);
  else if(['l1','l2','w1','w2'].includes(f)){
    if(inp.value==='__auto__'){d[f]=g.defaultEdgeId||'__required__';d[f+'Mode']='auto'}
    else{d[f]=inp.value;d[f+'Mode']=inp.value?'manual':'none'}
  }else d[f]=inp.value;
  if(struct&&['len','wid','glue'].includes(f))renderAll();else updateSummary();
}
function handleAction(g,did,act){
  if(act==='manual-mat')setClientMaterial(g);
  if(act==='remove-group'&&confirm('Удалить материал и его детали?')){state.materials=state.materials.filter(x=>x.id!==g.id);renderAll()}
  if(act==='add-edge')addCustomEdge(g);
  if(act==='add-detail'){g.details.push(makeDetail(g));renderAll()}
  if(act==='remove-detail'){g.details=g.details.filter(x=>x.id!==did);renderAll()}
  if(act==='texture-all'){g.details.forEach(d=>d.texture=g.defaultTexture);renderAll()}
  if(act==='rotate-all'){g.details.forEach(d=>d.canRotate=true);renderAll()}
  if(act==='rotate-none'){g.details.forEach(d=>d.canRotate=false);renderAll()}
  for(const side of ['l1','l2','w1','w2'])if(act===`edge-${side}-all`){if(!g.defaultEdgeId)return alert('Сначала выберите кромку по умолчанию.');g.details.forEach(d=>{d[side]=g.defaultEdgeId;d[side+'Mode']='auto'});renderAll()}
  if(act==='edge-all-sides'){if(!g.defaultEdgeId)return alert('Сначала выберите кромку по умолчанию.');g.details.forEach(d=>['l1','l2','w1','w2'].forEach(k=>{d[k]=g.defaultEdgeId;d[k+'Mode']='auto'}));renderAll()}
  if(act==='edge-clear-all'){g.details.forEach(d=>['l1','l2','w1','w2'].forEach(k=>{d[k]='';d[k+'Mode']='none'}));renderAll()}
}
function edgeById(g,id){return g.edges.find(e=>e.id===id)||null}

function calc(){
  let c={material:0,cut18:0,edgeMaterial:0,edgeApply:0,glue:0,cut36:0,pack:0,total:0,area:0,edgeMeters:0,rows:0,qty:0,warnings:[],materials:state.materials.length};
  const rr=RATES.services||{},rules=RATES.rules||{};
  for(const g of state.materials){
    const clientMaterial=!!g.clientOwned;
    const groupMaterialKnown=!!(g.material&&!clientMaterial&&g.material.currency==='BYN'&&+g.material.sqmPrice>0);
    if(!clientMaterial&&!groupMaterialKnown)c.warnings.push(`Материал «${g.manualName||'без названия'}»: цена требует согласования.`);
    if(g.materialConflict)c.warnings.push(`Материал «${g.sourceArticle||g.manualName}»: конфликт артикула.`);
    for(const d of g.details){
      if(!d.toCut||!d.len||!d.wid||!d.qty)continue;
      c.rows++;c.qty+=d.qty;
      const finishedArea=d.len*d.wid/1e6*d.qty;c.area+=finishedArea;
      let rawArea=finishedArea,cutM=2*(d.len+d.wid)/1000*d.qty;
      if(d.glue){
        const tl=d.len+(rules.glueAllowanceEachSideMm||10)*2,tw=d.wid+(rules.glueAllowanceEachSideMm||10)*2;
        rawArea=tl*tw/1e6*d.qty*(rules.glueLayers||2);cutM=2*(tl+tw)/1000*d.qty*(rules.glueLayers||2);
        c.glue+=(tl*tw/1e6*d.qty)*(rr.glue18x18?.price||0);c.cut36+=2*(d.len+d.wid)/1000*d.qty*(rr.cut36?.price||0);
      }
      if(groupMaterialKnown)c.material+=rawArea*(+g.material.sqmPrice);
      c.cut18+=cutM*(rr.cut18?.price||0);
      const complex=Math.min(d.len,d.wid)<(rules.complexEdgeThresholdMm||60);
      for(const side of ['l1','l2','w1','w2']){
        if(!d[side])continue;
        const e=edgeById(g,d[side]),meters=((side[0]==='l')?d.len:d.wid)/1000*d.qty;c.edgeMeters+=meters;
        if(e?.clientOwned){/* own edge material = 0 */}
        else if(e?.price!=null&&e.currency==='BYN')c.edgeMaterial+=meters*e.price;
        else c.warnings.push(`Кромка ${side.toUpperCase()} у позиции ${d.pos}: цена кромки требует согласования.`);
        const thick=(e?.thickness||0)>=1.5||/^4[23]/.test(String(e?.size||''));
        const rate=complex?(rr.edgeComplex?.price||0):thick?(rr.edgeThick?.price||0):(rr.edgeNormal?.price||0);
        c.edgeApply+=meters*rate;
      }
      c.pack+=finishedArea*(rr.pack?.price||0);
    }
  }
  c.total=c.material+c.cut18+c.edgeMaterial+c.edgeApply+c.glue+c.cut36+c.pack;c.warnings=[...new Set(c.warnings)];return c;
}
function updateSummary(){
  const c=calc();
  document.getElementById('sumMaterials').textContent=state.materials.length;
  document.getElementById('sumRows').textContent=c.rows;
  document.getElementById('sumQty').textContent=c.qty;
  document.getElementById('sumArea').textContent=`${c.area.toFixed(3)} м²`;
  document.getElementById('sumEdge').textContent=`${c.edgeMeters.toFixed(2)} м`;
  document.getElementById('sumTotal').textContent=`${c.total.toFixed(2)} BYN`;
  const rows=[['Материалы',c.material],['Раскрой 18 мм',c.cut18],['Кромка (материал)',c.edgeMaterial],['Кромкооблицовка',c.edgeApply],['Склейка 18+18',c.glue],['Раскрой 36 мм',c.cut36],['Упаковка',c.pack]];
  document.getElementById('costTable').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1].toFixed(2)} BYN</td></tr>`).join('')+`<tr class="cost-total"><td><b>Предварительно, до производственного раскроя</b></td><td><b>${c.total.toFixed(2)} BYN</b></td></tr>`;
  document.getElementById('warnings').innerHTML=c.warnings.map(w=>`<li>${E(w)}</li>`).join('');
  return c;
}

function mappingFieldLabel(k){return({pos:'Позиция',name:'Наименование',article:'Артикул материала',material:'Материал / цвет',len:'Длина',wid:'Ширина',qty:'Количество',texture:'Текстура',rotate:'Вращение',l1:'L1 / X1',l2:'L2 / X2',w1:'W1 / Y1',w2:'W2 / Y2',comment:'Комментарий'})[k]||k}
function mappingOptions(headers,value,required=false){
  return`<option value="-1">${required?'— выберите —':'— нет колонки —'}</option>`+headers.map((h,i)=>`<option value="${i}" ${+value===i?'selected':''}>${i+1}. ${E(h||'без заголовка')}</option>`).join('');
}
function previewMaterialRow(g){
  const r=g.resolution;
  let status='<span class="pill warn">не найден</span>',article=r.article||g.sourceArticle||'';
  if(r.status==='found')status='<span class="pill">найден</span>';
  if(r.status==='conflict')status='<span class="pill danger">конфликт</span>';
  if(r.status==='missing')status='<span class="pill warn">не указан</span>';
  return`<tr><td>${E(article||'—')}</td><td>${E(g.sourceText||'—')}</td><td>${status}</td><td>${g.details.length}</td><td>${g.details.reduce((s,d)=>s+d.qty,0)}</td></tr>`;
}
function rebuildPendingPreview(){
  if(!pendingImport)return;
  const p=IMP.parseRows(pendingImport.matrix,pendingImport.mapping,CATALOG);pendingImport.parsed=p;
  const info=document.getElementById('importPreviewInfo');
  info.innerHTML=`<div class="import-metrics"><article><small>Материалов</small><strong>${p.groups.length}</strong></article><article><small>Позиций</small><strong>${p.positions}</strong></article><article><small>Деталей</small><strong>${p.qty}</strong></article><article><small>Предупреждений</small><strong>${p.warnings.length}</strong></article></div>
    ${p.errors.length?`<div class="notice warn"><b>Ошибки:</b><br>${p.errors.map(E).join('<br>')}</div>`:''}
    ${p.warnings.length?`<div class="notice"><b>Нужно проверить:</b><br>${p.warnings.map(E).join('<br>')}</div>`:''}
    <div class="table-wrap"><table class="admin-table"><thead><tr><th>Артикул</th><th>Текст из Excel</th><th>Статус</th><th>Позиций</th><th>Деталей</th></tr></thead><tbody>${p.groups.map(previewMaterialRow).join('')}</tbody></table></div>`;
  document.getElementById('confirmImportBtn').disabled=!!p.errors.length;
}
function showImportPreview(){
  const d=document.getElementById('importPreviewDialog');
  const match=pendingImport.template;
  document.getElementById('importTemplateState').innerHTML=match?`<span class="pill">Шаблон: ${E(match.name)} · v${match.version}</span>`:'<span class="pill warn">Новый формат Excel</span>';
  const keys=['pos','name','article','material','len','wid','qty','texture','rotate','l1','l2','w1','w2','comment'];
  document.getElementById('importMapping').innerHTML=keys.map(k=>`<div class="field"><label>${mappingFieldLabel(k)}</label><select data-map="${k}">${mappingOptions(pendingImport.headers,pendingImport.mapping[k],['len','wid'].includes(k))}</select></div>`).join('')+`<div class="field"><label>Первая строка данных</label><input id="importDataStart" type="number" min="1" value="${(pendingImport.mapping.dataStart||0)+1}"></div>`;
  document.querySelectorAll('#importMapping [data-map]').forEach(s=>s.onchange=()=>{pendingImport.mapping[s.dataset.map]=+s.value;rebuildPendingPreview()});
  document.getElementById('importDataStart').onchange=e=>{pendingImport.mapping.dataStart=Math.max(0,+e.target.value-1);rebuildPendingPreview()};
  const saveWrap=document.getElementById('saveTemplateWrap');
  saveWrap.hidden=false;
  const saveLabel=saveWrap.querySelector('.consent span');
  if(saveLabel)saveLabel.textContent=match?'Сохранить изменения структуры как новую версию этого шаблона':'Сохранить эту структуру как новый личный шаблон импорта';
  document.getElementById('saveTemplate').checked=!match;
  document.getElementById('templateName').value=match?.name||`Основной ${new Date().toLocaleDateString('ru-RU')}`;
  rebuildPendingPreview();d.showModal();
}
async function importExcel(file){
  if(!IMP)throw new Error('Модуль импорта не загрузился.');
  lastSourceFile=file;
  const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'}),sheetName=wb.SheetNames[0],ws=wb.Sheets[sheetName],matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
  const detected=IMP.detectMapping(matrix);
  if(!detected.mapping)throw new Error('Не удалось определить структуру Excel. Файл можно передать менеджеру без импорта.');
  const fp=IMP.fingerprint(sheetName,detected.headers,detected.mapping);
  const tpl=importTemplates.find(t=>t.isActive&&t.fingerprint===fp)||null;
  const mapping=tpl?{...tpl.mapping}:{...detected.mapping};
  pendingImport={file,sheetName,matrix,headers:detected.headers,mapping,fingerprint:fp,template:tpl};
  showImportPreview();
}
function groupFromParsed(pg){
  const title=pg.sourceText||pg.sourceArticle||'Материал не указан',g=makeGroup(title);
  g.sourceArticle=pg.sourceArticle||pg.resolution.article||'';g.sourceMaterialText=pg.sourceText||'';
  if(pg.resolution.status==='found')applyMaterial(g,pg.resolution.material);
  else{g.material=null;g.requiresApproval=true;g.materialConflict=pg.resolution.status==='conflict';g.manualName=title;g.edges=[];g.defaultEdgeId=''}
  g.details=[];
  for(const x of pg.details){
    const d=makeDetail(g,{pos:x.pos,name:x.name,len:x.len,wid:x.wid,qty:x.qty,texture:x.texture,canRotate:x.canRotate,comment:x.comment,sourceRow:x.sourceRow});
    for(const side of ['l1','l2','w1','w2'])if(x.marks[side]){d[side]=g.defaultEdgeId||'__required__';d[side+'Mode']='auto'}
    g.details.push(d);
  }
  return g;
}
async function saveTemplateFromPending(){
  if(!pendingImport||!document.getElementById('saveTemplate').checked)return null;
  const name=document.getElementById('templateName').value.trim()||'Шаблон Excel';
  if(pendingImport.template){
    const x=await MFAuth.api('/api/import-templates/'+pendingImport.template.id,{method:'PATCH',body:{name,fingerprint:pendingImport.fingerprint,mapping:pendingImport.mapping}});
    const i=importTemplates.findIndex(t=>t.id===x.template.id);if(i>=0)importTemplates[i]=x.template;
    pendingImport.template=x.template;return x.template;
  }
  const body={name,fingerprint:pendingImport.fingerprint,mapping:pendingImport.mapping,status:'new'};
  const x=await MFAuth.api('/api/import-templates',{method:'POST',body});
  importTemplates.push(x.template);return x.template;
}
async function confirmPendingImport(){
  if(!pendingImport?.parsed||pendingImport.parsed.errors.length)return;
  state.materials=pendingImport.parsed.groups.map(groupFromParsed);
  const template=await saveTemplateFromPending();
  lastImportMeta={sourceFileName:pendingImport.file.name,sheetName:pendingImport.sheetName,fingerprint:pendingImport.fingerprint,templateId:(pendingImport.template||template)?.id||null,templateVersion:(pendingImport.template||template)?.version||null,positions:pendingImport.parsed.positions,qty:pendingImport.parsed.qty};
  document.getElementById('importPreviewDialog').close();renderAll();
  alert(`Импортировано: ${pendingImport.parsed.positions} позиций, ${pendingImport.parsed.qty} деталей, материалов: ${pendingImport.parsed.groups.length}.`);
  pendingImport=null;
}

function xmlEsc(s=''){return String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))}
function edgeXml(tag,e){if(!e)return`<${tag}><Name/><Code/><Sign/><Thickness>0</Thickness><Allowance>0</Allowance><Overhung>0</Overhung><Clip>N</Clip><ButtType>2</ButtType></${tag}>`;return`<${tag}><Name>${xmlEsc(e.label)}</Name><Code>${xmlEsc(e.code||'')}</Code><Sign>${xmlEsc(e.code||e.label)}</Sign><Thickness>${e.thickness||0}</Thickness><Allowance>${e.thickness||0}</Allowance><Overhung>50</Overhung><Clip>Y</Clip><ButtType>1</ButtType></${tag}>`}
function detailXml(g,d){
  if(d.glue){const l=d.len+20,w=d.wid+20;return`<Detail><ToCut>${d.toCut?'Y':'N'}</ToCut><B3DModel/><Pos>${xmlEsc(d.pos)}</Pos><Name>${xmlEsc((d.name||'')+' [СКЛЕЙКА 18+18 — заготовки]')}</Name><Designation/><Length>${l}</Length><Width>${w}</Width><WithoutButLength>${l}</WithoutButLength><WithoutButWidth>${w}</WithoutButWidth><Count>${d.qty*2}</Count><Orient>${d.texture?'Y':'N'}</Orient>${edgeXml('TopEdge_L1',null)}${edgeXml('BottomEdge_L2',null)}${edgeXml('LeftEdge_W1',null)}${edgeXml('RightEdge_W2',null)}<UserProperty/><Grove/><Comment>${xmlEsc((d.comment||'')+' Готовый размер '+d.len+'×'+d.wid+'; припуск 10 мм с каждой стороны; после склейки раскрой 36 мм и кромка по карте заказа.')}</Comment><Priority>0</Priority><PlasticType>0</PlasticType><FrontPlastics/><BackPlastics/></Detail>`}
  const e1=edgeById(g,d.l1),e2=edgeById(g,d.l2),e3=edgeById(g,d.w1),e4=edgeById(g,d.w2);
  const wl=Math.max(0,d.len-(e1?.thickness||0)-(e2?.thickness||0)),ww=Math.max(0,d.wid-(e3?.thickness||0)-(e4?.thickness||0));
  const rotNote=d.canRotate?'Вращение разрешено.':'Вращение запрещено.';
  return`<Detail><ToCut>${d.toCut?'Y':'N'}</ToCut><B3DModel/><Pos>${xmlEsc(d.pos)}</Pos><Name>${xmlEsc(d.name)}</Name><Designation/><Length>${d.len}</Length><Width>${d.wid}</Width><WithoutButLength>${wl}</WithoutButLength><WithoutButWidth>${ww}</WithoutButWidth><Count>${d.qty}</Count><Orient>${d.texture?'Y':'N'}</Orient>${edgeXml('TopEdge_L1',e1)}${edgeXml('BottomEdge_L2',e2)}${edgeXml('LeftEdge_W1',e3)}${edgeXml('RightEdge_W2',e4)}<UserProperty/><Grove/><Comment>${xmlEsc([d.comment,rotNote].filter(Boolean).join(' '))}</Comment><Priority>0</Priority><PlasticType>0</PlasticType><FrontPlastics/><BackPlastics/></Detail>`;
}
function makeOblx(){
  const name=document.getElementById('orderName').value.trim()||`MartinForest-${new Date().toLocaleDateString('ru-RU')}`;
  const mats=state.materials.map(g=>`<Material><Name>${xmlEsc(g.material?materialText(g.material):g.manualName)}</Name><Code>${xmlEsc(g.material?.article||g.sourceArticle||'')}</Code><Thickness>${g.material?.thickness||18}</Thickness><Type>Y</Type><Details>${g.details.filter(d=>d.len&&d.wid&&d.qty).map(d=>detailXml(g,d)).join('')}</Details></Material>`).join('');
  return`<?xml version="1.0" encoding="UTF-8"?>\n<Root Programm="BAZIS-Cutting v2025.11.20.0 date:20.11.2025"><Order>${xmlEsc(name)}</Order><OrderComment>${xmlEsc(document.getElementById('orderComment').value)}</OrderComment><NumberOfSets>1</NumberOfSets><Materials>${mats}</Materials></Root>`;
}
function orderSnapshot(){return{...state,orderName:document.getElementById('orderName').value,customerName:document.getElementById('customerName').value,customerPhone:document.getElementById('customerPhone').value,orderComment:document.getElementById('orderComment').value,importMeta:lastImportMeta,calc:calc()}}
function buildReport(){
  const o=orderSnapshot(),c=o.calc,discount=+(currentUser?.discountPercent||0),final=c.total*(1-discount/100);
  const mats=o.materials.map((g,i)=>{const ds=g.details.filter(d=>d.toCut&&d.len&&d.wid&&d.qty),area=ds.reduce((a,d)=>a+d.len*d.wid/1e6*d.qty,0),qty=ds.reduce((a,d)=>a+d.qty,0);return`<div class="material-item"><b>${i+1}. ${E(g.material?materialText(g.material):g.manualName)}</b><span>${qty} деталей · ${area.toFixed(2)} м²${g.clientOwned?' · материал клиента':g.requiresApproval?' · требует согласования':''}</span></div>`}).join('');
  const lines=[['Материалы',c.material],['Раскрой',c.cut18+c.cut36],['Кромка',c.edgeMaterial],['Кромкооблицовка',c.edgeApply],['Склейка',c.glue],['Упаковка',c.pack]].filter(x=>x[1]>0).map(x=>`<tr><td>${x[0]}</td><td>${x[1].toFixed(2)} BYN</td></tr>`).join('');
  return`<div class="client-report"><div class="report-top"><div class="brand"><span>MARTIN</span><b>FOREST</b></div><h1>Предварительный расчёт</h1><div class="report-order-meta"><span>${E(o.orderName||'Заказ')}</span><span>${new Date().toLocaleDateString('ru-RU')}</span></div></div><div class="report-main"><div><h2>Материалы</h2><div class="material-list">${mats||'<div class="muted">Материалы не указаны</div>'}</div>${c.warnings.length?`<div class="notice warn" style="margin-top:16px"><b>Требует проверки:</b> ${c.warnings.length} поз.</div>`:''}</div><div><h2>Расчёт</h2><div class="price-card"><table>${lines}<tr><td>Базовая стоимость</td><td>${c.total.toFixed(2)} BYN</td></tr>${discount?`<tr><td>Персональная скидка ${discount}%</td><td>− ${(c.total-final).toFixed(2)} BYN</td></tr>`:''}</table><div class="report-grand"><small>Предварительно, до раскроя и проверки</small><strong>${final.toFixed(2)} BYN</strong></div></div></div></div><div class="report-footer"><span>${E(o.customerName||'')} ${E(o.customerPhone||'')}</span><span>Цена фиксируется после производственного раскроя и проверки менеджером Martin Forest.</span></div></div>`;
}
async function downloadPdf(){
  const sheet=document.getElementById('reportSheet');sheet.innerHTML=buildReport();
  if(!window.html2canvas||!window.jspdf){window.print();return}
  const canvas=await html2canvas(sheet,{scale:1.7,backgroundColor:'#ffffff',useCORS:true});const {jsPDF}=window.jspdf,pdf=new jsPDF('p','mm','a4'),img=canvas.toDataURL('image/jpeg',0.94);pdf.addImage(img,'JPEG',0,0,210,297);pdf.save((document.getElementById('orderName').value||'Martin_Forest_расчет').replace(/[\/:*?"<>|]/g,'_')+'.pdf');
}
function validateSelfOrder(){
  const issues=[];
  const details=state.materials.flatMap(g=>g.details).filter(d=>d.toCut&&d.len&&d.wid&&d.qty);
  if(!details.length)issues.push('Нет деталей для раскроя.');
  for(const g of state.materials){
    if(g.materialConflict)issues.push(`Конфликт артикула: ${g.sourceArticle||g.manualName}.`);
    if(!g.material)issues.push(`Материал не подтверждён: ${g.manualName||'без названия'}.`);
    if(g.clientOwned&&!parseSheetFormat(g.material?.format||''))issues.push(`Для материала клиента «${g.material?.name||g.manualName}» укажите формат полного листа.`);
    for(const d of g.details)if(d.toCut&&['l1','l2','w1','w2'].some(k=>d[k]==='__required__'))issues.push(`Поз. ${d.pos}: отмечена кромка, но конкретная кромка не выбрана.`);
  }
  return[...new Set(issues)];
}
async function fileToPayload(file){
  if(!file)return null;
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return{name:file.name,type:file.type||'application/octet-stream',base64:btoa(binary)};
}
async function submitOrder(mode='self'){
  const manager=mode==='manager',snap=orderSnapshot();
  if(manager){
    const haveDetails=snap.calc.rows>0;if(!haveDetails&&!lastSourceFile&&!snap.orderComment.trim())return alert('Добавьте Excel, детали или комментарий — менеджеру нужно получить исходные данные.');
    if(!confirm('Передать заказ менеджеру на обработку? После отправки текущая версия будет зафиксирована.'))return;
  }else{
    const issues=validateSelfOrder();if(issues.length)return alert('Для самостоятельной подготовки нужно исправить:\n\n'+issues.map(x=>'• '+x).join('\n'));
  }
  const sourceFile=await fileToPayload(lastSourceFile);
  const oblx=manager?'':makeOblx();
  try{
    const j=await MFAuth.api('/api/orders',{method:'POST',body:{title:snap.orderName||'Без названия',payload:snap,oblx,preliminaryTotal:snap.calc.total,status:manager?'manager_processing':'submitted',sourceFile}});
    alert(manager?`Заказ ${j.orderNumber} передан менеджеру.`:`Заказ ${j.orderNumber} отправлен на проверку.`);location.href='account.html';
  }catch(err){alert('Не удалось отправить заказ: '+err.message)}
}

async function loadTemplates(){
  try{const x=await MFAuth.api('/api/import-templates');importTemplates=x.templates||[]}catch(e){console.warn('templates',e)}
}

// UI bindings
addMaterial.onclick=()=>addGroup();
clearOrder.onclick=()=>{if(confirm('Очистить весь заказ?')){state={id:uid(),created:new Date().toISOString(),materials:[]};lastSourceFile=null;lastImportMeta=null;addGroup()}};
loadDemo.onclick=()=>{
  state.materials=[];const g=addGroup('BYSPAN 621 PO',false),m=findMaterials('621 PO',5).find(x=>N(x.m.article)==='621PO')?.m;
  if(m)applyMaterial(g,m);g.details=[];
  g.details.push(makeDetail(g,{pos:1,name:'Боковина',len:800,wid:450,qty:2,texture:true,canRotate:false,l1:g.defaultEdgeId,l1Mode:'auto',comment:'пример'}));
  g.details.push(makeDetail(g,{pos:2,name:'Полка',len:500,wid:300,qty:1,texture:true,canRotate:true}));renderAll();
};
xlsxInput.onchange=async e=>{const f=e.target.files[0];if(!f)return;try{await importExcel(f)}catch(err){lastSourceFile=f;alert(err.message)}e.target.value=''};
pdfBtn.onclick=downloadPdf;
oblxBtn.onclick=()=>{const unresolved=state.materials.some(g=>g.details.some(d=>['l1','l2','w1','w2'].some(k=>d[k]==='__required__')));if(unresolved)return alert('Есть стороны, где кромка отмечена, но конкретная кромка ещё не выбрана.');const x='\ufeff'+makeOblx();MF.download((orderName.value||'Martin_Forest').replace(/[\/:*?"<>|]/g,'_')+'.oblx',x,'application/xml;charset=utf-8')};
jsonBtn.onclick=()=>MF.download('Martin_Forest_order.json',JSON.stringify(orderSnapshot(),null,2),'application/json;charset=utf-8');
submitBtn.onclick=()=>submitOrder('self');
managerBtn.onclick=()=>submitOrder('manager');
confirmImportBtn.onclick=()=>confirmPendingImport().catch(e=>alert(e.message));
cancelImportBtn.onclick=()=>{importPreviewDialog.close();pendingImport=null};
compactMode?.addEventListener('click',()=>{workspace.classList.add('compact-mode');compactMode.classList.add('active');expandedMode.classList.remove('active')});
expandedMode?.addEventListener('click',()=>{workspace.classList.remove('compact-mode');expandedMode.classList.add('active');compactMode.classList.remove('active')});

(async()=>{
  currentUser=await MFAuth.requireAuth();if(!currentUser)return;
  customerName.value=currentUser.name||'';customerPhone.value=currentUser.phone||'';customerName.readOnly=true;customerPhone.readOnly=true;
  await loadTemplates();
  const constructorOrder=localStorage.getItem('mf_constructor_order');
  if(constructorOrder){
    try{
      const co=JSON.parse(constructorOrder);
      if(confirm('Найден проект из 3D-конструктора. Загрузить его в заказ?')){
        orderName.value=co.orderName||'Комод из 3D-конструктора';state.materials=co.materials;
        state.materials.forEach(g=>{g.details.forEach(d=>{if(d.canRotate===undefined)d.canRotate=!d.texture});if(g.material){g.edges=suggestedEdges(g.material);g.defaultEdgeId=g.edges.find(x=>x.confirmed)?.id||g.edges[0]?.id||'';g.details.forEach(d=>['l1','l2','w1','w2'].forEach(k=>{if(d[k]){d[k]=g.defaultEdgeId||'__required__';d[k+'Mode']='auto'}}))}});
        localStorage.removeItem('mf_constructor_order');renderAll();
      }else addGroup();
    }catch{addGroup()}
  }else addGroup();
})();