// Run the actual catalogue and scene loader without browser or network side effects.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const globals=Object.fromEntries(Object.entries(globalThis).filter(([k])=>k.startsWith('MF_')));
const context=vm.createContext({...globals,structuredClone,crypto,document:{body:{dataset:{}},getElementById:()=>null}});
vm.runInContext(source.slice(0,source.indexOf('let user=null')),context);
vm.runInContext(source.slice(source.indexOf('function templateFor('),source.indexOf('function legacyItem(')),context);
vm.runInContext(source.slice(source.indexOf('function refreshUpperSource('),source.indexOf('function scenePayload()')),context);
const catalogue=vm.runInContext('({bazisModules,templates:kitchenTemplates,moduleDefs})',context);
const state={room:{width:12000,depth:12000,height:5000},items:[]};
const adapter=new StateAdapter({catalogue,state:()=>state,selected:()=>null,template:it=>context.templateFor(it)});
const modules=catalogue.bazisModules.filter(m=>!m.component),accepted=[],rejected=[],defaults=[];
for(const module of modules){
 const original=adapter.createDraft({bazis:module.id});
 defaults.push(original);
 const variants={new:original,opened:context.normalizeScene({...state,items:[original]}).items[0]};
 // Existing projects may already contain the old inferred generic template.
 variants.legacy={...variants.opened,template_id:context.inferTemplate(original)};
 for(const [mode,item] of Object.entries(variants))for(const [axis,key] of [['width','w'],['height','h'],['depth','d']]){
  const [low,high]=module.limits[key];
  for(const value of new Set([low,item[axis],high,axis==='width'?800:item[axis]])){
   const changed=C.dimensionPatch(item,{[axis]:value});
   const row={id:module.id,mode,axis,value,item:changed},error=adapter.validate(changed,[changed]);
   (error?rejected:accepted).push(error?{...row,error}:row);
  }
 }
}
console.log(JSON.stringify({modules:modules.map(m=>m.id),defaults,accepted,rejected}));
