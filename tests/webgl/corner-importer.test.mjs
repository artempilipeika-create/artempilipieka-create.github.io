import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {CORNER_VARIANTS,PRODUCTION_MODELS,productionParts,normalizeKitchen} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const source=fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_native_v9_3_ONE_CLICK.js',import.meta.url),'utf8');
const require=createRequire(import.meta.url);
test('Native corner materials: equal names resolve by fixed panel width; only known hashes opt in',()=>{
 const context=vm.createContext({require,process,console,elasticTransformation:{GetObjectLocalSize:p=>p.size}});
 vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),context);
 for(const v of CORNER_VARIANTS){
  const it={source_sha256:v.source_sha256};
  for(const size of [{x:717,y:120,z:18},{x:120,y:797,z:18}])assert.equal(context.panelMaterialKind('ФП',{size},it),'front');
  assert.equal(context.panelMaterialKind('ФП',{size:{x:717,y:458,z:18}},it),'body');
  assert.equal(context.panelMaterialKind('ФП_задняя',{},it),'body');
  assert.equal(context.panelMaterialKind('Бленда',{},it),'front');
  assert.equal(context.panelMaterialKind('Вставка',{},it),'body');
  assert.equal(context.panelMaterialKind('ФП',{size:{x:500,y:500,z:18}},it),null);
 }
 assert.equal(context.panelMaterialKind('ФП',{size:{x:717,y:120,z:18}},{source_sha256:'unknown'}),'body');
 assert.equal(context.panelMaterialKind('Фасад'),'front');assert.equal(context.panelMaterialKind('З.С'),'hdf');
});
for(const v of CORNER_VARIANTS)test(v.label+': native frame placement through all rotations',()=>{
 const it=normalizeKitchen({item_id:v.id,bazis_id:v.id,bazis_sha256:v.source_sha256,module_type:'base_cabinet',width:1000,height:820,depth:510,base_height:100,base:'plinth',shelves:PRODUCTION_MODELS[v.id].shelves});
 for(const angle of [0,90,180,270]){
  const obj={min:{x:0,y:0,z:0},size:{x:1000,y:820,z:510},angle:0,Count:0,AsList(){return this;},SetDefaultTransform(){this.angle=0;this.PositionX=this.PositionY=this.PositionZ=0;},
   ToGlobal(p){const c=Math.cos(this.angle),s=Math.sin(this.angle);return{x:c*p.x+s*p.z+this.PositionX,y:p.y+this.PositionY,z:-s*p.x+c*p.z+this.PositionZ};}};
  const context=vm.createContext({require,process,console,elasticTransformation:{GetObjectLocalSize:o=>o.size,GetObjectMinLocalPoint:o=>o.min},
   objectTypeChecker:{ObjectIsPanel:()=>false},objectTransformation:{RotateObject:(o,axis,degrees)=>{o.angle=degrees*Math.PI/180;}}});
  vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),context);
  const position={x:1300,y:0,z:-1200},input={source_sha256:v.source_sha256,source_default:{width:1000,height:820,depth:510},target:{width:1000,height:820,depth:510},position,rotation:angle,name:v.label};
  context.resizeAndPlace(obj,input,[]);
  const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  for(const part of productionParts(it,{production:PRODUCTION_MODELS[v.id]})){
   const q=part.position,actual=obj.ToGlobal({x:q.x+500,y:q.y,z:q.z+255});
   const expected={x:position.x+c*q.x-s*q.z,y:q.y,z:position.z+s*q.x+c*q.z};
   for(const k of ['x','y','z'])assert.ok(Math.abs(actual[k]-expected[k])<1e-6,part.key+' '+k);
  }
 }
});
