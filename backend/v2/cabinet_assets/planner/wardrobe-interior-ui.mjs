import {nicheOpenings,nicheSlot,trimBanks,mmText,coverClearance,frontEdgeGap,prepareDrawerCovers} from './wardrobe-niches.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {footHeight} from './plinth-options.mjs';

const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
function action(text,fn){
 const b=el('button',text);b.type='button';b.onclick=fn;return b;
}
function millimetres(parent,title,value,commit,{min=0,max=5000,step=1,refreshFields=false}={}){
 const label=el('label',title),input=el('input');
 input.type='number';input.step=String(step);input.min=String(min);input.max=String(max);
 input.value=value??'';input.setAttribute('aria-label',title);
 const read=()=>input.value===''?null:input.valueAsNumber;
 function apply(finish){
   if(!input.validity.valid)return;
   const fieldset=input.closest('.assistant-fields');
   commit(read(),finish);
   if(finish&&fieldset&&!input.isConnected){
     const next=[...fieldset.querySelectorAll('input')].find(node=>node.getAttribute('aria-label')===title);
     next?.focus({preventScroll:true});
   }
 }
 input.oninput=()=>apply(refreshFields);
 input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();if(input.reportValidity())apply(true);}};
 label.append(input);parent.append(label);return input;
}
export function selectShelf(ui,section,index){
 ui.activeSection=section;ui.levelIndex=index;ui.interior='shelf';ui.shelfScopes[section]=String(index);ui.step=2;ui.view='sections';ui.render();
 ui.form.querySelector('[data-shelf-height]')?.focus({preventScroll:true});
}
export function shelfLevelControls(ui,parent,section){
 const fields=ui.fields,count=fields.sectionShelves[section];
 if(!count)return;
 const index=Math.min(ui.levelIndex??0,count-1),box=el('fieldset');
 box.append(el('legend','Высота полки'));
 ui.select(box,'Положение полки',Array.from({length:count},(_,i)=>[i,'Полка '+(i+1)]),index,
   value=>selectShelf(ui,section,Number(value)));
 const existing=fields.shelfLevels?.[section]?.[index];
 const drawing=ui.previewBuilt;
 const parts=drawing?.parts?.filter(p=>p.key.startsWith('shelf-'+section+'-'))??[];
 const offset=fields.feet?.article==='118779'?10:0;
 const current=parts[index]?.item;
 const mode=ui.levelUnits?.[section+':'+index]??existing?.mode??'floor';
 const legacy=fields.drawerBanks?.[section]&&!fields.drawerBanks[section].layout;
 const below=legacy?(fields.drawerBanks[section].shelvesBelow??0):-1;
 const datum=index>0&&index!==below?parts[index-1]?.item.elevation_mm+parts[index-1]?.item.height+offset:
   (legacy&&index>=below?(drawing?.drawerBanks?.[section]?.top??fields.thickness):fields.thickness)+(fields.elevation??0)+footHeight(fields);
 const target=current?current.elevation_mm+offset:null;
 const measured=target==null?null:mode==='floor'?target:target-datum;
 ui.select(box,'Как задать высоту',[['floor','От пола до низа полки'],['gap','Чистый проём под полкой']],mode,value=>{
   ui.levelUnits??={};ui.levelUnits[section+':'+index]=value;ui.render();
 });
 const title=mode==='floor'?'От пола до низа полки, мм':'Чистый проём под полкой, мм';
 const input=millimetres(box,title,existing?.mode===mode?existing.mm:measured,value=>{
   if(value==null)return;
   const rows=fields.sectionShelves.map((n,s)=>Array.from({length:n},(_,i)=>fields.shelfLevels?.[s]?.[i]??null));
   // Keep the manager's other shelves in place when editing a single dimension.
   for(let i=0;i<count;i++)if(i!==index&&!rows[section][i]&&parts[i])
     rows[section][i]={mode:'floor',mm:parts[i].item.elevation_mm+offset};
   rows[section][index]={mode,mm:value};fields.shelfLevels=rows;ui.changed();
 },{min:mode==='gap'?60:0});
 input.dataset.shelfHeight='true';
 box.append(action('Расставить полки равномерно',()=>{
   if(fields.shelfLevels)fields.shelfLevels[section]=Array(count).fill(null);
   ui.changed();ui.render();
 }));parent.append(box);
}

