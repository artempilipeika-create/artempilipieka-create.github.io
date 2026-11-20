import {hingeCatalogue,hingeName} from './wardrobe-hinge-layout.mjs';

// Supplier photographs, matched to the model articles. Source audit: docs/hardware-photos-20261026.
const PHOTOS=Object.freeze({
 "114064": {
  "file": "114064.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-150-focus-side-left-mounted-graphite-prime-by-aks/",
  "name": "Pull-out cargo basket 150 FOCUS side/left mounted, graphite PRIME by AKS",
  "supplier": "AKS"
 },
 "115622": {
  "file": "115622.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-150-icon-mounted-side-left-graphite-prime-by-aks/",
  "name": "Pull-out cargo basket 150 ICON mounted side/left, graphite PRIME by AKS",
  "supplier": "AKS"
 },
 "114066": {
  "file": "114066.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-200-focus-side-left-mounted-graphite-prime-by-aks/",
  "name": "Pull-out cargo basket 200 FOCUS side/left mounted, graphite PRIME by AKS",
  "supplier": "AKS"
 },
 "36028": {
  "file": "36028.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-200-norwig-fastening-lower-chrome-aks/",
  "name": "Pull-out cargo basket 200 NORWIG fastening lower, chrome AKS",
  "supplier": "AKS"
 },
 "112512": {
  "file": "112512.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-300-focus-graphite-prime-by-aks/",
  "name": "Pull-out cargo basket 300 FOCUS, graphite PRIME by AKS",
  "supplier": "AKS"
 },
 "112521": {
  "file": "112521.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-300-icon-graphite-prime-by-aks/",
  "name": "Pull-out cargo basket 300 ICON, graphite PRIME by AKS",
  "supplier": "AKS"
 },
 "36029": {
  "file": "36029.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-cargo-basket-300-norwig-lower-mounting-chrome-aks/",
  "name": "Pull-out cargo basket 300 NORWIG, lower mounting, chrome AKS",
  "supplier": "AKS"
 },
 "105174": {
  "file": "105174.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-drying-basket-600-norwig-graphite-aks/",
  "name": "Pull-out drying basket 600 NORWIG, graphite AKS",
  "supplier": "AKS"
 },
 "105175": {
  "file": "105175.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-drying-basket-800-norwig-graphite-aks/",
  "name": "Pull-out drying basket 800 NORWIG, graphite AKS",
  "supplier": "AKS"
 },
 "90619": {
  "file": "90619.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-drying-basket-600-flat-line-stainless-steel-chrome-aks/",
  "name": "Pull-out drying basket 600 FLAT LINE stainless steel, chrome AKS",
  "supplier": "AKS"
 },
 "95550": {
  "file": "95550.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-drying-basket-700-flat-line-stainless-steel-chrome-aks/",
  "name": "Pull-out drying basket 700 FLAT LINE stainless steel, chrome AKS",
  "supplier": "AKS"
 },
 "90620": {
  "file": "90620.webp",
  "source": "https://aksgeorgia.ge/en/product/pull-out-drying-basket-800-flat-line-stainless-steel-chrome-aks/",
  "name": "Pull-out drying basket 800 FLAT LINE stainless steel, chrome AKS",
  "supplier": "AKS"
 },
 "114797": {
  "file": "114797.webp",
  "source": "https://aksgeorgia.ge/en/product/ball-guide-l-500-h45-prime-by-aks-soft-close-a/",
  "name": "Ball guide L-500 h=45 PRIME by AKS SOFT CLOSE A",
  "supplier": "AKS"
 },
 "112519": {
  "file": "112519.webp",
  "source": "https://aks.by/124215-146778-p?OFFER_ID=146793",
  "name": "Выдвижная корзина-карго 200 ICON крепл.боковое/левое, графит PRIME by AKS",
  "supplier": "AKS"
 },
 "112513": {
  "file": "112513.webp",
  "source": "https://aks.by/121529-145454-p?OFFER_ID=145484",
  "name": "Выдвижная корзина-карго 400 FOCUS, графит PRIME by AKS",
  "supplier": "AKS"
 },
 "112522": {
  "file": "112522.webp",
  "source": "https://aks.by/124226-146800-p?OFFER_ID=146808",
  "name": "Выдвижная корзина-карго 400 ICON, графит PRIME by AKS",
  "supplier": "AKS"
 },
 "72261": {
  "file": "72261.webp",
  "source": "https://aks.by/49693-90728-p?OFFER_ID=107793",
  "name": "Выдвижная корзина-карго 400 NORWIG крепл.нижнее, хром AKS",
  "supplier": "AKS"
 },
 "117352": {
  "file": "117352.webp",
  "source": "https://aks.by/124310-146843-p?OFFER_ID=146895",
  "name": "Система ящиков Slimbox Evolution L-500 H=199 с доводчиком ДСП16мм белый",
  "supplier": "AKS"
 },
 "12.0068": {
  "file": "12-0068.webp",
  "source": "https://wline.by/sistema_vydvizheniya_linebox_aq-218557-p/218591",
  "name": "Ящик высокий AQ LineBox NL=500 H=203 белый",
  "supplier": "Westline / AQ"
 },
 "15.0341": {
  "file": "15-0341.webp",
  "source": "https://wline.by/svetodiodnaya_lenta_gibkaya_aq-220923-p/220925",
  "name": "Лента светодиодная AQ LED-LINE 2835 120 LED/м 12V 7,5 W/м 4 мм IP65 нейтральный белый 5м",
  "supplier": "Westline / AQ"
 },
 "89609": {
  "file": "89609.webp",
  "source": "https://aks.by/79036-109715-p?OFFER_ID=118550",
  "name": "Профиль алюминиевый врезной LIRA-1707 с экраном, цвет черный, 2м, AKS",
  "supplier": "AKS"
 },
 "113285": {
  "file": "113285.webp",
  "source": "https://aks.by/111624-139110-p?OFFER_ID=145843",
  "name": "Выдвижная корзина-сушка 700 NORWIG, графит AKS",
  "supplier": "AKS"
 },
 "95551": {
  "file": "95551.webp",
  "source": "https://aks.by/94178-119740-p?OFFER_ID=126525",
  "name": "Выдвижная корзина-сушка 900 FLAT LINE нерж.сталь, хром AKS",
  "supplier": "AKS"
 },
 "38402": {"file":"38402.webp","source":"https://aksmebel.ru/product/sushka-dvukhurovnevaya-s-teleskopicheskim-krepleniem-11660-p/48320/","name":"Сушка AKS INOX 600","supplier":"AKS"},
 "113272": {
  "file": "113272.webp",
  "source": "https://aks.by/123553-146385-p?OFFER_ID=146389",
  "name": "Сушка для посуды 600 MOUNT, белый холодный AKS (без коробки)",
  "supplier": "AKS"
 }
});

