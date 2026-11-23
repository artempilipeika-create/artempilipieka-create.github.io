import {hingeCatalogue as wardrobeHinges} from './wardrobe-hinge-layout.mjs';
import {lightKitControls,updateLightQuote} from './wardrobe-light-kit-ui.mjs';
import {lightControls,pickLightPart} from './wardrobe-lighting-ui.mjs';
import {defaultBackMount,rearClearance} from './panel-machining.mjs';
import {backMountControls,machiningControls,pickMachiningPart} from './panel-machining-ui.mjs';
import {wardrobeNames,nextCabinetName} from './wardrobe-blocks.mjs';
import {measuredRooms} from './wardrobe-gola-shelves.mjs';
import {hasSurround,surroundFace,surroundLayout} from './wardrobe-surround.mjs';
import {prepareHeightFields,lowerBodyHeight,trimSides} from './wardrobe-trim-layout.mjs';
import {heightControl,updateHeights,surroundControls,upperFrontTabs,upperFrontControls} from './wardrobe-surround-ui.mjs';
import {doorControls,setDoorShelf,wireHandleDrag} from './wardrobe-door-ui.mjs';
import {drawerFacadeKey} from './wardrobe-door-layout.mjs';
import {WardrobePreview} from './wardrobe-preview.mjs';
import {fittingControls} from './wardrobe-fitting-ui.mjs';
import {rodControls,selectRod,wireRodDrag} from './wardrobe-rods-ui.mjs';
import {activeCell,cellControls,sectionChoices,selectCell,wireCellDrag} from './wardrobe-cells-ui.mjs';
import {startWardrobeControls} from './wardrobe-ready-ui.mjs';
import {drawerRailSnapshot,drawerRailChanges} from './wardrobe-drawers.mjs';
import {fittingCatalogue} from './wardrobe-fittings.mjs';
import {sectionPresetControls} from './wardrobe-section-presets.mjs';
import {keysAfterInsertion,setClearWidth,setSectionShelfCount} from './wardrobe-cells.mjs';
import {nicheSlot,splitAt} from './wardrobe-layout.mjs';
import {gapEditor,splitControls} from './wardrobe-zones-ui.mjs';
import {wardrobeDrawing,drawingTitles} from './wardrobe-drawing.mjs';
import {footHeight,plinthFoot,plinthPanel,plinthClearanceMm} from './plinth-options.mjs';
import {feetCatalogue} from './wardrobe-feet.mjs';
import {fittingImage,jointPhotos} from './hardware-photos.mjs';
import {sameAssistantSpec,selectedCarcass,assistantStamp,prepareAssistantPlan,applyAssistantPlan} from './assistant-model.mjs';
import {buildCarcass,CARCASS_BACK_MATERIAL_ID} from './carcass-model.mjs';
import {jointOptions,jointQuantity,dividerScheme} from './carcass-joints.mjs';
import {prepareDrawerCovers,nicheOpenings,openingLabel} from './wardrobe-niches.mjs';
import {drawerControls,updateNicheResult} from './wardrobe-interior-ui.mjs';
import {shelfQuestionnaire} from './shelf-questionnaire.mjs';
import {shelfRows,choice,defaultShelf} from './shelf-choices.mjs';
import {WARDROBE_STEPS,resizeDividerChoices,wardrobeSpec,sectionWidths,questionnaireMaterialError} from './wardrobe-questionnaire.mjs';
import {newDresser,syncDresser} from './dresser-layout.mjs';
import {dresserControls,dresserSteps,drawDresser} from './dresser-ui.mjs';
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
function buildPreview(ui){
  try{
   const options={idPrefix:'questionnaire-preview',bodyMaterialId:ui.materials?.body?.variant_id,frontMaterialId:ui.materials?.front?.variant_id,
     backMaterialId:ui.materials?.back?.variant_id,drawerMaterialId:ui.fields.thickness===18?undefined:ui.materials?.drawer?.variant_id};
   let built,issue='';
   try{built=buildCarcass(ui.spec(),options);}
   catch(error){
    if(ui.isDresser)throw error;
    if(ui.view==='lighting'&&ui.fields.lighting){
     const fields={...ui.fields};delete fields.lighting;
     return {built:buildCarcass(wardrobeSpec(fields),options),issue:error.message};
    }
    if(ui.view==='machining'&&ui.fields.machining){
     const fields={...ui.fields};delete fields.machining;
     return {built:buildCarcass(wardrobeSpec(fields),options),issue:error.message};
    }
    if(ui.view!=='fronts')throw error;
    const guide=structuredClone(ui.fields);delete guide.front;
    for(const bank of guide.drawerBanks??[])for(const face of bank?.faces??[])delete face.handle;
    built=buildCarcass(wardrobeSpec(guide),options);
    issue=error.message;
   }
   return {built,issue};
  }catch(error){return {error};}
 }

