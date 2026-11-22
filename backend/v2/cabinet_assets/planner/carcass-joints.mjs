import {horizontalProfileCuts} from './wardrobe-door-hardware.mjs';
import {backTrim} from './panel-machining.mjs';
import {anchoredShelf,hasFacadeProfiles} from './wardrobe-door-layout.mjs';
import {nicheSlot} from './wardrobe-layout.mjs';
import {localBaseShelf} from './wardrobe-layout.mjs';
import {localPoint,worldPoint,shelfBearing} from './blank-bindings.mjs';

import {fixedShelfScheme} from './shelf-choices.mjs';
import {shelfSupportPlan} from './sekura.mjs';
export const jointOptions = {
  none: 'Без крепежа',
  confirmat: 'Конфирмат 7×50',
  cam_dowel: 'Эксцентрик + шкант 8×35'
};
export const fittings = {
  confirmat: ['Конфермат.fr3d','af876819d041ee19ab0217cc9d266210c70480206a1de1652847c12d7af65783'],
  cam: ['Эксцентриковая Стяжка.fr3d','0f16c55b1530f9e49d3208b7e5b17d58076c491658bd01d5a3110850da36291c'],
  dowel: ['Шкант.fr3d','9b2679f72e617fd3eb989d95f65b5c2f5ac979380e2963d8cb272228597f6589']
};
const shelfConfirmats = {
  16: ['MF_confirmat_7x50_side_16.fr3d','fcb9117249ea0270cdb9bf4e9fb0a7a1396a4d567fe66413743b1d3ae174551c'],
  25: ['MF_confirmat_7x50_side_25.fr3d','4a150593daa0c051c43999785038ee084a2f38cbdde758fede483902e4933b72']
};
export function validateJoints(spec,depth=spec.depth-backTrim(spec.backMount)) {
  if (!spec.joints) return;
  if (spec.thickness !== 18 || !spec.kitchenModel&&!['shelves','divided'].includes(spec.recipe)) throw Error('Крепёж рассчитан на вкладные детали корпуса 18 мм.');
  for (const scheme of [spec.joints.top,spec.joints.bottom]) {
    if (!Object.hasOwn(jointOptions,scheme)) throw Error('Выберите схему крепежа крыши и дна.');
    if (scheme==='cam_dowel' && depth < 276) throw Error('Для двух пар эксцентрик + шкант нужна глубина детали от 276 мм.');
  }
}
export function jointQuantity(scheme) {
  if (scheme==='cam_dowel') return '4 эксцентрика + 4 шканта · отступ 100 мм, шаг пары 32 мм';
  if (scheme==='confirmat') return '4 конфирмата · отступ 70 мм';
  return 'Без крепежа';
}

export function jointRows(scheme,depth,isShelf){
 const inset=isShelf||scheme==='confirmat'?70:100,rows=[];
 for(const direction of [-1,1]){
   const z=direction*(depth/2-inset);
   if(scheme==='confirmat')rows.push({kind:'confirmat',z});
   else rows.push({kind:'cam',z},{kind:'dowel',z:z-direction*32});
 }
 return rows;
}

export function shelfJointRows(panel,host,scheme){
 if(!panel.blank_binding?.gola_flush||!host)return jointRows(scheme,panel.depth,true);
 const bearing=shelfBearing(panel,host);
 if(bearing.depth<(scheme==='cam_dowel'?216:152))throw Error(panel.name+' · недостаточная глубина стойки для выбранного крепежа.');
 return jointRows(scheme,bearing.depth,true).map(row=>({...row,z:row.z+bearing.mid}));
}

export function dividerScheme(spec,index){
 const saved=spec?.dividerJoints?.[index];
 if(saved)return {...saved};
 // Before stand-specific settings existed, each end followed the outer joint,
 // with confirmats also installed when the outer joint was disabled.
 const legacy=level=>spec?.joints?.[level]==='cam_dowel'?'cam_dowel':'confirmat';
 return {top:legacy('top'),bottom:legacy('bottom')};
}

