import {isEdgePull} from './wardrobe-edge-pulls.mjs';
import {sectionWidths,levelOf,isRightBank} from './wardrobe-layout.mjs';
import {nicheOpenings} from './wardrobe-niches.mjs';
import {overlayFronts} from './wardrobe-fronts.mjs';
import {doorZones,drawerSections} from './wardrobe-drawers.mjs';
import {isFacadeProfile,hasFacadeProfiles,planFacadeProfiles} from './wardrobe-facade-profiles.mjs';
export {isFacadeProfile,hasFacadeProfiles};
import catalogue from './wardrobe-handle-catalogue.json' with {type:'json'};

export const doorHardware=catalogue;
export const doorKeyPattern=/^door-(?:(lower|upper)-)?(left|right)$/;
export const doorSide=key=>doorKeyPattern.exec(key)?.[2];
export const doorLabel=key=>{
 const [,row,side]=doorKeyPattern.exec(key)??[];
 return (row==='upper'?'Верхняя ':row==='lower'?'Нижняя ':'')+(side==='right'?'правая':'левая')+' дверь';
};
const edges=['left','right','bottom','top'];
const isVertical=edge=>edge==='left'||edge==='right';
const near=(a,b)=>Math.abs(a-b)<.001;

export function sectionSpans(s){
 let x=0;
 return sectionWidths(s).map((width,i)=>{
  const end=x+width+s.thickness*(1+(i===0?.5:0)+(i===s.sections-1?.5:0));
  const span={left:x,right:end};x=end;return span;
 });
}
function divisionSpan(s,scope){
 const middle=s.sections===2?sectionSpans(s)[0].right:s.width/2;
 return {left:scope==='right'?middle:0,right:scope==='left'?middle:s.width};
}
export function doorShelfOptions(s,scope='all'){
 const span=divisionSpan(s,scope),sections=sectionSpans(s);
 const active=sections.map((bounds,i)=>({...bounds,i})).filter(b=>b.left<span.right&&b.right>span.left);
 if(!active.length)return [];
 const boards=active.map(({i})=>nicheOpenings(s,i).slice(0,-1).map((r,j)=>{
   const isBoard=(s.shelfChoices?.[i]?.[j]??'board/95388').startsWith('board/');
   return isBoard?{section:i,shelf:j,y:r.top}:null;
 }).filter(Boolean));
 return boards[0].flatMap(first=>{
   const matches=boards.map(row=>row.find(b=>near(b.y,first.y)));
   return matches.every(Boolean)?[{...span,y:first.y,matches}]:[];
 });
}
export function doorAnchorIndex(s,section){
 const d=s.front?.division;if(!d)return -1;
 if(d.section===section)return d.shelf;
 const span=divisionSpan(s,d.scope),bay=sectionSpans(s)[section];
 if(!bay||bay.left>=span.right||bay.right<=span.left)return -1;
 const anchor=nicheOpenings(s,d.section)[d.shelf];
 if(!anchor)return -1;
 return nicheOpenings(s,section).slice(0,-1).findIndex(r=>near(r.top,anchor.top));
}
export function anchoredShelf(s){
 const d=s.front?.division;if(!d)return null;
 const selected=doorShelfOptions(s,d.scope).find(row=>row.matches.some(b=>b.section===d.section&&b.shelf===d.shelf));
 if(!selected)throw Error('Для стыка выберите полку из ЛДСП на одной высоте по всей ширине этих дверей.');
 return selected;
}
export function secureDoorShelf(s){
 const d=s.front?.division;if(!d)return;
 const selected=anchoredShelf(s);
 const rows=Array.from({length:s.sections},(_,i)=>Array.from({length:s.sectionShelves?.[i]??s.shelves},(_,j)=>s.shelfChoices?.[i]?.[j]??'board/95388'));
 for(const {section,shelf} of selected.matches)if(!['board/confirmat','board/cam_dowel'].includes(rows[section][shelf]))rows[section][shelf]='board/'+(s.drawerFixing??'cam_dowel');
 s.shelfChoices=rows;
}
function legacyProfiles(s){
 const f=s.front;if(!f)return [];
 const profiles=[];
 if(f.topProfile)profiles.push({article:'118124',left:0,right:s.width,top:s.height,cutTop:s.height,cutBottom:s.height-57,kind:'L'});
 if(f.division?.gola){
  const d=f.division,anchor=anchoredShelf(s);
  if(d.above==='open'||d.below==='open')throw Error('Для профиля S выберите фасады сверху и снизу.');
  if(d.scope!=='all'&&!sectionSpans(s).slice(0,-1).some(b=>near(b.right,d.scope==='left'?anchor.right:anchor.left)))throw Error('Для окончания профиля S внутри шкафа нужна опорная стойка на стыке дверей.');
  const mid=anchor.y+s.thickness/2,height=d.cutHeight??74;
  if(![73,74].includes(height))throw Error('Высота выреза среднего профиля должна быть 73 или 74 мм.');
  profiles.push({article:'118129',left:anchor.left,right:anchor.right,top:mid+36.5,cutTop:mid+height/2,cutBottom:mid-height/2,kind:'S'});
 }
 return profiles;
}
export function usesProfileEdge(f,key,edge){
 if(f?.topProfile&&edge==='top'&&!key.startsWith('door-lower-'))return true;
 return !!f?.division?.gola&&(key.startsWith('door-lower-')&&edge==='top'||key.startsWith('door-upper-')&&edge==='bottom');
}
const meetingEdge=(f,key,edge)=>catalogue[f.handles?.[key]?.article]?.family==='monblan'&&f.handles[key].edge===edge;
function bandLeaves(f,row,swing,a,b,low,high,center){
 const key=side=>'door-'+(row?row+'-':'')+side;
 if(swing==='open')return [];
 if(swing!=='pair')return [{key:key(swing),side:swing,left:a,right:b,low,high,row}];
 const gap=meetingEdge(f,key('left'),'right')&&meetingEdge(f,key('right'),'left')?4:3;
 return [{key:key('left'),side:'left',left:a,right:center-gap/2,low,high,row},
         {key:key('right'),side:'right',left:center+gap/2,right:b,low,high,row}];
}
export function baseWardrobeDoors(s,banks=[]){
 const f=s.front;if(!f)return [];
 const divisions=f.division;
 const roof=f.topProfile?s.height-30:s.height-1.5;
 if(!divisions){
  const sides=f.swing==='pair'?['left','right']:[f.swing];
  const rows=doorZones(s,overlayFronts(s,sides.length),banks);
  const enlarged=sides.length===2&&meetingEdge(f,'door-left','right')&&meetingEdge(f,'door-right','left');
  return rows.map((l,i)=>({...l,key:'door-'+sides[i],side:sides[i],left:l.left+(enlarged&&i===1?.5:0),width:l.width-(enlarged?.5:0),height:l.height-(s.height-1.5-roof)})).filter(l=>l.height>0);
 }
 const d=divisions,anchor=anchoredShelf(s),mid=anchor.y+s.thickness/2,partial=d.scope!=='all';
 if(partial&&[d.below,d.above].some(mode=>mode!=='open'&&mode!==d.scope))throw Error('Для разделённой створки выберите петли у наружной боковины.');
 const center=s.sections===2?sectionSpans(s)[0].right:s.width/2;
 const a=anchor.left+1.5,b=anchor.right-1.5;
 const below=bandLeaves(f,'lower',d.below,a,b,1.5,mid,center);
 const above=bandLeaves(f,'upper',d.above,a,b,mid,roof,center);
 const overlap=(p,q)=>p.left<q.right&&q.left<p.right;
 for(const [band,other,edge,opposite] of [[below,above,'top','bottom'],[above,below,'bottom','top']])for(const p of band){
  const covered=other.filter(q=>overlap(q,p));
  const both=meetingEdge(f,p.key,edge)&&covered.some(q=>meetingEdge(f,q.key,opposite));
  const clearance=d.gola?15:covered.length?(both?2:1.5):-(s.thickness/2-1.5);
  if(edge==='top')p.high=mid-clearance;else p.low=mid+clearance;
 }
 const other=d.scope==='left'?'right':'left';
 const full=partial?bandLeaves(f,'',other,other==='left'?1.5:center+1.5,other==='left'?center-1.5:s.width-1.5,1.5,roof,center):[];
 if(partial){
  const tall=full[0],edge=other==='left'?'right':'left',opposite=other;
  if(meetingEdge(f,tall.key,edge)&&[...below,...above].some(p=>meetingEdge(f,p.key,opposite))){
   if(other==='left')tall.right-=.5;else tall.left+=.5;
   for(const p of [...below,...above]){if(other==='left')p.left+=.5;else p.right-=.5;}
  }
 }
 return [...below,...above,...full].map(p=>{
   const ext=banks.filter(bank=>bank&&!bank.internal&&bank.left+s.width/2<p.right&&bank.right+s.width/2>p.left&&bank.base<p.high&&bank.top>p.low);
   const bottom=Math.max(p.low,...ext.map(bank=>bank.top+1.5));
   return {key:p.key,side:p.side,left:p.left,bottom,width:p.right-p.left,height:p.high-bottom};
 }).filter(p=>p.height>0);
}

