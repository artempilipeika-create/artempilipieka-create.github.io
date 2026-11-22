import {pushControls} from './wardrobe-push-ui.mjs';
import {hingeControls} from './wardrobe-hinge-ui.mjs';
import {activeLeafKeys,nominalSide,hingeProduct,selectLeafFrame} from './wardrobe-hinge-layout.mjs';
import {isEdgePull,gripCut,verticalEdge} from './wardrobe-edge-pulls.mjs';
import {fitNicheBanks} from './wardrobe-niches.mjs';
import {profileEdges} from './wardrobe-facade-profiles.mjs';
import {drawerSections} from './wardrobe-drawers.mjs';
import {sectionWidths} from './wardrobe-layout.mjs';
import {doorHardware,doorLabel,baseWardrobeDoors,doorShelfOptions,isFacadeProfile,isSurfacePull,pullHalfWidth,usesProfileEdge,wardrobeDoors,drawerFacadeKey,drawerFacades,orientHandle,mirrorHandle,handlePlacement,pullHeight,setPullHeight} from './wardrobe-door-layout.mjs';
import {footHeight} from './plinth-options.mjs';
import photos from './door-photos/sources.json' with {type:'json'};

const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const btn=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=fn;return b;};
const presets=[['none','Открытый шкаф'],['left','Одна дверь · петли слева'],['right','Одна дверь · петли справа'],['pair','Две двери рядом'],['stack','Две двери одна над другой'],['quad','Четыре двери · две сверху, две снизу']];
const swings=[['left','Одна · петли слева'],['right','Одна · петли справа'],['pair','Две двери рядом'],['open','Открытая ниша']];
import {doorFittingControls} from './wardrobe-fitting-ui.mjs';

function formSpec(ui){return {...ui.fields,shelves:Math.max(...ui.fields.sectionShelves)};}
function shelves(ui,scope){try{return doorShelfOptions(formSpec(ui),scope);}catch{return [];}}
const families=[
 ['ak700','Скоба AK700','116550'],['monblan','Торцевая MONBLAN','92253'],
 ['insetL','Врезная L','67698'],['insetC','Врезная C','75975'],
 ['golaL','Gola L','118124'],['golaC','Gola S (C)','118129']
];
const photosByArticle=Object.fromEntries(Object.values(photos).map(p=>[p.pictured_article,p]));
const familyOf=h=>h?.article==='118124'?'golaL':h?.article==='118129'?'golaC':doorHardware[h?.article]?.family??'none';
function productImage(p,alt=p.model){
 const img=el('img');img.src='/account/planner/door-photos/'+p.file;img.alt=alt;img.width=225;img.height=130;return img;
}
const categories=[
 ['rail','Рейлинговые ручки AKS',['rail']],['surface','Скобы',['ak700','cobra','grafitti','margarita','ps15']],['edge','Торцевые',['monblan']],
 ['inset','Врезные',['insetL','insetC']],['gola','Gola',['golaL','golaC']]
];
const bracketSeries=[['ak700','AK700'],['cobra','COBRA'],['grafitti','GRAFITTI'],['margarita','MARGARITA'],['ps15','PS15/C15']];

function cataloguePullCards(ui,panel,setting,family,choose){
 const products=Object.entries(doorHardware).filter(([,p])=>p.family===family);
 const pitches=[...new Set(products.map(([,p])=>p.pitch))].sort((a,b)=>a-b);
 const product=doorHardware[setting?.article];
 const pitch=ui.pullPitch??(product?.family===family?product.pitch:pitches.includes(128)?128:pitches[0]);
 if(pitches.length>1)ui.select(panel,'Межосевое расстояние',pitches.map(mm=>[mm,mm+' мм']),pitch,v=>{ui.pullPitch=Number(v);ui.render();});
 const grid=el('div');grid.className='wardrobe-prime-cards';grid.setAttribute('role','group');grid.setAttribute('aria-label','Артикулы ручек');
 for(const [article,p] of products.filter(([,row])=>row.pitch===pitch).sort((a,b)=>a[1].length-b[1].length||a[1].finish.localeCompare(b[1].finish,'ru'))){
  const photo=photosByArticle[article],name=p.model+' · '+p.finish+' · AKS '+article;
  const card=btn('',()=>choose(family,article));card.dataset.pullArticle=article;
  card.setAttribute('aria-pressed',String(setting?.article===article));
  const figure=el('figure'),caption=el('figcaption',name),img=productImage(photo,name);
  figure.className='fitting-card';img.loading='lazy';
  const size='Межосевое '+p.pitch+' мм · длина '+p.length+' мм'+(p.hollow?' · полая сталь':'');
  caption.append(el('br'),el('small',size+(photo.shared_image_articles?.length>1?' · фото серии':'')));
  figure.append(img,caption);card.append(figure);
  grid.append(card);
 }
 panel.append(grid);
}

