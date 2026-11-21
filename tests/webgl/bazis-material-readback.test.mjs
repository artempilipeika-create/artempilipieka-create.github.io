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
  api:async()=>({roles:['admin']}),MF_CONSTRUCTOR_ACCESS:{apply:()=>true},$:()=>button,status:s=>status.push(s),hydrateMaterials:async()=>{events.push('load');await loaded;materials.set('BODY18',body);materials.set('BOX16',drawer);},exportBazisProject:()=>events.push('export')});
 vm.runInContext(frontend.slice(frontend.indexOf('async function exportBazisProjectReady('),frontend.indexOf('function exportBazisProject(){')),c);
 const pending=c.exportBazisProjectReady();assert.equal(button.disabled,true);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['load']);
 release();await pending;assert.deepEqual(events,['load','export']);assert.equal(button.disabled,false);
 c.hydrateMaterials=async()=>{};materials.delete('BOX16');await c.exportBazisProjectReady();
 assert.deepEqual(events,['load','export']);assert.ok(status.at(-1).includes('не удалось загрузить выбранные материалы'));assert.equal(button.disabled,false);
});

// Rectangles and orientations from the four pinned workshop FR3Ds. Deliberately
// keep GSize cached: the production check must read built contour coordinates.
function trimPanel(name,box,origin,axes,edgeIndices) {
 const native=panel(name,18),lines=[],edges=edgeIndices.map(ElemIndex=>({ElemIndex,Thickness:1}));
 const vector=p=>[p.x,p.y,p.z];
 const point=p=>({x:p[0],y:p[1],z:p[2]});
 const contour={Objects:lines,get Count(){return lines.length;},Clear(){lines.length=0;},
  AddLine(x,y,u,v){lines.push({Pos1:{x,y},Pos2:{x:u,y:v}});}};
 const [x,y,w,h]=box;
 contour.AddLine(x,y,x+w,y);contour.AddLine(x+w,y,x+w,y+h);
 contour.AddLine(x+w,y+h,x,y+h);contour.AddLine(x,y+h,x,y);
 return Object.assign(native,{Contour:contour,GSize:{x:w+2,y:h+2,z:18},
  ToGlobal(p){const q=vector(p);return point(axes.map((axis,i)=>origin[i]+Math.sign(axis)*q[Math.abs(axis)-1]));},
  ToObject(p){const q=vector(p),local=[];axes.forEach((axis,i)=>local[Math.abs(axis)-1]=(q[i]-origin[i])*Math.sign(axis));return point(local);},
  TranslateGCS(v){vector(v).forEach((n,i)=>origin[i]+=n);},
  Butts:{Butts:edges,get Count(){return edges.length;},Clear(){edges.length=0;},Add(){const edge={};edges.push(edge);return edge;}}});
}
const frame=(x,y,z)=>({min:{x:0,y:0,z:0},size:{x,y,z}});
function contourSize(panel){
 const pts=panel.Contour.Objects.map(e=>e.Pos1);
 return ['x','y'].map(k=>Math.max(...pts.map(p=>p[k]))-Math.min(...pts.map(p=>p[k])));
}

