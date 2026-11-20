import {applyLighting} from './wardrobe-lighting.mjs';
import {canMachine,checkBackMount,backCut,backTrim,backSideTrim,rearClearance,rearProjection} from './panel-machining.mjs';
import {aboveGola,installedOpenings} from './wardrobe-gola-shelves.mjs';
import {planRods,rodWarnings} from './wardrobe-rods.mjs';
export {sectionWidths} from './wardrobe-layout.mjs';
import {outerFront,drawerSections,buildDrawerBoards,drawerFit,spacerCuts} from './wardrobe-drawers.mjs';
import {sectionWidths,nicheSlot,columnWidths,columnOpenings,localBaseShelf,openingBase,splitKey} from './wardrobe-layout.mjs';
import {fitNicheBanks,nicheOpenings} from './wardrobe-niches.mjs';
import {doorHinges} from './wardrobe-hinges.mjs';
import {shelfUndersides} from './shelf-levels.mjs';
import {fittedPull,trimFace,validateEdgePull} from './wardrobe-edge-pulls.mjs';
import {facadeLayout,hasFacadeProfiles,doorSide,usesProfileEdge,handlePlacement,drawerFacades,checkDrawerHandle} from './wardrobe-door-layout.mjs';
import {clearProfileShelves,verifyProfileSupports} from './wardrobe-door-hardware.mjs';
import {hingeLoad} from './wardrobe-fronts.mjs';
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
  checkBackMount(s);
  const mount=s.backMount,trim=backTrim(mount);
  const innerRear=rearClearance(s)+(noBottom&&s.sections>1?t:0),shelfCentre=(innerRear-s.shelfSetback)/2;
  const prefix=options.idPrefix||crypto.randomUUID(),parts=[];
  const plinth=plinthPanel(s),legHeight=s.feet?.article==='118779'?0:footHeight(s);
  const sideY=s.bottom==='overlay'?t:0,sideH=H-sideY-(s.top==='overlay'?t:0);
  const bottomTop=t,topBottom=['inset','overlay','rails'].includes(s.top)?H-t:H-80;
  let shelfRuns=[];
  const installedLevels=new Map();
  const add=(key,name,axis,L,B,T,x,y,z,code,binding=null,shelf=null)=>{
    const mountCut=mount?backCut(s,key,floorSide(s,key)?legHeight:0):null;
    const machining=[...(mountCut?[mountCut]:[]),...(s.machining?.[key]??[])];
    const grip=axis==='front'?fittedPull(s,key):null;
    if(grip){
      const board=trimFace(grip,L,B,x,y);
      if(doorSide(key)&&(usesProfileEdge(s.front,key,grip.edge)||s.front?.edgeProfiles?.[key]?.some(h=>h.edge===grip.edge)))
        throw Error('Торец с профилем Gola уже занят. Выберите другой торец для врезной ручки.');
      const problem=validateEdgePull(grip,board.width,board.height,T,doorSide(key));
      if(problem)throw Error(name+' · '+problem);
      L=board.height;B=board.width;x=board.x;y=board.y;
    }
    if(shelfRuns.length&&/^shelf-(?:\d+-\d+|niche-\d+-\d+-[01]-\d+)$/.test(key)&&(!shelf||shelf.startsWith('board/'))){
      const datum=aboveGola(shelfRuns,x+(W-L)/2,L,y,T);
      if(datum!=null){
        const extension=D/2-(z+B/2);
        y=datum;B+=extension;z+=extension/2;
        binding={...binding,depth_offset_mm:binding.depth_offset_mm+extension/2,gola_flush:true};
        installedLevels.set(key,{bottom:y,top:y+T});
      }
    }
    const item=blankItem({item_id:prefix+':'+key,name:(options.name||s.label)+' · '+name,axis,length:L,partWidth:B,thickness:T,
      x,z,elevation:y+s.elevation+(key==='plinth'||floorSide(s,key)?0:legHeight),edges:axis==='front'?'1111':key==='back'?'0000':key==='plinth'?'1111':options.edges?.[key]??code,blank_edge_thickness_mm:key==='rear-brace'?1:axis==='front'?2:s.edgeThickness,
      ...(machining.length&&canMachine({blank_thickness_mm:T,blank_shelf:shelf})?{blank_machining:machining}:{}),
      ...(grip?{blank_edge_pull:{...grip}}:{}),blank_shelf:shelf,body_variant_id:shelf&&!shelf.startsWith('board/')?null:(axis==='front'?options.frontMaterialId:key==='back'?options.backMaterialId:/^drawer-\d+-\d+-bottom$/.test(key)?CARCASS_BACK_MATERIAL_ID:key.startsWith('drawer-')?(options.drawerMaterialId??(t===18?options.bodyMaterialId:null)):options.bodyMaterialId)??null,blank_binding:binding?{...binding,mounting:key.startsWith('shelf-')&&(!shelf||shelf===defaultShelf)?'sekura-95388':'none'}:null});
    const error=validateBlank(item,null,mount);if(error)throw Error(name+': '+error);
    parts.push({key,label:name,item});return item;
  };
  const edge=(special='1000')=>s.edgePolicy==='all'?'1111':s.edgePolicy==='none'?'0000':special;
  // Side panel edge order: front, rear, bottom, top.
  const sideEdges=edge('1'+(s.back&&!rear?'0':'1')+(s.bottom==='overlay'?'0':'1')+(s.top==='overlay'?'0':'1'));
  function addSide(key){
    const cutback=backSideTrim(mount,key);
    const left=key==='left';
    return add(key,left?'Боковина левая':'Боковина правая','side',sideH+(floorSide(s,key)?legHeight:0),D-cutback,t,
      (left?-1:1)*(W-t)/2,sideY,cutback/2,sideEdges);
  }
  const left=addSide('left'),right=addSide('right');
  const binding=(a,b,gap=0,z=0)=>({left_id:a.item_id,right_id:b.item_id,gap_left_mm:gap,gap_right_mm:gap,depth_offset_mm:z});
  const capBinding=binding(left,right,0,trim/2-left.z);
  if(noBottom)add('rear-brace','Заднее ребро жёсткости','back',W-2*t,100,t,0,braceY,(-D+t)/2+rearClearance(s),'1100');
  else add('bottom','Дно','horizontal',s.bottom==='overlay'?W:W-2*t,D-trim,t,0,0,trim/2,edge(s.bottomFit==='overlay'?'1011':'1000'),s.bottom==='inset'?capBinding:null);
  if(['inset','overlay'].includes(s.top))add('top','Крыша','horizontal',s.top==='overlay'?W:W-2*t,D-trim,t,0,H-t,trim/2,
    edge(s.top==='overlay'?'1111':'1000'),s.top==='inset'?capBinding:null);
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
  const {doors:leaves,banks,runs}=facadeLayout(s,drawerSections(s,widths,Boolean(options.legacyDrawers)));
  if(!options.legacyGolaShelves)shelfRuns=runs;
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
  function checkOpenings(rooms){
    if(rooms.some(r=>r.top-r.bottom<60))throw Error('Над полкой с Gola не хватает места. Увеличьте высоту ниши до 60 мм.');
    return rooms;
  }
  if(installedLevels.size)for(let sec=0;sec<s.sections;sec++){
    const thicknesses=shelfYs[sec].map((_,i)=>choice(s.shelfChoices?.[sec]?.[i]??defaultShelf,t).thickness);
    const nominal=[...shelfYs[sec],topBottom].map((top,i)=>({bottom:i?shelfYs[sec][i-1]+thicknesses[i-1]:openingBase(s,sec),top}));
    checkOpenings(installedOpenings(nominal,installedLevels,i=>'shelf-'+sec+'-'+i));
  }
  const occupied=new Set();
  for(const zone of s.nicheSplits??[]){
    const sec=zone.section,id=splitKey(zone),slot=nicheSlot(sec,zone.level);
    const rooms=sec>=0&&sec<s.sections?nicheOpenings(s,sec):[];
    const nominalRoom=rooms[zone.level];
    const room=installedOpenings(rooms,installedLevels,i=>'shelf-'+sec+'-'+i)[zone.level];
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
        const bounds=columnOpenings(nominalRoom.bottom,nominalRoom.top,col,t),sides=i?[divider,b]:[a,divider];
        for(const [j,gap] of bounds.slice(0,-1).entries()){
          const value=col.choices?.[j]??defaultShelf,c=choice(value,t),glass=c.kind==='glass';
          const clearance=c.scheme?0:Math.max(s.shelfGap,glass?1:0,fittingGap(c.hardware.article));
          add('shelf-'+id+'-'+i+'-'+j,'Полка '+(j+1)+(i?' справа':' слева')+' · ниша '+(zone.level+1),'horizontal',
            halves[i]-2*clearance,depth,c.thickness,leftEdge+(i?halves[0]+18:0)+halves[i]/2,gap.top,z,glass?'0000':edge(),
            binding(...sides,clearance,z-sides[0].z),value===defaultShelf?null:value);
        }
        if(installedLevels.size)checkOpenings(installedOpenings(bounds,installedLevels,k=>'shelf-'+id+'-'+i+'-'+k,room.bottom,room.top));
      }
    }
  }
  if(hasFacadeProfiles(s)){
    const roof=parts.find(p=>p.key==='top');
    if(!roof)throw Error('Для установки профиля Gola нужна крыша шкафа.');
    roof.item.blank_gola_runs=runs.map(r=>({article:r.article,length_mm:r.right-r.left}));
  }
  for(const face of drawerFacades(s,banks))checkDrawerHandle(face,s.drawerBanks[face.slot].faces[face.index].handle,leaves);
  if(s.front){
    if(!['left','right','pair'].includes(s.front.swing)||![90,130].includes(s.front.offset))throw Error('Выберите сторону открывания и отступ петель.');
    for(const door of leaves){
      hingeLoad(door.width,door.height,s.front.massKg);
      const pull=handlePlacement(door,s.front.handles?.[door.key]);
      if(pull?.back&&usesProfileEdge(s.front,door.key,pull.edge))throw Error('Кромку с профилем Gola оставьте свободной от торцевой ручки.');
      const row=door.key.includes('upper-')?' верхний':door.key.includes('lower-')?' нижний':'';
      add(door.key,'Фасад'+row+' · петли '+(door.side==='left'?'слева':'справа'),'front',door.height,door.width,18,
        door.left+door.width/2-W/2,door.bottom,D/2+9,'1111');
    }
  }
  clearProfileShelves(s,parts,legHeight);
  const drawerIssues=[],hingeConflicts=[];
  if(s.front?.autoHinges){
    buildDrawerBoards(s,banks,add);
    const panels=parts.map(p=>p.item);
    const bySide={left:[],right:[]};
    for(const {key,item:door} of parts){
      const side=doorSide(key);if(!side)continue;
      try{
        const axes=doorHinges({...door,assistant_carcass:{spec:s,group_id:prefix}},panels);
        bySide[side].push(...axes.map(h=>h.position.y-s.elevation-legHeight));
      }catch(error){
        if(!error.hingeConflict)throw error;
        drawerIssues.push(error.message);hingeConflicts.push(error.hingeConflict);
      }
    }
    for(const b of banks.filter(Boolean))for(const side of ['left','right'])if(side==='left'?b.spacerL:b.spacerR){
      b.cuts??={};b.cuts[side]=spacerCuts(b.base,b.span,bySide[side].sort((a,b)=>a-b),side);
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
  else if(mount){
    const b=mount,grooved=b.kind==='groove',perimeter=grooved&&b.layout!=='sides';
    const bite=b.layout?b.depth-1:Math.floor(b.depth-1);
    const lower=perimeter&&!noBottom?t-bite:1,upper=perimeter?H-t+bite:H-1;
    const leftEdge=-W/2+(grooved||b.layout==='left'||b.layout==='both'?t-bite:1);
    const rightEdge=W/2-(b.layout==='left'?1:t-bite);
    const innerFace=b.layout?(b.offset??0)+b.width:grooved?b.offset+(b.width+3)/2:0;
    const z=-D/2+innerFace-1.5;
    add('back','Задняя стенка ХДФ 3 мм','back',rightEdge-leftEdge,upper-lower,3,(rightEdge+leftEdge)/2,lower,z,'0000');
  }
  else if(s.back)add('back','Задняя стенка ХДФ 3 мм','back',W-2,H-2,3,0,1,-(D+3)/2,'0000');
  if(s.lighting)applyLighting(parts,s.lighting);
  verifyProfileSupports(s,parts,runs,s.elevation+legHeight);
  const items=resolveBlankBindings(parts.map(p=>p.item),mount);
  if(installedLevels.size){
    const drawers=parts.filter(p=>/^drawer-\d+-\d+-(?:face|side-left|side-right|front|rear|bottom)$/.test(p.key));
    for(const {label,item} of parts.filter(p=>p.item.blank_binding?.gola_flush))for(const {item:d} of drawers){
      if(item.elevation_mm<d.elevation_mm+d.height&&item.elevation_mm+item.height>d.elevation_mm&&
         Math.abs(d.x-item.x)<(d.width+item.width)/2&&Math.abs(d.z-item.z)<(d.depth+item.depth)/2)
        throw Error(label+' над профилем Gola пересекает шуфляду. Выберите другой стык или увеличьте проём.');
    }
  }
  const rods=planRods(s,installedLevels);
  return {spec:s,installedLevels,doors:leaves,profiles:runs,rods,rodIssues:rodWarnings(rods,s.thickness),drawerIssues,hingeConflicts,drawerBanks:banks,parts:parts.map((p,i)=>({...p,item:items[i]})),items,
    width:W,height:H,depth:D+rearProjection(s)+(outerFront(s)?18:0),edgeMeters:Math.round(items.reduce((sum,p)=>sum+edgeMeters(p),0)*100)/100};
}

export function placeCarcass(built,position){
  // Placement envelope includes the overlay back; recipe origin remains at the carcass centre.
  const shift=rearProjection(built.spec)/2-(outerFront(built.spec)?9:0);
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
