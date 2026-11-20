import {worldPoint} from './blank-bindings.mjs';
import {backTrim,backSideTrim,rearClearance} from './panel-machining.mjs';
import {jointRows,dividerScheme} from './carcass-joints.mjs';
import {sectionWidths} from './carcass-model.mjs';

import {plinthFeet,plinthPanel} from './plinth-options.mjs';

import {decorativeFeet,centralFoot,decorativePlan,turn} from './decor-feet.mjs';
export const feetCatalogue=[{article:'118779',name:'Регулятор М6',category:'end',height:10,diameter:20,drillDepth:16,
 file:'Регулятор уровня М6_8_16 черный (118779).fr3d',sha:'9d939e3cbf71b17dad69eacce37b305d323b6dc2e7898e3861e6772f81c87090'},...plinthFeet.map(leg=>({...leg,category:'plinth'})),...decorativeFeet];

// Saved designs keep their drilling layout until the cabinet is rebuilt.
function innerAxes(spec){
 const dividers=[];
 let x=spec.thickness/2;
 for(const [index,opening] of sectionWidths(spec).slice(0,-1).entries()){
   x+=opening+spec.thickness;
   dividers.push({x,index});
 }
 if(spec.feet.layout!=='width')return dividers.length?dividers:spec.width>900?[{x:spec.width/2}]:[];
 if(spec.width<=800)return [];
 const centre=spec.width/2;
 return [{x:centre,index:dividers.find(axis=>Math.abs(axis.x-centre)<9)?.index}];
}

export function footPlan(spec){
 if(!spec?.feet)return [];
 const trim=backTrim(spec.backMount);
 const rows=planAtDepth(spec, spec.depth-trim);
 return trim?rows.map(row=>({...row,z:row.z+trim/2})):rows;
}
function planAtDepth(spec,depth){
 if(spec.bottomFit==='none'&&(spec.feet.article!=='118779'||innerAxes(spec).some(axis=>axis.index==null)))throw Error('Для этих опор требуется дно. Выберите корпус на стойках или торцевые опоры с опорной стойкой по центру.');
 const fitting=feetCatalogue.find(f=>f.article===spec.feet.article);
 if(!fitting)throw Error('Неизвестная модель опоры.');
 const {width,thickness:t}=spec,{front,rear}=spec.feet;
 if(![front,rear].every(n=>Number.isInteger(n)&&n>=10)||depth-front-rear<20)throw Error('Проверьте отступы опор: от края минимум 10 мм, между осями минимум 20 мм.');
 if(fitting.category==='decor')return decorativePlan({...spec,depth},fitting);
 if(fitting.plinth){
   const bottomInset=spec.bottomFit==='overlay'?0:t;
   const margin=bottomInset+fitting.radius;
   if(front<30+t||rear<30||depth-front-rear<60)
     throw Error('Проверьте отступы для монтажной площадки и цоколя.');
   if(spec.bottomFit==='overlay'&&[spec.feet.left,spec.feet.right].includes('side'))
     throw Error('Для стойки до пола выберите дно между боковинами.');
   const xs=[margin,...innerAxes(spec).map(axis=>axis.x),width-margin];
   if(xs.some((x,i)=>i&&x-xs[i-1]<2*fitting.radius))throw Error('Монтажные площадки опор пересекаются по ширине.');
   return xs.flatMap(x=>[depth/2-front,-depth/2+rear].map(z=>({host:'bottom',x:x-width/2,z})));
 }
 const specs=spec.joints?.bottom;
 const axes=[{x:t/2,key:'left',scheme:specs}];
 for(const axis of innerAxes(spec)){
   const divider=axis.index!==undefined;
   axes.push({x:axis.x,key:'bottom',divider,scheme:divider&&t===18?dividerScheme(spec,axis.index).bottom:null});
 }
 axes.push({x:width-t/2,key:'right',scheme:specs});
 const rows=[];
 for(const axis of axes){
   const host=spec.bottomFit==='none'&&axis.divider?'divider-'+innerAxes(spec).find(a=>a.x===axis.x).index:spec.bottomFit==='overlay'?'bottom':axis.key;
   if(host==='bottom'&&t<=fitting.drillDepth)throw Error('Для глухой присадки опоры Ø8 × 16 мм в пласть нужно дно толще 16 мм.');
   for(const z of [depth/2-front,-depth/2+rear]){
     if(axis.scheme&&axis.scheme!=='none'){
       const inset=axis.divider?(spec.dividerSetback??0):0;
       if(jointRows(axis.scheme,depth-inset,Boolean(axis.divider)).some(row=>Math.abs(z-(row.z-inset/2))<9))
         throw Error('Опора совпадает с присадкой дна. Измените передний или задний отступ.');
     }
     rows.push({host,x:axis.x-width/2,z});
   }
 }
 return rows;
}