function spacerDrawing(parent,bank,side){
 const depth=bank.rail.length,height=bank.span,scale=Math.min(232/depth,118/height);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 const points=[[0,0],[depth,0]];
 for(const [lo,hi] of bank.cuts?.[side]??[])points.push([depth,lo],[depth-60,lo],[depth-60,hi],[depth,hi]);
 points.push([depth,height],[0,height]);
 const polygon=document.createElementNS(svg.namespaceURI,'polygon');
 polygon.setAttribute('points',points.map(([z,y])=>[4+z*scale,4+(height-y)*scale].join(',')).join(' '));
 polygon.setAttribute('fill','#e6dcc9');polygon.setAttribute('stroke','#495b54');
 svg.setAttribute('viewBox','0 0 '+(8+depth*scale)+' '+(8+height*scale));svg.setAttribute('width',String(Math.ceil(8+scale*depth)));
 svg.setAttribute('role','img');svg.setAttribute('aria-label','Проставка, вид сбоку. Передний торец справа.');svg.append(polygon);parent.append(svg);
}
function legacyControls(ui,parent,section){
 const fields=ui.fields;
 const box=el('fieldset');box.append(el('legend','Шуфляды'));parent.append(box);
 const banks=trimBanks(fields.drawerBanks??[],fields.sections);
 let bank=banks[section];
 box.append(action('Рассчитать по выбранной нише',()=>installBank(ui,section,bank.shelvesBelow??0,{kind:bank.kind,layout:'equal',gap:3,faces:bank.faces.map(()=>({height:null}))},true)));
 function update(value,finished=true){
   bank=value;banks[section]=value;fields.drawerBanks=banks;ui.changed();
   if(finished)ui.render();
 }
 if(!bank){box.append(action('Добавить шуфляды',()=>update({kind:fields.front?'internal':'external',faces:[{height:197}]})));return;}
 ui.select(box,'Исполнение шуфляд',[['internal','Внутренние за дверью'],['external','Наружные фасады']],bank.kind,value=>update({...bank,kind:value}));
 millimetres(box,bank.kind==='internal'?'От верха дна шкафа до низа блока, мм':'Подъём блока от низа корпуса, мм',bank.bottomOffset??0,(n,finished)=>{
   if(n!=null)update({...bank,bottomOffset:n},finished);
 },{max:3000,refreshFields:true});
 if((bank.bottomOffset||bank.shelvesBelow)&&fields.sectionShelves[section]){
   ui.select(box,'Полок под блоком',Array.from({length:fields.sectionShelves[section]+1},(_,i)=>[i,String(i)]),bank.shelvesBelow??0,
     value=>update({...bank,shelvesBelow:Number(value)}));
 }
 function count(n,finished=true){
   if(!Number.isInteger(n)||n<1||n>24)return;
   update({...bank,faces:Array.from({length:n},(_,i)=>bank.faces[i]??{height:bank.faces.at(-1)?.height??197})},finished);
 }
 millimetres(box,'Количество шуфляд',bank.faces.length,count,{min:1,max:24,refreshFields:true});
 box.append(action('− Шуфляда',()=>count(bank.faces.length-1)),action('+ Шуфляда',()=>count(bank.faces.length+1)));
 const equal=bank.faces.every(f=>f.height!=null&&f.height===bank.faces[0].height);
 const every=millimetres(box,'Одинаковая высота всех фасадов, мм',equal?bank.faces[0].height:null,(n,finished)=>{
  if(n!=null)update({...bank,height:undefined,faces:bank.faces.map(f=>({...f,height:n}))},finished);
 },{min:100,max:3000});every.placeholder='Задать всем';
 box.append(el('p','Фасады пронумерованы снизу вверх. Между фасадами 3 мм.'));
 if(bank.faces.some(f=>f.height==null))millimetres(box,'Общая высота блока с зазорами, мм',bank.height,(n,finished)=>{if(n!=null)update({...bank,height:n},finished);},{min:103,max:3000});
 bank.faces.forEach((face,j)=>{
   const row=el('fieldset');row.append(el('legend','Фасад '+(j+1)));box.append(row);
   function replace(changes,finished){update({...bank,faces:bank.faces.map((f,k)=>k===j?{...f,...changes}:f)},finished);}
   millimetres(row,'Высота фасада '+(j+1)+', мм',face.height,(n,finished)=>{if(n!=null)replace({height:n},finished);},{min:100,max:3000});
   const width=millimetres(row,'Ширина фасада '+(j+1)+', мм',face.width,(n,finished)=>{
    const next={...bank.faces[j]};if(n==null)delete next.width;else next.width=n;
    update({...bank,faces:bank.faces.map((f,k)=>k===j?next:f)},finished);
   },{min:40,max:1200,step:.5});width.placeholder='По проёму';
   if(face.height!=null)row.append(action('Этот фасад по остатку',()=>{
     const heights=ui.previewBuilt?.drawerBanks?.[section]?.faces;
     const total=bank.height??bank.faces.reduce((sum,f)=>sum+(f.height??197)+3,0);
     update({...bank,height:total,faces:bank.faces.map((f,k)=>({...f,height:k===j?null:f.height??heights?.[k]?.height??197}))});
   }));
 });
 hardwareDetails(box,ui.previewBuilt?.drawerBanks?.[section]);
 box.append(action('Убрать блок шуфляд',()=>update(null)));
}

