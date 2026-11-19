import {isRightBank,levelOf,sectionOf,splitAt} from './wardrobe-layout.mjs';

const separator=' · ';
const legacyName=/^корпус\s+ии$/i;
const basicParts=new Map([
 ['left','Боковина левая'],['right','Боковина правая'],['top','Крыша'],
 ['bottom','Дно'],['rear-brace','Заднее ребро жёсткости'],['plinth','Цоколь']
]);
const drawerPart=/^drawer-(\d+)-(\d+)-(face|side-left|side-right|front|rear|bottom)$/;
const drawerLabels=new Map([
 ['face',['Фасад','Фасад шуфляды']],['side-left',['Левая боковина','Боковина левая']],
 ['side-right',['Правая боковина','Боковина правая']],['front',['Передняя стенка','Передняя стенка']],
 ['rear',['Задняя стенка','Задняя стенка']],['bottom',['Дно ЛХДФ','Дно ЛХДФ']]
]);
const text=value=>typeof value==='string'?value.trim():'';

function nextNumber(used) {
 let i=1;
 while(used.has(i))i++;
 used.add(i);
 return 'Шкаф '+String(i).padStart(2,'0');
}
function occupiedNumbers(names) {
 const used=new Set();
 for(const name of names){
  const number=/^шкаф\s+(\d+)$/i.exec(name);
  if(number)used.add(Number(number[1]));
 }
 return used;
}

function wardrobeGroups(items){
 const groups=new Map();
 for(const it of items){
  const meta=it.assistant_carcass,id=meta?.group_id;
  if(!text(id)||!it.item_id?.startsWith(id+':'))continue;
  if(!groups.has(id))groups.set(id,{id,parts:new Map(),prefixCounts:new Map(),slots:new Set(),name:'',spec:meta.spec});
  const g=groups.get(id),key=it.item_id.slice(id.length+1);
  g.parts.set(key,it);
  const box=drawerPart.exec(key);
  if(box)g.slots.add(+box[1]);
  if(text(meta.name))g.name=text(meta.name);
  // Old scenes stored the cabinet name as a common prefix in generated names.
  // A freely named shelf or front is never evidence for the name of a cabinet.
  const basic=basicParts.get(key),name=text(it.name);
  if(basic&&name.endsWith(separator+basic)){
   const prefix=name.slice(0,-(separator+basic).length);
   g.prefixCounts.set(prefix,(g.prefixCounts.get(prefix)||0)+1);
  }
 }
 for(const g of groups.values()){
  const winner=[...g.prefixCounts].sort((a,b)=>b[1]-a[1])[0];
  g.oldPrefix=winner?.[0]||'';
  if(!g.name&&g.oldPrefix&&!legacyName.test(g.oldPrefix))g.name=g.oldPrefix;
 }
 const used=occupiedNumbers([...groups.values()].map(g=>g.name));
 for(const g of groups.values())if(!g.name||legacyName.test(g.name))g.name=nextNumber(used);
 return groups;
}

export function wardrobeNames(items) {
 return new Map([...wardrobeGroups(items)].map(([id,g])=>[id,g.name]));
}
export function nextCabinetName(items) {
 return nextNumber(occupiedNumbers(wardrobeNames(items).values()));
}

function stripPrefix(name,g) {
 const generic=/^Корпус\s+ИИ\s*·\s*/i;
 if(generic.test(name))return name.replace(generic,'');
 for(const prefix of [g.oldPrefix,g.name])if(prefix&&name.startsWith(prefix+separator))return name.slice(prefix.length+separator.length);
 return name;
}

function generatedLabel(key,base,group) {
 if(basicParts.get(key)===base)return true;
 if(key==='back')return /^Задняя стенка (?:ЛДСП (?:16|18)|ХДФ 3) мм$/.test(base);
 if(key.startsWith('rail-'))return base==='Царга '+({front:'передняя',rear:'задняя','rear-lower':'задняя нижняя'}[key.slice(5)]);
 let match=/^divider-(\d+)$/.exec(key);
 if(match)return base==='Перегородка '+(+match[1]+1);
 match=/^drawer-(\d+)-spacer-(left|right)$/.exec(key);
 if(match)return base==='Проставка 18 мм '+(match[2]==='left'?'слева':'справа')+separator+'секция '+(sectionOf(+match[1])+1);
 match=/^shelf-base-(\d+)$/.exec(key);
 if(match)return base==='Закреплённая полка под шуфлядами'+separator+'секция '+(+match[1]+1);
 match=/^shelf-(\d+)-(\d+)$/.exec(key);
 if(match){
  const ending=(+match[2]+1)+(group.spec?.sections>1?separator+'секция '+(+match[1]+1):'');
  return base==='Полка '+ending||[4,6,8].some(mm=>base==='Стекло '+mm+' мм'+separator+'полка '+ending);
 }
 match=/^shelf-niche-(\d+)-(\d+)-([01])-(\d+)$/.exec(key);
 if(match)return base==='Полка '+(+match[4]+1)+(match[3]==='1'?' справа':' слева')+separator+'ниша '+(+match[2]+1);
 match=/^niche-(\d+)-\d+-divider$/.exec(key);
 if(!match)return false;
 return ['для полок','между шуфлядами'].some(kind=>base==='Перегородка '+kind+separator+'секция '+(+match[1]+1));
}

