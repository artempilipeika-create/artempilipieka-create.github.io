import catalogue from './wardrobe-aks-push.json' with {type:'json'};
import {localPoint,worldPoint} from './blank-bindings.mjs';
import {fixedShelfScheme} from './shelf-choices.mjs';
import {nativeCarcassJoints} from './carcass-joints.mjs';

export const pushProducts=catalogue;
export const pushDefault={article:'72255',mount:'auto',support:'auto',heightMm:1050};
export const pushRoll={top:0,bottom:180,left:-90,right:90};
const axes={top:[0,1],bottom:[0,-1],left:[1,0],right:[-1,0]};
const near=(a,b)=>Math.abs(a-b)<.03;
const overlaps=(a,b)=>a.every(([lo,hi],i)=>lo<b[i][1]-.05&&hi>b[i][0]+.05);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

function limits(p,angle){
 const {x,z}=localPoint(p,angle);
 return [[x-p.width/2,x+p.width/2],[p.elevation_mm,p.elevation_mm+p.height],[z-p.depth/2,z+p.depth/2]];
}
function boxAt(pt,side,bounds){
 const [a,b]=axes[side],[lo,hi]=bounds;
 const project=(origin,m,n)=>[origin+Math.min(m*lo[1],m*hi[1])+Math.min(n*lo[2],n*hi[2]),
                               origin+Math.max(m*lo[1],m*hi[1])+Math.max(n*lo[2],n*hi[2])];
 return [project(pt.x,a,b),project(pt.y,b,-a),[pt.z-hi[0],pt.z-lo[0]]];
}
function supportKind(p,key){
 if(p.blank_axis==='side'&&/^(left|right|divider-\d+|niche-.+-divider)$/.test(key))return 'side';
 if(p.blank_axis!=='horizontal')return null;
 if(key==='top'||key==='bottom'||key==='rail-front')return key==='bottom'?'bottom':'roof';
 return fixedShelfScheme(p)?'shelf':null;
}
function makeItem(door,host,style,side,part,source,config,pt){
 return {name:(part==='catch'?'Ответная планка из комплекта':'Толкатель')+' AKS '+config.article+' · '+door.name,
  article:config.article,source_file:source.file,source_sha256:source.sha,wardrobe_push_mount:side,
  push_install:style,push_part:part,host_blank_id:host.item_id,joined_panel_id:door.item_id,
  rotation:door.rotation,position:{...worldPoint(pt,door.rotation),y:pt.y},elastic_resize:false};
}
export function planAksPush(door,items,setting,hingeSide,hingePlan){
 const cfg={...pushDefault,...setting},product=catalogue[cfg.article];
 if(!product||cfg.mount!=='auto'&&!product.mounts[cfg.mount])throw Error('Выберите доступное исполнение типона AKS.');
 const group=door.assistant_carcass,prefix=group.group_id+':',angle=door.rotation;
 const rows=items.filter(p=>p.item_id.startsWith(prefix)).map(p=>({p,key:p.item_id.slice(prefix.length),b:limits(p,angle)}));
 const [xx,yy,zz]=limits(door,angle),back=zz[0],free=hingeSide==='left'?xx[1]:xx[0],inward=hingeSide==='left'?-1:1;
 const x70=free+inward*70,tall=door.height>=1100&&!door.item_id.includes(':door-upper-');
 const lowTarget=yy[0]+7.5,target=tall||cfg.support==='side'||cfg.support==='shelf'?clamp(cfg.heightMm,yy[0]+9,yy[1]-9):lowTarget;
 const tagged=rows.map(({p})=>p.assistant_carcass?p:{...p,assistant_carcass:group});
 const joints=nativeCarcassJoints(tagged,{checkOpposing:false}).map(j=>({...j,at:localPoint(j.position,angle)}));
 const hingeBoxes=tagged.filter(p=>p.blank_axis==='front'&&p.item_id.startsWith(prefix+'door-')).flatMap(p=>hingePlan(p,tagged)).map(h=>{
  const c=localPoint(h.position,angle),sign=h.door_side==='left'?1:-1;
  return [[c.x+(sign===1?-17:-41),c.x+(sign===1?41:17)],[h.position.y-32,h.position.y+32],[c.z-77,c.z+2]];
 });
 const candidates=[];
 for(const {p,key,b} of rows){
  const kind=supportKind(p,key);if(!kind)continue;
  if(cfg.support==='bottom'&&(kind!=='bottom'&&kind!=='shelf'||b[1][1]>yy[0]+21||b[1][1]<yy[0]-18))continue;
  if(['side','shelf'].includes(cfg.support)&&kind!==cfg.support)continue;
  const sideBoard=kind==='side';
  if(sideBoard&&(b[0][0]>free+75||b[0][1]<free-75))continue;
  for(const [style,src] of Object.entries(product.mounts)){
   if(cfg.mount!=='auto'&&cfg.mount!==style)continue;
   const bored=style==='bored',gap=back-b[2][1];
   if(bored&&(!near(sideBoard?p.width:p.height,18)||b[2][1]-b[2][0]<70||!near(gap,2)&&!(src.bodyAt3&&near(gap,3))))continue;
   const body=bored&&near(gap,3)?src.bodyAt3:src.body;
   for(const side of sideBoard?['left','right']:['top','bottom']){
    if(sideBoard&&(key==='left'||key==='right')&&side!==key)continue;
    const [nx,ny]=axes[side],axis=sideBoard?0:1;
    // Local Y points from the mounting face into the opening. The bored axis lies 9 mm inside the board.
    const plane=b[axis][nx+ny>0?1:0],axisPos=plane+(bored?-9:0)*(nx+ny);
    const z=bored?b[2][1]:back+src.faceX;
    const contactY=src.catch?src.catchY:bored?-9:(src.tipY??(src.bounds[1][1]/2));
    const y0=sideBoard?clamp(target,b[1][0]+11,b[1][1]-11):plane;
    const heights=[y0];
    if(sideBoard&&cfg.support==='auto')for(let d=16;d<=128;d+=16)heights.push(y0-d,y0+d);
    for(const y of heights){
     const pt={x:sideBoard?plane:x70,y,z};
     const cx=pt.x+nx*contactY,cy=pt.y+ny*contactY;
     const halfNormal=src.catch?src.catchHeight/2:3.7,halfCross=src.catch?src.catchWidth/2:3.7;
     const hx=sideBoard?halfNormal:halfCross,hy=sideBoard?halfCross:halfNormal;
     if(cx-hx<xx[0]-.03||cx+hx>xx[1]+.03||cy-hy<yy[0]-.03||cy+hy>yy[1]+.03||Math.abs(cx-free)>85)continue;
     if(sideBoard?(y-halfCross<b[1][0]||y+halfCross>b[1][1]):(x70-halfCross<b[0][0]||x70+halfCross>b[0][1]))continue;
     if(!bored&&src.pilots.some(dx=>z-dx-2<b[2][0]||z-dx+2>b[2][1]))continue;
     const volume=boxAt(pt,side,src.bounds);
     const drill=bored?[[sideBoard?axisPos-5:x70-5,sideBoard?axisPos+5:x70+5],
      [sideBoard?y-5:axisPos-5,sideBoard?y+5:axisPos+5],[z-70,z+.1]]:volume;
     const conflict=joints.some(j=>{
      if(j.joined_panel_id!==p.item_id&&j.host_blank_id!==p.item_id)return false;
      const half=j.joint_part==='confirmat'?40:34;
      return overlaps(drill,[[j.at.x-half,j.at.x+half],[j.position.y-10,j.position.y+10],[j.at.z-8,j.at.z+8]]);
     });
     if(conflict||hingeBoxes.some(box=>overlaps(drill,box)))continue;
     if(rows.some(other=>{
      if(other.p.item_id===p.item_id||other.p.item_id===door.item_id)return false;
      const swept=/^drawer-\d+-\d+-/.test(other.key)?[other.b[0],other.b[1],[other.b[2][0],Infinity]]:other.b;
      return overlaps(volume,swept);
     }))continue;
     const home=makeItem(door,p,style,side,'body',body,cfg,pt);
     home.push_height_mm=cy+(sideBoard?0:ny*(src.tipY-contactY));
     if(body===src.bodyAt3)home.push_gap_mm=3;
     const parts=[home];
     if(src.catch)parts.push(makeItem(door,door,style,side,'catch',src.catch,cfg,{x:cx,y:cy,z:back}));
     candidates.push({parts,score:Math.abs(cy-target)+(bored?0:32)+(tall&&sideBoard?0:sideBoard?24:0)});
    }
   }
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 if(!candidates.length)throw Error('Для типона '+cfg.article+' нет свободной опоры у края двери. Выберите другую высоту, закреплённую полку или накладной монтаж.');
 return candidates[0].parts;
}
