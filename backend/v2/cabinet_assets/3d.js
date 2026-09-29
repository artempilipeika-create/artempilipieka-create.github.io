'use strict';
const plannerRequested=document.body.dataset.plannerRequested==='webgl';

const $=id=>document.getElementById(id);
const FACADE_GAP_MM=1.5;

const moduleDefs={
  chest:{name:'Комод',w:1000,h:850,d:450,layout:'combo',drawers:3,base:'plinth'},
  base_cabinet:{name:'Кухня · нижний',w:600,h:820,d:560,layout:'doors',drawers:0,base:'plinth'},
  wall_cabinet:{name:'Кухня · верхний',w:600,h:720,d:320,layout:'doors',drawers:0,base:'wall'},
  tall_cabinet:{name:'Пенал',w:600,h:2200,d:560,layout:'doors',drawers:0,base:'plinth'},
  wardrobe:{name:'Шкаф',w:1200,h:2400,d:600,layout:'doors',drawers:0,base:'plinth'},
  vanity:{name:'Тумба',w:800,h:600,d:500,layout:'drawers',drawers:2,base:'wall'}
};

const kitchenTemplates={
  'base.one_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 1 дверь',itemName:'Кухня · нижний',
    description:'Один накладной фасад',defaults:{w:400,h:820,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[250,650],h:[600,1000],d:[450,700]},front:{kind:'doors',count:1}
  },
  'base.two_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 2 двери',itemName:'Кухня · нижний · 2 двери',
    description:'Два равных накладных фасада',defaults:{w:800,h:820,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[600,1200],h:[600,1000],d:[450,700]},front:{kind:'doors',count:2}
  },
  'base.drawers_2':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 2 ящика',itemName:'Кухня · нижний · 2 ящика',
    description:'Два равных фасада ящиков',defaults:{w:600,h:820,d:560,layout:'drawers',drawers:2,base:'plinth'},
    limits:{w:[300,1200],h:[600,1000],d:[450,700]},front:{kind:'drawers',count:2}
  },
  'base.drawers_3':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 3 ящика',itemName:'Кухня · нижний · 3 ящика',
    description:'Три равных фасада ящиков',defaults:{w:600,h:820,d:560,layout:'drawers',drawers:3,base:'plinth'},
    limits:{w:[300,1200],h:[600,1000],d:[450,700]},front:{kind:'drawers',count:3}
  },
  'base.drawers_4':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 4 ящика',itemName:'Кухня · нижний · 4 ящика',
    description:'Четыре равных фасада ящиков',defaults:{w:600,h:820,d:560,layout:'drawers',drawers:4,base:'plinth'},
    limits:{w:[300,1200],h:[600,1000],d:[450,700]},front:{kind:'drawers',count:4}
  },
  'base.drawer_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · ящик + дверь',itemName:'Кухня · нижний · ящик + дверь',
    description:'Верхний ящик и нижний дверной фасад',defaults:{w:600,h:820,d:560,layout:'combo',drawers:1,base:'plinth'},
    limits:{w:[300,900],h:[600,1000],d:[450,700]},front:{kind:'combo',drawerRows:1,drawerRatio:.25,doors:1}
  },
  'base.drawers2_door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Нижний · 2 ящика + дверь',itemName:'Кухня · нижний · 2 ящика + дверь',
    description:'Два верхних ящика и нижняя дверь',defaults:{w:600,h:820,d:560,layout:'combo',drawers:2,base:'plinth'},
    limits:{w:[350,1000],h:[600,1000],d:[450,700]},front:{kind:'combo',drawerRows:2,drawerRatio:.36,doors:1}
  },
  'base.sink_2door':{
    category:'Нижние модули',module_type:'base_cabinet',label:'Мойка · 2 двери',itemName:'Кухня · мойка · 2 двери',
    description:'Модуль под мойку, два фасада',defaults:{w:800,h:820,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[600,1200],h:[600,1000],d:[450,700]},front:{kind:'doors',count:2}
  },
  'wall.one_door':{
    category:'Верхние модули',module_type:'wall_cabinet',label:'Верхний · 1 дверь',itemName:'Кухня · верхний',
    description:'Один накладной фасад',defaults:{w:400,h:720,d:320,layout:'doors',drawers:0,base:'wall'},
    limits:{w:[250,650],h:[300,1400],d:[250,500]},front:{kind:'doors',count:1}
  },
  'wall.two_door':{
    category:'Верхние модули',module_type:'wall_cabinet',label:'Верхний · 2 двери',itemName:'Кухня · верхний · 2 двери',
    description:'Два равных накладных фасада',defaults:{w:800,h:720,d:320,layout:'doors',drawers:0,base:'wall'},
    limits:{w:[600,1200],h:[300,1400],d:[250,500]},front:{kind:'doors',count:2}
  },
  'wall.horizontal':{
    category:'Верхние модули',module_type:'wall_cabinet',label:'Верхний · горизонтальный',itemName:'Кухня · верхний · горизонтальный',
    description:'Один горизонтальный фасад',defaults:{w:800,h:360,d:320,layout:'doors',drawers:0,base:'wall'},
    limits:{w:[450,1400],h:[250,700],d:[250,500]},front:{kind:'doors',count:1}
  },
  'tall.one_door':{
    category:'Пеналы',module_type:'tall_cabinet',label:'Пенал · 1 дверь',itemName:'Пенал',
    description:'Высокий модуль с одним фасадом',defaults:{w:600,h:2200,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[300,700],h:[1600,2800],d:[450,700]},front:{kind:'doors',count:1}
  },
  'tall.two_door':{
    category:'Пеналы',module_type:'tall_cabinet',label:'Пенал · 2 двери',itemName:'Пенал · 2 двери',
    description:'Высокий модуль с двумя фасадами',defaults:{w:900,h:2200,d:560,layout:'doors',drawers:0,base:'plinth'},
    limits:{w:[700,1400],h:[1600,2800],d:[450,700]},front:{kind:'doors',count:2}
  }
};

const defaultTemplateByModule={
  base_cabinet:'base.one_door',
  wall_cabinet:'wall.one_door',
  tall_cabinet:'tall.one_door'
};