test('keeps distinct assignments on the two identically named ceiling rails and counts the native joint after resize',()=>{
 const c=runtime(),foot=material('Нижняя планка по образцу','BASE',18);
 c.objectData={
  GetObjectUserProperties:p=>new Map(p.props),SetObjectUserProperties:(p,v)=>{p.props=v;},
  GetObjectNotes:p=>p.note||'',SetObjectNotes:(p,v)=>{p.note=v;}
 };
 const face=trimPanel('Фальш Планка Вверх',[0,0,1000,100],[0,0,82],[1,2,3],[0,2,3,1]);
 const rail=trimPanel('Закладная',[0,18,1000,82],[1000,0,82],[-1,2,-3],[]);
 const base=trimPanel('Закладная',[0,0,82,1000],[0,0,0],[2,3,1],[0,2,1]);
 const joint=group(Array.from({length:3},()=>[{Name:'Эксцентриковая стяжка 18мм'},{Name:'Шкант деревянный 8*35'}]).flat());
 joint.Name='Ст.Эксцентриковая 18мм+шкант -100';
 const root=group([base,face,joint,rail]);root.ToObject=root.ToGlobal=p=>p;
 const item={name:'Закладная',cabinet_block:{name:'Шкаф 05'},source_sha256:'1593b2bf163f12120e40c96b9feca7ff7a035da5ba5b67f96f197b97aaf7f5a9',
  wardrobe_trim:{kind:'cap',panels:[
   {role:'face',name:'Лицевая',material:front,edge_code:'1111',edge_thickness:1},
   {role:'upright',name:'Вровень с потолком',material:body,edge_code:'0010',edge_thickness:2,production_note:'Метка A'},
   {role:'base',name:'Нижняя',material:foot,edge_code:'1011',edge_thickness:1}
  ]}};
 const before=c.inspectTrim(root,item);
 const log=[],from=frame(1000,100,100),to=frame(940,80,100);
 const {materialChecks,outlines}=c.finishTrim(root,item,before,from,to,log);
 assert.equal(materialChecks.length,3);assert.equal(outlines.length,3);
 assert.deepEqual([face,rail,base].map(contourSize),[[940,80],[940,62],[82,940]]);
 assert.deepEqual([face,rail,base].map(p=>p.Butts.Count),[4,1,3]);
 assert.deepEqual([face,rail,base].map(p=>p.MaterialName),[front,body,foot].map(m=>m.name+'\r'+m.article));
 assert.deepEqual([face,rail,base].map(p=>p.Name),['Лицевая','Вровень с потолком','Нижняя']);
 assert.equal(rail.props.get('Узел для бирки'),'Шкаф 05 · Закладная');assert.match(rail.note,/Метка A/);
 assert.deepEqual(rail.Butts.Butts.map(e=>[e.ElemIndex,e.Thickness]),[[1,2]]);
 assert.equal(c.verifyTrimFittings({root,kind:'cap',count:3}).cams,3);
 assert.throws(()=>c.verifyTrimFittings({root,kind:'cap',count:5}),/в ведомости 5 пар, в БАЗИС 3/);
 assert.equal(c.verifyTrimFittings({root,kind:'cap',count:null,outlines}).dowels,3);
 face.Contour.Objects[2].Pos1.x-=2;
 assert.throws(()=>c.verifyTrimFittings({root,kind:'cap',count:3,outlines}),/Лицевая.*торец 3.*Требуется XYZ/);
});

test('fits mirrored filler returns, split heights and the projecting end panel without using cached GSize',()=>{
 const c=runtime(),root={ToObject:p=>p,ToGlobal:p=>p};
 for(const side of ['left','right','end']){
  for(const h of [100,1013.25,2500,2780]){
   const isEnd=side==='end',w=isEnd?18:85,d=isEnd?620:100,source=frame(isEnd?18:100,1000,100);
   const instance=trimPanel(isEnd?'Торцевая Стойка':'Боковая Проставка',[0,0,isEnd?100:82,1000],
    [side==='right'?100:18,0,0],[-3,2,1],isEnd?[1,2,3,0]:[2,0,3]);
   const before=c.trimOutline(root,instance),plan=vm.runInContext('TRIM_PLANES',c)[side];
   const expected=c.targetTrimOutline(before,plan,source,frame(w,h,d));
   const check={panel:instance,points:expected,name:instance.Name},log=[];
   c.fitTrimOutline(root,check,log);
   assert.deepEqual(contourSize(instance),[isEnd?d:82,h]);
   assert.equal(instance.ToGlobal({x:0,y:0,z:0}).x,side==='right'?w:18);
   assert.equal(log.length,1);
   c.fitTrimOutline(root,check,log);assert.equal(log.length,1);
   c.verifyTrimOutline(root,check);
   if(!isEnd){
    const face=trimPanel('Фасад.Глухой',[0,0,100,1000],[0,0,82],[1,2,3],[3,1,2,0]);
    const wanted=c.targetTrimOutline(c.trimOutline(root,face),plan,source,frame(w,h,d));
    c.fitTrimOutline(root,{panel:face,points:wanted,name:'Глухой фасад'},log);
    assert.deepEqual(contourSize(face),[w,h]);
   }
  }
 }
});
