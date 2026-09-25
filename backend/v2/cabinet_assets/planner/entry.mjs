import {StateAdapter} from './state-adapter.mjs';
import {History} from './history.mjs';
import {Interaction} from './interaction.mjs';
import {FallbackPlan} from './fallback.mjs';
import {placementError,elevation,tier} from './furniture-core.mjs';
const get=id=>document.getElementById(id);
const make=(tag,id,text)=>{const el=document.createElement(tag);if(id)el.id=id;if(text!==undefined)el.textContent=text;return el;};
const button=(id,text,title)=>{const b=make('button',id,text);b.type='button';b.className='secondary';if(title){b.title=title;b.setAttribute('aria-label',title);}return b;};
const select=(id,label,choices)=>{const s=make('select',id);s.setAttribute('aria-label',label);for(const [value,text]of choices){const o=make('option',null,text);o.value=value;s.append(o);}return s;};
function waitReady(){return new Promise((resolve,reject)=>{
  const ready=()=>window.MF_PLANNER_BRIDGE&&(document.body?.dataset.appReady==='true'||document.body?.dataset.ready==='true');
  if(ready()){resolve();return;}
  const observer=new MutationObserver(()=>{if(ready()){observer.disconnect();clearTimeout(timer);resolve();}});
  observer.observe(document.documentElement,{attributes:true,subtree:true});
  const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Не удалось дождаться загрузки проекта. Проверьте вход в кабинет.'));},30000);
});}

