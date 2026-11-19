import {cabinetId,heightTargets,matchCabinetHeight} from './cabinet-actions.mjs';
import {kitchenGroup,heights} from './furniture-core.mjs';
import {leafKey,maxOpening,slidingKey} from './wardrobe-clearance.mjs';
import {doorLabel,doorSide,drawerFacadeKey} from './wardrobe-door-layout.mjs';
import {sectionOf,levelOf,isRightBank,splitAt} from './wardrobe-layout.mjs';

const node=(tag,text)=>Object.assign(document.createElement(tag),text?{textContent:text}:{});
function button(label,action){const b=node('button',label);b.type='button';b.className='secondary';b.onclick=action;return b;}
function countLabel(n){return n+' '+(n%10===1&&n%100!==11?'шкаф':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'шкафа':'шкафов');}

function selectOptions(select,rows,value){
 const stamp=JSON.stringify(rows);
 if(stamp!==select.dataset.options){
  select.replaceChildren(...rows.map(([id,text])=>new Option(text,id)));
  select.dataset.options=stamp;
 }
 if(value!=null)select.value=value;
}

class OpeningControls{
 constructor(app){
  this.root=node('section');this.root.id='wardrobe-opening';this.root.hidden=true;
  this.root.setAttribute('aria-label','Открывание шкафа');
  const label=(text,id,el)=>{
   const row=node('label',text);row.htmlFor=id;el.id=id;row.append(el);this.root.append(row);return row;
  };
  this.leaf=node('select');this.leafRow=label('Дверь','wardrobe-opening-leaf',this.leaf);
  this.leaf.onchange=()=>app.scene.selectWardrobeDoor(this.leaf.value);
  this.range=node('input');this.range.type='range';this.range.min=0;this.range.max=maxOpening;this.range.step=.1;
  this.angleRow=label('Угол открывания','wardrobe-opening-angle',this.range);
  this.angle=node('output');this.angle.setAttribute('for',this.range.id);this.angleRow.append(this.angle);
  this.range.oninput=()=>app.scene.setWardrobeAngle(this.range.valueAsNumber);
  this.drawer=node('select');this.drawerRow=label('Шуфляда','wardrobe-opening-drawer',this.drawer);
  this.drawer.onchange=()=>{app.scene.wardrobeMotion.drawer=this.drawer.value;app.cabinets?.sync();};
  this.extend=button('Выдвинуть шуфляду',()=>{
   const id=app.scene.wardrobeMotion.id+':drawer-'+this.drawer.value+'-face';
   const face=app.adapter.items.find(it=>it.item_id===id);
   if(face)app.scene.clickDrawer(face);
  });
  this.extend.id='wardrobe-opening-slide';this.root.append(this.extend);
  this.result=node('p');this.result.id='wardrobe-opening-result';this.result.setAttribute('role','status');this.root.append(this.result);
  document.getElementById('scene').parentElement.append(this.root);
 }
 sync(m,members,s){
  const leaves=members.filter(it=>doorSide(leafKey(it))),drawers=members.filter(it=>drawerFacadeKey(leafKey(it)));
  this.leafRow.hidden=this.angleRow.hidden=!leaves.length;
  this.drawerRow.hidden=this.extend.hidden=!drawers.length;
  selectOptions(this.leaf,leaves.map(it=>[it.item_id,doorLabel(leafKey(it))]),m.leaf);
  if(m.leaf){
   const degrees=m.degrees(m.leaf),text=degrees.toLocaleString('ru-RU')+'°';
   this.range.value=degrees;this.angle.value=text;this.range.setAttribute('aria-valuetext',text);
  }
  selectOptions(this.drawer,drawers.map(it=>{
   const {slot,index}=drawerFacadeKey(leafKey(it)),section=sectionOf(slot),level=levelOf(slot);
   const side=splitAt(s,section,level)?.kind==='drawers'?(isRightBank(slot)?' справа':' слева'):'';
   return [slidingKey(it),'№ '+(index+1)+' · секция '+(section+1)+' · ниша '+(level+1)+side];
  }),m.drawer);
  this.extend.textContent=m.drawer&&m.drawer===m.requested?'Задвинуть шуфляду':'Выдвинуть шуфляду';
  this.result.textContent=m.message;this.result.hidden=!m.message;this.result.dataset.contact=String(Boolean(m.contact));
 }
}

export class CabinetControls{
 constructor(app){
   this.app=app;
   const title=document.getElementById('item-title');
   this.choose=button('Выбрать шкаф целиком',()=>{
     app.scene.selectionScope='module';app.scene.cabinetSelection=cabinetId(app.adapter.selected);
     app.scene.pickedInterior=null;app.sync();app.scene.fit('selected');
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
   this.drawers=button('Шуфляды',()=>{app.scene.inspectWardrobe?.(app.adapter.selected);this.sync();});
   this.drawers.id='cabinet-drawers';this.drawers.hidden=true;document.getElementById('planner-tools').append(this.drawers);
   this.opening=new OpeningControls(app);this.openingChanged=()=>this.sync();
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
   scene.onWardrobeChanged=this.openingChanged;
   const members=id?adapter.items.filter(part=>cabinetId(part)===id):[];
   const hasDrawer=members.some(part=>drawerFacadeKey(leafKey(part)));
   this.drawers.hidden=!(hasDrawer||members.some(part=>doorSide(leafKey(part))))||!scene.inspectWardrobe||scene.mode!=='3d';
   const open=Boolean(id&&scene.wardrobeMotion?.id===id&&scene.wardrobeMotion.open);
   this.drawers.setAttribute('aria-pressed',String(open));this.drawers.textContent=open?'Закрыть шкаф':hasDrawer?'Шуфляды':'Открывание';
   this.drawers.title=open?'Закрыть шкаф':'Изменить угол открывания дверей'+(hasDrawer?' и проверить ход шуфляды':'');
   this.opening.root.hidden=!open||this.drawers.hidden;
   if(!this.opening.root.hidden)this.opening.sync(scene.wardrobeMotion,members,it.assistant_carcass.spec);
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
