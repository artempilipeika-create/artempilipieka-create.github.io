import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const file=process.env.MF_NATIVE_IMPORTER || new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const axes=['x','y','z'];
const origin={x:0,y:0,z:0};
const add=(a,b)=>Object.fromEntries(axes.map(k=>[k,a[k]+b[k]]));
const sub=(a,b)=>Object.fromEntries(axes.map(k=>[k,a[k]-b[k]]));
function rotate(p,angle) {
  const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  return {x:p.x*c-p.z*s,y:p.y,z:p.x*s+p.z*c};
}
function samePoint(actual,expected) {
  for (const k of axes) assert.ok(Math.abs(expected[k]-actual[k])<1e-7,`${k}: ${expected[k]} vs ${actual[k]}`);
}
const sample=[origin,{x:50,y:0,z:0},{x:0,y:87,z:0},{x:0,y:0,z:23}];

class Obj {
  constructor(kind,name,owner) {
    this.kind=kind;
    this.Name=name;
    this.Objects=[];
    this.pos={...origin};
    this.yaw=0;
    this.note='';
    this.props=new Map();
    this.Owner=owner;
  }
  get Owner(){return this.parent;}
  set Owner(to) {
    if(this.parent) this.parent.Objects.splice(this.parent.Objects.indexOf(this),1);
    this.parent=to;
    if(to) to.Objects.push(this);
  }
  AsList(){return this;}
  get Count(){return this.Objects.length;}
  IndexOf(obj){return this.Objects.indexOf(obj);}
  get PositionX(){return this.pos.x;}
  get PositionY(){return this.pos.y;}
  get PositionZ(){return this.pos.z;}
  set PositionX(v){this.pos.x=v;}
  set PositionY(v){this.pos.y=v;}
  set PositionZ(v){this.pos.z=v;}
  get worldYaw(){return this.yaw+(this.parent?.worldYaw||0);}
  ToGlobal(p){
    const local=add(rotate(p,this.yaw),this.pos);
    return this.parent?this.parent.ToGlobal(local):local;
  }
  ToObject(p){
    const local=this.parent?this.parent.ToObject(p):p;
    return rotate(sub(local,this.pos),-this.yaw);
  }
  TranslateGCS(p) {
    const translated=add(this.ToGlobal(origin),p);
    this.pos=this.parent?this.parent.ToObject(translated):translated;
  }
  ReTransform(from,to) {
    this.pos=to.ToObject(from.ToGlobal(this.pos));
    this.yaw+=from.worldYaw-to.worldYaw;
    if(this.badTransform) this.pos.x+=3;
  }
  get corners() {
    if(this.kind==='frame') return [];
    if(this.Objects.length) return this.Objects.flatMap(obj=>obj.corners);
    const rows=[];
    for(const x of [0,42]) for(const y of [0,100]) for(const z of [0,18]) rows.push(this.ToGlobal({x,y,z}));
    return rows;
  }
  get GabMin(){return Object.fromEntries(axes.map(k=>[k,Math.min(...this.corners.map(p=>p[k]))]));}
  get GabMax(){return Object.fromEntries(axes.map(k=>[k,Math.max(...this.corners.map(p=>p[k]))]));}
}

