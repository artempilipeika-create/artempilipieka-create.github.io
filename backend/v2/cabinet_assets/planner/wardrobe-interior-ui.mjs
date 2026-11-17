import {footHeight} from './plinth-options.mjs';

const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
function action(text,fn){
 const b=el('button',text);b.type='button';b.onclick=fn;return b;
}
function millimetres(parent,title,value,commit,{min=0,max=5000,step=1}={}){
 const label=el('label',title),input=el('input');
 input.type='number';input.step=String(step);input.min=String(min);input.max=String(max);
 input.value=value??'';input.setAttribute('aria-label',title);
 input.onchange=()=>{if(input.reportValidity())commit(input.value===''?null:input.valueAsNumber);};
 label.append(input);parent.append(label);return input;
}
export function selectShelf(ui,section,index){
 ui.activeSection=section;ui.levelIndex=index;ui.step=2;ui.view='sections';ui.render();
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
 const below=fields.drawerBanks?.[section]?.shelvesBelow??0;
 const datum=index>0&&index!==below?parts[index-1]?.item.elevation_mm+parts[index-1]?.item.height+offset:
   (index<below?fields.thickness:drawing?.drawerBanks?.[section]?.top??fields.thickness)+(fields.elevation??0)+footHeight(fields);
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
export function drawerControls(ui,parent,section){
 const fields=ui.fields;
 const box=el('fieldset');box.append(el('legend','Шуфляды'));parent.append(box);
 const banks=Array.from({length:fields.sections},(_,i)=>fields.drawerBanks?.[i]??null);
 const bank=banks[section];
 function update(value){banks[section]=value;fields.drawerBanks=banks;ui.changed();ui.render();}
 if(!bank){box.append(action('Добавить шуфляды',()=>update({kind:fields.front?'internal':'external',faces:[{height:197}]})));return;}
 ui.select(box,'Исполнение шуфляд',[['internal','Внутренние за дверью'],['external','Наружные фасады']],bank.kind,value=>update({...bank,kind:value}));
 millimetres(box,bank.kind==='internal'?'От верха дна шкафа до низа блока, мм':'Подъём блока от низа корпуса, мм',bank.bottomOffset??0,n=>{
   if(n!=null)update({...bank,bottomOffset:n});
 },{max:3000});
 if((bank.bottomOffset||bank.shelvesBelow)&&fields.sectionShelves[section]){
   ui.select(box,'Полок под блоком',Array.from({length:fields.sectionShelves[section]+1},(_,i)=>[i,String(i)]),bank.shelvesBelow??0,
     value=>update({...bank,shelvesBelow:Number(value)}));
 }
 function count(n){
   if(!Number.isInteger(n)||n<1||n>24)return;
   update({...bank,faces:Array.from({length:n},(_,i)=>bank.faces[i]??{height:bank.faces.at(-1)?.height??197})});
 }
 millimetres(box,'Количество шуфляд',bank.faces.length,count,{min:1,max:24});
 box.append(action('− Шуфляда',()=>count(bank.faces.length-1)),action('+ Шуфляда',()=>count(bank.faces.length+1)));
 const equal=bank.faces.every(f=>f.height!=null&&f.height===bank.faces[0].height);
 const every=millimetres(box,'Одинаковая высота всех фасадов, мм',equal?bank.faces[0].height:null,n=>{
  if(n!=null)update({...bank,height:undefined,faces:bank.faces.map(f=>({...f,height:n}))});
 },{min:100,max:3000});every.placeholder='Задать всем';
 box.append(el('p','Фасады пронумерованы снизу вверх. Между фасадами 3 мм.'));
 if(bank.faces.some(f=>f.height==null))millimetres(box,'Общая высота блока с зазорами, мм',bank.height,n=>{if(n!=null)update({...bank,height:n});},{min:103,max:3000});
 bank.faces.forEach((face,j)=>{
   const row=el('fieldset');row.append(el('legend','Фасад '+(j+1)));box.append(row);
   function replace(changes){update({...bank,faces:bank.faces.map((f,k)=>k===j?{...f,...changes}:f)});}
   millimetres(row,'Высота фасада '+(j+1)+', мм',face.height,n=>{if(n!=null)replace({height:n});},{min:100,max:3000});
   const width=millimetres(row,'Ширина фасада '+(j+1)+', мм',face.width,n=>{
    const next={...face};if(n==null)delete next.width;else next.width=n;
    update({...bank,faces:bank.faces.map((f,k)=>k===j?next:f)});
   },{min:40,max:1200,step:.5});width.placeholder='По проёму';
   if(face.height!=null)row.append(action('Этот фасад по остатку',()=>{
     const heights=ui.previewBuilt?.drawerBanks?.[section]?.faces;
     const total=bank.height??bank.faces.reduce((sum,f)=>sum+(f.height??197)+3,0);
     update({...bank,height:total,faces:bank.faces.map((f,k)=>({...f,height:k===j?null:f.height??heights?.[k]?.height??197}))});
   }));
 });
 const current=ui.previewBuilt?.drawerBanks?.[section];
 if(current){
   const photo=el('figure'),img=el('img');img.src='/account/planner/hardware-photos/114797.webp';img.alt='Фото направляющей PRIME by AKS Soft Close, 500 мм, арт. 114797';img.width=160;img.height=94;img.style.objectFit='contain';
   photo.append(img,el('figcaption','PRIME by AKS Soft Close · '+current.rail.length+' мм · арт. '+current.rail.article+(current.rail.length===500?'':' (фото серии: 500 мм, арт. 114797)')));box.append(photo);
   box.append(el('p','Короб '+(current.mountWidth-27)+' мм · зазор по 13,5 мм на сторону.'));
   for(const [side,has] of [['left',current.spacerL],['right',current.spacerR]]){
     if(!has)continue;
     spacerDrawing(box,current,side);
     const slots=current.cuts?.[side]?.length??0;
     box.append(el('p','Проставка '+(side==='left'?'слева':'справа')+' · 18 мм · '+(slots?'вырезов под петли: '+slots:'прямая')+'. Шуруп 5×30, наметка в стойке Ø3,5 × 5 мм.'));
   }
   if(current.internal&&fields.front?.offset===90&&ui.previewBuilt.drawerIssues.some(s=>s.startsWith('Секция '+(section+1)+','))){
     box.append(action('Поставить петли с отступом 130 мм',()=>{fields.front={...fields.front,offset:130};ui.changed();ui.render();}));
   }
   if(current.internal&&!current.spacerL&&!current.spacerR)box.append(el('p','Направляющие крепятся прямо к стойкам.'));
 }
 box.append(action('Убрать блок шуфляд',()=>update(null)));
}
