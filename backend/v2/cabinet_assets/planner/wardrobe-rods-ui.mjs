import photos from './rod-photos/sources.json' with {type:'json'};
import {newRod,planRods,rodCatalogue,rodFinish,rodLabel,rodLimits,rodRoom,sameRodCell} from './wardrobe-rods.mjs';
import {fittingControls} from './wardrobe-fitting-ui.mjs';
import {fittingCatalogue,planFitting,touchingStandardRod} from './wardrobe-fittings.mjs';

const el=(tag,text)=>Object.assign(document.createElement(tag),{textContent:text??''});
const button=(text,run)=>Object.assign(el('button',text),{type:'button',onclick:run});
const groupNames={round:'Круглая Ø25',oval:'Овальная 30×15'};
const order=['22109','72536','22111','113181','23007','57975','14066'];
function fit(value,min,max){return Math.min(max,Math.max(min,value));}
function checkPlacement(fields,rod,levels){
 const planned=planRods({...fields,rods:[rod]},levels);
 const inCell=(fields.fittings??[]).filter(v=>sameRodCell(v,rod)&&fittingCatalogue[v.variant].category==='rods');
 if(inCell.some(v=>touchingStandardRod(planFitting(fields,v,levels),planned)))throw Error('Штанга пересекается с FAME. Измените высоту или положение по глубине.');
}
export function rodControls(ui,parent,cell){
 const f=ui.fields;
 const box=el('fieldset');box.className='rod-editor';
 box.append(el('legend','Штанги · секция '+(cell.section+1)+' · ниша '+(cell.level+1)+(cell.column!=null?' · '+(cell.column?'справа':'слева')+' · проём '+(cell.opening+1):'')));parent.append(box);
 let room;
 try{room=rodRoom(f,cell,ui.previewBuilt?.installedLevels);}catch(e){box.append(el('p',e.message));return;}
 const list=(f.rods??[]).filter(r=>sameRodCell(r,cell));
 const fitted=(f.fittings??[]).filter(v=>sameRodCell(v,cell)&&fittingCatalogue[v.variant].category==='rods');
 const saved=list.find(r=>r.id===ui.rodId)??list[0];
 if(!ui.rodDraft||!sameRodCell(ui.rodDraft,cell))ui.rodDraft=newRod(cell,room);
 const rod=saved??ui.rodDraft;
 ui.rodId=saved?.id??null;
 const height=room.high-room.low;
 box.append(el('p','Внутри '+room.width+' × '+height+' мм · ширина × высота'));
 const message=el('p');message.className='rod-message';message.setAttribute('role','status');
 const edit=(delta)=>{
   const candidate={...rod,...delta};if(candidate.fromBack==null)delete candidate.fromBack;
   try{if(saved)checkPlacement(f,candidate,ui.previewBuilt?.installedLevels);else planRods({...f,rods:[candidate]},ui.previewBuilt?.installedLevels);}
   catch(e){message.textContent=e.message;return;}
   if(saved){f.rods=f.rods.map(r=>r.id===candidate.id?candidate:r);ui.changed(true);}
   else{ui.rodDraft=candidate;ui.render();}
 };
 const family=rodCatalogue[rod.article].family;
 const families=el('div');families.className='rod-families';
 const fame=ui.rodFamily==='fame'||(!ui.rodFamily&&!saved&&fitted.length>0);
 for(const [key,name] of Object.entries(groupNames)){
   const example=family===key?rod.article:key==='round'?'22109':'57975';
   const p=photos[example],img=el('img');
   img.src='/account/planner/rod-photos/'+p.file;img.alt=name+' · '+rodFinish[rodCatalogue[example].finish]+' · AKS '+example;
   const b=button('',()=>{ui.rodFamily='classic';if(key!==family)edit({article:example});else if(fame)ui.render();});
   b.append(img,el('strong',name+' мм'),el('small',rodFinish[rodCatalogue[example].finish]+' · арт. '+example));
   b.setAttribute('aria-pressed',String(!fame&&key===family));families.append(b);
 }
 const shown=fittingCatalogue[(fitted.find(v=>v.id===ui.fameId)??fitted[0])?.variant??'113750-side'];
 const fameButton=button('',()=>{ui.rodFamily='fame';ui.render();});fameButton.setAttribute('aria-label','Прямоугольная FAME');
 const picture=el('img');picture.src='/account/planner/wardrobe-fitting-photos/'+shown.photo+'.webp';picture.alt='';
 fameButton.append(picture,el('strong','Прямоугольная FAME'),el('small',shown.name.split(' · ')[0].replace('Штанга FAME ','')+' · арт. '+shown.article));
 fameButton.setAttribute('aria-pressed',String(Boolean(fame)));families.append(fameButton);
 box.append(families);
 if(fame){fittingControls(ui,box,cell,true);return;}
 if(list.length>1)ui.select(box,'Штанга в нише',list.map((r,i)=>[r.id,'Штанга '+(i+1)+' · '+r.offset+' мм '+(r.anchor==='top'?'от верха':'от низа')]),rod.id,v=>{ui.rodId=v;ui.render();});
 ui.select(box,'Исполнение штанги AKS',order.filter(id=>rodCatalogue[id].family===family).map(id=>[id,rodFinish[rodCatalogue[id].finish]+' · '+String(rodCatalogue[id].wallMm).replace('.',',')+' мм · '+id]),rod.article,v=>edit({article:v}));
 const src=el('a','Фото поставщика · AKS '+rod.article+' ↗');src.href=photos[rod.article].source;src.target='_blank';src.rel='noopener noreferrer';src.className='rod-source';box.append(src);
 const pos=el('div');pos.className='rod-position';
 ui.select(pos,'Отсчёт до оси',[['top','От верха ниши'],['bottom','От низа ниши']],rod.anchor,v=>edit({anchor:v,offset:height-rod.offset}));
 function numeric(parent,label,initial,min,max,save){
   const wrap=el('label',label),input=el('input');Object.assign(input,{type:'number',inputMode:'numeric',step:1,value:initial,min,max});
   input.setAttribute('aria-label',label);input.onchange=()=>save(input.valueAsNumber);
   input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}};wrap.append(input);parent.append(wrap);return input;
 }
 const limit=rodLimits(room,rod.article,rod.anchor);
 numeric(pos,'Размер до оси, мм',rod.offset,limit.min,limit.max,v=>edit({offset:v})).dataset.rodOffset='';
 box.append(pos,el('small','До противоположной границы ниши · '+(height-rod.offset)+' мм'));
 const depth=el('details');depth.append(el('summary','Положение по глубине'));
 const auto=el('label'),check=el('input');check.type='checkbox';check.checked=rod.fromBack==null;
 check.onchange=()=>edit({fromBack:check.checked?null:Math.round(room.usableDepth/2)});
 auto.append(check,document.createTextNode('По центру глубины'));depth.append(auto);
 if(rod.fromBack==null)depth.append(el('small','До оси от заднего края внутри · '+(room.usableDepth/2)+' мм'));
 else numeric(depth,'От заднего края внутри, мм',rod.fromBack,limit.near,limit.far,v=>edit({fromBack:v}));
 box.append(depth);
 if(f.depth<500){
   const hint=el('p','Глубина корпуса '+f.depth+' мм. Для плечиков предусмотрено от 500 мм. Проверьте, закроется ли фасад.');
   hint.className='rod-warning';hint.setAttribute('role','status');box.append(hint);
 }
 const actions=el('div');actions.className='rod-actions';
 actions.append(button(saved?'Ещё штангу':'Добавить штангу',()=>{
   if((f.rods?.length??0)>=128){message.textContent='В шкафу уже 128 штанг.';return;}
   const next={...rod,id:crypto.randomUUID()};
   if(saved){
     const axes=list.map(r=>r.anchor==='top'?room.high-r.offset:room.low+r.offset).sort((a,b)=>a-b),edges=[room.low,...axes,room.high];
     let widest=-1,axis=0;
     for(let i=1;i<edges.length;i++)if(edges[i]-edges[i-1]>widest){widest=edges[i]-edges[i-1];axis=(edges[i]+edges[i-1])/2;}
     next.offset=Math.round(next.anchor==='top'?room.high-axis:axis-room.low);
   }
   try{checkPlacement(f,next,ui.previewBuilt?.installedLevels);}catch(e){message.textContent=e.message;return;}
   (f.rods??=[]).push(next);ui.rodId=next.id;ui.changed(true);
 }));
 if(saved)actions.append(button('Убрать штангу',()=>{
   f.rods=f.rods.filter(r=>r.id!==rod.id);if(!f.rods.length)delete f.rods;
   ui.rodId=null;ui.rodDraft=null;ui.changed(true);
 }));
 box.append(el('small','В комплекте два держателя. Труба в размер · '+(room.width-rodCatalogue[rod.article].cutAllowance)+' мм.'),actions,message);
 const issues=el('p');issues.className='rod-warning';issues.dataset.rodIssues='';issues.hidden=true;box.append(issues);
}