function restore(obj,owner) {
  const fresh=new Obj(obj.kind,obj.Name,owner);
  fresh.note=obj.note;
  fresh.props=new Map(obj.props);
  fresh.pos={...obj.pos};
  fresh.yaw=obj.yaw;
  fresh.MaterialName=obj.MaterialName;
  fresh.Thickness=obj.Thickness;
  for(const child of obj.Objects) restore(child,fresh);
  return fresh;
}
function setup() {
  const model=new Obj('model','Модель');
  new Obj('frame','Габаритная рамка',model);
  const c=vm.createContext({
    require,process,console,currentFileData:{model},
    objects3d:{
      NewBlock:(name,owner)=>new Obj('group',name,owner),
      DeleteObject:(obj)=>{obj.Owner=null;},
    },
    objectData:{
      GetObjectNotes:obj=>obj.note,
      SetObjectNotes:(obj,value)=>{obj.note=value;},
      GetObjectUserProperties:obj=>new Map(obj.props),
      SetObjectUserProperties:(obj,props)=>{obj.props=new Map(props);},
    },
    objectTypeChecker:{ObjectIsLimits:obj=>obj.kind==='frame',ObjectIsPanel:obj=>obj.kind==='panel'},
    historyOperations:{RegisterObjectChanging(){},CommitCurrentChanges(){}},
    modelIOOperations:{LoadFastenerOrFragment(file,owner){
      if(file.startsWith('missing')) throw Error('Фрагмент отсутствует');
      const donor=new Obj('fragment','Фрагмент',owner);
      if(file.startsWith('hardware')){
        const native=new Obj('fitting','AK700',donor);
        new Obj('hole','Отверстие Ø5',native);
      }else if(file.startsWith('board')){
        new Obj('frame','Габаритная рамка',donor);
        const panel=new Obj('panel','Заготовка_Вертикальная',donor);
        panel.yaw=17;
        panel.pos={x:4,y:5,z:6};
        panel.MaterialName='ЛДСП 18 мм';
        panel.Thickness=18;
        panel.props.set('Покрытие','С двух сторон');
        if(file==='board-bad-transform') panel.badTransform=true;
        if(file==='board-machined') new Obj('hole','Сохраняемая фрезеровка',donor);
      }else{
        new Obj('panel','Кухонный модуль',donor);
      }
      return donor;
    }},
    placement(obj,item) {
      obj.yaw=item.rotation||0;
      obj.pos={...item.position};
      const panel=obj.Objects.find(ch=>ch.kind==='panel');
      if(panel) item.expected=sample.map(p=>panel.ToGlobal(p));
      return {materialChecks:item.blank&&panel?[{panel,expected:panel.MaterialName,thickness:panel.Thickness}]:[]};
    }
  });
  vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);
  vm.runInContext('resizeAndPlace=placement;',c);
  return c;
}
const group=(id,name,part_name,drawer_key,drawer_name)=>({id,name,part_name,drawer_key,drawer_name});
function row(source,id,meta,props={}) {
  return {source_file:source,source_sha256:'fixture-'+source,name:'Старое название '+id,
    blank_item_id:id,cabinet_block:meta,position:{x:200,y:250,z:-60},...props};
}
function run(c,items) {
  return c.importProject({entries:items.map(item=>({item,source:item.source_file}))},'/fixture',{project_name:'Заказ',items});
}
function byPath(model,indices){return indices.reduce((o,i)=>o.Objects[i],model);}

for(const rotation of [0,90,180,270]) test('native drawer, panel labels and drilling move together at '+rotation+'°',()=>{
  const c=setup(),model=c.currentFileData.model;
  const existing=new Obj('panel','Существующая деталь',model);
  existing.pos={x:-17,y:32,z:83};
  const cabinet='Шкаф в прихожей',drawer='Шуфляда 1';
  const items=[
    row('missing-unused','broken',group('old','Недоступен','Деталь','d','Короб'),{blank:true}),
    row('board-side','s',group('a',cabinet,'Боковина левая'),{blank:{axis:'vertical'},rotation}),
    row('board-drawer','d',group('a',cabinet,'Фасад шуфляды','1',drawer),{blank:{axis:'vertical'},rotation,production_note:'Учесть направление волокон'}),
    row('hardware-handle','h',group('a',cabinet,'AK700','1',drawer),{wardrobe_handle:true,host_blank_id:'d',joined_panel_id:'d',rotation}),
    row('board-side','s2',group('b',cabinet,'Боковина правая','1',drawer),{blank:{axis:'vertical'},position:{x:1000,y:0,z:33},rotation}),
    row('legacy-kitchen','k',undefined,{production_note:'Проверка снятых размеров'})
  ];
  const r=run(c,items);
  assert.equal(r.failed,1);
  assert.equal(r.loaded,5,JSON.stringify(r.log));
  assert.equal(r.assemblyPlacement.applied,true,JSON.stringify(r.assemblyPlacement));
  assert.equal(r.materialChecks.length,3);
  assert.ok(r.materialChecks.every(x=>x.verified));
  assert.equal(r.notesVerified,3);
  assert.deepEqual(model.Objects.map(x=>x.Name),['Габаритная рамка','Существующая деталь',cabinet,cabinet,'Старое название k']);
  const a=model.Objects[2],b=model.Objects[3],d=a.Objects.find(x=>x.kind==='group');
  assert.deepEqual(a.Objects.map(x=>x.Name),['Боковина левая',drawer]);
  assert.deepEqual(d.Objects.map(x=>x.Name),['Фасад шуфляды','AK700']);
  assert.equal(a.Objects[0].kind,'panel');
  const drawing=d.Objects[0];
  assert.equal(drawing.kind,'panel');
  assert.equal(drawing.props.get('Узел для бирки'),cabinet+' · '+drawer);
  assert.equal(drawing.props.get('Покрытие'),'С двух сторон');
  assert.equal(a.Objects[0].props.get('Узел для бирки'),cabinet);
  assert.equal(b.Objects[0].Objects[0].Name,'Боковина правая');
  assert.equal(d.Objects[1].Objects[0].Objects[0].Name,'Отверстие Ø5');
  assert.equal(r.blockPaths.length,4);
  samePoint(existing.ToGlobal(origin),{x:-17,y:32,z:83});
  const shift={x:r.assemblyPlacement.shiftX,y:0,z:r.assemblyPlacement.shiftZ};
  for(const [i,panel] of [[1,a.Objects[0]],[2,drawing],[4,b.Objects[0].Objects[0]]]){
    sample.forEach((p,j)=>samePoint(panel.ToGlobal(p),add(items[i].expected[j],shift)));
  }
  const pathCheck=r.noteChecks.find(x=>x.itemIndex===2);
  assert.equal(byPath(model,pathCheck.objectPath),drawing);
  assert.deepEqual(Array.from(pathCheck.objectPathNames),[cabinet,drawer,'Фасад шуфляды']);
  const legacy=r.noteChecks.find(x=>x.itemIndex===5);
  assert.equal(model.Objects[legacy.objectIndex].Name,'Старое название k');
  const hole=d.Objects[1].Objects[0].Objects[0],unchanged=b.Objects[0].Objects[0];
  const oldHole=hole.ToGlobal(origin),oldPanel=drawing.ToGlobal(origin),untouched=unchanged.ToGlobal(origin);
  const delta={x:100,y:210,z:-77};
  a.TranslateGCS(delta);
  samePoint(hole.ToGlobal(origin),add(oldHole,delta));
  samePoint(drawing.ToGlobal(origin),add(oldPanel,delta));
  samePoint(unchanged.ToGlobal(origin),untouched);
  c.currentFileData.model=restore(model);
  const notes=c.readNotesForDisplay(r);
  assert.equal(notes.errors.length,0,JSON.stringify(notes.errors));
  assert.match(notes.lines.join('\n'),/Шкаф в прихожей \/ Шуфляда 1 \/ Фасад шуфляды/);
  assert.match(notes.lines.join('\n'),/Учесть направление волокон/);
  byPath(c.currentFileData.model,pathCheck.objectPath).note='Испорчено';
  assert.match(c.readNotesForDisplay(r).errors.join('\n'),/Текст изменился/);
});