export function dividerEnds(it){
 if(it?.module_type!=='blank'||it.blank_axis!=='side'||it.width!==18)return [];
 const spec=it.assistant_carcass?.spec;
 if(spec&&['left','right'].some(side=>it.item_id===it.assistant_carcass.group_id+':'+side)){
   return ['bottom','top'].filter(level=>spec[level+'Fit']==='overlay'&&spec.joints?.[level]&&spec.joints[level]!=='none')
     .map(level=>({level,hostId:it.assistant_carcass.group_id+':'+level,scheme:spec.joints[level],outer:true,roll:level==='bottom'?90:-90}));
 }
 const partial=/^(.*):niche-(\d+)-(\d+)-divider$/.exec(it.item_id);
 if(partial&&spec){
   const section=Number(partial[2]),level=Number(partial[3]),count=spec.sectionShelves[section];
   const first=level?'shelf-'+section+'-'+(level-1):spec.bottomFit==='none'?(localBaseShelf(spec,section)?'shelf-base-'+section:null):'bottom';
   const last=level<count?'shelf-'+section+'-'+level:'top';
   return [[first,'bottom',90],[last,'top',-90]].filter(([host])=>host).map(([host,level,roll])=>({hostId:partial[1]+':'+host,level,roll,scheme:spec.drawerFixing??'cam_dowel'}));
 }
 const match=/^(.*):divider-(\d+)$/.exec(it.item_id);
 if(!match)return [];
 const joints=dividerScheme(it.assistant_carcass?.spec,Number(match[2]));
 return ['bottom','top'].filter(level=>joints[level]!=='none'&&(level!=='bottom'||spec?.bottomFit!=='none')).map(level=>({
   level,hostId:match[1]+':'+level,scheme:joints[level],roll:level==='bottom'?90:-90
 }));
}

function dividerJoints(it,byId){
 const result=[],rotation=it.rotation||0,centre=localPoint(it,rotation);
 for(const {level,hostId,scheme,roll,outer} of dividerEnds(it)){
   const host=byId.get(hostId),bottom=level==='bottom',y=it.elevation_mm+(bottom?0:it.height);
   const at=host&&localPoint(host,rotation);
   const shortenedCap=outer&&backTrim(it.assistant_carcass?.spec.backMount)>0;
   const bearing=shortenedCap&&host?shelfBearing(it,host):{depth:it.depth,mid:0};
   const rows=jointRows(scheme,bearing.depth,!outer).map(row=>({...row,z:row.z+bearing.mid}));
   if(!host||host.blank_axis!=='horizontal'||host.blank_shelf&&!host.blank_shelf.startsWith('board/')||![16,18,25].includes(host.height)||rotation!==(host.rotation||0)||
       y!==host.elevation_mm+(bottom?host.height:0)||Math.abs(centre.x-at.x)+9>host.width/2+.01||
       ((shortenedCap||it.item_id.includes(':niche-')||!bottom&&(it.assistant_carcass?.spec.front?.topProfile||it.assistant_carcass&&hasFacadeProfiles(it.assistant_carcass.spec)))?rows.some(r=>Math.abs(centre.z+r.z-at.z)+8>host.depth/2):Math.abs(centre.z-at.z)+it.depth/2>host.depth/2+.01)||bearing.depth<(scheme==='cam_dowel'?216:152))
     throw Error(it.name+' · проверьте контакт с '+(bottom?'дном':'крышей')+' и глубину для крепежа.');
   const cuts=horizontalProfileCuts(host,[...byId.values()]);
   for(const {kind,z} of rows){
     const x=centre.x-at.x+host.width/2,fromFront=at.z+host.depth/2-centre.z-z;
     if(cuts.some(c=>x+8>c.a&&x-8<c.b&&fromFront-8<c.depth))throw Error('Крепёж стойки попадает в вырез Gola. Измените положение профиля.');
     const point=worldPoint({x:centre.x,z:centre.z+z},rotation);
     const [source_file,source_sha256]=fittings[kind];
     result.push({name:source_file.slice(0,-5)+' · '+it.name+' · '+(bottom?'снизу':'сверху'),
       joint_part:kind,joined_panel_id:it.item_id,host_blank_id:hostId,source_file,source_sha256,
       rotation,joint_roll_deg:roll,position:{x:point.x,y,z:point.z},elastic_resize:false});
   }
 }
 return result;
}

