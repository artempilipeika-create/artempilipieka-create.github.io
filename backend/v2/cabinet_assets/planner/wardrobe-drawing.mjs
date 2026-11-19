import {isEdgePull,verticalEdge} from './wardrobe-edge-pulls.mjs';
import hardware from './wardrobe-handle-catalogue.json' with {type:'json'};
import {doorLabel,doorShelfOptions,baseWardrobeDoors,drawerFacades,handlePlacement,isFacadeProfile} from './wardrobe-door-layout.mjs';
import {mm,mmText,nicheSlot} from './wardrobe-niches.mjs';
import {sectionWidths} from './carcass-model.mjs';
import {backRows} from './carcass-joints.mjs';
import {footPlan,feetCatalogue} from './wardrobe-feet.mjs';
import {footHeight,plinthPanel,floorSide} from './plinth-options.mjs';
import {turn} from './decor-feet.mjs';
import {doorLeaves,swingNames} from './door-swing.mjs';

export const drawingTitles={body:'Корпус',sections:'Секции и полки',feet:'Опоры',plinth:'Цоколь',back:'Задняя стенка',fronts:'Фасады'};
const edge='#495b54',accent='#19664f',wood='#e6dcc9',end='#c4b8a2';
import {measuredRooms} from './wardrobe-gola-shelves.mjs';
import {openingBase,splitAt,columnWidths} from './wardrobe-layout.mjs';
const num=n=>Number(n.toFixed(2));
const points=p=>p.map(([x,y])=>num(x)+','+num(y)).join(' ');
const polygon=(p,fill)=>'<polygon points="'+points(p)+'" fill="'+fill+'" stroke="'+edge+'" stroke-width=".9" stroke-linejoin="round"/>';
const label=(x,y,s)=>'<text x="'+num(x)+'" y="'+num(y)+'" text-anchor="middle" fill="'+edge+'" font-size="12">'+s+'</text>';
const line=(x,y,a,b,style='')=>'<path d="M'+num(x)+' '+num(y)+' L'+num(a)+' '+num(b)+'" fill="none" stroke="'+edge+'" '+style+'/>';
const rect=(x,y,w,h,color,stroke=edge)=>'<rect x="'+num(x)+'" y="'+num(y)+'" width="'+num(w)+'" height="'+num(h)+'" fill="'+color+'" stroke="'+stroke+'" stroke-width=".9"/>';
const circle=(x,y,r,fill,stroke=accent)=>'<circle cx="'+num(x)+'" cy="'+num(y)+'" r="'+num(r)+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1"/>';
const sheet=(view,body,box='0 0 400 324')=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+box+'" role="'+(['sections','fronts'].includes(view)?'group':'img')+'" aria-label="'+drawingTitles[view]+'" data-view="'+view+'">'+body+'</svg>';

