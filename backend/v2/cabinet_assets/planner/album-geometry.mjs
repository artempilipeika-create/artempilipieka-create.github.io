// Vector front projections from the same closed production parts used in 3D/export.
import {sourceProduction,productionParts,facadeCells,kitchenLegs,heights,tallGolaProfiles} from './furniture-core.mjs';
import {applianceLayout} from './appliance-assets.mjs';
const round=n=>Math.round(n*1000)/1000;

export function albumGeometry(items,templateFor=()=>null){
  return items.map(it=>{
    const production=sourceProduction(it),template=production?{production}:templateFor(it);
    const parts=productionParts(it,template),shapes=[],seen=new Set();
    const rect=(x,y,w,h,role='panel',label='')=>{
      if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
      const s={x:round(x),y:round(y),w:round(w),h:round(h),role,...(label?{label}:{})};
      const key=JSON.stringify(s);if(!seen.has(key)){seen.add(key);shapes.push(s);}
    };
    if(parts){
      for(const p of parts){
        if(p.role==='back'||p.role==='front'&&!p.fixed)continue;
        rect(p.position.x-p.size.x/2,p.position.y-p.size.y/2,p.size.x,p.size.y);
      }
    }else if(!it.bazis_id){
      // Exact generic editor carcass, not a guessed native donor.
      const b=heights(it).base_height,t=18;
      rect(-it.width/2,b,t,it.height-b);rect(it.width/2-t,b,t,it.height-b);
      rect(-it.width/2+t,b,it.width-2*t,t);rect(-it.width/2+t,it.height-t,it.width-2*t,t);
      for(const s of it.shelves||[])if(s.enabled!==false)rect(-(it.width-s.width_clearance)/2,b+s.offset_mm-s.thickness/2,it.width-s.width_clearance,s.thickness);
    }
    for(const f of facadeCells(it,template))rect(f.cx-f.w/2,f.cy-f.h/2,f.w,f.h,'front');
    for(const leg of kitchenLegs(it)||[]){rect(leg.position.x-10,4,20,leg.height-4,'hardware');rect(leg.position.x-16,0,32,6,'hardware');}
    if(production?.metal_drawers)for(const p of globalThis.MF_DRAWERS.metalParts(it,production))rect(p.position.x-p.size.x/2,p.position.y-p.size.y/2,p.size.x,p.size.y,'hardware');
    const profiles=production?.tall?.execution==='gola'?tallGolaProfiles(it):production?.cargo?globalThis.MF_CARGO.profiles(it):production?.dishwasher?globalThis.MF_ACCESSORIES.profiles(it):production?.gola?globalThis.MF_GOLA.profiles(it):[];
    for(const p of profiles){const ys=p.contour_yz.map(q=>q[0]);rect(p.x,Math.min(...ys),p.length,Math.max(...ys)-Math.min(...ys),'hardware');}
    // Basket envelopes use the same donor measurements as the WebGL scene.
    const basket=production?.pullout_dryer?globalThis.MF_PULLOUT_DRYERS.basket(it):production?.cargo?globalThis.MF_CARGO.basket(it):null;
    if(basket){
      const b=basket;
      if(production.cargo?.waste){rect(b.x-b.width/2+17,b.y+32,b.width-34,b.height-35,'hardware');rect(b.x-b.width/2,b.y,b.width,24,'hardware');}
      else for(const level of production.pullout_dryer?[0]:[0,b.height-100]){
        const h=production.pullout_dryer?b.height:50;
        rect(b.x-b.width/2+12,b.y+level,b.width-24,4,'hardware');
        rect(b.x-b.width/2+12,b.y+level+h-4,b.width-24,4,'hardware');
        for(let x=-b.width/2+28;x<b.width/2-20;x+=32)rect(b.x+x,b.y+level,2,h,'hardware');
      }
    }
    if(production?.dryer){
      // The legacy/source model records the rack, but not its mounting height.
      // Label its real purpose instead of inventing mounting geometry.
      rect(-it.width/2+22,heights(it).base_height+24,it.width-44,32,'label','Сушка');
    }
    for(const a of applianceLayout(it,production))rect(-a.width/2,a.nicheBottom,a.width,a.nicheHeight,'appliance',a.kind==='oven'?'ДШ':'СВЧ');
    if(production?.dishwasher)rect(-it.width/2+3,heights(it).base_height,it.width-6,it.height-heights(it).base_height,'appliance','ПММ');
    const h=heights(it);
    if(h.worktop_thickness>0)rect(-it.width/2,it.height,it.width,h.worktop_thickness,'counter');
    return {item_id:it.item_id,width:it.width,height:it.height,depth:it.depth,
      source_sha256:it.bazis_sha256||null,detail:parts?'native':it.bazis_id?'outline':'parametric',shapes};
  });
}