export function selectRod(ui,id){
 const r=ui.fields.rods?.find(r=>r.id===id);if(!r)return;
 ui.zoomDiagram(false);ui.activeSection=r.section;ui.nicheIndex=r.level;ui.column=r.column??0;
 ui.gapIndex=r.column==null?r.level:r.opening;ui.rodId=id;ui.rodFamily='classic';ui.interior='rod';ui.step=2;ui.view='sections';ui.render();
}
export function wireRodDrag(ui){
 const root=ui.drawing;let drag=null;
 root.addEventListener('pointerdown',e=>{
   const target=e.target.closest('[data-rod-id]');if(!target||ui.busy||e.button!==0)return;
   const rod=ui.fields.rods?.find(r=>r.id===target.dataset.rodId),matrix=target.ownerSVGElement?.getScreenCTM();
   if(!rod||!matrix)return;
   const k=Number(target.dataset.scale),room=rodRoom(ui.fields,rod,ui.previewBuilt?.installedLevels);
   drag={id:e.pointerId,rod,target,start:e.clientY,k,scale:k*matrix.d,offset:rod.offset,limit:rodLimits(room,rod.article,rod.anchor),moved:false};
   target.setPointerCapture(e.pointerId);
 });
 root.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   const d=drag,delta=e.clientY-d.start;if(!d.moved&&Math.abs(delta)<3)return;
   if(!d.moved){root.setPointerCapture(e.pointerId);d.moved=true;}
   const sign=d.rod.anchor==='top'?1:-1;
   d.offset=fit(d.rod.offset+sign*Math.round(delta/d.scale),d.limit.min,d.limit.max);
   d.target.setAttribute('transform','translate(0 '+((d.offset-d.rod.offset)*sign*d.k)+')');
   const field=ui.form.querySelector('[data-rod-offset]');if(field&&ui.rodId===d.rod.id)field.value=d.offset;
   ui.description.textContent=(d.rod.anchor==='top'?'От верха':'От низа')+' ниши до оси · '+d.offset+' мм';
 });
 function finish(e,cancel){
   if(!drag||e.pointerId!==drag.id)return;
   const d=drag;drag=null;if(!d.moved)return;
   if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);
   ui.suppressDiagramClick=true;setTimeout(()=>{ui.suppressDiagramClick=false;},0);
   if(cancel){ui.render();return;}
   try{checkPlacement(ui.fields,{...d.rod,offset:d.offset},ui.previewBuilt?.installedLevels);}
   catch(error){
     selectRod(ui,d.rod.id);
     const message=ui.form.querySelector('.rod-message');if(message)message.textContent=error.message;
     return;
   }
   d.rod.offset=d.offset;ui.changed(true);selectRod(ui,d.rod.id);
 }
 root.addEventListener('pointerup',e=>finish(e,false));
 root.addEventListener('pointercancel',e=>finish(e,true));
}