function openCabinet(built){
 const s=built.spec,H=built.height+footHeight(s),D=s.depth,W=s.width;
 const scale=Math.min(326/(W+.46*D),270/(H+.2*D));
 const point=(x,y,z)=>[200+(x-.46*z)*scale,160+((H/2-y)+.20*z)*scale];
 const order=({key,item})=>key==='back'?-1e5:key==='right'?1e5:key==='top'?2e5:key==='left'?-1e4:item.elevation_mm;
 const panels=built.parts.filter(p=>p.item.blank_axis!=='front'||p.key.startsWith('drawer-')).sort((a,b)=>order(a)-order(b));
 return panels.map(({key,item:i})=>{
   const x=i.x-i.width/2,X=x+i.width,y=i.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0),Y=y+i.height;
   const z=i.z-i.depth/2,Z=z+i.depth,glass=i.blank_shelf&&!i.blank_shelf.startsWith('board/');
   return '<g data-panel="'+key+'">'+polygon([point(x,Y,z),point(X,Y,z),point(X,Y,Z),point(x,Y,Z)],glass?'#d2e7e3':'#f3ebdd')+
     polygon([point(X,y,z),point(X,Y,z),point(X,Y,Z),point(X,y,Z)],glass?'#c0d6d0':end)+
     polygon([point(x,y,Z),point(X,y,Z),point(X,Y,Z),point(x,Y,Z)],glass?'#d6e7e0':key==='back'?'#dedbcc':wood)+'</g>';
 }).join('');
}
function elevationView(built,view,section,front,selectedShelf,selection){
 const s=built.spec,H=built.height+footHeight(s),W=s.width;
 const zoom=view==='plinth',height=zoom?Math.min(H,Math.max(240,footHeight(s)+W*.22)):H;
 const facade=view==='fronts';
 const k=Math.min(328/W,(zoom?200:facade?224:258)/height),bottom=zoom?238:facade?253:289;
 const X=x=>200+x*k,Y=y=>bottom-y*k;
 const panel=i=>({x:i.x-i.width/2,y:i.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0),w:i.width,h:i.height});
 let drawing='',selectedOutline='',dimensions='',handles='';
 const editor=view==='sections'&&selection?.editor;
 function highlight(left,low,width,high,id){
   return '<rect data-selected-niche="'+id+'" x="'+num(X(left))+'" y="'+num(Y(high))+'" width="'+num(width*k)+'" height="'+num((high-low)*k)+'" fill="none" stroke="#1769b5" stroke-width="1.65" pointer-events="none"/>';
 }
 function widthDimension(sec,x,w,y,zone=null,column=null){
   const center=X(x+w/2),a=X(x),b=X(x+w);
   const more=zone==null?'':' data-split-section="'+zone+'" data-column="'+column+'"';
   const ty=y-4;
   return '<g role="button" tabindex="0" data-section="'+sec+'" data-clear-width=""'+more+' aria-label="Ширина в свету '+w+' мм">'+
     '<title>Ширина в свету '+w+' мм</title><path d="M'+num(a)+' '+num(y)+'H'+num(b)+'m-3 -2l3 2 -3 2M'+num(a+3)+' '+num(y-2)+'l-3 2 3 2" fill="none" stroke="#52758a"/>'+
     '<rect x="'+num(center-10)+'" y="'+num(ty-8)+'" width="20" height="12" rx="2" fill="#f9faf6"/>'+
     '<text x="'+num(center)+'" y="'+num(ty)+'" text-anchor="middle" fill="#254e66" font-size="8">'+w+'</text></g>';
 }
 function dividerHandle(sec,level,x,low,high,local){
   const attrs=local?' data-split-section="'+level+'" data-column="0"':'';
   return '<g class="divider-handle" role="button" tabindex="0" data-section="'+sec+'" data-niche="'+level+'" data-clear-width="" data-drag-mm="width" data-scale="'+k+'"'+attrs+' aria-label="Переместить перегородку">'+
     '<rect x="'+num(X(x)-3)+'" y="'+num(Y(high))+'" width="6" height="'+num((high-low)*k)+'" fill="transparent"/></g>';
 }

 function measure(section,level,low,high,x,column=null,zone=null){
   const a=Y(high),b=Y(low),px=X(x),value=mm(high-low);
   const extra=zone==null?'':' data-split-section="'+zone+'" data-column="'+column+'"';
   const desc='Чистая высота '+mmText(value)+' мм';
   return '<g role="button" tabindex="0" data-section="'+section+'" data-clear-level="'+level+'"'+extra+' aria-label="'+desc+'"><title>'+desc+'</title>'+
    '<path d="M'+num(px)+' '+num(a)+'V'+num(b)+'m-2 -3l2 3 2 -3M'+num(px-2)+' '+num(a+3)+'l2 -3 2 3" fill="none" stroke="#275d87"/>'+
    '<rect x="'+num(px-18)+'" y="'+num((a+b)/2-6)+'" width="36" height="12" rx="2" fill="#fff" fill-opacity=".9"/>'+
    '<text x="'+num(px)+'" y="'+num((a+b)/2+3)+'" text-anchor="middle" fill="#204f77" font-size="9">'+mmText(value)+'</text></g>';
 }
 function handleDrawing(leaf,setting,title){
   if(!setting)return '';
   if(isEdgePull(setting)){
     const rise=hardware[setting.article].edgeRise,e=setting.edge,vertical=verticalEdge(e);
     const x=X(leaf.left-W/2+(e==='right'?leaf.width-rise:0));
     const y=Y(footHeight(s)+leaf.bottom+(e==='bottom'?rise:leaf.height));
     return '<rect data-inset-handle="'+leaf.key+'" data-door-id="'+leaf.key+'" x="'+num(x)+'" y="'+num(y)+'" width="'+num(k*(vertical?rise:leaf.width))+'" height="'+num(k*(vertical?leaf.height:rise))+'" fill="#363a39"><title>Врезная ручка AKS '+setting.article+'</title></rect>';
   }
   if(isFacadeProfile(setting)){
     const y=Y(footHeight(s)+leaf.bottom+(setting.edge==='top'?leaf.height:0)),x=X(leaf.left-W/2);
     return '<path data-profile-edge="'+leaf.key+'" pointer-events="none" d="M'+num(x)+' '+num(y)+'h'+num(leaf.width*k)+'" stroke="#293630" stroke-width="3"/>';
   }
   let h;try{h=handlePlacement(leaf,setting);}catch{return '';}
   const cx=X(leaf.left-W/2+h.x),cy=Y(footHeight(s)+leaf.bottom+h.y);
   const half=h.part.length*k/2,dx=h.vertical?0:half,dy=h.vertical?half:0;
   const path='M'+num(cx-dx)+' '+num(cy-dy)+'L'+num(cx+dx)+' '+num(cy+dy);
   return '<g data-drag-handle="'+leaf.key+'" data-door-id="'+leaf.key+'" data-scale="'+k+'" role="button" tabindex="0" aria-label="Переместить ручку · '+title+'"><path d="'+path+'" stroke="#282b29" stroke-width="'+Math.max(2,(h.back?4:12)*k)+'" stroke-linecap="round"/><path d="'+path+'" stroke="transparent" stroke-width="12"/></g>';
 }
 const ordered=built.parts.filter(p=>p.item.blank_axis!=='front'||p.key.startsWith('drawer-')).sort((a,b)=>panelOrder(a)-panelOrder(b));
 function panelOrder(p){return p.key==='back'?-3:p.key.endsWith('-face')?3:p.key==='plinth'?2:0;}
 for(const {key,item} of ordered){
   const q=panel(item);if(q.y>=height)continue;
   const grey=key==='back'?'#edece5':wood;
   drawing+=rect(X(q.x),Y(Math.min(height,q.y+q.h)),q.w*k,(Math.min(height,q.y+q.h)-q.y)*k,key==='plinth'&&zoom?'#bed9cd':grey);
 }
 if(facade)for(const face of drawerFacades(s,built.drawerBanks??[])){
   const title=face.label,x=X(face.left-W/2),y=Y(footHeight(s)+face.bottom+face.height);
   drawing+='<g data-door-id="'+face.key+'" role="button" tabindex="0" aria-label="'+title+'">'+rect(x,y,face.width*k,face.height*k,selection?.door===face.key?'#c2dcf4':wood)+'</g>';
   drawing+=handleDrawing(face,s.drawerBanks?.[face.slot]?.faces[face.index]?.handle,title);
 }
 if(facade&&front&&!selection?.internalFronts){
   const legal=built.spec.front;
   let leaves=[];
   try{leaves=legal?built.doors??baseWardrobeDoors({...s,front},built.drawerBanks):baseWardrobeDoors({...s,front},built.drawerBanks);}
   catch{ /* An invalidated anchor can be chosen again on this drawing. */ }
   const y0=Y(footHeight(s)),x0=X(-W/2);
   drawing+=doorLeaves(s,front.swing,x0,y0,k,front.division?11:40,leaves,selection);
   for(const leaf of leaves){
    drawing+=handleDrawing(leaf,front.handles?.[leaf.key],doorLabel(leaf.key));
   }
   const d=front.division;
   if(d){
    for(const opt of doorShelfOptions(s,d.scope)){
     const selected=opt.matches.some(a=>a.section===d.section&&a.shelf===d.shelf),p=opt.matches[0],bottom=built.installedLevels?.get('shelf-'+p.section+'-'+p.shelf)?.bottom??opt.y,y=Y(footHeight(s)+bottom+s.thickness/2);
     const ax=X(opt.right-W/2),ink=selected?'#22604c':'#597182';
     drawing+='<g data-door-shelf-pick="'+p.section+':'+p.shelf+'" role="button" tabindex="0" aria-label="Стык на высоте '+(bottom+footHeight(s)+s.elevation)+' мм от пола"><title>До низа перегородки от пола</title><path d="M'+num(ax)+' '+num(y)+'h7" stroke="'+ink+'"/><rect x="'+num(ax+6)+'" y="'+num(y-8)+'" width="34" height="15" rx="3" fill="'+(selected?'#deece5':'#f6f8f7')+'"/><text x="'+num(ax+23)+'" y="'+num(y+3)+'" fill="'+ink+'" text-anchor="middle" font-size="9">'+(bottom+footHeight(s)+s.elevation)+'</text></g>';
    }
   }
   drawing+=label(200,312,legal?(d?leaves.length+' ств. · стык по перегородке':swingNames[front.swing]):'Проверьте параметры створки');
 }
 if(view==='sections'){
   const widths=sectionWidths(s);section=Math.max(0,Math.min(widths.length-1,section));
   const left=-W/2+s.thickness+widths.slice(0,section).reduce((sum,w)=>sum+w+s.thickness,0);
   const y=footHeight(s)+(s.bottomFit==='none'?0:s.thickness);
   if(selection?.level==null&&selectedShelf==null)drawing+='<rect x="'+num(X(left))+'" y="'+num(Y(H-s.thickness))+'" width="'+num(widths[section]*k)+'" height="'+num((H-s.thickness-y)*k)+'" fill="#316bb0" fill-opacity=".07" stroke="#316bb0" stroke-width="1.8"/>';
   let start=-W/2+s.thickness;
   for(const [sec,width] of widths.entries()){
     const shelves=built.parts.filter(p=>p.key.startsWith('shelf-'+sec+'-')).map(p=>panel(p.item));
     let base=footHeight(s)+openingBase(s,sec);
     if(editor){
       dimensions+=widthDimension(sec,start,width,Y(H)-5-(sec%2&&width*k<38?13:0));
       if(sec<widths.length-1)handles+=dividerHandle(sec,0,start+width+s.thickness/2,base,H-s.thickness,false);
     }
     for(let level=0;level<=shelves.length;level++){
       const top=shelves[level]?.y??(H-s.thickness),active=selection?.level===level&&sec===section;
       const zone=splitAt(s,sec,level);
       const columnRooms=c=>measuredRooms(s,sec,level,c,built.installedLevels).map(r=>({bottom:r.bottom+footHeight(s),top:r.top+footHeight(s)}));
       const title='Секция '+(sec+1)+', ниша '+(level+1);
       if(active){
         selectedOutline=highlight(start,base,width,top,sec+'-'+level);
         const side=zone?.kind==='drawers'?selection.column??0:0;
         const bank=built.drawerBanks?.[nicheSlot(sec,level,side)];
         if(bank){
           const faces=bank.faces,at=footHeight(s),last=faces.at(-1);
           function dimension(type,low,high,x,side,show){
             const a=Y(high),b=Y(low),px=X(x),value=mm(high-low),ink='#1d5284';
             const tick=(y)=>'M'+num(px-3)+' '+num(y+1.5)+'l6 -3';
             const title=(type==='cover'?'До полки':'Между фасадами')+' '+mmText(value)+' мм';
             return '<g data-drawer-dimension="'+type+'" data-mm="'+value+'" aria-label="'+title+'" pointer-events="none"><title>'+title+'</title>'+
               '<path d="M'+num(px)+' '+num(a)+'V'+num(b)+' '+tick(a)+' '+tick(b)+'" fill="none" stroke="'+ink+'" stroke-width="1"/>'+
               (show?'<text x="'+num(px+side*6)+'" y="'+num((a+b)/2+3)+'" text-anchor="'+(side<0?'end':'start')+'" fill="'+ink+'" stroke="#fbfcf7" stroke-width="3" paint-order="stroke" font-size="11">'+mmText(value)+' мм</text>':'')+'</g>';
           }
           const centre=start+width/2,leftSide=X(centre)<200?-1:1;
           if(bank.internal&&shelves[level])drawing+=dimension('cover',at+last.y+last.height,top,centre+leftSide*width*.37,leftSide,true);
           for(let j=1;j<faces.length;j++)drawing+=dimension('between',at+faces[j-1].y+faces[j-1].height,at+faces[j].y,centre-leftSide*width*.37,-leftSide,j===1);
         }
       }
       drawing+='<g class="niche-target" role="button" tabindex="0" data-section="'+sec+'" data-niche="'+level+'" aria-label="'+title+'"><title>'+title+'</title>'+
         '<rect x="'+num(X(start))+'" y="'+num(Y(top))+'" width="'+num(width*k)+'" height="'+num(Math.max(0,top-base)*k)+'" fill="'+(active&&!(editor&&zone)?'#2672bd':'transparent')+'" fill-opacity="'+(active?'.09':'1')+'" stroke="'+(active&&!(editor&&zone)?'#2672bd':'none')+'" stroke-width="1.8"/></g>';
       if(!zone&&selection?.dimensions&&(sec===section||editor&&widths.length<=2))dimensions+=measure(sec,level,base,top,start+width*.62);
       if(editor&&zone){
         let l=start;
         for(const [c,w] of columnWidths(zone,width).entries()){
           const col=zone.columns?.[c],rooms=col?columnRooms(c):[{bottom:base,top}];
           for(const [j,r] of rooms.entries()){
             const attrs=' data-section="'+sec+'" data-niche="'+level+'" data-split-section="'+level+'" data-column="'+c+'" data-opening="'+j+'"';
             const selected=active&&selection.column===c&&(selection.opening??0)===j;
             const caption=title+(c?' справа':' слева')+', проём '+(j+1);
             drawing+='<g class="niche-target" role="button" tabindex="0"'+attrs+' aria-label="'+caption+'"><title>'+caption+'</title>'+
               rect(X(l),Y(r.top),w*k,(r.top-r.bottom)*k,selected?'rgba(38,114,189,.12)':'transparent','none')+'</g>';
             if(selected)selectedOutline=highlight(l,r.bottom,w,r.top,sec+'-'+level+'-'+c+'-'+j);
             if(col&&active&&selection.column===c)dimensions+=measure(sec,j,r.bottom,r.top,l+w*.63,c,level);
             if(col&&j<rooms.length-1){
               const cy=Y((r.top+rooms[j+1].bottom)/2);
               handles+='<g class="shelf-target" role="button" tabindex="0"'+attrs+' data-shelf-index="'+j+'" data-drag-mm="height" data-scale="'+k+'" aria-label="Переместить полку колонки"><rect x="'+num(X(l))+'" y="'+num(cy-3)+'" width="'+num(w*k)+'" height="6" fill="transparent"/></g>';
             }
           }
           if(active)dimensions+=widthDimension(sec,l,w,Y(top)+12,level,c);
           if(c===0)handles+=dividerHandle(sec,level,l+w+9,base,top,true);
           l+=w+18;
         }
       }
       if(!editor&&zone&&sec===section&&selection?.splitLevel===level){
         const halves=columnWidths(zone,width);
         const first=start+halves[0];
         for(const [c,w] of halves.entries()){
           const l=c?first+18:start,cx=l+w/2,attrs='data-split-section="'+level+'" data-section="'+sec+'" data-column="'+c+'"';
           dimensions+='<g '+attrs+' role="button" tabindex="0" aria-label="Чистая ширина '+w+' мм">'+
             '<path d="M'+num(X(l))+' '+num(Y(top)+7)+'h'+num(w*k)+'m-3 -2l3 2 -3 2M'+num(X(l)+3)+' '+num(Y(top)+5)+'l-3 2 3 2" fill="none" stroke="#275d87"/>'+
             '<text x="'+num(X(cx))+'" y="'+num(Y(top)+6)+'" text-anchor="middle" fill="#204f77" stroke="white" stroke-width="2" paint-order="stroke" font-size="9">'+w+'</text></g>';
           if(zone.columns&&c===(selection.column??0))for(const [j,r] of columnRooms(c).entries())dimensions+=measure(sec,j,r.bottom,r.top,cx,c,level);
         }
       }
       if(shelves[level])base=top+shelves[level].h;
     }
     start+=width+s.thickness;
   }
   for(const {key,item} of built.parts){
     const match=/^shelf-(\d+)-(\d+)$/.exec(key);if(!match)continue;
     const q=panel(item),sec=Number(match[1]),index=Number(match[2]),cy=Y(q.y+q.h/2);
     const selected=section===sec&&selectedShelf===index;
     drawing+='<g class="shelf-target" role="button" tabindex="0" data-section="'+sec+'" data-shelf-index="'+index+'"'+(editor?' data-drag-mm="height" data-scale="'+k+'"':'')+' aria-label="Секция '+(sec+1)+', полка '+(index+1)+'"><title>Полка '+(index+1)+'</title>'+
       (selected?rect(X(q.x),Y(q.y+q.h),q.w*k,Math.max(2,q.h*k),'#9bc7f1','#2468a6'):'')+
       '<rect x="'+num(X(q.x))+'" y="'+num(cy-5)+'" width="'+num(q.w*k)+'" height="10" fill="transparent"/></g>';
   }
   for(const r of built.rods??[]){
     const y=Y(footHeight(s)+r.y),l=X(r.left),right=X(r.left+r.width),h=Math.max(2.6,k*(r.product.family==='round'?25:30));
     const active=selection?.rodId===r.id,fill={chrome:'#aebbbd',black:'#42484a',white:'#f2f1eb'}[r.product.finish];
     if(active){
       const edgeY=Y(footHeight(s)+(r.anchor==='top'?r.high:r.low)),px=l+(right-l)*.24,mid=(y+edgeY)/2;
       dimensions+='<g pointer-events="none" data-rod-dimension="'+r.id+'"><path d="M'+num(px)+' '+num(edgeY)+'V'+num(y)+'m-3 0h6 M'+num(px-3)+' '+num(edgeY)+'h6" stroke="#1769b5" fill="none"/>'+
        '<text x="'+num(px-4)+'" y="'+num(mid+3)+'" text-anchor="end" font-size="10" fill="#174c80" stroke="#fff" stroke-width="3" paint-order="stroke">'+r.offset+'</text></g>';
     }
     const local=r.column!=null?' data-column="'+r.column+'" data-opening="'+r.opening+'"':'';
     handles+='<g class="rod-target" role="button" tabindex="0" data-section="'+r.section+'" data-niche="'+r.level+'"'+local+' data-rod-id="'+r.id+'" data-scale="'+k+'" aria-label="Штанга AKS '+r.article+', секция '+(r.section+1)+'"><title>Штанга '+r.article+' · '+r.offset+' мм '+(r.anchor==='top'?'от верха':'от низа')+' ниши</title>'+
        '<rect x="'+num(l)+'" y="'+num(y-7)+'" width="'+num(right-l)+'" height="14" fill="transparent"/>'+
        rect(l,y-h/2,right-l,h,fill,active?'#1769b5':edge)+line(l+2,y-h*.2,right-2,y-h*.2,'opacity=".35"')+
        rect(l,y-h/2-1.4,2.5,h+2.8,fill)+rect(right-2.5,y-h/2-1.4,2.5,h+2.8,fill)+'</g>';
   }
   if(!editor)drawing+=label(200,313,'Секция '+(section+1)+' · '+widths[section]+' мм');
 }
 if(view==='fronts'||view==='sections'){
   for(const conflict of built.hingeConflicts??[]){
     const px=X((conflict.side==='left'?-1:1)*(W/2-s.thickness/2)),py=Y(conflict.y-s.elevation+(s.feet?.article==='118779'?10:0));
     drawing+='<g role="img" aria-label="Конфликт петель · секция '+(conflict.section+1)+'">'+circle(px,py,7,'#fff0eb','#b53d2a')+
       '<text x="'+num(px)+'" y="'+num(py+4)+'" text-anchor="middle" fill="#8b2515" font-size="12">!</text></g>';
   }
 }
 if(zoom){
   drawing+=line(X(-W/2)-10,Y(0)+1,X(W/2)+10,Y(0)+1);
   for(const [key,sign] of [['left',-1],['right',1]]){
     const x=X(sign*W/2);
     drawing+=line(x,Y(0)+2,x,257)+line(x,257,200+sign*98,257)+label(200+sign*98,279,plinthPanel(s)?floorSide(s,key)?'Стойка в пол':'До края / стены':'Без цоколя');
   }
 }
 return view==='sections'?'<g data-cabinet-art="">'+drawing+dimensions+handles+'</g>'+selectedOutline:drawing;
}
function underside(s){
 const k=Math.min(318/s.width,222/s.depth),L=200-s.width*k/2,T=162-s.depth*k/2;
 const X=x=>200+x*k,Y=z=>162+z*k;
 let d=rect(L,T,s.width*k,s.depth*k,wood),t=s.thickness*k;
 for(const edgeX of [L,L+s.width*k-t])d+=rect(edgeX,T,t,s.depth*k,end);
 const board=plinthPanel(s);if(board)d+=rect(X(board.x-board.width/2),Y(board.z-s.thickness/2),board.width*k,t,'#c2d2c8');
 const fitting=feetCatalogue.find(f=>f.article===s.feet?.article);
 for(const f of footPlan(s)){
   const x=X(f.x),y=Y(f.z),r=Math.max(4,(fitting?.radius??12)*k);
   if(fitting?.hull&&!f.centre)d+=polygon(fitting.hull.map(v=>{const [a,b]=turn(v,f.yaw);return [X(f.x+a),Y(f.z+b)];}),'#bdd8cd');
   d+=circle(x,y,r,'#d3e6dc')+circle(x,y,Math.max(2,r*.42),accent);
 }
 return d+label(200,T-12,'Задний край')+label(200,T+s.depth*k+22,'Передний край');
}
function rear(built){
 const s=built.spec,W=s.width,H=s.height+footHeight(s),k=Math.min(320/W,263/H);
 const X=x=>200-x*k,Y=y=>294-y*k;
 let d=rect(X(W/2),Y(H),W*k,s.height*k,wood);
 const p=built.parts.find(p=>p.key==='back')?.item;
 if(!p)return openBack();
 const y=p.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0);
 d+=rect(X(p.width/2),Y(y+p.height),p.width*k,p.height*k,s.backThickness?'#ede3cf':'#f5f4ee');
 const meta={spec:s,group_id:p.item_id.slice(0,-5)};
 const rows=backRows({...p,assistant_carcass:meta});
 for(const r of rows){
   const cam=r.kind==='cam',inset=cam?34:14;
   d+=circle(X(r.x+r.dx*inset),Y(y+r.y+r.dy*inset),cam?2.9:1.75,cam?accent:'#fff');
 }
 return d;
 function openBack(){
   return built.parts.filter(({item:i})=>i.blank_axis!=='front').map(({item:i})=>{
     const y=i.elevation_mm-s.elevation+(s.feet?.article==='118779'?10:0);
     return rect(X(i.x+i.width/2),Y(y+i.height),i.width*k,i.height*k,wood);
   }).join('');
 }
}
export function wardrobeDrawing(built,view='body',section=0,front=built.spec.front,selectedShelf=null,selection=null){
 const s=built.spec,feet=footPlan(s),shelves=(s.sectionShelves??Array(s.sections).fill(s.shelves)).reduce((a,b)=>a+b,0);
 const art=view==='body'?openCabinet(built):view==='back'?rear(built):view==='feet'?underside(s):elevationView(built,view,section,front,selectedShelf,selection);
 const notes={body:s.sections+' секц. · полок '+shelves+' · плита '+s.thickness+' мм',sections:'Вид спереди · чистая ширина выделенной секции',
   feet:feet.length?'Установлено опор: '+feet.length+' · арт. '+s.feet.article:'Опоры не выбраны',
   plinth:plinthPanel(s)?'Планка '+plinthPanel(s).height+' мм · верхний зазор 3 мм':'Цоколь для этого исполнения отсутствует',
   back:s.backThickness?'ЛДСП '+s.backThickness+' мм · ● эксцентрик   ○ шкант':s.back?'Накладная ЛХДФ 3 мм':'Открытый корпус без задней стенки',
   fronts:front?(front.division?.gola?'Профиль S · между фасадами 30 мм. ':front.topProfile?'Верхний профиль L · 30 мм. ':'')+'Выберите дверь на схеме. Ручку можно перетащить.':'Открытый шкаф'};
 let box;
 if(view==='sections'&&selection?.editor){
   const scale=Math.min(328/s.width,258/(built.height+footHeight(s)));
   const span=Math.max(146,s.width*scale+66);
   box=[num(200-span/2),-8,num(span),311].join(' ');
 }
 return {svg:sheet(view,art,box),caption:notes[view]};
}
