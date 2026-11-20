import {chooseHinge,compatibleHinge} from './wardrobe-push-ui.mjs';
import {hingeCatalogue,hingeKinds,closingNames,meetingGap,hingeProduct,settingFor,nominalSide,onDivider,dividerAxes,middleDivider,activeLeafKeys} from './wardrobe-hinge-layout.mjs';
import {hingePhotoCard} from './hardware-photos.mjs';

const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
const button=(text,action)=>{const b=el('button',text);b.type='button';b.onclick=action;return b;};
export function hingeControls(ui,box,s,leaf,clearHandle){
 const f=ui.fields.front,key=leaf.key,current=settingFor(f,key),product=hingeProduct(f,key);
 const section=el('fieldset');section.className='wardrobe-hinge-editor';section.append(el('legend','Петли выбранной двери'));box.append(section);
 function set(value){
  const assignments=f.hinges??={};
  assignments[key]=value;
  if(!Object.keys(assignments).some(k=>onDivider(f,k)))delete f.hingeDivider;
  ui.changed(true);
 }
 const tabs=el('div');tabs.className='wardrobe-subsections';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Тип петли');
 for(const [kind,label] of Object.entries(hingeKinds)){
  const tab=button(label,()=>{
   if(product.kind!==kind){const next=chooseHinge(kind,current.push,({overlay:'112595',half:'112644',inset:'112650'})[kind]);set({article:next.article,...(current.push?{push:current.push}:{})});}
  });
  tab.dataset.hingeKind=kind;tab.setAttribute('aria-pressed',String(product.kind===kind));
  if(kind==='half'&&s.sections<2){tab.disabled=true;tab.title='Добавьте перегородку в разделе «Полки».';}
  tabs.append(tab);
 }
 section.append(tabs);
 if(product.kind==='inset'){
  const label=el('label','Утопление фасада, мм'),input=el('input');
  input.type='number';input.step='1';input.min='0';input.max=String(s.depth-60);input.required=true;input.value=current.recess??2;input.dataset.hingeRecess='';
  input.onchange=()=>{if(input.reportValidity())set({...current,recess:input.valueAsNumber});};label.append(input);section.append(label);
  if(s.sections>1)ui.select(section,'Стойка для вкладной петли',[['side','Боковая стойка'],['center','Общая перегородка']],current.central?'center':'side',v=>{
   const value={...current};if(v==='center')value.central=true;else delete value.central;set(value);
  });
 }
 const mounted=onDivider(f,key),side=nominalSide(key);
 if(mounted&&s.sections>1){
  const axes=dividerAxes(s);ui.select(section,'Общая стойка',axes.map((x,i)=>[i,'Перегородка '+(i+1)+' · '+x+' мм от левого края']),middleDivider(s).index,v=>{f.hingeDivider=Number(v);ui.changed(true);});
 }
 section.append(el('small',product.kind==='inset'?'По 1,5 мм между фасадом и стойками, глубина от переднего торца до лица двери.':
  product.kind==='half'?'Петли на перегородке '+(s.sections>1?middleDivider(s).index+1:'')+' · заход '+((s.thickness-meetingGap(f,key))/2)+' мм.':
  'Петли на '+(side==='left'?'левой':'правой')+' боковине · заход '+(s.thickness-1.5)+' мм.'));
 if(s.sections<2)section.append(el('small','Для полунакладной петли добавьте перегородку в разделе «Полки».'));
 const options=el('div');options.className='wardrobe-prime-cards';options.setAttribute('role','group');options.setAttribute('aria-label','Модели петель');
 for(const fit of Object.values(hingeCatalogue).filter(p=>p.kind===product.kind&&compatibleHinge(p,current.push))){
  const card=button('',()=>{
   if(fit.article!==current.article)set({...current,article:fit.article});
  });
  card.dataset.hingeArticle=fit.article;
  card.setAttribute('aria-label',fit.series+' '+fit.article+' '+closingNames[fit.closing]+' '+(fit.fixing==='euro'?'еврошурупы':'саморезы'));
  card.setAttribute('aria-pressed',String(fit.article===current.article));card.append(hingePhotoCard(fit.article));options.append(card);
 }
 section.append(options);
 const other=key.replace(/(left|right)$/,side==='left'?'right':'left');
 if(activeLeafKeys(f).includes(other)){
  section.append(button('Применить к парной двери',()=>{if(current.push)clearHandle(other);(f.hinges??={})[other]=structuredClone(current);set({...current});}));
 }
}
