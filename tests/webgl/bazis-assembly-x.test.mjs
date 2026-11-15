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

test('X/Z alignment preserves Y, every relative point and all angles, and rolls back both axes on failure',()=>{
 const c=runtime(),objects=[0,90,180,270,37].map((rotation,i)=>{
  const o=moduleObject();
  c.placeByFrame(o,{min:o.min,size:o.size},{name:o.Name,position:{x:2700-i*500,y:i*350,z:-7400+i*220},rotation},[]);
  return o;
 });
 const before=objects.map(o=>({points:o.points,angle:o.angle}));
 const result=c.alignAssemblyXZ(objects,0,0,[]);
 close(Math.min(...objects.map(o=>o.GabMin.x)),0);close(Math.min(...objects.map(o=>o.GabMin.z)),0);
 objects.forEach((o,i)=>{assert.equal(o.angle,before[i].angle);o.points.forEach((p,j)=>{
  close(p.x,before[i].points[j].x+result.shiftX);close(p.y,before[i].points[j].y);close(p.z,before[i].points[j].z+result.shiftZ);
 });});
 const repeat=c.alignAssemblyXZ(objects,0,0,[]);close(repeat.shiftX,0);close(repeat.shiftZ,0);
 const positions=objects.map(o=>({x:o.PositionX,y:o.PositionY,z:o.PositionZ}));
 objects[2].TranslateGCS=()=>{throw Error('blocked');};
 assert.throws(()=>c.alignAssemblyXZ(objects,100,150,[]),/blocked/);
 objects.forEach((o,i)=>assert.deepEqual({x:o.PositionX,y:o.PositionY,z:o.PositionZ},positions[i]));
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
    }},historyOperations:{CommitCurrentChanges(){close(Math.min(...objects.map(o=>o.GabMin.x)),0);close(Math.min(...objects.map(o=>o.GabMin.z)),0);committed=true;}}});
  const items=[-5000,2000,2600].map((x,i)=>({name:'Шкаф '+i,source_file:i===0?'bad':'good',
    source_default:{width:600,height:720,depth:510},target:{width:600,height:720,depth:510},
    position:{x,y:100,z:0},rotation:0}));
  const result=c.importProject({entries:items.map(item=>({item,source:item.source_file}))},'/fixture',{items});
  assert.equal(result.loaded,2);assert.equal(result.failed,1);assert.ok(committed);
  assert.equal(result.assemblyPlacement.applied,true);close(result.assemblyPlacement.afterX,0);
  close(objects[1].PositionX-objects[0].PositionX,600);
});

test('a rigid socket outside the furniture bounds follows the furniture origin shift',()=>{
 const c=runtime(),cabinet=moduleObject(),outlet=moduleObject();
 outlet.min={x:0,y:0,z:0};outlet.size={x:82,y:82,z:10};
 const item={source_sha256:'2d8945a5176981eebe0b9206ce3c6f1d47aa3e77baebe13ef586e7586138f485',
   name:'Розетка',rotation:90,position:{x:-650,y:300,z:-700}};
 const {materialChecks}=c.resizeAndPlace(outlet,item,[]);assert.equal(materialChecks.length,0);
 const offset={x:outlet.PositionX-cabinet.PositionX,z:outlet.PositionZ-cabinet.PositionZ};
 c.alignAssemblyXZ([cabinet,outlet],0,0,[],[cabinet]);
 close(cabinet.GabMin.x,0);close(cabinet.GabMin.z,0);close(outlet.PositionY,300);
 close(outlet.PositionX-cabinet.PositionX,offset.x);close(outlet.PositionZ-cabinet.PositionZ,offset.z);
});

test('the original AKKORD fixing midpoint lands on the requested face independently of the service frame',()=>{
 const c=runtime();
 for(const rotation of [0,90,180,270]){
  const obj=moduleObject(),position={x:136,y:987,z:-412};
  c.resizeAndPlace(obj,{source_sha256:'0c7176c2b675cfb48eb2f5de2ba6adbebb09d7c315c30b6f6d07628808dac3db',position,rotation},[]);
  const fixing=obj.ToGlobal({x:0,y:0,z:-1.3385});
  for(const k of ['x','y','z'])close(fixing[k],position[k]);
 }
});