// A saved assembly and its blanks share the same spec. Cache only the installation runs;
// the questionnaire computes a fresh layout whenever an input changes.
const installedRuns=new WeakMap();
export function facadeLayout(s,banks){
 const doors=baseWardrobeDoors(s,banks),legacy=legacyProfiles(s);
 if(!hasFacadeProfiles(s))return {doors,banks,runs:legacy};
 const {runs,bounds,boxLimits}=planFacadeProfiles(s,doors,drawerFacades(s,banks),banks,sectionSpans(s),legacy);
 const adjusted=doors.map(d=>{
  const b=bounds.get(d.key);if(!b)return d;
  const bottom=b.bottom??d.bottom;return {...d,bottom,height:(b.top??(d.bottom+d.height))-bottom};
 });
 const fitted=banks.map(bank=>bank&&({...bank,faces:bank.faces.map((f,i)=>{
  const key='drawer-'+bank.slot+'-'+i+'-face',b=bounds.get(key),box=boxLimits.get(key);
  if(!b&&!box)return f;
  const y=b?.bottom??f.y;
  return {...f,y,height:Math.round(((b?.top??(f.y+f.height))-y)*1000)/1000,
   ...(box!=null?{boxTop:box}:{})};
 })}));
 installedRuns.set(s,{stamp:JSON.stringify(s),runs});return {doors:adjusted,banks:fitted,runs};
}
export function physicalProfiles(s){
 if(!hasFacadeProfiles(s))return legacyProfiles(s);
 const cached=installedRuns.get(s);
 return cached?.stamp===JSON.stringify(s)?cached.runs:facadeLayout(s,drawerSections(s,sectionWidths(s))).runs;
}
export function wardrobeDoors(s,banks=[]){
 return hasFacadeProfiles(s)?facadeLayout(s,drawerSections(s,sectionWidths(s))).doors:baseWardrobeDoors(s,banks);
}