function hardwareDetails(box,current){
 if(current){
   const panel=el('details');panel.append(el('summary','Детали фурнитуры'));box.append(panel);box=panel;
   const photo=el('figure'),img=el('img');img.src='/account/planner/hardware-photos/114797.webp';img.alt='Фото направляющей PRIME by AKS Soft Close, 500 мм, арт. 114797';img.width=160;img.height=94;img.style.objectFit='contain';
   photo.append(img,el('figcaption','PRIME by AKS Soft Close · '+current.rail.length+' мм · арт. '+current.rail.article+(current.rail.length===500?'':' (фото серии: 500 мм, арт. 114797)')));box.append(photo);
   box.append(el('p','Короб '+(current.mountWidth-27)+' мм · зазор по 13,5 мм на сторону.'));
   for(const [side,has] of [['left',current.spacerL],['right',current.spacerR]]){
     if(!has)continue;
     spacerDrawing(box,current,side);
     const slots=current.cuts?.[side]?.length??0;
     box.append(el('p','Проставка '+(side==='left'?'слева':'справа')+' · 18 мм · '+(slots?'вырезов под петли: '+slots:'прямая')+'. Шуруп 5×30, сквозное Ø5 мм в проставке и намётка Ø5 × 1 мм в боковине. Общая глубина 19 мм.'));
   }
   if(current.internal&&!current.spacerL&&!current.spacerR)box.append(el('p','Направляющие крепятся прямо к стойкам.'));
 }
}

export function selectNiche(ui,section,level){
 ui.activeSection=section;ui.nicheIndex=level;ui.interior='drawer';ui.step=2;ui.view='sections';ui.render();
 ui.form.querySelector('[data-niche-count], [data-add-bank]')?.focus({preventScroll:true});
}

function freezeShelves(fields,section,built){
 const panels=built?.parts?.filter(p=>p.key.startsWith('shelf-'+section+'-'));
 const footCorrection=fields.feet?.article==='118779'?10:0;
 const openings=nicheOpenings({...fields,shelfLevels:undefined},section);
 fields.shelfLevels=fields.sectionShelves.map((n,i)=>Array.from({length:n},(_,j)=>fields.shelfLevels?.[i]?.[j]??null));
 const floor=(fields.elevation??0)+footHeight(fields);
 fields.shelfLevels[section]=fields.shelfLevels[section].map((entry,i)=>({
   mode:'floor',mm:panels?.[i]?panels[i].item.elevation_mm+footCorrection:entry?.mode==='floor'?entry.mm:openings[i].top+floor
 }));
}

