import {VIEW_NAMES,VIEW_LIMIT,exportSize,fileName,presentationSheet} from './presentation.mjs';
import {capturePresentation} from './presentation-capture.mjs';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export class PresentationUI{
  constructor(app){
    this.app=app;this.sequence=0;
    this.openButton=this.button('Картинка для клиента',()=>this.open());this.openButton.id='presentation-open';
    document.getElementById('to-order').before(this.openButton);
    this.dialog=el('dialog',null,'mf-presentation');this.dialog.id='presentation-dialog';this.dialog.setAttribute('aria-labelledby','presentation-title');
    const head=el('header',null,'presentation-head'),heading=el('div');heading.append(el('span','MARTIN FOREST / ПРЕЗЕНТАЦИЯ','presentation-kicker'));
    const h=el('h2','Картинка для клиента');h.id='presentation-title';heading.append(h);
    head.append(heading,this.button('Закрыть',()=>this.dialog.close()));this.dialog.append(head);
    const body=el('div',null,'presentation-body'),preview=el('section',null,'presentation-preview');
    this.canvas=el('canvas');this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Предварительный просмотр изображения для клиента');preview.append(this.canvas);
    this.caption=el('p',null,'presentation-caption');preview.append(this.caption);body.append(preview);
    const controls=el('section',null,'presentation-controls');controls.append(el('h3','Оформление'));
    this.format=this.select(controls,'Вид изображения',[['brand','Фирменный лист'],['clean','Чистая сцена']]);
    this.format.id='presentation-format';this.app.listen(this.format,'change',()=>this.refresh());
    this.view=this.select(controls,'Ракурс',Object.entries(VIEW_NAMES));this.view.id='presentation-view';this.app.listen(this.view,'change',()=>this.refresh());
    this.size=this.select(controls,'Разрешение сцены',[['standard','1920 × 1080'],['large','2560 × 1440']]);this.app.listen(this.size,'change',()=>this.refresh());
    this.apply=this.button('Открыть этот ракурс на сцене',()=>this.applyView());controls.append(this.apply);
    const details=el('details',null,'presentation-saved');details.append(el('summary','Сохранённые ракурсы'));
    details.append(el('p','Сначала поверните сцену, затем запомните вид. До 6 ракурсов сохраняются вместе с проектом.'));
    const label=el('label','Название ракурса');this.name=el('input');this.name.maxLength=60;this.name.placeholder='Например, Вид от входа';label.append(this.name);details.append(label);
    this.remember=this.button('Запомнить текущий ракурс',()=>this.rememberView());details.append(this.remember);
    this.savedList=el('div',null,'presentation-saved-list');details.append(this.savedList);controls.append(details);
    const quality=el('details',null,'presentation-quality');quality.append(el('summary','Качество на этом устройстве'));
    this.quality=this.select(quality,'Качество сцены',[['auto','Автоматически'],['high','Высокое'],['balanced','Плавная работа']]);
    this.app.listen(this.quality,'change',()=>this.app.scene.applyQuality?.(this.quality.value));
    quality.append(el('p','Автоматический режим уменьшает нагрузку при медленной отрисовке. Разрешение сохранённой картинки задаётся отдельно.'));controls.append(quality);
    this.status=el('p',null,'presentation-status');this.status.setAttribute('role','status');controls.append(this.status);
    this.download=el('a','Сохранить изображение','presentation-download');this.download.id='presentation-download';this.download.setAttribute('aria-disabled','true');controls.append(this.download);
    this.app.listen(this.download,'click',e=>{if(!this.download.href||this.download.getAttribute('aria-disabled')==='true'){e.preventDefault();return;}this.status.textContent='PNG подготовлен. Браузер сохранит файл в загрузки.';});
    controls.append(this.button('Обновить предпросмотр',()=>this.refresh()));body.append(controls);this.dialog.append(body);
    document.getElementById('planner-workspace').append(this.dialog);
    this.app.listen(this.dialog,'close',()=>{this.sequence++;this.release();this.openButton.focus({preventScroll:true});});
    this.unsubscribe=app.bridge.subscribe(reason=>{if(reason==='before-project')this.dialog.close();});
  }
  button(text,fn){const b=el('button',text,'secondary');b.type='button';this.app.listen(b,'click',fn);return b;}
  select(parent,text,choices){const label=el('label',text),s=el('select');s.setAttribute('aria-label',text);for(const [value,text]of choices){const o=el('option',text);o.value=value;s.append(o);}label.append(s);parent.append(label);return s;}
  views(){return this.app.adapter.state.presentationViews||[];}
  release(){if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.download.removeAttribute('href');this.download.setAttribute('aria-disabled','true');}
  open(){
    const s=this.app.scene;if(s.isFallback||!this.app.adapter.items.length){this.app.adapter.status('Добавьте мебель и дождитесь готовности 3D-сцены.');return;}
    this.app.interaction.cancel();s.stopOrbitInertia();this.current=s.captureView();this.view.value='threeQuarter';this.quality.value=s.qualityMode||'auto';this.syncViews();
    this.dialog.showModal();this.refresh();
  }
  syncViews(){
    const value=this.view.value;this.view.replaceChildren();
    for(const [key,text]of [...Object.entries(VIEW_NAMES),...this.views().map(v=>['saved:'+v.id,v.name])]){const o=el('option',text);o.value=key;this.view.append(o);}this.view.value=value||'threeQuarter';
    this.savedList.replaceChildren();for(const v of this.views()){
      const row=el('div'),use=this.button(v.name,()=>{this.view.value='saved:'+v.id;this.refresh();}),remove=this.button('×',()=>this.removeView(v.id));
      remove.setAttribute('aria-label','Удалить ракурс '+v.name);row.append(use,remove);this.savedList.append(row);
    }
    this.remember.disabled=this.views().length>=VIEW_LIMIT;
  }
  rememberView(){
    const name=this.name.value.trim();if(!name){this.status.textContent='Введите название ракурса.';this.name.focus();return;}
    if(this.views().length>=VIEW_LIMIT)return;
    const v={id:crypto.randomUUID(),name,...structuredClone(this.current)};
    this.app.history.run('Сохранить ракурс',()=>{this.app.adapter.state.presentationViews=[...this.views(),v];this.app.bridge.refresh();});
    this.syncViews();this.view.value='saved:'+v.id;this.name.value='';this.refresh();
  }
  removeView(id){
    if(this.view.value==='saved:'+id)this.view.value='threeQuarter';
    this.app.history.run('Удалить ракурс',()=>{this.app.adapter.state.presentationViews=this.views().filter(v=>v.id!==id);this.app.bridge.refresh();});this.syncViews();this.refresh();
  }
  chosenView(){return this.view.value==='current'?this.current:this.views().find(v=>'saved:'+v.id===this.view.value)||null;}
  applyView(){
    const s=this.app.scene,saved=this.chosenView(),value=this.view.value;
    this.dialog.close();if(!this.app.workspace.isClient())this.app.workspace.client();
    requestAnimationFrame(()=>{if(saved)s.restoreView(saved);else if(value==='top')s.setView('top');else s.fitKitchenForClient(value);this.app.paintMode();});
  }
  async refresh(){
    const seq=++this.sequence;this.release();this.status.textContent='Готовим изображение…';
    await new Promise(requestAnimationFrame);if(seq!==this.sequence||!this.dialog.open)return;
    try{
      const s=this.app.scene,{width,height}=exportSize(this.size.value,s.renderer.capabilities.maxTextureSize);
      const source=capturePresentation(s,{width,height,view:this.view.value,savedView:this.chosenView()});
      const name=document.getElementById('project-name').value.trim()||'Проект кухни',view=this.view.selectedOptions[0].textContent,date=new Date();
      const branded=this.format.value==='brand',output=branded?presentationSheet(source,{name,view,date,room:this.app.adapter.room,modules:this.app.adapter.items.length}):source;
      this.canvas.width=output.width;this.canvas.height=output.height;this.canvas.getContext('2d').drawImage(output,0,0);
      this.caption.textContent=`${branded?'Фирменный лист':'Чистая сцена'} · PNG · ${output.width} × ${output.height} px`;
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
      if(seq!==this.sequence||!this.dialog.open)return;if(!blob)throw Error('Браузер не смог подготовить изображение.');
      this.url=URL.createObjectURL(blob);this.download.href=this.url;this.download.download=fileName(name,view,branded,date);this.download.setAttribute('aria-disabled','false');
      this.status.textContent='Готово к сохранению. Интерфейс и размеры в картинку не входят.';
    }catch(error){this.status.textContent=error.name==='SecurityError'?'Не удалось получить изображение текстуры. Обновите страницу и повторите.':error.message;this.caption.textContent='Предпросмотр не готов';}
  }
  dispose(){this.sequence++;this.release();this.unsubscribe?.();this.dialog.remove();this.openButton.remove();}
}