function familyCards(ui,panel,h,set,edges,key,frame){
 const available=frame?categories.filter(([id])=>id==='gola'):categories;
 const selected=familyOf(h);
 if(ui.handleCategoryKey!==key){
  ui.handleCategoryKey=key;
  ui.handleCategory=categories.find(([,label,ids])=>ids.includes(selected))?.[0]??'rail';
  ui.bracketSeries=bracketSeries.some(([id])=>id===selected)?selected:'ak700';ui.pullPitch=null;
 }
 if(!available.some(([id])=>id===ui.handleCategory))ui.handleCategory=available[0][0];
 const tabs=el('div');tabs.className='wardrobe-subsections';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Тип ручки');
 for(const [id,label] of available){
  const tab=btn(label,()=>{ui.handleCategory=id;ui.pullPitch=null;ui.render();});tab.dataset.handleCategory=id;
  tab.setAttribute('aria-pressed',String(ui.handleCategory===id));tabs.append(tab);
 }
 panel.append(tabs);
 let visible=categories.find(([id])=>id===ui.handleCategory)[2];
 if(ui.handleCategory==='surface'){
  ui.select(panel,'Серия скобы',bracketSeries,ui.bracketSeries,v=>{ui.bracketSeries=v;ui.pullPitch=null;ui.render();});
  visible=[ui.bracketSeries];
 }
 if(ui.handleCategory==='rail'||ui.handleCategory==='surface'&&ui.bracketSeries!=='ak700'){
  cataloguePullCards(ui,panel,h,visible[0],set);return;
 }
 const grid=el('div');grid.className='wardrobe-handle-cards';grid.setAttribute('role','group');grid.setAttribute('aria-label','Модели ручек');
 for(const [family,label,article] of families){
  if(!visible.includes(family))continue;
  const chosen=family===selected,product=photosByArticle[chosen?h.article:article];
  const card=btn('',()=>set(family,article));card.dataset.handleFamily=family;card.setAttribute('aria-pressed',String(chosen));
  card.append(productImage(product),el('span',label),el('small','AKS '+product.pictured_article));
  if(family==='golaC'&&!edges.length){card.setAttribute('aria-disabled','true');card.append(el('small','Нужен стык фасадов'));}
  grid.append(card);
 }
 panel.append(grid);
}
function num(ui,box,label,value,change){const l=el('label',label),i=el('input');i.type='number';i.min='0';i.max='3000';i.step='0.5';i.value=value;i.setAttribute('aria-label',label);i.required=true;i.oninput=()=>{if(i.value!==''&&i.checkValidity()){change(i.valueAsNumber);ui.changed();}};l.append(i);box.append(l);}
function defaultHandle(leaf,article){
 if(leaf.slot!=null)return {article,edge:'top',from:'center',offset:0,inset:50,...(isSurfacePull(doorHardware[article])?{centerHeight:true}:{})};
 const edge=leaf.side==='left'?'right':'left';
 return {article,edge,from:'center',offset:50,inset:50};
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
 const label=(row)=>{const p=row.matches[0],bottom=ui.previewBuilt?.installedLevels?.get('shelf-'+p.section+'-'+p.shelf)?.bottom??row.y;return 'Полка '+(p.shelf+1)+' · '+(bottom+floor)+' мм от пола до низа';};
 const select=ui.select(box,'Перегородка на стыке',opts.map(r=>[r.matches[0].section+':'+r.matches[0].shelf,label(r)]),d.section+':'+d.shelf,value=>setDoorShelf(ui,value));select.dataset.doorShelf='';
 for(const [key,title] of [['below','Под перегородкой'],['above','Над перегородкой']]){
  ui.select(box,title,swings.filter(([v])=>d.scope==='all'||[d.scope,'open'].includes(v)),d[key],value=>{
   d[key]=value;if(d.below==='open'&&d.above==='open'&&d.scope==='all'){delete ui.fields.front;}else if(value==='open'){delete d.gola;}
   ui.selectedDoor=null;ui.changed(true);
  });
 }
}
function cleanHandles(f,leaves){
 const ids=new Set(leaves.map(d=>d.key));
 for(const field of ['handles','edgeProfiles'])if(f[field]){
  for(const key of Object.keys(f[field]))if(!ids.has(key))delete f[field][key];
  if(!Object.keys(f[field]).length)delete f[field];
 }
}
function storedProfiles(f,key){
 const result=[];
 if(f.division?.gola&&/^door-(upper|lower)-/.test(key))result.push({article:'118129',edge:key.includes('upper-')?'bottom':'top',cutHeight:f.division.cutHeight??74});
 if(f.topProfile&&!key.startsWith('door-lower-'))result.push({article:'118124',edge:'top'});
 return result;
}
function localizeProfiles(f,doors,edited){
 // Historic assignments applied to a complete line. Keep every other door's grip,
 // including original projects that had a pull and two independent profile edges.
 for(const other of doors.filter(p=>p.slot==null&&p.key!==edited))for(const h of storedProfiles(f,other.key)){
  const handles=f.handles??={};
  if(!handles[other.key])handles[other.key]=h;
  else if(handles[other.key].article!==h.article||handles[other.key].edge!==h.edge){
   const extra=f.edgeProfiles??={};(extra[other.key]??=[]).push(h);
  }
 }
 delete f.topProfile;
 if(f.division){delete f.division.gola;delete f.division.cutHeight;}
}
export function doorControls(ui){
 const f=ui.fields.front,d=f?.division,box=ui.form;
 const preset=!f?'none':!d?f.swing:d.below==='pair'&&d.above==='pair'?'quad':'stack';
 ui.select(box,'Исполнение фасада',presets,preset,value=>selectPreset(ui,value));
 if(d)doorSettings(ui,f,box);
 if(f?.hinges){
  const keys=activeLeafKeys(f);
  for(const k of Object.keys(f.hinges))if(!keys.includes(k))delete f.hinges[k];
  if(!Object.keys(f.hinges).length){delete f.hinges;delete f.hingeDivider;}
 }
 if(f?.hingeDivider!=null&&f.hingeDivider>=ui.fields.sections-1)delete f.hingeDivider;
 if(ui.fields.doorFittings){
  const valid=new Set(activeLeafKeys(f));
  for(const key of Object.keys(ui.fields.doorFittings))if(!valid.has(key))delete ui.fields.doorFittings[key];
  if(!Object.keys(ui.fields.doorFittings).length)delete ui.fields.doorFittings;
 }
 const spec=formSpec(ui);
 let raw=[],rawBanks=[],choices=[];
 try{
  // Use uncut rectangles for picking an edge even while a previous choice is invalid.
  if(spec.drawerBanks?.some(b=>b?.layout))spec.drawerBanks=fitNicheBanks(spec,spec.drawerBanks);
  rawBanks=drawerSections(spec,sectionWidths(spec));
  const leaves=baseWardrobeDoors(spec,rawBanks);
  raw=[...leaves,...drawerFacades(spec,rawBanks)];
  if(f)cleanHandles(f,leaves);
  choices=raw;
  }catch{
  choices=[...activeLeafKeys(f).map(key=>({key,side:nominalSide(key),left:0,bottom:0,width:spec.width,height:spec.height})),...drawerFacades(spec,ui.previewBuilt?.drawerBanks??[])];
 }
 const leaf=choices.find(p=>p.key===ui.selectedDoor)||choices.find(p=>p.side===ui.selectedDoor)||choices[0];
 if(!leaf)return;
 ui.selectedDoor=leaf.key;
 const picker=el('div');box.append(picker);
 const panel=el('fieldset');panel.className='wardrobe-door-editor';panel.append(el('legend','Ручки на фасаде'));
 const doorSelect=ui.select(picker,'Выбранный фасад',choices.map(p=>[p.key,p.label??doorLabel(p.key)]),leaf.key,v=>{ui.selectedDoor=v;ui.inspectInternalFronts=!!choices.find(q=>q.key===v)?.internal;ui.render();});doorSelect.dataset.doorPicker='';
 if(f&&choices.some(q=>q.internal)){
  const inside=btn(ui.inspectInternalFronts?'Показать двери':'Показать внутренние шуфляды',()=>{ui.inspectInternalFronts=!ui.inspectInternalFronts;ui.selectedDoor=choices.find(q=>ui.inspectInternalFronts?q.internal:q.slot==null)?.key;ui.render();});
  inside.setAttribute('aria-pressed',String(!!ui.inspectInternalFronts));panel.append(inside);
 }
 const drawer=leaf.slot==null?null:ui.fields.drawerBanks[leaf.slot].faces[leaf.index];
 if(!drawer){
  const clearHandle=key=>{
   if(f.topProfile||f.division?.gola)localizeProfiles(f,choices,key);
   for(const field of ['handles','edgeProfiles'])if(f[field]){delete f[field][key];if(!Object.keys(f[field]).length)delete f[field];}
  };
  const current=hingeProduct(f,leaf.key);
  const type=ui.select(picker,'Тип фасада',[['board','Глухой фасад'],['Z1','Витрина · алюминиевая рамка Z1']],current.frame??'board',v=>{
   if(selectLeafFrame(f,leaf.key,v)){
    if(v==='Z1'&&ui.fields.doorFittings){delete ui.fields.doorFittings[leaf.key];if(!Object.keys(ui.fields.doorFittings).length)delete ui.fields.doorFittings;}
    ui.changed(true);return;
   }
   ui.output.textContent='Для рамки Z1 с TIP-ON есть накладная беспружинная петля. Выберите накладную посадку или открывание рукой.';
   type.value=current.frame??'board';
  });type.dataset.doorFrame='';
  doorFittingControls(ui,box,leaf,Boolean(current.frame));
  pushControls(ui,box,leaf,clearHandle);
  hingeControls(ui,box,spec,leaf,clearHandle);
  if(f.hinges?.[leaf.key]?.push){if(panel.querySelector('button'))box.append(panel.querySelector('button'));return;}
 }
 box.append(panel);
 const own=drawer?drawer.handle:f?.handles?.[leaf.key];
 const stored=!drawer?storedProfiles(f,leaf.key):[],inherited=stored[0];
 const supplemental=f?.edgeProfiles?.[leaf.key]??[],h=own??inherited??supplemental[0],edges=profileEdges(leaf,raw);
 const built=ui.previewBuilt,drawn=built?[...(built.doors??[]),...drawerFacades(spec,built.drawerBanks??[])]:[];
 function sharedProfile(key,edge){
  const r=drawn.find(p=>p.key===key);if(!r)return null;
  const y=r.bottom+(edge==='top'?r.height:0);
  return built.profiles?.find(p=>p.kind==='S'&&(p.inset??0)===(r.internal?21:0)&&p.left<r.left+r.width&&p.right>r.left&&
   Math.abs(y-(p.top-36.5+(edge==='top'?-15:15)))<.001);
 }
 function commonCut(edge,fallback=74){
  const run=sharedProfile(leaf.key,edge);
  return run?run.cutTop-run.cutBottom:fallback;
 }
 function changeCut(height){
  const run=sharedProfile(leaf.key,h.edge);
  if(run)for(const row of raw){
   const individual=row.slot==null?f?.handles?.[row.key]:ui.fields.drawerBanks[row.slot].faces[row.index].handle;
   for(const value of [individual,...(f?.edgeProfiles?.[row.key]??[])])if(value?.article==='118129'&&sharedProfile(row.key,value.edge)===run)value.cutHeight=height;
   if(row.slot==null&&f.division?.gola&&storedProfiles(f,row.key).some(v=>v.article==='118129'&&sharedProfile(row.key,v.edge)===run))f.division.cutHeight=height;
  }
  apply({...h,cutHeight:height});
 }
 const apply=value=>{
  if(!drawer&&(f.topProfile||f.division?.gola))localizeProfiles(f,raw,leaf.key);
  if(!drawer&&f.edgeProfiles){delete f.edgeProfiles[leaf.key];if(!Object.keys(f.edgeProfiles).length)delete f.edgeProfiles;}
  const target=drawer??(f.handles??={}),key=drawer?'handle':leaf.key;
  if(value)target[key]=value;else delete target[key];
  if(f?.handles&&!Object.keys(f.handles).length)delete f.handles;
  ui.changed(true);
 };
 function clearLine(line){
  if(line?.article==='118124')delete f.topProfile;
  if(line?.article==='118129'){delete f.division.gola;delete f.division.cutHeight;}
 }
 for(const line of stored){
  const old=el('div');old.className='wardrobe-stored-profile';
  old.append(el('span','Сохранённый общий профиль '+(line.article==='118124'?'Gola L':'Gola S')+' на этой линии.'),btn('Убрать общий профиль',()=>{clearLine(line);ui.changed(true);}));panel.append(old);
 }
 for(const line of supplemental){
  const old=el('div');old.className='wardrobe-stored-profile';
  old.append(el('span','Профиль '+(line.article==='118124'?'L':'S')+' · '+(line.edge==='top'?'сверху':'снизу')),
   btn('Снять с этой кромки',()=>{const extra=f.edgeProfiles;extra[leaf.key]=supplemental.filter(v=>v!==line);if(!extra[leaf.key].length)delete extra[leaf.key];if(!Object.keys(extra).length)delete f.edgeProfiles;ui.changed(true);}));panel.append(old);
 }
 function choose(family,article){
  if(own&&(own.article===article||familyOf(own)===family&&!doorHardware[article]?.model))return;
  if(family==='golaC'&&!edges.length){ui.output.textContent='Gola S устанавливается между двумя фасадами. Выберите шуфляду или дверь на общем стыке.';return;}
  let value=null;
  if(family==='golaL')value={article,edge:'top'};
  else if(family==='golaC'){
   const edge=edges.find(e=>sharedProfile(leaf.key,e))??edges[0];value={article,edge,cutHeight:commonCut(edge)};
  }
  else if(isEdgePull({article}))value={article,edge:drawer?'top':leaf.side==='left'?'right':'left'};
  else if(family!=='none'){
   value=isSurfacePull(doorHardware[own?.article])&&isSurfacePull(doorHardware[article])?{...own,article}:defaultHandle(leaf,article);
   try{handlePlacement(leaf,value);}catch(error){ui.output.textContent=error.message;return;}
  }
  apply(value);
 }
 familyCards(ui,panel,h,choose,edges,leaf.key,!drawer&&hingeProduct(f,leaf.key).frame);
 const none=btn('Без отдельной ручки',()=>choose('none'));none.dataset.handleFamily='none';none.setAttribute('aria-pressed',String(!h));none.className='wardrobe-handle-none';panel.append(none);
 if(h&&categories.find(([,label,ids])=>ids.includes(familyOf(h)))?.[0]===ui.handleCategory&&
    (ui.handleCategory!=='surface'||ui.bracketSeries===familyOf(h))){
  if(isFacadeProfile(h)){
   if(own){
    const positions=h.article==='118124'?['top']:[...new Set([...edges,h.edge])];
    ui.select(panel,'Линия установки профиля',positions.map(e=>[e,e==='top'?'Верхняя':'Нижняя']),h.edge,v=>apply(h.article==='118129'?{...h,edge:v,cutHeight:commonCut(v,h.cutHeight)}:{...h,edge:v})).dataset.handleEdge='';
    if(h.article==='118129')ui.select(panel,'Вырез в стойках под S',[[74,'27 × 74 мм · АКС'],[73,'27 × 73 мм · по кухонному модулю']],h.cutHeight??74,v=>changeCut(Number(v)));
   }
   panel.append(el('small',h.article==='118124'?'От верхней кромки фасада до верха профиля — 30 мм.':'Между кромками фасадов — 30 мм. На общем стыке устанавливается один профиль.'));
  }else if(isEdgePull(h)){
   const allowed=[['top','Верхняя'],['bottom','Нижняя'],['left','Левая'],['right','Правая']].filter(([v])=>drawer||v!==leaf.side);
   ui.select(panel,'Торец установки',allowed,h.edge,v=>apply({...h,edge:v})).dataset.handleEdge='';
   insetDetails(panel,h,leaf);
  }else{
   const product=doorHardware[h.article],surface=isSurfacePull(product);
   if(product.model){
    const selected=el('strong','На фасаде · '+product.model+' · '+product.finish+' · AKS '+h.article);
    selected.className='wardrobe-pull-selected';panel.append(selected);
   }else{
    const products=Object.entries(doorHardware).filter(([,p])=>p.family===familyOf(h)).sort(([,a],[,b])=>a.pitch-b.pitch);
    ui.select(panel,'Размер ручки',products.map(([article,p])=>[article,(surface?p.pitch:p.pitch+' / '+p.length)+' мм · '+article]),h.article,article=>apply({...h,article})).dataset.handleArticle='';
   }
   if(!surface)ui.select(panel,'Торец установки',[['left','Левая'],['right','Правая'],['top','Верхняя'],['bottom','Нижняя']].filter(([e])=>drawer||!usesProfileEdge(f,leaf.key,e)),h.edge,v=>apply({...h,edge:v})).dataset.handleEdge='';
   if(surface){
    const controls=el('div');controls.className='wardrobe-handle-axes';controls.setAttribute('role','group');controls.setAttribute('aria-label','Поворот ручки');
    for(const [axis,label] of [['vertical','Вертикально'],['horizontal','Горизонтально']]){
     const button=btn(label,()=>{try{apply(orientHandle(leaf,h,axis));}catch(error){ui.output.textContent=error.message;}});
     button.dataset.handleAxis=axis;button.setAttribute('aria-pressed',String(verticalEdge(h.edge)===(axis==='vertical')));controls.append(button);
    }
    panel.append(controls);
   }
   const upright=['left','right'].includes(h.edge);
   if(surface){
    const anchor=pullHeight(h);
    ui.select(panel,'По высоте фасада',[['center','По центру'],['bottom','От низа фасада'],['top','От верха фасада']],anchor,v=>apply(setPullHeight(h,v)));
    if(anchor!=='center')num(ui,panel,'От '+(anchor==='top'?'верха':'низа')+' до ближайшего отверстия, мм',upright?h.offset:h.inset,v=>{h[upright?'offset':'inset']=v;});
    if(upright){
     ui.select(panel,'По ширине фасада',[['left','От левого края'],['right','От правого края']],h.edge,v=>apply({...h,edge:v}));
     num(ui,panel,'До оси отверстий по ширине, мм',h.inset??50,v=>{h.inset=v;});
    }else{
     ui.select(panel,'По ширине фасада',[['center','По центру'],['start','От левого края'],['end','От правого края']],h.from,v=>apply({...h,from:v,offset:v==='center'?0:h.offset||50}));
     if(h.from!=='center')num(ui,panel,'До ближайшего отверстия по ширине, мм',h.offset??50,v=>{h.offset=v;});
    }
   }else{
    ui.select(panel,'Положение вдоль кромки',[['center','По центру'],['start',upright?'От низа':'От левого края'],['end',upright?'От верха':'От правого края']],h.from,v=>apply({...h,from:v}));
    if(h.from!=='center')num(ui,panel,'До торца ручки, мм',h.offset??0,v=>{h.offset=v;});
   }
  }
  const p=photosByArticle[h.article],source=el('a','АКС · арт. '+h.article);
  source.href=p.source_url;source.target='_blank';source.rel='noopener noreferrer';source.className='wardrobe-handle-source';panel.append(source);
  const pair=!drawer&&own&&raw.find(q=>q.slot==null&&q.side!==leaf.side&&q.key.replace(/(left|right)$/,'')===leaf.key.replace(/(left|right)$/,''));
  if(pair&&!f.hinges?.[pair.key]?.push&&(!hingeProduct(f,pair.key).frame||isFacadeProfile(h))){
   const mirror=btn('Зеркально на парную дверь',()=>{
    const placement=isFacadeProfile(h)?{...h}:mirrorHandle(h);
    if(isSurfacePull(doorHardware[h.article])){
     try{handlePlacement(pair,placement);}catch(error){ui.output.textContent=error.message;return;}
    }
    f.handles[pair.key]=placement;ui.changed(true);
   });
   mirror.dataset.handleMirror='';panel.append(mirror);
  }
 }
 if(!drawer&&!d&&f?.swing==='pair')panel.append(btn('Разделить выбранную дверь по полке',()=>{if(startDivision(ui,nominalSide(leaf.key),nominalSide(leaf.key),nominalSide(leaf.key)))ui.changed(true);}));
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
   const span=pos.vertical?leaf.height:leaf.width,along=pos.vertical?y:x,surface=isSurfacePull(pos.part);
   const center=Math.max(pos.part.length/2,Math.min(span-pos.part.length/2,along));
   if(h.from!=='center'||Math.abs(center-span/2)>.25){
    if(h.from==='center')h.from=center<span/2?'start':'end';
    const distance=h.from==='end'?span-center:center;
    h.offset=Math.round((distance-(surface?pos.part.pitch:pos.part.length)/2)*2)/2;
   }
   if(surface&&!(h.centerHeight&&Math.abs(y-leaf.height/2)<=.25)){
    if(h.centerHeight){delete h.centerHeight;h.edge=y<leaf.height/2?'bottom':'top';}
    const inset=h.edge==='left'?x:h.edge==='right'?leaf.width-x:h.edge==='top'?leaf.height-y:y;
    const margin=Math.max(6,pullHalfWidth(pos.part));
    h.inset=Math.max(margin,Math.min((pos.vertical?leaf.width:leaf.height)-margin,Math.round(inset*2)/2));
   }
   ui.invalidate();ui.draw();
  };
  const done=e=>{if(e.pointerId!==event.pointerId)return;host.removeEventListener('pointermove',move);host.removeEventListener('pointerup',done);host.removeEventListener('pointercancel',done);ui.selectedDoor=key;ui.suppressDiagramClick=true;ui.changed(true);setTimeout(()=>ui.suppressDiagramClick=false,0);};
  host.addEventListener('pointermove',move);host.addEventListener('pointerup',done);host.addEventListener('pointercancel',done);
 });
}


