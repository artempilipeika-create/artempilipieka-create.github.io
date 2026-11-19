import {isEdgePull,installedEdgePull} from './wardrobe-edge-pulls.mjs';
import {localPoint,worldPoint} from './blank-bindings.mjs';
import {doorHardware,doorSide,drawerFacadeKey,handlePlacement,hasFacadeProfiles,physicalProfiles,sectionSpans} from './wardrobe-door-layout.mjs';

export function doorHandle(item){
 const group=item.assistant_carcass;
 if(item.blank_axis!=='front')return null;
 if(isEdgePull(item.blank_edge_pull))return installedEdgePull(item,item.blank_edge_pull);
 if(!group)return null;
 const key=item.item_id.slice(group.group_id.length+1);
 const face=drawerFacadeKey(key);
 const setting=face?group.spec.drawerBanks?.[face.slot]?.faces[face.index]?.handle:doorSide(key)&&group.spec.front?.handles?.[key];
 return isEdgePull(setting)?installedEdgePull(item,setting):handlePlacement(item,setting);
}
function cabinetFrame(item,items){
 const g=item.assistant_carcass,s=g?.spec;
 if(!s||!s.front?.topProfile&&!s.front?.division?.gola&&!hasFacadeProfiles(s))return null;
 const left=items.find(p=>p.item_id===g.group_id+':left'),top=items.find(p=>p.item_id===g.group_id+':top');
 if(!left||!top)return null;
 const at=localPoint(left,item.rotation);
 return {x:at.x-left.width/2,y:top.elevation_mm-s.height+s.thickness,z:at.z+left.depth/2,s};
}
export function panelProfiles(item,items){
 const g=item.assistant_carcass;
 if(!g||item.item_id!==g.group_id+':top')return [];
 const frame=cabinetFrame(item,items);if(!frame)return [];
 const roof=localPoint(item,item.rotation);
 return physicalProfiles(frame.s).map(run=>{
  const x=frame.x+run.left-roof.x,span=run.right-run.left,t=frame.s.thickness;
  const left=run.leftMargin??(run.left===0?t:t/2),right=run.rightMargin??(run.right===frame.s.width?t:t/2);
  return {...run,x,y:frame.y+run.top-item.elevation_mm,z:frame.z-roof.z-(run.inset??0),span,
   mountX:x+left,mountSpan:span-left-right,mountDepth:run.kind==='L'?26.8:26.899};
 });
}
export function boardProfileCuts(item,items){
 const g=item.assistant_carcass;
 if(item.blank_axis!=='side'||!g||! /^(?:left|right|divider-\d+|niche-\d+-\d+-divider)$/.test(item.item_id.slice(g.group_id.length+1)))return [];
 const frame=cabinetFrame(item,items);if(!frame)return [];
 const p=localPoint(item,item.rotation),x=p.x-frame.x;
 const cuts=[];
 for(const run of physicalProfiles(frame.s)){
  const depth=27+(run.inset??0)-(frame.z-p.z-item.depth/2);
  if(depth<=0||x+item.width/2<=run.left||x-item.width/2>=run.right)continue;
  const rawHigh=frame.y+run.cutTop-item.elevation_mm,rawLow=frame.y+run.cutBottom-item.elevation_mm;
  if(rawHigh<=0||rawLow>=item.height)continue;
  const low=Math.max(0,rawLow),high=Math.min(item.height,rawHigh);
  cuts.push({kind:run.kind,low,high,rawLow,rawHigh,depth,roundLow:low===rawLow&&low>0,roundHigh:run.kind==='S'&&high===rawHigh&&high<item.height});
 }
 return cuts.sort((a,b)=>a.low-b.low);
}
// Front edge traced from bottom to top. x is local depth from the back of the panel.
export function golaOutline(width,height,cuts){
 const outline=[],radius=5;
 const line=(x,y,a,b,edge=-1)=>{
  if(Math.hypot(a-x,b-y)>1e-8)outline.push({line:[x,y,a,b],edge});
 };
 const vertical=(x,low,high,edge=-1)=>{
  const a=Math.max(0,low),b=Math.min(height,high);
  if(b>a)line(x,a,x,b,edge);
 };
 const horizontal=(x,a,y)=>{if(y>0&&y<height)line(x,y,a,y);};
 const fillet=(cx,cy,lo,hi)=>{
  const a=Math.max(lo,0),b=Math.min(hi,height);if(b<=a)return;
  const angle=y=>Math.asin(Math.max(-1,Math.min(1,(y-cy)/radius)));
  const point=t=>[cx-radius*Math.cos(t),cy+radius*Math.sin(t)];
  const start=angle(a),end=angle(b);
  outline.push({arc:[...point(start),...point((start+end)/2),...point(end)],edge:-1});
 };
 let last=-Infinity;
 for(const c of cuts){
  const {depth,rawLow:lo,rawHigh:hi,kind}=c;
  if(![depth,lo,hi].every(Number.isFinite)||depth<=0||depth>=width||
     !(kind==='S'&&[73,74].includes(hi-lo)||kind==='L'&&hi-lo===57)||lo<last)throw Error('Проверьте вырезы Gola на стойке.');
  const back=width-depth,cx=back+radius;
  const offset=depth<radius?radius-Math.sqrt(radius*radius-(radius-depth)**2):0;
  vertical(width,last,lo+offset,0);
  horizontal(width,Math.min(cx,width),lo);
  fillet(cx,lo+radius,lo+offset,lo+radius);
  if(kind==='S'){
   vertical(back,lo+radius,hi-radius);
   fillet(cx,hi-radius,hi-radius,hi-offset);
   horizontal(Math.min(cx,width),width,hi);
   last=hi-offset;
  }else{
   vertical(back,lo+radius,hi);horizontal(back,width,hi);last=hi;
  }
 }
 vertical(width,last,height,0);
 const values=s=>s.line??s.arc;
 const first=values(outline[0]),end=values(outline[outline.length-1]);
 outline.unshift({line:[0,0,first[0],first[1]],edge:2});
 line(end[end.length-2],end[end.length-1],0,height,3);line(0,height,0,0,1);
 return outline;
}
function shelfGripCuts(runs,left,width,depth,front,low,height){
 const areas=[];
 for(const r of runs){
  if(low>=r.cutTop||low+height<=r.cutBottom)continue;
  const a=Math.max(0,r.left-left),b=Math.min(width,r.right-left);
  if(b<=a)continue;
  const mount=(r.faces||r.kind==='S')&&low<r.top-31&&low+height>r.top-43;
  const recess=front+(r.inset??0)+(mount?74:27);
  if(recess>0)areas.push({a,b,depth:recess});
 }
 const stops=[...new Set(areas.flatMap(p=>[p.a,p.b]))].sort((a,b)=>a-b),result=[];
 for(let i=1;i<stops.length;i++){
  const a=stops[i-1],b=stops[i],recess=Math.max(0,...areas.filter(p=>p.a<b&&p.b>a).map(p=>p.depth));
  if(!recess)continue;
  if(recess>=depth)throw Error('Полке не хватает глубины за профилем Gola.');
  const previous=result.at(-1);
  if(previous?.depth===recess&&previous.b===a)previous.b=b;else result.push({a,b,depth:recess});
 }
 return result;
}
export function horizontalProfileCuts(item,items){
 const g=item.assistant_carcass;
 if(item.blank_binding?.gola_flush||item.blank_axis!=='horizontal'||!g||! /^(?:top|bottom|shelf-.+)$/.test(item.item_id.slice(g.group_id.length+1)))return [];
 const frame=cabinetFrame(item,items);if(!frame)return [];
 const at=localPoint(item,item.rotation);
 return shelfGripCuts(physicalProfiles(frame.s),at.x-frame.x-item.width/2,item.width,item.depth,
  at.z+item.depth/2-frame.z,item.elevation_mm-frame.y,item.height);
}
export function gripShelfOutline(depth,width,cuts){
 const points=[[0,0]];
 let end=0;
 for(const c of cuts){
  if(![c.a,c.b,c.depth].every(Number.isFinite)||c.a<end||c.b<=c.a||c.b>width||c.depth<=0||c.depth>=depth)throw Error('Вырез Gola выходит за границы полки.');
  if(c.a>end){points.push([depth,end],[depth,c.a]);}
  points.push([depth-c.depth,c.a],[depth-c.depth,c.b]);end=c.b;
 }
 if(end<width)points.push([depth,end],[depth,width]);
 points.push([0,width]);
 return points.flatMap(([x,y],i)=>{
  const [a,b]=points[(i+1)%points.length];if(x===a&&y===b)return [];
  return [{line:[x,y,a,b],edge:x===depth&&a===depth?0:x===0&&a===0?1:y===0&&b===0?2:y===width&&b===width?3:-1}];
 });
}
export function clearProfileShelves(s,parts,legHeight){
 const runs=physicalProfiles(s);if(!runs.length)return;
 for(const {item} of parts){
  if(item.blank_axis!=='horizontal'||item.blank_binding?.gola_flush)continue;
  const y=item.elevation_mm-s.elevation-legHeight,x=item.x+s.width/2;
  const front=item.z+item.depth/2,back=item.z-item.depth/2;
  const cuts=shelfGripCuts(runs,x-item.width/2,item.width,item.depth,front-s.depth/2,y,item.height);
  if(!cuts.length)continue;
  const rectangular=cuts.length===1&&cuts[0].a===0&&cuts[0].b===item.width;
  if(!rectangular&&(!item.blank_shelf||item.blank_shelf.startsWith('board/')))continue;
  const limit=front-Math.max(...cuts.map(c=>c.depth));
  if(front<=limit)continue;
  if(item.blank_shelf&&/board\/(cam_dowel|confirmat)/.test(item.blank_shelf)){
   const minimum=item.blank_shelf==='board/cam_dowel'?216:152;
   if(limit-back<minimum)throw Error('Полка за Gola слишком короткая по глубине для выбранного крепежа.');
  }
  item.depth=item.blank_width_mm=limit-back;
  item.z=(limit+back)/2;
  if(item.blank_binding)item.blank_binding.depth_offset_mm+=(limit-front)/2;
 }
}
// Inspect the actual support blanks, including short posts and 18 mm spacers.
export function verifyProfileSupports(s,parts,runs,floor){
 for(const r of runs){
  if(!r.leftKey)continue;
  const y=floor+r.top-31,z=s.depth/2-(r.inset??0)-(r.kind==='L'?26.8:26.899);
  for(const key of [r.leftKey,r.rightKey]){
   const host=parts.find(p=>p.key===key)?.item;
   if(!host||host.elevation_mm>y-12||host.elevation_mm+host.height<y||
      host.z-host.depth/2>z-47||host.z+host.depth/2<z-9)
    throw Error('Уголок Gola выходит за опорную стойку. Выберите другую кромку или продолжите стойку до линии профиля.');
  }
 }
}
export function nativeDoorHardware(items){
 const result=[];
 for(const item of items){
  const g=item.assistant_carcass;if(!g?.spec&&!item.blank_edge_pull)continue;
  const rotation=item.rotation||0,p=localPoint(item,rotation);
  const hardware=doorHandle(item);
  if(hardware){
   const h=hardware,at={x:p.x-item.width/2+h.x,z:p.z+(h.back?-1:1)*item.depth/2};
   result.push({name:(h.edgePull?'Врезная ручка-профиль AKS '+h.article:h.back?'Торцевая ручка MONBLAN':'Ручка-скоба AK700')+' · '+item.name,wardrobe_handle:true,...(h.edgePull?{wardrobe_edge_pull:true,span_mm:h.span}:{}),article:h.article,source_file:h.part.file,source_sha256:h.part.sha,
    host_blank_id:item.item_id,joined_panel_id:item.item_id,rotation,handle_roll_deg:h.angle,edge:h.edge,position:{...worldPoint(at,rotation),y:item.elevation_mm+h.y},elastic_resize:false});
  }
  for(const run of panelProfiles(item,items)){
   const product=doorHardware[run.article],bracket=doorHardware['118236'];
   const supports=sectionSpans(g.spec).slice(0,-1);
   const divider=x=>':divider-'+supports.findIndex(s=>Math.abs(s.right-x)<.001);
   const host_blank_id=g.group_id+(run.leftKey?':'+run.leftKey:run.left===0?':left':divider(run.left));
   const joined_panel_id=g.group_id+(run.rightKey?':'+run.rightKey:run.right===g.spec.width?':right':divider(run.right));
   result.push({name:'Профиль Gola '+run.kind+' · '+run.span+' мм',wardrobe_profile:true,article:run.article,source_file:product.file,source_sha256:product.sha,
    host_blank_id,joined_panel_id,rotation,span_mm:run.span,position:{...worldPoint({x:p.x+run.x,z:p.z+run.z},rotation),y:item.elevation_mm+run.y},elastic_resize:false});
   result.push({name:'Два уголка крепления профиля Gola '+run.kind+' · AKS 118236',wardrobe_gola_mount:true,article:'118236',source_file:bracket.file,source_sha256:bracket.sha,
    host_blank_id,joined_panel_id,rotation,span_mm:run.mountSpan,position:{...worldPoint({x:p.x+run.mountX,z:p.z+run.z-run.mountDepth},rotation),y:item.elevation_mm+run.y-31},elastic_resize:false});
  }
 }
 return result;
}
