import {FEATURES,WALLS,ORIGINS,wallLength,dimensionsError,featureError,roomError,roomReady,featureBox} from './room-plan.mjs';
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
    this.steps=el('nav',undefined,'room-setup-steps');this.steps.setAttribute('aria-label','Шаги замера');
    this.steps.append(btn('1 · Размеры','room-step-dimensions',()=>this.step(1)),btn('2 · Проёмы и коммуникации','room-step-features',()=>this.next()));d.append(this.steps);
    this.body=el('div');this.body.className='room-setup-body';d.append(this.body);
    this.dimensions=el('section',undefined,'room-dimensions-step');this.dimensions.append(el('h3','Какие размеры у помещения?'),el('p','Укажите внутренние размеры по чистовым стенам. Прямоугольное помещение, все размеры в миллиметрах.'));
    const grid=el('div');grid.className='room-dimension-grid';
    for(const [key,label,min,max]of [['width','Длина · стены A и C',1500,12000],['depth','Глубина · стены B и D',1500,12000],['height','Высота до потолка',2000,5000]]){
      const l=el('label',label),i=el('input',undefined,'room-setup-'+key);Object.assign(i,{type:'number',min:String(min),max:String(max),step:'1',placeholder:'Укажите, мм'});i.setAttribute('aria-label',label);i.oninput=()=>this.preview();l.append(i,el('small',`${min}–${max} мм`));grid.append(l);this.fields[key]=i;
    }
    this.dimensions.append(grid);this.body.append(this.dimensions);
    this.survey=el('section',undefined,'room-features-step');this.survey.append(el('h3','Есть ли проёмы и коммуникации?'),el('p','Отметьте окна, двери, розетки, воду, канализацию, газ, вентиляцию, счётчики, радиаторы и выступы.'));
    const choices=el('div');choices.className='room-survey-choices';
    for(const [value,label]of [['present','Есть · добавить по замеру'],['none','Нет, объектов нет']])choices.append(btn(label,'room-survey-'+value,()=>{
      if(value==='none'&&this.draft.features.length){this.error('Сначала удалите объекты из списка, если их действительно нет.');return;}
      this.draft.survey=value;this.error('');this.renderSurvey();
    }));
    this.survey.append(choices);this.objects=el('div',undefined,'room-objects');this.survey.append(this.objects);
    this.list=el('div',undefined,'room-feature-list');this.objects.append(this.list);
    this.add=btn('+ Добавить объект','room-feature-add',()=>this.edit());this.objects.append(this.add);
    this.editor=el('section',undefined,'room-feature-editor');this.editor.hidden=true;this.objects.append(this.editor);
    this.editor.append(el('h4','Объект по замеру','room-feature-title'));this.featureFields={};
    const fg=el('div');fg.className='room-feature-grid';this.editor.append(fg);
    const choice=(key,label,values)=>{const l=el('label',label),s=el('select',undefined,'room-feature-'+key);s.setAttribute('aria-label',label);for(const [v,t]of Object.entries(values)){const o=el('option',t);o.value=v;s.append(o);}s.onchange=()=>{this.origin();this.preview();};l.append(s);fg.append(l);this.featureFields[key]=s;};
    choice('kind','Тип объекта',Object.fromEntries(Object.entries(FEATURES).map(([k,v])=>[k,v[0]])));choice('wall','Стена',WALLS);
    for(const [key,label,min,max]of [['offset','От угла до начала объекта',0,12000],['elevation','От пола до низа объекта',0,5000],['width','Ширина вдоль стены',1,12000],['height','Высота объекта',1,5000],['projection','Выступ в комнату',0,3000]]){
      const l=el('label',label+' · мм'),i=el('input',undefined,'room-feature-'+key);Object.assign(i,{type:'number',min:String(min),max:String(max),step:'1'});i.setAttribute('aria-label',label);i.oninput=()=>this.preview();l.append(i);fg.append(l);this.featureFields[key]=i;
    }
    const label=el('label','Название (необязательно)'),name=el('input',undefined,'room-feature-label');name.maxLength=100;label.append(name);fg.append(label);this.featureFields.label=name;
    this.originNote=el('p',undefined,'room-feature-origin');this.editor.append(this.originNote);
    this.editor.append(el('p','Для точки подключения укажите размер её зоны. Для окна выступ — глубина подоконника. Направление открывания двери и дополнительные отступы укажите в примечании.'));
    const nl=el('label','Примечание'),notes=el('textarea',undefined,'room-feature-notes');notes.maxLength=500;notes.rows=2;nl.append(notes);this.editor.append(nl);this.featureFields.notes=notes;
    const actions=el('div');actions.className='room-inline-actions';actions.append(btn('Записать объект','room-feature-save',()=>this.saveFeature()),btn('Отмена','room-feature-cancel',()=>{this.editor.hidden=true;this.add.hidden=false;this.error('');this.preview();}));this.editor.append(actions);
    this.body.append(this.survey);
    this.previewRoot=el('aside',undefined,'room-measure-preview');this.body.append(this.previewRoot);
    this.alert=el('p',undefined,'room-setup-error');this.alert.setAttribute('role','alert');this.alert.hidden=true;d.append(this.alert);
    const foot=el('footer');this.projects=btn('Мои проекты','room-setup-projects',()=>{d.close();this.app.workspace.panel('left',true);window.MF3D_STUDIO.showPane('projects');});this.back=btn('Назад','room-setup-back',()=>this.step(1));this.nextButton=btn('Далее · проёмы и коммуникации','room-setup-next',()=>this.next());this.apply=btn('Начать проектирование','room-setup-apply',()=>this.commit());foot.append(this.projects,this.back,this.nextButton,this.apply);d.append(foot);document.body.append(d);
    d.addEventListener('close',()=>{this.app.sync();});
    document.getElementById('planner-fit-room').onclick=()=>this.open();
    app.listen(document,'mf:room-required',()=>{if(!this.dialog.open)this.open();});
    const start=document.getElementById('studio-first-module');start.onclick=()=>{if(!roomReady(app.adapter.room))this.open();else{app.workspace.panel('left',true);window.MF3D_STUDIO.showPane('catalog');}};
  }
  error(message){this.alert.textContent=message;this.alert.hidden=!message;}
  open(){
    this.app.interaction?.cancel();this.app.workspace.closePanels();
    this.draft=clone(this.app.adapter.room);this.draft.features??=[];this.wasReady=roomReady(this.draft);
    for(const [key,i]of Object.entries(this.fields))i.value=this.wasReady?String(this.draft[key]):'';
    this.editor.hidden=true;this.add.hidden=false;this.apply.textContent=this.wasReady?'Сохранить комнату':'Начать проектирование';
    document.getElementById('room-setup-eyebrow').textContent=this.wasReady?'ЗАМЕР ПОМЕЩЕНИЯ':'ПЕРЕД ПРОЕКТИРОВАНИЕМ';
    this.step(1);if(!this.dialog.open)this.dialog.showModal();this.fields.width.focus();
  }
  projectChanged(){if(this.dialog.open)this.dialog.close();if(!roomReady(this.app.adapter.room))this.open();}
  readDimensions(){return {...this.draft,...Object.fromEntries(Object.entries(this.fields).map(([key,i])=>[key,i.value===''?NaN:Number(i.value)]))};}
  next(){
    const r=this.readDimensions(),error=dimensionsError(r);if(error){this.error(error);return;}
    this.draft=r;this.step(2);
  }
  step(n){
    this.currentStep=n;this.dialog.dataset.step=String(n);this.dimensions.hidden=n!==1;this.survey.hidden=n!==2;this.back.hidden=n===1;this.nextButton.hidden=n!==1;this.apply.hidden=n!==2;
    for(const [id,s]of [['room-step-dimensions',1],['room-step-features',2]])document.getElementById(id).setAttribute('aria-current',s===n?'step':'false');
    this.error('');this.renderSurvey();this.preview();
  }
  renderSurvey(){
    for(const s of ['none','present'])document.getElementById('room-survey-'+s).setAttribute('aria-pressed',String(this.draft.survey===s));
    this.objects.hidden=this.draft.survey!=='present';this.list.replaceChildren();
    this.draft.features.forEach((f,n)=>{
      const row=el('article');row.className='room-feature-row';row.dataset.featureId=f.id;
      const text=el('div');text.append(el('strong',`${n+1}. ${f.label||FEATURES[f.kind][0]}`),el('p',`Стена ${f.wall.toUpperCase()} · от угла ${f.offset} · от пола ${f.elevation} мм`),el('small',`${f.width} × ${f.height} мм · выступ ${f.projection} мм`));if(f.notes)text.append(el('p',f.notes));
      const actions=el('div');actions.append(btn('Изменить',undefined,()=>this.edit(f)),btn('Удалить',undefined,()=>{this.draft.features=this.draft.features.filter(x=>x.id!==f.id);if(this.editId===f.id){this.editor.hidden=true;this.add.hidden=false;}this.renderSurvey();this.preview();}));row.append(text,actions);this.list.append(row);
    });this.preview();
  }
  edit(feature){
    this.editId=feature?.id||crypto.randomUUID();this.error('');this.editor.hidden=false;this.add.hidden=true;
    const values=feature||{kind:'window',wall:'a',offset:'',elevation:'',width:'',height:'',projection:0,label:'',notes:''};
    for(const [key,i]of Object.entries(this.featureFields))i.value=values[key]??'';
    document.getElementById('room-feature-title').textContent=feature?'Изменить объект':'Добавить объект';this.origin();this.preview();this.featureFields.kind.focus();
  }
  origin(){const wall=this.featureFields.wall.value;this.originNote.textContent=`Стена ${wall.toUpperCase()}: отсчёт от ${ORIGINS[wall]}, по стрелке на плане. Отступ измеряется до ближнего края объекта.`;}
  readFeature(){return {id:this.editId,...Object.fromEntries(Object.entries(this.featureFields).map(([k,i])=>[k,['kind','wall','label','notes'].includes(k)?i.value.trim():i.value===''?NaN:Number(i.value)]))};}
  saveFeature(){
    const f=this.readFeature(),error=featureError(f,this.draft);if(error){this.error(error);return;}
    const index=this.draft.features.findIndex(x=>x.id===f.id);if(index<0){if(this.draft.features.length>=100){this.error('В комнате поддерживается до 100 объектов.');return;}this.draft.features.push(f);}else this.draft.features[index]=f;
    this.editor.hidden=true;this.add.hidden=false;this.error('');this.renderSurvey();
  }
  commit(){
    if(this.draft.survey==='present'&&!this.editor.hidden){this.error('Запишите объект или нажмите «Отмена» в его форме.');return;}
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
    const features=[...r.features];let wall='a';
    if(this.currentStep===2&&!this.editor.hidden){const f=this.readFeature();wall=f.wall;if(!featureError(f,r)){const i=features.findIndex(x=>x.id===f.id);if(i<0)features.push(f);else features[i]=f;}}
    const scale=Math.min(410/r.width,255/r.depth),w=r.width*scale,h=r.depth*scale,x=(520-w)/2,y=45;
    const plan=svg('svg',{viewBox:`0 0 520 ${h+105}`,role:'img','aria-label':'План комнаты сверху, стены A B C D'});
    plan.append(svg('rect',{x,y,width:w,height:h,rx:2,fill:'#f4f3ed',stroke:'#738577','stroke-width':3}));
    for(const [text,tx,ty]of [[`A → · ${r.width} мм`,260,y-18],[`C →`,260,y+h+26],['D ↓',x-28,y+h/2],['B ↓',x+w+28,y+h/2]])plan.append(svg('text',{x:tx,y:ty,'text-anchor':'middle',fill:'#385849','font-size':14},text));
    plan.append(svg('text',{x:260,y:y+h+52,'text-anchor':'middle',fill:'#637367','font-size':13},`Глубина ${r.depth} мм · высота ${r.height} мм`));
    features.forEach((f,n)=>{const b=featureBox(f,r,Math.max(70,8/scale)),color=FEATURES[f.kind]?.[1]||'#888';plan.append(svg('rect',{x:x+(b.x-b.w/2+r.width/2)*scale,y:y+(b.z-b.d/2+r.depth/2)*scale,width:Math.max(4,b.w*scale),height:Math.max(4,b.d*scale),fill:color}));const cx=x+(b.x+r.width/2)*scale,cy=y+(b.z+r.depth/2)*scale;plan.append(svg('circle',{cx,cy,r:10,fill:'#fff',stroke:color,'stroke-width':2}),svg('text',{x:cx,y:cy+4,'text-anchor':'middle',fill:'#243d32','font-size':11},String(n+1)));});
    this.previewRoot.append(plan);
    if(this.currentStep===2){
      this.previewRoot.append(el('h4','Стена '+wall.toUpperCase()+' · вид из комнаты'));
      const span=wallLength(r,wall),s=Math.min(430/span,185/r.height),ww=span*s,hh=r.height*s,xx=(520-ww)/2;
      const elevation=svg('svg',{viewBox:`0 0 520 ${hh+48}`,role:'img','aria-label':'Развёртка стены '+wall.toUpperCase()});
      elevation.append(svg('rect',{x:xx,y:10,width:ww,height:hh,fill:'#f4f3ed',stroke:'#738577'}));
      // Offset directions match the top-view arrows; C and D reverse in the interior elevation.
      for(const [n,f]of features.entries())if(f.wall===wall){const left=['c','d'].includes(wall)?span-f.offset-f.width:f.offset;elevation.append(svg('rect',{x:xx+left*s,y:10+(r.height-f.elevation-f.height)*s,width:Math.max(3,f.width*s),height:Math.max(3,f.height*s),fill:FEATURES[f.kind][1],opacity:.7}));elevation.append(svg('text',{x:xx+(left+f.width/2)*s,y:10+(r.height-f.elevation-f.height/2)*s+4,'text-anchor':'middle','font-size':12,fill:'#20392c'},String(n+1)));}
      elevation.append(svg('text',{x:260,y:hh+34,'text-anchor':'middle',fill:'#637367','font-size':12},'0 · чистовой пол'));this.previewRoot.append(elevation,el('p','Номера на плане соответствуют списку объектов. Стрелки показывают направление отсчёта от угла.'));
    }
  }
  sync(){
    const ready=roomReady(this.app.adapter.room),empty=document.getElementById('studio-empty-scene');document.body.dataset.roomReady=String(ready);
    empty.querySelector('h2').textContent=ready?'Начните с первого модуля':'Сначала — замер комнаты';
    empty.querySelector('p').textContent=ready?'Выберите шкаф в каталоге. Его размеры и материалы доступны справа.':'Задайте размеры, затем отметьте проёмы и коммуникации.';
    document.getElementById('studio-first-module').textContent=ready?'Выбрать модуль':'Задать комнату';
  }
  dispose(){this.dialog.remove();}
}
