import models from './plinth-feet.json' with {type:'json'};

import {decorFoot} from './decor-feet.mjs';
export const plinthFeet=models;
export const plinthFoot=spec=>models.find(row=>row.article===spec?.feet?.article);
export const footHeight=spec=>decorFoot(spec)?.height??plinthFoot(spec)?.height??(spec?.feet?10:0);
export const floorSide=(spec,key)=>Boolean(plinthFoot(spec)&&spec.feet[key]==='side');
export const plinthClearanceMm=3;
export function plinthPanel(spec){
 const leg=plinthFoot(spec);
 if(!leg)return null;
 const height=leg.height-plinthClearanceMm;
 const left=floorSide(spec,'left')?spec.thickness:0,right=floorSide(spec,'right')?spec.thickness:0;
 return {height,width:spec.width-left-right,x:(left-right)/2,
   z:spec.depth/2-spec.feet.front+30+spec.thickness/2};
}
