/** Furniture-first workspace. Owns DOM layout only; never edits project data or meshes. */
export class PlannerWorkspace {
  constructor(app) {
    this.app=app;this.root=document.getElementById('planner-workspace');
    this.abort=new AbortController();this.left=false;this.right=false;this.lastPanel='left';
    this.manualInspectorClosed=false;this.pendingResize=0;
    const get=id=>document.getElementById(id);this.get=get;
    const on=(el,type,fn,options={})=>el?.addEventListener(type,fn,{...options,signal:this.abort.signal});this.on=on;
    const button=(id,text,label)=>{const b=document.createElement('button');b.type='button';b.id=id;b.className='secondary';b.textContent=text;b.title=label;b.setAttribute('aria-label',label);return b;};
    this.library=document.querySelector('.mf3d-left');this.inspector=document.querySelector('.mf3d-right');
    this.library.id='workspace-library';this.inspector.id='workspace-inspector';
    for(const [side,panel]of [['left',this.library],['right',this.inspector]]) {
      const head=document.createElement('div');head.className='workspace-drawer-head';head.dataset.sheetHandle=side;
      const title=document.createElement('strong');title.textContent=side==='left'?'Модули и проекты':'Параметры модуля';
      const close=button('workspace-close-'+side,'×',side==='left'?'Закрыть каталог':'Закрыть параметры');head.append(title,close);panel.prepend(head);
      close.onclick=()=>this.panel(side,false,{manual:true,focus:true});
      on(head,'pointerdown',e=>{if(innerWidth>760||e.target.closest('button'))return;this.swipe={side,y:e.clientY,id:e.pointerId};head.setPointerCapture(e.pointerId);});
      on(head,'pointerup',e=>{const s=this.swipe;this.swipe=null;if(s?.id===e.pointerId&&e.clientY-s.y>55)this.panel(side,false,{manual:true,focus:true});});
      on(head,'pointercancel',()=>{this.swipe=null;});
    }
    const bar=document.querySelector('.mf3d-stagebar'),tools=get('planner-tools');
    const modes=document.querySelector('.mf3d-segment');
    // Move the existing nodes (and listeners), rather than duplicate controls.
    bar.replaceChildren(get('studio-toggle-library'),modes,tools,get('reset-view'),get('planner-fit-room'),get('planner-client'),get('studio-toggle-inspector'));
    get('studio-toggle-library').setAttribute('aria-controls',this.library.id);
    get('studio-toggle-inspector').setAttribute('aria-controls',this.inspector.id);
    get('studio-toggle-library').onclick=()=>this.panel('left',!this.left,{focus:true});
    get('studio-toggle-inspector').onclick=()=>this.panel('right',!this.right,{manual:true,focus:true});
    get('studio-first-module').onclick=()=>{window.MF3D_STUDIO.showPane('catalog');this.panel('left',true,{focus:true});};
    for(const which of ['catalog','items','inspector']) {
      get('planner-mobile-'+which).onclick=()=>{
        const side=which==='inspector'?'right':'left';
        const same=side==='right'?this.right:this.left&&get('tab-'+which).getAttribute('aria-selected')==='true';
        if(side==='left')window.MF3D_STUDIO.showPane(which);
        this.panel(side,!same,{manual:side==='right',focus:true});
      };
    }
    on(document.querySelector('.studio-library-tabs'),'click',()=>this.update());
    const camera=document.querySelector('.studio-camera');
    const full=button('planner-fullscreen','⛶','На весь экран');full.setAttribute('aria-pressed','false');camera.append(full);
    full.onclick=()=>this.fullscreen();
    const help=button('workspace-help','?','Подсказка управления');camera.append(help);
    help.onclick=()=>{this.showHelp();};
    on(document,'fullscreenchange',()=>{
      const active=document.fullscreenElement===this.root;
      this.root.classList.toggle('workspace-fullscreen',active);full.setAttribute('aria-pressed',String(active));
      full.title=active?'Выйти из полного экрана':'На весь экран';full.setAttribute('aria-label',full.title);this.resize();
    });
    get('planner-client').onclick=()=>this.client();
    this.cutlist=document.querySelector('.mf3d-cutlist');this.cutlist.id='workspace-cutlist';
    const cutClose=button('workspace-close-cutlist','×','Закрыть деталировку');this.cutlist.append(cutClose);
    cutClose.onclick=()=>{this.cutlist.open=false;this.cutlist.querySelector('summary').focus({preventScroll:true});};
    this.cutlist.querySelector('summary').setAttribute('aria-controls','cutlist');
    on(this.cutlist,'toggle',()=>{this.cutlist.querySelector('summary').setAttribute('aria-expanded',String(this.cutlist.open));if(this.cutlist.open&&innerWidth<1100)this.closePanels();});
    // Status remains the existing live region, now a transient overlay, not a layout row.
    this.statusObserver=new MutationObserver(()=>this.toast());
    this.statusObserver.observe(get('status'),{childList:true,characterData:true,subtree:true});
    // A click may open the inspector. Drag and project loading never do.
    on(this.root,'pointerdown',e=>{this.pickStart=e.target.id==='scene'&&e.button===0&&this.app.scene?.pick(e.clientX,e.clientY)?{x:e.clientX,y:e.clientY,id:e.pointerId}:null;},{capture:true});
    on(this.root,'pointerup',e=>{
      const start=this.pickStart;this.pickStart=null;
      if(!start||start.id!==e.pointerId||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
      queueMicrotask(()=>{if(innerWidth>=1100&&!this.manualInspectorClosed&&!this.isClient()&&this.app.adapter.selected)this.panel('right',true);});
    },{capture:true});
    // Window capture runs before legacy document-level UI shortcuts. Furniture
    // Escape goes to Interaction unchanged, including its one-command rollback.
    on(window,'keydown',e=>{
      if(e.key!=='Escape'||document.querySelector('dialog[open]'))return;
      if(this.app.interaction?.gesture||this.app.interaction?.catalogueDraft)return;
      if(document.fullscreenElement===this.root){document.exitFullscreen().catch(()=>{});e.stopPropagation();return;}
      if(this.left||this.right){this.panel(this.lastPanel,false,{manual:true,focus:true});e.preventDefault();e.stopImmediatePropagation();}
      else if(this.cutlist.open){this.cutlist.open=false;e.preventDefault();e.stopImmediatePropagation();}
    },{capture:true});
    on(window,'resize',()=>{if(innerWidth<1700&&this.left&&this.right){this[this.lastPanel==='left'?'right':'left']=false;}this.update();this.resize();});
    this.unsubscribe=this.app.bridge.subscribe(reason=>{if(reason==='project')this.closePanels();});
    this.update();this.showHelp();
    this.root.dataset.workspaceReady='true';
  }
  isClient(){return document.body.classList.contains('planner-client');}
  panel(side,open,{manual=false,focus=false}={}) {
    if(this.isClient())return;
    if(side==='right'&&manual)this.manualInspectorClosed=!open;
    this[side]=open;if(!open&&this[side==='left'?'right':'left'])this.lastPanel=side==='left'?'right':'left';if(open){this.lastPanel=side;if(innerWidth<1700)this[side==='left'?'right':'left']=false;if(innerWidth<1100)this.cutlist.open=false;}
    this.update();this.resize();
    if(focus){
      const target=open?(side==='left'?this.library.querySelector('[role=tab][aria-selected=true]'):this.get('workspace-close-right')):
        (innerWidth<=760?this.get(side==='left'?'planner-mobile-catalog':'planner-mobile-inspector'):this.get(side==='left'?'studio-toggle-library':'studio-toggle-inspector'));
      target?.focus({preventScroll:true});
    }
  }
  closePanels(){this.left=false;this.right=false;this.update();this.resize();}
  update(){
    const client=this.isClient(),get=this.get;
    for(const [side,panel]of [['left',this.library],['right',this.inspector]]) {
      const open=this[side]&&!client;this.root.dataset[side+'Open']=String(open);
      panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
      get(side==='left'?'studio-toggle-library':'studio-toggle-inspector').setAttribute('aria-expanded',String(open));
    }
    for(const which of ['catalog','items','inspector']) {
      const on=which==='inspector'?this.right:this.left&&get('tab-'+which).getAttribute('aria-selected')==='true';
      get('planner-mobile-'+which).setAttribute('aria-expanded',String(on&&!client));
      get('planner-mobile-'+which).setAttribute('aria-controls',which==='inspector'?this.inspector.id:this.library.id);
    }
    this.cutlist.inert=client;
  }
  resize(){
    if(this.pendingResize)return;
    this.pendingResize=requestAnimationFrame(()=>{this.pendingResize=0;this.app.scene?.resize();});
  }
  client(){
    this.app.interaction?.cancel();const on=document.body.classList.toggle('planner-client');
    const b=this.get('planner-client');b.setAttribute('aria-pressed',String(on));b.textContent=on?'Редактировать':'Просмотр';b.setAttribute('aria-label',on?'Вернуться к редактированию':'Показать кухню клиенту');
    this.get('project-name').readOnly=on;this.update();this.app.scene.highlight();this.app.scene.hover(null);
    requestAnimationFrame(()=>{this.app.scene.resize();this.app.scene.fit('kitchen');});
  }
  async fullscreen(){
    try {
      if(document.fullscreenElement===this.root)await document.exitFullscreen();
      else if(this.root.requestFullscreen&&document.fullscreenEnabled)await this.root.requestFullscreen();
      else this.app.adapter.status('Браузер не поддерживает полный экран для этой страницы. Рабочая сцена уже занимает всё окно.');
    }catch{this.app.adapter.status('Браузер не разрешил полный экран. Проект и положение камеры сохранены.');}
  }
  showHelp(){clearTimeout(this.helpTimer);this.root.dataset.helpVisible='true';this.helpTimer=setTimeout(()=>{this.root.dataset.helpVisible='false';},6500);}
  toast(){clearTimeout(this.toastTimer);this.root.dataset.toastVisible='true';this.toastTimer=setTimeout(()=>{this.root.dataset.toastVisible='false';},6500);}
  dispose(){this.unsubscribe?.();this.abort.abort();this.statusObserver.disconnect();clearTimeout(this.helpTimer);clearTimeout(this.toastTimer);cancelAnimationFrame(this.pendingResize);}
}