export class AssistantUI{
 constructor(app){this.app=app;this.disposed=false;this.materials={};this.serial={body:0,back:0,front:0,drawer:0};this.start().catch(()=>{});}
 async start(){
  if(!this.app.bridge.assistantAccess?.())return;
  const status=await this.app.bridge.request('/3d-assistant/status').catch(()=>({available:false,remaining:0}));if(this.disposed)return;
  this.available=status.available;this.remainingCount=status.remaining;
  this.style=el('link');this.style.rel='stylesheet';this.style.href='/account/planner/assistant.css';document.head.append(this.style);
  this.button=button('Собрать шкаф',()=>this.open());this.button.id='planner-assistant';this.button.className='secondary';document.getElementById('planner-tools').append(this.button);
  this.dresserButton=button('Комод',()=>this.open('create','dresser'));this.dresserButton.id='planner-dresser';this.dresserButton.className='secondary';this.button.after(this.dresserButton);
  this.dialog=el('dialog');this.dialog.id='planner-assistant-dialog';this.dialog.className='assistant-wizard';this.dialog.setAttribute('aria-labelledby','assistant-title');
  const head=el('div');head.className='assistant-head';const title=el('h2','Собрать шкаф');title.id='assistant-title';head.append(title,button('Закрыть',()=>this.dialog.close()));
  this.mode=el('select');this.mode.setAttribute('aria-label','Действие со шкафом');this.mode.onchange=()=>this.reset();
  this.nav=el('nav');this.nav.setAttribute('aria-label','Шаги анкеты');this.nav.className='assistant-steps';
  this.steps=WARDROBE_STEPS.map((name,i)=>{const b=button((i+1)+'. '+name,()=>this.go(i));this.nav.append(b);return b;});
  const grid=el('div');grid.className='assistant-grid';this.form=el('div');this.form.className='assistant-fields';
  const aside=el('aside');aside.className='assistant-drawing';this.figureTitle=el('h3');this.drawing=el('div');this.drawing.className='wardrobe-figure';this.drawing.onclick=e=>this.pickShelf(e);wireCellDrag(this);wireRodDrag(this);wireHandleDrag(this);
  this.drawing.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.pickShelf(e);}};this.dimensions=el('p');this.description=el('p');const figureHead=el('div');figureHead.className='cell-figure-head';
  this.railNotice=el('div');this.railNotice.dataset.railChange='';this.railNotice.className='wardrobe-rail-notice';this.railNotice.setAttribute('role','status');this.railNotice.setAttribute('aria-live','polite');this.railNotice.hidden=true;
  this.zoom=button('Развернуть схему',()=>this.zoomDiagram(!this.diagramExpanded));this.zoom.className='cell-zoom';
  figureHead.append(this.figureTitle,this.zoom);aside.append(figureHead,this.railNotice,this.drawing,this.dimensions,this.description);const visuals=el('div');visuals.className='assistant-visuals';
  this.livePreview=new WardrobePreview(this.app,(section,level,column)=>{this.activeSection=section;this.nicheIndex=level;this.column=column;this.render();});
  visuals.append(this.livePreview.root,aside);grid.append(this.form,visuals);
  this.dialog.addEventListener('cancel',event=>{if(this.diagramExpanded){event.preventDefault();this.zoomDiagram(false);}});
  this.dialog.addEventListener('close',()=>this.livePreview.release());
  this.output=el('p');this.output.setAttribute('role','status');this.output.setAttribute('aria-live','polite');this.summary=el('ul');this.summary.hidden=true;
  const footer=el('div');footer.className='assistant-footer';this.previous=button('Назад',()=>this.go(this.step-1));this.next=button('Далее',()=>this.go(this.step+1));
  this.manual=button('Проверить по размерам',()=>this.ask(false));this.manual.className='assistant-primary';
  this.send=button('Проверить с ИИ',()=>this.ask());this.send.className='assistant-primary';this.apply=button('Добавить в проект',()=>this.commit());this.apply.className='assistant-primary';this.apply.hidden=true;
  footer.append(this.previous,this.next,this.manual,this.send,this.apply);this.remaining=el('p');this.remaining.className='assistant-hint';
  this.dialog.append(head,this.mode,this.nav,grid,this.output,this.summary,footer,this.remaining);document.body.append(this.dialog);
  this.app.cabinets?.sync();
  this.unsubscribe=this.app.bridge.subscribe(reason=>{if(reason==='before-project'||reason==='project'){this.epoch=(this.epoch||0)+1;this.pending=null;this.dialog.close();}});
 }
 open(mode='create',product='wardrobe'){
  if(mode==='update'&&this.app.adapter.selected?.assistant_carcass?.spec.kitchenModel){this.app.aiKitchen?.edit();return;}
  if(this.app.workspace?.isClient())this.app.workspace.client();this.current=null;
  this.isDresser=mode==='update'?Boolean(this.app.adapter.selected?.assistant_carcass?.spec.dresser):product==='dresser';
  this.dialog.toggleAttribute('data-dresser',this.isDresser);
  this.dialog.querySelector('#assistant-title').textContent=this.isDresser?'Комод':'Собрать шкаф';
  this.mode.setAttribute('aria-label',this.isDresser?'Действие с комодом':'Действие со шкафом');
  this.steps.forEach((b,i)=>{b.textContent=(i+1)+'. '+(this.isDresser?dresserSteps:WARDROBE_STEPS)[i];});
  try{const c=selectedCarcass(this.app.adapter);if(c&&['shelves','divided'].includes(c.metadata.spec.recipe)&&Boolean(c.metadata.spec.dresser)===this.isDresser)this.current=c;}catch(error){if(mode==='update'){this.app.adapter.status(error.message);return;}}
  if(mode==='update'&&!this.current){this.app.adapter.status('Выберите шкаф, созданный в конструкторе.');return;}
  this.mode.replaceChildren();for(const [value,text]of [['create',this.isDresser?'Новый комод':'Новый шкаф'],...(this.current?[['update',this.isDresser?'Изменить выбранный комод':'Изменить выбранный шкаф']]:[])]){const o=el('option',text);o.value=value;this.mode.append(o);}
  this.mode.value=mode==='update'?'update':'create';this.reset();this.dialog.showModal();this.steps[0].focus();
 }
 reset(){
  this.epoch=(this.epoch||0)+1;this.serial.body++;this.serial.back++;this.serial.front++;this.serial.drawer++;
  const c=this.mode.value==='update'?this.current:null,s=c?.metadata.spec;
  this.cabinetName=c?wardrobeNames(this.app.adapter.items).get(c.metadata.group_id):nextCabinetName(this.app.adapter.items,this.isDresser?'Комод':'Шкаф');
  this.fields=s?{...structuredClone(s),sectionShelves:s.sectionShelves?.slice()??Array(s.sections).fill(s.shelves)}:this.isDresser?newDresser():{width:800,height:2200,depth:577,thickness:18,sections:1,sectionShelves:[0],back:true};
  if(!this.isDresser)prepareHeightFields(this.fields);
  this.dresserRoute=null;this.dresserAnswers=null;this.dresserPick=null;this.dresserClosed=true;this.dresserElevation=null;this.dresserFeet=null;
  this.sourceKeys=c?new Map(c.items.map(it=>[it.item_id.slice(c.metadata.group_id.length+1),it.item_id])):null;
  this.wardrobeRoute=null;this.wardrobeAnswers=null;this.readyPick=null;this.refreshReady=null;this.railSnapshot=null;this.railUpdates=new Map();this.railNotice.replaceChildren();this.railNotice.hidden=true;
  this.rodId=null;this.rodDraft=null;this.rodFamily=null;this.fameId=undefined;this.fameMount=null;this.fittingCategory=null;
  this.wholeWidth=false;this.layoutUndo=[];this.layoutAnchor=null;this.zoomDiagram(false);
  if(c&&s.front&&!s.front.autoHinges&&s.drawerBanks){
   this.fields.drawerBanks.forEach((bank,slot)=>bank?.faces.forEach((face,i)=>{
    const old=c.items.find(it=>it.item_id===c.metadata.group_id+':drawer-'+slot+'-'+i+'-face');
    if(old&&face.width==null)face.width=old.width;
   }));
  }
  if(s?.drawerBanks?.some(b=>b?.kind==='internal'&&b.layout)){
   const editable=structuredClone(this.fields);
   try{prepareDrawerCovers(editable);this.fields=editable;}catch{/* Keep all fields editable when the old opening needs adjustment. */}
  }
  if(s?.thickness===18&&s.sections>1)this.fields.dividerJoints=Array.from({length:s.sections-1},(_,i)=>dividerScheme(s,i));
  if(!this.isDresser)this.fields.drawerFixing??=this.fields.drawerBanks?.find(b=>b?.coverFixing)?.coverFixing??'cam_dowel';
  if(s&&!s.clearLayout&&s.shelfChoices?.some(row=>row.some(v=>!v.startsWith('board/')))&&!s.drawerBanks?.some(b=>b&&!b.layout)){
   const base=(s.elevation??0)+footHeight(s);
   const original=this.fields.shelfLevels;
   this.fields.shelfLevels=this.fields.sectionShelves.map((n,i)=>nicheOpenings(this.fields,i).slice(0,n).map((r,j)=>original?.[i]?.[j]??{mode:'floor',mm:base+r.top}));
  }
  this.kitOpen=false;this.lightKitResult=null;
  this.partKey=c?this.app.adapter.selected?.item_id?.slice(c.metadata.group_id.length+1):null;
  this.cutIndex=null;this.cutDraft=null;this.showMachiningFronts=false;this.handleCategoryKey=null;this.lightIndex=0;
  this.fields.clearLayout=true;this.column=0;this.gapIndex=0;
  this.view='body';this.activeSection=0;this.footOpen=false;this.footGroup=null;this.footFilter='all';
  this.editorKey=null;this.shelfScopes={};this.shelfDrafts={};this.levelUnits={};this.levelIndex=0;this.nicheIndex=0;this.interior='cell';this.inspectInternalFronts=false;this.selectedDoor=null;this.previewBuilt=null;this.resetSideEdges=false;
  this.materials={};this.materialChanged={body:false,back:false};this.step=0;this.pending=null;this.busy=false;this.summary.hidden=true;
  this.output.textContent='';this.render();
  this.loadMaterial('body',c?.items.find(i=>i.item_id.endsWith(':left'))?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id);
  const fronts=c?.items.filter(i=>(i.blank_axis==='front'||surroundFace(i.item_id.split(':').at(-1)))&&i.body_variant_id)||[];
  const savedFront=fronts.find(i=>Number(this.app.bridge.material(i.body_variant_id)?.thickness)===18)
    ??fronts.find(i=>!this.app.bridge.material(i.body_variant_id));
  this.loadMaterial('front',savedFront?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.front_variant_id);
  this.loadMaterial('drawer',c?.items.find(i=>/:drawer-\d+-\d+-side-left$/.test(i.item_id))?.body_variant_id||globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id);
  this.loadMaterial('back',c?.items.find(i=>i.item_id.endsWith(':back'))?.body_variant_id||(s?.backThickness?null:CARCASS_BACK_MATERIAL_ID));
 }
 async loadMaterial(role,id){
  if(!id)return;const epoch=this.epoch,serial=++this.serial[role];
  try{const m=this.app.bridge.material(id)||await this.app.bridge.request('/catalogue/materials/'+encodeURIComponent(id));
   if(this.disposed||epoch!==this.epoch||serial!==this.serial[role])return;
   this.app.bridge.cacheMaterial(m);this.materials[role]=m;if(this.step===4)this.render();else if(this.step===2&&this.interior==='drawer')this.draw();
  }catch{if(epoch===this.epoch&&serial===this.serial[role]&&this.step===4)this.render();}
 }
 pickShelf(event){
  if(this.busy||this.suppressDiagramClick)return;
  if(this.isDresser){
   const target=event.target.closest?.('[data-dresser-section]');if(!target)return;
   this.activeSection=Number(target.dataset.dresserSection);this.nicheIndex=0;
   this.step=this.step===3?3:2;this.view=this.step===3?'fronts':'sections';this.render();
   this.form.querySelector('[aria-label="Наполнение секции"],[data-section="'+this.activeSection+'"]')?.focus({preventScroll:true});return;
  }
  if(this.view==='lighting'){
   const hit=event.target.closest?.('[data-cut-part]');if(hit)pickLightPart(this,hit.dataset.cutPart);return;
  }
  if(this.view==='machining'){
   const hit=event.target.closest?.('[data-cut-part]');if(hit)pickMachiningPart(this,hit.dataset.cutPart);return;
  }
  const hit=event.target.closest?.('[data-clear-width],[data-clear-level],[data-split-section],[data-shelf-index],[data-niche],[data-hinge],[data-door-shelf-pick],[data-door-id]');
  if(!hit)return;
  const d=hit.dataset,section=Number(d.section);
  if(d.fittingId){
   const item=this.fields.fittings?.find(f=>f.id===d.fittingId);if(!item)return;
   const product=fittingCatalogue[item.variant];this.zoomDiagram(false);
   this.activeSection=item.section;this.nicheIndex=item.level;this.column=item.column??0;this.gapIndex=item.opening??item.level;
   this.step=2;this.view='sections';this.interior=product.category==='rods'?'rod':'fitting';
   if(product.category==='rods'){this.rodFamily='fame';this.fameId=item.id;this.fameMount=product.mount;}
   else this.fittingCategory=product.category;
   this.render();return;
  }
  if(d.rodId){selectRod(this,d.rodId);return;}
  if(d.doorShelfPick){setDoorShelf(this,d.doorShelfPick);return;}
  if(d.doorId){this.selectedDoor=d.doorId;this.step=3;this.view='fronts';this.render();this.form.querySelector(d.doorId.startsWith('door-')?'[data-hinge-kind][aria-pressed="true"]':'[data-handle-article]')?.focus({preventScroll:true});return;}
  if(d.hinge){
   this.selectedDoor=d.hinge;this.step=3;this.view='fronts';this.render();
   this.form.querySelector('[aria-label="Исполнение фасада"]')?.focus({preventScroll:true});return;
  }
  const local=d.splitSection!=null||d.column!=null;
  const level=Number(d.splitSection??d.niche??d.shelfIndex??d.clearLevel??0);
  const axis=d.clearWidth!=null?'width':d.clearLevel!=null||d.shelfIndex!=null?'height':null;
  selectCell(this,{section,level,column:Number(d.column??0),opening:Number(d.opening??(local?d.clearLevel??0:0))},axis,axis==='width'&&!local);
 }
 spec(){return wardrobeSpec(this.isDresser?syncDresser(this.fields):this.fields);}
 invalidate(){this.pending=null;this.apply.hidden=true;this.summary.hidden=true;this.output.textContent='';}
 zoomDiagram(expanded){
  const wasExpanded=this.diagramExpanded;
  if(expanded)this.formScroll=this.dialog.scrollTop;
  this.diagramExpanded=expanded;this.dialog.toggleAttribute('data-zoom',expanded);
  this.zoom.textContent=expanded?'Вернуться к анкете':'Развернуть схему';this.zoom.setAttribute('aria-expanded',String(expanded));
  if(this.dialog.open&&(expanded||wasExpanded)){this.dialog.scrollTop=expanded?0:this.formScroll??0;this.zoom.focus({preventScroll:true});}
 }
 rememberLayout(){
  return {fields:structuredClone(this.fields),keys:this.sourceKeys,section:this.activeSection,level:this.nicheIndex,column:this.column,gap:this.gapIndex,interior:this.interior};
 }
 undoLayout(){
  const old=this.layoutUndo.pop();if(!old)return;
  this.fields=old.fields;this.sourceKeys=old.keys;this.activeSection=old.section;this.nicheIndex=old.level;
  this.gapIndex=old.gap;this.column=old.column;this.interior=old.interior;this.shelfScopes={};this.shelfDrafts={};
  this.invalidate();this.render();
 }
 changed(rebuild=false){
  if(!this.isDresser)this.fields.height=lowerBodyHeight(this.fields);
  const old=this.layoutAnchor;
  if(old&&!this.isDresser){
    const changed=Object.keys({...old.fields,...this.fields}).filter(k=>!sameAssistantSpec(old.fields[k],this.fields[k]));
    const layout=['sections','sectionShelves','shelfChoices','shelfLevels','topGaps','gapLocks','nicheSplits','drawerBanks','dividerPositions','dividerJoints','clearLayout','drawerFixing','rods','fittings','doorFittings','lighting','lightKit','surround'];
    if(changed.includes('sectionShelves'))layout.push('machining');
    if(changed.length&&this.step<=2&&changed.every(k=>layout.includes(k))){
      this.layoutUndo.push(old);if(this.layoutUndo.length>20)this.layoutUndo.shift();
    }else if(changed.length)this.layoutUndo=[];
  }
  this.invalidate();
  if(rebuild)this.render();
  else{this.layoutAnchor=this.rememberLayout();this.draw();this.controls();}
 }
 number(key,label,min,max){
  const wrap=el('label',label),input=el('input');input.type='number';input.min=min;input.max=max;input.step='1';input.value=this.fields[key];input.setAttribute('aria-label',label);
  input.oninput=()=>{this.fields[key]=input.value===''?NaN:Number(input.value);this.changed();};wrap.append(input);this.form.append(wrap);
 }
 select(parent,label,choices,value,change){
  const wrap=el('label',label),s=el('select');s.setAttribute('aria-label',label);
  for(const [v,text,disabled]of choices){const o=el('option',text);o.value=v;o.disabled=Boolean(disabled);s.append(o);}s.value=String(value);s.onchange=()=>change(s.value);wrap.append(s);parent.append(wrap);return s;
 }
 error(step=this.step){
  try{const s=this.spec();if(surroundLayout(s).height+s.elevation>this.app.adapter.room.height)throw Error((this.isDresser?'Комод':'Шкаф')+' выше помещения. Уменьшите высоту.');
   if(step>=4&&this.fields.drawerBanks?.some(b=>b?.kind==='internal'&&!b.layout))throw Error('В «Наполнении» откройте старый блок шуфляд и нажмите «Рассчитать по выбранной нише», чтобы задать полку и верхний зазор 30 мм.');
   if(step>=4&&this.previewBuilt?.rodIssues?.length)throw Error(this.previewBuilt.rodIssues.join(' '));
   if(step>=4&&this.previewBuilt?.drawerIssues?.length)throw Error(this.previewBuilt.drawerIssues.join(' '));
   if(step>=4)for(const role of ['body',...(s.back?['back']:[]),...(s.front||hasSurround(s.surround)||s.drawerBanks?.some(Boolean)?['front']:[]),...(s.thickness!==18&&s.drawerBanks?.some(Boolean)?['drawer']:[])]){const e=questionnaireMaterialError(this.materials[role],role==='back'?(s.backThickness??3):role==='front'||role==='drawer'?18:s.thickness);if(e)throw Error((role==='back'?'Задняя стенка: ':role==='front'?'Фасад: ':role==='drawer'?'Короб шуфляды: ':'Корпус: ')+e);}
   return '';
  }catch(e){return e.message;}
 }
 go(index){if(this.busy||index<0||index>4)return;const invalid=this.form?.querySelector?.('input:invalid');if(invalid){invalid.reportValidity();return;}if(!this.isDresser&&index>this.step && !(index===3&&(this.fields.front||this.fields.drawerBanks?.some(Boolean)||trimSides.some(side=>this.fields.surround?.[side]?.start==='facade'))) && !(index===1&&this.fields.dividerPositions) && !(index===2 && (this.fields.joints||this.fields.dividerJoints||this.fields.shelfChoices||this.fields.shelfLevels||this.fields.drawerBanks||this.fields.rods?.length))){const e=this.error();if(e){this.output.textContent=e;return;}}this.step=index;this.view=['body','sections','sections','fronts','body'][index];this.render();this.steps[index].focus();}
 groupTabs(){
  const nav=el('nav');nav.className='wardrobe-subsections';nav.setAttribute('aria-label','Подразделы корпуса');
  for(const key of ['body','surround','feet','plinth','back','lighting','machining']){
   const b=button(key==='machining'?'Обработка детали':drawingTitles[key],()=>{this.view=key;this.render();this.form.querySelector('[data-subsection="'+key+'"]').focus({preventScroll:true});});
   b.dataset.subsection=key;b.setAttribute('aria-pressed',String(this.view===key));nav.append(b);
  }
  this.form.append(nav);
 }
 sectionTabs(){
  const n=this.fields.sections;this.activeSection=Math.min(this.activeSection,n-1);
  if(n===1)return;
  const nav=el('div');nav.className='wardrobe-subsections';nav.setAttribute('role','group');nav.setAttribute('aria-label','Выбранная секция');
  for(let i=0;i<n;i++){
   const b=button('Секция '+(i+1),()=>{this.activeSection=i;this.nicheIndex=0;this.gapIndex=0;this.column=0;this.wholeWidth=false;this.render();this.form.querySelector('[data-section="'+i+'"]').focus({preventScroll:true});});
   b.dataset.section=i;b.setAttribute('aria-pressed',String(i===this.activeSection));nav.append(b);
  }this.form.append(nav);
 }
 render(){
  if(!this.isDresser)this.fields.height=lowerBodyHeight(this.fields);
  const preview=buildPreview(this);this.previewBuilt=preview.built??null;
  const editorKey=this.step===2?[this.activeSection,this.interior,this.nicheIndex,this.column,this.gapIndex].join('/'):this.step===1?'shelves/'+this.activeSection:'';
  const keep=editorKey&&editorKey===this.editorKey;
  this.editorKey=editorKey;
  this.dialog.toggleAttribute('data-interior',this.step===2);
  const cellView=this.step<=2&&(this.step>0||['body','surround','lighting'].includes(this.view));
  this.dialog.toggleAttribute('data-cell-view',cellView);
  const scroll=this.dialog.scrollTop,focused=document.activeElement;
  const focus=keep&&this.form.contains(focused)?{tag:focused.localName,label:focused.getAttribute('aria-label')||focused.textContent}:null;
  const expanded=keep?[...this.form.querySelectorAll('details[open]')].map(d=>d.firstElementChild.textContent):[];
  this.refreshReady=null;this.form.replaceChildren();this.steps.forEach((b,i)=>{b.setAttribute('aria-current',i===this.step?'step':'false');b.disabled=this.busy;});this.form.append(el('h3',(this.isDresser?dresserSteps:WARDROBE_STEPS)[this.step]));
  if(this.isDresser&&this.step<4){dresserControls(this);}
  else if(this.step===0){
   this.groupTabs();
   if(this.view==='body'){
   const label=el('label','Название шкафа'),name=el('input');name.type='text';name.maxLength=120;
   name.value=this.cabinetName;name.setAttribute('aria-label','Название шкафа');
   name.oninput=()=>{this.cabinetName=name.value;this.invalidate();};label.append(name);this.form.append(label);
   this.number('width','Ширина, мм',200,2400);heightControl(this);this.number('depth','Глубина ЛДСП, мм',200,1200);
   this.select(this.form,'Толщина корпуса, мм',[...new Set([16,18,25,this.fields.thickness])].map(n=>[n,n+' мм']),this.fields.thickness,v=>{this.fields.thickness=Number(v);resizeDividerChoices(this.fields);if(Number(v)!==18)delete this.fields.joints;this.fields.shelfChoices=shelfRows(this.fields).map(row=>row.map(value=>{try{choice(value,Number(v));return value;}catch{return defaultShelf;}}));this.shelfDrafts={};this.serial.body++;this.materials.body=null;this.materialChanged.body=true;this.changed();});
   startWardrobeControls(this,this.form);
   const division=el('fieldset');division.append(el('legend','Деление корпуса'));sectionChoices(this,division);this.form.append(division);
   for(const [key,title,overlay] of [['bottomFit','Конструкция дна','Накладное дно'],['topFit','Конструкция крыши','Накладная крыша']])
    this.select(this.form,title,[['inset','Между боковинами'],['overlay',overlay],...(key==='bottomFit'?[['none','Без дна · заднее ребро 100 мм']]:[])],this.fields[key]??'inset',v=>{this.fields[key]=v;this.changed();this.render();});
   if(this.fields.bottomFit==='none'){
    this.fields.braceOffset??=0;this.number('braceOffset','Низ заднего ребра от низа корпуса, мм',0,this.fields.height-100);
    this.form.append(el('small','Заднее ребро между боковинами · 100 мм · кромка 1 мм по обеим длинным сторонам.'));
   }
   }else if(this.view==='feet')this.footControls();
   else if(this.view==='lighting'){lightControls(this);lightKitControls(this);}
   else if(this.view==='surround')surroundControls(this);
   else if(this.view==='machining')machiningControls(this);
   else if(this.view==='plinth')this.plinthControls();
   else{
   const mount=this.fields.backMount;
   const previous=mount&&!mount.layout?[[mount.kind,mount.kind==='groove'?'ХДФ в пазу · сохранённая посадка':'Правая четверть · сохранённая посадка']]:[];
   const method=mount?.kind==='rabbet'&&mount.layout?'quarter':mount?.layout??mount?.kind;
   this.select(this.form,'Задняя стенка',[['yes','Накладная ЛХДФ 3 мм'],['sides','Паз в боковинах · ХДФ под гвозди'],['quarter','Четверть'],['perimeter','Паз по кругу'],...previous,...[16,18].map(n=>[String(n),'Вкладная ЛДСП '+n+' мм']),['no','Без задней стенки']],this.fields.back?(method??this.fields.backThickness??'yes'):'no',v=>{
    if(v===method)return;
    const previousMaterial=this.materials.back;
    this.fields.back=v!=='no';delete this.fields.backThickness;delete this.fields.backMount;
    if(['sides','perimeter','quarter'].includes(v))this.fields.backMount=defaultBackMount(v==='quarter'?'right':v);
    if(['16','18'].includes(v))this.fields.backThickness=Number(v);
    this.serial.back++;this.materialChanged.back=true;this.materials.back=null;
    if(this.fields.back&&Number(previousMaterial?.thickness)===(this.fields.backThickness??3))this.materials.back=previousMaterial;
    else if(this.fields.back&&!this.fields.backThickness)this.loadMaterial('back',CARCASS_BACK_MATERIAL_ID);
    else if(Number(this.materials.body?.thickness)===Number(v))this.materials.back=this.materials.body;
    this.changed();this.render();
   });
   if(this.fields.backMount){
    backMountControls(this);
    this.form.append(el('small','Задний торец каждой детали с выборкой оклеивается ПВХ.'));
   }
   else this.form.append(el('p',this.fields.backThickness?'Вкладная стенка между стойками, дном и крышей. Чашки открываются сзади. На обеих боковинах эксцентрики стоят равномерно с шагом до 400 мм. На дне и крыше по 1 паре при длине детали до 800 мм и по 2 при большей длине.':this.fields.back?'Накладная ЛХДФ добавляет 3 мм к глубине.':'Задняя стенка отсутствует.'));
   if(this.fields.backThickness)this.form.append(jointPhotos('cam_dowel'));
   }
  }else if(this.step===1){
   this.sectionTabs();this.shelfOverview();
   const division=el('details');division.className='shelf-division';division.append(el('summary','Деление и ширина секций'));
   sectionChoices(this,division);if(this.fields.sections>1)this.sectionPositions(division);
   this.form.append(division);
  }else if(this.step===2){
   this.sectionTabs();
   const i=this.activeSection,count=this.fields.sectionShelves[i];
   this.nicheIndex=Math.min(this.nicheIndex??0,count);
   sectionPresetControls(this,this.form,activeCell(this));
   const context=el('p',openingLabel(this.nicheIndex,count));context.className='opening-context';this.form.append(context);
   const tabs=el('div');tabs.className='wardrobe-subsections';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Элемент наполнения');
   for(const [key,label] of [['cell','Ниша'],['shelf','Полки'],['rod','Штанги'],['fitting','Фурнитура AKS'],['drawer','Шуфляды'],['split','Перегородка']]){
    const b=button(label,()=>{this.interior=key;this.wholeWidth=false;this.render();});b.setAttribute('aria-pressed',String(this.interior===key));tabs.append(b);
   }
   this.form.append(tabs);
   if(this.interior==='cell')cellControls(this,this.form);
   else if(this.interior==='rod')rodControls(this,this.form,activeCell(this));
   else if(this.interior==='fitting')fittingControls(this,this.form,activeCell(this));
   else if(this.interior==='drawer')drawerControls(this,this.form,i);
   else if(this.interior==='split'||this.interior==='shelf'&&splitAt(this.fields,i,this.nicheIndex)?.kind==='shelves')splitControls(this,this.form,i);
   else{
    const group=el('fieldset');group.append(el('legend','Полки · секция '+(i+1)));this.form.append(group);
    this.select(group,'Полок в секции '+(i+1),Array.from({length:11},(_,n)=>[n,n?String(n):'Без полок']),count,v=>this.changeShelfCount(Number(v)));
    if(count){
     gapEditor(this,group,i);
     const hardware=el('details');hardware.append(el('summary','Материал и крепление полок'));shelfQuestionnaire(this,hardware,i);group.append(hardware);
    }
   }
   const fittings=el('details');fittings.append(el('summary','Крепёж полок, корпуса и стоек'));
   this.select(fittings,'Крепёж полок у шуфляд и заднего ребра',[['cam_dowel','Эксцентрик + шкант'],['confirmat','Конфирматы 7×50']],this.fields.drawerFixing,value=>{
    this.fields.drawerFixing=value;prepareDrawerCovers(this.fields);this.changed(true);
   });
   this.jointQuestionnaire(fittings);this.form.append(fittings);
  }else if(this.step===3){
   if(this.fields.surround?.upper)upperFrontTabs(this);
   if(this.view==='upper-fronts'&&this.fields.surround?.upper)upperFrontControls(this);
   else doorControls(this);
   if(this.view!=='upper-fronts'&&this.fields.front){
    const warning=el('p');warning.className='front-choice-warning';warning.setAttribute('role','status');warning.hidden=true;this.form.append(warning);
    const box=el('details');box.className='wardrobe-hinge';box.append(el('summary','Петли и присадка'));
    this.select(box,'Предпочтительный отступ петли',[[90,'90 мм сверху и снизу'],[130,'130 мм сверху и снизу']],this.fields.front.offset,v=>{this.fields.front.offset=Number(v);this.changed();});
    const lbl=el('label','Масса одной готовой створки, кг'),input=el('input');
    const framed=Object.values(this.fields.front.hinges??{}).some(h=>wardrobeHinges[h.article]?.frame);
    input.type='number';input.min='0.01';input.max='22';input.step='0.01';input.placeholder=framed?'Авто · по материалу каждой створки':'Авто · ЛДСП 700 кг/м³';input.value=this.fields.front.massKg??'';
    input.oninput=()=>{if(input.value==='')delete this.fields.front.massKg;else this.fields.front.massKg=Number(input.value);this.changed();};lbl.append(input);box.append(lbl);
    const hint=el('details');hint.append(el('summary','Как рассчитаны петли'),el('p',framed?'Для рамки Z1 количество петель Blum зависит от высоты и массы створки. В расчёт входят стекло 4 мм и четыре алюминиевых профиля.':'Таблица AKS для чашки Ø35 учитывает высоту и массу одной двери шириной до 600 мм. Уточните массу, если известен вес готового фасада. Отступ 130 мм — схема мастерской.'));box.append(hint);this.form.append(box);
   }

  }else{
   if(this.mode.value==='update'){
    const label=el('label'),input=el('input');input.type='checkbox';input.checked=this.resetSideEdges;
    input.onchange=()=>{this.resetSideEdges=input.checked;this.changed();};
    label.append(input,document.createTextNode('Пересчитать кромку обеих стоек по конструкции'));this.form.append(label);
   }
   this.materialPicker('body','Материал корпуса',Number(this.fields.thickness));if(this.fields.drawerBanks?.some(Boolean)&&this.fields.thickness!==18)this.materialPicker('drawer','Короба и проставки шуфляд',18);if(this.fields.front||hasSurround(this.fields.surround)||this.fields.drawerBanks?.some(Boolean))this.materialPicker('front','Материал фасадов',18);if(this.fields.back)this.materialPicker('back','Задняя стенка',this.fields.backThickness??3);
   this.form.append(el('p','Материалы из вашего каталога. Толщина должна совпадать с деталями. Ручные назначения отдельных деталей сохранятся, если здесь не выбирать другой материал.'));
  }
  if(this.step<=2&&this.layoutUndo.length){
   const undo=button('Отменить изменение',()=>this.undoLayout());undo.className='cell-undo';this.form.append(undo);
  }
  this.layoutAnchor=this.rememberLayout();this.draw(preview);this.controls();
  if(keep){
   for(const d of this.form.querySelectorAll('details'))if(expanded.includes(d.firstElementChild.textContent))d.open=true;
   if(focus){
     const target=[...this.form.querySelectorAll(focus.tag)].find(n=>(n.getAttribute('aria-label')||n.textContent)===focus.label);
     target?.focus({preventScroll:true});
   }
   this.dialog.scrollTop=scroll;
  }
 }
 footControls(){
  const box=el('section');box.className='foot-picker';
  const selected=feetCatalogue.find(leg=>leg.article===this.fields.feet?.article);
  const current=plinthFoot(this.fields);
  const summary=el('div'),caption=el('small',selected?selected.name.split(' · ')[0]+(selected.finish?' · '+selected.finish:'')+(selected.plinth?(selected.white?', белая':', чёрная'):'')+' · '+selected.height+' мм · арт. '+selected.article:'Без опор');
  summary.append(caption);box.append(summary);this.form.append(box);
  const refresh=focus=>{
   this.footOpen=true;this.render();this.form.querySelector(focus)?.focus({preventScroll:true});
  };
  for(const [id,title] of [['plinth','Накладные под цоколь'],['decor','Декоративные опоры'],['end','Торцевые опоры']]){
   const group=el('details');group.className='foot-group';group.setAttribute('name','wardrobe-foot-category');
   group.open=this.footGroup===id;
   group.ontoggle=()=>{
    if(!group.isConnected)return;
    if(group.open){
     this.footGroup=id;
     for(const sibling of box.querySelectorAll('.foot-group'))if(sibling!==group)sibling.open=false;
    }else if(this.footGroup===id)this.footGroup=null;
   };
   group.append(el('summary',title));box.append(group);
   const models=feetCatalogue.filter(leg=>leg.category===id);
   if(id==='decor'){
    this.decorChoices(group,models,selected,refresh);
    continue;
   }
   if(!models.length){group.append(el('p','Модели пока не добавлены.'));continue;}
   if(id==='plinth'){
    const heights=[...new Set(models.map(leg=>leg.height))].sort((a,b)=>a-b);
    this.select(group,'Высота цокольных ножек, мм',[['all','Все высоты'],...heights.map(h=>[h,h+' мм'])],this.footFilter,v=>{
     this.footFilter=v;this.footGroup=id;refresh('.foot-group select');
    });
   }
   for(const leg of models){
    if(id==='plinth'&&this.footFilter!=='all'&&leg.height!==Number(this.footFilter))continue;
    const row=button('',()=>{
     const old=this.fields.feet;
     this.fields.feet={...(current&&leg.plinth?old:{}),article:leg.article,front:leg.plinth?(current?old.front:80):50,rear:current&&leg.plinth?old.rear:50};
     this.footGroup=id;this.invalidate();refresh('[data-foot="'+leg.article+'"]');
    });
    row.className='foot-row';row.dataset.foot=leg.article;row.setAttribute('aria-pressed',String(selected===leg));
    const image=fittingImage(leg.article,leg.name+' · '+leg.article);
    const text=el('span');text.append(el('strong',leg.name.split(' · ')[0]),el('small','Арт. '+leg.article+' · '+leg.height+' мм'+(leg.plinth?(leg.white?' · белая':' · чёрная'):'')));
    row.append(image,text);group.append(row);
   }
  }
  const none=button('Без опор',()=>{delete this.fields.feet;this.invalidate();refresh('.foot-clear');});
  none.className='foot-clear';none.setAttribute('aria-pressed',String(!selected));if(!this.isDresser)box.append(none);
  if(this.fields.feet){
   const decorative=selected?.category==='decor';
   for(const [key,title] of [['front',decorative?'Отступ опор от переднего края, мм':'От переднего края до оси, мм'],['rear',decorative?'Отступ опор от заднего края, мм':'От заднего края до оси, мм']]){
    const wrap=el('label',title),input=el('input');input.type='number';input.min=10;input.step=1;input.value=this.fields.feet[key];input.setAttribute('aria-label',title);
    input.oninput=()=>{this.fields.feet[key]=input.valueAsNumber;this.changed();};wrap.append(input);box.append(wrap);
   }
   if(!current&&!decorative)box.append(el('small','Пятка Ø20 мм · муфта М6 (106466) · присадка Ø8 × 16 мм'));
  }
 }
 plinthControls(){
  const current=plinthFoot(this.fields),box=el('fieldset');box.append(el('legend','Примыкания цоколя'));
  this.form.append(box);
  if(!current){
   box.append(el('p','Цоколь появляется при установке накладных кухонных опор.'),button('Выбрать опоры',()=>{this.view='feet';this.render();}));return;
  }
    for(const [key,label] of [['left','Слева'],['right','Справа']])
     this.select(box,label,[['end','До края корпуса / стены'],['side','До стойки в пол',this.fields.bottomFit==='overlay']],this.fields.feet[key]??'end',value=>{
      if(value==='side')this.fields.feet[key]='side';else delete this.fields.feet[key];this.changed();this.render();
     });
    box.append(el('small','Опора '+current.height+' мм · цоколь с кромкой '+plinthPanel(this.fields).height+' мм · зазор сверху '+plinthClearanceMm+' мм · ПВХ по четырём торцам · '+current.screws+' самореза на опору'));
 }
 decorChoices(group,models,selected,refresh){
  const choose=(leg,focus)=>{
   const old=selected?.category==='decor'?this.fields.feet:null;
   this.fields.feet={article:leg.article,front:old?.front??10,rear:old?.rear??10};
   this.footGroup='decor';this.invalidate();refresh(focus);
  };
  for(const family of new Set(models.map(f=>f.name))){
   const variants=models.filter(f=>f.name===family);
   const active=selected?.name===family?selected:null;
   const shown=active??variants.find(f=>!f.issue)??variants[0];
   const section=el('div');section.className='decor-family';
   const focus='[data-series="'+family+'"]';
   const card=button('',()=>choose(shown,focus));card.dataset.series=family;card.className='foot-row';
   card.setAttribute('aria-pressed',String(!!active));
   const photo=fittingImage(shown.article,family+' · '+shown.finish);
   const text=el('span');text.append(el('strong',family));
   const heights=[...new Set(variants.map(f=>f.height))].sort((a,b)=>a-b);
   text.append(el('small',shown.issue?'Проверяется высота фрагмента':active?active.height+' мм · '+active.finish+' · арт. '+active.article:heights.join(' / ')+' мм'));
   if(shown.article==='85881')text.append(el('small','На фото HELLY 130 мм · арт. 112445. Выбрана опора 150 мм · арт. 85881.'));
   card.append(photo,text);section.append(card);group.append(section);
   if(shown.issue){card.dataset.unavailable='true';card.disabled=true;continue;}
   if(!active)continue;
   if(heights.length>1)this.select(section,'Высота '+family+', мм',heights.map(h=>[h,h+' мм']),active.height,value=>{
    const candidates=variants.filter(f=>!f.issue&&f.height===Number(value));
    choose(candidates.find(f=>f.finish===active.finish)??candidates[0],'.decor-family select');
   });
   const finishes=el('div');finishes.className='decor-finishes';finishes.setAttribute('aria-label','Цвет '+family);
   for(const variant of variants.filter(f=>f.height===active.height)){
    const b=button('',()=>choose(variant,'[data-finish="'+variant.article+'"]'));
    b.dataset.finish=variant.article;b.setAttribute('aria-pressed',String(variant===active));
    const chip=el('i');chip.style.background=({'брашированное золото':'#b79a60','матовый хром':'#bdc2c4','чёрный хром':'#55595d','чёрный муар':'#383837'})[variant.finish]??'#292a29';
    b.append(chip,document.createTextNode(variant.finish+(variant.issue?' · проверяется артикул':'')));
    if(variant.issue){b.dataset.unavailable='true';b.disabled=true;}
    finishes.append(b);
   }
   section.append(finishes);
  }
 }
 changeShelfCount(count){
  const section=this.activeSection;
  if(count===this.fields.sectionShelves[section])return;
  try{
   const draft=structuredClone(this.fields),changes=setSectionShelfCount(draft,section,count);
   wardrobeSpec(draft);
   let keys=this.sourceKeys,level=this.nicheIndex??0;
   for(const edit of changes){
    if(edit.delta<0&&keys){keys=new Map(keys);keys.delete('shelf-'+section+'-'+edit.level);}
    keys=keysAfterInsertion(keys,{section,level:edit.level},edit.delta);
    if(level>edit.level)level+=edit.delta;
   }
   this.sourceKeys=keys;this.fields=draft;this.nicheIndex=Math.max(0,Math.min(level,count));
   this.gapIndex=this.nicheIndex;this.levelIndex=Math.min(this.nicheIndex,Math.max(0,count-1));
   delete this.shelfScopes[section];delete this.shelfDrafts[section];this.changed(true);
  }catch(error){
   this.render();this.output.textContent=error.message;
   const feedback=this.form.querySelector('[data-count-feedback]');
   if(feedback){feedback.hidden=false;feedback.textContent=error.message;}
  }
 }
 shelfOverview(){
  const f=this.fields,section=this.activeSection,count=f.sectionShelves[section];
  const group=el('fieldset');group.className='shelf-overview';
  group.append(el('legend',f.sections===1?'Количество полок':'Количество полок в секции '+(section+1)));
  const choices=el('div');choices.className='shelf-count-options';choices.setAttribute('role','group');choices.setAttribute('aria-label','Количество полок');
  for(let n=0;n<=4;n++){
   const b=button(String(n),()=>this.changeShelfCount(n));b.dataset.shelfCount=String(n);b.setAttribute('aria-pressed',String(count===n));choices.append(b);
  }
  const more=el('select');more.setAttribute('aria-label','От пяти до десяти полок');
  const option=el('option','5–10');option.value='';option.disabled=true;more.append(option);
  for(let n=5;n<=10;n++){const o=el('option',String(n));o.value=n;more.append(o);}
  more.value=count>4?String(count):'';more.onchange=()=>this.changeShelfCount(Number(more.value));choices.append(more);
  const feedback=el('p');feedback.dataset.countFeedback='';feedback.setAttribute('role','status');feedback.hidden=true;
  group.append(choices,feedback);this.form.append(group);
  const openings=el('fieldset');openings.className='shelf-openings';openings.append(el('legend','Куда поставить наполнение'));
  const list=el('div');list.className='shelf-opening-list';
  try{
   const rooms=measuredRooms(f,section,0,null,this.previewBuilt?.installedLevels);
   for(let level=rooms.length-1;level>=0;level--){
    const b=button('',()=>selectCell(this,{section,level}));b.dataset.openingLevel=level;
    b.append(el('span',openingLabel(level,count)),el('strong',(rooms[level].top-rooms[level].bottom)+' мм'));list.append(b);
   }
  }catch(error){list.append(el('p',error.message));}
  openings.append(list);this.form.append(openings);
 }
 sectionPositions(parent){
  const f=this.fields;
  if(f.sections>1)this.select(parent,'Положение внутренних стоек',[['center','Равные секции'],['manual','Вручную, мм']],f.dividerPositions?'manual':'center',mode=>{
   if(mode==='manual'){
    let start=0;
    f.dividerPositions=sectionWidths(f).slice(0,-1).map(width=>{const end=start+width;start=end+f.thickness;return end;});
   }else delete f.dividerPositions;
   this.changed();this.render();
  });
  if(f.sections>1){
   const i=this.activeSection,wrap=el('label','Чистая ширина секции '+(i+1)+', мм'),input=el('input');
   input.type='number';input.min=100;input.max=f.width-2*f.thickness;input.step=1;input.dataset.clearWidth='';input.value=sectionWidths(f)[i];
   input.setAttribute('aria-label','Чистая ширина секции '+(i+1)+', мм');
   input.onchange=()=>{
    try{const draft=structuredClone(f);setClearWidth(draft,{section:i,level:0},input.valueAsNumber);wardrobeSpec(draft);
      this.fields=draft;this.changed(true);
    }catch(e){this.output.textContent=e.message;input.value=sectionWidths(f)[i];}
   };
   input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}};
   wrap.append(input);parent.append(wrap);
  }
  const sizes=el('p');
  const update=()=>{if(f.dividerPositions?.some(n=>!Number.isInteger(n))){sizes.textContent='';return;}const widths=sectionWidths(f);sizes.textContent=widths.every(n=>Number.isInteger(n)&&n>0)?'Чистая ширина секций слева направо: '+widths.join(' / ')+' мм.':'';};
  if(f.dividerPositions){
   const advanced=el('details');advanced.append(el('summary','Положения стоек'));parent.append(advanced);
   advanced.append(el('p','От внутренней плоскости левой боковины до левой плоскости каждой стойки.'));
   f.dividerPositions.forEach((position,i)=>{
    const label='Положение стойки '+(i+1)+', мм',wrap=el('label',label),input=el('input');
    input.type='number';input.step='1';input.min='0';input.max=String(f.width-2*f.thickness);
    input.setAttribute('aria-label',label);input.value=Number.isFinite(position)?position:'';
    input.oninput=()=>{f.dividerPositions[i]=input.valueAsNumber;update();this.changed();};
    wrap.append(input);advanced.append(wrap);
   });
  }
  update();parent.append(sizes);
 }
 jointQuestionnaire(parent=this.form){
  const box=el('fieldset');box.append(el('legend','Крепёж корпуса'));parent.append(box);
  if(this.fields.thickness!==18){box.append(el('p','Эти схемы доступны для плиты 18 мм.'));return;}
  const current=this.fields.joints??{top:'none',bottom:'none'};
  for(const [key,label] of [['top','Крыша'],['bottom','Дно']]){
   const value=current[key];
   this.select(box,label+' · крепёж',Object.entries(jointOptions).map(([code,text])=>[code,text,code==='cam_dowel'&&this.fields.depth<276]),value,v=>{
    this.fields.joints={...current,[key]:v};this.changed();this.render();
   });
   if(value==='none')continue;
   box.append(jointPhotos(value));
   const ns='http://www.w3.org/2000/svg',diagram=document.createElementNS(ns,'svg');
   diagram.setAttribute('class','joint-layout');diagram.setAttribute('viewBox','0 0 500 28');diagram.setAttribute('aria-hidden','true');
   const cam=value==='cam_dowel',inset=cam?100:70,depth=this.fields.depth;
   const positions=cam?[inset,inset+32,depth-inset-32,depth-inset]:[inset,depth-inset];
   for(const [i,z] of positions.entries()){
    const isDowel=cam&&(i===1||i===2);
    const x=500*z/depth,dot=document.createElementNS(ns,'circle');
    dot.setAttribute('cx',x);dot.setAttribute('cy','14');dot.setAttribute('r',isDowel?'3.5':'5.5');
    dot.setAttribute('fill',isDowel?'#a57440':'#315e4d');diagram.append(dot);
   }
   box.append(diagram,el('small',jointQuantity(value)),el('small','Оси от переднего края, мм: '+positions.join(' · ')));
  }
  for(const [i,settings] of (this.fields.dividerJoints??[]).entries()){
   const group=el('fieldset'),number=i+1;
   group.append(el('legend','Внутренняя стойка '+number+' · между секциями '+number+' и '+(number+1)));
   for(const [end,direction] of [['top','сверху'],['bottom','снизу']]){
    const options=Object.entries(jointOptions).map(([code,text])=>[code,text,code==='cam_dowel'&&this.fields.depth-1-rearClearance(this.fields)<216]);
    this.select(group,'Стойка '+number+' · крепление '+direction,options,settings[end],value=>{
     settings[end]=value;this.changed();this.render();
    });
    if(settings[end]&&settings[end]!=='none')group.append(jointPhotos(settings[end]));
   }
   parent.append(group);
  }
 }
 materialPicker(role,title,thickness){
  const card=el('fieldset');const activate=()=>{const view={body:'body',back:'back',front:'fronts',drawer:'sections'}[role];if(this.view!==view){this.view=view;this.draw();}};
  card.addEventListener('focusin',activate);card.addEventListener('click',activate);card.append(el('legend',title));const m=this.materials[role];card.append(el('p',m?m.name+' · '+m.thickness+' мм':'Материал не выбран'));
  const label=el('label','Поиск: '+title),input=el('input');input.type='search';input.placeholder='Название или артикул';input.setAttribute('aria-label','Поиск: '+title);label.append(input);card.append(label);
  const results=el('div');results.className='assistant-material-results';
  const search=button('Найти материал',async()=>{const epoch=this.epoch,serial=++this.serial[role];search.disabled=true;results.textContent='Поиск…';
   try{const r=await this.app.bridge.request('/catalogue/materials?q='+encodeURIComponent(input.value.trim())+'&thickness='+thickness+'&limit=100');if(this.disposed||epoch!==this.epoch||serial!==this.serial[role]||this.step!==4)return;
    const matches=r.items.filter(x=>Number(x.thickness)===thickness).slice(0,12);results.replaceChildren();
    for(const material of matches)results.append(button(material.name+' · '+material.thickness+' мм',()=>{this.serial[role]++;this.materials[role]=material;this.materialChanged[role]=true;this.app.bridge.cacheMaterial(material);this.changed();this.render();}));
    if(!matches.length)results.textContent='Нет подходящего материала '+thickness+' мм. Уточните название или артикул.';
   }catch{results.textContent='Поиск не выполнен. Попробуйте ещё раз.';}finally{search.disabled=false;}
  });input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search.click();}};card.append(search,results);this.form.append(card);
 }
 paintDrawing(svg){
  const fragment=document.createElement('template');fragment.innerHTML=svg;
  const next=fragment.content.firstElementChild,old=this.drawing.firstElementChild;
  if(next.dataset.view!=='sections'||old?.dataset.view!=='sections'){this.drawing.replaceChildren(next);return;}
  if(old.getAttribute('viewBox')!==next.getAttribute('viewBox'))old.setAttribute('viewBox',next.getAttribute('viewBox'));
  const art=next.firstElementChild,sel=next.querySelector('[data-selected-niche]');
  if(!old.firstElementChild.isEqualNode(art))old.firstElementChild.replaceWith(art);
  const outline=old.querySelector('[data-selected-niche]');
  if(!sel){outline?.remove();return;}
  if(!outline){old.append(sel);return;}
  for(const a of sel.attributes)if(outline.getAttribute(a.name)!==a.value)outline.setAttribute(a.name,a.value);
 }
 draw(preview=buildPreview(this)){
  if(this.isDresser){drawDresser(this,preview);return;}
  const view=this.step===0&&this.view==='body'?(hasSurround(this.fields.surround)?'surround':'sections'):this.view;
  updateHeights(this,preview.built);
  this.figureTitle.textContent=view==='machining'?'Выбор детали':view==='sections'?'Вид спереди · размеры в свету':drawingTitles[view];
  const warning=this.form.querySelector('.front-choice-warning');
  if(warning)warning.hidden=true;
  try{
   if(preview.error)throw preview.error;
   const {built,issue}=preview;
   this.previewBuilt=built;
   if(this.railNotice)this.updateRailNotice(built);this.refreshReady?.();
   if(view==='lighting')updateLightQuote(this,built,issue);
   const cell=activeCell(this),slot=nicheSlot(cell.section,cell.level,splitAt(built.spec,cell.section,cell.level)?.kind==='drawers'?cell.column??0:0);
   const selected=this.step===2;
   const {svg,caption}=wardrobeDrawing(built,view,this.activeSection,this.fields.front,selected&&this.interior==='shelf'?this.levelIndex:null,
     {lighting:view==='lighting',partKey:this.partKey,showFronts:this.showMachiningFronts,rodId:this.interior==='rod'?this.rodId:null,editor:view==='sections',level:selected?cell.level:null,column:cell.column,opening:cell.opening,door:this.selectedDoor,internalFronts:!!this.inspectInternalFronts,
       dimensions:view==='sections',splitLevel:selected?cell.level:null,drawerDetail:selected&&this.interior==='drawer'});
   this.paintDrawing(svg);
   this.dimensions.textContent='Ш '+built.width+' · В '+(built.spec.overallHeight??built.envelope.height)+' · Г '+(built.depth+(issue?18:0))+' мм';
   const rodIssue=this.form.querySelector('[data-rod-issues]');if(rodIssue){rodIssue.textContent=built.rodIssues.join(' ');rodIssue.hidden=!built.rodIssues.length;}
   this.description.textContent=built.rodIssues.length?built.rodIssues.join(' '):built.drawerIssues.length?built.drawerIssues.join(' '):view==='sections'?'Нажмите на нишу или размер. Полку, штангу и перегородку можно перетащить.':caption;
   if(this.interior!=='rod'&&built.rods.length&&this.fields.depth<500)this.description.textContent+=' Глубина корпуса '+this.fields.depth+' мм. Проверьте место для плечиков перед фасадом.';
   updateNicheResult(this,built);
   if(issue&&warning){warning.textContent=issue;warning.hidden=false;}
   else if(issue)this.description.textContent=issue;
   if(this.livePreview){
    const drawers=this.step===2&&this.interior==='drawer',facades=this.step===3&&view==='fronts';
    const fittings=this.step===2&&(this.interior==='fitting'&&built.fittings.length||this.interior==='rod'&&built.fittings.some(f=>f.p.category==='rods'&&f.section===cell.section&&f.level===cell.level));
    const visible=fittings||(drawers||facades)&&(built.spec.front||built.drawerBanks?.some(Boolean));
    const previewSlot=fittings?-1:drawers?slot:this.inspectInternalFronts?drawerFacadeKey(this.selectedDoor)?.slot:null;
    try{this.livePreview.sync(visible?built:null,previewSlot,this.mode.value==='update'?this.current:null,this.materialChanged);}
    catch{this.livePreview.release();}
   }
  }catch(e){
   this.previewBuilt=null;this.livePreview?.hide();this.refreshReady?.();
   if(this.railNotice)this.railNotice.hidden=true;
   if(view==='lighting')updateLightQuote(this,null,e.message);
   updateNicheResult(this,null,e.message);
   try{
    const fields={...this.fields,rods:undefined,fittings:undefined,doorFittings:undefined,drawerBanks:undefined,front:null};
    const guide=buildCarcass(wardrobeSpec(fields),{idPrefix:'questionnaire-guide'});
    this.paintDrawing(wardrobeDrawing(guide,view,this.activeSection,null,null,{editor:view==='sections',dimensions:true,level:this.step===2?this.nicheIndex:null,column:this.column,opening:this.gapIndex}).svg);
   }catch{if(this.drawing.firstElementChild?.dataset.view!==view)this.drawing.replaceChildren();}
   this.dimensions.textContent='Проверьте параметры';this.description.textContent=e.message;
  }
 }
 updateRailNotice(built){
  const next=drawerRailSnapshot(built.drawerBanks);
  for(const [slot,change] of this.railUpdates){const now=next.get(slot);if(!now||now.family!==change.family||now.opening!==change.opening)this.railUpdates.delete(slot);}
  for(const change of drawerRailChanges(this.railSnapshot,next)){
   const previous=this.railUpdates.get(change.slot)?.previous??change.previous;
   if(previous===change.length)this.railUpdates.delete(change.slot);
   else this.railUpdates.set(change.slot,{...change,previous});
  }
  this.railSnapshot=next;
  const text=[...this.railUpdates.values()].map(r=>r.place+' · шуфляд '+r.count+'. Направляющие '+r.previous+' → '+r.length+' мм, арт. '+r.article+'. Глубина коробов пересчитана.').join(' ');
  if(this.railNotice.textContent!==text)this.railNotice.textContent=text;
  this.railNotice.hidden=!text;
 }
 controls(){
  this.manual.hidden=this.step!==4||Boolean(this.pending);this.manual.disabled=this.busy;
  this.previous.hidden=this.step===0;this.next.hidden=this.step===4;this.send.hidden=this.isDresser||this.step!==4||Boolean(this.pending);this.send.disabled=this.busy||!this.available||this.remainingCount<=0;
  this.next.disabled=this.busy;this.previous.disabled=this.busy;this.mode.disabled=this.busy;this.steps.forEach(b=>b.disabled=this.busy);
  this.form.querySelectorAll('input,select,button').forEach(b=>b.disabled=this.busy||b.dataset.unavailable==='true');
  this.apply.hidden=!this.pending;this.apply.textContent=this.mode.value==='update'?'Применить изменения':'Добавить в проект';
  this.remaining.hidden=this.isDresser;this.remaining.textContent='Проверка ИИ запускается только по кнопке. Пробных обращений на сайте осталось: '+this.remainingCount+'.';
 }
 materialOptions(){
  const selectedMaterials=Object.fromEntries(Object.entries(this.materials||{}).map(([role,m])=>[role,m?.variant_id]));
  const options={cabinetName:this.cabinetName,resetSideEdges:this.resetSideEdges,selectedMaterials,previousPartKeys:this.sourceKeys};
  if(this.mode.value==='create'||this.materialChanged.front||!this.current?.items.some(i=>i.blank_axis==='front'||surroundFace(i.item_id.split(':').at(-1))))options.frontMaterialId=this.materials?.front?.variant_id;
  if(this.mode.value==='create'||this.materialChanged.body)options.bodyMaterialId=this.materials?.body?.variant_id||null;
  if(this.fields.thickness!==18&&(this.mode.value==='create'||this.materialChanged.drawer||!this.current?.items.some(i=>/:drawer-\d+-\d+-side-left$/.test(i.item_id))))options.drawerMaterialId=this.materials?.drawer?.variant_id;
  if(this.mode.value==='create'||this.materialChanged.back||!this.current?.items.some(i=>i.item_id.endsWith(':back')))options.backMaterialId=this.materials?.back?.variant_id||null;return options;
 }
 async ask(withAI=true){
  if(this.busy||(withAI&&(!this.available||this.remainingCount<=0)))return;const error=this.error(4);if(error){this.output.textContent=error;return;}
  if(!this.app.interaction.editable()){this.output.textContent='Сначала задайте размеры помещения.';return;}
  this.invalidate();const epoch=this.epoch,stamp=assistantStamp(this.app.adapter);
  try{
   const spec=this.spec(),action=this.mode.value,options=this.materialOptions();
   const pending=prepareAssistantPlan(this.app.adapter,{action,spec},options);
   this.busy=true;this.controls();this.output.textContent='Проверяю выбранные параметры…';
   const response=withAI?await this.app.bridge.request('/3d-assistant/questionnaire','POST',{request_id:crypto.randomUUID(),action,spec,fronts:spec.front?'overlay':'none',...(spec.front||hasSurround(spec.surround)||spec.drawerBanks?.some(Boolean)?{front_material_id:this.materials.front.variant_id}:{}),body_material_id:this.materials.body.variant_id,...(spec.drawerBanks?.some(Boolean)&&spec.thickness!==18?{drawer_material_id:this.materials.drawer.variant_id}:{}),back_material_id:spec.back?this.materials.back.variant_id:null,room_height:this.app.adapter.room.height}):{state:'ready',plan:{action,spec}};
   if(this.disposed||epoch!==this.epoch)return;if(response.remaining!=null)this.remainingCount=response.remaining;
   if(response.state!=='ready')throw Error(response.message||'Проверка пока не завершена.');
   if(assistantStamp(this.app.adapter)!==stamp)throw Error('Проект изменился. Проверьте анкету заново.');
   if(response.plan.action==='clarify'){this.output.textContent=response.plan.message;return;}
   if(response.plan.action!==action||Object.keys(spec).some(k=>!sameAssistantSpec(spec[k],response.plan.spec?.[k])))throw Error('Ответ не соответствует анкете. Проект не изменён.');
   const object=this.isDresser?'комода':'шкафа';
   this.output.textContent=action==='create'?'Проверьте состав нового '+object+' и добавьте его в проект.':'Проверьте изменения выбранного '+object+'.';
   this.pending=pending;this.summary.replaceChildren(...pending.summary.map(s=>el('li',s)),el('li','Корпус: '+this.materials.body.name));this.summary.hidden=false;
  }catch(e){if(!this.disposed&&epoch===this.epoch)this.output.textContent=e.message;}
  finally{if(!this.disposed&&epoch===this.epoch){this.busy=false;this.controls();}}
 }
 commit(){
  if(!this.pending)return;const label=this.isDresser?'Комод':'Шкаф';const ok=this.app.interaction.change(label+' по анкете',()=>applyAssistantPlan(this.app.adapter,this.pending));
  if(ok){this.pending=null;this.dialog.close();this.app.scene.cabinetSelection=this.app.adapter.selected?.assistant_carcass?.group_id;this.app.sync();this.app.scene.fit('selected');this.app.adapter.status(label+' собран по анкете. Действие можно отменить одним шагом.');}
  else{this.invalidate();this.controls();this.output.textContent='Не удалось применить. Проверьте сообщение конструктора и повторите проверку анкеты.';}
 }
 dispose(){this.livePreview?.dispose();this.disposed=true;this.unsubscribe?.();this.button?.remove();this.dresserButton?.remove();this.dialog?.remove();this.style?.remove();}
}
