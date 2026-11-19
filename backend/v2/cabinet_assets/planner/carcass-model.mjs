import {planRods,rodWarnings} from './wardrobe-rods.mjs';
export {sectionWidths} from './wardrobe-layout.mjs';
import {outerFront,drawerSections,buildDrawerBoards,doorZones,drawerFit,spacerCuts} from './wardrobe-drawers.mjs';
import {sectionWidths,nicheSlot,columnWidths,columnOpenings,localBaseShelf,openingBase,splitKey} from './wardrobe-layout.mjs';
import {fitNicheBanks,nicheOpenings} from './wardrobe-niches.mjs';
import {doorHinges} from './wardrobe-hinges.mjs';
import {shelfUndersides} from './shelf-levels.mjs';
import {overlayFronts,hingeLoad} from './wardrobe-fronts.mjs';
import {blankItem,validateBlank,edgeMeters} from './blanks-model.mjs';
import {worldPoint,resolveBlankBindings} from './blank-bindings.mjs';

// Exact master.u2 catalogue identity: ЛХДФ 3ММ Белый, 2800х2070 мм.
// Used only when adding new carcasses; saved/manual assignments stay unchanged.
import {footHeight,plinthPanel,floorSide} from './plinth-options.mjs';
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
    ['thickness',10,40,'Толщина'],['shelves',0,10,'Количество полок'],['sections',1,4,'Количество секций'],
    ['elevation',0,5000,'Низ от пола'],['shelfSetback',0,100,'Отступ полки'],['shelfGap',0,10,'Зазор полки']])
    if(!Number.isInteger(s[key])||s[key]<min||s[key]>max)throw Error(label+': '+min+'–'+max+'.');
  if(![.4,.8,1,2,3].includes(s.edgeThickness)||!['front','all','none'].includes(s.edgePolicy))throw Error('Проверьте схему и толщину ПВХ.');
  if(typeof s.back!=='boolean')throw Error('Выберите вариант задней стенки.');
  if(s.backThickness!=null&&(!s.back||![16,18].includes(s.backThickness)||!['shelves','divided'].includes(s.recipe)))throw Error('Проверьте толщину вкладной задней стенки.');
  if(s.backThickness>=16&&s.thickness<16)throw Error('Для крепления вкладной стенки нужны боковины, дно и крыша толщиной от 16 мм.');
  if(s.sectionShelves!=null&&(!Array.isArray(s.sectionShelves)||s.sectionShelves.length!==s.sections||s.sectionShelves.some(n=>!Number.isInteger(n)||n<0||n>10)||Math.max(...s.sectionShelves)!==s.shelves||!['shelves','divided'].includes(s.recipe)))throw Error('Проверьте количество полок в каждой секции.');
  if(recipe.id==='sink'&&(s.back||s.shelves||s.sections!==1))throw Error('У корпуса под мойку нет полок, перегородок и задней стенки.');
  if(['base','cap'].includes(recipe.id)&&s.sections!==1)throw Error('У этой конструкции одна секция.');
  return {...s,top:s.topFit??recipe.top,bottom:s.bottomFit??recipe.bottom,label:recipe.name};
}

