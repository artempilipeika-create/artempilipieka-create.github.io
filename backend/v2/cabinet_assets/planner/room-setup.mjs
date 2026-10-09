import {FEATURES,dimensionsError,roomError,roomReady,featureBox} from './room-plan.mjs';
import {placementError} from './furniture-core.mjs';
const el=(tag,text,id)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(id)e.id=id;return e;};
const btn=(text,id,fn)=>{const b=el('button',text,id);b.type='button';b.onclick=fn;return b;};
const svg=(tag,attrs={},text)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;};
const clone=x=>structuredClone(x);
export class RoomSetup{
  constructor(app){
    this.app=app;this.fields={};
    const d=this.dialog=el('dialog',undefined,'room-setup');d.setAttribute('aria-labelledby','room-setup-title');
    const head=el('header');head.append(el('p','ПЕРЕД ПРОЕКТИРОВАНИЕМ','room-setup-eyebrow'),el('h2','Комната','room-setup-title'));
    head.append(btn('Закрыть','room-setup-close',()=>d.close()));d.append(head);
    this.body=el('div');this.body.className='room-setup-body';d.append(this.body);
    this.dimensions=el('section',undefined,'room-dimensions-step');this.dimensions.append(el('h3','Какие размеры у помещения?'),el('p','Укажите внутренние размеры по чистовым стенам. Прямоугольное помещение, все размеры в миллиметрах.'));
    const grid=el('div');grid.className='room-dimension-grid';
    for(const [key,label,min,max]of [['width','Длина · стены A и C',1500,12000],['depth','Глубина · стены B и D',1500,12000],['height','Высота до потолка',2000,5000]]){
      const l=el('label',label),i=el('input',undefined,'room-setup-'+key);Object.assign(i,{type:'number',min:String(min),max:String(max),step:'1',placeholder:'Укажите, мм'});i.setAttribute('aria-label',label);i.oninput=()=>this.preview();l.append(i,el('small',`${min}–${max} мм`));grid.append(l);this.fields[key]=i;
    }
    this.dimensions.append(grid);this.body.append(this.dimensions);
    this.previewRoot=el('aside',undefined,'room-measure-preview');this.body.append(this.previewRoot);
    this.alert=el('p',undefined,'room-setup-error');this.alert.setAttribute('role','alert');this.alert.hidden=true;d.append(this.alert);
    const foot=el('footer');this.projects=btn('Мои проекты','room-setup-projects',()=>{d.close();this.app.workspace.panel('left',true);window.MF3D_STUDIO.showPane('projects');});this.apply=btn('Начать проектирование','room-setup-apply',()=>this.commit());foot.append(this.projects,this.apply);d.append(foot);document.body.append(d);
    d.addEventListener('close',()=>{this.app.sync();});
    document.getElementById('planner-fit-room').onclick=()=>this.open();
    app.listen(document,'mf:room-required',()=>{if(!this.dialog.open)this.open();});
    const start=document.getElementById('studio-first-module');start.onclick=()=>{if(!roomReady(app.adapter.room))this.open();else{app.workspace.panel('left',true);window.MF3D_STUDIO.showPane('catalog');}};
  }
  error(message){this.alert.textContent=message;this.alert.hidden=!message;if(message)this.alert.scrollIntoView({block:'nearest'});}
  open(){
    this.app.interaction?.cancel();this.app.workspace.closePanels();
    this.draft=clone(this.app.adapter.room);this.draft.features??=[];this.wasReady=roomReady(this.draft);
    for(const [key,i]of Object.entries(this.fields))i.value=this.wasReady?String(this.draft[key]):'';
    this.apply.textContent=this.wasReady?'Сохранить комнату':'Начать проектирование';
    document.getElementById('room-setup-eyebrow').textContent=this.wasReady?'ЗАМЕР ПОМЕЩЕНИЯ':'ПЕРЕД ПРОЕКТИРОВАНИЕМ';
    this.error('');this.preview();if(!this.dialog.open)this.dialog.showModal();this.fields.width.focus();
  }
  projectChanged(){if(this.dialog.open)this.dialog.close();if(!roomReady(this.app.adapter.room))this.open();}
  readDimensions(){return {...this.draft,...Object.fromEntries(Object.entries(this.fields).map(([key,i])=>[key,i.value===''?NaN:Number(i.value)]))};}
  commit(){
    const r={...this.readDimensions(),setup_complete:true},error=roomError(r);if(error){this.error(error);return;}
    const outside=this.app.adapter.items.find(it=>placementError(it,[],r));if(outside){this.error('Новый размер не вмещает модуль: '+outside.name);return;}
    this.app.history.run('Замер комнаты',()=>{this.app.adapter.state.room=clone(r);this.app.bridge.refresh();});
    for(const k of ['width','depth','height'])document.getElementById('room-'+k).value=String(r[k]);
    this.dialog.close();this.app.scene.fit('room');this.app.adapter.status('Комната сохранена. Можно расставлять мебель.');
    if(!this.wasReady){this.app.workspace.panel('left',true);window.MF3D_STUDIO.showPane('catalog');}
  }
  preview(){
    if(!this.draft)return;const r=this.readDimensions();this.previewRoot.replaceChildren(el('h3','План замера'));
    if(dimensionsError(r)){this.previewRoot.append(el('p','Введите длину, глубину и высоту — здесь появится план со стенами A, B, C и D.'));return;}
    const features=r.features||[];
    const scale=Math.min(410/r.width,255/r.depth),w=r.width*scale,h=r.depth*scale,x=(520-w)/2,y=45;
    const plan=svg('svg',{viewBox:`0 0 520 ${h+105}`,role:'img','aria-label':'План комнаты сверху, стены A B C D'});
    plan.append(svg('rect',{x,y,width:w,height:h,rx:2,fill:'#f4f3ed',stroke:'#738577','stroke-width':3}));
    for(const [text,tx,ty]of [[`A → · ${r.width} мм`,260,y-18],[`C →`,260,y+h+26],['D ↓',x-28,y+h/2],['B ↓',x+w+28,y+h/2]])plan.append(svg('text',{x:tx,y:ty,'text-anchor':'middle',fill:'#385849','font-size':14},text));
    plan.append(svg('text',{x:260,y:y+h+52,'text-anchor':'middle',fill:'#637367','font-size':13},`Глубина ${r.depth} мм · высота ${r.height} мм`));
    features.forEach((f,n)=>{const b=featureBox(f,r,Math.max(70,8/scale)),color=FEATURES[f.kind]?.[1]||'#888';plan.append(svg('rect',{x:x+(b.x-b.w/2+r.width/2)*scale,y:y+(b.z-b.d/2+r.depth/2)*scale,width:Math.max(4,b.w*scale),height:Math.max(4,b.d*scale),fill:color}));const cx=x+(b.x+r.width/2)*scale,cy=y+(b.z+r.depth/2)*scale;plan.append(svg('circle',{cx,cy,r:10,fill:'#fff',stroke:color,'stroke-width':2}),svg('text',{x:cx,y:cy+4,'text-anchor':'middle',fill:'#243d32','font-size':11},String(n+1)));});
    this.previewRoot.append(plan);
  }

  sync(){
    const ready=roomReady(this.app.adapter.room),empty=document.getElementById('studio-empty-scene');document.body.dataset.roomReady=String(ready);document.body.dataset.roomHasFeatures=String(Boolean(this.app.adapter.room.features?.length));
    empty.querySelector('h2').textContent=ready?'Начните с первого модуля':'Сначала — замер комнаты';
    empty.querySelector('p').textContent=ready?'Выберите шкаф в каталоге. Его размеры и материалы доступны справа.':'Укажите длину, глубину и высоту комнаты, затем выбирайте мебель.';
    document.getElementById('studio-first-module').textContent=ready?'Выбрать модуль':'Задать комнату';
  }
  dispose(){this.dialog.remove();}
}
