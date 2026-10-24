import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const frontend=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const donors=JSON.parse(fs.readFileSync(new URL('./fixtures/drawer-native-panels.json',import.meta.url),'utf8'));
const material=(name,article,thickness)=>({name,article,thickness,variant_id:article});
const body=material('Корпус выбранный','BODY18',18),drawer=material('Шуфляды выбранные','BOX16',16),front=material('Фасад выбранный','FRONT18',18),hdf=material('ЛХДФ белый','HDF3',3);
const part=(role,m)=>({role,thickness:m.thickness,material:m});
const panel=(name,thickness)=>({Name:name,Thickness:thickness,isPanel:true,MaterialName:'Корпус стандартный',Material:{Path:'donor.jpg'},Build(){}});
const group=objects=>({Name:'Блок',AsList(){return this;},Count:objects.length,Objects:objects});
function runtime(options={}){
 const c=vm.createContext({require,console,process,
  objectTypeChecker:{ObjectIsPanel:p=>Boolean(p.isPanel)},historyOperations:{RegisterObjectChanging(){}},
  materialData:{CreateMaterialData(name,thickness){if(options.createFails)throw Error('create failed');return {name,thickness};},
   SetupObjectMaterial(p,m,change){assert.equal(change,false);if(!options.noOp)p.MaterialName=m.name;}}
 });
 vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);return c;
}
function item(hash='ordinary'){
 return {name:'Модуль',source_sha256:hash,construction:{parts:[part('body',body),part('drawer',drawer),part('front',front),part('back',hdf)]}};
}

test('605 PO and 890 PO keep the exact original M1 catalogue identity in native BAZIS names',()=>{
 const raw=fs.readFileSync(new URL('../../data.js',import.meta.url),'utf8'),catalogue=JSON.parse(raw.slice(raw.indexOf('{')).trim().replace(/;$/,''));
 const c=runtime(),ids={'605 PO':'71118e45-0ce3-534b-ad68-db1238304f18','890 PO':'389a2abc-c6e2-5214-a41b-60054320d0ff'};
 for(const article of Object.keys(ids)){
  const original=catalogue.materials.find(m=>m.article===article&&m.thickness===18);
  const descriptor={name:original.name.replace(/\s+/g,' '),article,thickness:18,variant_id:ids[article]};
  const panel18=panel('Корпус',18),log=[];
  assert.equal(c.applyProjectMaterials(panel18,{name:'Шкаф',material_assignments:{body:descriptor}},log).length,1);
  assert.equal(panel18.MaterialName,original.name+'\r'+original.article);
  assert.equal(panel18.Thickness,18);
 }
 const custom={name:'Материал 605 PE',article:'605 PE',thickness:16};
 assert.equal(c.materialNameForBazis(custom),'Материал 605 PE\r605 PE');
 assert.equal(c.materialNameForBazis({...custom,name:'Материал 605 PE\r605 PE'}),'Материал 605 PE\r605 PE');
});

test('All audited AQ/Slimbox panels receive distinct 18/16/3 mm materials with native readback',()=>{
 for(const donor of Object.values(donors)){
  const c=runtime(),panels=donor.panels.map(p=>panel(p.name,p.thickness)),log=[];
  const checks=c.applyProjectMaterials(group(panels),item(donor.sha256),log);
  assert.ok(checks.length>10);assert.ok(!log.some(s=>s.startsWith('ОШИБКА МАТЕРИАЛА:')),log.join('\n'));
  for(const p of panels){
   if(p.Thickness<1){assert.equal(p.MaterialName,'Корпус стандартный');continue;}
   const expected=p.Thickness===16?drawer:p.Thickness===3?hdf:p.Name==='Фасад'?front:body;
   assert.equal(p.MaterialName,expected.name+'\r'+expected.article);
   assert.equal(p.Thickness,expected.thickness);
  }
 }
});

test('Ordinary drawer walls use body; named drawer facade and thin bottom retain their own materials',()=>{
 const c=runtime(),panels=[panel('ЗАДНЯЯ ШУФ',18),panel('Фронтальная ШУФ',18),panel('Фасад ящика',18),panel('Дно ящика',3),panel('Задняя стенка шуфляды',3)],log=[];
 c.applyProjectMaterials(group(panels),item(),log);
 assert.deepEqual(panels.map(p=>p.MaterialName),[body,body,front,hdf,hdf].map(m=>m.name+'\r'+m.article));
 assert.ok(!log.some(s=>s.startsWith('ОШИБКА МАТЕРИАЛА:')));
});

test('Full name fallback replaces standard donor name when native setup is a no-op',()=>{
 const c=runtime({noOp:true}),p=panel('Корпус',18),log=[];
 const checks=c.applyProjectMaterials(p,item(),log);
 assert.equal(p.MaterialName,body.name+'\r'+body.article);assert.equal(checks.length,1);
 assert.ok(log.some(s=>s.startsWith('МАТЕРИАЛ OK:')));
});

