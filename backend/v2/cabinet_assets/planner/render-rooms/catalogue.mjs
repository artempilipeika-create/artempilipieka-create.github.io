// IDs are stored in project display settings. All dimensions and openings belong to the project.
export const roomCategories = ['Светлые интерьеры', 'Тёплые интерьеры', 'Контрастные интерьеры'];

export const wallCoatings = {
  porcelain: {name:'Фарфор', color:'#e5e3dc', surface:'paint'},
  chalk: {name:'Мел', color:'#d8d9d2', surface:'paint'},
  pearl: {name:'Серый жемчуг', color:'#c3c8c6', surface:'paint'},
  linen: {name:'Лён', color:'#d6c8b6', surface:'plaster'},
  limestone: {name:'Известняк', color:'#cbc7b9', surface:'plaster'},
  sand: {name:'Песок', color:'#c6ad90', surface:'plaster'},
  mushroom: {name:'Серо-бежевый', color:'#a99a88', surface:'paint'},
  sage: {name:'Шалфей', color:'#a8b09e', surface:'paint'},
  clay: {name:'Глина', color:'#b28e79', surface:'plaster'},
  sageDark: {name:'Олива', color:'#727c64', surface:'plaster'},
  slate: {name:'Сланец', color:'#67737b', surface:'plaster'},
  graphite: {name:'Графит', color:'#535a5d', surface:'paint'},
  basalt: {name:'Базальт', color:'#545658', surface:'plaster'}
};

function finish(n,name,back,sides,floor,lighting,side) {
  const note = [wallCoatings[back].name,wallCoatings[sides].name,
    floor === 'oak' ? 'дубовая доска' : 'плитка под мрамор'].join(' · ');
  return {n,name,back,sides,floor,lighting,side,note};
}

export const rooms = [
  finish(1,'Молочный и дуб','porcelain','chalk','oak','neutral','L'),
  finish(2,'Жемчуг и мрамор','pearl','porcelain','marble','daylight','R'),
  finish(3,'Светлый известняк','limestone','porcelain','oak','daylight','L'),
  finish(4,'Льняная штукатурка','linen','chalk','marble','neutral','L'),
  finish(5,'Светлый шалфей','sage','chalk','oak','neutral','R'),
  finish(6,'Песок и дуб','sand','linen','oak','warm','L'),
  finish(7,'Тёплый камень','mushroom','limestone','marble','neutral','R'),
  finish(8,'Глина и лён','clay','linen','oak','neutral','L'),
  finish(9,'Песочный мрамор','sand','porcelain','marble','warm','R'),
  finish(10,'Олива и дуб','sageDark','limestone','oak','warm','L'),
  finish(11,'Графит и дуб','graphite','pearl','oak','neutral','L'),
  finish(12,'Сланец и мрамор','slate','chalk','marble','daylight','R'),
  finish(13,'Тёмный базальт','basalt','graphite','oak','neutral','R'),
  finish(14,'Олива и камень','sageDark','pearl','marble','daylight','L'),
  finish(15,'Графит и песок','graphite','sand','marble','warm','L')
];

export const roomById = id => rooms.find(room => room.n === id);

export function wallCoating(settings,wall) {
  const scheme=roomById(settings.renderRoomId);
  const value=wallCoatings[settings.wallFinishes?.[wall]];
  return value || (scheme && wallCoatings[wall==='a' ? scheme.back : scheme.sides]);
}