const bazisModules=[{"id":"bazis.460987c9a8e8","source_file":"НМД1-200. Карго.fr3d","source_sha256":"a2a0c04ed70c493824d145c040f285b7c84deda6a0995b2cabea69c7b3bdfbf4","label":"Карго 200","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":200,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[150,400],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.0211e4f77fc4","source_file":"НМД1-600. отк L.fr3d","source_sha256":"cd5f119cec7467047cdac6ea1bc4aaafa95c4fa092cc92a101509003dbbd16b5","label":"Нижний 1 дверь L","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[300,900],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.facfa0cd038b","source_file":"НМД1-600. отк L.Мойка.fr3d","source_sha256":"cbc8eda7e1437b09e8043e147663ecfa63848bc942ef319456dae8ec6f8e9131","label":"Нижний 1 дверь L · мойка","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[300,900],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.784bf9af84f8","source_file":"НМД1-600. отк P.fr3d","source_sha256":"1ac5f7edba13c42c67007525a3b66738eb7937b4c6a35fb901d50144ad696df1","label":"Нижний 1 дверь P","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[300,900],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.b226370aab54","source_file":"НМД1-600. отк P.Мойка.fr3d","source_sha256":"bf92ea3711072d167897fc63d9c7fcf50319ffcda370e4e95e6921f71298b9ab","label":"Нижний 1 дверь P · мойка","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[300,900],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.3079d0656398","source_file":"НМД2-600..fr3d","source_sha256":"d79434c8d5e93744fcb37461491c9ec7560c1c78ad16d99a76ce7433fb9dfc80","label":"Нижний 2 двери","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[500,1200],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":2},"resize":true},{"id":"bazis.5731630ddd87","source_file":"НМД2-600.Мойка.fr3d","source_sha256":"29f75ec2208db5f29d0fdc3a01718419a73635b0ae64d84424460229895704f6","label":"Нижний 2 двери · мойка","group":"Нижние БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[500,1200],"h":[600,1000],"d":[450,700]},"front":{"kind":"doors","count":2},"resize":true},{"id":"bazis.39f282e08f0c","source_file":"НМРШ2-600.З.С 3ММ Гвозди  Шариковые напр без довод .fr3d","source_sha256":"7b141b668de043829e27e2bb48c9199517a354897c93ba55f4bfd1b9ff27dcbc","label":"Нижний 2 ящика","group":"Ящики БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"drawers","drawers":2,"base":"plinth"},"limits":{"w":[300,1200],"h":[600,1000],"d":[450,700]},"front":{"kind":"drawers","count":2},"resize":true},{"id":"bazis.5f5697e39e27","source_file":"НМРШ3-600.З.С 3ММ Гвозди  Шариковые напр без довод .fr3d","source_sha256":"c9ae8a439ccd0c158b70e6cd9b0dcabe175adda43e59a2d8c8e09e7cd65e979d","label":"Нижний 3 ящика","group":"Ящики БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"drawers","drawers":3,"base":"plinth"},"limits":{"w":[300,1200],"h":[600,1000],"d":[450,700]},"front":{"kind":"drawers","count":3},"resize":true},{"id":"bazis.858266606bc5","source_file":"ВМД1-600. отк L.fr3d","source_sha256":"858266606bc5e6f36a96635c155beb8f86161ce869956a8f961f27406db7ebc2","label":"ВМД1 L","group":"Верхние БАЗИС","module_type":"wall_cabinet","defaults":{"w":600,"h":720,"d":317,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[300,900],"h":[300,1400],"d":[250,500]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.2175c60e84a6","source_file":"ВМД1-600. отк P.fr3d","source_sha256":"2175c60e84a6eb6eeefa62eaddc611f2180b6a3060a0ea3aa1b5305ffbcc6ed5","label":"ВМД1 P","group":"Верхние БАЗИС","module_type":"wall_cabinet","defaults":{"w":600,"h":720,"d":317,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[300,900],"h":[300,1400],"d":[250,500]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.877ba2f68d92","source_file":"ВМД2-600..fr3d","source_sha256":"877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3","label":"ВМД2","group":"Верхние БАЗИС","module_type":"wall_cabinet","defaults":{"w":600,"h":720,"d":317,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[500,1200],"h":[300,1400],"d":[250,500]},"front":{"kind":"doors","count":2},"resize":true},{"id":"bazis.b89bf9852860","source_file":"ВМД1-600. отк L. (Сушка).fr3d","source_sha256":"b89bf98528601e2bc74e52bc19cc6904a20ff90ed6f0785c1d599c7aac4250fd","label":"ВМД1 L · Сушка","group":"Верхние БАЗИС","module_type":"wall_cabinet","defaults":{"w":600,"h":720,"d":317,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[300,900],"h":[300,1400],"d":[250,500]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.60f79b573cd1","source_file":"ВМД1-600. отк P. (Сушка).fr3d","source_sha256":"60f79b573cd1ae910e0f5ec2796798e4250e3c2e0a2df0f52372d528dace9005","label":"ВМД1 P · Сушка","group":"Верхние БАЗИС","module_type":"wall_cabinet","defaults":{"w":600,"h":720,"d":317,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[300,900],"h":[300,1400],"d":[250,500]},"front":{"kind":"doors","count":1},"resize":true},{"id":"bazis.1ac4fadd97b7","source_file":"ВМД2-600.(Сушка).fr3d","source_sha256":"1ac4fadd97b74ebaf1d52e9d37c5d3e8652857c9422032e64dd3d0671911a63b","label":"ВМД2 · Сушка","group":"Верхние БАЗИС","module_type":"wall_cabinet","defaults":{"w":600,"h":720,"d":317,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[500,1200],"h":[300,1400],"d":[250,500]},"front":{"kind":"doors","count":2},"resize":true},{"id":"bazis.b4420a0b4bbc","source_file":"НМУ-1000. Д1 (Мойка) L.fr3d","source_sha256":"5bc821b8f246c9e93a777dab38a032d900731b92b14be0839b9c5a5116117764","label":"Угловой Д1 L · мойка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":1},"resize":false},{"id":"bazis.694511d86dab","source_file":"НМУ-1000. Д1 (Мойка) P.fr3d","source_sha256":"3a1f04600696fa767cb1de53ac3bab6994a687b0c7fa98ce7172acd6e988e04e","label":"Угловой Д1 P · мойка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":1},"resize":false},{"id":"bazis.2ae4fb340b9e","source_file":"НМУ-1000. Д1 (Полка) L.fr3d","source_sha256":"f12f03b2e78a50e605ca21bf4c84a7e134bd8cf3efb8def19dcad220c86ce50a","label":"Угловой Д1 L · полка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":1},"resize":false},{"id":"bazis.e182ac006a55","source_file":"НМУ-1000. Д1 (Полка) P.fr3d","source_sha256":"210766c11c885da75f21a6647ea6c7731d14ab22c84a0c9e9f3264c211020312","label":"Угловой Д1 P · полка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":1},"resize":false},{"id":"bazis.a3270de534ee","source_file":"НМУ-1000. Д2 (Мойка) L.fr3d","source_sha256":"dcc4cc52e3ae24ab001dd8c1f7c33756744bca923ef24900556521736a01a474","label":"Угловой Д2 L · мойка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":2},"resize":false},{"id":"bazis.3858e6709c36","source_file":"НМУ-1000. Д2 (Мойка) P.fr3d","source_sha256":"d845c9cadd5f6bbf027e5bcbbe5da430e04cb15368ececd2a0b9bc18faf1ab9d","label":"Угловой Д2 P · мойка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":2},"resize":false},{"id":"bazis.2cc272f6bcdc","source_file":"НМУ-1000. Д2 (Полка) L.fr3d","source_sha256":"5c6732152cb42d99cdacae21a8ad7105126c50fca68ebcbc64e1ed0b6edcfff5","label":"Угловой Д2 L · полка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":2},"resize":false},{"id":"bazis.b738c256b0c1","source_file":"НМУ-1000. Д2 (Полка) P.fr3d","source_sha256":"8a0e6489def9e870f9592bcfd2d2316319584df6b645c800bb732cd8e56ecf02","label":"Угловой Д2 P · полка","group":"Угловые БАЗИС","module_type":"base_cabinet","defaults":{"w":1000,"h":720,"d":1000,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[800,1200],"h":[600,1000],"d":[800,1200]},"front":{"kind":"doors","count":2},"resize":false},{"id":"bazis.9e77f4333545","source_file":"НШД-600. 595мм .fr3d","source_sha256":"b1d83b58fc32f95f5a1924bad1c60f50267f38f13de122db4def7f0610d1df65","label":"Модуль 600 · ниша 595","group":"Техника БАЗИС","module_type":"base_cabinet","defaults":{"w":600,"h":720,"d":560,"layout":"doors","drawers":0,"base":"plinth"},"limits":{"w":[550,650],"h":[600,1000],"d":[450,700]},"front":{"kind":"none"},"resize":true},{"id":"bazis.a95a0f22b385","source_file":"Фасад.Обычный ПМ.fr3d","source_sha256":"edddcff08dfff9af3b77dfe8f14897cfb66fa2b946c709bb16ef01a0a3ec22ef","label":"Фасад · обычный ПМ","group":"Компоненты БАЗИС","module_type":"component","defaults":{"w":600,"h":720,"d":18,"layout":"doors","drawers":0,"base":"wall"},"limits":{"w":[100,3000],"h":[100,3000],"d":[16,30]},"front":{"kind":"none"},"resize":false,"component":true}];
const pilotProductionById=globalThis.MF_FURNITURE_CORE.PRODUCTION_MODELS;
// Existing saved projects still refer to the earlier donor bytes and dimensions.
const legacyBazisById=new Map(bazisModules.map(m=>[m.id,structuredClone(m)]));
for(const m of bazisModules){
  const p=pilotProductionById[m.id];if(!p)continue;
  m.source_sha256=p.source_sha256;m.source_file=p.source_file||m.source_file;m.production=p;m.label=p.label;
  m.defaults={...m.defaults,w:600,h:p.body_height+p.base_height,d:p.scene_depth};
  m.limits=p.tier==='wall'
    ?{...m.limits,w:m.limits?.w||[300,1200],h:[300,1400],d:[250,500]}
    :{...m.limits,h:[p.base_height+600,p.base_height+1000],d:p.front_layout?.kind==='drawer'?[250,1000]:[450,700]};
}
const bazisById=new Map(bazisModules.map(x=>[x.id,x]));

let user=null,projects=[],project=null,state=null,selectedId=null,viewMode='3d';
let rotY=-.55,rotX=.2,zoom=1,drag=false,px=0,py=0,boxes=[],materials=new Map();

async function api(path,method='GET',body,headers={}){
  const r=await fetch('/api/v2'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!r.ok){
    const d=await r.json().catch(()=>({}));
    throw new Error(d.detail?.code||'Действие недоступно');
  }
  return r.status===204?null:r.json();
}
function status(t){$('status').textContent=t||''}
function uid(){return crypto.randomUUID()}
function mmNumber(v){return Math.round(Number(v)*10)/10}
function mmText(v){return String(mmNumber(v)).replace('.',',')}
function label(m){return m?[m.manufacturer,m.article,m.name,m.thickness?m.thickness+' мм':'',m.length&&m.width?m.length+'×'+m.width:''].filter(Boolean).join(' · '):'Материал не выбран'}
async function material(id){
  if(!id)return null;
  if(materials.has(String(id)))return materials.get(String(id));
  try{
    const m=await api('/catalogue/materials/'+id);
    materials.set(String(id),m);
    return m;
  }catch{return null}
}
function selected(){return state?.items.find(x=>x.item_id===selectedId)||null}
function templateFor(it){
  if(it?.bazis_id){
    const source=bazisById.get(it.bazis_id);
    if(source?.production&&it.bazis_sha256!==source.source_sha256)return legacyBazisById.get(it.bazis_id)||null;
    return source||null;
  }
  return it?.template_id?kitchenTemplates[it.template_id]||null:null;
}
function inferTemplate(it={}){
  if(it.module_type==='base_cabinet'){
    if(it.layout==='drawers')return Number(it.drawers)>=3?'base.drawers_3':'base.drawers_2';
    if(it.layout==='doors')return Number(it.width)>=700?'base.two_door':'base.one_door';
  }
  if(it.module_type==='wall_cabinet'&&it.layout==='doors')return Number(it.width)>=700?'wall.two_door':'wall.one_door';
  if(it.module_type==='tall_cabinet'&&it.layout==='doors')return Number(it.width)>=700?'tall.two_door':'tall.one_door';
  return null;
}
function legacyItem(s){
  const type=s.module_type||'chest',d=moduleDefs[type]||moduleDefs.chest;
  const it={
    item_id:uid(),module_type:type,template_id:s.template_id||null,name:d.name,x:0,z:0,rotation:0,
    width:s.width||d.w,height:s.height||d.h,depth:s.depth||d.d,layout:s.layout||d.layout,
    drawers:s.drawers??d.drawers,base:s.base||d.base,handles:s.handles||'handles',
    body_variant_id:s.body_variant_id||null,front_variant_id:s.front_variant_id||null
  };
  it.template_id=it.template_id||inferTemplate(it);
  return it;
}
function normalizeItem(x,room){
  const it={...x};
  if(!it.template_id)it.template_id=inferTemplate(it);
  return globalThis.MF_FURNITURE_CORE.normalizeKitchen(it,room);
}
function normalizeScene(s={}){
  const room=s.room||{width:4200,depth:3200,height:2700};
  const items=Array.isArray(s.items)?s.items.map(x=>normalizeItem(x,room)):[legacyItem(s)];
  return{
    schema_version:2,
    room:{width:+room.width||4200,depth:+room.depth||3200,height:+room.height||2700},
    displaySettings:s.displaySettings||{},
    materialIdentities:s.materialIdentities||{},
    items,
    selected_item_id:(s.selected_item_id&&items.some(x=>x.item_id===s.selected_item_id))
      ?s.selected_item_id:(items[0]?.item_id||null),
    view_mode:s.view_mode||'3d'
  };
}
function scenePayload(){
  const first=state.items[0]||legacyItem({});
  const materialIdentities={};
  for(const it of state.items)for(const id of [it.body_variant_id,it.front_variant_id,it.back_variant_id,it.plinthMaterialId,it.countertopMaterialId,...Object.values(it.part_materials||{}),...(it.shelves||[]).map(s=>s.material_variant_id)])if(id){
    const m=materials.get(String(id));
    if(m)materialIdentities[id]={materialId:m.material_id||null,article:m.article||null,manufacturer:m.manufacturer||m.visual_identity?.manufacturer||null};
    else if(state.materialIdentities?.[id])materialIdentities[id]=state.materialIdentities[id];
  }
  return{
    module_type:first.module_type,width:first.width,height:first.height,depth:first.depth,layout:first.layout,
    drawers:first.drawers,base:first.base,handles:first.handles,body_variant_id:first.body_variant_id,
    front_variant_id:first.front_variant_id,view_mode:viewMode,schema_version:2,room:{...state.room},
    displaySettings:state.displaySettings||{},
    materialIdentities,
    items:state.items.map(x=>({...x})),selected_item_id:selectedId
  };
}

function modulePreviewCanvas(opt){
  const c=document.createElement('canvas');
  c.width=180;c.height=140;
  const x=c.getContext('2d');
  x.fillStyle='#f5f7f3';x.fillRect(0,0,c.width,c.height);
  x.strokeStyle='#4e6b58';x.fillStyle='#dfe8df';x.lineWidth=3;
  const isTall=opt.category==='tall',isWall=opt.category==='wall';
  const bx=isTall?55:42,by=isTall?15:(isWall?29:33),bw=isTall?70:96,bh=isTall?112:(isWall?72:88);
  x.fillRect(bx,by,bw,bh);x.strokeRect(bx,by,bw,bh);
  x.fillStyle='#cbd8cb';
  x.beginPath();x.moveTo(bx+bw,by);x.lineTo(bx+bw+16,by+8);x.lineTo(bx+bw+16,by+bh-4);x.lineTo(bx+bw,by+bh);x.closePath();x.fill();x.stroke();
  const t=opt.template?kitchenTemplates[opt.template]:null,spec=t?.front||null;
  x.strokeStyle='#6f8674';x.lineWidth=2;
  if(spec?.kind==='drawers'){
    const n=Math.max(1,spec.count||2);
    for(let i=1;i<n;i++){const yy=by+bh*i/n;x.beginPath();x.moveTo(bx,yy);x.lineTo(bx+bw,yy);x.stroke();}
  }else if(spec?.kind==='doors'){
    const n=Math.max(1,spec.count||1);
    for(let i=1;i<n;i++){const xx=bx+bw*i/n;x.beginPath();x.moveTo(xx,by);x.lineTo(xx,by+bh);x.stroke();}
  }else if(spec?.kind==='combo'){
    const top=Math.max(.18,Math.min(.55,spec.drawerRatio||.3)),split=by+bh*(1-top);
    x.beginPath();x.moveTo(bx,split);x.lineTo(bx+bw,split);x.stroke();
    const rows=Math.max(1,spec.drawerRows||1);
    for(let i=1;i<rows;i++){const yy=split+(by+bh-split)*i/rows;x.beginPath();x.moveTo(bx,yy);x.lineTo(bx+bw,yy);x.stroke();}
    const doors=Math.max(1,spec.doors||1);
    for(let i=1;i<doors;i++){const xx=bx+bw*i/doors;x.beginPath();x.moveTo(xx,by);x.lineTo(xx,split);x.stroke();}
  }else{
    x.beginPath();x.moveTo(bx+bw/2,by);x.lineTo(bx+bw/2,by+bh);x.stroke();
    x.beginPath();x.moveTo(bx,by+bh*.55);x.lineTo(bx+bw,by+bh*.55);x.stroke();
  }
  if(!isWall){
    x.strokeStyle='#7c887f';x.lineWidth=2;
    x.beginPath();x.moveTo(bx+7,by+bh+7);x.lineTo(bx+bw-7,by+bh+7);x.stroke();
  }
  return c;
}
function addCatalogueButton(root,opt){
  const b=document.createElement('button');
  b.className='mf3d-module';
  b.type='button';
  b.dataset.category=opt.category||'other';
  b.dataset.search=(opt.label+' '+opt.description).toLowerCase();
  if(opt.module)b.dataset.module=opt.module;
  if(opt.template)b.dataset.template=opt.template;
  if(opt.bazis)b.dataset.bazis=opt.bazis;
  // Keep the initial preview on its canvas. A data: image is rejected by
  // img-src 'self' before the WebGL catalogue replaces these bootstrap cards.
  const icon=modulePreviewCanvas(opt);
  icon.className='mf3d-module-thumb';
  icon.setAttribute('aria-hidden','true');
  const copy=document.createElement('span');
  copy.className='mf3d-module-copy';
  const strong=document.createElement('strong'),span=document.createElement('span');
  strong.textContent=opt.label;
  span.textContent=opt.description;
  copy.append(strong,span);
  b.append(icon,copy);
  b.onclick=()=>opt.bazis?addBazisModule(opt.bazis):(opt.template?addTemplate(opt.template):addModule(opt.module));
  root.append(b);
}
let activeModuleFilter='all';
function categoryKey(t){
  if(t.module_type==='base_cabinet')return'base';
  if(t.module_type==='wall_cabinet')return'wall';
  if(t.module_type==='tall_cabinet')return'tall';
  return'other';
}
function applyCatalogueFilter(){
  const q=($('module-search')?.value||'').trim().toLowerCase();
  for(const b of document.querySelectorAll('#module-catalogue .mf3d-module')){
    const cat=b.dataset.category||'other';
    const inTab=activeModuleFilter==='all'?true:(activeModuleFilter==='kitchen'?cat!=='other':cat===activeModuleFilter);
    const inSearch=!q||(b.dataset.search||'').includes(q);
    b.hidden=!(inTab&&inSearch);
  }
  for(const group of document.querySelectorAll('#module-catalogue .mf3d-module-group')){
    group.hidden=!group.querySelector('.mf3d-module:not([hidden])');
  }
}
function bindCatalogueControls(){
  $('module-search').oninput=applyCatalogueFilter;
  for(const b of document.querySelectorAll('#module-tabs [data-module-filter]')){
    b.onclick=()=>{
      activeModuleFilter=b.dataset.moduleFilter;
      document.querySelectorAll('#module-tabs [data-module-filter]').forEach(x=>x.classList.toggle('active',x===b));
      applyCatalogueFilter();
    };
  }
}
function renderModuleCatalogue(){
  const root=$('module-catalogue');
  root.replaceChildren();
  const group=document.createElement('div');
  group.className='mf3d-module-group';
  const heading=document.createElement('h3');heading.textContent='Производственные модули';group.append(heading);
  for(const id of Object.keys(pilotProductionById)){
    const m=bazisById.get(id);
    const p=m.production,drawerCount=p.front_layout?.kind==='drawer'?p.front_layout.heights.length:0,isWall=p.tier==='wall';
    const description=drawerCount
      ?drawerCount+' ящика · AKS · направляющие с доводчиком · автоподбор по глубине'
      :p.dryer
        ?(p.doors.length===2?'Верхний · сушка AKS по ширине · 2 фасада · PRIME':'Верхний · сушка AKS по ширине · 1 фасад · PRIME')
      :isWall
        ?(p.doors.length===2?'Верхний · 2 фасада · полки по высоте · задник 3 мм · PRIME':p.doors[0].side==='left'?'Верхний · левое открывание · полки по высоте · PRIME':'Верхний · правое открывание · полки по высоте · PRIME')
        :p.doors.length===2?'Две двери · полка · задник':p.doors[0].side==='left'?'Левое открывание · полка · задник':'Правое открывание · полка · задник';
    addCatalogueButton(group,{bazis:id,category:categoryKey(m),label:m.label,description});
  }
  root.append(group);
  applyCatalogueFilter();
}

async function loadProjects(){
  const d=await api('/3d-projects');
  projects=d.items;
  renderProjects();
}
function renderProjects(){
  $('projects').replaceChildren();
  if(!projects.length){
    const p=document.createElement('p');
    p.textContent='Сохранённых проектов пока нет.';
    p.className='muted';
    $('projects').append(p);
  }
  for(const p of projects){
    const b=document.createElement('button');
    b.className='mf3d-project'+(project?.project_id===p.project_id?' active':'');
    const strong=document.createElement('strong'),span=document.createElement('span');
    strong.textContent=p.name;
    span.textContent='v'+p.version+' · '+new Date(p.updated_at).toLocaleString('ru-RU');
    b.append(strong,span);
    b.onclick=()=>openProject(p.project_id);
    $('projects').append(b);
  }
}
function renderItems(){
  $('scene-items').replaceChildren();
  for(const it of state.items){
    const b=document.createElement('button');
    b.className='mf3d-project'+(it.item_id===selectedId?' active':'');
    const strong=document.createElement('strong'),span=document.createElement('span');
    strong.textContent=it.name;
    span.textContent=it.width+'×'+it.height+'×'+it.depth;
    b.append(strong,span);
    b.onclick=()=>{
      selectedId=it.item_id;
      state.selected_item_id=selectedId;
      syncControls();
      updateAll();
    };
    $('scene-items').append(b);
  }
}
async function openProject(id){
  project=await api('/3d-projects/'+id);
  state=normalizeScene(project.scene);
  selectedId=state.selected_item_id||state.items[0]?.item_id;
  $('project-name').value=project.name;
  viewMode=state.view_mode;
  await hydrateMaterials();
  syncRoom();
  setMode(viewMode);
  await syncControls();
  updateAll();
  renderProjects();
  status('Проект открыт.');
}
async function hydrateMaterials(){
  for(const it of state.items)for(const id of[it.body_variant_id,it.front_variant_id,it.back_variant_id,it.plinthMaterialId,it.countertopMaterialId,...Object.values(it.part_materials||{}),...(it.shelves||[]).map(s=>s.material_variant_id)])if(id)await material(id);
}
async function saveProject(){
  state.selected_item_id=selectedId;
  state.view_mode=viewMode;
  const body={name:$('project-name').value.trim()||'3D-проект',scene:scenePayload()};
  if(project)project=await api('/3d-projects/'+project.project_id,'PATCH',{...body,version:project.version});
  else project=await api('/3d-projects','POST',body);
  await loadProjects();
  status('Проект сохранён.');
}
async function newProject(){
  project=null;
  state={schema_version:2,room:{width:4200,depth:3200,height:2700},items:[],selected_item_id:null,view_mode:'3d'};
  selectedId=null;
  $('project-name').value='Новый 3D-проект';
  syncRoom();
  setMode('3d');
  syncControls();
  updateAll();
  renderProjects();
  status('Пустой проект. Добавьте модуль слева.');
}
async function duplicateProject(){
  if(!project)await saveProject();
  project=await api('/3d-projects/'+project.project_id+'/duplicate','POST',{});
  await loadProjects();
  await openProject(project.project_id);
  status('Создана копия проекта.');
}
async function deleteProject(){
  if(!project)return;
  if(!confirm('Удалить этот 3D-проект?'))return;
  await api('/3d-projects/'+project.project_id,'DELETE');
  project=null;
  await loadProjects();
  await newProject();
}
async function shareProject(){
  if(!project)await saveProject();
  const d=await api('/3d-projects/'+project.project_id+'/shares','POST',{});
  $('share-url').value=location.origin+d.url;
  $('share-panel').hidden=false;
  status('Ссылка только для просмотра создана.');
}
async function copyShare(){
  const value=$('share-url').value;
  if(!value)return;
  try{
    await navigator.clipboard.writeText(value);
    status('Ссылка скопирована.');
  }catch{
    $('share-url').select();
    status('Скопируйте выделенную ссылку.');
  }
}
async function downloadSpec(){
  if(!project)await saveProject();
  const a=document.createElement('a');
  a.href='/api/v2/3d-projects/'+project.project_id+'/specification.pdf';
  a.download='Martin_Forest_3D_Project.pdf';
  document.body.append(a);
  a.click();
  a.remove();
  status('PDF проекта сформирован.');
}

function itemNumberFor(type,templateId){
  return state.items.filter(x=>templateId?x.template_id===templateId:x.module_type===type&&!x.template_id).length+1;
}
function addTemplate(templateId,announce=true){
  const t=kitchenTemplates[templateId];
  if(!t)return;
  const d=t.defaults,n=itemNumberFor(t.module_type,templateId);
  const it={
    item_id:uid(),module_type:t.module_type,template_id:templateId,item_name:t.itemName,
    name:t.itemName+(n>1?' '+n:''),x:Math.min(1200,state.items.length*250),
    z:-Math.max(0,state.room.depth/2-d.d/2-100),rotation:0,width:d.w,height:d.h,depth:d.d,
    layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',body_variant_id:null,front_variant_id:null
  };
  delete it.item_name;
  state.items.push(it);
  selectedId=it.item_id;
  state.selected_item_id=selectedId;
  syncControls();
  updateAll();
  if(announce)status(t.label+' добавлен в проект.');
}
function addBazisModule(bazisId,announce=true){
  const m=bazisById.get(bazisId);
  if(!m||m.component)return;
  const d=m.defaults,n=state.items.filter(x=>x.bazis_id===bazisId).length+1;
  const it={
    item_id:uid(),module_type:m.module_type,template_id:null,bazis_id:m.id,bazis_file:m.source_file,
    bazis_sha256:m.source_sha256,bazis_resize:Boolean(m.resize),name:m.label+(n>1?' '+n:''),
    x:Math.min(1200,state.items.length*250),z:-Math.max(0,state.room.depth/2-d.d/2-100),rotation:0,
    width:d.w,height:d.h,depth:d.d,layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',
    body_variant_id:null,front_variant_id:null
  };
  if(m.production){
    const p=m.production;
    Object.assign(it,{body_height:p.body_height,base_height:p.base_height,worktop_thickness:p.worktop_thickness,doors_open:false});
    it.shelves=JSON.parse(JSON.stringify(globalThis.MF_FURNITURE_CORE.productionShelves(it,p)));
  }
  state.items.push(it);selectedId=it.item_id;state.selected_item_id=selectedId;
  syncControls();updateAll();
  if(announce)status(m.label+' добавлен из библиотеки БАЗИС.');
}
function addModule(type,announce=true){
  if(defaultTemplateByModule[type])return addTemplate(defaultTemplateByModule[type],announce);
  const d=moduleDefs[type]||moduleDefs.chest,n=itemNumberFor(type,null);
  const it={
    item_id:uid(),module_type:type,template_id:null,name:d.name+(n>1?' '+n:''),
    x:Math.min(1200,state.items.length*250),z:-Math.max(0,state.room.depth/2-d.d/2-100),rotation:0,
    width:d.w,height:d.h,depth:d.d,layout:d.layout,drawers:d.drawers,base:d.base,handles:'handles',
    body_variant_id:null,front_variant_id:null
  };
  state.items.push(it);
  selectedId=it.item_id;
  state.selected_item_id=selectedId;
  syncControls();
  updateAll();
  if(announce)status(d.name+' добавлен в проект.');
}
function duplicateItem(){
  const src=selected();
  if(!src)return;
  const copy={...src,item_id:uid(),name:src.name+' · копия',x:Math.min(12000,src.x+120),z:Math.min(12000,src.z+80)};
  state.items.push(copy);
  selectedId=copy.item_id;
  state.selected_item_id=selectedId;
  syncControls();
  updateAll();
  status('Копия модуля добавлена.');
}
function removeItem(){
  if(!selected())return;
  state.items=state.items.filter(x=>x.item_id!==selectedId);
  selectedId=state.items[0]?.item_id||null;
  state.selected_item_id=selectedId;
  syncControls();
  updateAll();
  status('Модуль удалён из проекта.');
}

function syncRoom(){
  $('room-width').value=state.room.width;
  $('room-depth').value=state.room.depth;
  $('room-height').value=state.room.height;
}
function applyLimits(it,t){
  const defs={w:[300,3000],h:[300,3000],d:[200,1200]};
  for(const [id,key] of[['width','w'],['height','h'],['depth','d']]){
    const lim=t?.limits?.[key]||defs[key];
    $(id).min=String(lim[0]);
    $(id).max=String(lim[1]);
    if(id==='width')$(id).step=String(t?.production?.dryer?.width_step_mm||1);
  }
}
const STANDARD_WIDTHS=[300,350,400,450,500,600,700,800,900,1000,1200];
function renderQuickWidths(it,t){
  const root=$('quick-widths');
  if(!root)return;
  root.replaceChildren();
  const lim=t?.limits?.w||[300,3000];
  const step=t?.production?.dryer?.width_step_mm||null;
  const values=step
    ?Array.from({length:Math.floor(lim[1]/step)-Math.ceil(lim[0]/step)+1},(_,i)=>(Math.ceil(lim[0]/step)+i)*step)
    :STANDARD_WIDTHS.filter(v=>v>=lim[0]&&v<=lim[1]);
  if(!values.includes(Number(it.width)))values.push(Number(it.width));
  values.sort((a,b)=>a-b);
  for(const v of values){
    const b=document.createElement('button');
    b.type='button';
    b.className='secondary'+(Number(it.width)===v?' active':'');
    b.textContent=String(v);
    b.onclick=()=>{
      it.width=v;
      $('width').value=String(v);
      updateAll();
    };
    root.append(b);
  }
}
function renderFacadeSummary(it){
  const root=$('facade-summary');
  if(!root||!it)return;
  const cells=facadeCells(it),groups=new Map();
  for(const f of cells){
    const title=f.kind==='drawer'?'ящик':'дверь',key=title+'|'+f.w+'|'+f.h;
    if(!groups.has(key))groups.set(key,{title,w:f.w,h:f.h,qty:0});
    groups.get(key).qty++;
  }
  if(!groups.size){
    root.innerHTML='<strong>Фасады</strong><span>В этом шаблоне фасадов нет.</span>';
    return;
  }
  const lines=[...groups.values()].map(g=>g.qty+' × '+g.title+' · '+mmText(g.w)+' × '+mmText(g.h)+' мм');
  root.innerHTML='<strong>Фасады по правилу 1,5 мм</strong><span>'+lines.join('<br>')+'</span>';
}
async function syncControls(){
  const it=selected();
  $('item-controls').hidden=!it;
  if(!it){
    renderItems();
    return;
  }
  const t=templateFor(it);
  $('item-title').textContent=it.name;
  $('template-info').textContent=it.bazis_id
    ?'БАЗИС · '+it.bazis_file+' · привязан к исходному .fr3d.'
    :(t?t.label+' · '+t.description+' · накладные фасады, зазор 1,5 мм по каждой стороне.'
       :'Свободная компоновка. Накладные фасады считаются с зазором 1,5 мм по каждой стороне.');
  applyLimits(it,t);
  for(const [id,key] of[['width','width'],['height','height'],['depth','depth'],['pos-x','x'],['pos-z','z'],['rotation','rotation'],['layout','layout'],['drawers','drawers'],['base','base'],['handles','handles']])$(id).value=String(it[key]);
  const h=globalThis.MF_FURNITURE_CORE.heights(it);
  for(const key of ['body_height','base_height','worktop_thickness']){
    const input=$(key.replaceAll('_','-'));if(input)input.value=String(h[key]);
  }
  const kitchen=globalThis.MF_FURNITURE_CORE.kitchenSettings(it);
  $('base').disabled=Boolean(kitchen);
  if($('kitchen-controls'))$('kitchen-controls').hidden=!kitchen;
  if($('base-height')){$('base-height').disabled=it.base==='wall'||Boolean(it.bazis_id);$('base-height').parentElement.hidden=Boolean(kitchen);}
  if(kitchen){
    for(const [id,key]of [['leg-height','legHeightMm'],['rear-service-gap','rearServiceGapMm'],['countertop-depth','countertopDepthMm'],['countertop-thickness','countertopThicknessMm']])if($(id))$(id).value=String(kitchen[key]);
    const run=globalThis.MF_FURNITURE_CORE.kitchenRuns(state.items,state.room).find(r=>r.members.includes(it.item_id));
    if($('kitchen-summary'))$('kitchen-summary').textContent='Столешница ряда: '+(run?.countertopActualLengthMm||it.width)+' × '+kitchen.countertopDepthMm+' × '+kitchen.countertopThicknessMm+' мм · заготовка 4100 мм. Сзади '+kitchen.rearServiceGapMm+' мм · спереди '+kitchen.frontOverhangMm+' мм.'+(kitchen.frontOverhangMm<20?' Увеличьте глубину столешницы для переднего свеса.':'')+(run?.countertopActualLengthMm>4100?' Ряд длиннее заготовки: потребуется стык.':'');
  }
  if($('body-height'))$('body-height').disabled=Boolean(it.bazis_id&&!t?.production);
  if($('worktop-control'))$('worktop-control').hidden=Boolean(kitchen)||it.module_type!=='base_cabinet'||it.depth>750;
  if($('height-breakdown'))$('height-breakdown').textContent='Корпус '+h.body_height+' + основание '+h.base_height+' = модуль '+h.module_height+' мм'+(h.worktop_thickness?' · со столешницей '+h.overall_height_with_worktop+' мм':'');
  const production=t?.production||null,prodRoot=$('production-controls');
  if(prodRoot){
    prodRoot.hidden=!production;
    if(production){
      const shelf=(it.shelves||[])[0],back=production.back;
      $('production-back-summary').textContent=back?'Задняя стенка: '+(back.type==='overlay_nails'?'накладная, гвозди':'производственная')+' · '+back.thickness+' мм · '+(back.material_name||'материал из донора'):'Задняя стенка не задана';
      if($('production-hardware-summary')){
        const hw=production.hardware;
        $('production-hardware-summary').textContent=hw?'Петли PRIME '+hw.hinge_article+' · '+hw.hinge_count+' шт.':'Фурнитура берётся из производственного донора';
      }
      $('shelf-enabled').checked=Boolean(shelf?.enabled);
      $('shelf-position').disabled=!shelf?.enabled;
      $('shelf-position').value=String(shelf?.offset_mm??Math.round(h.body_height/2));
      $('shelf-position').min=String(Math.ceil(production.carcass.panel_thickness+(shelf?.thickness||18)/2));
      $('shelf-position').max=String(Math.floor(h.body_height-production.carcass.rail_height-(shelf?.thickness||18)/2));
      $('toggle-doors').hidden=!production.doors?.length;
      $('toggle-doors').textContent=it.doors_open?'Закрыть фасады':'Открыть фасады';
    }
  }
  renderQuickWidths(it,t);
  renderFacadeSummary(it);
  $('layout').disabled=Boolean(t);
  $('drawers').disabled=Boolean(t);
  $('layout-control').title=t?'Компоновка задаётся выбранным шаблоном модуля.':'';
  $('drawers-control').title=t?'Количество фасадов задаётся выбранным шаблоном модуля.':'';
  const bodyMaterial=await material(it.body_variant_id),frontMaterial=await material(it.front_variant_id);
  if(selected()?.item_id!==it.item_id)return;
  $('body-selected').textContent=label(bodyMaterial);$('front-selected').textContent=label(frontMaterial);
  const plinthMaterial=await material(it.plinthMaterialId),countertopMaterial=await material(it.countertopMaterialId);
  if(selected()?.item_id!==it.item_id)return;
  for(const [kind,m]of [['plinth',plinthMaterial],['countertop',countertopMaterial]])if($(kind+'-selected'))$(kind+'-selected').textContent=label(m);
  for(const [kind,m]of [['body',bodyMaterial],['front',frontMaterial],['plinth',plinthMaterial],['countertop',countertopMaterial]]){const hint=$(kind+'-visual');if(hint)hint.textContent=!m?'':m.visual?.texture_url?'Точная текстура · '+(m.article||''):m.visual?.preview_url?'Официальный preview, масштаб ориентировочный · '+(m.article||''):m.visual?.render_color?'Подтверждённый цвет; текстура отсутствует':'Нет точного изображения · '+(m.article||m.name||'')+' · нейтральный вид';}
  renderItems();
}
async function searchMaterial(input,results,kind){
  const q=input.value.trim();
  results.replaceChildren();
  if(q.length<2)return;
  const d=await api('/catalogue/materials?q='+encodeURIComponent(q)+'&limit=8');
  for(const m of d.items){
    const b=document.createElement('button');
    b.type='button';
    b.textContent=label(m);
    b.onclick=()=>{
      const it=selected();
      if(!it)return;
      if(['body','front','plinth'].includes(kind)&&templateFor(it)?.production&&Number(m.thickness)!==18){status('Для корпуса, фасадов и цоколя выберите материал толщиной 18 мм.');return;}
      materials.set(String(m.variant_id),m);
      const targets=$('material-scope')?.value==='kitchen'?state.items.filter(x=>globalThis.MF_FURNITURE_CORE.isKitchenModule(x)):[it];
      const field={body:'body_variant_id',front:'front_variant_id',plinth:'plinthMaterialId',countertop:'countertopMaterialId'}[kind];
      for(const target of targets){
        target[field]=m.variant_id;
        if(kind==='body'||kind==='front'){
          const parts=globalThis.MF_FURNITURE_CORE.productionParts(target,templateFor(target))||[];
          for(const part of parts)if(kind==='front'?part.role==='front':['body','shelf'].includes(part.role))if(target.part_materials)delete target.part_materials[part.key];
          if(kind==='body')for(const shelf of target.shelves||[])shelf.material_variant_id=null;
        }
      }
      status('Материал: '+(targets.length>1?'вся кухня · '+targets.length+' модуля':it.name));
      $(kind+'-selected').textContent=label(m);
      results.replaceChildren();
      input.value='';
      updateAll();
    };
    results.append(b);
  }
}

function setMode(mode){
  viewMode=mode;
  $('mode-2d').className=mode==='2d'?'':'secondary';
  $('mode-3d').className=mode==='3d'?'':'secondary';
  $('scene-help').textContent=mode==='3d'
    ?'Модуль — перетащить · пустое место — вращать · колесо — масштаб'
    :'2D · нажмите модуль и перетащите его мышью';
  updateAll();
}
function colorFor(m,front=false){
  return m?.visual?.render_color||m?.renderColor||m?.preview_color||m?.color_hex||(front?'#e5e3d8':'#b9c1b9');
}
function rotateXZ(x,z,r){
  const a=r*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return{x:x*c-z*s,z:x*s+z*c};
}
function addItemBox(it,w,h,d,x,y,z,color){
  const p=rotateXZ(x,z,it.rotation),odd=it.rotation===90||it.rotation===270,S=1/500;
  boxes.push({w:odd?d:w,h,d:odd?w:d,x:it.x*S+p.x,y,z:it.z*S+p.z,color});
}
function legacyFrontSpec(it){
  if(it.layout==='drawers')return{kind:'drawers',count:Math.max(1,it.drawers||1)};
  if(it.layout==='doors')return{kind:'doors',count:it.width>=900?2:1};
  if(it.layout==='combo')return{kind:'combo',drawerRows:Math.max(2,Math.min(3,it.drawers||2)),drawerRatio:.42,doors:it.width>=900?2:1};
  if(it.layout==='niche')return{kind:'niche',drawerRows:Math.max(2,it.drawers||2),nicheRatio:.35};
  return{kind:'doors',count:1};
}
function facadeCells(it){
  return globalThis.MF_FURNITURE_CORE.facadeCells(it,templateFor(it));
}

function buildItem(it){
  const parts=globalThis.MF_FURNITURE_CORE.productionParts(it,templateFor(it),id=>materials.get(String(id)));
  if(parts){
    for(const part of parts){const d=part.size,c=part.position;
      addItemBox(it,d.x/500,d.y/500,d.z/500,c.x/500,c.y/500,c.z/500,colorFor(materials.get(String(part.material.variant_id)),part.role==='front'));
    }
    return;
  }
  const S=1/500,W=it.width*S,H=it.height*S,D=it.depth*S,t=18*S;
  const bc=colorFor(materials.get(String(it.body_variant_id))),fc=colorFor(materials.get(String(it.front_variant_id)),true);
  const baseH=globalThis.MF_FURNITURE_CORE.heights(it).base_height*S;
  const wallLift=it.module_type==='wall_cabinet'?Math.max(0,(state.room.height-it.height-500))*S:0;
  const y0=wallLift;
  addItemBox(it,t,H-baseH,D,-W/2+t/2,y0+baseH+(H-baseH)/2,0,bc);
  addItemBox(it,t,H-baseH,D,W/2-t/2,y0+baseH+(H-baseH)/2,0,bc);
  addItemBox(it,W-2*t,t,D,0,y0+H-t/2,0,bc);
  addItemBox(it,W-2*t,t,D,0,y0+baseH+t/2,0,bc);
  if(it.base==='plinth')addItemBox(it,W,baseH,D*.78,0,y0+baseH/2,0,bc);
  if(it.layout==='niche'){
    const inner=H-baseH-2*t,nh=inner*.35;
    addItemBox(it,W-2*t,t,D*.92,0,y0+H-t-nh,0,bc);
  }
  const frontT=18*S,fz=D/2+frontT/2+.004;
  for(const f of facadeCells(it))addItemBox(it,f.w*S,f.h*S,frontT,f.cx*S,y0+f.cy*S,fz,fc);
}
function buildBoxes(){
  boxes=[];
  const S=1/500,r=state.room;
  boxes.push({w:r.width*S,h:.035,d:r.depth*S,x:0,y:-.02,z:0,color:'#d6d1c5'});
  boxes.push({w:r.width*S,h:r.height*S,d:.035,x:0,y:r.height*S/2,z:-r.depth*S/2,color:'#eef0e9'});
  boxes.push({w:.035,h:r.height*S,d:r.depth*S,x:-r.width*S/2,y:r.height*S/2,z:0,color:'#e7eae4'});
  for(const it of state.items)buildItem(it);
}

function cutlistItem(it){
  const t=18,inner=Math.max(1,it.width-2*t),baseH=globalThis.MF_FURNITURE_CORE.heights(it).base_height,a=[],prefix=it.name+' · ';
  const parts=globalThis.MF_FURNITURE_CORE.productionParts(it,templateFor(it),id=>materials.get(String(id)));
  if(parts){
    for(const part of parts){
      const role=part.role==='back'?'fixed':part.role==='front'?'front':'body';
      a.push([prefix+part.name,part.length,part.width,1,role,part.role==='shelf'?{...it,body_variant_id:part.material.variant_id}:it,part.material.name]);
    }
    return a;
  }else{
    a.push([prefix+'Боковина',it.height-baseH,it.depth,2,'body',it]);
    a.push([prefix+'Крышка/дно',inner,it.depth,2,'body',it]);
    if(it.base==='plinth')a.push([prefix+'Цоколь',it.width,Math.round(it.depth*.78),1,'body',it]);
    if(['tall_cabinet','wardrobe'].includes(it.module_type))a.push([prefix+'Полка',inner,it.depth,Math.max(2,Math.floor(it.height/500)),'body',it]);
    if(it.layout==='niche')a.push([prefix+'Полка ниши',inner,it.depth,1,'body',it]);
  }

  const grouped=new Map();
  for(const f of facadeCells(it)){
    const name=f.kind==='drawer'?'Фасад ящика':'Фасад двери';
    const key=name+'|'+f.w+'|'+f.h;
    if(!grouped.has(key))grouped.set(key,{name,w:f.w,h:f.h,qty:0});
    grouped.get(key).qty++;
  }
  for(const g of grouped.values())a.push([prefix+g.name,g.w,g.h,g.qty,'front',it]);
  return a;
}
function allCutlist(includeKitchen=false){
  const rows=state.items.flatMap(cutlistItem);
  if(includeKitchen)for(const run of globalThis.MF_FURNITURE_CORE.kitchenRuns(state.items,state.room,id=>materials.get(String(id))))for(const p of run.parts)
    rows.push(['Кухонный ряд · '+p.name,p.length,p.width,1,'fixed',{body_variant_id:p.material.variant_id},p.material.name]);
  return rows;
}
function renderCutlist(){
  const rows=allCutlist(true),t=document.createElement('table');
  t.innerHTML='<thead><tr><th>Деталь</th><th>Размер</th><th>Кол.</th><th>Материал</th></tr></thead><tbody></tbody>';
  for(const r of rows){
    const tr=document.createElement('tr');
    const mat=r[4]==='front'?materials.get(String(r[5].front_variant_id)):materials.get(String(r[5].body_variant_id));
    const materialText=r[6]||label(mat);
    for(const v of[r[0],mmText(r[1])+'×'+mmText(r[2]),r[3],materialText]){
      const td=document.createElement('td');
      td.textContent=v;
      tr.append(td);
    }
    t.tBodies[0].append(tr);
  }
  $('cutlist').replaceChildren(t);
}

function hexRgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function shade(h,f){
  const[r,g,b]=hexRgb(h);
  return'rgb('+Math.max(0,Math.min(255,r*f|0))+','+Math.max(0,Math.min(255,g*f|0))+','+Math.max(0,Math.min(255,b*f|0))+')';
}
function tf(p){
  let{x,y,z}=p,cy=Math.cos(rotY),sy=Math.sin(rotY),cx=Math.cos(rotX),sx=Math.sin(rotX);
  const x1=cy*x+sy*z,z1=-sy*x+cy*z,y1=cx*y-sx*z,z2=sx*y+cx*z;
  return{x:x1,y:y1,z:z2};
}
function proj3(p,w,h){
  const t=tf(p),dist=10*zoom,sc=5.4/(dist-t.z),s=Math.min(w,h)*.29;
  return{x:w/2+t.x*sc*s,y:h*.61-t.y*sc*s,z:t.z};
}
function faces(b){
  const x0=b.x-b.w/2,x1=b.x+b.w/2,y0=b.y-b.h/2,y1=b.y+b.h/2,z0=b.z-b.d/2,z1=b.z+b.d/2;
  const v=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(x=>({x:x[0],y:x[1],z:x[2]}));
  return[[0,1,2,3,.72],[4,5,6,7,1.05],[0,4,7,3,.84],[1,5,6,2,.92],[3,2,6,7,1.15],[0,1,5,4,.65]].map(f=>({verts:f.slice(0,4).map(i=>v[i]),sh:f[4],c:b.color}));
}
const canvas=$('scene'),ctx=plannerRequested?null:canvas.getContext('2d');
function sizeCanvas(){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
  if(canvas.width!==Math.floor(w*dpr)||canvas.height!==Math.floor(h*dpr)){
    canvas.width=Math.floor(w*dpr);
    canvas.height=Math.floor(h*dpr);
  }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return{w,h};
}
function room2dMetrics(){
  const r=canvas.getBoundingClientRect(),pad=45;
  const scale=Math.min((r.width-pad*2)/state.room.width,(r.height-pad*2)/state.room.depth);
  return{scale,ox:r.width/2,oz:r.height/2};
}
function itemFootprint(it){
  const odd=it.rotation===90||it.rotation===270;
  return{w:odd?it.depth:it.width,d:odd?it.width:it.depth};
}
function clampItemToRoom(it){
  const fp=itemFootprint(it),rx=state.room.width/2,rz=state.room.depth/2;
  it.x=Math.round(Math.max(-rx+fp.w/2,Math.min(rx-fp.w/2,it.x)));
  it.z=Math.round(Math.max(-rz+fp.d/2,Math.min(rz-fp.d/2,it.z)));
}
function hitItem2d(clientX,clientY){
  const r=canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top,m=room2dMetrics();
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i],fp=itemFootprint(it),cx=m.ox+it.x*m.scale,cy=m.oz+it.z*m.scale;
    if(x>=cx-fp.w*m.scale/2&&x<=cx+fp.w*m.scale/2&&y>=cy-fp.d*m.scale/2&&y<=cy+fp.d*m.scale/2)return it;
  }
  return null;
}
function itemRect3d(it,w,h){
  const S=1/500,odd=it.rotation===90||it.rotation===270;
  const ww=(odd?it.depth:it.width)*S,dd=(odd?it.width:it.depth)*S,H=it.height*S;
  const wallLift=it.module_type==='wall_cabinet'?Math.max(0,(state.room.height-it.height-500))*S:0;
  const cx=it.x*S,cz=it.z*S,y0=wallLift,y1=wallLift+H;
  const pts=[];
  for(const x of[cx-ww/2,cx+ww/2])for(const y of[y0,y1])for(const z of[cz-dd/2,cz+dd/2])pts.push(proj3({x,y,z},w,h));
  return{
    left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),
    top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))
  };
}
function hitItem3d(clientX,clientY){
  const r=canvas.getBoundingClientRect(),x=clientX-r.left,y=clientY-r.top;
  for(let i=state.items.length-1;i>=0;i--){
    const it=state.items[i],b=itemRect3d(it,r.width,r.height);
    if(x>=b.left-8&&x<=b.right+8&&y>=b.top-8&&y<=b.bottom+8)return it;
  }
  return null;
}
let pointerMode=null,dragItemId=null,dragStartX=0,dragStartY=0,dragStartItemX=0,dragStartItemZ=0;
function selectItem(it){
  if(!it)return;
  selectedId=it.item_id;state.selected_item_id=selectedId;
  syncControls();updateAll();
}
function dragSelected2d(clientX,clientY){
  const it=state.items.find(x=>x.item_id===dragItemId);if(!it)return;
  const m=room2dMetrics();
  it.x=Math.round(dragStartItemX+(clientX-dragStartX)/m.scale);
  it.z=Math.round(dragStartItemZ+(clientY-dragStartY)/m.scale);
  clampItemToRoom(it);
  $('pos-x').value=String(it.x);$('pos-z').value=String(it.z);updateAll();
}
function dragSelected3d(clientX,clientY){
  const it=state.items.find(x=>x.item_id===dragItemId);if(!it)return;
  const r=canvas.getBoundingClientRect(),mmPerPx=Math.max(state.room.width/r.width,state.room.depth/r.height)*1.05;
  const dx=(clientX-dragStartX)*mmPerPx,dy=(clientY-dragStartY)*mmPerPx;
  const c=Math.cos(rotY),sn=Math.sin(rotY);
  it.x=Math.round(dragStartItemX+dx*c+dy*sn);
  it.z=Math.round(dragStartItemZ-dx*sn+dy*c);
  clampItemToRoom(it);
  $('pos-x').value=String(it.x);$('pos-z').value=String(it.z);updateAll();
}
function draw2d(w,h){
  ctx.fillStyle='#f4f2eb';
  ctx.fillRect(0,0,w,h);
  const pad=45,scale=Math.min((w-pad*2)/state.room.width,(h-pad*2)/state.room.depth),ox=w/2,oz=h/2;
  ctx.fillStyle='#fff';
  ctx.strokeStyle='#9aa99d';
  ctx.lineWidth=2;
  ctx.fillRect(ox-state.room.width*scale/2,oz-state.room.depth*scale/2,state.room.width*scale,state.room.depth*scale);
  ctx.strokeRect(ox-state.room.width*scale/2,oz-state.room.depth*scale/2,state.room.width*scale,state.room.depth*scale);
  for(const it of state.items){
    const odd=it.rotation===90||it.rotation===270,ww=(odd?it.depth:it.width)*scale,dd=(odd?it.width:it.depth)*scale,x=ox+it.x*scale,y=oz+it.z*scale;
    ctx.fillStyle=it.item_id===selectedId?'#73917d':'#aebdaf';
    ctx.fillRect(x-ww/2,y-dd/2,ww,dd);
    ctx.strokeStyle='#153d2d';
    ctx.strokeRect(x-ww/2,y-dd/2,ww,dd);
    ctx.fillStyle='#153d2d';
    ctx.font='11px Arial';
    ctx.textAlign='center';
    ctx.fillText(it.name,x,y+4);
  }
}
function draw3d(w,h){
  const g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#edf4ee');
  g.addColorStop(1,'#d8e4db');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,w,h);
  const fs=[];
  for(const b of boxes)fs.push(...faces(b));
  for(const f of fs){
    f.p=f.verts.map(v=>proj3(v,w,h));
    f.z=f.p.reduce((s,p)=>s+p.z,0)/4;
  }
  fs.sort((a,b)=>a.z-b.z);
  for(const f of fs){
    ctx.beginPath();
    ctx.moveTo(f.p[0].x,f.p[0].y);
    for(let i=1;i<4;i++)ctx.lineTo(f.p[i].x,f.p[i].y);
    ctx.closePath();
    ctx.fillStyle=shade(f.c,f.sh);
    ctx.fill();
    ctx.strokeStyle='rgba(25,45,31,.16)';
    ctx.stroke();
  }
}
function draw(){
  if(plannerRequested)return;
  const{w,h}=sizeCanvas();
  if(state){
    if(viewMode==='2d')draw2d(w,h);
    else draw3d(w,h);
  }
  requestAnimationFrame(draw);
}
function updateAll(){
  if(!state)return;
  buildBoxes();
  renderCutlist();
  renderItems();
  const it=selected();
  if(it){
    renderQuickWidths(it,templateFor(it));
    renderFacadeSummary(it);
  }
  $('room-badge').textContent=state.room.width+'×'+state.room.depth+'×'+state.room.height;
  $('item-badge').textContent=state.items.length+' '+(state.items.length===1?'модуль':(state.items.length>=2&&state.items.length<=4?'модуля':'модулей'));
}