function insetDetails(panel,h,leaf){
 const product=doorHardware[h.article],photo=photosByArticle[h.article],edgeLength=verticalEdge(h.edge)?leaf.height:leaf.width;
 panel.append(el('small','Длина ручки '+edgeLength+' мм · фасад 18 мм · профиль занимает '+product.edgeRise+' мм от готового габарита.'));
 const install=el('details');install.className='wardrobe-handle-details';install.append(el('summary','Схема установки'));
 for(const [file,label] of [[photo.installation_file,'Посадка в фасад 18 мм'],[photo.section_file,'Чертёж профиля АКС']]){
  const fig=el('figure'),img=el('img');img.src='/account/planner/door-photos/'+file;img.alt=label+' · AKS '+h.article;img.loading='lazy';
  fig.append(img,el('figcaption',label));install.append(fig);
 }
 panel.append(install);
 const cut=gripCut(h);
 panel.append(el('p','Торцевой паз '+cut.grooveWidth.toLocaleString('ru-RU')+' × '+cut.grooveDepth.toLocaleString('ru-RU')+' мм · ось 9 мм. Торец под ручкой оклеен ПВХ 2 мм. Глубина паза указана от готового торца.'),el('small',h.grooveWidth!=null?'Сохранённая посадка этого фасада.':'Расчётная посадка. Перед серией проверьте на обрезке с этой ручкой.'));
}
