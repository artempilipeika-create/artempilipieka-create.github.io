import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const source = fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
function runtime(extra = {}) {
  const c = vm.createContext({require, process, console,
    objectTransformation: {RotateObject: (o, axis, angle) => { o.angle = -angle * Math.PI / 180; }},
    elasticTransformation: {GetObjectLocalSize:o=>o.size, GetObjectMinLocalPoint:o=>o.min}, ...extra});
  vm.runInContext(source.slice(0, source.lastIndexOf('(function main()')), c);
  return c;
}
function moduleObject() {
  return {
    Name:'Шкаф', min:{x:71,y:-80,z:43}, size:{x:600,y:720,z:510}, angle:0, Count:0,
    PositionX:0,PositionY:0,PositionZ:0,
    AsList(){return this;},
    SetDefaultTransform(){this.angle=0;this.PositionX=this.PositionY=this.PositionZ=0;},
    ToGlobal(p){const c=Math.cos(this.angle),s=Math.sin(this.angle);return {
      x:c*p.x-s*p.z+this.PositionX,y:p.y+this.PositionY,z:s*p.x+c*p.z+this.PositionZ};},
    TranslateGCS(p){this.PositionX+=p.x;this.PositionY+=p.y;this.PositionZ+=p.z;},
    get points(){const out=[];for(const x of [this.min.x,this.min.x+this.size.x])
      for(const y of [this.min.y,this.min.y+this.size.y])
        // Native bound includes a facade/handle 55 mm beyond the elastic frame.
        for(const z of [this.min.z,this.min.z+this.size.z+55])out.push(this.ToGlobal({x,y,z}));return out;},
    get GabMin(){return Object.fromEntries(['x','y','z'].map(k=>[k,Math.min(...this.points.map(p=>p[k]))]));},
    get GabMax(){return Object.fromEntries(['x','y','z'].map(k=>[k,Math.max(...this.points.map(p=>p[k]))]));}
  };
}
function close(a,b){assert.ok(Math.abs(a-b)<1e-6, `${a} != ${b}`);}
const origin={x:0,y:0,z:0};

for(const sceneX of [-6500,0,7210])test(`Whole assembly aligns to X=0 from ${sceneX}; native bounds and transforms are preserved`,()=>{
  const c=runtime(),objects=[];
  for(const [i,rotation] of [0,90,180,270,37].entries()){
    const obj=moduleObject();obj.size.x+=i*100;
    c.placeByFrame(obj,{min:obj.min,size:obj.size},{name:'Модуль '+i,position:{x:sceneX+i*130,y:i%2?1430:100,z:-600+i*200},rotation},[]);
    objects.push(obj);
  }
  const before=objects.map(o=>({origin:o.ToGlobal(origin),points:o.points,angle:o.angle}));
  const inputLeft=Math.min(...objects.map(o=>o.GabMin.x));
  const result=c.alignAssemblyX(objects,0,[]);
  close(result.shiftX,-inputLeft);close(Math.min(...objects.map(o=>o.GabMin.x)),0);
  objects.forEach((o,i)=>{
    assert.equal(o.angle,before[i].angle);
    o.points.forEach((p,j)=>{close(p.x,before[i].points[j].x+result.shiftX);close(p.y,before[i].points[j].y);close(p.z,before[i].points[j].z);});
    close(o.ToGlobal(origin).x-objects[0].ToGlobal(origin).x,before[i].origin.x-before[0].origin.x);
  });
  close(c.alignAssemblyX(objects,0,[]).shiftX,0);
  close(c.alignAssemblyX(objects,162.5,[]).afterX,162.5);
});

test('Native protruding front determines left bound at 90 degrees',()=>{
  const c=runtime(),o=moduleObject();
  c.placeByFrame(o,{min:o.min,size:o.size},{name:o.Name,position:{x:1000,y:100,z:1000},rotation:90},[]);
  close(o.GabMin.x,690); // 1000 - depth/2 - 55
  close(c.alignAssemblyX([o],0,[]).shiftX,-690);
});

test('Missing native bounds fail before moving; interrupted translation rolls all objects back',()=>{
  const c=runtime(),a=moduleObject(),b=moduleObject();a.PositionX=1500;b.PositionX=2300;
  Object.defineProperty(b,'GabMin',{get(){return undefined;},configurable:true});
  assert.throws(()=>c.alignAssemblyX([a,b],0,[]),/GabMin/);assert.equal(a.PositionX,1500);
  delete b.GabMin;Object.defineProperty(b,'GabMin',{get(){return {x:2300,y:0,z:0};}});
  b.TranslateGCS=()=>{throw Error('native failure');};
  assert.throws(()=>c.alignAssemblyX([a,b],0,[]),/native failure.*отменён/);
  assert.equal(a.PositionX,1500);assert.equal(b.PositionX,2300);
  assert.equal(c.alignAssemblyX([],0,[]).applied,false);
});

test('Import aligns only successful modules before commit and reports the measured bound',()=>{
  const objects=[],model={get Count(){return objects.length;}};
  let committed=false;
  const c=runtime({currentFileData:{model},modelIOOperations:{LoadFastenerOrFragment(file){
    if(file==='bad')throw Error('Cannot load donor');const obj=moduleObject();objects.push(obj);return obj;
  }},historyOperations:{CommitCurrentChanges(){close(Math.min(...objects.map(o=>o.GabMin.x)),0);committed=true;}}});
  const items=[-5000,2000,2600].map((x,i)=>({name:'Шкаф '+i,source_file:i===0?'bad':'good',
    source_default:{width:600,height:720,depth:510},target:{width:600,height:720,depth:510},
    position:{x,y:100,z:0},rotation:0}));
  const result=c.importProject({entries:items.map(item=>({item,source:item.source_file}))},'/fixture',{items});
  assert.equal(result.loaded,2);assert.equal(result.failed,1);assert.ok(committed);
  assert.equal(result.assemblyPlacement.applied,true);close(result.assemblyPlacement.afterX,0);
  close(objects[1].PositionX-objects[0].PositionX,600);
});
