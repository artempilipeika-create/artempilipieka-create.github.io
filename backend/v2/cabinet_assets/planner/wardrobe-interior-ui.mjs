import {splitAt,sectionOf,levelOf,openingBase} from './wardrobe-layout.mjs';
import {nicheOpenings,nicheSlot,trimBanks,mmText,coverClearance,frontEdgeGap,prepareDrawerCovers} from './wardrobe-niches.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {footHeight} from './plinth-options.mjs';
import {insertShelves,keysAfterInsertion} from './wardrobe-cells.mjs';
import {planRods} from './wardrobe-rods.mjs';
import {fittingCatalogue,planFitting} from './wardrobe-fittings.mjs';

import joinery from './prime-drawer-joinery.json' with {type:'json'};

const drawerExecutions=[['internal','Внутренние · вкладные фасады'],['external','Наружные фасады']];
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
 ui.activeSection=section;ui.gapIndex=index;ui.levelIndex=index;ui.interior='shelf';ui.shelfScopes[section]=String(index);ui.step=2;ui.view='sections';ui.render();
 ui.form.querySelector('[data-clear-gap]')?.focus({preventScroll:true});
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
function railControls(ui,box,bank,set){
 const concealed=bank.railFamily==='concealed';
 ui.select(box,'Направляющие',[['ball','Шариковые'],['concealed','Скрытый монтаж · PRIME by AKS']],concealed?'concealed':'ball',value=>{
  const next={...bank,railFamily:value};
  if(value==='concealed'){next.opening='soft';next.faceFixing='cam';}
  else{delete next.opening;delete next.faceFixing;}
  set(next);
 });
 if(!concealed)return;
 ui.select(box,'Открывание шуфляд',[['soft','Рукой · с доводчиком'],['push','Нажатием · Push to open']],bank.opening??'soft',value=>set({...bank,opening:value}));
 ui.select(box,'Крепление фасада',[['cam','Боковины и дно · эксцентрик + шкант'],['plank','Передняя планка · 3 шурупа, снизу эксцентрик + шкант']],bank.faceFixing??'cam',value=>set({...bank,faceFixing:value}));
}
function legacyControls(ui,parent,section){
 const fields=ui.fields;
 const box=el('fieldset');box.append(el('legend','Шуфляды'));parent.append(box);
 const banks=trimBanks(fields.drawerBanks??[],fields.sections);
 let bank=banks[nicheSlot(section,0)];
 box.append(action('Рассчитать по выбранной нише',()=>installBank(ui,section,bank.shelvesBelow??0,{...bank,shelvesBelow:undefined,kind:bank.kind,layout:'equal',gap:3,faces:bank.faces.map(face=>({...face,height:null}))},true)));
 function update(value,finished=true){
   bank=value;banks[nicheSlot(section,0)]=value;fields.drawerBanks=banks;ui.changed();
   if(finished)ui.render();
 }
 if(!bank){box.append(action('Добавить шуфляды',()=>update({kind:'internal',faces:[{height:197}]})));return;}
 railControls(ui,box,bank,update);
 ui.select(box,'Исполнение шуфляд',drawerExecutions,bank.kind,value=>update({...bank,kind:value}));
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
     const heights=ui.previewBuilt?.drawerBanks?.[nicheSlot(section,0)]?.faces;
     const total=bank.height??bank.faces.reduce((sum,f)=>sum+(f.height??197)+3,0);
     update({...bank,height:total,faces:bank.faces.map((f,k)=>({...f,height:k===j?null:f.height??heights?.[k]?.height??197}))});
   }));
 });
 hardwareDetails(box,ui.previewBuilt?.drawerBanks?.[nicheSlot(section,0)]);
 box.append(action('Убрать блок шуфляд',()=>update(null)));
}

