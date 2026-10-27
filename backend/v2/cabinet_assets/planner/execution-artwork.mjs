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
 const p=PRODUCTION_MODELS[it?.bazis_id];
 if(p?.open_tall?.wall&&family==='open-tall'){const v=globalThis.MF_OPEN_TALL.select(it,{[key]:value},globalThis.MF_OPEN_TALL.variants);return '/account/planner/module-card-images/'+v.bazis_id.replace('bazis.','open-wall-')+'.webp?v=20261027-full-oak';}
 if(p?.open_tall&&!p.open_tall.wall&&family==='open-tall'&&key==='lighting'&&p.open_tall.light_system==='lira-17.5x6.5'&&['left','right','both'].includes(value))return '/account/planner/execution-card-images/open-tall-lira-'+value+'.webp?v=20261027-full-oak';
 if(p?.cargo?.waste&&family==='cargo'){const v=globalThis.MF_CARGO.select(it,{[key]:value},globalThis.MF_CARGO.variants);return '/account/planner/module-card-images/'+(globalThis.MF_CARGO.info(v).execution==='gola'?'waste-gola':'waste-standard')+'.webp';}
 const category=executionCategory(it,family),file=EXECUTION_IMAGES[[category,family,key,value].join(':')];
 return file?'/account/planner/execution-card-images/'+file+'?v=20261027-full-oak':null;
}