// Positions are on the mating edge, measured from the back panel centre in X
// and from its lower edge in Y. The cam and dowel of each pair are 32 mm apart.
export function backRows(panel){
 const meta=panel.assistant_carcass,s=meta?.spec;
 if(panel.item_id===meta?.group_id+':rear-brace'){
   const rows=[],cam=s.drawerFixing!=='confirmat';
   for(const [edge,sign] of [['left',1],['right',-1]]){
     for(const [kind,y] of (cam?[['cam',34],['dowel',66]]:[['confirmat',25],['confirmat',75]]))
       rows.push({edge,kind,x:-sign*panel.width/2,y,dx:sign,dy:0,roll:sign>0?0:180});
   }
   return rows;
 }
 const upper=panel.item_id===meta?.group_id+':mezz-back'&&s?.surround?.upper;
 if(upper?!(s.back?s.backThickness:18):!s?.backThickness||panel.item_id!==meta.group_id+':back')return [];
 const w=panel.width,h=panel.height,rows=[];
 function pair(edge,x,y,dx,dy,roll,alongX,alongY){
   rows.push({edge,kind:'cam',x,y,dx,dy,roll},
             {edge,kind:'dowel',x:x+32*alongX,y:y+32*alongY,dx,dy,roll});
 }
 // Keep opposing dowels clear on shallow-height panels, then distribute
 // integer cam axes evenly between the end offsets.
 const margin=Math.min(100,Math.floor((h-80)/2));
 const span=h-2*margin,intervals=Math.max(1,Math.ceil(span/400));
 for(let i=0;i<=intervals;i++){
   const y=margin+Math.round(i*span/intervals),alongY=y<=h/2?1:-1;
   pair('left',-w/2,y,1,0,0,0,alongY);
   pair('right',w/2,y,-1,0,180,0,alongY);
 }
 for(const edge of (!upper&&s.bottomFit==='none'?['top']:['bottom','top'])){
   const length=!upper&&s[edge+'Fit']==='overlay'?s.width:w;
   for(const x of length>800?[-w/4,w/4]:[0]){
     const bottom=edge==='bottom';
     pair(edge,x,bottom?0:h,0,bottom?1:-1,bottom?90:-90,x<=0?1:-1,0);
   }
 }
 return rows;
}

function nativeBackJoints(panel,byId){
 const angle=panel.rotation||0,centre=localPoint(panel,angle);
 return backRows(panel).map(({edge,kind,x,y,dx,dy,roll})=>{
   const upper=panel.item_id.endsWith(':mezz-back'),spec=panel.assistant_carcass.spec;
   const thickness=upper&&!spec.back?18:panel.item_id.endsWith(':rear-brace')?spec.thickness:spec.backThickness;
   const hostId=panel.assistant_carcass.group_id+(upper?':mezz-':':')+edge,host=byId.get(hostId);
   const mount={x:centre.x+x,z:centre.z-panel.depth/2+(kind==='confirmat'?panel.depth/2:9)},height=panel.elevation_mm+y;
   const at=host&&localPoint(host,angle),side=dx!==0;
   if(!host||host.rotation!==panel.rotation||host.blank_axis!==(side?'side':'horizontal')||
       (side?host.width:host.height)<16||panel.depth!==thickness||
       Math.abs(mount.z-at.z)+4>host.depth/2+.01||
       (side?(Math.abs(at.x+dx*host.width/2-mount.x)>.01||height-4<host.elevation_mm||height+4>host.elevation_mm+host.height):
       (Math.abs(host.elevation_mm+(dy>0?host.height:0)-height)>.01||Math.abs(mount.x-at.x)+4>host.width/2+.01)))
     throw Error(panel.name+' · проверьте прилегание к детали «'+(host?.name||edge)+'».');
   const [source_file,source_sha256]=(kind==='confirmat'&&shelfConfirmats[host.width])||fittings[kind];
   return {name:source_file.slice(0,-5)+' · '+panel.name,joint_part:kind,joint_back_face:true,
     joint_roll_deg:roll,joined_panel_id:panel.item_id,host_blank_id:hostId,source_file,source_sha256,
     rotation:angle,position:{...worldPoint(mount,angle),y:height},elastic_resize:false};
 });
}

