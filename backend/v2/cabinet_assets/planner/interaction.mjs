import {clone,MM_TO_WORLD,elevation,placementError,rightAnchoredWidth,dimensionPatch,kitchenSettings,rotateXZ} from './furniture-core.mjs';
import {snapItem,findSpace} from './placement.mjs';
import {roomReady} from './room-plan.mjs';
import {isEquipment} from './equipment-placement.mjs';
import {movementTargets,translateItems,widthChange,validateChanges,applyChanges,replacement} from './mobility.mjs';

/** One furniture gesture, one history entry; previews never mutate project data. */
export class Interaction {
  constructor(scene,adapter,history,options=()=>({})) {
    this.scene=scene;this.adapter=adapter;this.history=history;this.options=options;
    this.canvas=scene.canvas;this.gesture=null;this.catalogueDraft=null;
    this.abort=new AbortController();this.suspended=false;this.touches=new Set();
    const listen=(el,name,fn,capture=false)=>el?.addEventListener(name,fn,{capture,signal:this.abort.signal});
    // Captured pointerdown prevents default focus. Commit any inspector blur
    // before reading the picked item, then keep scene keyboard actions active.
    listen(this.canvas,'pointerdown',e=>{if(e.button===0)this.canvas.focus({preventScroll:true});},true);
    listen(this.canvas,'pointerdown',e=>this.down(e),true);
    listen(this.canvas,'pointermove',e=>this.move(e),true);
    listen(this.canvas,'pointerup',e=>this.up(e),true);
    listen(this.canvas,'pointercancel',e=>this.cancelPointer(e),true);
    listen(this.canvas,'pointerleave',()=>{if(!this.gesture&&!this.equipment?.gesture)this.scene.hover(null);});
    listen(this.canvas,'lostpointercapture',()=>{if(this.gesture||this.equipment?.gesture)this.cancel();});
    listen(document,'keydown',e=>this.key(e),true);
    const finishTouch=e=>{if(e.pointerType==='touch'){this.touches.delete(e.pointerId);if(!this.touches.size)this.touchBlocked=false;}};
    listen(document,'pointerup',finishTouch,true);
    listen(document,'pointercancel',finishTouch,true);
    listen(window,'blur',()=>{this.cancel();this.touches.clear();this.touchBlocked=false;});
    this.catalogue=document.getElementById('module-catalogue');
    listen(this.catalogue,'click',e=>{
      const card=e.target.closest('.mf3d-module');if(!card||this.suspended||card.dataset.roomFeature)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(this.add(this.cardOptions(card))&&this.adapter.template(this.adapter.selected)?.production?.tall?.family==='appliance')document.dispatchEvent(new Event('mf:appliance-choice'));
    },true);
    listen(this.catalogue,'dragstart',e=>this.catalogueStart(e));
    listen(document,'dragend',()=>this.catalogueEnd());
    listen(this.canvas,'dragover',e=>this.catalogueOver(e));
    listen(this.canvas,'drop',e=>this.catalogueDrop(e));
    listen(this.canvas,'dragleave',()=>{if(this.equipment?.catalogueDraft){this.equipment.dropResult=null;this.scene.clearEquipmentPreview?.();}else if(this.catalogueDraft){this.dropResult=null;this.scene.clearPreview();}});
    this.decorateCatalogue();
    this.observer=new MutationObserver(()=>this.decorateCatalogue());
    if(this.catalogue)this.observer.observe(this.catalogue,{childList:true,subtree:true});
  }
  decorateCatalogue(){this.catalogue?.querySelectorAll('.mf3d-module').forEach(b=>{b.draggable=!b.dataset.roomFeature||isEquipment(b.dataset.roomFeature);});}
  cardOptions(card){return {template:card.dataset.template||null,bazis:card.dataset.bazis||null,module:card.dataset.module||null};}
  consume(e){e.preventDefault();e.stopImmediatePropagation();}
  editable(){return !this.suspended&&roomReady(this.adapter.room)&&!document.body.classList.contains('planner-client');}
  targets(it=this.adapter.selected){return movementTargets(it,this.adapter.items,this.scene.selectionScope||'module');}
  preview(result){
    if(result.items?.length>1)this.scene.showGroupPreview(result.items,result.error,result.guides);
    else this.scene.showPreview(result.item,result.error,result.guides||[]);
  }
  feedback(result){
    const el=document.getElementById('planner-feedback');if(!el)return;
    el.hidden=!result;el.dataset.error=String(Boolean(result?.error));
    el.textContent=result?(result.error||result.guides.map(g=>g.text).join(' · ')||'Отпустите, чтобы установить модуль'):'';
  }
  down(e){
    if(!this.editable()||e.button!==0)return;
    if(e.pointerType==='touch'){
      this.touches.add(e.pointerId);
      if(this.touches.size>1&&(this.gesture||this.equipment?.gesture)){this.consume(e);this.cancel();this.touchBlocked=true;return;}
      if(this.touchBlocked){this.consume(e);return;}
    }
    if(this.gesture||this.equipment?.gesture)return;
    const hit=this.scene.pick(e.clientX,e.clientY);
    if(hit?.featureId&&this.equipment?.down(e,hit))return;
    if(!hit?.id){this.scene.hover(null);return;}
    const it=this.adapter.items.find(x=>x.item_id===hit.id);if(!it)return;
    this.consume(e);this.adapter.select(it.item_id);
    const plane=this.scene.makePlane(it,hit.point),start=this.scene.planePoint(e.clientX,e.clientY,plane);
    if(!start)return;
    const targets=this.targets(it).map(clone);
    this.history.begin(targets.length>1?'Перемещение группы':'Перемещение модуля');
    this.gesture={pointerId:e.pointerId,item:clone(it),items:targets,plane,start,x:e.clientX,y:e.clientY,moved:false,anchors:{},result:null,
      lastValid:{item:clone(it),items:targets,anchors:{},error:'',guides:[]}};
    this.scene.controls.enabled=false;this.scene.hover(null);
    this.canvas.setPointerCapture(e.pointerId);this.canvas.style.cursor='grabbing';
  }
  move(e){
    if(!this.editable())return;
    if(this.equipment?.move(e))return;
    const g=this.gesture;
    if(!g){if(!e.buttons&&e.pointerType!=='touch'){const hit=this.scene.pick(e.clientX,e.clientY);this.scene.hover(hit?.id);this.canvas.style.cursor=hit?'grab':'';}return;}
    if(e.pointerId!==g.pointerId)return;this.consume(e);
    if(!g.moved&&Math.hypot(e.clientX-g.x,e.clientY-g.y)<(e.pointerType==='touch'?9:4))return;
    const point=this.scene.planePoint(e.clientX,e.clientY,g.plane);if(!point)return;
    g.moved=true;
    // First release keeps the existing v2 elevation rule. No unsavable Y field.
    const raw={...g.item,x:g.item.x+(point.x-g.start.x)/MM_TO_WORLD,z:g.item.z+(point.z-g.start.z)/MM_TO_WORLD};
    const grouped=g.items.length>1,ids=new Set(g.items.map(it=>it.item_id));
    const opts={...this.options(),threshold:this.scene.pixelThreshold(raw),allowElevation:false,...(grouped?{autoRotate:false}:{})};
    const candidate=snapItem(raw,grouped?this.adapter.items.filter(it=>!ids.has(it.item_id)):this.adapter.items,this.adapter.room,opts,g.anchors);g.anchors=candidate.anchors;
    candidate.items=grouped?translateItems(g.items,candidate.item.x-g.item.x,candidate.item.z-g.item.z):[candidate.item];
    try{validateChanges(this.adapter,candidate.items);}catch(error){candidate.error=candidate.error||error.message;}
    if(candidate.error?.includes('Пересечение:')){
      const blocked=candidate.error.split('Пересечение:').pop().trim();
      g.result=g.lastValid;
      this.preview(g.lastValid);
      this.feedback({error:'Упор: '+blocked+' · пересечение запрещено',guides:[]});
    }else{
      g.result=candidate;
      if(!candidate.error)g.lastValid={item:clone(candidate.item),items:clone(candidate.items),anchors:{...candidate.anchors},error:'',guides:[...(candidate.guides||[])]};
      this.preview(candidate);this.feedback(candidate);
    }
  }
  up(e){
    if(e.pointerType==='touch'){this.touches.delete(e.pointerId);if(!this.touches.size)this.touchBlocked=false;}
    if(this.equipment?.up(e))return;
    const g=this.gesture;if(!g||e.pointerId!==g.pointerId)return;
    this.consume(e);this.gesture=null;
    try{
      if(g.moved&&g.result&&!g.result.error){applyChanges(this.adapter,g.result.items||[g.result.item]);this.history.commit();this.adapter.status(g.items.length>1?'Группа установлена.':'Модуль установлен.');}
      else {this.history.cancel();if(g.result?.error)this.adapter.status(g.result.error+' — положение не изменено.');}
    }catch(error){this.history.cancel();this.adapter.status(error.message);}
    finally{this.finishPointer(e.pointerId);}
  }
  cancelPointer(e){this.touches.delete(e.pointerId);if(!this.touches.size)this.touchBlocked=false;if(this.gesture||this.equipment?.gesture){this.consume(e);this.cancel();}}
  finishPointer(id){
    this.scene.clearPreview();this.feedback(null);this.scene.controls.enabled=true;this.canvas.style.cursor='';
    try{if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}catch{}
  }
  cancel(){
    this.equipment?.cancel();
    const g=this.gesture;this.gesture=null;
    if(g){this.history.cancel();this.finishPointer(g.pointerId);}
    if(this.catalogueDraft)this.catalogueEnd();
  }
  change(label,fn){
    if(!roomReady(this.adapter.room)){this.adapter.status('Сначала задайте размеры и заполните замер в разделе «Комната».');document.dispatchEvent(new Event('mf:room-required'));return false;}
    if(!this.editable())return false;
    this.cancel();
    try {this.history.run(label,fn);return true;}catch(error){this.adapter.status(error.message);return false;}
  }
  add(opt){return this.change('Добавление модуля',()=>{
    const draft=this.adapter.createDraft(opt),it=findSpace(draft,this.adapter.items,this.adapter.room,this.adapter.selected,this.options());
    if(!it)throw new Error('Нет свободного места для этого модуля. Измените помещение или освободите место.');
    const error=this.adapter.validate(it);if(error)throw new Error(error);
    this.adapter.insert(it);this.adapter.status('Добавлен: '+it.name);
  });}
  modify(patch,label='Изменение модуля'){
    const source=this.adapter.selected;if(!source)return false;
    return this.change(label,()=>{
      if(Object.keys(patch).every(k=>['x','z'].includes(k))&&this.targets().length>1){
        applyChanges(this.adapter,translateItems(this.targets(),(patch.x??source.x)-source.x,(patch.z??source.z)-source.z));return;
      }
      let it=dimensionPatch(source,patch);
      if(Number.isFinite(patch.width)&&patch.width!==source.width)it=rightAnchoredWidth(source,it);
      const kitchen=kitchenSettings(source),nextKitchen=kitchenSettings(it);
      if(kitchen&&(Number.isFinite(patch.depth)||Number.isFinite(patch.rearServiceGapMm))){
        const delta=(it.depth-source.depth)/2+nextKitchen.rearServiceGapMm-kitchen.rearServiceGapMm,n=rotateXZ(0,1,source.rotation||0);
        it.x+=n.x*delta;it.z+=n.z*delta;
      }else if(Number.isFinite(patch.depth)&&patch.depth!==source.depth){
        const r=this.adapter.room,delta=(patch.depth-source.depth)/2,clearance=this.options().wallOffset||0;
        if(source.rotation===0&&Math.abs(source.z-source.depth/2+r.depth/2-clearance)<1)it.z+=delta;
        if(source.rotation===180&&Math.abs(r.depth/2-source.z-source.depth/2-clearance)<1)it.z-=delta;
        if(source.rotation===90&&Math.abs(r.width/2-source.x-source.depth/2-clearance)<1)it.x-=delta;
        if(source.rotation===270&&Math.abs(source.x-source.depth/2+r.width/2-clearance)<1)it.x+=delta;
        it.x=Math.round(it.x*2)/2;it.z=Math.round(it.z*2)/2;
      }
      applyChanges(this.adapter,widthChange(source,it,this.adapter.items,this.adapter.room,this.options().shiftNeighbours===true));
    });
  }
  replaceModule(opt,keepDimensions=true){
    const source=this.adapter.selected;if(!source)return false;
    return this.change('Замена модуля',()=>{
      const draft=this.adapter.createDraft(opt);
      const next=replacement(source,draft,this.adapter.template(source),this.adapter.template(draft),keepDimensions);
      applyChanges(this.adapter,widthChange(source,next,this.adapter.items,this.adapter.room,this.options().shiftNeighbours===true));
      this.adapter.status('Модуль заменён. Материалы, положение и заметка сохранены.');
    });
  }
  remove(){if(this.equipment?.selected){this.equipment.remove();return;}const id=this.adapter.selected?.item_id;if(id)this.change('Удаление модуля',()=>this.adapter.remove(id));}
  duplicate(){
    const source=this.adapter.selected;if(!source)return;
    this.change('Копирование модуля',()=>{
      const draft={...clone(source),item_id:crypto.randomUUID(),name:(source.name+' — копия').slice(0,160)};
      const it=findSpace(draft,this.adapter.items,this.adapter.room,source,this.options());
      if(!it)throw new Error('Нет свободного места для копии.');
      this.adapter.insert(it);
    });
  }
  rotate(){const it=this.adapter.selected;if(it)this.modify({rotation:(it.rotation+90)%360},'Поворот модуля');}
  nudge(dx,dz){const targets=this.targets();if(targets.length)this.change(targets.length>1?'Перемещение группы':'Точное перемещение',()=>applyChanges(this.adapter,translateItems(targets,dx,dz)));}
  key(e){
    if(e.key==='Escape'&&(this.gesture||this.catalogueDraft||this.equipment?.gesture||this.equipment?.catalogueDraft)){this.consume(e);this.cancel();return;}
    if(!this.editable()||document.querySelector('dialog[open]')||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    let k=e.key.toLowerCase();
    if(!['z','y'].includes(k)&&['KeyZ','KeyY'].includes(e.code))k=e.code.slice(3).toLowerCase();
    if((e.ctrlKey||e.metaKey)&&(k==='z'||k==='y')){this.consume(e);this.cancel();(k==='y'||e.shiftKey)?this.history.redo():this.history.undo();return;}
    if(e.target.closest?.('button,summary,a,[role="tab"]'))return;
    if(e.key==='Delete'||e.key==='Backspace'){this.consume(e);this.remove();return;}
    const n=e.shiftKey?100:10,steps={ArrowLeft:[-n,0],ArrowRight:[n,0],ArrowUp:[0,-n],ArrowDown:[0,n]};
    if(steps[e.key]&&this.equipment?.selected){this.consume(e);this.equipment.nudge(...steps[e.key]);return;}
    if(steps[e.key]&&this.adapter.selected){this.consume(e);this.nudge(...steps[e.key]);}
  }
  catalogueStart(e){
    const card=e.target.closest('.mf3d-module');if(!card||!this.editable()){e.preventDefault();return;}
    if(isEquipment(card.dataset.roomFeature)&&this.equipment){this.equipment.catalogueStart(e,card.dataset.roomFeature);return;}
    if(card.dataset.roomFeature){e.preventDefault();return;}
    this.cancel();
    try{
      this.catalogueDraft=this.adapter.createDraft(this.cardOptions(card));this.dropAnchors={};this.dropResult=null;
      e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/plain',card.getAttribute('aria-label')||'Модуль');
      this.scene.controls.enabled=false;
    }catch(error){e.preventDefault();this.adapter.status(error.message);}
  }
  catalogueOver(e){
    if(this.editable()&&this.equipment?.catalogueOver(e))return;
    if(!this.catalogueDraft||!this.editable())return;e.preventDefault();e.dataTransfer.dropEffect='copy';
    const draft=this.catalogueDraft,plane=this.scene.makePlane(draft);
    const point=this.scene.planePoint(e.clientX,e.clientY,plane);if(!point)return;
    const raw={...draft,x:point.x/MM_TO_WORLD,z:point.z/MM_TO_WORLD};
    this.dropResult=snapItem(raw,this.adapter.items,this.adapter.room,{...this.options(),threshold:this.scene.pixelThreshold(raw),allowElevation:false},this.dropAnchors);
    this.dropAnchors=this.dropResult.anchors;this.dropResult.error=this.dropResult.error||this.adapter.validate(this.dropResult.item);
    this.scene.showPreview(this.dropResult.item,this.dropResult.error,this.dropResult.guides);this.feedback(this.dropResult);
  }
  catalogueDrop(e){
    if(this.equipment?.catalogueDrop(e))return;
    if(!this.catalogueDraft)return;e.preventDefault();
    this.catalogueOver(e);const result=this.dropResult;this.catalogueEnd();
    if(result&&!result.error)this.change('Добавление из каталога',()=>this.adapter.insert(result.item));
    else if(result?.error)this.adapter.status(result.error+' — модуль не добавлен.');
  }
  catalogueEnd(){
    this.equipment?.catalogueEnd();
    if(!this.catalogueDraft)return;this.catalogueDraft=null;this.dropResult=null;this.dropAnchors={};
    this.scene.clearPreview();this.feedback(null);this.scene.controls.enabled=true;
  }
  dispose(){this.cancel();this.abort.abort();this.observer.disconnect();this.touches.clear();}
}