test('divider fasteners enter upward from the bottom and downward from the roof at any cabinet yaw',()=>{
 const c=runtime({objectTransformation:{RotateObject(obj,axis,deg){
   obj.turns.push({axis,rad:deg*Math.PI/180});
 }}});
 for(const rotation of [0,90,180,270])for(const roll of [-90,90]){
   const obj=moduleObject();obj.turns=[];
   obj.ToGlobal=function(p){
     let {x,y,z}=p;
     for(const {axis,rad} of this.turns){
       const a=Math.cos(rad),b=Math.sin(rad);
       if(axis.z)[x,y]=[a*x-b*y,b*x+a*y];else [x,z]=[a*x+b*z,-b*x+a*z];
     }
     return {x:x+this.PositionX,y:y+this.PositionY,z:z+this.PositionZ};
   };
   const position={x:500,y:roll===90?18:2182,z:120};
   c.resizeAndPlace(obj,{source_sha256:'af876819d041ee19ab0217cc9d266210c70480206a1de1652847c12d7af65783',
     joint_roll_deg:roll,rotation,position},[]);
   const p=obj.ToGlobal({x:20,y:0,z:0});
   close(p.x,position.x);close(p.y,position.y+20*Math.sign(roll));close(p.z,position.z);
 }
});

test('MYSTI 134762 native bore enters the shelf underside and side pin stays 8.5 mm above it',async()=>{
 const {buildCarcass,placeCarcass}=await import('../../backend/v2/cabinet_assets/planner/carcass-model.mjs');
 const {nativeShelfSupports}=await import('../../backend/v2/cabinet_assets/planner/sekura.mjs');
 const c=runtime({objectTransformation:{RotateObject(obj,axis,deg){
   if(axis.x){assert.equal(deg,180);obj.flip=true;}
   else {assert.equal(axis.y,1);obj.angle=-deg*Math.PI/180;}
 }}});
 for(const thickness of [16,18,25])for(const rotation of [0,90,180,270]){
   const built=buildCarcass({recipe:'shelves',shelves:1,thickness,shelfChoices:[['board/134762']]});
   const panels=placeCarcass(built,{x:240,z:400,elevation_mm:100,rotation});
   const shelf=panels.find(p=>p.blank_shelf),supports=nativeShelfSupports(panels);
   assert.equal(supports.length,4);
   for(const support of supports){
     assert.equal(support.support_mount_face,'bottom');assert.equal(support.position.y,shelf.elevation_mm);
     const obj=moduleObject(),transform=obj.ToGlobal;
     obj.ToGlobal=function(p){return transform.call(this,this.flip?{x:p.x,y:-p.y,z:-p.z}:p);};
     // BAZIS may give a loaded assembly an offset from the drawn panel's physical face.
     const shift={x:7,y:-11,z:4},bottom=shelf.elevation_mm+2;
     const global=(x,y,z)=>obj.ToGlobal({x:x+shift.x,y:y+shift.y,z:z+shift.z});
     obj.Count=1;obj.Objects=[{Count:2,Objects:[
       {Name:'15x14',ToGlobal:p=>global(3.443644,p.z,0)},
       {Name:'5x8',ToGlobal:p=>global(p.z,-8.5,0)}
     ]}];
     const legacy=rotation===0||rotation===180;
     const data={...support,position:{...support.position,y:legacy?shelf.elevation_mm+thickness:shelf.elevation_mm}};
     if(legacy)delete data.support_mount_face;
     c.resizeAndPlace(obj,data,[],{GabMin:{x:0,y:bottom,z:0},GabMax:{x:0,y:bottom+thickness,z:0}});
     // The FR3D contains these two drilling objects with their own transforms.
     close(global(3.443644,0,0).y,bottom);
     close(global(3.443644,-14,0).y,bottom+14);
     const pin=global(-8,-8.5,0);
     close(pin.y,bottom+8.5);
     const host=panels.find(p=>p.item_id===support.host_blank_id);
     assert.ok(Math.abs(rotation%180?pin.z-host.z:pin.x-host.x)<host.width/2);
   }
 }
});
