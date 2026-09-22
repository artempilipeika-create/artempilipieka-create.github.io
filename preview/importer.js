(function(){
  'use strict';

  const fallbackNorm=(v='')=>String(v).toUpperCase().replace(/[^A-Z0-9А-ЯЁ]+/g,'');
  const norm=(v='')=>(window.MF&&window.MF.norm?window.MF.norm(v):fallbackNorm(v));
  const text=v=>String(v??'').trim();
  // Header detection must preserve Cyrillic words. Article normalization below may
  // intentionally fold Cyrillic/Latin homoglyphs, but doing that to headers would
  // turn words like ШИРИНА into a mixed alphabet and break column detection.
  const headerNorm=(v='')=>String(v).toUpperCase().replace(/[^A-Z0-9А-ЯЁ]+/g,'');
  const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0};
  const marked=v=>{const s=text(v).toLowerCase();return !!s&&!['0','нет','no','false','-','n'].includes(s)};

  function colText(matrix,start,span,col){
    const parts=[];
    for(let r=start;r<Math.min(matrix.length,start+span);r++){
      const v=text(matrix[r]?.[col]);
      if(v)parts.push(v);
    }
    return parts.join(' | ');
  }

  function detectFromHeader(matrix,start,span){
    const width=Math.max(0,...matrix.slice(start,start+span).map(r=>r?.length||0));
    const headers=Array.from({length:width},(_,c)=>colText(matrix,start,span,c));
    const out={pos:-1,name:-1,article:-1,material:-1,len:-1,wid:-1,qty:-1,texture:-1,rotate:-1,l1:-1,l2:-1,w1:-1,w2:-1,comment:-1,dataStart:start+span,headerStart:start,headerSpan:span};
    const nHeaders=headers.map(h=>headerNorm(h));
    const find=(fn)=>nHeaders.findIndex((h,i)=>fn(h,headers[i]));

    out.pos=find((h,raw)=>h==='N'||h==='№'||/^\s*№\s*$/i.test(raw)||h.includes('ПОЗИЦ'));
    out.name=find(h=>h.includes('НАИМЕНОВАН')||h.includes('НАЗВАН')||h==='ДЕТАЛЬ'||h==='ДЕТАЛИ');
    out.article=find(h=>h.includes('АРТИКУЛ')&&(h.includes('МАТЕР')||h.includes('ДЕКОР')||h==='АРТИКУЛ'));
    out.material=find(h=>h.includes('МАТЕРИАЛ')||h.includes('ЦВЕТТОЛЩИН')||h.includes('ДЕКОРМАТЕР'));
    out.len=find(h=>h.includes('ДЛИНА')||h.includes('РАЗМЕРX')||h.includes('РАЗМЕРХ'));
    out.wid=find(h=>h.includes('ШИРИНА')||h.includes('РАЗМЕРY')||h.includes('РАЗМЕРУ'));
    out.qty=find(h=>h.includes('КОЛИЧ')||h==='КОЛВО'||h==='КОЛ');
    out.texture=find(h=>h.includes('ТЕКСТУР'));
    out.rotate=find(h=>h.includes('ВРАЩ')||h.includes('ПОВОРОТ'));
    out.l1=find(h=>h==='L1'||h==='X1'||h.endsWith('X1')||h.endsWith('Х1'));
    out.l2=find(h=>h==='L2'||h==='X2'||h.endsWith('X2')||h.endsWith('Х2'));
    out.w1=find(h=>h==='W1'||h==='Y1'||h.endsWith('Y1')||h.endsWith('У1'));
    out.w2=find(h=>h==='W2'||h==='Y2'||h.endsWith('Y2')||h.endsWith('У2'));
    out.comment=find(h=>h.includes('КОММЕНТ')||h.includes('ПРИМЕЧ'));

    let score=0;
    if(out.len>=0)score+=8;
    if(out.wid>=0)score+=8;
    if(out.qty>=0)score+=5;
    if(out.pos>=0)score+=2;
    if(out.material>=0||out.article>=0)score+=4;
    for(const k of ['l1','l2','w1','w2'])if(out[k]>=0)score+=1;
    if(out.rotate>=0||out.texture>=0)score+=2;
    if(out.comment>=0)score+=1;
    return {mapping:out,headers,score};
  }

  function detectMapping(matrix){
    let best=null;
    const maxStart=Math.min(matrix.length,24);
    for(let start=0;start<maxStart;start++){
      for(let span=1;span<=3;span++){
        if(start+span>matrix.length)continue;
        const x=detectFromHeader(matrix,start,span);
        if(!best||x.score>best.score)best=x;
      }
    }
    if(!best||best.mapping.len<0||best.mapping.wid<0){
      return {mapping:best?.mapping||null,headers:best?.headers||[],score:best?.score||0,errors:['Не найдены обязательные колонки длины и ширины.']};
    }
    return {...best,errors:[]};
  }

  function mappingSignature(headers,mapping){
    const keys=['pos','name','article','material','len','wid','qty','texture','rotate','l1','l2','w1','w2','comment'];
    return keys.map(k=>`${k}:${mapping[k]??-1}:${headerNorm(headers[mapping[k]]||'')}`).join('|');
  }

  function hashString(s){
    let h=2166136261;
    for(let i=0;i<s.length;i++){
      h^=s.charCodeAt(i);
      h=Math.imul(h,16777619);
    }
    return ('00000000'+(h>>>0).toString(16)).slice(-8);
  }

  function fingerprint(sheetName,headers,mapping){
    return `xlsx:${hashString(norm(sheetName)+'|'+mappingSignature(headers,mapping))}`;
  }

  function buildCatalog(materials){
    const byArticle=new Map();
    const searchable=[];
    for(const m of materials||[]){
      const a=text(m.article);
      const key=norm(a);
      if(!a||!key)continue;
      if(!byArticle.has(key))byArticle.set(key,[]);
      byArticle.get(key).push(m);
      if(key.length>=4)searchable.push({key,m});
    }
    searchable.sort((a,b)=>b.key.length-a.key.length);
    return {byArticle,searchable};
  }

  function distinctSignatures(rows){
    return new Set(rows.map(m=>norm(`${m.manufacturer||''}|${m.article||''}|${m.name||''}|${m.thickness??''}|${m.format||''}`)));
  }

  function resolveArticle(articleText,descriptionText,catalog){
    const rawArticle=text(articleText);
    const rawDescription=text(descriptionText);
    const direct=norm(rawArticle);
    if(direct){
      const rows=catalog.byArticle.get(direct)||[];
      if(rows.length){
        const sig=distinctSignatures(rows);
        if(sig.size===1)return {status:'found',article:rows[0].article,material:rows[0],candidates:rows,source:'article'};
        return {status:'conflict',article:rawArticle,candidates:rows,source:'article'};
      }
      return {status:'unknown',article:rawArticle,candidates:[],source:'article'};
    }

    const hay=norm(rawDescription);
    if(!hay)return {status:'missing',article:'',candidates:[],source:'none'};
    const matches=[];
    let longest=0;
    for(const it of catalog.searchable){
      if(it.key.length<longest)break;
      if(hay.includes(it.key)){
        if(it.key.length>longest){matches.length=0;longest=it.key.length;}
        matches.push(it.m);
      }
    }
    if(!matches.length)return {status:'unknown',article:'',candidates:[],source:'description'};
    const keys=[...new Set(matches.map(m=>norm(m.article)))];
    if(keys.length>1)return {status:'conflict',article:'',candidates:matches,source:'description'};
    const rows=catalog.byArticle.get(keys[0])||matches;
    const sig=distinctSignatures(rows);
    if(sig.size===1)return {status:'found',article:rows[0].article,material:rows[0],candidates:rows,source:'description'};
    return {status:'conflict',article:rows[0]?.article||'',candidates:rows,source:'description'};
  }

  function getCell(row,index){return index>=0?row?.[index]:''}

  function parseRows(matrix,mapping,catalog){
    const rows=[];
    const groups=[];
    const warnings=[];
    const errors=[];
    let currentArticle='';
    let currentMaterial='';
    let currentGroup=null;
    let autoPos=1;

    if(!mapping||mapping.len<0||mapping.wid<0){
      return {groups,rows,warnings,errors:['Не настроены обязательные колонки длины и ширины.'],positions:0,qty:0};
    }

    for(let r=mapping.dataStart||0;r<matrix.length;r++){
      const row=matrix[r]||[];
      const len=num(getCell(row,mapping.len));
      const wid=num(getCell(row,mapping.wid));

      // Older client templates sometimes put the material on a standalone row
      // immediately before its detail block. Preserve that explicit value, but do
      // not try to guess a catalog article from a material name.
      if(!(len>0&&wid>0)){
        if(mapping.material<0&&mapping.article<0){
          const nonEmpty=row.map(text).filter(Boolean);
          if(nonEmpty.length===1&&!/(подпись|телефон|доставка|итого|заказчик)/i.test(nonEmpty[0])){
            currentMaterial=nonEmpty[0];
            currentArticle='';
          }
        }
        continue;
      }

      const artCell=text(getCell(row,mapping.article));
      const matCell=text(getCell(row,mapping.material));
      if(artCell)currentArticle=artCell;
      if(matCell)currentMaterial=matCell;

      // Legacy files can place material alone on a row before details. The generic
      // parser intentionally does not infer names from arbitrary text: if no material
      // column exists, the group stays unresolved and can be handed to a manager.
      const sourceKey=norm(currentArticle||currentMaterial||'__NO_MATERIAL__');
      if(!currentGroup||currentGroup.sourceKey!==sourceKey){
        const resolution=resolveArticle(currentArticle,currentMaterial,catalog);
        currentGroup={
          sourceKey,
          sourceArticle:currentArticle,
          sourceText:currentMaterial,
          resolution,
          details:[]
        };
        groups.push(currentGroup);
        if(resolution.status==='unknown')warnings.push(`Материал «${currentArticle||currentMaterial||'не указан'}» не найден по артикулу.`);
        if(resolution.status==='missing')warnings.push('В блоке деталей не указан материал.');
        if(resolution.status==='conflict')warnings.push(`Конфликт артикула «${resolution.article||currentArticle||currentMaterial}» — требуется проверка менеджера.`);
      }

      const qty=Math.max(1,num(getCell(row,mapping.qty))||1);
      const rotateValue=getCell(row,mapping.rotate);
      const canRotate=mapping.rotate>=0?marked(rotateValue):false;
      let texture=true;
      if(mapping.texture>=0)texture=marked(getCell(row,mapping.texture));
      else if(mapping.rotate>=0)texture=!canRotate;

      const detail={
        sourceRow:r+1,
        pos:(()=>{const p=text(getCell(row,mapping.pos));return (!p||p.startsWith('='))?autoPos:p})(),
        name:mapping.name>=0?text(getCell(row,mapping.name)):'',
        len,wid,qty,texture,canRotate,
        comment:mapping.comment>=0?text(getCell(row,mapping.comment)):'',
        marks:{
          l1:mapping.l1>=0&&marked(getCell(row,mapping.l1)),
          l2:mapping.l2>=0&&marked(getCell(row,mapping.l2)),
          w1:mapping.w1>=0&&marked(getCell(row,mapping.w1)),
          w2:mapping.w2>=0&&marked(getCell(row,mapping.w2))
        }
      };
      currentGroup.details.push(detail);
      rows.push(detail);
      autoPos++;
    }

    if(!rows.length)errors.push('После заголовка не найдено ни одной строки с числовыми длиной и шириной.');
    return {groups,rows,warnings:[...new Set(warnings)],errors,positions:rows.length,qty:rows.reduce((s,d)=>s+d.qty,0)};
  }

  function columnsForMapping(headers){
    return headers.map((h,i)=>({index:i,label:`${String.fromCharCode(65+(i%26))}${i>=26?Math.floor(i/26):''} · ${h||'колонка '+(i+1)}`}));
  }

  window.MF_IMPORTER={detectMapping,fingerprint,buildCatalog,resolveArticle,parseRows,columnsForMapping,mappingSignature,marked,norm};
})();