import {blankItem,validateBlank,edgeMeters} from './blanks-model.mjs';
import {worldPoint,resolveBlankBindings} from './blank-bindings.mjs';

// Exact master.u2 catalogue identity: ЛХДФ 3ММ Белый, 2800х2070 мм.
// Used only when adding new carcasses; saved/manual assignments stay unchanged.
import {choice,defaultShelf,fittingGap} from './shelf-choices.mjs';
export const CARCASS_BACK_MATERIAL_ID='fb7b270e-66ad-5411-affc-5717b1adf0d6';

// Construction families grounded in the user's Zhanna albums and native kitchen
// productionParts. These are rectangular recipes, not copies of shaped donors.
export const CARCASSES=Object.freeze([
  {id:'shelves',name:'Шкаф с полками',description:'Дно и крыша между стойками',w:600,h:2200,d:577,shelves:4,sections:1,back:true,top:'inset',bottom:'inset'},
  {id:'divided',name:'Шкаф с перегородкой',description:'Две секции с отдельными полками',w:1000,h:2200,d:577,shelves:3,sections:2,back:true,top:'inset',bottom:'inset'},
  {id:'wall',name:'Навесной корпус',description:'Дно и крыша между боковинами',w:600,h:720,d:317,shelves:1,sections:1,back:true,top:'inset',bottom:'inset'},
  {id:'base',name:'Нижний корпус',description:'Накладное дно · две горизонтальные царги',w:600,h:720,d:510,shelves:1,sections:1,back:true,top:'rails',bottom:'overlay'},
  {id:'sink',name:'Под мойку',description:'Накладное дно · три вертикальные царги',w:600,h:720,d:510,shelves:0,sections:1,back:false,top:'sink',bottom:'overlay'},
  {id:'cap',name:'Тумба с крышкой',description:'Накладная крыша · дно между стойками',w:600,h:250,d:350,shelves:0,sections:1,back:false,top:'overlay',bottom:'inset'}
]);

export function carcassSpec(input={}){
  const recipe=CARCASSES.find(r=>r.id===(input.recipe||'shelves'));
  if(!recipe)throw Error('Выберите конструкцию корпуса.');
  const s={recipe:recipe.id,width:recipe.w,height:recipe.h,depth:recipe.d,thickness:18,
    shelves:recipe.shelves,sections:recipe.sections,back:recipe.back,elevation:0,
    shelfSetback:20,shelfGap:0,edgeThickness:1,edgePolicy:recipe.id==='sink'?'none':'front',...input};
  for(const [key,min,max,label] of [['width',200,2400,'Ширина'],['height',200,3000,'Высота'],['depth',200,1200,'Глубина'],
    ['thickness',10,40,'Толщина'],['shelves',0,10,'Количество полок'],['sections',1,3,'Количество секций'],
    ['elevation',0,5000,'Низ от пола'],['shelfSetback',0,100,'Отступ полки'],['shelfGap',0,10,'Зазор полки']])
    if(!Number.isInteger(s[key])||s[key]<min||s[key]>max)throw Error(label+': '+min+'–'+max+'.');
  if(![.4,.8,1,2,3].includes(s.edgeThickness)||!['front','all','none'].includes(s.edgePolicy))throw Error('Проверьте схему и толщину ПВХ.');
  if(typeof s.back!=='boolean')throw Error('Выберите вариант задней стенки.');
  if(s.sectionShelves!=null&&(!Array.isArray(s.sectionShelves)||s.sectionShelves.length!==s.sections||s.sectionShelves.some(n=>!Number.isInteger(n)||n<0||n>10)||Math.max(...s.sectionShelves)!==s.shelves||!['shelves','divided'].includes(s.recipe)))throw Error('Проверьте количество полок в каждой секции.');
  if(recipe.id==='sink'&&(s.back||s.shelves||s.sections!==1))throw Error('У корпуса под мойку нет полок, перегородок и задней стенки.');
  if(['base','cap'].includes(recipe.id)&&s.sections!==1)throw Error('У этой конструкции одна секция.');
  return {...s,top:recipe.top,bottom:recipe.bottom,label:recipe.name};
}