function exportSafeName(value,max=48){
  const s=String(value||'project').normalize('NFKD').replace(/[^A-Za-z0-9_.-]+/g,'_').replace(/^_+|_+$/g,'')||'project';
  return s.slice(0,max);
}
function exportBazisProject(){
  const bazisItems=state.items.filter(x=>x.bazis_file);
  const missing=state.items.filter(x=>!x.bazis_file);
  if(!bazisItems.length){
    alert('В проекте нет модулей из раздела «Мои БАЗИС». Для родной модели .b3d нужны исходные .fr3d.');
    status('Экспорт БАЗИС: нет родных модулей.');
    return;
  }
  if(missing.length&&!confirm(
    'В проекте есть '+missing.length+' модулей без исходного .fr3d.\n\n'+
    'Они не смогут стать родными объектами БАЗИС и будут пропущены. Продолжить?'
  ))return;
  const payload={
    format:'martin-forest-bazis-native-v2',
    project_name:$('project-name').value.trim()||'3D-проект',
    exported_at:new Date().toISOString(),
    room:{...state.room},
    facade_gap_mm:FACADE_GAP_MM,
    production_schema:1,
    // Additive preparation data. Existing native importer still owns source/target placement.
    kitchen_production:{native_accessories_supported:false,
      runs:globalThis.MF_FURNITURE_CORE.kitchenRuns(state.items,state.room,id=>materials.get(String(id)))},
    skipped_non_bazis:missing.map(x=>({name:x.name,module_type:x.module_type})),
    items:bazisItems.map((it,index)=>{
      const src=templateFor(it),p=src?.production||null;
      const nativeDefault=p?.native_defaults||{width:src?.defaults.w,height:src?.defaults.h,depth:src?.defaults.d};
      return{
        index:index+1,
        bazis_id:it.bazis_id,
        source_file:it.bazis_file,
        source_sha256:it.bazis_sha256,
        source_default:src?nativeDefault:null,
        elastic_resize:Boolean(it.bazis_resize),
        // Legacy native elastic resize has no separate leg-height channel. Keep its donor base
        // so changing legs cannot stretch the exported carcass; full kitchen parameters follow below.
        target:{width:it.width,height:p?globalThis.MF_FURNITURE_CORE.heights(it).body_height+p.base_height:it.height,depth:it.depth},
        position:{x:it.x,y:0,z:it.z},
        rotation:it.rotation,
        name:it.name,
        body_variant_id:it.body_variant_id||null,
        front_variant_id:it.front_variant_id||null,
        construction:p?{
          key:p.key,
          parts:globalThis.MF_FURNITURE_CORE.productionParts(it,src,id=>materials.get(String(id))),
          back_variant_id:it.back_variant_id||null,part_materials:it.part_materials||{},
          carcass:p.carcass||null,
          back:p.back,
          shelves:globalThis.MF_FURNITURE_CORE.productionShelves(it,p).map(shelf=>({
            id:shelf.id,enabled:shelf.enabled!==false,offset_mm:shelf.offset_mm,thickness:shelf.thickness,
            width_clearance:shelf.width_clearance,depth_clearance:shelf.depth_clearance,
            source_component:shelf.source_component||null,material_variant_id:shelf.material_variant_id||null
          })),
          doors:p.doors||[],
          hardware:globalThis.MF_FURNITURE_CORE.productionHardware(it,p),
          base_height:Number.isFinite(it.base_height)?it.base_height:p.base_height,
          worktop_thickness:Number.isFinite(it.worktop_thickness)?it.worktop_thickness:p.worktop_thickness,
          handles:it.handles,
          native_base_height_mm:p.base_height,
          kitchen:globalThis.MF_FURNITURE_CORE.kitchenSettings(it),
          legs:globalThis.MF_FURNITURE_CORE.kitchenLegs(it)
        }:null
      };
    })
  };
  const json=JSON.stringify(payload,null,2);
  const blob=new Blob([json],{type:'application/json;charset=utf-8'});
  const href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;
  a.download=exportSafeName($('project-name').value.trim()||'Martin_Forest_Project')+'.mf-bazis.json';
  a.style.display='none';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),3000);
  status('Родной экспорт БАЗИС подготовлен: '+bazisItems.length+' модулей.');
}

