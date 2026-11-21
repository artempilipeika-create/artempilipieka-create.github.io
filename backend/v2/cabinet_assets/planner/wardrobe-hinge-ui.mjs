import {chooseHinge,compatibleHinge} from './wardrobe-push-ui.mjs';
import {hingeCatalogue,blumPlates,hingeBrand,hingeKinds,closingNames,meetingGap,hingeProduct,settingFor,nominalSide,onDivider,dividerAxes,middleDivider,activeLeafKeys} from './wardrobe-hinge-layout.mjs';
import {hingePhotoCard} from './hardware-photos.mjs';

const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
const button=(text,action)=>{const b=el('button',text);b.type='button';b.onclick=action;return b;};
export function plateControls(section,fit,choose){
 const current=fit.plate,options=el('div');options.className='wardrobe-prime-cards';
 section.append(el('strong','Ответная планка на стойке'));
 options.setAttribute('role','group');options.setAttribute('aria-label','Ответная планка Blum');
 for(const plate of blumPlates.filter(p=>p.finish===fit.finish)){
  const name=(plate.shape==='cross'?'Крестообразная':'Прямая')+' H0 · '+plate.sku+' · '+plate.finish;
  const card=button('',()=>choose(plate.sku)),figure=el('figure'),img=el('img');
  card.dataset.plateArticle=plate.sku;card.setAttribute('aria-pressed',String(plate.sku===current.sku));
  figure.className='fitting-card';img.src=plate.photo;img.alt=name;img.loading='lazy';
  figure.append(img,el('figcaption',name));card.append(figure);options.append(card);
 }
 section.append(options,el('small','Чашка входит в петлю. На каждую точку крепления устанавливаются одна петля и одна отдельная планка.'));
}
export function hingeControls(ui,box,s,leaf,clearHandle){
 const f=ui.fields.front,key=leaf.key,current=settingFor(f,key),product=hingeProduct(f,key);
 const section=el('fieldset');section.className='wardrobe-hinge-editor';section.append(el('legend','Петли выбранной двери'));box.append(section);
 function set(value){
  const assignments=f.hinges??={};
  assignments[key]=value;
  if(!Object.keys(assignments).some(k=>onDivider(f,k)))delete f.hingeDivider;
  ui.changed(true);
 }
 const brands=el('div');brands.className='wardrobe-subsections';brands.setAttribute('role','group');brands.setAttribute('aria-label','Производитель петель');
 for(const brand of ['AKS','Blum']){
  const selected=hingeBrand(product)===brand;
  const b=button(brand==='Blum'?'Blum · премиум':'AKS',()=>{
   if(selected)return;
   const fit=chooseHinge(product.kind,current.push,current.article,product.frame??'board',brand);
   if(!fit)return;
   const value={...current,article:fit.article};delete value.plate;set(value);
  });
  b.dataset.hingeBrand=brand;b.disabled=Boolean(product.frame&&brand==='AKS');b.setAttribute('aria-pressed',String(selected));brands.append(b);
 }
 section.append(brands);
 const tabs=el('div');tabs.className='wardrobe-subsections';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Тип петли');
 for(const [kind,label] of Object.entries(hingeKinds)){
  const next=chooseHinge(kind,current.push,product.brand==='Blum'?current.article:({overlay:'112595',half:'112644',inset:'112650'})[kind]);
  const tab=button(label,()=>{
   if(next&&product.kind!==kind){set({article:next.article,...(current.push?{push:current.push}:{}),...(current.plate?{plate:current.plate}:{})});}
  });
  tab.dataset.hingeKind=kind;tab.setAttribute('aria-pressed',String(product.kind===kind));
  if(kind==='half'&&s.sections<2){tab.disabled=true;tab.title='Добавьте перегородку в разделе «Полки».';}
  if(!next){tab.disabled=true;tab.title='Для Z1 с TIP-ON доступна накладная беспружинная петля.';}
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
 for(const fit of Object.values(hingeCatalogue).filter(p=>hingeBrand(p)===hingeBrand(product)&&p.frame===product.frame&&p.kind===product.kind&&compatibleHinge(p,current.push))){
  const card=button('',()=>{
   if(fit.article!==current.article)set({...current,article:fit.article});
  });
  card.dataset.hingeArticle=fit.article;
  card.setAttribute('aria-label',fit.series+' '+fit.article+' '+closingNames[fit.closing]+' '+(fit.fixing==='euro'?'еврошурупы':'саморезы'));
  card.setAttribute('aria-pressed',String(fit.article===current.article));card.append(hingePhotoCard(fit.article));options.append(card);
 }
 section.append(options);
 if(product.plate)plateControls(section,product,plate=>set({...current,plate}));
 const other=key.replace(/(left|right)$/,side==='left'?'right':'left');
 if(activeLeafKeys(f).includes(other)){
  const applyLabel=product.frame!==hingeProduct(f,other).frame?'Применить фасад и петли к парной двери':'Применить к парной двери';
  section.append(button(applyLabel,()=>{if(current.push)clearHandle(other);else if(product.frame&&f.handles?.[other]&&!['118124','118129'].includes(f.handles[other].article))delete f.handles[other];(f.hinges??={})[other]=structuredClone(current);set({...current});}));
 }
}
