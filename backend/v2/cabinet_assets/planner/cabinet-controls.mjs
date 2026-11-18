import {cabinetId,heightTargets,matchCabinetHeight} from './cabinet-actions.mjs';
import {kitchenGroup,heights} from './furniture-core.mjs';

const node=(tag,text)=>Object.assign(document.createElement(tag),text?{textContent:text}:{});
function button(label,action){const b=node('button',label);b.type='button';b.className='secondary';b.onclick=action;return b;}
function countLabel(n){return n+' '+(n%10===1&&n%100!==11?'шкаф':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'шкафа':'шкафов');}

export class CabinetControls{
 constructor(app){
   this.app=app;
   const title=document.getElementById('item-title');
   this.choose=button('Выбрать шкаф целиком',()=>{
     app.scene.selectionScope='module';app.scene.cabinetSelection=cabinetId(app.adapter.selected);
     app.scene.pickedInterior=null;app.sync();
   });
   this.choose.id='cabinet-select';title.after(this.choose);
   this.panel=node('section');this.panel.id='cabinet-actions';this.panel.className='mf3d-control-card';
   this.size=node('strong');const fields=node('div');fields.className='mf3d-grid';
   this.offsets=['X','Z'].map(axis=>{
     const label=node('label','Смещение '+axis+', мм'),input=node('input');
     input.type='number';input.value='0';input.step='0.5';label.append(input);fields.append(label);return input;
   });
   this.panel.append(this.size,fields,button('Переместить шкаф',()=>{
     const [dx,dz]=this.offsets.map(i=>i.valueAsNumber);
     if(app.interaction.nudge(dx,dz))this.offsets.forEach(i=>i.value='0');
   }));
   this.edit=button('Редактировать в конструкторе',()=>app.assistant?.open('update'));
   this.edit.id='cabinet-edit';this.edit.hidden=true;document.getElementById('planner-tools').append(this.edit);
   this.panelEdit=button('Редактировать шкаф',()=>app.assistant?.open('update'));
   this.panel.append(this.panelEdit);
   this.panel.append(button('Удалить шкаф',()=>app.interaction.remove()),button('Выбрать деталь',()=>{
     app.scene.cabinetSelection=null;app.sync();
   }));
   title.closest('.mf3d-section-head').after(this.panel);
   this.xrayEnabled=false;
   this.xray=button('Рентген',()=>{
     this.xrayEnabled=!this.xrayEnabled;
     app.scene.pickedInterior=null;app.sync();
   });
   this.xray.title='Показать или скрыть наполнение всех шкафов';
   this.xray.id='cabinet-xray';document.getElementById('mode-3d').parentElement.append(this.xray);
   this.part=node('small');title.after(this.part);
   this.apply=button('',()=>{
     const it=app.adapter.selected;
     const ok=app.interaction.change('Высота кухонного ряда',()=>{
       const next=matchCabinetHeight(app.adapter,it);
       app.adapter.state.items=next.map(i=>app.adapter.persistent(i));app.adapter.notify();
     });
     if(ok){app.scene.heightOffer=null;app.sync();app.adapter.status('Высота применена. Действие можно отменить одним шагом.');}
   });
   this.apply.id='cabinet-row-height';document.getElementById('height').closest('.mf3d-control-card').append(this.apply);
 }
 sync(){
   const {adapter,scene}=this.app,it=adapter.selected,id=cabinetId(it);
   if(!id||scene.cabinetSelection!==id)scene.cabinetSelection=null;
   scene.xrayEnabled=this.xrayEnabled;
   if(scene.pickedInterior?.itemId!==it?.item_id)scene.pickedInterior=null;
   this.xray.setAttribute('aria-pressed',String(this.xrayEnabled));
   this.panel.hidden=!scene.cabinetSelection;this.choose.hidden=!id||!this.panel.hidden;
   this.part.hidden=!scene.xrayEnabled||!scene.pickedInterior;this.part.textContent=scene.pickedInterior?.name||'';
   this.edit.hidden=!this.app.assistant?.button||!id||!['shelves','divided'].includes(it.assistant_carcass.spec.recipe);
   this.panelEdit.hidden=this.edit.hidden;
   document.getElementById('item-controls').classList.toggle('whole-cabinet',!this.panel.hidden);
   if(!this.panel.hidden){
     const s=it.assistant_carcass.spec;this.size.textContent='Шкаф целиком · '+s.width+' × '+s.height+' × '+s.depth+' мм';
     if(this.lastGroup!==id)this.offsets.forEach(input=>input.value='0');
   }
   this.lastGroup=scene.cabinetSelection;
   if(!it||scene.heightOffer?.id!==it.item_id||scene.heightOffer.height!==it.height)scene.heightOffer=null;
   const targets=scene.heightOffer?heightTargets(adapter.items,it):[];
   this.apply.hidden=targets.length<2;
   scene.heightHighlights=new Set(this.apply.hidden?[]:targets.map(i=>i.item_id));
   if(!this.apply.hidden){
     const upper=kitchenGroup(it)==='upper';
     this.apply.textContent='Применить '+(upper?heights(it).body_height:it.height)+' мм ко всем '+(upper?'верхним':'нижним')+' · '+countLabel(targets.length);
   }
 }
}
