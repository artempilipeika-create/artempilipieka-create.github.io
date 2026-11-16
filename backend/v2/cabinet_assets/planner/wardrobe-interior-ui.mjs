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
 const datum=index?parts[index-1]?.item.elevation_mm+parts[index-1]?.item.height+offset:
   (drawing?.interiors?.[section]?.upper??fields.thickness)+(fields.elevation??0)+footHeight(fields);
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
