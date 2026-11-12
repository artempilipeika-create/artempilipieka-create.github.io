import {selectedCarcass,assistantStamp,prepareAssistantPlan,applyAssistantPlan} from './assistant-model.mjs';
const el=(tag,text)=>{const x=document.createElement(tag);if(text)x.textContent=text;return x;};
export class AssistantUI{
 constructor(app){this.app=app;this.disposed=false;this.start().catch(()=>{});}
 async start(){
  if(!this.app.bridge.assistantAdmin?.())return;
  // This private endpoint independently checks the admin role; no capability
  // is inferred from client-side CSS or from the broader production-tool role.
  const status=await this.app.bridge.request('/3d-assistant/status');
  if(this.disposed||!status.available)return;
  const style=el('link');style.rel='stylesheet';style.href='/account/planner/assistant.css';document.head.append(style);this.style=style;
  this.button=el('button','Собрать с ИИ');this.button.type='button';this.button.id='planner-assistant';this.button.className='secondary';
  document.getElementById('planner-tools').append(this.button);
  this.dialog=el('dialog');this.dialog.id='planner-assistant-dialog';this.dialog.setAttribute('aria-labelledby','assistant-title');
  const head=el('div');head.className='assistant-head';const title=el('h2','Помощник конструктора');title.id='assistant-title';
  const close=el('button','Закрыть');close.type='button';head.append(title,close);
  const intro=el('p','Опишите корпус: ширину, высоту, глубину и полки. Чтобы изменить корпус помощника, выберите любую его деталь.');
  const hint=el('p','Пробная версия · только для администратора. Сейчас доступны корпуса без фасадов и фурнитуры; фото подключим следующим этапом.');hint.className='assistant-hint';
  this.context=el('p');this.context.className='assistant-context';
  const label=el('label','Что собрать или изменить?');this.input=el('textarea');this.input.id='assistant-prompt';this.input.rows=4;this.input.maxLength=2000;
  this.input.placeholder='Шкаф шириной 800, высотой 2200, глубиной 577 мм, 5 полок';label.append(this.input);
  this.send=el('button','Подготовить предложение');this.send.type='button';this.send.className='assistant-primary';
  this.remaining=el('p');this.count(status.remaining);
  this.output=el('p');this.output.setAttribute('role','status');this.output.setAttribute('aria-live','polite');
  this.preview=el('ul');this.preview.hidden=true;
  this.apply=el('button','Применить к проекту');this.apply.type='button';this.apply.className='assistant-primary';this.apply.hidden=true;
  const undo=el('button','Отменить последнее действие');undo.type='button';
  this.dialog.append(head,intro,hint,this.context,label,this.send,this.remaining,this.output,this.preview,this.apply,undo);document.body.append(this.dialog);
  this.button.onclick=()=>{this.pending=null;this.apply.hidden=true;this.preview.hidden=true;this.output.textContent='';
   try{const c=selectedCarcass(this.app.adapter);this.context.textContent=c?'Выбран корпус: '+c.metadata.spec.width+' × '+c.metadata.spec.height+' × '+c.metadata.spec.depth+' мм':'Новый корпус · размеры помещения учитываются при размещении.';}catch(e){this.context.textContent=e.message;}
   this.dialog.showModal();this.input.focus();};
  close.onclick=()=>this.dialog.close();this.send.onclick=()=>this.ask();
  this.apply.onclick=()=>this.commit();undo.onclick=()=>{this.app.interaction.cancel();this.app.history.undo();this.invalidate();this.output.textContent='Последнее действие отменено.';};
  this.unsubscribe=this.app.bridge.subscribe(reason=>{if(reason==='before-project'||reason==='project'){this.epoch=(this.epoch||0)+1;this.invalidate();this.dialog.close();}});
 }
 count(n){this.remaining.textContent='Пробных обращений осталось: '+n+'. Каждая отправка использует API-кредиты.';}
 invalidate(){this.pending=null;this.apply.hidden=true;this.preview.hidden=true;}
 async ask(){
  if(this.busy)return;
  if(!this.app.interaction.editable()){this.output.textContent='Сначала задайте размеры помещения и включите редактирование проекта.';return;}
  const message=this.input.value.trim();if(!message){this.input.focus();return;}
  this.invalidate();this.busy=true;this.send.disabled=true;this.output.textContent='Подготавливаю предложение…';
  const stamp=assistantStamp(this.app.adapter),epoch=this.epoch||0;
  try{
   const selected=selectedCarcass(this.app.adapter),current=selected?.metadata.spec||null,group=selected?.metadata.group_id||null;
   const result=await this.app.bridge.request('/3d-assistant/plan','POST',{request_id:crypto.randomUUID(),message,current,room_height:this.app.adapter.room.height});
   if(this.disposed||(this.epoch||0)!==epoch)return;
   if(result.remaining!=null)this.count(result.remaining);
   if(result.state!=='ready')throw Error(result.message||'Предложение пока не готово.');
   this.output.textContent=result.plan.message;
   if(result.plan.action==='clarify')return;
   if(assistantStamp(this.app.adapter)!==stamp)throw Error('Проект изменился во время запроса. Подготовьте предложение заново.');
   // A selection change cannot redirect an update to a different carcass.
   if((selectedCarcass(this.app.adapter)?.metadata.group_id||null)!==group)throw Error('Выбран другой корпус. Подготовьте предложение заново.');
   this.pending=prepareAssistantPlan(this.app.adapter,result.plan,{defaultMaterial:globalThis.MF_FURNITURE_CORE?.DEFAULT_MATERIALS?.body_variant_id||null});
   this.preview.replaceChildren(...this.pending.summary.map(s=>el('li',s)));this.preview.hidden=false;this.apply.hidden=false;
  }catch(e){if(!this.disposed&&(this.epoch||0)===epoch)this.output.textContent=e.message;}
  finally{this.busy=false;if(!this.disposed)this.send.disabled=false;}
 }
 commit(){
  if(!this.pending)return;
  const ok=this.app.interaction.change('Корпус по предложению ИИ',()=>applyAssistantPlan(this.app.adapter,this.pending));
  if(ok){this.invalidate();this.dialog.close();this.app.scene.fit('kitchen');this.app.adapter.status('Корпус готов. Изменение можно отменить одним шагом.');}
  else{this.output.textContent='Предложение не применено. Проверьте сообщение конструктора и подготовьте его заново.';this.invalidate();}
 }
 dispose(){this.disposed=true;this.unsubscribe?.();this.button?.remove();this.dialog?.remove();this.style?.remove();}
}
