import {FEATURES,WALLS,ORIGINS,featureBox} from './room-plan.mjs';
import {newEquipment} from './room-equipment.mjs';
import {isEquipment,equipmentError,equipmentAtPoint,snapEquipment,findEquipmentSpace} from './equipment-placement.mjs';
import {reconcileSurvey} from './socket-editor.mjs';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const get=id=>document.getElementById(id);

/** Room objects keep their measured schema; furniture items and native export stay separate. */
export class EquipmentControls{
  constructor(app){
    this.app=app;this.selectedId=null;this.gesture=null;this.catalogueDraft=null;this.fields={};
    const card=this.card=el('section');card.id='equipment-controls';card.hidden=true;card.className='mf3d-control-card';
    this.title=el('h2','Оборудование');this.picture=el('img');this.picture.className='equipment-inspector-preview';this.picture.alt='';card.append(this.picture,this.title);
    const help=el('p','Тяните объект мышью. У стены он разворачивается и привязывается к ней. Точное положение задайте ниже.');help.className='studio-hint';card.append(help);
    const grid=el('div');grid.className='room-feature-grid';card.append(grid);
    for(const [key,label]of [['label','Название'],['wall','Стена'],['offset','Отступ вдоль стены'],['wall_gap','Отступ от стены'],['elevation','Высота от пола'],['width','Ширина'],['height','Высота'],['projection','Глубина']]){
      const l=el('label',label),input=el(key==='wall'?'select':'input');input.id='equipment-'+key;input.setAttribute('aria-label',label+' оборудования');
      if(key==='wall'){for(const [value,text]of Object.entries(WALLS)){const o=el('option',text);o.value=value;input.append(o);}}
      else if(key==='label'){input.type='text';input.maxLength=100;}
      else{input.type='number';input.min=['width','height','projection'].includes(key)?'1':'0';input.max=['height','elevation'].includes(key)?'5000':key==='projection'?'3000':'12000';input.step='1';}
      input.onchange=()=>{if(input.value===''){this.sync(true);return;}this.modify({[key]:['label','wall'].includes(key)?input.value:Number(input.value)});};l.append(input);grid.append(l);this.fields[key]=input;
    }
    this.origin=el('p');this.origin.className='studio-hint';card.append(this.origin);
    const actions=el('div');actions.className='room-inline-actions';
    for(const [label,fn]of [['К стене',()=>this.modify({wall_gap:0})],['Копировать',()=>this.duplicate()],['Удалить',()=>this.remove()]]){const b=el('button',label);b.type='button';b.className='secondary';b.onclick=fn;actions.append(b);}card.append(actions);
    this.error=el('p');this.error.className='equipment-error';this.error.setAttribute('role','status');card.append(this.error);document.querySelector('.mf3d-right').append(card);
    this.list=el('section');this.list.id='equipment-project-list';get('pane-items').append(this.list);
    app.listen(document,'mf:room-equipment-add',e=>{if(isEquipment(e.detail?.kind))this.add(e.detail.kind);});
  }
  get adapter(){return this.app.adapter;}
  get scene(){return this.app.scene;}
  get selected(){return this.adapter.room.features?.find(f=>f.id===this.selectedId);}
  select(id,open=true){
    this.selectedId=id;this.adapter.select(null);this.sync(true);
    if(open)this.app.workspace.panel('right',true);this.scene.canvas?.focus({preventScroll:true});
  }
  clear(){this.selectedId=null;this.sync();}
  change(label,fn){
    if(!this.app.interaction.change(label,()=>{fn();reconcileSurvey(this.adapter.room);this.adapter.notify();})){this.sync(true);return false;}
    this.error.textContent='';this.sync(true);return true;
  }
  insert(f){if((this.adapter.room.features||[]).length>=100)throw Error('В комнате поддерживается до 100 объектов.');(this.adapter.room.features??=[]).push(f);this.selectedId=f.id;}
  replace(f){const i=this.adapter.room.features.findIndex(x=>x.id===f.id);if(i>=0)this.adapter.room.features[i]=structuredClone(f);}
  add(kind){
    let added;
    if(this.change('Добавление оборудования',()=>{const f=findEquipmentSpace(newEquipment(this.adapter.room,kind,kind+'-'+crypto.randomUUID()),this.adapter.room,this.adapter.items);if(!f)throw Error('Нет свободного места у стен. Освободите место или измените комнату.');this.insert(f);added=f;})){this.select(added.id);this.adapter.status('Добавлено: '+added.label);}
  }
  modify(patch){
    const source=this.selected;if(!source)return;const next={...source,...patch};
    if(patch.wall&&patch.wall!==source.wall)next.wall_gap=0;
    const error=equipmentError(next,this.adapter.room,this.adapter.items);if(error){this.error.textContent=error;this.adapter.status(error);this.sync(true);return false;}
    return this.change('Положение и размеры оборудования',()=>this.replace(next));
  }
  remove(){const f=this.selected;if(f)this.change('Удаление оборудования',()=>{this.adapter.room.features=this.adapter.room.features.filter(x=>x.id!==f.id);this.selectedId=null;});}
  duplicate(){const source=this.selected;if(!source)return;let copy;if(this.change('Копирование оборудования',()=>{copy=findEquipmentSpace({...structuredClone(source),id:source.kind+'-'+crypto.randomUUID(),offset:source.offset+source.width+50},this.adapter.room,this.adapter.items);if(!copy)throw Error('Нет свободного места для копии.');this.insert(copy);})){this.select(copy.id);}}
  nudge(dx,dz){const f=this.selected;if(!f)return;const b=featureBox(f,this.adapter.room);const next=equipmentAtPoint(f,{x:b.x+dx,z:b.z+dz},this.adapter.room);this.modify({offset:next.offset,wall_gap:next.wall_gap});}
  sync(force=false){
    if(this.adapter.selected)this.selectedId=null;
    const f=this.selected;if(!f)this.selectedId=null;this.card.hidden=!f;
    const panel=document.querySelector('.mf3d-right');panel.classList.toggle('equipment-active',Boolean(f));const heading=panel.querySelector('.workspace-drawer-head strong');if(heading)heading.textContent=f?'Параметры объекта':'Параметры модуля';
    if(f){
      get('item-controls').hidden=true;get('studio-inspector-empty').hidden=true;
      this.title.textContent=f.label||FEATURES[f.kind][0];const src=f.kind==='window'?'/account/planner/window-preview.svg':'/account/planner/appliance-assets/'+f.kind+'-tripo-preview.webp';if(this.picture.getAttribute('src')!==src)this.picture.src=src;
      for(const [key,input]of Object.entries(this.fields)){if(force||document.activeElement!==input)input.value=String(f[key]??(key==='wall_gap'?0:''));input.disabled=(key==='elevation'&&f.kind==='gas_cooker')||(key==='wall_gap'&&f.kind==='window');}
      this.origin.textContent='Отступ вдоль стены — от '+ORIGINS[f.wall]+'. Все размеры в мм.';
      get('studio-selection-caption').textContent=this.title.textContent+' · '+f.width+' × '+f.height+' × '+f.projection+' мм';
      this.scene.highlightEquipment?.(f);
    }else{this.scene.highlightEquipment?.(null);if(!this.adapter.selected)get('studio-inspector-empty').hidden=false;}
    const features=(this.adapter.room.features||[]).filter(isEquipment),key=JSON.stringify(features)+this.selectedId;
    if(this.listKey!==key){this.listKey=key;this.list.replaceChildren();if(features.length)this.list.append(el('h3','Оборудование помещения'));
      for(const feature of features){const b=el('button',feature.label||FEATURES[feature.kind][0]);b.type='button';b.className='secondary';b.setAttribute('aria-pressed',String(feature.id===this.selectedId));b.onclick=()=>this.select(feature.id);this.list.append(b);}}
  }
  preview(result){this.scene.previewEquipment?.(result.feature,result.error);this.app.interaction.feedback({error:result.error,guides:result.guides?.length?result.guides:[{text:'Отпустите, чтобы установить объект'}]});}
  down(e,hit){
    const f=this.adapter.room.features?.find(x=>x.id===hit.featureId);if(!isEquipment(f))return false;
    this.app.interaction.consume(e);this.select(f.id,false);const plane=this.scene.equipmentPlane?.(f,hit.point),start=plane&&this.scene.planePoint(e.clientX,e.clientY,plane);if(!start)return true;
    this.app.history.begin('Перемещение оборудования');this.gesture={pointerId:e.pointerId,feature:structuredClone(f),plane,start,x:e.clientX,y:e.clientY,moved:false,result:null};
    this.scene.controls.enabled=false;this.scene.canvas.setPointerCapture(e.pointerId);this.scene.canvas.style.cursor='grabbing';return true;
  }
  move(e){
    const g=this.gesture;if(!g)return false;if(e.pointerId!==g.pointerId)return true;this.app.interaction.consume(e);
    if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<(e.pointerType==='touch'?9:4))return true;
    const p=this.scene.planePoint(e.clientX,e.clientY,g.plane);if(!p)return true;g.moved=true;
    const b=featureBox(g.feature,this.adapter.room),f={...g.feature,elevation:g.feature.kind==='gas_cooker'?0:Math.round(g.feature.elevation+(p.y-g.start.y)*1000)};
    g.result=snapEquipment(f,{x:b.x+(p.x-g.start.x)*1000,z:b.z+(p.z-g.start.z)*1000},this.adapter.room,this.adapter.items,{enabled:this.app.options.enabled,threshold:120});this.preview(g.result);return true;
  }
  up(e){
    const g=this.gesture;if(!g)return false;if(e.pointerId!==g.pointerId)return true;this.app.interaction.consume(e);this.gesture=null;
    if(g.moved&&g.result&&!g.result.error){this.replace(g.result.feature);this.adapter.notify();this.app.history.commit();this.adapter.status('Оборудование установлено.');}
    else{this.app.history.cancel();if(g.result?.error)this.adapter.status(g.result.error+' — положение не изменено.');}
    this.finish(g.pointerId);if(!g.moved)this.app.workspace.panel('right',true);return true;
  }
  finish(id){this.scene.clearEquipmentPreview?.();this.scene.controls.enabled=true;this.scene.canvas.style.cursor='';try{if(this.scene.canvas.hasPointerCapture(id))this.scene.canvas.releasePointerCapture(id);}catch{}this.app.interaction.feedback(null);this.sync(true);}
  cancel(){const g=this.gesture;this.gesture=null;if(g){this.app.history.cancel();this.finish(g.pointerId);}this.catalogueEnd();}
  catalogueStart(e,kind){this.app.interaction.cancel();this.catalogueDraft=newEquipment(this.adapter.room,kind,kind+'-'+crypto.randomUUID());this.dropResult=null;e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/plain',FEATURES[kind][0]);this.scene.controls.enabled=false;}
  catalogueOver(e){
    if(!this.catalogueDraft)return false;e.preventDefault();e.dataTransfer.dropEffect='copy';const f=this.catalogueDraft,plane=this.scene.equipmentPlane?.(f),p=plane&&this.scene.planePoint(e.clientX,e.clientY,plane);if(!p)return true;
    this.dropResult=snapEquipment(f,{x:p.x*1000,z:p.z*1000},this.adapter.room,this.adapter.items,{enabled:this.app.options.enabled,threshold:160});this.preview(this.dropResult);return true;
  }
  catalogueDrop(e){if(!this.catalogueDraft)return false;e.preventDefault();this.catalogueOver(e);const r=this.dropResult;this.catalogueEnd();if(r&&!r.error){if(this.change('Оборудование из каталога',()=>this.insert(r.feature)))this.select(r.feature.id);}else if(r?.error)this.adapter.status(r.error+' — объект не добавлен.');return true;}
  catalogueEnd(){if(!this.catalogueDraft)return;this.catalogueDraft=null;this.dropResult=null;this.scene.clearEquipmentPreview?.();this.scene.controls.enabled=true;this.app.interaction.feedback(null);this.sync();}
  dispose(){this.cancel();this.card.remove();this.list.remove();}
}