function panelLabel(item,key,g){
 const raw=text(item.name),base=stripPrefix(raw,g);
 if(raw&&raw===base)return raw; // All generator-owned labels carry a cabinet prefix.
 const door=/^door-(?:(lower|upper)-)?(left|right)$/.exec(key);
 if(door){
  const tier=door[1]==='upper'?' верхний':door[1]==='lower'?' нижний':'';
  const original='Фасад'+tier+separator+'петли '+(door[2]==='left'?'слева':'справа');
  if(!base||base===original)return 'Фасад'+tier+(door[2]==='left'?' левый':' правый');
 }
 const drawer=drawerPart.exec(key);
 if(drawer){
  const [,slot,index,part]=drawer,[oldLabel,label]=drawerLabels.get(part);
  const original=oldLabel+separator+'шуфляда '+(+index+1)+separator+'секция '+(sectionOf(+slot)+1);
  if(!base||base===original)return label;
 }
 if(!base)return basicParts.get(key)||'Деталь';
 return /^Корпус\s+ИИ\s*·/i.test(raw)||generatedLabel(key,base,g)?base:raw;
}

function drawerOf(id,group){
 const key=id.slice(group.id.length+1),match=drawerPart.exec(key);
 return match?match[1]+'-'+match[2]:null;
}
function drawerName(key,g){
 const [slot,index]=key.split('-').map(Number),section=sectionOf(slot),level=levelOf(slot);
 const name='Шуфляда '+(index+1);
 if(g.slots.size<2)return name;
 const labels=[name,'секция '+(section+1),'ниша '+(level+1)];
 if(isRightBank(slot)||g.spec&&splitAt(g.spec,section,level)?.kind==='drawers')labels.push(isRightBank(slot)?'справа':'слева');
 return labels.join(separator);
}
function hardwareLabel(row,parts){
 let name=text(row.name);
 // Fitting generators append the name of the board they attach to. AKS rails
 // use the drawer front's name, though their joint IDs point to its side panel.
 for(const part of parts){
  const original=text(part.name);
  if(!original)continue;
  const start=name.indexOf(separator+original);
  if(start>0&&(name.length===start+separator.length+original.length||name.startsWith(separator,start+separator.length+original.length)))
   name=name.slice(0,start);
 }
 if(!name)name=text(row.source_file).split(/[\\/]/).pop().replace(/\.fr3d$/i,'')||'Фурнитура';
 const article=String(row.article??'').trim();
 if(article&&!name.split(/[^\p{L}\p{N}]+/u).includes(article))name+=separator+article;
 return name;
}

export function assignCabinetBlocks(rows,items) {
 const groups=wardrobeGroups(items),byId=new Map();
 for(const g of groups.values())for(const it of g.parts.values()){
  // A joined plinth is one physical board across separate moveable cabinets.
  if(new Set(it.blank_plinth_run||[]).size>1)continue;
  byId.set(it.item_id,g);
 }
 const itemsById=new Map(items.map(it=>[it.item_id,it]));
 let grouped=0;
 for(const row of rows){
  delete row.cabinet_block;
  const ids=[...new Set([row.blank_item_id,row.host_blank_id,row.joined_panel_id,row.shelf_blank_id].filter(Boolean))];
  if(!ids.length)continue;
  const owner=byId.get(ids[0]);
  if(!owner||ids.some(id=>byId.get(id)!==owner)){
   const board=itemsById.get(row.blank_item_id),g=groups.get(board?.assistant_carcass?.group_id);
   if(g&&new Set(board.blank_plinth_run||[]).size>1){
    const label=panelLabel(board,'plinth',g);
    row.name=label==='Цоколь'?'Общий цоколь':label;
   }
   // Cross-cabinet fasteners belong to the model rather than either cabinet.
   if(!row.blank_item_id&&ids.some(id=>byId.has(id)))row.name=hardwareLabel(row,ids.map(id=>itemsById.get(id)).filter(Boolean));
   continue;
  }
  const board=itemsById.get(row.blank_item_id);
  const drawer=drawerOf(ids[0],owner);
  const sameDrawer=drawer&&ids.every(id=>drawerOf(id,owner)===drawer);
  const related=ids.map(id=>itemsById.get(id));
  if(row.aks_kind==='rail'){
   const movingPart=ids.map(id=>drawerOf(id,owner)).find(Boolean);
   const face=movingPart&&owner.parts.get('drawer-'+movingPart+'-face');
   if(face)related.push(face);
  }
  row.name=board?panelLabel(board,row.blank_item_id.slice(owner.id.length+1),owner):hardwareLabel(row,related);
  row.cabinet_block={id:owner.id,name:owner.name,part_name:row.name};
  if(sameDrawer)Object.assign(row.cabinet_block,{drawer_key:drawer,drawer_name:drawerName(drawer,owner)});
  grouped++;
 }
 return grouped;
}