test('keeps complex donor machining, missing rows and native transfer failures leave no orphan',()=>{
  const c=setup(),items=[
    row('board-machined','a',group('a','Шкаф А','Фасад'),{blank:true,production_note:'Ручка'}),
    row('board-bad-transform','b',group('a','Шкаф А','Ошибочная деталь','2','Шуфляда 2'),{blank:true}),
    row('missing','c',group('b','Шкаф Б','Ошибочная деталь'),{blank:true}),
  ];
  const r=run(c,items);
  assert.equal(r.loaded,1);
  assert.equal(r.failed,2);
  const model=c.currentFileData.model;
  assert.deepEqual(model.Objects.map(o=>o.Name),['Габаритная рамка','Шкаф А']);
  const cab=model.Objects[1];
  assert.deepEqual(cab.Objects.map(o=>o.Name),['Фасад']);
  assert.deepEqual(cab.Objects[0].Objects.map(o=>o.Name),['Габаритная рамка','Фасад','Сохраняемая фрезеровка']);
  assert.deepEqual(Array.from(r.noteChecks.find(x=>x.itemIndex===0).objectPath),[1,0]);
  assert.equal(c.readNotesForDisplay(r).errors.length,0);
});

test('bad metadata fails before creating any block or importing kitchen modules',()=>{
  const c=setup(),model=c.currentFileData.model;
  const good=row('board','a',group('a','Шкаф','Дно'),{blank:true});
  const wrong=[
    [row('board','b',group('a','Другое название','Крыша'),{blank:true})],
    [row('board','b',group('a','Шкаф','Крыша','1',undefined),{blank:true})],
    [row('board','b',group('a','Шкаф','Крыша','1','Ящик'),{blank:true}),row('board','c',group('a','Шкаф','Дно','1','Другой ящик'),{blank:true})]
  ];
  for(const cases of wrong) {
    assert.throws(()=>run(c,[row('legacy-kitchen','k'),good,...cases]),/названи/i);
    assert.equal(model.Count,1);
  }
  delete c.objects3d.NewBlock;
  assert.throws(()=>run(c,[good]),/NewBlock/);
  assert.equal(model.Count,1);
  const old=run(c,[row('legacy-kitchen','k')]);
  assert.equal(old.loaded,1);
  assert.equal(old.failed,0);
  assert.equal(model.Objects[1].Name,'Старое название k');
});
