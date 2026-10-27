import {PRODUCTION_MODELS,dimensionError,cornerVariant,tallVariant,doorVariant} from './furniture-core.mjs';

const labels={
 purpose:{shelf:['С полками','Открытый корпус · полки внутри'],sink:['Под мойку','Открытый корпус · без полки']},
 filling:{shelves:['Полки','Хранение внутри шкафа'],dryer:['Сушка MOUNT','Посуда и поддон · схема']},
 execution:{standard:['Накладные ручки','Ручка на фасаде'],gola:['Gola','Подхват за профиль · без подсветки'],handles:['Накладные ручки','Ручка снизу фасада'],handleless:['Без ручек','Подхват снизу'],push:['Нажатие','Tip-on · нажать на фасад']},
 side:{left:['Петли слева','Дверь открывается влево'],right:['Петли справа','Дверь открывается вправо']},
 opening:{left:['Петли слева','Дверь открывается влево'],right:['Петли справа','Дверь открывается вправо'],double:['Две створки','По две двери в каждой секции'],soft:['С доводчиком','Потянуть · плавное закрывание'],push:['Нажатие','Push to open · без ручки']},
 door_count:{1:['Одна дверь','Один открывающийся фасад'],2:['Две двери','Два открывающихся фасада']},
 layout:{two:['2 ящика','Два наружных фасада'],three:['3 ящика','Два малых и один большой'],inner:['2 + внутренний','Дополнительный ящик за фасадом'],door_oven:['Дверь + духовка','Нижняя секция с дверью'],door_oven_micro:['Духовка + СВЧ','Нижняя секция с дверью'],drawer_oven:['Ящик + духовка','Выдвижная нижняя секция'],drawer_oven_micro:['Ящик + духовка + СВЧ','Два прибора и нижний ящик']},
 system:{ball:['Шариковые','Ящик ЛДСП · схема направляющих'],aq:['AQ LineBox','Металлические боковины · схема'],slimbox:['Slimbox Evolution','Тонкие боковины · схема']},
 brand:{geo:['GEO X','Два контейнера для сортировки'],focus:['FOCUS','Графит · схема корзин'],norwing:['NORWING','Хром · схема корзин'],icon:['ICON','Графит · схема корзин']},
 dryer_brand:{norwing:['NORWING','Графит · 600 / 700 / 800 мм'],flat_line:['FLAT LINE','Хром · 600 / 700 / 800 / 900 мм']},
 light_system:{none:['Без подсветки','Открытые полки'], 'aq-4x8':['AQ LED-LINE','Лента в пазу 4 × 8 мм'],'lira-17.5x6.5':['LIRA-1707','Профиль с экраном · 17,5 × 6,5 мм']},
 lighting:{left:['Слева','Свет на левой стойке'],right:['Справа','Свет на правой стойке'],both:['С двух сторон','Свет на обеих стойках']},
 row_height:{820:['820 мм','Корпус 720 + цоколь 100'],900:['900 мм','Корпус 800 + цоколь 100']},
 handles:{handles:['С ручками','Накладная ручка на фасаде'],handleless:['Без ручек','Фасад без накладной ручки']}
};
export const buttonFamilies=['base','upper','drawer','corner','tall','vitrine','open-tall'];
export function optionDescriptor(family,key,value){
 let [title,hint]=labels[key]?.[value]||[String(value),''];
 if(family==='corner'&&key==='side')[title,hint]=value==='left'?['Левый угол','Бленда слева']:['Правый угол','Бленда справа'];
 if(family==='corner'&&key==='purpose'&&value==='sink')hint='Без полки · царги видны';
 if(family==='base'&&key==='purpose'&&value==='sink')hint='Без полки и задней стенки';
 if(key==='execution'&&value==='gola')title=['drawer','dryer'].includes(family)?'Gola II':'Gola L';
 const open=key==='purpose'||key==='filling'||['brand','dryer_brand','system'].includes(key)||(key==='layout'&&value==='inner');
 const hinge=(key==='side'&&family!=='corner')||(key==='opening'&&['left','right','double'].includes(value));
 const view=open?'inside':hinge?'hinge':'closed';
 const focus=['execution','handles'].includes(key)?'grip':key==='system'?'drawer':key==='brand'?'basket':key==='dryer_brand'?'dryer':null;
 const photo=key==='light_system'&&value!=='none'?({'aq-4x8':'aq-profile','lira-17.5x6.5':'lira-profile'}[value]):null;
 const action=(key==='opening'&&value==='push')||(key==='execution'&&value==='push')?'Нажать':key==='opening'&&value==='soft'?'Потянуть':key==='execution'&&value==='handleless'?'Подхват снизу':'';
 return {title,hint,view,focus,photo,action,highlight:family==='corner'&&key==='side'?'filler':null,front:key==='door_count'||key==='layout'||key==='lighting',tall:['tall','vitrine','open-tall'].includes(family)};
}
export function previewVariant(it,family,key,value,catalogue){
 const copy=structuredClone(it),patch={[key]:['row_height','door_count','width'].includes(key)?Number(value):value};
 let next;
 switch(family){
  case 'base':next=globalThis.MF_GOLA.select(copy,patch,catalogue);break;
  case 'upper':next=globalThis.MF_UPPERS.select(copy,patch,catalogue);break;
  case 'drawer':next=globalThis.MF_DRAWERS.select(copy,patch,catalogue);break;
  case 'cargo':next=globalThis.MF_CARGO.select(copy,patch,catalogue);break;
  case 'dryer':next=globalThis.MF_PULLOUT_DRYERS.select(copy,patch,catalogue);break;
  case 'vitrine':next=globalThis.MF_VITRINE.select(copy,patch,catalogue);break;
  case 'open-tall':next=globalThis.MF_OPEN_TALL.select(copy,patch,catalogue);break;
  case 'corner':next=cornerVariant(copy,patch,catalogue);break;
  case 'tall':next=tallVariant(copy,patch,catalogue);break;
  case 'door':next=doorVariant(copy,value,catalogue);break;
  case 'dishwasher':next=globalThis.MF_ACCESSORIES.select(copy,value);break;
  case 'generic':next={...copy,...patch};break;
  default:throw new Error('Исполнение не найдено');
 }
 const error=dimensionError(next,{production:PRODUCTION_MODELS[next.bazis_id]});if(error)throw new Error(error);
 return next;
}