export function buildCarcass(input={},options={}){
  const s=carcassSpec(input),{width:W,height:H,depth:D,thickness:t}=s;
  const prefix=options.idPrefix||crypto.randomUUID(),parts=[];
  const sideY=s.bottom==='overlay'?t:0,sideH=H-sideY-(s.top==='overlay'?t:0);
  const bottomTop=t,topBottom=['inset','overlay','rails'].includes(s.top)?H-t:H-80;
  const add=(key,name,axis,L,B,T,x,y,z,code,binding=null,shelf=null)=>{
    const item=blankItem({item_id:prefix+':'+key,name:(options.name||s.label)+' · '+name,axis,length:L,partWidth:B,thickness:T,
      x,z,elevation:y+s.elevation,edges:options.edges?.[key]??code,blank_edge_thickness_mm:s.edgeThickness,
      blank_shelf:shelf,body_variant_id:shelf?.startsWith('board/')||!shelf?(key==='back'?(options.backMaterialId??null):(options.bodyMaterialId??null)):null,blank_binding:binding?{...binding,mounting:key.startsWith('shelf-')&&(!shelf||shelf===defaultShelf)?'sekura-95388':'none'}:null});
    const error=validateBlank(item);if(error)throw Error(name+': '+error);
    parts.push({key,label:name,item});return item;
  };
  const edge=(special='1000')=>s.edgePolicy==='all'?'1111':s.edgePolicy==='none'?'0000':special;
  const left=add('left','Боковина левая','side',sideH,D,t,-(W-t)/2,sideY,0,edge());
  const right=add('right','Боковина правая','side',sideH,D,t,(W-t)/2,sideY,0,edge());
  const binding=(a,b,gap=0,z=0)=>({left_id:a.item_id,right_id:b.item_id,gap_left_mm:gap,gap_right_mm:gap,depth_offset_mm:z});
  add('bottom','Дно','horizontal',s.bottom==='overlay'?W:W-2*t,D,t,0,0,0,edge(),s.bottom==='inset'?binding(left,right):null);
  if(['inset','overlay'].includes(s.top))add('top','Крыша','horizontal',s.top==='overlay'?W:W-2*t,D,t,0,H-t,0,
    edge(s.top==='overlay'?'1111':'1000'),s.top==='inset'?binding(left,right):null);
  if(s.top==='rails')for(const [key,z] of [['front',(D-80)/2],['rear',-(D-80)/2]])
    add('rail-'+key,'Царга '+(key==='front'?'передняя':'задняя'),'horizontal',W-2*t,80,t,0,H-t,z,edge(key==='front'?'1000':'0100'),binding(left,right,0,z));
  if(s.top==='sink')for(const [key,name,y,z] of [['front','передняя',H-80,(D-t)/2],['rear','задняя',H-80,-(D-t)/2],['rear-lower','задняя нижняя',t,-(D-t)/2]])
    add('rail-'+key,'Царга '+name,'back',W-2*t,80,t,0,y,z,edge('1100'));
  const inner=W-2*t,clear=inner-(s.sections-1)*t;
  const widths=Array.from({length:s.sections},(_,i)=>Math.floor(clear/s.sections)+(i<clear%s.sections?1:0));
  if(widths.some(w=>w-2*s.shelfGap<100))throw Error('Секции слишком узкие: уменьшите их количество.');
  const supports=[left];let x=-W/2+t;
  for(let i=0;i<s.sections-1;i++){
    x+=widths[i];supports.push(add('divider-'+i,'Перегородка '+(i+1),'side',H-2*t,D,t,x+t/2,t,0,edge()));x+=t;
  }
  supports.push(right);
  const counts=s.sectionShelves??Array(s.sections).fill(s.shelves);
  if(counts.some(n=>topBottom-bottomTop-n*t<(n+1)*60))throw Error('Для полок недостаточно высоты. Уменьшите их количество.');
  for(let section=0;section<s.sections;section++)for(let i=0;i<counts[section];i++){
    const count=counts[section],y=bottomTop+Math.round((i+1)*(topBottom-bottomTop-count*t)/(count+1))+i*t;
    const a=supports[section],b=supports[section+1];
    const value=s.shelfChoices?.[section]?.[i]??defaultShelf;
    const {kind,thickness,hardware}=choice(value,t);
    const gap=Math.max(s.shelfGap,fittingGap(hardware.article));
    const label=kind==='glass'?'Стекло '+thickness+' мм · полка ':'Полка ';
    add('shelf-'+section+'-'+i,label+(i+1)+(s.sections>1?' · секция '+(section+1):''),'horizontal',
      widths[section]-2*gap,D-s.shelfSetback,thickness,(a.x+b.x)/2,y+t-thickness,-s.shelfSetback/2,kind==='glass'?'0000':edge(),binding(a,b,gap,-s.shelfSetback/2),value===defaultShelf?null:value);
  }
  // Overlay HDF is deliberately separate from the 18 mm material and has no PVC.
  if(s.back)add('back','Задняя стенка ХДФ 3 мм','back',W-2,H-2,3,0,1,-(D+3)/2,'0000');
  const items=resolveBlankBindings(parts.map(p=>p.item));
  return {spec:s,parts:parts.map((p,i)=>({...p,item:items[i]})),items,
    width:W,height:H,depth:D+(s.back?3:0),edgeMeters:Math.round(items.reduce((sum,p)=>sum+edgeMeters(p),0)*100)/100};
}

export function placeCarcass(built,position){
  // Placement envelope includes the overlay back; recipe origin remains at the carcass centre.
  const shift=built.spec.back?1.5:0;
  return built.items.map(it=>({...it,...worldPoint({x:it.x,z:it.z+shift},position.rotation||0),rotation:position.rotation||0}))
    .map(it=>({...it,x:it.x+position.x,z:it.z+position.z,elevation_mm:it.elevation_mm-built.spec.elevation+position.elevation_mm}));
}

export function insertCarcass(adapter,items){
  if(adapter.items.length+items.length>100)throw Error('В проекте поддерживается до 100 деталей и модулей.');
  const next=[...adapter.items,...items];
  for(const item of items){const error=adapter.validate(item,next);if(error)throw Error(item.name+': '+error);}
  // All references and collisions are checked before any mutation.
  resolveBlankBindings(next);
  for(const item of items)adapter.insert(item);
}
