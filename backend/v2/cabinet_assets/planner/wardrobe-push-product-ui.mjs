import {pushDefault,pushProducts} from './wardrobe-push-layout.mjs';

const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
export const pushMountNames={auto:'Авто · сначала врезной',bored:'Врезной',surface:'Накладной'};
const tips={magnet:'Магнитный',rubber:'Резиновый'};
const series={standard:'Стандартный',reinforced:'Усиленный',metal:'Металлический корпус'};
const colors={'белый':'Белый','серый':'Серый','черный':'Чёрный'};
const stock=Object.entries(pushProducts);

export function aksPushProductControls(ui,section,setting,update){
 const cfg={...pushDefault,...setting},product=pushProducts[cfg.article];
 function select(title,choices,value,action){ui.select(section,title,Object.entries(choices),value,action);}
 function closest(filters,mount=cfg.mount){
  const matches=stock.filter(([,p])=>(mount!=='bored'||p.mounts.bored)&&Object.entries(filters).every(([k,v])=>p[k]===v));
  const score=p=>4*Number(p.tip!==product.tip)+2*Number(p.series!==product.series)+Number(p.color!==product.color);
  return matches.sort((a,b)=>score(a[1])-score(b[1]))[0];
 }
 function choose(filters,changes={}){
  const match=closest(filters,changes.mount);
  if(match)update({...cfg,...changes,article:match[0]});
 }
 select('Монтаж типона',pushMountNames,cfg.mount,mount=>choose({},{mount}));
 select('Наконечник',tips,product.tip,tip=>choose({tip}));
 const cards=node('div');cards.className='wardrobe-prime-cards';cards.setAttribute('role','group');cards.setAttribute('aria-label','Исполнение типона');
 for(const [family,title] of Object.entries(series)){
  const variant=closest({tip:product.tip,series:family});if(!variant)continue;
  const [article,p]=variant,card=node('button'),figure=node('figure'),img=node('img');
  card.type='button';card.dataset.pushArticle=article;card.setAttribute('aria-pressed',String(cfg.article===article));
  card.onclick=()=>update({...cfg,article});
  img.src='/account/planner/shelf-images/'+article+'.webp';img.alt=p.name+' · '+article;
  img.width=140;img.height=85;img.dataset.source=p.photoSource;
  figure.append(img,node('figcaption',title+' · '+p.color+' · AKS '+article));card.append(figure);cards.append(card);
 }
 section.append(cards);
 const availableColors=Object.fromEntries(Object.entries(colors).filter(([color])=>closest({tip:product.tip,series:product.series,color})));
 select('Цвет типона',availableColors,product.color,color=>choose({tip:product.tip,series:product.series,color}));
}