function installBank(ui,section,level,template,convert=false){
 try{
   const f=structuredClone(ui.fields),banks=trimBanks(f.drawerBanks??[],f.sections),slot=nicheSlot(section,level);
   const legacy=banks[section]&&!banks[section].layout;
   if(legacy&&!convert)throw Error('Привяжите существующий блок целевой секции к нише перед копированием.');
   if(convert){freezeShelves(f,section,ui.previewBuilt);banks[section]=null;}
   if(level===f.sectionShelves[section]){
     if(level>=10)throw Error('В секции уже десять полок. Выберите нишу под существующей полкой.');
     freezeShelves(f,section,ui.previewBuilt);
     const room=nicheOpenings(f,section)[level],floor=(f.elevation??0)+footHeight(f);
     const y=Math.round((room.bottom+room.top-f.thickness)/2);
     f.sectionShelves[section]++;
     f.shelfLevels[section].push({mode:'floor',mm:y+floor});
     if(f.shelfChoices){f.shelfChoices[section]??=[];f.shelfChoices[section].push('board/95388');}
   }
   const opening=nicheOpenings(f,section)[level],kind=f.front?'internal':'external';
   const inside=kind==='internal',gap=inside?30:3;
   const usable=(inside?opening.top-opening.bottom-coverClearance-frontEdgeGap:opening.overlayTop-opening.overlayBottom-3);
   const count=Math.max(1,Math.min(3,Math.floor((usable+gap)/(100+gap))));
   banks[slot]=template?structuredClone(template):{kind,layout:'equal',gap,faces:Array.from({length:count},()=>({height:null}))};
   delete banks[slot].height;delete banks[slot].bottomOffset;delete banks[slot].shelvesBelow;
   f.drawerBanks=trimBanks(banks,f.sections);
   const prepared=wardrobeSpec(f);
   f.shelfChoices=prepared.shelfChoices;f.shelfLevels=prepared.shelfLevels;f.drawerBanks=prepared.drawerBanks;
   ui.fields=f;ui.activeSection=section;ui.nicheIndex=level;ui.interior='drawer';ui.changed(true);
 }catch(e){ui.output.textContent=e.message;}
}

function copyControls(ui,box,section,level){
 const f=ui.fields,options=[];
 for(let i=0;i<f.sections;i++)if(i!==section)for(let n=0;n<=f.sectionShelves[i];n++){
   const slot=nicheSlot(i,n);
   options.push([slot,'Секция '+(i+1)+' · ниша '+(n+1)+(f.drawerBanks?.[slot]?' · занята':'')]);
 }
 if(!options.length)return;
 const group=el('details');group.append(el('summary','Скопировать в другую секцию'));
 let target=options.find(([slot])=>Math.floor(slot/3)===level)?.[0]??options[0][0];
 const go=action('',()=>installBank(ui,target%3,Math.floor(target/3),f.drawerBanks[nicheSlot(section,level)]));
 const caption=()=>{go.textContent=f.drawerBanks?.[target]?'Заменить шуфляды в выбранной нише':'Скопировать шуфляды';};
 ui.select(group,'Куда скопировать',options,target,v=>{target=Number(v);caption();});
 caption();group.append(go);box.append(group);
}

