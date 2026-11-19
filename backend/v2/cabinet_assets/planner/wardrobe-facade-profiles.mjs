import {isEdgePull} from './wardrobe-edge-pulls.mjs';
import {levelOf,isRightBank,splitAt} from './wardrobe-layout.mjs';
import catalogue from './wardrobe-handle-catalogue.json' with {type:'json'};
import {nicheOpenings,mm} from './wardrobe-niches.mjs';

export const isFacadeProfile=h=>h?.article==='118124'||h?.article==='118129';
export const hasFacadeProfiles=s=>Object.values(s.front?.handles??{}).some(isFacadeProfile)||Object.values(s.front?.edgeProfiles??{}).some(v=>v.length)||
 (s.drawerBanks??[]).some(b=>b?.faces.some(f=>isFacadeProfile(f.handle)));
const overlaps=(a,b,c,d)=>Math.min(b,d)-Math.max(a,c)>.01;
const end=r=>r.bottom+r.height;
const across=(a,b)=>overlaps(a.left,a.left+a.width,b.left,b.left+b.width);
const setting=(s,r)=>r.slot==null?s.front?.handles?.[r.key]:s.drawerBanks[r.slot].faces[r.index].handle;

function supports(s,r,bays,banks){
 const t=s.thickness;
 const primary=bays.slice(0,-1).map((b,i)=>({x:b.right,key:'divider-'+i,thick:t}));
 const outer=[{x:0,key:'left',thick:2*t},...primary,{x:s.width,key:'right',thick:2*t}];
 if(r.slot==null){
  const first=outer.filter(v=>v.x<=r.left+.01).at(-1),last=outer.find(v=>v.x>=r.left+r.width-.01);
  return {first,last};
 }
 const b=banks[r.slot],i=b.section,level=levelOf(b.slot),shared=splitAt(s,i,level)?.kind==='drawers';
 let first=outer[i],last=outer[i+1];
 if(shared){
  const key='niche-'+i+'-'+level+'-divider';
  if(isRightBank(b.slot))first={x:s.width/2+b.left-9,key,thick:18};
  else last={x:s.width/2+b.right+9,key,thick:18};
 }
 if(b.internal){
  // Internal profiles finish flush against their stationary supports behind the doors.
  first={x:s.width/2+b.left+b.spacerL,key:b.spacerL?'drawer-'+b.slot+'-spacer-left':first.key,thick:0};
  last={x:s.width/2+b.right-b.spacerR,key:b.spacerR?'drawer-'+b.slot+'-spacer-right':last.key,thick:0};
 }
 return {first,last};
}
function neighbours(row,edge,rows){
 const top=edge==='top',y=top?end(row):row.bottom;
 const candidates=rows.filter(q=>q!==row&&!!q.internal===!!row.internal&&across(row,q))
  .map(q=>({q,gap:mm(top?q.bottom-y:y-end(q))})).filter(({gap})=>gap>=0);
 if(!candidates.length)return [];
 const nearest=Math.min(...candidates.map(p=>p.gap));
 return candidates.filter(({q,gap})=>{
  if(gap!==nearest)return false;
  if(row.slot!=null&&row.slot===q.slot&&Math.abs(q.index-row.index)===1)return true;
  // Large empty niches separate independent fronts. A fixed shelf can provide the L datum there.
  return gap<=30.001;
 }).map(p=>p.q);
}
export function profileEdges(row,rows){
 return ['top','bottom'].filter(edge=>neighbours(row,edge,rows).length);
}
export function planFacadeProfiles(s,doors,drawerRows,banks,bays,legacy){
 const rows=[...doors,...drawerRows],runs=legacy.map(r=>({...r})),bounds=new Map(),boxLimits=new Map();
 const profiles=rows.flatMap(r=>[setting(s,r),...(s.front?.edgeProfiles?.[r.key]??[])].filter(isFacadeProfile).map(h=>({r,h})));
 const bound=(r,edge,value)=>{
  const b=bounds.get(r.key)??{};const previous=b[edge];value=mm(value);
  if(previous!=null&&Math.abs(previous-value)>.001)throw Error('Соседние профили задают разную высоту одной кромки фасада.');
  b[edge]=value;bounds.set(r.key,b);
 };
 const install=(run)=>{
  for(let i=runs.length-1;i>=0;i--){
   const q=runs[i];
   if((q.inset??0)!==run.inset||run.cutBottom>=q.cutTop||run.cutTop<=q.cutBottom)continue;
   const shared=run.leftKey===q.rightKey||run.rightKey===q.leftKey;
   if(!shared&&(q.right<run.left||q.left>run.right))continue;
   if(Math.abs(q.top-run.top)>.001||q.kind!==run.kind||Math.abs(q.cutTop-run.cutTop)>.001){
    if(overlaps(q.left,q.right,run.left,run.right)||shared&&Math.abs(q.top-run.top)<12)throw Error('На одном стыке фасадов выбраны несовместимые профили Gola.');
    continue;
   }
   if(q.left<run.left)Object.assign(run,{left:q.left,leftKey:q.leftKey,leftMargin:q.leftMargin});
   if(q.right>run.right)Object.assign(run,{right:q.right,rightKey:q.rightKey,rightMargin:q.rightMargin});
   run.faces=[...new Set([...run.faces,...(q.faces??[])])];
   runs.splice(i,1);
  }
  runs.push(run);
 };
 for(const {r,h} of profiles){
  const L=h.article==='118124',top=h.edge==='top';
  if(!top&&(L||h.edge!=='bottom'))throw Error('Для Gola L выберите верхнюю кромку. Средний Gola S ставится между фасадами.');
  const next=neighbours(r,h.edge,rows);
  if(!L&&!next.length)throw Error('Для Gola S выберите кромку на стыке двух фасадов. Для верхней кромки в открытой нише подходит Gola L.');
  const ownEdge=top?end(r):r.bottom,other=next.length?(top?next[0].bottom:end(next[0])):null;
  let datum;
  if(L){
   if(next.some(q=>{const h=setting(s,q);return h?.edge==='bottom'&&(catalogue[h.article]?.family==='monblan'||isEdgePull(h));}))throw Error('На нижней кромке встречного фасада стоит торцевая ручка. Перенесите ручку или выберите другой стык.');
   if(other!=null)datum=other;
   else if(r.slot!=null&&r.index===banks[r.slot].faces.length-1){
    const b=banks[r.slot],opening=nicheOpenings(s,b.section)[levelOf(b.slot)];
    datum=s.drawerBanks[r.slot].layout?(b.internal?opening.top:opening.overlayTop):b.top;
   }else if(r.key.startsWith('door-lower-'))datum=end(r)+1.5;
   else datum=s.height;
   bound(r,'top',datum-30);
  }else{
   datum=(ownEdge+other)/2;
   // Keep joint datums on a 0.5 mm grid so adjoining hinged fronts remain manufacturable.
   datum=Math.round(datum*2)/2;
   if(r.slot!=null&&next.every(q=>q.slot===r.slot)){
    const upper=top?next[0]:r,upperBox=banks[upper.slot].faces[upper.index];
    // The seam between sliding fronts is free. Keep both original runner heights
    // and put the top lip at least 1 mm below the upper drawer's HDF bottom.
    datum=Math.min(datum,upperBox.boxY-40.5);
   }
   // A single unbroken opposing drawer front can meet two side-by-side doors.
   for(const peer of rows)if(!!peer.internal===!!r.internal&&Math.abs((top?end(peer):peer.bottom)-ownEdge)<.001&&
      next.some(q=>across(q,peer)))bound(peer,h.edge,datum+(top?-15:15));
   for(const q of next)bound(q,top?'bottom':'top',datum+(top?15:-15));
  }
  const {first,last}=supports(s,r,bays,banks),height=L?57:h.cutHeight??74;
  if(!L&&![73,74].includes(height))throw Error('Выберите вырез Gola S высотой 73 или 74 мм.');
  install({article:h.article,kind:L?'L':'S',left:first.x,right:last.x,leftKey:first.key,rightKey:last.key,leftMargin:first.thick/2,rightMargin:last.thick/2,
   inset:r.internal?21:0,top:L?datum:datum+36.5,cutTop:L?datum:datum+height/2,cutBottom:L?datum-57:datum-height/2,
   faces:[r.key,...(L?[]:next.map(q=>q.key))]});
 }
 for(const r of rows){
  const b=bounds.get(r.key),h=setting(s,r);
  if(b&&h&&b[h.edge]!=null&&(catalogue[h.article]?.family==='monblan'||isEdgePull(h))){
   // Edge pulls wrap behind the front and cannot occupy the exposed Gola grip.
   throw Error('На выбранном стыке уже стоит торцевая ручка '+(isEdgePull(h)?'AKS '+h.article:'MONBLAN')+'. Перенесите её на другую кромку.');
  }
  if(!b)continue;
  const low=b.bottom??r.bottom,high=b.top??end(r);
  if(high-low<(r.slot!=null?100:1))throw Error('Для Gola не хватает высоты фасада. Увеличьте высоту ниши или уменьшите число шуфляд.');
 }
 for(const r of drawerRows){
  const f=banks[r.slot].faces[r.index],bareBottom=r.bottom,bareTop=end(r);
  let cap=Infinity;
  for(const p of runs){
   if(!p.faces||!overlaps(r.left,r.left+r.width,p.left,p.right))continue;
   // An outer Gola also lies in the travel path of a drawer on the recessed plane.
   if((r.internal?21:0)<(p.inset??0))continue;
   const hi=p.top,lo=p.top-(p.kind==='L'?57:73);
   if(bareBottom>=hi||bareTop<=lo)continue;
   if(r.internal&&!p.inset){
    const moved=bounds.get(r.key);
    if(overlaps(moved?.bottom??bareBottom,moved?.top??bareTop,lo,hi))throw Error('Наружный профиль Gola перекрывает ход внутренней шуфляды '+(r.index+1)+'. Выберите другую кромку.');
   }
   const centre=(bareBottom+bareTop)/2;
   if(centre<(hi+lo)/2)cap=Math.min(cap,Math.floor(lo-1));
   else if(f.boxY-3<hi+1)throw Error('Профиль Gola пересекает дно шуфляды '+(r.index+1)+' в секции '+(banks[r.slot].section+1)+'. Выберите другую кромку.');
  }
  if(Number.isFinite(cap))boxLimits.set(r.key,cap);
 }
 return {runs,bounds,boxLimits};
}