function isDrawerCover(part){
  const key=/:shelf-(\d+)-(\d+)$/.exec(part.item_id);
  const s=part.assistant_carcass?.spec,slot=key?nicheSlot(Number(key[1]),Number(key[2])):-1;
  if(key&&s?.front?.division&&anchoredShelf(s)?.matches.some(b=>b.section===Number(key[1])&&b.shelf===Number(key[2])))return true;
  return Boolean(key&&(s?.drawerBanks?.[slot]?.coverFixing||s?.drawerFixing&&s?.drawerBanks?.[nicheSlot(Number(key[1]),Number(key[2])+1)]?.layout)||s&&part.item_id.includes(':shelf-base-'));
}

export function nativeCarcassJoints(items,{checkOpposing=true}={}) {
  const byId=new Map(items.map(it=>[it.item_id,it])),out=[];
  for (const panel of items) {
    const meta=panel.assistant_carcass;
    if(meta?.spec.kitchenModel==='base-sink'&&panel.blank_axis==='back'&&panel.item_id.startsWith(meta.group_id+':rail-')){
      const angle=panel.rotation??0,centre=localPoint(panel,angle);
      for(const side of ['left','right']){
        const host=byId.get(meta.group_id+':'+side);
        if(!host)throw Error('Отсутствует боковина шкафа под мойку.');
        const point=worldPoint({x:centre.x+(side==='left'?-1:1)*panel.width/2,z:centre.z},angle);
        const [source_file,source_sha256]=fittings.confirmat;
        out.push({name:'Конфирмат 7×50 · '+panel.name,joint_part:'confirmat',joined_panel_id:panel.item_id,host_blank_id:host.item_id,
          source_file,source_sha256,rotation:(angle+(side==='left'?0:180))%360,position:{...point,y:panel.elevation_mm+panel.height/2},elastic_resize:false});
      }
      continue;
    }
    const shelfScheme=fixedShelfScheme(panel);
    if (!shelfScheme && !meta?.spec.joints) continue;
    const rail=['base-swing','base-vitrine'].includes(meta?.spec.kitchenModel)&&['rail-front','rail-rear'].some(key=>panel.item_id===meta.group_id+':'+key);
    const level=rail?'top':['top','bottom'].find(key=>panel.item_id===meta?.group_id+':'+key);
    if (!shelfScheme && (!level||meta.spec[level+'Fit']==='overlay')) continue;
    const scheme=shelfScheme || meta.spec.joints[level];
    if (scheme==='none') continue;
    if(shelfScheme){
      if(![16,18,25].includes(panel.height) || panel.depth<(scheme==='cam_dowel'?216:152))throw Error(panel.name+' · проверьте толщину и глубину полки.');
    }else validateJoints({...meta.spec,thickness:panel.height},panel.depth);
    const binding=panel.blank_binding, angle=panel.rotation||0;
    const centre=localPoint(panel,angle);
    for (const side of ['left','right']) {
      const host=byId.get(binding?.[side+'_id']), sign=side==='left'?-1:1;
      const face=centre.x+sign*panel.width/2;
      if (!host || host.blank_axis!=='side' || (shelfScheme?![16,18,25].includes(host.width):host.width!==18) || host.rotation!==panel.rotation ||
          (binding['gap_'+side+'_mm']||0)!==0 ||
          Math.abs(localPoint(host,angle).x-sign*host.width/2-face)>0.01 ||
          (binding.gola_flush?shelfBearing(panel,host).rear>-panel.depth/2+.01:Math.abs(centre.z-localPoint(host,angle).z)+panel.depth/2>host.depth/2+.01) ||
          panel.elevation_mm<host.elevation_mm || panel.elevation_mm+panel.height>host.elevation_mm+host.height)
        throw Error(panel.name+' · проверьте толщину и привязку боковин.');
      function place(kind,z) {
        const point=worldPoint({x:face,z},angle);
        const [source_file,source_sha256]=(shelfScheme&&kind==='confirmat'&&shelfConfirmats[host.width])||fittings[kind];
        out.push({name:source_file.slice(0,-5)+' · '+panel.name,joint_part:kind,joined_panel_id:panel.item_id,
          host_blank_id:host.item_id,source_file,source_sha256,rotation:(angle+(side==='left'?0:180))%360,
          position:{x:point.x,y:panel.elevation_mm+(kind==='confirmat'?panel.height/2:9),z:point.z},elastic_resize:false});
      }
      const opposite=Boolean(shelfScheme&&isDrawerCover(panel)&&items.some(other=>
        fixedShelfScheme(other)&&other.blank_binding?.[side==='left'?'right_id':'left_id']===host.item_id&&
        Math.abs(other.elevation_mm-panel.elevation_mm)<10&&(side==='left'||!isDrawerCover(other))));
      // Two confirmats on each end of the 80 mm kitchen stretcher, 20 mm from each edge.
      const rows=rail?[-1,1].map(sign=>({kind:'confirmat',z:sign*(panel.depth/2-20)})):
        shelfScheme?shelfJointRows(panel,host,scheme):jointRows(scheme,panel.depth,false);
      for(const row of rows){
        // On a shared upright stagger facing fasteners without moving either shelf.
        const inset=opposite?16*Math.sign(row.z):0;
        place(row.kind,centre.z+row.z-inset);
      }
    }
  }
  if(checkOpposing)checkOpposingJoints(out,items);
  for(const it of items)out.push(...dividerJoints(it,byId),...nativeBackJoints(it,byId));
  return out;
}
function checkOpposingJoints(out,items){
  // On a shared divider the two drilling patterns enter from opposite faces.
  const seats=new Map();
  for(const part of out){
    const list=seats.get(part.host_blank_id)??[];
    list.push(part);seats.set(part.host_blank_id,list);
  }
  function check(a,b,radius){
    if(a.rotation!==b.rotation && Math.hypot(a.position.y-b.position.y,
       localPoint(a.position,a.rotation).z-localPoint(b.position,a.rotation).z)<4+radius)
      throw Error('Встречная присадка в общей перегородке. Измените высоту полки или крепление соседней секции.');
  }
  for(const list of seats.values())for(let i=0;i<list.length;i++)for(const other of list.slice(i+1))check(list[i],other,4);
  for(const shelf of items){
    if(!shelf.blank_binding||fixedShelfScheme(shelf))continue;
    for(const mount of shelfSupportPlan(shelf,items).parts){
      const list=seats.get(mount.host);if(!list)continue;
      const q=worldPoint(mount,shelf.rotation);
      const pt={rotation:((shelf.rotation||0)+(mount.side==='left'?0:180))%360,
        position:{x:shelf.x+q.x,z:shelf.z+q.z,y:shelf.elevation_mm+mount.y}};
      for(const a of list)check(a,pt,10);
    }
  }
}
