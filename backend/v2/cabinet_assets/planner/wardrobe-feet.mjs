import {worldPoint} from './blank-bindings.mjs';
import {jointRows,dividerScheme} from './carcass-joints.mjs';
import {sectionWidths} from './carcass-model.mjs';

export const feetCatalogue=[{article:'118779',name:'Регулятор М6',height:10,diameter:20,drillDepth:16,
 file:'Регулятор уровня М6_8_16 черный (118779).fr3d',sha:'9d939e3cbf71b17dad69eacce37b305d323b6dc2e7898e3861e6772f81c87090'}];

export function footPlan(spec){
 if(!spec?.feet)return [];
 const fitting=feetCatalogue.find(f=>f.article===spec.feet.article);
 if(!fitting)throw Error('Неизвестная модель опоры.');
 const {width,depth,thickness:t}=spec,{front,rear}=spec.feet;
 if(![front,rear].every(n=>Number.isInteger(n)&&n>=10)||depth-front-rear<20)throw Error('Проверьте отступы опор: от края минимум 10 мм, между осями минимум 20 мм.');
 const specs=spec.joints?.bottom;
 const axes=[{x:t/2,key:'left',scheme:specs}];
 let x=t/2;
 for(const [i,width] of sectionWidths(spec).slice(0,-1).entries()){
   x+=width+t;axes.push({x,key:'bottom',divider:true,scheme:t===18?dividerScheme(spec,i).bottom:null});
 }
 if(width>900&&axes.length===1)axes.push({x:width/2,key:'bottom'});
 axes.push({x:width-t/2,key:'right',scheme:specs});
 const rows=[];
 for(const axis of axes){
   const host=spec.bottomFit==='overlay'?'bottom':axis.key;
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
 if(!['bottom','left','right'].includes(key))return [];
 return footPlan(meta.spec).filter(f=>f.host===key).map(f=>({...f,x:key==='bottom'?f.x:0}));
}
export function nativeFeet(items){
 const out=[];
 for(const it of items)for(const foot of panelFeet(it)){
   const def=feetCatalogue.find(f=>f.article===it.assistant_carcass.spec.feet.article);
   const p=worldPoint(foot,it.rotation||0);
   out.push({article:def.article,name:def.name+' · '+it.name,host_blank_id:it.item_id,source_file:def.file,source_sha256:def.sha,
     rotation:it.rotation||0,elastic_resize:false,position:{x:it.x+p.x,y:it.elevation_mm,z:it.z+p.z}});
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
 return '<svg viewBox="0 0 360 '+(h+68)+'" role="img" aria-label="Вид снизу: '+plan.length+' опор"><text x="180" y="18" text-anchor="middle">Задний край · '+spec.feet.rear+' мм</text>'+
 rect(left,y,b,h,'#ede0c9')+rect(left,y,t*scale,h,'#c4a67a')+rect(left+b-t*scale,y,t*scale,h,'#c4a67a')+strips+circles+
 '<text x="180" y="'+(y+h+24)+'" text-anchor="middle">Передний край · '+spec.feet.front+' мм</text></svg>';
}