const photo=(article,hint)=>{const p=PHOTOS[article];return p?{...p,article,src:'/account/planner/hardware-photos/'+p.file+'?v=20261026-supplier-photos',hint}:null;};

// The gold HELLY 150 donor has no supplier photo for its article. The card labels the pictured size.
export const fittingPhotoUrl=article=>'/account/planner/shelf-images/'+encodeURIComponent(article==='85881'?'112445':article)+'.webp?v=20261116-catalogue';
export function fittingImage(article,name){
 const image=document.createElement('img');
 image.alt=name;image.src=fittingPhotoUrl(article);image.decoding='async';
 return image;
}
export function jointPhotos(scheme){
 const strip=document.createElement('span');strip.className='fitting-photos';
 const parts=scheme==='cam_dowel'?[['cam','Эксцентрик'],['dowel','Шкант 8×35']]:
   scheme==='confirmat'?[['confirmat','Конфирмат 7×50']]:[['95388','Полкодержатель SEKURA 2 · арт. 95388']];
 for(const [article,name] of parts)strip.append(fittingImage(article,name));
 return strip;
}
const hinges={
 '112602':['112602','AKS PRIME · H2'],
 'ZM-HCKT90-3DBEO-S':['ZM-HCKT90-3DBEO-S','GTV HCKT · H0'],
 '70T950A.TLMB V50 NI':['70T950A.TLMB-V50-NI','Blum CLIP top · для алюминиевой рамки']
};
// AKS uses the same covered-hinge shot for both spring and springless variants.
const sharedHingePhotos={'112703':'112643','112708':'112644','112710':'112649','112712':'112650'};
export function hingePhotoCard(article){
 const hinge=Object.hasOwn(hingeCatalogue,article)?[article,hingeName(article)]:hinges[article];
 if(!hinge)return null;
 const figure=document.createElement('figure'),caption=document.createElement('figcaption');
 figure.className='fitting-card';caption.textContent=hinge[1]+' · арт. '+article;
 if(sharedHingePhotos[article]){
   const note=document.createElement('small');
   note.textContent='Общее фото AKS для '+article+' и '+sharedHingePhotos[article]+' · 45 мм, H0, никель';
   caption.append(document.createElement('br'),note);
 }
 figure.append(fittingImage(hinge[0],'Петля '+hinge[1]+' · '+article),caption);return figure;
}
export function productionHingeArticles(hw){
 const articles=[hw?.hinge_article,...(hw?.items||[]).map(item=>item.article)];
 return [...new Set(articles.filter(Boolean).map(value=>String(value).replace(/\s+/g,' ').trim()).filter(article=>Object.hasOwn(hinges,article)||Object.hasOwn(hingeCatalogue,article)))];
}
export function hardwareArtwork(it,family,key,value){
 if(family==='modern'&&(key==='dryer'||key==='filling'&&value==='dryer')){const v=globalThis.MF_MODERN_CABINETS.info(it);if(v&&v.dryer!=='none')return photo(v.dryer==='inox'?'38402':'113272',v.dryer.toUpperCase()+' · 600 мм · арт. '+(v.dryer==='inox'?'38402':'113272'));}
 if(family==='cargo'&&key==='brand'){
  const kit=globalThis.MF_CARGO.kit(it);if(!kit)return null;
  if(globalThis.MF_CARGO.info(it)?.waste)return {article:kit.article,src:fittingPhotoUrl(kit.article),hint:'Комплект '+it.width+' мм · арт. '+kit.article};
  return photo(kit.article,(value==='norwing'?'Хром':'Графит')+' · '+it.width+' мм · '+(kit.mounting==='side_left'?'крепление слева':'крепление снизу')+' · арт. '+kit.article);
 }
 if(family==='dryer'&&key==='dryer_brand'){
  const kit=globalThis.MF_PULLOUT_DRYERS.kit(it);if(!kit)return null;
  return photo(kit.article,(value==='norwing'?'Графит':'Хром')+' · '+it.width+' мм · арт. '+kit.article);
 }
 if(['drawer','dryer'].includes(family)&&key==='system'){
  const article={ball:'114797',aq:'12.0068',slimbox:'117352'}[value];
  return photo(article,value==='ball'?'Фото серии · направляющие с доводчиком':'Фото серии · белые металлические боковины');
 }
 if(family==='upper'&&key==='filling'&&value==='dryer')return photo('113272','Фото серии MOUNT · белый · с поддоном');
 if(['vitrine','open-tall'].includes(family)&&key==='light_system'){
  if(value==='aq-4x8')return photo('15.0341','Лента 4 мм · нейтральный свет · арт. 15.0341');
  if(value==='lira-17.5x6.5')return photo('89609','Профиль с экраном · паз 17,5 × 6,5 мм');
 }
 return null;
}
