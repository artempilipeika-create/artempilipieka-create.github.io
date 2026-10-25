(function(root){
 'use strict';
 const version='20261026-catalogue-quality';
 function image(file){return '/account/planner/module-card-images/'+file+'.webp?v='+version;}
 function corner(controls,variant){
  if(!variant)return;
  const text={side:{left:['Левый угол','Бленда слева'],right:['Правый угол','Бленда справа']},purpose:{sink:['Под мойку','Без полки'],shelf:['С полкой','Полка внутри']},door_count:{1:['Одна дверь','Один фасад'],2:['Две двери','Два фасада']}};
  for(const b of controls.querySelectorAll('[data-corner-option]')){
   const key=b.dataset.cornerOption,value=b.dataset.cornerValue,v={...variant,[key]:value},url=image(`corner-${v.side}-${v.purpose}-${v.door_count}`);
   if(!b.querySelector('img')){b.replaceChildren();const img=document.createElement('img');img.alt='';img.width=640;img.height=480;img.loading='lazy';img.draggable=false;const title=document.createElement('strong'),hint=document.createElement('small');[title.textContent,hint.textContent]=text[key][value];b.append(img,title,hint);}
   const img=b.querySelector('img');if(img.getAttribute('src')!==url)img.src=url;
  }
 }
 // Magnify the exact source seam at the inside corner so its curved lead-in is visible.
 function jointDetail(joint){
  const points=joint==='euro'?root.MF_COUNTERTOPS.source('left','euro').panels[0].points.filter(([x,z])=>x>=540&&x<=600&&z>=580):[[540,600],[600,600]];
  const path='M '+[[540,joint==='euro'?585:600],...points,[600,600]].map(([x,z])=>((x-540)*2+8).toFixed(3)+','+((z-570)*2+8).toFixed(3)).join(' L ');
  return '<svg viewBox="0 0 140 94" aria-hidden="true"><path d="M8 8H132V68H128V86H8Z" fill="#eee9dc" stroke="#a3a99e"/><path d="'+path+'" fill="none" stroke="#2674b5" stroke-width="2.5" stroke-linejoin="round"/><path d="M128 68H138M128 68V90" stroke="#777f74"/></svg>';
 }
 root.MF_CHOICE_CARDS=Object.freeze({image,corner,jointDetail});
})(globalThis);
