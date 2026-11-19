import {doorHardware,doorLabel,doorShelfOptions,usesProfileEdge,wardrobeDoors,drawerFacadeKey,drawerFacades,mirrorHandle,handlePlacement} from './wardrobe-door-layout.mjs';
import {footHeight} from './plinth-options.mjs';
import photos from './door-photos/sources.json' with {type:'json'};

const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const btn=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
const presets=[['none','Открытый шкаф'],['left','Одна дверь · петли слева'],['right','Одна дверь · петли справа'],['pair','Две двери рядом'],['stack','Две двери одна над другой'],['quad','Четыре двери · две сверху, две снизу']];
const swings=[['left','Одна · петли слева'],['right','Одна · петли справа'],['pair','Две двери рядом'],['open','Открытая ниша']];
function formSpec(ui){return {...ui.fields,shelves:Math.max(...ui.fields.sectionShelves)};}
function shelves(ui,scope){try{return doorShelfOptions(formSpec(ui),scope);}catch{return [];}}
function photo(id){
 const p=photos[id],figure=el('figure'),img=el('img');img.src='/account/planner/door-photos/'+p.file;img.alt=p.model+' · '+p.pictured_size;img.width=128;img.height=74;
 const source=el('a','Фото '+p.model+' · '+p.pictured_size+' · арт. '+p.pictured_article);
 source.href=p.source_url;source.target='_blank';source.rel='noopener noreferrer';figure.className='door-product-photo';figure.append(img,source);return figure;
}
function check(parent,label,checked,attr,change){
 const l=el('label'),input=el('input');l.className='door-option-check';input.type='checkbox';input.checked=checked;input.setAttribute(attr,'');input.onchange=()=>change(input.checked);l.append(input,document.createTextNode(label));parent.append(l);
}
function num(ui,box,label,value,change){const l=el('label',label),i=el('input');i.type='number';i.min='0';i.max='3000';i.step='0.5';i.value=value;i.setAttribute('aria-label',label);i.onchange=()=>{if(i.value!==''&&i.checkValidity()){change(Number(i.value));ui.changed(true);}};l.append(i);box.append(l);}
function defaultHandle(leaf,article){
 if(leaf.slot!=null)return {article,edge:'top',from:'center',offset:0,inset:50};
 const edge=leaf.side==='left'?'right':'left',upper=leaf.key.includes('upper-');
 return {article,edge,from:doorHardware[article].family==='ak700'?(upper?'start':'end'):'center',offset:50,inset:50};
}
export function setDoorShelf(ui,value){
 const [section,shelf]=value.split(':').map(Number),d=ui.fields.front?.division;if(!d)return;
 Object.assign(d,{section,shelf});ui.changed(true);
}
function startDivision(ui,scope,below,above){
 const f=ui.fields.front??{swing:'pair',offset:90},list=shelves(ui,scope),old=f.division;
 const anchor=list.find(a=>a.matches.some(q=>q.section===old?.section&&q.shelf===old?.shelf))??list[0];
 if(!anchor){ui.output.textContent='Для этого стыка добавьте полку на шаге «Полки». В нескольких секциях полки должны быть на одной высоте.';return false;}
 const {section,shelf}=anchor.matches[0];
 f.division={scope,below,above,section,shelf};f.swing=scope!=='all'||below==='pair'||above==='pair'?'pair':below==='open'?above:below;
 ui.fields.front=f;ui.selectedDoor=null;return true;
}
function selectPreset(ui,value){
 const old=ui.fields.front,f=old??{offset:ui.fields.drawerBanks?.some(Boolean)?130:90};
 if(value==='none')delete ui.fields.front;
 else if(value==='stack'||value==='quad'){
  const mode=value==='quad'?'pair':ui.selectedDoor?.endsWith('right')?'right':'left';
  if(!startDivision(ui,'all',mode,mode)){ui.form.querySelector('[aria-label="Исполнение фасада"]').value=old?.swing??'none';return;}
 }else{delete f.division;f.swing=value;ui.fields.front=f;ui.selectedDoor=null;}
 ui.changed(true);
}
function doorSettings(ui,f,box){
 const d=f.division;if(!d)return;
 const opts=shelves(ui,d.scope),floor=(ui.fields.elevation??0)+footHeight(ui.fields);
 const label=(row)=>{const p=row.matches[0];return 'Полка '+(p.shelf+1)+' · '+(row.y+floor)+' мм от пола до низа';};
 const select=ui.select(box,'Перегородка на стыке',opts.map(r=>[r.matches[0].section+':'+r.matches[0].shelf,label(r)]),d.section+':'+d.shelf,value=>setDoorShelf(ui,value));select.dataset.doorShelf='';
 for(const [key,title] of [['below','Под перегородкой'],['above','Над перегородкой']]){
  ui.select(box,title,swings.filter(([v])=>d.scope==='all'||[d.scope,'open'].includes(v)),d[key],value=>{
   d[key]=value;if(d.below==='open'&&d.above==='open'&&d.scope==='all'){delete ui.fields.front;}else if(value==='open'){delete d.gola;}
   ui.selectedDoor=null;ui.changed(true);
  });
 }
}
function cleanHandles(f,leaves){
 if(!f.handles)return;
 const ids=new Set(leaves.map(d=>d.key));for(const key of Object.keys(f.handles))if(!ids.has(key))delete f.handles[key];
 if(!Object.keys(f.handles).length)delete f.handles;
}
export function doorControls(ui){
 const f=ui.fields.front,d=f?.division,box=ui.form;
 const preset=!f?'none':!d?f.swing:d.below==='pair'&&d.above==='pair'?'quad':'stack';
 ui.select(box,'Исполнение фасада',presets,preset,value=>selectPreset(ui,value));
 if(d)doorSettings(ui,f,box);
 let leaves=[];
 try{leaves=wardrobeDoors(formSpec(ui),ui.previewBuilt?.drawerBanks??[]);if(f)cleanHandles(f,leaves);}catch{/* The anchor selector remains available to repair a removed shelf. */}
 const choices=[...leaves,...drawerFacades(formSpec(ui),ui.previewBuilt?.drawerBanks??[])];
 const leaf=choices.find(p=>p.key===ui.selectedDoor)||leaves.find(p=>p.side===ui.selectedDoor)||choices[0];
 if(leaf){
  ui.selectedDoor=leaf.key;
  const panel=el('fieldset');panel.className='wardrobe-door-editor';panel.append(el('legend','Ручка на фасаде'));box.append(panel);
  const doorSelect=ui.select(panel,'Выбранный фасад',choices.map(p=>[p.key,p.label??doorLabel(p.key)]),leaf.key,v=>{ui.selectedDoor=v;ui.render();});doorSelect.dataset.doorPicker='';
  const drawer=leaf.slot==null?null:ui.fields.drawerBanks[leaf.slot].faces[leaf.index];
  const h=drawer?drawer.handle:f?.handles?.[leaf.key];
  const products=Object.entries(doorHardware).filter(([,p])=>p.pitch).sort(([,a],[,b])=>a.family.localeCompare(b.family)||a.pitch-b.pitch);
  const opts=[['','Без отдельной ручки'],...products.map(([article,p])=>[article,(p.family==='ak700'?'Скоба AK700 · '+p.pitch:'Торцевая MONBLAN · '+p.pitch+'/'+p.length)+' мм · '+article])];
  ui.select(panel,'Ручка и размер',opts,h?.article??'',v=>{
   const target=drawer??(f.handles??={}),key=drawer?'handle':leaf.key;
   if(v)target[key]=h&&doorHardware[h.article].family===doorHardware[v].family?{...h,article:v}:defaultHandle(leaf,v);
   else delete target[key];ui.changed(true);
  }).dataset.handleArticle='';
  if(h){
   const ak=doorHardware[h.article].family==='ak700';
   panel.append(photo(ak?'ak700-160':'monblan-128'));
   ui.select(panel,'Кромка фасада',[['left','Левая'],['right','Правая'],['top','Верхняя'],['bottom','Нижняя']].filter(([edge])=>drawer||ak||!usesProfileEdge(f,leaf.key,edge)),h.edge,v=>{h.edge=v;ui.changed(true);}).dataset.handleEdge='';
   const upright=['left','right'].includes(h.edge);
   ui.select(panel,'Положение вдоль кромки',[['center','По центру'],['start',upright?'От низа':'От левого края'],['end',upright?'От верха':'От правого края']],h.from,v=>{h.from=v;ui.changed(true);});
   if(h.from!=='center')num(ui,panel,ak?'До ближайшего отверстия, мм':'До торца ручки, мм',h.offset??0,v=>h.offset=v);
   if(ak)num(ui,panel,'От кромки до оси отверстий, мм',h.inset??50,v=>h.inset=v);
   const pair=leaves.find(p=>p.key!==leaf.key&&p.side!==leaf.side&&p.key.replace(/(left|right)$/,'')===leaf.key.replace(/(left|right)$/,''));
   if(pair){const mirror=btn('Зеркально на парную дверь',()=>{f.handles[pair.key]=mirrorHandle(h);ui.changed(true);});mirror.dataset.handleMirror='';panel.append(mirror);}
  }
  if(!drawer&&!d&&f?.swing==='pair'){
   panel.append(btn('Разделить выбранную дверь по полке',()=>{if(startDivision(ui,leaf.side,leaf.side,leaf.side))ui.changed(true);}));
  }
 }
 if(!f)return;
 const profiles=el('details');profiles.className='wardrobe-door-profiles';profiles.open=ui.golaDetails??!!(d?.gola||f.topProfile);
 profiles.ontoggle=()=>{if(profiles.isConnected)ui.golaDetails=profiles.open;};profiles.append(el('summary','Профиль Gola'));box.append(profiles);
 const updateProfiles=()=>{
  for(const [key,h] of Object.entries(f.handles??{}))if(doorHardware[h.article]?.family==='monblan'&&usesProfileEdge(f,key,h.edge))delete f.handles[key];
  ui.golaDetails=true;ui.changed(true);
 };
 if(Object.values(f.handles??{}).some(h=>doorHardware[h.article]?.family==='monblan'))profiles.append(el('small','Профиль заменяет торцевую ручку на выбранной кромке.'));
 check(profiles,'Верхний Gola L · 30 мм до верха',!!f.topProfile,'data-gola-top',v=>{if(v)f.topProfile=true;else delete f.topProfile;updateProfiles();});
 if(f.topProfile)profiles.append(photo('gola-l-118124'));
 if(d&&d.above!=='open'&&d.below!=='open'){
  check(profiles,'Средний Gola S (C) · 30 мм между фасадами',!!d.gola,'data-gola-middle',v=>{if(v)d.gola=true;else delete d.gola;updateProfiles();});
  if(d.gola){
   profiles.append(photo('gola-c-118129'));
   ui.select(profiles,'Вырез в стойках под S',[[74,'27 × 74 мм · по схеме AKS'],[73,'27 × 73 мм · по кухонному модулю']],d.cutHeight??74,v=>{d.cutHeight=Number(v);ui.changed(true);});
  }
 }
 if(d?.gola||f.topProfile){
  const guide=el('a','Монтажная схема AKS · стр. 2');guide.href='https://aks.by/upload/iblock/bba/iqgtnadk4pypc00bpzmee9jncedkngjd.pdf';guide.target='_blank';guide.rel='noopener noreferrer';profiles.append(guide);
 }
}
// Dragging writes the same edge offsets used by the numeric controls and the native export.
export function wireHandleDrag(ui){
 const host=ui.drawing;
 if(!host)return;
 host.addEventListener('pointerdown',event=>{
  const hit=event.target.closest?.('[data-drag-handle]');if(!hit||ui.busy)return;
  const key=hit.dataset.dragHandle,face=drawerFacadeKey(key),banks=ui.previewBuilt?.drawerBanks??[];
  const h=face?ui.fields.drawerBanks?.[face.slot]?.faces[face.index]?.handle:ui.fields.front?.handles?.[key];if(!h)return;
  const leaf=(face?drawerFacades(formSpec(ui),banks):wardrobeDoors(formSpec(ui),banks)).find(l=>l.key===key);if(!leaf)return;
  const pos=handlePlacement(leaf,h),svg=hit.ownerSVGElement,scale=Number(hit.dataset.scale);
  const inv=svg.getScreenCTM().inverse(),pt=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(inv);
  const start=pt(event);
  event.preventDefault();event.stopPropagation();host.setPointerCapture(event.pointerId);
  const move=e=>{
   if(e.pointerId!==event.pointerId)return;
   const p=pt(e),x=pos.x+(p.x-start.x)/scale,y=pos.y-(p.y-start.y)/scale;
   const span=pos.vertical?leaf.height:leaf.width,along=pos.vertical?y:x,ak=pos.part.family==='ak700';
   const center=Math.max(pos.part.length/2,Math.min(span-pos.part.length/2,along));
   h.from='start';h.offset=Math.round((center-(ak?pos.part.pitch:pos.part.length)/2)*2)/2;
   if(ak){const inset=h.edge==='left'?x:h.edge==='right'?leaf.width-x:h.edge==='top'?leaf.height-y:y;h.inset=Math.max(6,Math.min((pos.vertical?leaf.width:leaf.height)-6,Math.round(inset*2)/2));}
   ui.invalidate();ui.draw();
  };
  const done=e=>{if(e.pointerId!==event.pointerId)return;host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',done);host.removeEventListener('pointercancel',done);ui.selectedDoor=key;ui.suppressDiagramClick=true;ui.changed(true);setTimeout(()=>ui.suppressDiagramClick=false,0);};
  host.addEventListener('pointermove',move);host.addEventListener('pointerup',done);host.addEventListener('pointercancel',done);
 });
}