async function toOrder(){
  for(const it of state.items)if(!it.body_variant_id||!it.front_variant_id)throw new Error('Выберите материалы корпуса и фасадов для всех модулей.');
  await saveProject();
  const o=await api('/orders','POST',{business_name:$('project-name').value.trim()||'3D-проект',preparation_mode:'self_prepared'});
  const rel=await api('/catalogue/releases'),rows=allCutlist();
  const details=rows.map(r=>({
    detail_id:uid(),name:r[0],comments:'Из 3D-проекта '+$('project-name').value,
    length:String(mmNumber(r[1])),width:String(mmNumber(r[2])),qty:r[3],
    variant_id:(r[4]==='front'?r[5].front_variant_id:r[5].body_variant_id),
    supply_source:'company',rotation:false,grain:'unknown',route:'solid',packaging:false,edges:{}
  }));
  await api('/orders/'+o.order_id+'/revisions','POST',{
    parent_revision_id:null,catalogue_release_id:rel.active_release,reason:'Перенос из 3D-проекта',
    comment:'Создано из сохранённого 3D-проекта '+project.project_id,details
  },{'If-Match':String(o.optimistic_lock_version)});
  location.assign('/editor?order='+encodeURIComponent(o.order_id));
}

async function start(){
  try{user=await api('/auth/me')}catch{location.assign('/login');return}
  bindCatalogueControls();
  renderModuleCatalogue();
  await loadProjects();
  await newProject();
  document.body.dataset.appReady='true';
  if(!plannerRequested)document.body.dataset.ready='true';
  status('3D готов.');
  draw();
}