export function panelFeet(item){
 const meta=item.assistant_carcass;
 if(!meta?.spec.feet||item.module_type!=='blank')return [];
 const key=item.item_id.slice(meta.group_id.length+1);
 if(!['bottom','left','right'].includes(key)&&!key.startsWith('divider-'))return [];
 const s=meta.spec,trim=backTrim(s.backMount);
 let hostZ=0;
 if(trim){
   if(key==='bottom')hostZ=trim/2;
   else if(key.startsWith('divider-'))hostZ=(rearClearance(s)+(s.bottomFit==='none'?s.thickness:0)-(s.dividerSetback??0))/2;
   else hostZ=backSideTrim(s.backMount,key)/2;
 }
 return footPlan(s).filter(f=>f.host===key).map(f=>({...f,z:f.z-hostZ,x:key==='bottom'?f.x:0}));
}
export function nativeFeet(items){
 const out=[];
 for(const it of items)for(const foot of panelFeet(it)){
   const selected=feetCatalogue.find(f=>f.article===it.assistant_carcass.spec.feet.article);
   const def=foot.centre?centralFoot(selected.height):selected;
   const p=worldPoint(foot,it.rotation||0);
   out.push({article:def.article,name:(foot.centre?'Центральная опора · ':'')+def.name+(def.finish?' · '+def.finish:'')+' · '+def.height+' мм · '+it.name,host_blank_id:it.item_id,source_file:def.file,source_sha256:def.sha,
     ...(selected.category==='decor'?{decorative_support:true}:{}),rotation:((it.rotation||0)+(foot.yaw||0))%360,elastic_resize:false,position:{x:it.x+p.x,y:it.elevation_mm,z:it.z+p.z}});
 }
 return out;
}

export function feetDrawing(spec){
 const plan=footPlan(spec);
 if(!plan.length)return '';
 const {width:w,depth:d,thickness:t}=spec,scale=Math.min(320/w,165/d),h=d*scale,b=w*scale;
 const left=(360-b)/2,y=29;
 const rect=(x,y,w,h,fill)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+fill+'"/>';
 const circles=plan.map(p=>'<circle cx="'+(left+(p.x+w/2)*scale)+'" cy="'+(y+(p.z+d/2)*scale)+'" r="'+Math.max(3.4,10*scale)+'" fill="#08745e" stroke="white" stroke-width="1"/>').join('');
 let cursor=t;
 const strips=sectionWidths(spec).slice(0,-1).map(width=>{cursor+=width;const strip=rect(left+cursor*scale,y,t*scale,h,'#c4a67a');cursor+=t;return strip}).join('');
 const leg=decorativeFeet.find(f=>f.article===spec.feet.article);
 const outlines=leg?plan.filter(p=>!p.centre).map(p=>{
  const outline=leg.hull.map(v=>{const [x,z]=turn(v,p.yaw);return [left+(p.x+x+w/2)*scale,y+(p.z+z+d/2)*scale].join(',');}).join(' ');
  const [x,z]=turn(leg.sole,p.yaw);
  return '<polygon points="'+outline+'" fill="#bfd8c9" stroke="#43755e"/><circle cx="'+(left+(p.x+x+w/2)*scale)+'" cy="'+(y+(p.z+z+d/2)*scale)+'" r="3" fill="#205a42"/>';
 }).join(''):'';
 const panel=plinthPanel(spec);
 const frontPanel=panel?rect(left+(w/2+panel.x-panel.width/2)*scale,y+(panel.z+d/2-t/2)*scale,panel.width*scale,t*scale,'#28755d'):'';
 return '<svg viewBox="0 0 360 '+(h+68)+'" role="img" aria-label="Вид снизу: '+plan.length+(plan.length===4?' опоры':' опор')+'"><text x="180" y="18" text-anchor="middle">Задний край · '+spec.feet.rear+' мм</text>'+
 rect(left,y,b,h,'#ede0c9')+rect(left,y,t*scale,h,'#c4a67a')+rect(left+b-t*scale,y,t*scale,h,'#c4a67a')+strips+circles+outlines+frontPanel+
 '<text x="180" y="'+(y+h+24)+'" text-anchor="middle">Передний край · '+spec.feet.front+' мм</text></svg>';
}