export function drawerFacadeKey(key){
 const m=/^drawer-(\d+)-(\d+)-face$/.exec(key);
 return m?{slot:Number(m[1]),index:Number(m[2])}:null;
}
export function drawerFacades(s,banks){
 return banks.flatMap(bank=>bank?bank.faces.map((face,index)=>({
  key:'drawer-'+bank.slot+'-'+index+'-face',slot:bank.slot,index,
  label:'Шуфляда '+(index+1)+' · секция '+(bank.section+1)+' · ниша '+(levelOf(bank.slot)+1)+(isRightBank(bank.slot)?' справа':''),
  left:face.x+s.width/2-face.width/2,bottom:face.y,width:face.width,height:face.height,internal:bank.internal
 })):[]);
}
export function checkDrawerHandle(face,h,leaves){
 const placement=handlePlacement(face,h);
 if(!placement||!face.internal)return;
 const cx=face.left+placement.x,cy=face.bottom+placement.y,half=placement.part.length/2;
 const across=placement.back?16.9:6,x=placement.vertical?across:half,y=placement.vertical?half:across;
 if(leaves.some(d=>cx+x>d.left&&cx-x<d.left+d.width&&cy+y>d.bottom&&cy-y<d.bottom+d.height)){
  throw Error('Ручка внутренней шуфляды упирается в закрытую дверь. Выберите «Без отдельной ручки» или открытый проём.');
 }
}

