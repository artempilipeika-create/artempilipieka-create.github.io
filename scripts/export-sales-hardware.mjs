// Regenerate after changing the native legacy catalogue; checked by the sales tests.
import fs from 'node:fs';
import {PILOT_PRODUCTION,WALL_PRODUCTION,SPECIAL_BASE_PRODUCTION} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const models={...PILOT_PRODUCTION,...WALL_PRODUCTION,...SPECIAL_BASE_PRODUCTION};
const keys=['source_sha256','label','tier','body_height','base_height','native_defaults','hardware','shelves','shelf_rule','dryer','doors','front'];
const data=Object.fromEntries(Object.entries(models).map(([id,p])=>[id,Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))]));
const output=JSON.stringify(data,null,2)+'\n';
const target=new URL('../backend/v2/sales_hardware.json',import.meta.url);
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==output)throw Error('Run node scripts/export-sales-hardware.mjs');}
else fs.writeFileSync(target,output);
