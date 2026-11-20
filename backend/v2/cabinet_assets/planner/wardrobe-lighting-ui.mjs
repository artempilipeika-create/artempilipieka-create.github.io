import {hardwareArtwork} from './hardware-photos.mjs';
import {canLight,lightFaces,lightSpans,lightingCut,lightingSystems} from './wardrobe-lighting.mjs';

const mm=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:3});
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
function button(text,fn){const node=el('button',text);node.type='button';node.onclick=fn;return node;}
export function pickLightPart(ui,key){ui.partKey=key;ui.lightIndex=0;ui.render();}
function lightDiagram(figure,part,parts,config){
 figure.replaceChildren();
 let op;try{op=lightingCut(part,parts,config);}catch(error){figure.append(el('small',error.message));return;}
 const W=part.item.blank_width_mm,L=part.item.blank_length_mm,scale=266/W;
 const width=op.width*scale,lo=22+(op.edge==='x0'?op.offset:W-op.offset-op.width)*scale;
 const right=lo+width,center=(lo+right)/2,back=config.anchor==='back',centered=config.anchor==='center';
 const a=back?22:centered?155:288,b=centered?center:back?lo:right;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 310 91');svg.setAttribute('role','img');svg.setAttribute('aria-label','Отступ '+(centered?'по центру':'до ближнего края паза'));
 svg.innerHTML='<rect x="22" y="44" width="266" height="19" rx="1" fill="#ddccb4" stroke="#62584a"/><rect x="'+lo+'" y="44" width="'+width+'" height="13" fill="#eefaf5" stroke="#175646"/>'+
  '<path d="M'+a+' 33H'+b+' M'+a+' 28v15 M'+b+' 28v15" fill="none" stroke="#246383"/>'+
  '<text x="'+((a+b)/2)+'" y="24" text-anchor="middle" fill="#245872" font-size="12">'+(centered?'По центру':mm(op.offset)+' мм')+'</text>'+
  '<text x="22" y="83" fill="#435248" font-size="12">Задний торец</text><text x="288" y="83" text-anchor="end" fill="#435248" font-size="12">Передний торец</text>';
 figure.append(svg,el('figcaption','Паз '+mm(op.width)+' × '+mm(op.depth)+' мм · длина '+mm(L-(op.start??0)-(op.end??0))+' мм'));
}
export function lightControls(ui){
 const parts=ui.previewBuilt?.parts??[],eligible=parts.filter(canLight),part=eligible.find(p=>p.key===ui.partKey)??eligible[0];
 if(!part)return;
 const {key,item}=part;ui.partKey=key;
 const box=el('fieldset');box.className='panel-machining';box.append(el('legend','Подсветка'));ui.form.append(box);
 ui.select(box,'Деталь для подсветки',eligible.map(p=>[p.key,p.label]),key,k=>pickLightPart(ui,k));
 const rows=ui.fields.lighting?.[key]??[];
 const index=Math.min(ui.lightIndex??0,rows.length),current=rows[index];
 if(rows.length)ui.select(box,'Линия подсветки',[...rows.map((r,i)=>[i,(i+1)+' · '+lightingSystems[r.system].label]),[rows.length,'Добавить линию']],index,v=>{ui.lightIndex=Number(v);ui.render();});
 const outerSide=key==='left'||key==='right',other=key==='left'?'right':'left';
 function mirrorRow(row){
  if(!row.pairId||!outerSide)return true;
  const twin=parts.find(p=>p.key===other),copy={...row,face:1-row.face};
  if(row.niche){
   const level=lightSpans(part,parts,row.face).rooms.findIndex(r=>r.key===row.niche);
   const room=lightSpans(twin,parts,copy.face).rooms[level];
   if(!room){ui.output.textContent='Во второй боковине выберите нишу с нужной высотой.';return false;}
   copy.niche=room.key;
  }
  const target=[...(ui.fields.lighting[other]??[])];
  let i=target.findIndex(r=>r.pairId===row.pairId);
  if(i<0)i=target.findIndex(r=>!r.pairId&&r.face===copy.face&&r.niche===copy.niche&&r.anchor===copy.anchor);
  target[i<0?target.length:i]=copy;ui.fields.lighting[other]=target;
  return true;
 }
 function write(row){
  if(!mirrorRow(row))return;
  const updated=rows.slice();updated[index]=row;
  (ui.fields.lighting??={})[key]=updated;
  ui.changed(true);
 }
 const grid=el('div');grid.className='wardrobe-handle-cards';grid.setAttribute('role','group');grid.setAttribute('aria-label','Модель подсветки');
 for(const [system,model] of Object.entries(lightingSystems)){
  const art=hardwareArtwork(null,'vitrine','light_system',system),img=el('img');img.src=art.src;img.alt=model.label;img.width=225;img.height=130;
  const card=button('',()=>write({...current,face:current?.face??(key==='bottom'?1:lightFaces(key)[0]),anchor:current?.anchor??'front',...(current?{}:{offset:50}),system}));
  card.dataset.lightingSystem=system;card.setAttribute('aria-pressed',String(current?.system===system));
  card.append(img,el('span',model.label+' · '+art.article),el('small','Паз '+mm(model.groove_width_mm)+' × '+mm(model.groove_depth_mm)+' мм'));grid.append(card);
 }
 box.append(grid);if(!current)return;
 const side=item.blank_axis==='side',faces=lightFaces(key);
 if(faces.length>1)ui.select(box,'Пласть для подсветки',faces.map(face=>[face,side?(face?'Левая':'Правая'):(face?'Верхняя':'Нижняя')]),current.face,v=>{
  const next={...current,face:Number(v)};delete next.niche;write(next);
 });
 const spans=lightSpans(part,parts,current.face);
 if(side)ui.select(box,'Участок подсветки',[['all','Вся высота внутри корпуса'],...spans.rooms.map((room,i)=>[room.key,'Ниша '+(i+1)+' снизу · '+mm(room.high-room.low)+' мм'])],current.niche??'all',v=>{
  const next={...current};if(v==='all')delete next.niche;else next.niche=v;write(next);
 });
 ui.select(box,'Положение по глубине',[['front','От переднего торца'],['center','По центру'],['back','От заднего торца']],current.anchor,v=>{
  const next={...current,anchor:v};if(v==='center')delete next.offset;else next.offset??=50;write(next);
 });
 const figure=el('figure');figure.className='cut-section';
 function dimension(label,field){
  const wrap=el('label',label),input=el('input');input.type='number';input.min=0;input.max=3000;input.step='any';input.required=true;input.value=current[field]??0;
  input.setAttribute('aria-label',label);input.oninput=()=>{
   current[field]=input.valueAsNumber;mirrorRow(current);ui.changed();lightDiagram(figure,part,parts,current);
  };wrap.append(input);return wrap;
 }
 if(current.anchor!=='center')box.append(dimension('До ближнего края паза, мм','offset'));
 lightDiagram(figure,part,parts,current);box.append(figure);
 const ends=el('details');ends.append(el('summary','Отступы по длине'),dimension(side?'От нижней границы, мм':'От левого края, мм','start'),
  dimension(side?'От верхней границы, мм':'От правого края, мм','end'));box.append(ends);
 if(outerSide){
  if(current.pairId){
   box.append(el('small','Обе боковины · общие размеры подсветки'),button('Разделить настройки боковин',()=>{
    const opposite=ui.fields.lighting[other]?.find(r=>r.pairId===current.pairId);
    if(opposite)delete opposite.pairId;
    const next={...current};delete next.pairId;write(next);
   }));
  }else box.append(button('Зеркально на вторую боковину',()=>write({...current,pairId:crypto.randomUUID()})));
 }
 box.append(button(current.pairId?'Убрать подсветку с обеих боковин':'Убрать подсветку',()=>{
  if(current.pairId&&outerSide){
   const opposite=ui.fields.lighting[other]?.filter(r=>r.pairId!==current.pairId);
   if(opposite?.length)ui.fields.lighting[other]=opposite;else delete ui.fields.lighting[other];
  }
  const remaining=rows.filter((_,i)=>i!==index);
  if(remaining.length)ui.fields.lighting[key]=remaining;else delete ui.fields.lighting[key];
  if(!Object.keys(ui.fields.lighting).length)delete ui.fields.lighting;
  ui.lightIndex=0;ui.changed(true);
 }));
}
