import {ProjectAutosave,fingerprint} from './project-autosave.mjs';
import {checkProject} from './project-checks.mjs';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,fn)=>{const e=el('button',text,'secondary');e.type='button';e.onclick=fn;return e;};
const date=value=>new Date(value).toLocaleString('ru-RU');
const message=error=>error?.status===401?'Сессия завершена. Войдите в кабинет; черновик останется на этом устройстве.':
  error?.status===403?'Сохранение недоступно для этой учётной записи.':error?.status===404?'Проект удалён или недоступен. Сохраните черновик отдельной копией.':
  error?.status===409?'Проект изменён в другой вкладке. Ваши правки сохранены отдельным черновиком.':
  error?.status===422?'Проект сохранён на устройстве. '+(error.issues?.map(x=>x.message).join(' · ')||'Проверьте параметры через «Проверить проект».'):'Связь с сервером прервана. Повторим сохранение при подключении.';

export class ProjectSafety {
  constructor(app){
    this.app=app;this.bridge=app.bridge;this.paused=0;this.switching=null;this.timer=null;this.abort=new AbortController();
    this.prefix='mf.project-draft.v1:'+this.bridge.userId()+':';this.lastKey=this.prefix+'last';
    window.MF_PROJECT_SAFETY=this;this.build();this.activate();
    this.unsubscribe=this.bridge.subscribe(reason=>{if(reason==='state')queueMicrotask(()=>this.capture());});
    const previous=app.history.onChange;app.history.onChange=()=>{previous();this.capture();};
    this.listen(document.getElementById('project-name'),'input',()=>this.capture());
    this.listen(window,'online',()=>this.flush().catch(()=>{}));
    this.listen(document,'visibilitychange',()=>{if(document.visibilityState==='hidden')this.capture(false);});
    this.listen(window,'pagehide',()=>this.capture(false));
    this.listen(window,'beforeunload',e=>{this.capture(false);if(this.engine.dirty&&this.engine.localError){e.preventDefault();e.returnValue='';}});
    this.listen(window,'storage',e=>{if(e.key?.startsWith(this.prefix))this.updateDraftCount();});
  }
  listen(target,event,fn){target.addEventListener(event,fn,{signal:this.abort.signal});}
  snapshot(){return {name:document.getElementById('project-name').value,scene:this.bridge.payload()};}
  activate(record=null){
    clearTimeout(this.timer);
    const engine=new ProjectAutosave({snapshot:this.snapshot(),meta:this.bridge.projectMeta(),record,send:this.bridge.saveSnapshot,
      persist:(data,dirty)=>{const key=this.prefix+data.id;if(dirty)localStorage.setItem(key,JSON.stringify(data));else localStorage.removeItem(key);if(data.meta)localStorage.setItem(this.lastKey,data.meta.project_id);},
      ack:row=>{if(this.engine===engine)this.bridge.acknowledge(row);},changed:()=>{if(this.engine===engine)this.renderStatus();}});
    this.engine=engine;this.renderStatus();this.updateDraftCount();
  }
  capture(schedule=true){
    if(this.paused||(this.app.history.pending&&this.app.history.pending.label!=='Название проекта'))return;
    const snapshot=this.snapshot(),changed=fingerprint(snapshot)!==fingerprint(this.engine.snapshot);
    if(changed)this.engine.capture(snapshot);
    if(schedule&&changed&&this.engine.dirty&&!this.engine.conflict){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),1400);}
  }
  async flush(force=false){
    clearTimeout(this.timer);this.capture(false);
    if(this.engine.operation)await this.finishOperation();
    try{return await this.engine.flush(force);}catch(error){
      this.bridge.status(message(error));
      if(!error.status||error.status>=500){clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),15000);}
      throw error;
    }
  }
  async navigate(action){
    if(this.switching)return this.switching;
    this.switching=(async()=>{
      this.app.interaction?.cancel();this.capture(false);
      try{await this.flush();}catch(error){if(this.engine.localError)throw error;}
      this.paused++;
      try{await action();this.activate();}finally{this.paused--;}
    })().catch(error=>this.bridge.status(message(error))).finally(()=>{this.switching=null;});
    return this.switching;
  }
  async start(){
    const records=this.drafts();
    if(records.length){this.app.roomSetup.dialog?.close();this.showDrafts();return;}
    try{const id=localStorage.getItem(this.lastKey);if(id)await this.bridge.open(id);}catch(error){this.bridge.status(message(error));}
  }
  drafts(){
    const records=[];
    try{for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);if(!key.startsWith(this.prefix)||key===this.lastKey)continue;
      try{const r=JSON.parse(localStorage.getItem(key));if(r.format===1&&r.id&&r.snapshot?.scene&&typeof r.baseline==='string')records.push(r);}catch{}
    }}catch{this.storageUnavailable=true;}
    return records.sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
  }
  updateDraftCount(){const n=this.drafts().length;this.draftsButton.textContent='Черновики на устройстве'+(n?' · '+n:'');}
  renderStatus(){
    const e=this.engine;if(!e)return;
    const state=document.getElementById('studio-save-state');
    state.textContent=e.busy?'Сохранение…':e.conflict?'Конфликт версий':e.operation?'Операция требует завершения':e.dirty?
      (e.localError?'Изменения не сохранены':e.error?'Сохранено на устройстве':'Черновик сохранён · синхронизация…'):e.meta?'Сохранено':'Новый проект';
    state.dataset.dirty=String(e.dirty);state.setAttribute('aria-live','polite');
    this.warning.hidden=!e.error&&!e.localError&&!e.operation;
    this.warningText.textContent=e.localError?'Не удалось сохранить черновик на устройстве. Сохраните на сервере перед закрытием вкладки.':e.operation?'Есть незавершённая операция с версией. Нажмите «Повторить».':e.error?message(e.error):'';
    this.serverButton.hidden=!e.meta;this.copyButton.hidden=!e.error||e.error.status===422||Boolean(e.operation);this.retryButton.hidden=e.conflict&&!e.operation;
    this.checkErrorButton.hidden=e.error?.status!==422;
    this.updateDraftCount();
  }
  dialog(id,title){
    const d=el('dialog',null,'mf-project-dialog');d.id=id;
    const head=el('div',null,'mf-project-dialog-head'),h=el('h2',title);h.id=id+'-title';d.setAttribute('aria-labelledby',h.id);
    head.append(h,button('Закрыть',()=>d.close()));d.append(head);document.body.append(d);return d;
  }
  show(dialog){document.querySelector('.studio-menu').open=false;for(const d of document.querySelectorAll('.mf-project-dialog[open]'))if(d!==dialog)d.close();if(!dialog.open)dialog.showModal();}
  build(){
    const actions=document.querySelector('.mf3d-top-actions'),check=button('Проверить проект',()=>this.showChecks());check.id='check-project';document.getElementById('export-bazis').before(check);
    const menu=document.querySelector('.studio-menu-panel');this.versionsButton=button('Версии проекта',()=>this.showVersions());this.versionsButton.id='project-versions';
    this.draftsButton=button('Черновики на устройстве',()=>this.showDrafts());menu.prepend(this.versionsButton,this.draftsButton);
    this.warning=el('div',null,'mf-project-warning');this.warning.id='project-save-warning';this.warning.hidden=true;this.warning.setAttribute('role','status');
    this.warningText=el('span');this.retryButton=button('Повторить',()=>this.flush().catch(()=>{}));
    this.copyButton=button('Сохранить копией',()=>this.saveCopy().catch(e=>this.bridge.status(message(e))));
    this.serverButton=button('Открыть с сервера',()=>this.openServer());
    this.checkErrorButton=button('Проверить параметры',()=>this.showChecks());
    this.warning.append(this.warningText,this.checkErrorButton,this.retryButton,this.copyButton,this.serverButton);actions.closest('header').after(this.warning);
    this.versionsDialog=this.dialog('project-versions-dialog','Версии проекта');
    this.versionForm=el('form',null,'mf-version-form');const label=el('label','Название версии');this.labelInput=el('input');this.labelInput.id='project-version-label';this.labelInput.maxLength=120;this.labelInput.required=true;this.labelInput.placeholder='Например, После правок клиента';label.append(this.labelInput);
    const presets=el('div',null,'mf-version-presets');for(const name of ['Первоначальный','После правок клиента','Согласованный'])presets.append(button(name,()=>{this.labelInput.value=name;this.labelInput.focus();}));
    this.versionSave=button('Сохранить версию');this.versionSave.type='submit';this.versionSave.id='project-version-save';this.versionForm.append(label,this.versionSave);this.versionsDialog.append(presets,this.versionForm,el('p','Восстановление создаёт резервную версию текущего состояния.','mf-project-hint'));
    this.versionStatus=el('p');this.versionStatus.setAttribute('role','status');this.versionList=el('div',null,'mf-version-list');this.versionsDialog.append(this.versionStatus,this.versionList);
    this.versionForm.onsubmit=e=>{e.preventDefault();this.createVersion();};
    this.draftsDialog=this.dialog('project-drafts-dialog','Восстановление проекта');
    this.draftsDialog.append(el('p','Здесь остались изменения, которые не подтверждены сервером. Если проект открыт в другой вкладке, сравните версии перед продолжением.','mf-project-hint'));
    this.draftList=el('div',null,'mf-version-list');this.draftsDialog.append(this.draftList);
    this.checksDialog=this.dialog('project-checks-dialog','Проверка проекта');this.checkSummary=el('p');this.checkList=el('div',null,'mf-check-list');
    this.checksDialog.append(this.checkSummary,el('p','Открывание проверяется по геометрии двери и заданному углу; ящик — по длине направляющей. Ручки, одновременное открывание соседних фасадов и движение комнатных дверей требуют отдельной проверки.','mf-project-hint'),this.checkList);
  }
  async saveCopy(){
    this.capture(false);const previous=this.engine;
    // A new identity deliberately leaves the original conflict draft intact.
    const snapshot={...this.snapshot(),name:(this.snapshot().name+' — копия') .slice(0,200)};
    this.paused++;
    try{await this.bridge.loadSnapshot(snapshot,null);this.activate();this.engine.baseline='';this.engine.write();}finally{this.paused--;}
    await this.flush(true);if(previous.id!==this.engine.id)localStorage.removeItem(this.prefix+previous.id);this.renderStatus();
  }
  async duplicate(){
    await this.flush(true);
    const row=await this.bridge.request('/3d-projects/'+this.engine.meta.project_id+'/duplicate','POST',{});
    return this.navigate(async()=>{await this.bridge.loadSnapshot({name:row.name,scene:row.scene},{project_id:row.project_id,version:row.version});this.bridge.acknowledge(row);});
  }
  openServer(){
    const id=this.engine.meta?.project_id;if(!id)return;
    this.bridge.open(id);
  }
  showDrafts(){
    this.draftList.replaceChildren();const records=this.drafts();
    if(!records.length)this.draftList.append(el('p','Нет несохранённых черновиков.'));
    for(const r of records){
      const row=el('article',null,'mf-version-row'),info=el('div');info.append(el('strong',r.snapshot.name),el('small',date(r.updated_at)+(r.meta?' · сохранённый проект':' · новый проект')));
      const recover=button('Восстановить',async()=>{
        recover.disabled=true;
        try{
          this.capture(false);await this.engine.busy?.catch(()=>{});this.paused++;
          try{await this.bridge.loadSnapshot(r.snapshot,r.meta);this.activate(r);}finally{this.paused--;}
          this.draftsDialog.close();await this.flush(true);
        }catch(error){this.bridge.status(message(error));}finally{recover.disabled=false;}
      });
      const discard=button('Удалить черновик',()=>{if(confirm('Удалить только этот черновик с устройства? Несохранённые правки будут потеряны.')){localStorage.removeItem(this.prefix+r.id);this.showDrafts();}});
      discard.disabled=r.id===this.engine.id;row.append(info,recover,discard);this.draftList.append(row);
    }
    this.show(this.draftsDialog);
  }
  async showVersions(){
    this.show(this.versionsDialog);this.versionStatus.textContent='Загрузка…';this.versionList.replaceChildren();
    try{await this.flush(true);await this.loadVersions();}catch(error){this.versionStatus.textContent=message(error);}
  }
  async loadVersions(){
    const id=this.engine.meta?.project_id;if(!id)return;
    const data=await this.bridge.request('/3d-projects/'+id+'/versions');if(id!==this.engine.meta?.project_id)return;
    this.versionStatus.textContent=data.items.length?'':'Пока нет именованных версий. Сохраните первый вариант.';this.versionList.replaceChildren();
    for(const v of data.items){
      const row=el('article',null,'mf-version-row'),info=el('div');info.append(el('strong',v.label),el('small',date(v.created_at)+' · ревизия '+v.project_version));
      const restore=button('Восстановить',async()=>{
        if(!confirm('Восстановить «'+v.label+'»? Текущее состояние сначала сохранится отдельной резервной версией.'))return;
        restore.disabled=true;
        try{await this.flush(true);this.engine.operation={kind:'restore',before:fingerprint(this.snapshot()),path:'/3d-projects/'+id+'/versions/'+v.version_id+'/restore',body:{version:this.engine.meta.version,request_id:crypto.randomUUID()}};this.engine.write();await this.finishOperation();await this.loadVersions();}
        catch(error){this.versionStatus.textContent=message(error);}finally{restore.disabled=false;}
      });row.append(info,restore);this.versionList.append(row);
    }
  }
  async createVersion(){
    const label=this.labelInput.value.trim();if(!label)return;
    this.versionSave.disabled=true;
    try{await this.flush(true);this.engine.operation={kind:'checkpoint',path:'/3d-projects/'+this.engine.meta.project_id+'/versions',body:{label,version:this.engine.meta.version,request_id:crypto.randomUUID()}};this.engine.write();await this.finishOperation();this.labelInput.value='';await this.loadVersions();}
    catch(error){this.versionStatus.textContent=message(error);}finally{this.versionSave.disabled=false;}
  }
  async finishOperation(){
    if(this.operationBusy)return this.operationBusy;
    const engine=this.engine,op=engine.operation;if(!op)return;
    this.operationBusy=(async()=>{
      this.paused++;
      try{
        const result=await this.bridge.request(op.path,'POST',op.body);
        if(op.kind==='restore'){
          // Edits made while a reply was lost stay recoverable, even when the
          // server has already completed restoration. Never replace them silently.
          const local=this.snapshot();
          if(op.before&&fingerprint(local)!==op.before){
            const copy={...engine.record(),id:crypto.randomUUID(),snapshot:local,operation:null,pending:null};
            localStorage.setItem(this.prefix+copy.id,JSON.stringify(copy));
            this.bridge.status('Правки после запроса восстановления оставлены в черновиках на устройстве.');
          }
          await this.bridge.loadSnapshot({name:result.name,scene:result.scene},{project_id:result.project_id,version:result.version});this.bridge.acknowledge(result);
          engine.snapshot=this.snapshot();engine.baseline=fingerprint(engine.snapshot);engine.meta={project_id:result.project_id,version:result.version};
          this.app.scene.fit('kitchen');
        }
        engine.operation=null;engine.error=null;
        engine.write();
      }catch(error){engine.error=error;if(error.status>=400&&error.status<500&&error.status!==408&&error.status!==429)engine.operation=null;engine.write();throw error;}
      finally{this.paused--;}
    })().finally(()=>{this.operationBusy=null;});return this.operationBusy;
  }
  async removeProject(){
    const id=this.engine.meta?.project_id;if(!id||!confirm('Удалить этот 3D-проект?'))return;
    try{
      await this.flush();this.paused++;
      try{await this.bridge.request('/3d-projects/'+id,'DELETE');localStorage.removeItem(this.prefix+this.engine.id);localStorage.removeItem(this.lastKey);await this.bridge.resetProject();this.activate();await this.bridge.reloadProjects();}
      finally{this.paused--;}
    }catch(error){this.bridge.status(message(error));}
  }
  showChecks(){
    this.app.interaction?.cancel();const report=checkProject(this.bridge.state(),{template:this.bridge.template,material:this.bridge.material});
    this.checkSummary.textContent=`Ошибки: ${report.counts.error} · Проверить: ${report.counts.warning} · Примечания: ${report.counts.info}. Механизмов проверено: ${report.mechanisms}.`;
    this.checkList.replaceChildren();
    if(!report.issues.length)this.checkList.append(el('p','Замечаний по доступным данным не найдено.'));
    for(const issue of report.issues){
      const row=el('article',null,'mf-check-row');row.dataset.severity=issue.severity;row.dataset.code=issue.code;
      const info=el('div');info.append(el('small',({error:'Ошибка',warning:'Проверить',info:'Примечание'}[issue.severity])+' · '+issue.name),el('strong',issue.message));if(issue.detail)info.append(el('p',issue.detail));row.append(info);
      if(issue.itemId){
        const focus=()=>{this.checksDialog.close();this.bridge.select(issue.itemId);this.app.ensureSelectedVisible();this.app.scene.fit('selected');};
        row.append(button('Показать шкаф',focus));row.onclick=e=>{if(!e.target.closest('button'))focus();};row.dataset.actionable='true';
      }
      this.checkList.append(row);
    }
    this.show(this.checksDialog);
  }
  dispose(){clearTimeout(this.timer);this.capture(false);this.unsubscribe?.();this.abort.abort();for(const d of document.querySelectorAll('.mf-project-dialog'))d.remove();delete window.MF_PROJECT_SAFETY;}
}