function hardwareDetails(box,current){
 if(current){
   const panel=el('details');panel.append(el('summary','Детали фурнитуры'));box.append(panel);box=panel;
   const {rail}=current,hidden=rail.family==='concealed',push=rail.opening==='push';
   const sample=hidden?(push?'113663':'113647'):'114797',size=hidden?450:500;
   const title=hidden?'PRIME by AKS · скрытый монтаж · '+(push?'Push to open':'с доводчиком'):'PRIME by AKS · шариковые Soft Close';
   const photo=el('figure'),img=el('img');img.src='/account/planner/hardware-photos/'+sample+'.webp';img.alt=title+' · '+size+' мм · арт. '+sample;img.width=160;img.height=94;img.style.objectFit='contain';
   if(hidden){
    const link=el('a');link.href=rail.photoSource??'';link.target='_blank';link.rel='noopener noreferrer';
    if(link.href&&rail.photoSource){link.append(img);photo.append(link);}
   }
   photo.append(...(img.parentElement?[]:[img]),el('figcaption',title+' · '+rail.length+' мм · арт. '+rail.article+(rail.length===size?'':' (на фото '+size+' мм, арт. '+sample+')')));box.append(photo);
   box.append(el('p',hidden?'Короб '+(current.mountWidth-13)+' мм · боковины и дно ЛДСП 18 мм · боковой зазор 6,5 мм.':'Короб '+(current.mountWidth-27)+' мм · зазор по 13,5 мм на сторону.'));
   if(current.hingeSetback)box.append(el('p','Зазор от закрытой двери до фасадов шуфляд — 5 мм для прохода чашки петли.'));
   if(hidden)box.append(el('p','Задние эксцентрики затягиваются с тыльной стороны. На каждый задний угол ставится один эксцентрик со шкантом, с высоты стенки '+joinery.twoVerticalPairsFrom+' мм — два эксцентрика со шкантом посередине, с '+joinery.secondRearDowelFrom+' мм — два эксцентрика и два шканта. Дно крепится к фасаду на эксцентрик со шкантом в обоих исполнениях.'));
   for(const [side,has] of [['left',current.spacerL],['right',current.spacerR]]){
     if(!has)continue;
     spacerDrawing(box,current,side);
     const axes=current.hingeAxes?.[side]??[];
     if(axes.length)box.append(el('p','Оси петель от низа '+(side==='left'?'левой':'правой')+' проставки, мм — '+axes.map(mmText).join(', ')+'.'));
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
 const openings=nicheOpenings(fields,section);
 fields.shelfLevels=fields.sectionShelves.map((n,i)=>Array.from({length:n},(_,j)=>fields.shelfLevels?.[i]?.[j]??null));
 const floor=(fields.elevation??0)+footHeight(fields);
 fields.shelfLevels[section]=fields.shelfLevels[section].map((entry,i)=>({
   mode:'floor',mm:panels?.[i]?panels[i].item.elevation_mm+footCorrection:entry?.mode==='floor'?entry.mm:openings[i].top+floor
 }));
}

function coverForDrawers(f,section,level,requiredFaces,kind,occupied,rise){
 const room=nicheOpenings(f,section)[level],height=room.top-room.bottom,thickness=f.thickness;
 const minFaceSpace=requiredFaces*100+(requiredFaces-1)*(kind==='internal'?30:3)+(kind==='internal'?coverClearance+frontEdgeGap:3);
 let limit=room.top-60;
 for(const r of occupied.rods)limit=Math.min(limit,r.y+r.product.bounds[0]);
 for(const v of occupied.fittings){
   if(v.p.mount==='bottom')throw Error('Внизу этой ниши установлена гладильная доска. Перенесите её или выберите другую нишу.');
   limit=Math.min(limit,v.box[0][1]);
 }
 const min=Math.ceil(minFaceSpace+rise),max=Math.floor(limit-thickness-room.bottom);
 if(max<min)throw Error('Для установки под полкой требуется '+Math.ceil(minFaceSpace)+' мм в свету. Доступно '+Math.max(0,max-rise)+' мм. Выберите другую нишу, уменьшите количество шуфляд или поднимите наполнение.');
 const target=Math.round((height-thickness)/2);
 const belowHardware=occupied.rods.length||occupied.fittings.length;
 return Math.min(max,Math.max(min,belowHardware?Math.min(target,630+rise):target));
}

export function installBank(ui,section,level,template,convert=false,kind=template?.kind??'internal',options={}){
 try{
   const f=structuredClone(ui.fields),cell={section,level},zone=splitAt(f,section,level);
   const slot=nicheSlot(section,level,zone?.kind==='drawers'?ui.column??0:0),first=nicheSlot(section,0);
   const legacy=f.drawerBanks?.[first]&&!f.drawerBanks[first].layout;
   if(legacy&&!convert)throw Error('Привяжите существующий блок целевой секции к нише перед копированием.');
   if(convert){freezeShelves(f,section,ui.previewBuilt);f.drawerBanks[first]=null;}
   if(zone?.kind==='shelves'){
     if(!options.pair||!emptyDivider(f,zone))throw Error('Выберите свободную нишу для блока шуфляд.');
     f.nicheSplits=f.nicheSplits.filter(z=>z!==zone);
   }
   const sameOpening=r=>r.section===section&&r.level===level;
   if(options.replaceContents){
     for(const key of ['rods','fittings']){
       if(f[key])f[key]=f[key].filter(v=>!sameOpening(v));
       if(!f[key]?.length)delete f[key];
     }
   }
   const occupied={rods:planRods({...f,rods:(f.rods??[]).filter(sameOpening)}),
     fittings:(f.fittings??[]).filter(sameOpening).map(v=>planFitting(f,v))};
   const insert=level===f.sectionShelves[section]||occupied.rods.length>0||occupied.fittings.length>0;
   const rise=level===0&&f.bottomFit==='none'?openingBase({...f,drawerBanks:{[first]:true}},section)-openingBase(f,section):0;
   if(insert){
     const gap=coverForDrawers(f,section,level,options.count??template?.faces.length??1,kind,occupied,rise);
     insertShelves(f,cell,1,gap);
   }
   if(rise)freezeShelves(f,section,insert?null:ui.previewBuilt);
   const opening=nicheOpenings(f,section)[level];
   const inside=kind==='internal',gap=inside?30:3;
   const usable=(inside?opening.top-opening.bottom-coverClearance-frontEdgeGap:opening.overlayTop-opening.overlayBottom-3);
   const capacity=Math.floor((usable-rise+gap)/(100+gap));
   const count=options.count??Math.max(1,Math.min(3,capacity));
   if(!template&&count>capacity)throw Error('Секция '+(section+1)+', ниша '+(level+1)+'. Для выбранных шуфляд мало высоты. Помещается '+Math.max(0,capacity)+'.');
   const banks=trimBanks(f.drawerBanks??[],f.sections);
   banks[slot]=template?structuredClone(template):{kind,layout:'equal',gap,faces:Array.from({length:count},()=>({height:null}))};
   delete banks[slot].height;delete banks[slot].bottomOffset;delete banks[slot].shelvesBelow;
   if(options.pair){
     f.nicheSplits.push({kind:'drawers',section,level,edge:'open',...(zone.leftWidth!=null?{leftWidth:zone.leftWidth}:{})});
     banks[nicheSlot(section,level,1)]=structuredClone(banks[slot]);
   }
   f.drawerBanks=trimBanks(banks,f.sections);
   const prepared=wardrobeSpec(f);
   f.sectionShelves=prepared.sectionShelves;f.shelfChoices=prepared.shelfChoices;f.shelfLevels=prepared.shelfLevels;f.drawerBanks=prepared.drawerBanks;
   if(insert)ui.sourceKeys=keysAfterInsertion(ui.sourceKeys,cell,1);
   ui.fields=f;ui.activeSection=section;ui.nicheIndex=level;ui.interior='drawer';ui.changed(true);
 }catch(e){
   if(ui.interior==='cell'){ui.interior='drawer';ui.render();}
   ui.output.textContent=e.message;
   const note=ui.form?.querySelector('[data-drawer-feedback]');if(note)note.textContent=e.message;
 }
}

function emptyDivider(f,zone){
 const prefix='niche-'+zone.section+'-'+zone.level+'-';
 return zone.columns.every(c=>c.gaps.length===1&&!c.locks?.length)&&
   ![...(f.rods??[]),...(f.fittings??[])].some(v=>v.section===zone.section&&v.level===zone.level)&&
   ![...Object.keys(f.machining??{}),...Object.keys(f.lighting??{})].some(k=>k.startsWith(prefix)||k.startsWith('shelf-'+prefix));
}

function copyControls(ui,box,section,level){
 const f=ui.fields,options=[];
 for(let i=0;i<f.sections;i++)if(i!==section)for(let n=0;n<=f.sectionShelves[i];n++){
   const slot=nicheSlot(i,n);
   if(splitAt(f,i,n))continue;
   options.push([slot,'Секция '+(i+1)+' · ниша '+(n+1)+(f.drawerBanks?.[slot]?' · занята':'')]);
 }
 if(!options.length)return;
 const group=el('details');group.append(el('summary','Скопировать в другую секцию'));
 let target=options.find(([slot])=>levelOf(slot)===level)?.[0]??options[0][0];
 const go=action('',()=>installBank(ui,sectionOf(target),levelOf(target),f.drawerBanks[nicheSlot(section,level)]));
 const caption=()=>{go.textContent=f.drawerBanks?.[target]?'Заменить шуфляды в выбранной нише':'Скопировать шуфляды';};
 ui.select(group,'Куда скопировать',options,target,v=>{target=Number(v);caption();});
 caption();group.append(go);box.append(group);
}

export function drawerControls(ui,parent,section){
 const f=ui.fields,level=Math.min(ui.nicheIndex??0,f.sectionShelves[section]),zone=splitAt(f,section,level),shared=zone?.kind==='drawers';
 const slot=nicheSlot(section,level,shared?ui.column:0);
 const legacy=f.drawerBanks?.[nicheSlot(section,0)];
 if(legacy&&!legacy.layout){legacyControls(ui,parent,section);return;}
 const box=el('fieldset');box.className='niche-editor';box.append(el('legend','Шуфляды · секция '+(section+1)+' · ниша '+(level+1)));parent.append(box);
 const levels=Array.from({length:f.sectionShelves[section]+1},(_,i)=>[i,'Ниша '+(i+1)+(i===0?' · нижняя':'')]);
 if(levels.length>1)ui.select(box,'Ниша снизу вверх',levels,level,v=>selectNiche(ui,section,Number(v)));
 const pair=zone?.kind==='shelves';
 if(pair&&!emptyDivider(f,zone)){
   box.append(el('p','В этой нише перегородка с наполнением. Для двух блоков шуфляд с общей стойкой освободите обе колонки или выберите другую секцию.'),
     action('Настроить перегородку и полки',()=>{ui.interior='split';ui.render();}));return;
 }
 if(shared)ui.select(box,'Блок шуфляд',[['0','Левый блок'],['1','Правый блок']],ui.column??0,v=>{ui.column=Number(v);ui.render();});
 let bank=f.drawerBanks?.[slot];
 if(!bank){
   let kind='internal',count=null;
   ui.select(box,'Исполнение шуфляд',drawerExecutions,kind,value=>{kind=value;});
   ui.select(box,'Сколько шуфляд поставить',[['auto','По высоте ниши'],...[1,2,3,4].map(n=>[n,String(n)])],'auto',value=>{count=value==='auto'?null:Number(value);});
   const note=el('p');note.dataset.drawerFeedback='';note.setAttribute('role','status');
   const add=action(pair?'Поставить шуфляды слева и справа':'Добавить шуфляды',()=>installBank(ui,section,level,null,false,kind,{count,pair}));add.dataset.addBank='';
   box.append(add,note);
   const occupied=[...(f.rods??[]),...(f.fittings??[])].filter(v=>v.section===section&&v.level===level);
   if(occupied.length){
     const replace=el('details');replace.append(el('summary','Заменить наполнение этой ниши шуфлядами'));
     const names=occupied.map(v=>v.variant?fittingCatalogue[v.variant].name:'Штанга AKS '+v.article);
     replace.append(el('p','Будут сняты из ниши '+(level+1)+' секции '+(section+1)+' — '+names.join(', ')+'.'),
       action('Заменить перечисленное шуфлядами',()=>installBank(ui,section,level,null,false,kind,{count,replaceContents:true})));
     box.append(replace);
   }
   return;
 }
 function set(next,finished=true){
   if(bank?.kind==='internal'&&next?.kind!=='internal'&&f.thickness!==18&&f.shelfChoices?.[section]){
     f.shelfChoices[section][level]='board/95388';
   }
   const updateCover=next?.kind==='internal'&&(bank?.kind!==next.kind||next.coverFixing!==bank?.coverFixing);
   const banks=trimBanks(f.drawerBanks,f.sections);banks[slot]=next;f.drawerBanks=trimBanks(banks,f.sections);bank=next;
   if(shared&&next&&f.drawerBanks[nicheSlot(section,level,ui.column===1?0:1)]){
     const other=f.drawerBanks[nicheSlot(section,level,ui.column===1?0:1)];
     other.kind=next.kind;if(next.kind==='external')delete other.coverFixing;
   }
   if(updateCover){
     try{prepareDrawerCovers(f);}catch(e){ui.changed(finished);ui.output.textContent=e.message;return;}
   }
   ui.changed(finished);
 }
 const built=ui.previewBuilt?.drawerBanks?.[slot];
 const execution=ui.select(box,'Исполнение шуфляд',drawerExecutions,bank.kind,value=>{
   const next={...bank,kind:value};
   if(value==='external')delete next.coverFixing;
   set(next);
 });
 if(execution)execution.dataset.drawerKind='';
 railControls(ui,box,bank,set);
 if(bank.kind==='internal'){
   box.append(el('small','Полки у шуфляд · '+(f.drawerFixing==='confirmat'?'конфирматы':'эксцентрик + шкант')));
   box.append(el('small','От верха верхнего фасада до низа полки — 30 мм.'));
   if(!f.front)box.append(el('small','В открытом шкафу направляющие крепятся к стойкам. При выборе двери проставка появится со стороны петель.'));
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
 if(!shared){copyControls(ui,box,section,level);box.append(action('Убрать блок шуфляд',()=>set(null)));}
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
 node.textContent='Ниша '+mmText(b.span)+' мм · '+(bank.layout==='equal'?'Высота каждого фасада':'Верхний фасад по остатку')+' '+mmText(height)+' мм'+(b.rail.family==='concealed'?' · PRIME '+b.rail.length+' мм · арт. '+b.rail.article:'');
}