export function handlePlacement(door,setting){
 if(!setting||isFacadeProfile(setting)||isEdgePull(setting))return null;
 const part=catalogue[setting.article];
 if(!part||!['ak700','monblan'].includes(part.family)||!edges.includes(setting.edge)||!['center','start','end'].includes(setting.from))throw Error('Проверьте артикул и положение ручки.');
 const edge=setting.edge,vertical=isVertical(edge),ak=part.family==='ak700';
 const span=vertical?door.height:door.width,other=vertical?door.width:door.height;
 const offset=setting.offset??0,inset=ak?(setting.inset??50):0;
 if(![offset,inset].every(v=>Number.isFinite(v)&&v>=0&&v<=3000))throw Error('Проверьте отступы ручки в миллиметрах.');
 const half=(ak?part.pitch:part.length)/2;
 let along=setting.from==='center'?span/2:offset+half;
 if(setting.from==='end')along=span-along;
 if(along-part.length/2<-.001||along+part.length/2>span+.001||(ak&&(inset<6||inset>other-6)))throw Error('Ручка выходит за край фасада. Уменьшите длину или измените отступ.');
 const x=vertical?(edge==='left'?inset:door.width-inset):along;
 const y=vertical?along:(edge==='bottom'?inset:door.height-inset);
 const angle=ak?(vertical?90:0):({top:0,bottom:180,left:90,right:-90})[edge];
 return {x,y,angle,back:!ak,edge,vertical,part,article:setting.article};
}
export function mirrorHandle(setting){
 const flip={left:'right',right:'left',top:'top',bottom:'bottom'};
 if(isEdgePull(setting))return {...setting,edge:flip[setting.edge]};
 const from=!isVertical(setting.edge)?({start:'end',end:'start',center:'center'})[setting.from]:setting.from;
 return {...setting,edge:flip[setting.edge],from};
}


export function orientHandle(leaf,setting,axis){
 const current=handlePlacement(leaf,setting),vertical=axis==='vertical';
 if(!current||current.part.family!=='ak700'||current.vertical===vertical)return setting;
 const {width:w,height:h}=leaf,pitch=current.part.pitch;
 let {x,y}=current;
 const centered=leaf.slot!=null;
 const high=!leaf.key?.includes('upper-');
 // A door turns the handle around the fixing nearest its opening corner.
 if(!centered){
  if(current.vertical)y+=(setting.from==='center'?high:setting.from==='end')?pitch/2:-pitch/2;
  else x+=(setting.from==='center'?leaf.side==='left':setting.from==='end')?pitch/2:-pitch/2;
 }
 const edge=vertical?(x<=w/2?'left':'right'):(y<=h/2?'bottom':'top');
 const span=vertical?h:w,along=vertical?y:x;
 const inset=edge==='left'?x:edge==='right'?w-x:edge==='top'?h-y:y;
 const from=along<=span/2?'start':'end';
 const distance=from==='start'?along:span-along;
 const candidate={...setting,edge,inset,from,offset:distance-(centered?pitch/2:0)};
 if(centered&&Math.abs(along-span/2)<.001){candidate.from='center';candidate.offset=0;}
 if(candidate.offset<0)throw Error('Для этого поворота не хватает места на фасаде. Выберите меньшую скобу или измените её положение.');
 handlePlacement(leaf,candidate);
 return candidate;
}