// Positions are measured from the inside face of the left side to the
// left face of each divider. The last clear opening takes the remainder.
export function buildCarcass(input={},options={}){
  const s=carcassSpec(input),{width:W,height:H,depth:D,thickness:t}=s;
  const rear=s.backThickness??0,noBottom=s.bottom==='none',braceY=s.braceOffset??0;
  if(noBottom&&(!Number.isInteger(braceY)||braceY<0||braceY+100>H-t))throw Error('Проверьте высоту заднего ребра.');
  const innerRear=rear+(noBottom&&s.sections>1?t:0),shelfCentre=(innerRear-s.shelfSetback)/2;
  const prefix=options.idPrefix||crypto.randomUUID(),parts=[];
  const plinth=plinthPanel(s),legHeight=s.feet?.article==='118779'?0:footHeight(s);
  const sideY=s.bottom==='overlay'?t:0,sideH=H-sideY-(s.top==='overlay'?t:0);
  const bottomTop=t,topBottom=['inset','overlay','rails'].includes(s.top)?H-t:H-80;
  const add=(key,name,axis,L,B,T,x,y,z,code,binding=null,shelf=null)=>{
    const item=blankItem({item_id:prefix+':'+key,name:(options.name||s.label)+' · '+name,axis,length:L,partWidth:B,thickness:T,
      x,z,elevation:y+s.elevation+(key==='plinth'||floorSide(s,key)?0:legHeight),edges:key==='back'?'0000':key==='plinth'?'1111':options.edges?.[key]??code,blank_edge_thickness_mm:key==='rear-brace'?1:axis==='front'?2:s.edgeThickness,
      blank_shelf:shelf,body_variant_id:shelf&&!shelf.startsWith('board/')?null:(axis==='front'?options.frontMaterialId:key==='back'?options.backMaterialId:/^drawer-\d+-\d+-bottom$/.test(key)?CARCASS_BACK_MATERIAL_ID:key.startsWith('drawer-')?(options.drawerMaterialId??(t===18?options.bodyMaterialId:null)):options.bodyMaterialId)??null,blank_binding:binding?{...binding,mounting:key.startsWith('shelf-')&&(!shelf||shelf===defaultShelf)?'sekura-95388':'none'}:null});
    const error=validateBlank(item);if(error)throw Error(name+': '+error);
    parts.push({key,label:name,item});return item;
  };
  const edge=(special='1000')=>s.edgePolicy==='all'?'1111':s.edgePolicy==='none'?'0000':special;
  // Side panel edge order: front, rear, bottom, top.
  const sideEdges=edge('1'+(s.back&&!rear?'0':'1')+(s.bottom==='overlay'?'0':'1')+(s.top==='overlay'?'0':'1'));
  const left=add('left','Боковина левая','side',sideH+(floorSide(s,'left')?legHeight:0),D,t,-(W-t)/2,sideY,0,sideEdges);
  const right=add('right','Боковина правая','side',sideH+(floorSide(s,'right')?legHeight:0),D,t,(W-t)/2,sideY,0,sideEdges);
  const binding=(a,b,gap=0,z=0)=>({left_id:a.item_id,right_id:b.item_id,gap_left_mm:gap,gap_right_mm:gap,depth_offset_mm:z});
  if(noBottom)add('rear-brace','Заднее ребро жёсткости','back',W-2*t,100,t,0,braceY,(-D+t)/2+rear,'1100');
  else add('bottom','Дно','horizontal',s.bottom==='overlay'?W:W-2*t,D,t,0,0,0,edge(s.bottomFit==='overlay'?'1011':'1000'),s.bottom==='inset'?binding(left,right):null);
  if(['inset','overlay'].includes(s.top))add('top','Крыша','horizontal',s.top==='overlay'?W:W-2*t,D,t,0,H-t,0,
    edge(s.top==='overlay'?'1111':'1000'),s.top==='inset'?binding(left,right):null);
  if(s.top==='rails')for(const [key,z] of [['front',(D-80)/2],['rear',-(D-80)/2]])
    add('rail-'+key,'Царга '+(key==='front'?'передняя':'задняя'),'horizontal',W-2*t,80,t,0,H-t,z,edge(key==='front'?'1000':'0100'),binding(left,right,0,z));
  if(s.top==='sink')for(const [key,name,y,z] of [['front','передняя',H-80,(D-t)/2],['rear','задняя',H-80,-(D-t)/2],['rear-lower','задняя нижняя',t,-(D-t)/2]])
    add('rail-'+key,'Царга '+name,'back',W-2*t,80,t,0,y,z,edge('1100'));
  const widths=sectionWidths(s),dividerSetback=s.dividerSetback??0;
  if(widths.some(w=>w-2*s.shelfGap<100))throw Error('Секции слишком узкие. Измените положение стойки, ширину шкафа или количество секций.');
  const supports=[left];let x=-W/2+t;
  for(let i=0;i<s.sections-1;i++){
    x+=widths[i];supports.push(add('divider-'+i,'Перегородка '+(i+1),'side',H-(noBottom?1:2)*t,D-innerRear-dividerSetback,t,x+t/2,noBottom?0:t,(innerRear-dividerSetback)/2,edge()));x+=t;
  }
  supports.push(right);
  if(s.drawerBanks?.some(b=>b?.layout))s.drawerBanks=fitNicheBanks(s,s.drawerBanks);
  const banks=drawerSections(s,widths,Boolean(options.legacyDrawers));
  const counts=s.sectionShelves??Array(s.sections).fill(s.shelves);
  const shelfYs=counts.map((count,section)=>{
    const baseSlot=nicheSlot(section,0),bank=s.drawerBanks?.[baseSlot]?.layout?null:banks[baseSlot],below=s.drawerBanks?.[baseSlot]?.shelvesBelow??0;
    if(!Number.isInteger(below)||below<0||below>count)throw Error('Секция '+(section+1)+': проверьте число полок под блоком.');
    const thicknesses=Array.from({length:count},(_,i)=>choice(s.shelfChoices?.[section]?.[i]??defaultShelf,t).thickness);
    const floor=s.elevation+footHeight(s);
    if(!below)return shelfUndersides(s,section,bank?.top??(noBottom?openingBase(s,section):bottomTop),topBottom,thicknesses,floor,Boolean(bank));
    const levels=s.shelfLevels?.[section]??Array(count).fill(null);
    const levelsIn=(start,end)=>({...s,shelfLevels:{[section]:levels.slice(start,end)}});
    return [...shelfUndersides(levelsIn(0,below),section,bottomTop,bank.base,thicknesses.slice(0,below),floor,true),
      ...shelfUndersides(levelsIn(below,count),section,bank.top,topBottom,thicknesses.slice(below),floor,true)];
  });
  for(let section=0;section<s.sections;section++){
    if(!localBaseShelf(s,section))continue;
    const a=supports[section],b=supports[section+1],y=openingBase(s,section)-t;
    add('shelf-base-'+section,'Закреплённая полка под шуфлядами · секция '+(section+1),'horizontal',widths[section],D-innerRear-s.shelfSetback,t,(a.x+b.x)/2,y,shelfCentre,edge(),binding(a,b,0,shelfCentre-a.z),'board/'+(s.drawerFixing??'cam_dowel'));
  }
  for(let section=0;section<s.sections;section++)for(let i=0;i<counts[section];i++){
    const y=shelfYs[section][i];
    const a=supports[section],b=supports[section+1];
    const value=s.shelfChoices?.[section]?.[i]??defaultShelf;
    const {kind,thickness,hardware,scheme}=choice(value,t);
    const gap=scheme?0:Math.max(s.shelfGap,kind==='glass'&&!options.legacyGlassGap?1:0,fittingGap(hardware.article));
    if(scheme && D-innerRear-s.shelfSetback < (scheme==='cam_dowel'?216:152))throw Error('Для выбранного крепежа недостаточно глубины полки после отступа.');
    const label=kind==='glass'?'Стекло '+thickness+' мм · полка ':'Полка ';
    add('shelf-'+section+'-'+i,label+(i+1)+(s.sections>1?' · секция '+(section+1):''),'horizontal',
      widths[section]-2*gap,D-innerRear-s.shelfSetback,thickness,(a.x+b.x)/2,y,shelfCentre,kind==='glass'?'0000':edge(),binding(a,b,gap,shelfCentre-a.z),value===defaultShelf?null:value);
  }
  const occupied=new Set();
  for(const zone of s.nicheSplits??[]){
    const sec=zone.section,id=splitKey(zone),slot=nicheSlot(sec,zone.level);
    const room=sec>=0&&sec<s.sections?nicheOpenings(s,sec)[zone.level]:null;
    if(!room||occupied.has(id)||s.drawerBanks?.[nicheSlot(sec,0)]&&!s.drawerBanks[nicheSlot(sec,0)].layout)throw Error('Проверьте границы выбранной перегородки.');
    occupied.add(id);
    const halves=columnWidths(zone,widths[sec]),a=supports[sec],b=supports[sec+1];
    const leftEdge=a.x+a.width/2,mid=leftEdge+halves[0]+9,isDrawers=zone.kind==='drawers';
    if(!isDrawers&&banks[slot])throw Error('Полки и шуфляды занимают одну нишу.');
    const bank=banks[slot]??banks[nicheSlot(sec,zone.level,1)];
    if(isDrawers&&!bank)throw Error('Для общей стойки добавьте шуфляды в нишу.');
    const depth=isDrawers?bank.rail.length:D-innerRear-s.shelfSetback;
    const z=isDrawers?bank.bodyFront-depth/2:shelfCentre;
    const divider=add(id+'-divider','Перегородка '+(isDrawers?'между шуфлядами':'для полок')+' · секция '+(sec+1),'side',room.top-room.bottom,depth,18,mid,room.bottom,z,edge());
    if(!isDrawers){
      if(zone.columns?.length!==2)throw Error('Укажите полки левой и правой части.');
      for(const [i,col] of zone.columns.entries()){
        const bounds=columnOpenings(room.bottom,room.top,col,t),sides=i?[divider,b]:[a,divider];
        for(const [j,gap] of bounds.slice(0,-1).entries()){
          const value=col.choices?.[j]??defaultShelf,c=choice(value,t),glass=c.kind==='glass';
          const clearance=c.scheme?0:Math.max(s.shelfGap,glass?1:0,fittingGap(c.hardware.article));
          add('shelf-'+id+'-'+i+'-'+j,'Полка '+(j+1)+(i?' справа':' слева')+' · ниша '+(zone.level+1),'horizontal',
            halves[i]-2*clearance,depth,c.thickness,leftEdge+(i?halves[0]+18:0)+halves[i]/2,gap.top,z,glass?'0000':edge(),
            binding(...sides,clearance,z-sides[0].z),value===defaultShelf?null:value);
        }
      }
    }
  }
  if(s.front){
    if(!['left','right','pair'].includes(s.front.swing)||![90,130].includes(s.front.offset))throw Error('Выберите сторону открывания и отступ петель.');
    const sides=s.front.swing==='pair'?['left','right']:[s.front.swing];
    for(const [i,door] of doorZones(s,overlayFronts(s,sides.length),banks).entries()){
      if(door.height<=0)continue;
      hingeLoad(door.width,door.height,s.front.massKg);
      add('door-'+sides[i],'Фасад · петли '+(sides[i]==='left'?'слева':'справа'),'front',door.height,door.width,18,
        door.left+door.width/2-W/2,door.bottom,D/2+9,'1111');
    }
  }
  const drawerIssues=[],hingeConflicts=[];
  if(s.front?.autoHinges){
    buildDrawerBoards(s,banks,add);
    const panels=parts.map(p=>p.item);
    for(const side of ['left','right']){
      const door=panels.find(it=>it.item_id===prefix+':door-'+side);
      if(!door)continue;
      try{
        const axes=doorHinges({...door,assistant_carcass:{spec:s,group_id:prefix}},panels).map(h=>h.position.y-s.elevation-legHeight);
        for(const b of banks)if(b&&(side==='left'?b.spacerL:b.spacerR)){
          b.cuts??={};b.cuts[side]=spacerCuts(b.base,b.span,axes,side);
        }
      }catch(error){
        if(!error.hingeConflict)throw error;
        drawerIssues.push(error.message);hingeConflicts.push(error.hingeConflict);
      }
    }
  }else if(banks.some(Boolean)){
    if(!options.legacyDrawers){
      const axes={left:[],right:[]};
      const panels=parts.map(p=>p.item);
      for(const side of ['left','right']){
        const door=panels.find(it=>it.item_id===prefix+':door-'+side);
        if(door){
          const tagged={...door,assistant_carcass:{spec:s,group_id:prefix}};
          axes[side]=doorHinges(tagged,panels).map(h=>h.position.y-s.elevation-legHeight);
        }
      }
      for(const b of banks.filter(Boolean)){
        const fit=drawerFit(b,axes,s.drawerBanks[b.slot]);b.cuts=fit.cuts;drawerIssues.push(...fit.issues);
      }
    }
    buildDrawerBoards(s,banks,add);
  }
  if(plinth)add('plinth','Цоколь','back',plinth.width,plinth.height,t,plinth.x,0,plinth.z,'1111');
  // Overlay HDF is deliberately separate from the 18 mm material and has no PVC.
  if(rear)add('back','Задняя стенка ЛДСП '+rear+' мм','back',W-2*t,H-(noBottom?1:2)*t,rear,0,noBottom?0:t,(rear-D)/2,'0000');
  else if(s.back)add('back','Задняя стенка ХДФ 3 мм','back',W-2,H-2,3,0,1,-(D+3)/2,'0000');
  const items=resolveBlankBindings(parts.map(p=>p.item));
  const rods=planRods(s);
  return {spec:s,rods,rodIssues:rodWarnings(rods,s.thickness),drawerIssues,hingeConflicts,drawerBanks:banks,parts:parts.map((p,i)=>({...p,item:items[i]})),items,
    width:W,height:H,depth:D+(s.back&&!rear?3:0)+(outerFront(s)?18:0),edgeMeters:Math.round(items.reduce((sum,p)=>sum+edgeMeters(p),0)*100)/100};
}

export function placeCarcass(built,position){
  // Placement envelope includes the overlay back; recipe origin remains at the carcass centre.
  const shift=(built.spec.back&&!built.spec.backThickness?1.5:0)-(outerFront(built.spec)?9:0);
  return built.items.map(it=>({...it,...worldPoint({x:it.x,z:it.z+shift},position.rotation||0),rotation:position.rotation||0}))
    .map(it=>({...it,x:it.x+position.x,z:it.z+position.z,elevation_mm:it.elevation_mm-built.spec.elevation+position.elevation_mm+(built.spec.feet?.article==='118779'?10:0)}));
}

export function insertCarcass(adapter,items){
  if(adapter.items.length+items.length>100)throw Error('В проекте поддерживается до 100 деталей и модулей.');
  const next=[...adapter.items,...items];
  for(const item of items){const error=adapter.validate(item,next);if(error)throw Error(item.name+': '+error);}
  // All references and collisions are checked before any mutation.
  resolveBlankBindings(next);
  for(const item of items)adapter.insert(item);
}
