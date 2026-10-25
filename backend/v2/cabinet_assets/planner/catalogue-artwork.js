(function(root){
 'use strict';
 // Lower cabinets use exact production geometry; other family posters are Tripo illustrations.
 const rows=[
  ['bazis.0ac4e1b6b2d3','cargo','Карго','Выдвижное хранение · FOCUS, NORWING, ICON','6 исполнений','Обычное / Gola'],
  ['bazis.300138dc82b5','dishwasher','Посудомойка','Фасад для встроенной посудомойки','450–600 мм','Обычное / Gola'],
  ['bazis.85c150c30ea5','pullout-dryer','Выдвижная сушка','NORWING и FLAT LINE · с нижним ящиком','12 исполнений','Обычное / Gola'],
  ['bazis.0211e4f77fc4','base-single','Нижний · 1 дверь','Полки или мойка · левое и правое открывание','Полки / мойка','Ручки / Gola'],
  ['bazis.3079d0656398','base-double','Нижний · 2 двери','Вместительное хранение или тумба под мойку','Полки / мойка','Ручки / Gola'],
  ['bazis.39f282e08f0c','base-drawers','Шкаф с ящиками','Шариковые, AQ LineBox или Slimbox','2 / 3 ящика','Обычное / Gola'],
  ['bazis.9e77f4333545','base-oven','НШД-600','Ниша 595 мм и небольшая нижняя шуфляда','Ширина 600 мм','На опорах'],
  ['bazis.a310afbf587f','base-corner','Угловой шкаф','Бленда под 90° · полка или мойка','1 / 2 двери','Левый / правый'],
  ['bazis.858266606bc5','wall-single','Верхний · 1 дверь','Полки или сушка · левое и правое открывание','Полки / сушка','3 вида открывания'],
  ['bazis.6c187245284a','wall-double','Верхний · 2 двери','Полки или сушка за двумя фасадами','Полки / сушка','3 вида открывания'],
  ['bazis.1d3c4c663a42','open-tall-none','Открытый пенал','Без подсветки, AQ или LIRA','7 исполнений','ЛДСП 18 мм'],
  ['bazis.1109a1bd41e0','tall-vitrine','Пенал-витрина','Стеклянные полки и чёрная рамка Z1','Стекло','AQ / LIRA'],
  ['bazis.107f19943761','tall-storage','Пенал с полками','Закрытое хранение на всю высоту','База 820 / 900','1 / 2 двери'],
  ['bazis.d9c0c30544f4','tall-appliance','Пенал под технику','Духовка или духовка + СВЧ','База 820 / 900','Дверь / ящик']
 ];
 const native=new Set(['cargo','dishwasher','pullout-dryer','base-single','base-double','base-drawers','base-oven','base-corner']);
 root.MF_CATALOGUE_ARTWORK=Object.freeze(Object.fromEntries(rows.map(([id,file,title,description,...badges])=>[id,Object.freeze({file,title,description,badges,source:native.has(file)?'native':'tripo'})])));
})(globalThis);
