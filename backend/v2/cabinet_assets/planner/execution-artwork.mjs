import {PRODUCTION_MODELS} from './furniture-core.mjs';
import {EXECUTION_IMAGES} from './execution-image-index.mjs';

// Reviewed illustrative photographs. The hero stays tied to current production geometry.
export function executionCategory(it,family){
 const p=PRODUCTION_MODELS[it?.bazis_id];if(!p)return null;
 if(p.cargo)return 'cargo';if(p.pullout_dryer)return 'dryer';
 if(p.open_tall)return 'open-tall-none';if(p.vitrine)return 'tall-vitrine';
 if(p.tall)return p.tall.family==='appliance'?'tall-appliance':'tall-storage';
 if(p.corner)return 'corner';if(p.dishwasher)return 'dishwasher';
 if(p.upper)return p.upper.door_count===2?'upper-double':'upper';
 if(family==='drawer'||globalThis.MF_DRAWERS?.familyInfo(it))return 'drawer';
 if(family==='base')return (p.gola?.door_count||p.doors?.length)===2?'base-double':'base';
 if(family==='generic')return 'oven';
 return null;
}
export function executionArtwork(it,family,key,value){
 const category=executionCategory(it,family),file=EXECUTION_IMAGES[[category,family,key,value].join(':')];
 return file?'/account/planner/execution-card-images/'+file+'?v=20261026-tripo':null;
}