export function drawerControls(ui,parent,section){
 const f=ui.fields,level=Math.min(ui.nicheIndex??0,f.sectionShelves[section]),slot=nicheSlot(section,level);
 const legacy=f.drawerBanks?.[section];
 if(legacy&&!legacy.layout){legacyControls(ui,parent,section);return;}
 const box=el('fieldset');box.className='niche-editor';box.append(el('legend','Шуфляды · ниша '+(level+1)));parent.append(box);
 const levels=Array.from({length:f.sectionShelves[section]+1},(_,i)=>[i,'Ниша '+(i+1)+(i===0?' · нижняя':'')]);
 if(levels.length>1)ui.select(box,'Ниша снизу вверх',levels,level,v=>selectNiche(ui,section,Number(v)));
 let bank=f.drawerBanks?.[slot];
 if(!bank){
   const add=action('Добавить шуфляды',()=>installBank(ui,section,level));add.dataset.addBank='';box.append(add);return;
 }
 function set(next,finished=true){
   if(bank?.kind==='internal'&&next?.kind!=='internal'&&f.thickness!==18&&f.shelfChoices?.[section]){
     f.shelfChoices[section][level]='board/95388';
   }
   const updateCover=next?.kind==='internal'&&(bank?.kind!==next.kind||next.coverFixing!==bank?.coverFixing);
   const banks=trimBanks(f.drawerBanks,f.sections);banks[slot]=next;f.drawerBanks=trimBanks(banks,f.sections);bank=next;
   if(updateCover){
     try{prepareDrawerCovers(f);}catch(e){ui.changed(finished);ui.output.textContent=e.message;return;}
   }
   ui.changed(finished);
 }
 const built=ui.previewBuilt?.drawerBanks?.[slot];
 const execution=ui.select(box,'Исполнение шуфляд',[['internal','Внутренние за дверью'],['external','Наружные фасады']],bank.kind,value=>{
   const next={...bank,kind:value};
   if(value==='external')delete next.coverFixing;
   set(next);
 });
 if(execution)execution.dataset.drawerKind='';
 if(bank.kind==='internal'){
   const existing=f.shelfChoices?.[section]?.[level];
   const fixing=bank.coverFixing??(existing==='board/confirmat'?'confirmat':'cam_dowel');
   ui.select(box,'Крепление полки над шуфлядами',[['cam_dowel','Эксцентрик + шкант'],['confirmat','Конфирматы 7×50']],fixing,value=>set({...bank,coverFixing:value}));
   box.append(el('small','От верха верхнего фасада до низа полки — 30 мм.'));
   if(!f.front)box.append(action('Выбрать распашные двери',()=>ui.go(3)));
 }
 const mode=el('div');mode.className='wardrobe-subsections';
 for(const [key,label] of [['equal','Одинаковые'],['manual','Разные']]){
   const b=action(label,()=>{
     if(key===bank.layout)return;
     const heights=ui.previewBuilt?.drawerBanks?.[slot]?.faces.map(p=>p.height)??[];
     set({...bank,layout:key,faces:bank.faces.map((face,i)=>({...face,height:key==='equal'||i===bank.faces.length-1?null:(heights[i]??face.height??100)}))});
   });b.setAttribute('aria-pressed',String(key===bank.layout));mode.append(b);
 }
 box.append(mode);
 const row=el('div');row.className='niche-inputs';box.append(row);
 const countInput=millimetres(row,'Количество шуфляд',bank.faces.length,(n,done)=>{
   if(!Number.isInteger(n)||n<1||n>24)return;
   const old=bank.faces;
   const faces=Array.from({length:n},(_,i)=>({...old[i],height:bank.layout==='equal'||i===n-1?null:(old[i]?.height??built?.faces[i]?.height??100)}));
   set({...bank,faces},done);
 },{min:1,max:24,refreshFields:true});countInput.required=true;countInput.dataset.nicheCount='';
 if(bank.faces.length>1){
   const gap=millimetres(row,'Зазор между фасадами, мм',bank.gap,(n,done)=>{if(n!=null)set({...bank,gap:n},done);},{max:3000,step:.001});gap.required=true;
 }
 if(bank.layout==='manual'){
   bank.faces.forEach((face,i)=>{
     if(i===bank.faces.length-1)return;
     const input=millimetres(box,'Высота фасада '+(i+1)+' снизу, мм',face.height,(n,done)=>{
       if(n!=null)set({...bank,faces:bank.faces.map((p,j)=>i===j?{...p,height:n}:p)},done);
     },{min:100,max:3000,step:.001});input.required=true;
   });
 }
 const result=el('p');result.className='niche-result';result.dataset.bankResult=String(slot);result.setAttribute('role','status');box.append(result);
 const settings=el('details');settings.append(el('summary','Ширина фасадов'));box.append(settings);
 bank.faces.forEach((face,i)=>{
   const input=millimetres(settings,'Ширина фасада '+(i+1)+', мм',face.width,(n,done)=>{
     const faces=bank.faces.map((p,j)=>{const item={...p};if(i===j){if(n==null)delete item.width;else item.width=n;}return item;});
     set({...bank,faces},done);
   },{min:40,max:1200,step:.5});input.placeholder='По проёму';
 });
 const hardware=el('div');hardware.dataset.nicheHardware='';box.append(hardware);
 copyControls(ui,box,section,level);
 box.append(action('Убрать блок шуфляд',()=>set(null)));
}

export function updateNicheResult(ui,built,error=''){
 if(ui.step!==2)return;
 const node=ui.form.querySelector('[data-bank-result]');if(!node)return;
 const slot=Number(node.dataset.bankResult),b=built?.drawerBanks?.[slot],bank=ui.fields.drawerBanks?.[slot];
 if(!b||!bank){node.textContent=error;return;}
 const hardware=ui.form.querySelector('[data-niche-hardware]');
 if(hardware){
   const signature=JSON.stringify([b.rail.article,b.mountWidth,b.span,b.internal,b.spacerL,b.spacerR,b.cuts]);
   if(hardware.dataset.signature!==signature){
     const open=hardware.querySelector('details')?.open;
     hardware.replaceChildren();hardwareDetails(hardware,b);hardware.dataset.signature=signature;
     if(open)hardware.querySelector('details').open=true;
   }
 }
 const height=bank.layout==='equal'?b.faces[0].height:b.faces.at(-1).height;
 node.textContent='Ниша '+mmText(b.span)+' мм · '+(bank.layout==='equal'?'Высота каждого фасада':'Верхний фасад по остатку')+' '+mmText(height)+' мм';
}