test('Refused readback and material creation failures are reported, never swallowed',()=>{
 for(const createFails of [false,true]){
  const c=runtime({noOp:true,createFails}),p=panel('Корпус',18),log=[];
  Object.defineProperty(p,'MaterialName',{get:()=> 'Корпус стандартный',set(){}});
  assert.equal(c.applyProjectMaterials(group([group([p])]),item(),log).length,0);
  assert.ok(log.some(s=>s.startsWith('ОШИБКА МАТЕРИАЛА:')&&s.includes(createFails?'create failed':'не применился')));
  assert.ok(!log.some(s=>s.startsWith('МАТЕРИАЛ OK:')));
 }
 const c=runtime();assert.throws(()=>c.walkPanels(panel('Корпус',18),()=>{throw Error('read error');}),/read error/);
});

test('Nested indexed and callable child collections work; missing children produce an error',()=>{
 const c=runtime(),p=panel('Корпус',18),root={Name:'Root',AsList(){return this;},Count:1,Objects:i=>i===0?group([p]):null},log=[];
 assert.equal(c.applyProjectMaterials(root,item(),log).length,1);
 root.Objects=()=>undefined;assert.throws(()=>c.applyProjectMaterials(root,item(),[]),/Не прочитан вложенный объект/);
});

test('Selected material survives an export without a construction template; incompatible thickness is refused',()=>{
 const c=runtime(),p=panel('Корпус',18),input={name:'Без шаблона',material_assignments:{body}},log=[];
 assert.equal(c.applyProjectMaterials(p,input,log).length,1);assert.equal(p.MaterialName,body.name+'\r'+body.article);
 const thin=panel('Корпус',16);assert.equal(c.applyProjectMaterials(thin,input,log).length,0);
 assert.equal(thin.MaterialName,'Корпус стандартный');assert.ok(log.some(s=>s.includes('не соответствует детали')));
});

test('Missing 16 mm selection stays unassigned and emits an explicit material error',()=>{
 const c=runtime(),input=item(Object.values(donors)[0].sha256);input.construction.parts=input.construction.parts.filter(p=>p.role!=='drawer');
 const p=panel('Дно AQ LineBox',16),log=[];
 assert.equal(c.applyProjectMaterials(p,input,log).length,0);assert.equal(p.MaterialName,'Корпус стандартный');
 assert.ok(log.some(s=>s.startsWith('ОШИБКА МАТЕРИАЛА:')&&s.includes('drawer')));
});

test('Import verifies actual material after Commit and serializes diagnostics without native objects',()=>{
 for(const resetAtCommit of [false,true]){
  const c=runtime(),p=panel('Корпус',18),model={Count:1},obj=group([p]);
  Object.assign(obj,{PositionX:0,PositionY:0,PositionZ:0,ToGlobal(v){return {x:v.x+this.PositionX,y:v.y,z:v.z+this.PositionZ};},
   TranslateGCS(v){this.PositionX+=v.x;this.PositionZ+=v.z;}});
  Object.defineProperties(obj,{GabMin:{get(){return {x:this.PositionX,y:0,z:this.PositionZ};}},GabMax:{get(){return {x:this.PositionX+600,y:720,z:this.PositionZ+510};}}});
  c.currentFileData={model};c.modelIOOperations={LoadFastenerOrFragment:()=>obj};
  c.resizeAndPlace=(o,input,log)=>({materialChecks:c.applyProjectMaterials(o,input,log)});
  c.historyOperations.CommitCurrentChanges=()=>{if(resetAtCommit)p.MaterialName='Корпус стандартный';};
  const input=item(),result=c.importProject({entries:[{item:input,source:'fixture'}]},'/fixture',{items:[input]});
  assert.equal(result.materialChecks.length,1);assert.equal(result.materialChecks[0].verified,!resetAtCommit);
  assert.equal(result.materialErrors,resetAtCommit?1:0);
  assert.doesNotThrow(()=>JSON.stringify(result));assert.ok(!('panel' in result.materialChecks[0]));
 }
});

test('Export button waits for selected body and drawer materials; unresolved selection cannot create a JSON',async()=>{
 const materials=new Map(),button={disabled:false},status=[],events=[];
 let release;const loaded=new Promise(r=>{release=r;});
 const c=vm.createContext({state:{items:[{name:'Шкаф',bazis_file:'cabinet.fr3d',body_variant_id:'BODY18',part_materials:{drawer:'BOX16'}}]},materials,
  $:()=>button,status:s=>status.push(s),hydrateMaterials:async()=>{events.push('load');await loaded;materials.set('BODY18',body);materials.set('BOX16',drawer);},exportBazisProject:()=>events.push('export')});
 vm.runInContext(frontend.slice(frontend.indexOf('async function exportBazisProjectReady('),frontend.indexOf('function exportBazisProject(){')),c);
 const pending=c.exportBazisProjectReady();assert.equal(button.disabled,true);assert.deepEqual(events,['load']);
 release();await pending;assert.deepEqual(events,['load','export']);assert.equal(button.disabled,false);
 c.hydrateMaterials=async()=>{};materials.delete('BOX16');await c.exportBazisProjectReady();
 assert.deepEqual(events,['load','export']);assert.ok(status.at(-1).includes('не удалось загрузить выбранные материалы'));assert.equal(button.disabled,false);
});