class PlannerApplication {
  constructor(){this.version='1.0.0';this.ready=false;this.options={enabled:true,alignment:'front',wallOffset:0,autoRotate:true,allowElevation:false};}
  async init(){
    if(this.ready)return this;await waitReady();
    this.bridge=window.MF_PLANNER_BRIDGE;this.adapter=new StateAdapter(this.bridge);this.history=new History(this.adapter);
    this.uiAbort=new AbortController();this.buildToolbar();this.bindInspector();
    await this.startRenderer();
    this.previousCount=this.adapter.items.length;
    this.unsubscribe=this.bridge.subscribe(reason=>{
      if(reason==='before-project'){this.interaction?.cancel();return;}
      if(reason==='project'){this.interaction?.cancel();this.history.reset();this.sync();this.setView(this.adapter.state.view_mode==='2d'?'top':'3d');return;}
      this.sync();
    });
    this.history.onChange=()=>{get('planner-undo').disabled=!this.history.undoStack.length;get('planner-redo').disabled=!this.history.redoStack.length;};
    this.history.onChange();this.sync();this.scene.fit(this.adapter.items.length?'kitchen':'room');
    this.ready=true;document.body.dataset.ready='true';document.body.dataset.plannerReady='true';
    this.adapter.status(this.scene.isFallback?'Резервный 2D-план. Проект доступен без перезагрузки.':'Сцена готова. Добавьте модуль из каталога или выберите шкаф.');
    return this;
  }
  listen(el,event,fn,capture=false){el?.addEventListener(event,fn,{capture,signal:this.uiAbort.signal});}
  buildToolbar(){
    document.body.classList.add('mf-webgl');
    const bar=document.querySelector('.mf3d-stagebar');
    get('mode-2d').textContent='Сверху';get('reset-view').textContent='Кухня';
    const front=button('planner-front','Спереди','Фронтальный вид');get('mode-3d').parentElement.append(front);
    const room=button('planner-fit-room','Комната','Показать всё помещение');get('reset-view').after(room);
    const tools=make('div','planner-tools');
    tools.append(button('planner-undo','↶','Отменить · Ctrl+Z'),button('planner-redo','↷','Повторить · Ctrl+Shift+Z'));
    const layer=select('planner-layer','Показать ярус',[['all','Все модули'],['base','Нижние'],['wall','Верхние'],['tall','Пеналы'],['other','Прочее']]);tools.append(layer);
    const snap=button('planner-snap','Привязки','Включить или выключить привязки');snap.setAttribute('aria-pressed','true');tools.append(snap);
    const more=make('details','planner-placement-options'),summary=make('summary',null,'Расстановка');more.append(summary);
    const panel=make('div',null);panel.className='planner-options-panel';
    const alignLabel=make('label',null,'Выравнивание');alignLabel.append(select('planner-alignment','База выравнивания',[['front','По фасадам'],['back','По задней стенке']]));panel.append(alignLabel);
    const wallLabel=make('label',null,'Отступ от стены, мм'),offset=make('input','planner-wall-offset');offset.type='number';offset.min='0';offset.max='300';offset.value='0';wallLabel.append(offset);panel.append(wallLabel);
    const rotateLabel=make('label',null,'Разворот к стене'),auto=make('input','planner-auto-rotate');auto.type='checkbox';auto.checked=true;rotateLabel.prepend(auto);panel.append(rotateLabel);more.append(panel);tools.append(more);
    const client=button('planner-client','Просмотр','Скрыть параметры и показать кухню клиенту');client.setAttribute('aria-pressed','false');tools.append(client);bar.after(tools);
    const wrap=document.querySelector('.mf3d-canvas-wrap');
    const dimension=make('div','planner-dimension');dimension.hidden=true;wrap.append(dimension);
    const feedback=make('div','planner-feedback');feedback.hidden=true;feedback.setAttribute('role','status');wrap.append(feedback);
    const fallback=make('div','planner-fallback');fallback.hidden=true;fallback.append(make('span',null,'WebGL недоступен. Резервный 2D-план; несохранённые данные сохранены в текущем проекте.'),button('planner-retry','Повторить 3D'));wrap.append(fallback);
    const empty=get('studio-empty-scene');empty.querySelector('h2').textContent='Начните с первого модуля';empty.querySelector('p').textContent='Выберите шкаф в каталоге слева. Его размеры и материалы доступны справа.';
    const note=make('p','planner-elevation-note');note.className='studio-hint';get('studio-position-note').after(note);
    const nav=make('nav','planner-mobile-nav');nav.setAttribute('aria-label','Панели конструктора');
    for(const [id,text]of [['catalog','Каталог'],['items','В проекте'],['inspector','Параметры']])nav.append(button('planner-mobile-'+id,text));document.querySelector('.mf3d-stage').append(nav);
    get('mode-2d').onclick=()=>this.setView('top');get('mode-3d').onclick=()=>this.setView('3d');front.onclick=()=>this.setView('front');
    get('reset-view').onclick=()=>this.scene.fit('kitchen');room.onclick=()=>this.scene.fit('room');
    get('studio-focus').onclick=()=>{if(this.adapter.selected){this.ensureSelectedVisible();this.scene.fit('selected');}};
    get('studio-zoom-in').onclick=()=>this.scene.zoom(1);get('studio-zoom-out').onclick=()=>this.scene.zoom(-1);
    get('planner-undo').onclick=()=>{this.interaction.cancel();this.history.undo();};get('planner-redo').onclick=()=>{this.interaction.cancel();this.history.redo();};
    layer.onchange=()=>{this.interaction.cancel();this.scene.setLayer(layer.value);};
    snap.onclick=()=>{this.options.enabled=!this.options.enabled;snap.setAttribute('aria-pressed',String(this.options.enabled));};
    get('planner-alignment').onchange=e=>{this.options.alignment=e.target.value;};
    offset.onchange=()=>{this.options.wallOffset=Math.max(0,Math.min(300,Number(offset.value)||0));offset.value=String(this.options.wallOffset);};
    auto.onchange=()=>{this.options.autoRotate=auto.checked;};
    client.onclick=()=>{this.interaction.cancel();const on=document.body.classList.toggle('planner-client');client.setAttribute('aria-pressed',String(on));client.textContent=on?'Редактировать':'Просмотр';this.scene.highlight();this.scene.hover(null);requestAnimationFrame(()=>{this.scene.resize();this.scene.fit('kitchen');});};
    get('planner-retry').onclick=()=>this.startRenderer().then(()=>this.sync());
    const openPanel=which=>{
      const isInspector=which==='inspector',cls=isInspector?'studio-inspector-open':'studio-library-open';
      const already=document.body.classList.contains(cls)&&(isInspector||get('tab-'+which)?.getAttribute('aria-selected')==='true');
      document.body.classList.remove('studio-library-open','studio-inspector-open');
      if(!already){document.body.classList.add(cls);if(!isInspector)window.MF3D_STUDIO.showPane(which);}
      get('studio-toggle-library').setAttribute('aria-expanded',String(document.body.classList.contains('studio-library-open')));
      get('studio-toggle-inspector').setAttribute('aria-expanded',String(document.body.classList.contains('studio-inspector-open')));
    };
    for(const which of ['catalog','items','inspector'])get('planner-mobile-'+which).onclick=()=>openPanel(which);
    this.listen(document,'mf:planner-focus',e=>{this.adapter.select(e.detail);this.ensureSelectedVisible();this.scene.fit('selected');});
    const help=get('studio-help-dialog');const text=make('p',null,'Новая сцена: тяните шкаф мышью или перетащите карточку из каталога. Фон вращает камеру; правая кнопка сдвигает вид; колесо меняет масштаб. Ctrl+Z отменяет действие, Escape отменяет перенос. На телефоне карточка добавляется нажатием. Спереди высота остаётся по совместимому правилу проекта.');help.insertBefore(text,help.lastElementChild);
  }
  bindInspector(){
    for(const [id,key]of [['width','width'],['height','height'],['depth','depth'],['pos-x','x'],['pos-z','z']]){
      const input=get(id);input.oninput=null;input.onchange=null;
      this.listen(input,'change',()=>{if(!this.interaction)return;const value=Number(input.value);this.interaction.modify({[key]:value},['x','z'].includes(key)?'Точное положение':'Изменение размера');this.bridge.refresh();});
    }
    for(const [id,key]of [['rotation','rotation'],['layout','layout'],['drawers','drawers'],['base','base'],['handles','handles']]){
      const input=get(id);input.onchange=null;
      this.listen(input,'change',()=>{this.interaction.modify({[key]:['rotation','drawers'].includes(key)?Number(input.value):input.value},id==='rotation'?'Поворот':'Компоновка');this.bridge.refresh();});
    }
    get('studio-item-name').onchange=()=>{const name=get('studio-item-name').value.trim().slice(0,160),it=this.adapter.selected;if(name&&it)this.interaction.change('Название модуля',()=>this.adapter.replace({...it,name}));else this.bridge.refresh();};
    get('duplicate-item').onclick=()=>this.interaction?.duplicate();get('remove-item').onclick=()=>this.interaction?.remove();get('studio-rotate').onclick=()=>this.interaction?.rotate();
    document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>{const n=Number(get('studio-nudge-step').value)||10;const moves={left:[-n,0],right:[n,0],back:[0,-n],front:[0,n]};this.interaction?.nudge(...moves[b.dataset.nudge]);});
    this.listen(get('quick-widths'),'click',e=>{const b=e.target.closest('button');if(!b)return;e.preventDefault();e.stopImmediatePropagation();this.interaction?.modify({width:Number(b.textContent)},'Изменение ширины');this.bridge.refresh();},true);
    for(const id of ['body-results','front-results'])this.listen(get(id),'click',e=>{if(!e.target.closest('button'))return;this.history.begin('Материал');queueMicrotask(()=>this.history.commit());},true);
    for(const [id,key,min,max]of [['room-width','width',1500,12000],['room-depth','depth',1500,12000],['room-height','height',2000,5000]]){
      const input=get(id);input.oninput=null;
      input.onchange=()=>{const value=Number(input.value),room={...this.adapter.room,[key]:value};this.interaction.change('Размеры помещения',()=>{
        if(!Number.isInteger(value)||value<min||value>max)throw new Error('Допустимый размер помещения: '+min+'–'+max+' мм');
        const outside=this.adapter.items.find(it=>placementError(it,[],room));if(outside)throw new Error('Новый размер не вмещает модуль: '+outside.name);
        Object.assign(this.adapter.room,room);this.bridge.refresh();
      });input.value=String(this.adapter.room[key]);};
    }
    this.listen(get('project-name'),'focus',()=>this.history.begin('Название проекта'));
    this.listen(get('project-name'),'change',()=>this.history.commit());
  }
  ensureSelectedVisible(){const it=this.adapter.selected;if(it&&this.scene.layer!=='all'&&this.scene.layer!==tier(it)){this.scene.layer='all';get('planner-layer').value='all';this.scene.sync();}}
  async startRenderer(){
    this.interaction?.dispose();this.scene?.dispose();
    let canvas=get('scene');if(this.scene){const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;}
    try{const {PlannerScene}=await import('./scene.mjs');this.scene=new PlannerScene(canvas,this.adapter,()=>this.fallback());get('planner-fallback').hidden=true;document.body.dataset.plannerRenderer='webgl';}
    catch(error){console.warn('Planner switched to 2D:',error.message);this.installFallback(canvas);}
    this.interaction=new Interaction(this.scene,this.adapter,this.history,()=>this.options);
    this.scene.fit(this.adapter.items.length?'kitchen':'room');this.paintMode();
  }
  installFallback(canvas){
    const next=canvas.cloneNode(false);canvas.replaceWith(next);this.scene=new FallbackPlan(next,this.adapter);
    get('planner-fallback').hidden=false;get('planner-dimension').hidden=true;document.body.dataset.plannerRenderer='fallback';
  }
  fallback(){
    if(this.scene?.isFallback)return;
    this.interaction?.dispose();this.scene?.dispose();this.installFallback(get('scene'));
    this.interaction=new Interaction(this.scene,this.adapter,this.history,()=>this.options);this.sync();this.paintMode();
    this.adapter.status('WebGL-контекст потерян. Открыт резервный 2D-план; проект не перезагружался.');
  }
  setView(mode){if(!this.scene)return;this.interaction?.cancel();if(this.scene.isFallback)mode='top';this.scene.setView(mode);this.bridge.view(mode);this.paintMode();}
  paintMode(){
    if(!this.scene)return;for(const [id,value]of [['mode-2d','top'],['mode-3d','3d'],['planner-front','front']]){
      const b=get(id),on=this.scene.mode===value;b.className=on?'':'secondary';b.setAttribute('aria-pressed',String(on));
    }
    get('scene-help').textContent=this.scene.isFallback?'2D · резервный план · перетаскивайте модуль мышью':this.scene.mode==='top'?'2D · план сверху · тяните модуль для точной расстановки':this.scene.mode==='front'?'Спереди · перемещение по горизонтали · высота по правилу проекта':'Модуль — перемещение · фон — вращение · правая кнопка — сдвиг вида';
    get('studio-zoom-in').disabled=false;get('studio-zoom-out').disabled=false;
  }
  sync(){
    if(!this.scene)return;const count=this.adapter.items.length;
    get('to-order').disabled=count===0;get('export-bazis').disabled=count===0;
    this.scene.sync();
    if(count>this.previousCount)this.ensureSelectedVisible();
    if(!this.previousCount&&count)this.scene.fit('kitchen');this.previousCount=count;
    const selected=this.adapter.selected;
    const note=get('planner-elevation-note');note.textContent=selected?.module_type==='wall_cabinet'?'Низ модуля: '+elevation(selected,this.adapter.room)+' мм. Высота вычисляется по прежнему правилу; отдельная регулировка пока недоступна.':'';
    if(selected)this.scene.highlight(placementError(selected,this.adapter.items,this.adapter.room));
    get('studio-empty-scene').hidden=Boolean(count);this.paintMode();
  }
  dispose(){this.unsubscribe?.();this.uiAbort?.abort();this.interaction?.dispose();this.scene?.dispose();this.ready=false;document.body.dataset.plannerReady='false';}
}
export const planner=new PlannerApplication();
window.MF_PLANNER=planner;
if(document.body.dataset.plannerRequested==='webgl')planner.init().catch(error=>{const s=get('status');if(s)s.textContent=error.message;document.body.dataset.plannerError='true';});
