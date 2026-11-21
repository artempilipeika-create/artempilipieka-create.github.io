import {chooseHinge,hingeProduct,settingFor,closingNames} from './wardrobe-hinge-layout.mjs';
export {chooseHinge,compatibleHinge} from './wardrobe-hinge-layout.mjs';
import {pushProducts,pushDefault} from './wardrobe-push-layout.mjs';
import {aksPushProductControls,pushMountNames} from './wardrobe-push-product-ui.mjs';

const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function pushControls(ui,box,leaf,clearHandle){
 const f=ui.fields.front,key=leaf.key,current=settingFor(f,key),push=current.push;
 const section=node('fieldset');section.className='wardrobe-door-editor';section.append(node('legend','Открывание двери'));box.append(section);
 function update(next){
  const value={...current};
  if(next){
   const fit=chooseHinge(hingeProduct(f,key).kind,next,current.article);
   if(!fit)return;
   clearHandle(key);value.push=next;value.article=fit.article;
  }else{
   delete value.push;
   if(current.push&&hingeProduct(f,key).frame)value.article='71B950A';
  }
  (f.hinges??={})[key]=value;ui.changed(true);
 }
 function select(title,choices,value,action){return ui.select(section,title,Object.entries(choices),value,action);}
 const productHinge=hingeProduct(f,key),canPush=chooseHinge(productHinge.kind,true,current.article);
 select('Способ открывания',{handle:productHinge.frame?'Рукой':'Ручка',...(canPush?{push:'Нажатием'}:{})},push?'push':'handle',v=>update(v==='push'?{...pushDefault}:null));
 if(!canPush)section.append(node('small','Для Z1 с TIP-ON доступна накладная беспружинная петля 70T950A.TL.'));
 if(!push)return;
 select('Система типона',{aks:'AKS',aq:'AQ ONE-PUSH'},push===true?'aq':'aks',v=>update(v==='aq'?true:{...pushDefault}));
 if(push===true){
  const fig=node('figure'),img=node('img');img.src='/account/planner/shelf-images/09.0019.webp';img.alt='AQ ONE-PUSH';img.width=104;img.height=64;
  fig.append(img,node('figcaption','AQ ONE-PUSH · 09.0019, адаптер 09.0020, ответная планка 09.0021'));section.append(fig);return;
 }
 const cfg={...pushDefault,...push},product=pushProducts[cfg.article];
 aksPushProductControls(ui,section,cfg,update);
 select('Место установки',{auto:'Автоматически',side:'Боковая стойка',shelf:'Закреплённая полка',bottom:'Дно или полка под створкой'},cfg.support,support=>update({...cfg,support}));
 if(cfg.support==='side'||cfg.support==='shelf'||cfg.support==='auto'&&leaf.height>=1100&&!key.includes('upper-')){
  const label=node('label','Высота нажатия от пола, мм'),input=node('input');input.type='number';input.min='0';input.max='5000';input.step='1';input.required=true;input.value=cfg.heightMm;
  input.onchange=()=>{if(input.reportValidity())update({...cfg,heightMm:input.valueAsNumber});};label.append(input);section.append(label);
 }
 const pos=ui.previewBuilt?.pushLocations?.[key];
 if(pos)section.append(node('p',pushMountNames[pos.style]+' · '+pos.host+' · '+Math.round(pos.height)+' мм от пола'));
 section.append(node('small','Петля '+closingNames[hingeProduct(f,key).closing]+' · '+current.article+(product.tip==='magnet'?'. Стальная ответная планка входит в комплект.':'.')));
}