for(const id of['room-width','room-depth','room-height'])$(id).oninput=()=>{
  const key={'room-width':'width','room-depth':'depth','room-height':'height'}[id];
  state.room[key]=+$(id).value||state.room[key];
  updateAll();
};
for(const [id,key]of[['width','width'],['height','height'],['depth','depth'],['pos-x','x'],['pos-z','z']])$(id).oninput=()=>{
  const it=selected();
  if(it){
    it[key]=+$(id).value||0;
    updateAll();
  }
};
for(const [id,key]of[['rotation','rotation'],['layout','layout'],['drawers','drawers'],['base','base'],['handles','handles']])$(id).onchange=()=>{
  const it=selected();
  if(it){
    it[key]=id==='rotation'||id==='drawers'?+$(id).value:$(id).value;
    updateAll();
  }
};

$('body-search').oninput=()=>searchMaterial($('body-search'),$('body-results'),'body');
$('front-search').oninput=()=>searchMaterial($('front-search'),$('front-results'),'front');
for(const kind of ['plinth','countertop'])if($(kind+'-search'))$(kind+'-search').oninput=()=>searchMaterial($(kind+'-search'),$(kind+'-results'),kind);
$('duplicate-item').onclick=duplicateItem;
$('remove-item').onclick=removeItem;
$('mode-2d').onclick=()=>setMode('2d');
$('mode-3d').onclick=()=>setMode('3d');
$('reset-view').onclick=()=>{rotY=-.55;rotX=.2;zoom=1};
if(!plannerRequested){
canvas.onpointerdown=e=>{
  const it=viewMode==='2d'?hitItem2d(e.clientX,e.clientY):hitItem3d(e.clientX,e.clientY);
  drag=true;px=e.clientX;py=e.clientY;
  if(it){
    selectItem(it);
    pointerMode='item';dragItemId=it.item_id;
    dragStartX=e.clientX;dragStartY=e.clientY;dragStartItemX=it.x;dragStartItemZ=it.z;
    canvas.style.cursor='grabbing';
  }else if(viewMode==='3d'){
    pointerMode='camera';dragItemId=null;canvas.style.cursor='grabbing';
  }else{
    pointerMode=null;dragItemId=null;
  }
  canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove=e=>{
  if(!drag)return;
  if(pointerMode==='item'){
    if(viewMode==='2d')dragSelected2d(e.clientX,e.clientY);
    else dragSelected3d(e.clientX,e.clientY);
    return;
  }
  if(pointerMode==='camera'&&viewMode==='3d'){
    rotY+=(e.clientX-px)*.008;
    rotX=Math.max(-.55,Math.min(.65,rotX+(e.clientY-py)*.004));
    px=e.clientX;py=e.clientY;
  }
};
canvas.onpointerup=e=>{
  drag=false;pointerMode=null;dragItemId=null;canvas.style.cursor='';
  try{canvas.releasePointerCapture(e.pointerId)}catch{}
};
canvas.onpointercancel=()=>{drag=false;pointerMode=null;dragItemId=null;canvas.style.cursor=''};
canvas.onwheel=e=>{
  if(viewMode!=='3d')return;
  e.preventDefault();
  zoom=Math.max(.55,Math.min(2,zoom+Math.sign(e.deltaY)*.08));
};

}

$('save-project').onclick=()=>saveProject().catch(e=>status(e.message));
$('new-project').onclick=()=>newProject().catch(e=>status(e.message));
$('duplicate-project').onclick=()=>duplicateProject().catch(e=>status(e.message));
$('delete-project').onclick=()=>deleteProject().catch(e=>status(e.message));
$('to-order').onclick=()=>toOrder().catch(e=>status(e.message));
$('share-project').onclick=()=>shareProject().catch(e=>status(e.message));
$('copy-share').onclick=()=>copyShare();
$('download-spec').onclick=()=>downloadSpec().catch(e=>status(e.message));
$('export-bazis').onclick=exportBazisProject;
window.addEventListener('keydown',e=>{
  if(plannerRequested)return;
  const tag=document.activeElement?.tagName;
  if(['INPUT','SELECT','TEXTAREA'].includes(tag))return;
  const it=selected();if(!it)return;
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeItem();return;}
  const step=e.shiftKey?100:10;
  if(e.key==='ArrowLeft'){it.x-=step;e.preventDefault();}
  else if(e.key==='ArrowRight'){it.x+=step;e.preventDefault();}
  else if(e.key==='ArrowUp'){it.z-=step;e.preventDefault();}
  else if(e.key==='ArrowDown'){it.z+=step;e.preventDefault();}
  else return;
  clampItemToRoom(it);$('pos-x').value=String(it.x);$('pos-z').value=String(it.z);updateAll();
});

window.MF3D_KITCHEN={facadeGapMm:FACADE_GAP_MM,templates:kitchenTemplates,bazisModules,facadeCells};
start().catch(e=>status(e.message));
