import * as THREE from './vendor/three.module.js';
import {MM_TO_WORLD,heights,tier} from './furniture-core.mjs';
import {sceneDimensions,clearanceDimensions,dimensionValue,dimensionEdit,formatMm} from './dimension-geometry.mjs';
const names={width:'Ширина',height:'Общая высота',depth:'Глубина корпуса'},short={width:'Ш',height:'В',depth:'Г'};
const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
const svgNode=tag=>document.createElementNS('http://www.w3.org/2000/svg',tag);
const overlap=(a,b)=>a.left<b.right+5&&a.right>b.left-5&&a.top<b.bottom+5&&a.bottom>b.top-5;

export class SceneDimensions{
  constructor(app){
    this.app=app;this.enabled=true;this.nodes=new Map();this.vector=new THREE.Vector3();
    this.root=element('div','scene-dimensions');this.root.id='scene-dimensions';this.root.setAttribute('aria-label','Размеры мебели в миллиметрах');
    this.svg=svgNode('svg');this.svg.setAttribute('aria-hidden','true');this.root.append(this.svg);
    this.summary=element('div','dimension-summary');this.summary.hidden=true;this.root.append(this.summary);
    document.querySelector('.mf3d-canvas-wrap').append(this.root);
    this.toggle=element('button','secondary','Размеры');this.toggle.type='button';this.toggle.id='planner-dimensions';this.toggle.setAttribute('aria-pressed','true');this.toggle.title='Размеры в мм. Нажмите на размер шкафа, чтобы изменить его.';
    document.getElementById('planner-snap').after(this.toggle);
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
    const {app}=this,s=app.scene,hidden=!this.enabled||s.isFallback||document.body.classList.contains('planner-client');
    this.root.hidden=hidden;document.getElementById('planner-dimension').hidden=true;if(hidden)return;
    const preview=s.previewItems||[],ids=new Set(preview.map(it=>it.item_id));
    const items=app.adapter.items.map(it=>preview.find(p=>p.item_id===it.item_id)||it).concat(preview.filter(it=>!app.adapter.items.some(p=>p.item_id===it.item_id))).filter(it=>s.layer==='all'||tier(it)===s.layer);
    const selected=items.find(it=>it.item_id===(preview[0]?.item_id||app.adapter.selected?.item_id));
    const dims=sceneDimensions(items,app.adapter.room,selected?.item_id);
    if(preview.length&&selected)dims.push(...clearanceDimensions(preview,app.adapter.items,app.adapter.room,[...ids]));
    const wanted=new Set(dims.map(d=>d.id));
    for(const [id,n]of this.nodes)if(!wanted.has(id)){n.path.remove();n.label.remove();this.nodes.delete(id);}
    const viewport={left:8,top:70,right:s.width-8,bottom:s.height-(s.width<=760?112:65)},occupied=[];
    this.summary.hidden=!selected||Boolean(preview.length);
    if(selected&&!preview.length){
      const h=heights(selected),terms=[`Корпус ${formatMm(h.body_height)}`];if(h.base_height)terms.push(`${selected.base==='legs'||selected.module_type==='base_cabinet'?'Ножки':'Основание'} ${formatMm(h.base_height)}`);if(h.worktop_thickness)terms.push(`Столешница ${formatMm(h.worktop_thickness)}`);
      this.summary.textContent=terms.join(' + ')+(terms.length>1?` = ${formatMm(h.overall_height_with_worktop)} мм`:' мм');
      const box=this.summary.getBoundingClientRect(),canvas=s.canvas.getBoundingClientRect();occupied.push({left:box.left-canvas.left,right:box.right-canvas.left,top:box.top-canvas.top,bottom:box.bottom-canvas.top});
    }
    dims.sort((a,b)=>(a.selected?0:a.kind==='gap'?1:a.kind==='run'?3:2)-(b.selected?0:b.kind==='gap'?1:b.kind==='run'?3:2));
    for(const d of dims){
      let node=this.nodes.get(d.id);
      if(!node){const path=svgNode('path'),label=element(d.kind==='module'?'button':'span','dimension-label');if(d.kind==='module'){label.type='button';label.onclick=()=>this.open(node.dimension);}this.svg.append(path);this.root.append(label);node={path,label};this.nodes.set(d.id,node);}
      node.dimension=d;node.label.dataset.kind=d.kind;node.label.dataset.axis=d.axis||'';node.label.dataset.itemId=d.itemId||'';
      node.label.className='dimension-label'+(d.selected?' is-selected':'')+' dimension-'+d.kind;node.path.setAttribute('class','dimension-line dimension-'+d.kind+(d.selected?' is-selected':''));
      node.label.textContent=(d.kind==='run'?'Ряд ':d.kind==='gap'?'Зазор ':d.selected?short[d.axis]+' ':'')+formatMm(d.value);
      node.label.title=d.kind==='module'?`${names[d.axis]}: ${formatMm(d.value)} мм — ${items.find(it=>it.item_id===d.itemId)?.name}. Нажмите, чтобы изменить.`:d.kind==='run'?'Общая длина сомкнутого прямого ряда, мм':`${d.title}: ${formatMm(d.value)} мм. По габариту закрытых фасадов; без свеса столешницы.`;
      if(d.kind==='module')node.label.setAttribute('aria-label',node.label.title);
      const a=this.project(d.a,s),b=this.project(d.b,s),out=this.project(d.out,s),mx=(a.x+b.x)/2,my=(a.y+b.y)/2,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      let nx=length>2?-dy/length:1,ny=length>2?dx/length:0;if(nx*(out.x-mx)+ny*(out.y-my)<0){nx=-nx;ny=-ny;}
      let show=a.visible&&b.visible&&mx>viewport.left-80&&mx<viewport.right+80&&my>viewport.top-80&&my<viewport.bottom+80&&(length>12||d.selected||d.kind==='gap');
      const width=Math.max(48,node.label.textContent.length*7.3+18),height=30;
      let box,cx,cy;
      for(let lane=0;show&&lane<8;lane++){
        const distance=d.offset+lane*34;cx=mx+nx*distance;cy=my+ny*distance;
        cx=Math.max(viewport.left+width/2,Math.min(viewport.right-width/2,cx));cy=Math.max(viewport.top+height/2,Math.min(viewport.bottom-height/2,cy));
        box={left:cx-width/2,right:cx+width/2,top:cy-height/2,bottom:cy+height/2};
        if(!occupied.some(other=>overlap(box,other)))break;if(lane===7)show=false;
      }
      node.label.hidden=!show;node.path.style.display=show?'':'none';if(!show)continue;
      occupied.push(box);node.label.style.left=cx+'px';node.label.style.top=cy+'px';
      const ax=a.x+nx*d.offset,ay=a.y+ny*d.offset,bx=b.x+nx*d.offset,by=b.y+ny*d.offset;
      const tick=(x,y)=>`M${x-nx*4},${y-ny*4}L${x+nx*4},${y+ny*4}`;
      node.path.setAttribute('d',`M${a.x},${a.y}L${ax+nx*5},${ay+ny*5}M${b.x},${b.y}L${bx+nx*5},${by+ny*5}M${ax},${ay}L${bx},${by}${tick(ax,ay)}${tick(bx,by)}M${(ax+bx)/2},${(ay+by)/2}L${cx},${cy}`);
      if(d.kind==='module')node.label.disabled=Boolean(preview.length)||!app.interaction.editable();
    }
  }
  dispose(){this.unsubscribe?.();this.close();this.root.remove();this.dialog.remove();this.toggle.remove();this.nodes.clear();}
}
