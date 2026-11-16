import * as THREE from './vendor/three.module.js';
import {MM_TO_WORLD,heights,elevation,tier} from './furniture-core.mjs';
import {furnitureMeasures,clearanceDimensions,dimensionValue,dimensionEdit,formatMm} from './dimension-geometry.mjs';
import {roomDimensions} from './room-dimensions.mjs';
import {roomReady} from './room-plan.mjs';
const names={width:'Ширина',height:'Общая высота',depth:'Глубина',elevation:'От пола до низа'};
const prefix={width:'Ш ',height:'В ',depth:'Г ',elevation:'От пола '};
const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
const svgNode=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
const overlap=(a,b)=>a.left<b.right+5&&a.right>b.left-5&&a.top<b.bottom+5&&a.bottom>b.top-5;

// Keep each label on its own dimension line. Move the entire line to another
// lane when necessary and clip the usable segment to the actual drawing area.
export function placeMeasure(a,b,out,offset,size,view,occupied){
  if(!a.visible||!b.visible||view.right-view.left<size.width||view.bottom-view.top<size.height)return null;
  const length=Math.hypot(b.x-a.x,b.y-a.y);
  if(length<9)return null;
  const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
  const sign=(-uy*(out.x-(a.x+b.x)/2)+ux*(out.y-(a.y+b.y)/2))<0?-1:1;
  const nx=-uy*sign,ny=ux*sign,hw=size.width/2,hh=size.height/2;
  const lane=size.height+8;
  for(const distance of [offset,offset+lane,offset+2*lane]){
    const x=a.x+nx*distance,y=a.y+ny*distance;
    let lo=0,hi=length;
    for(const [origin,unit,min,max] of [[x,ux,view.left+hw,view.right-hw],[y,uy,view.top+hh,view.bottom-hh]]){
      if(Math.abs(unit)<.001){if(origin<min||origin>max){hi=-1;break;}continue;}
      const t1=(min-origin)/unit,t2=(max-origin)/unit;
      lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
    }
    if(hi<lo)continue;
    for(const fraction of [.5,.25,.75,0,1]){
      const t=lo+(hi-lo)*fraction,cx=x+ux*t,cy=y+uy*t;
      const box={left:cx-hw,right:cx+hw,top:cy-hh,bottom:cy+hh};
      if(!occupied.some(other=>overlap(box,other)))return {cx,cy,box,ux,uy,nx,ny,distance,length};
    }
  }
  return null;
}

