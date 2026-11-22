import {cellGeometry,insertShelves,keysAfterInsertion,setClearHeight} from './wardrobe-cells.mjs';
import {sectionOf} from './wardrobe-layout.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {newRod,planRods,rodCatalogue,rodLimits,rodRoom,rodWarnings,sameRodCell} from './wardrobe-rods.mjs';

const schemes=[
 {id:'long',name:'Длинная одежда',description:'Верхняя полка и штанга под ней'},
 {id:'shirts',name:'Рубашки в два яруса',description:'Две штанги на разной высоте'}
];

function existingContents(fields,section){
 const splits=(fields.nicheSplits??[]).filter(z=>z.section===section);
 const shelves=fields.sectionShelves[section]+splits.reduce((sum,z)=>
   sum+(z.columns??[]).reduce((n,c)=>n+c.gaps.length-1,0),0);
 const drawers=(fields.drawerBanks??[]).reduce((n,bank,slot)=>
   n+(bank&&sectionOf(slot)===section?bank.faces.length:0),0);
 const rods=(fields.rods??[]).filter(r=>r.section===section).length;
 return [[shelves,'полок'],[rods,'штанг'],[drawers,'шуфляд'],[splits.length,'перегородок']]
   .filter(([count])=>count).map(([count,label])=>label+' — '+count).join(', ');
}

// Stagger only the new holders when rails meet on opposite faces of a divider.
function addRod(fields,rod,room,placed){
 const limit=rodLimits(room,rod.article,rod.anchor),center=room.usableDepth/2;
 for(const shift of [0,8,-8,16,-16]){
   const depth=shift?Math.round(center)+shift:center;
   if(depth<limit.near||depth>limit.far)continue;
   const candidate=shift?{...rod,fromBack:depth}:rod;
   const [fitted]=planRods({...fields,rods:[candidate]});
   if(placed.some(other=>rodWarnings([other,fitted],fields.thickness).length))continue;
   fields.rods.push(candidate);placed.push(fitted);return;
 }
 throw Error('Держатели штанг пересекаются. Измените положение соседней штанги или выберите другую нишу.');
}

export function prepareSectionPreset(fields,cell,scheme,sourceKeys=null,replaceRods=false){
 if(!schemes.some(s=>s.id===scheme))throw Error('Выберите схему наполнения.');
 const draft=structuredClone(fields);
 rodRoom(draft,cell);
 const previous=draft.rods??[];
 if(!replaceRods&&previous.some(r=>sameRodCell(r,cell)))throw Error('В выбранной нише уже установлены штанги.');
 draft.rods=previous.filter(r=>!sameRodCell(r,cell));
 const rodCount=scheme==='shirts'?2:1;
 if(draft.rods.length+rodCount>128)throw Error('В шкафу может быть до 128 штанг.');
 let keys=sourceKeys;
 const geometry=cellGeometry(draft,cell);
 const hasShelfAbove=geometry.index<geometry.sizes.length-1||cell.level<draft.sectionShelves[cell.section];
 if(scheme==='long'&&!hasShelfAbove){
   insertShelves(draft,cell,1);
   const {sizes,index}=cellGeometry(draft,cell);
   const clear=sizes[index]+sizes[index+1];
   const upper=Math.max(60,Math.min(300,Math.round(clear*0.16)));
   setClearHeight(draft,cell,clear-upper);
   keys=keysAfterInsertion(keys,cell,1);
 }
 const room=rodRoom(draft,cell),top=newRod(cell,room);
 const placed=planRods(draft);
 addRod(draft,top,room,placed);
 if(scheme==='shirts'){
   const below=room.high-room.low-top.offset;
   const lower={...newRod(cell,room),anchor:'bottom',offset:Math.round(below/2)};
   const [minY,maxY]=rodCatalogue[top.article].bounds;
   if(below-lower.offset<maxY-minY)throw Error('В этой нише недостаточно высоты для двух ярусов штанг.');
   addRod(draft,lower,room,placed);
 }
 wardrobeSpec(draft);
 return {fields:draft,keys,rodId:top.id};
}

const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
const button=(label,run)=>Object.assign(el('button',label),{type:'button',onclick:run});

function diagram(scheme){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 60 76');svg.setAttribute('aria-hidden','true');
 function path(d,style){
   const p=document.createElementNS(ns,'path');p.setAttribute('d',d);p.setAttribute('class',style);svg.append(p);
 }
 path('M8 3h44v70H8z','preset-case');
 if(scheme==='long')path('M9 17h42','preset-shelf');
 for(const y of scheme==='long'?[24]:[11,43]){
   path('M12 '+y+'h36','preset-rail');
   for(const x of [22,38]){
     path('M'+x+' '+y+'v4l-6 4 -2 5 3 1 2-3 v'+(scheme==='long'?24:12)+' h6 v-'+(scheme==='long'?24:12)+' l2 3 3-1 -2-5 -6-4','preset-garment');
   }
 }
 return svg;
}

export function sectionPresetControls(ui,parent,cell){
 const wrap=el('div');wrap.className='section-presets';
 const panel=el('div');panel.id='wardrobe-section-presets';panel.hidden=true;
 const trigger=button('Заполнить секцию',()=>{
   panel.hidden=!panel.hidden;trigger.setAttribute('aria-expanded',String(!panel.hidden));
 });
 trigger.setAttribute('aria-controls',panel.id);trigger.setAttribute('aria-expanded','false');
 const summary=existingContents(ui.fields,cell.section),section=cell.section+1;
 if(summary){
   const place='ниша '+(cell.level+1)+(cell.column==null?'':(cell.column?' справа':' слева')+', проём '+(cell.opening+1));
   panel.append(el('p','В секции '+section+' '+summary+'. Для схемы выбрана '+place+'.'));
 }
 const cards=el('div');cards.className='section-preset-cards';
 const feedback=el('div');feedback.setAttribute('role','status');
 function apply(scheme,replace=false){
   try{
     const result=prepareSectionPreset(ui.fields,cell,scheme.id,ui.sourceKeys,replace);
     ui.fields=result.fields;ui.sourceKeys=result.keys;ui.rodId=result.rodId;ui.rodDraft=null;
     delete ui.shelfScopes[cell.section];delete ui.shelfDrafts[cell.section];
     ui.interior='rod';ui.changed(true);
     ui.output.textContent='Схема «'+scheme.name+'» применена к секции '+section+'.';
     ui.form.querySelector('.section-presets > button')?.focus({preventScroll:true});
   }catch(error){feedback.textContent=error.message;}
 }
 for(const scheme of schemes){
   const select=button('',()=>{
     const rods=ui.fields.rods?.filter(r=>sameRodCell(r,cell))??[];
     if(!rods.length){apply(scheme);return;}
     const confirm=button('Заменить штанги в этой нише',()=>apply(scheme,true));
     feedback.replaceChildren(el('p','Установлено штанг в выбранной нише — '+rods.length+'. Заменить их по схеме «'+scheme.name+'»?'),
       confirm,button('Оставить',()=>{feedback.replaceChildren();select.focus();}));
     confirm.focus();
   });
   select.setAttribute('aria-label',scheme.name);select.append(diagram(scheme.id),el('strong',scheme.name),el('small',scheme.description));cards.append(select);
 }
 panel.append(cards,feedback);wrap.append(trigger,panel);parent.append(wrap);
}