export class SceneDimensions{
  constructor(app){
    this.app=app;this.enabled=true;this.nodes=new Map();this.vector=new THREE.Vector3();
    this.root=element('div','scene-dimensions');this.root.id='scene-dimensions';this.root.setAttribute('aria-label','Размеры комнаты и мебели в миллиметрах');
    this.svg=svgNode('svg');this.svg.setAttribute('aria-hidden','true');this.root.append(this.svg);
    this.overview=element('div','dimension-overview');this.root.append(this.overview);
    this.roomSummary=element('button','dimension-room-summary');this.roomSummary.type='button';this.roomSummary.id='room-overall-dimensions';
    this.roomSummary.title='Показать всю комнату и размеры стен';this.roomSummary.onclick=()=>{app.interaction.cancel();app.scene.fit('room');};
    this.summary=element('div','dimension-summary');this.summary.hidden=true;this.overview.append(this.roomSummary,this.summary);
    this.subjectName=element('strong');this.subjectSize=element('span');this.summary.append(this.subjectName,this.subjectSize);
    this.obstacles=document.querySelectorAll('#planner-workspace .mf3d-left,#planner-workspace .mf3d-right,#planner-workspace .studio-camera');
    document.querySelector('.mf3d-canvas-wrap').append(this.root);
    this.toggle=element('button','secondary','Размеры');this.toggle.type='button';this.toggle.id='planner-dimensions';this.toggle.setAttribute('aria-pressed','true');this.toggle.title='Показать или скрыть размерные линии';
    document.getElementById('planner-snap').after(this.toggle);
    this.scope=element('select','dimension-scope');this.scope.id='dimension-scope';this.scope.setAttribute('aria-label','Что измерять');this.scope.title='Что измерять на сцене';
    for(const [value,title] of [['products','Шкафы'],['detail','Деталь'],['room','Комната']]){
      const option=element('option',null,title);option.value=value;this.scope.append(option);
    }
    this.toggle.after(this.scope);
    this.scope.onchange=()=>{
      if(this.scope.value==='room'){app.interaction.cancel();app.scene.fit('room');}
      else if(this.lastScope==='room'&&app.adapter.items.length)app.scene.fit('kitchen');
      this.lastScope=this.scope.value;this.render();app.scene.invalidate();
    };
    this.toggle.onclick=()=>{this.enabled=!this.enabled;this.toggle.setAttribute('aria-pressed',String(this.enabled));this.render();app.scene.invalidate();};
    this.dialog=element('dialog','dimension-dialog');this.dialog.id='dimension-editor';this.dialog.setAttribute('aria-labelledby','dimension-editor-title');
    const form=element('form');this.heading=element('h2');this.heading.id='dimension-editor-title';this.caption=element('p','dimension-editor-caption');
    const label=element('label',null,'Размер, мм');this.input=element('input');this.input.id='dimension-editor-value';this.input.type='number';this.input.step='1';this.input.min='1';this.input.required=true;label.append(this.input);
    this.hint=element('p','dimension-editor-hint');this.hint.id='dimension-editor-hint';this.input.setAttribute('aria-describedby',this.hint.id);
    this.error=element('p','dimension-editor-error');this.error.id='dimension-editor-error';this.error.setAttribute('role','alert');this.error.hidden=true;
    const buttons=element('div','dimension-editor-actions'),cancel=element('button','secondary','Отмена'),apply=element('button',null,'Применить');cancel.type='button';cancel.onclick=()=>this.dialog.close();apply.type='submit';buttons.append(cancel,apply);
    form.append(this.heading,this.caption,label,this.hint,this.error,buttons);this.dialog.append(form);document.getElementById('planner-workspace').append(this.dialog);
    form.onsubmit=e=>{e.preventDefault();this.apply();};
    this.dialog.addEventListener('close',()=>{this.editing=null;this.nodes.get(this.returnFocus)?.label.focus({preventScroll:true});});
    this.unsubscribe=app.bridge.subscribe(reason=>{if(reason==='before-project')this.close();});
    this.attach();
  }
  attach(){
    this.close();this.toggle.disabled=Boolean(this.app.scene.isFallback);
    this.app.scene.onDimensionsRender=()=>this.render();this.render();this.app.scene.invalidate();
  }
  close(){if(this.dialog.open)this.dialog.close();}
  open(d){
    const {app}=this,it=app.adapter.items.find(it=>it.item_id===d.itemId);
    if(!it||!app.interaction.editable()||app.scene.preview)return;
    app.interaction.cancel();app.adapter.select(it.item_id);
    this.editing={id:it.item_id,axis:d.axis,before:JSON.stringify(it)};this.returnFocus=d.id;
    this.heading.textContent=names[d.axis];this.caption.textContent=it.name;this.input.value=dimensionValue(it,d.axis);
    const h=heights(it);
    this.hint.textContent=d.axis==='height'?(h.base_height||h.worktop_thickness?`Корпус ${h.body_height} + основание ${h.base_height} + столешница ${h.worktop_thickness} мм. Изменится высота корпуса; основание и толщина столешницы сохранятся.`:'Высота корпуса в миллиметрах.'):
      d.axis==='width'?'Левая сторона шкафа остаётся на месте, ширина изменяется вправо.':'Глубина корпуса без выступа фасада и свеса столешницы.';
    this.input.step=d.axis==='depth'&&it.module_type==='tall_cabinet'?'0.5':'1';
    this.error.hidden=true;this.dialog.showModal();this.input.focus();this.input.select();
  }
  apply(){
    const {app,editing}=this;if(!editing)return;
    try{
      const it=app.adapter.items.find(it=>it.item_id===editing.id);
      if(!it||JSON.stringify(it)!==editing.before)throw new Error('Модуль изменился. Закройте окно и выберите размер заново.');
      if(!app.interaction.editable())throw new Error('Редактирование сейчас недоступно');
      const patch=dimensionEdit(it,editing.axis,this.input.valueAsNumber);
      app.adapter.select(it.item_id);
      if(!app.interaction.modify(patch,'Размер на сцене: '+names[editing.axis].toLowerCase()))throw new Error(document.getElementById('status')?.textContent||'Этот размер недопустим для модуля');
      app.bridge.refresh();this.dialog.close();
    }catch(error){this.error.textContent=error.message;this.error.hidden=false;}
  }
  project(p,scene){
    const v=this.vector.set(p.x*MM_TO_WORLD,p.y*MM_TO_WORLD,p.z*MM_TO_WORLD).project(scene.camera);
    return {x:(v.x+1)*scene.width/2,y:(1-v.y)*scene.height/2,visible:v.z>=-1&&v.z<=1};
  }
  render(){
    const {app}=this,s=app.scene;
    const client=document.body.classList.contains('planner-client'),hidden=!this.enabled||s.isFallback||s.xrayEnabled||client;
    this.root.hidden=Boolean(hidden);this.scope.hidden=Boolean(hidden);
    this.toggle.disabled=Boolean(s.isFallback||s.xrayEnabled);
    this.toggle.title=s.xrayEnabled?'Размеры доступны в обычном виде':'Показать или скрыть размерные линии';
    document.getElementById('planner-dimension').hidden=true;
    if(hidden)return;
    const preview=s.previewItems||[],moved=new Map(preview.map(it=>[it.item_id,it]));
    const items=app.adapter.items.map(it=>moved.get(it.item_id)||it);
    for(const it of preview)if(!app.adapter.items.some(stored=>stored.item_id===it.item_id))items.push(it);
    const visible=items.filter(it=>s.layer==='all'||tier(it)===s.layer),room=app.adapter.room;
    const roomView=this.scope.value==='room'||(!items.length&&this.scope.value==='products');
    const selectedId=preview[0]?.item_id||app.adapter.selected?.item_id;
    let dims=[],subject=null,detail=false;
    if(preview.length){
      dims=clearanceDimensions(preview,app.adapter.items,room,[...moved.keys()]).filter(d=>d.value>0);
    }else if(roomView){
      dims=roomDimensions(room,{mode:s.mode,camera:{x:s.camera.position.x/MM_TO_WORLD,z:s.camera.position.z/MM_TO_WORLD}});
    }else{
      ({dims,subject,detail}=furnitureMeasures(visible,room,{scope:this.scope.value,mode:s.mode,selectedId,wholeId:s.cabinetSelection}));
    }
    this.roomSummary.hidden=!roomView||!roomReady(room)||Boolean(preview.length);
    this.roomSummary.textContent='Комната · Ш '+formatMm(room.width)+' · Г '+formatMm(room.depth)+' · В '+formatMm(room.height)+' мм';
    this.summary.hidden=roomView||Boolean(preview.length)||!subject&&!detail;
    if(!this.summary.hidden){
      let caption='Выберите деталь или модуль на сцене',values='';
      if(subject){
        caption=subject.name||'Шкаф';
        if(detail&&subject.blank_axis&&[subject.blank_length_mm,subject.blank_width_mm,subject.blank_thickness_mm].every(Number.isFinite)){
          values=[['Д',subject.blank_length_mm],['Ш',subject.blank_width_mm],['Т',subject.blank_thickness_mm]].map(([key,v])=>key+' '+formatMm(v)).join(' · ')+' мм';
          if(subject.blank_axis==='horizontal')values+='  ·  От пола до низа '+formatMm(elevation(subject,room))+' мм';
        }else{
          values='Ш '+formatMm(subject.width)+' · В '+formatMm(dimensionValue(subject,'height'))+' · Г '+formatMm(subject.depth)+' мм';
        }
      }
      this.subjectName.textContent=caption;this.subjectSize.textContent=values;
      const h=subject&&heights(subject);
      this.summary.title=h?.worktop_thickness?'Корпус '+formatMm(h.body_height)+' + опоры '+formatMm(h.base_height)+' + столешница '+formatMm(h.worktop_thickness)+' мм':caption;
    }
    const wanted=new Set(dims.map(d=>d.id));
    for(const [id,node] of this.nodes)if(!wanted.has(id)){node.path.remove();node.label.remove();this.nodes.delete(id);}
    const canvas=s.canvas.getBoundingClientRect();
    const view={left:10,right:s.width-10,top:66,bottom:s.height-(s.width<=760?66:36)},occupied=[];
    const relative=el=>{const box=el.getBoundingClientRect();return {left:box.left-canvas.left,right:box.right-canvas.left,top:box.top-canvas.top,bottom:box.bottom-canvas.top};};
    for(const el of this.obstacles){
      if(!el.getClientRects().length)continue;
      const box=relative(el);occupied.push(box);
      if(el.classList.contains('studio-camera'))continue;
      if(s.width<=760)view.bottom=Math.min(view.bottom,box.top-6);
      else if(el.classList.contains('mf3d-left'))view.left=Math.max(view.left,box.right+8);
      else view.right=Math.min(view.right,box.left-8);
    }
    const summaryLeft=Math.max(view.left+4,106);
    this.overview.style.left=summaryLeft+'px';this.overview.style.maxWidth=Math.max(0,view.right-summaryLeft-45)+'px';
    if(!this.summary.hidden||!this.roomSummary.hidden)occupied.push(relative(this.overview));
    const priority=d=>d.selected?0:d.kind==='run'?2:1;
    dims.sort((a,b)=>priority(a)-priority(b));
    for(const d of dims)this.drawMeasure(d,s,view,occupied,Boolean(preview.length));
  }
  drawMeasure(d,scene,view,occupied,preview){
    const editable=d.kind==='module'&&!d.readOnly;
    let node=this.nodes.get(d.id);
    if(!node||node.editable!==editable){
      node?.path.remove();node?.label.remove();
      const path=svgNode('path'),label=element(editable?'button':'span','dimension-label');
      node={path,label,editable};this.nodes.set(d.id,node);this.svg.append(path);this.root.append(label);
      if(editable){label.type='button';label.onclick=()=>this.open(node.dimension);}
    }
    const {path,label}=node;node.dimension=d;
    label.dataset.kind=d.kind;label.dataset.axis=d.axis||'';label.dataset.itemId=d.itemId||'';label.dataset.dimensionId=d.id;
    const cls=' dimension-'+d.kind+(d.selected?' is-selected':'');
    label.className='dimension-label'+cls;path.setAttribute('class','dimension-line'+cls);
    const dimension=d.kind==='run'?'Ряд ':d.kind==='gap'?'Зазор ':d.prefix??prefix[d.axis]??'';
    const value=formatMm(d.value);
    label.textContent=dimension+value;
    label.title=d.kind==='module'?(d.title||'Шкаф')+' · '+names[d.axis]+' '+value+' мм'+(editable?' · Нажмите для изменения':''):
      (d.title||(d.kind==='run'?'Габарит ряда':'Размер'))+' · '+value+' мм';
    if(editable){label.setAttribute('aria-label',label.title);label.disabled=preview||!this.app.interaction.editable();}
    const a=this.project(d.a,scene),b=this.project(d.b,scene),out=this.project(d.out,scene);
    const placed=placeMeasure(a,b,out,d.offset,{width:Math.max(51,label.textContent.length*8.6+20),height:30},view,occupied);
    label.hidden=!placed;path.style.display=placed?'':'none';
    if(!placed)return;
    const {box,cx,cy,ux,uy,nx,ny,distance,length}=placed;occupied.push(box);
    label.style.left=cx+'px';label.style.top=cy+'px';
    const ax=a.x+nx*distance,ay=a.y+ny*distance,bx=b.x+nx*distance,by=b.y+ny*distance;
    const fromA=d.sourceA?this.project(d.sourceA,scene):a,fromB=d.sourceB?this.project(d.sourceB,scene):b;
    const arrow=(x,y,sign)=>`M${x},${y}l${ux*sign*5+nx*2.2},${uy*sign*5+ny*2.2}l${-nx*4.4},${-ny*4.4}Z`;
    path.setAttribute('d',`M${fromA.x},${fromA.y}L${ax+nx*4},${ay+ny*4}M${fromB.x},${fromB.y}L${bx+nx*4},${by+ny*4}M${ax},${ay}L${bx},${by}${length>24?arrow(ax,ay,1)+arrow(bx,by,-1):''}`);
  }
  dispose(){this.unsubscribe?.();this.close();this.root.remove();this.dialog.remove();this.toggle.remove();this.scope.remove();this.nodes.clear();}
}
