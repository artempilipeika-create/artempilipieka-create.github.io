import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const rootURL = new URL('../../',import.meta.url);
const read = p=>fs.readFileSync(new URL(p,rootURL),'utf8');
const source = read('backend/v2/cabinet_assets/planner/bazis-drawers-import.js');
const fixtures = JSON.parse(read('tests/webgl/fixtures/native-profile-anchors.json'));
const require = createRequire(import.meta.url);
const axes = ['x','y','z'];
const plus=(a,b)=>Object.fromEntries(axes.map(k=>[k,a[k]+b[k]]));
const minus=(a,b)=>Object.fromEntries(axes.map(k=>[k,a[k]-b[k]]));
const point=(x=0,y=0,z=0)=>({x,y,z});
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
function runtime(extra={}) {
  const c=vm.createContext({require,process,console,
    historyOperations:{RegisterObjectChanging(){}},
    objectTypeChecker:{ObjectIsExtrusionBody:o=>o.isProfile,ObjectIsPanel:()=>false},...extra});
  vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);
  return c;
}
function scene(fixture) {
  const frame={min:point(),size:point(...fixture.frame.size)};
  const root={Name:'QA',PositionX:0,PositionY:0,PositionZ:0,angle:0,Objects:[],...frame,
    AsList(){return this;},get Count(){return this.Objects.length;},
    SetDefaultTransform(){this.angle=0;this.PositionX=this.PositionY=this.PositionZ=0;},
    ToGlobal(p){const c=Math.cos(this.angle),s=Math.sin(this.angle);return{x:c*p.x-s*p.z+this.PositionX,y:p.y+this.PositionY,z:s*p.x+c*p.z+this.PositionZ};},
    ToObject(p){const c=Math.cos(this.angle),s=Math.sin(this.angle),x=p.x-this.PositionX,z=p.z-this.PositionZ;return{x:c*x+s*z,y:p.y-this.PositionY,z:-s*x+c*z};},
    Build(){},TranslateGCS(p){this.PositionX+=p.x;this.PositionY+=p.y;this.PositionZ+=p.z;}};
  const profiles=[];
  for(const f of fixture.profiles) {
    let parent=root;
    for(const name of f.path.split('/').filter(Boolean).slice(0,-1)) {
      let child=parent.Objects.find(o=>o.Name===name);
      if(!child){child={Name:name,Objects:[],AsList(){return this;},get Count(){return this.Objects.length;}};parent.Objects.push(child);}
      parent=child;
    }
    const profile={Name:f.path.split('/').at(-1),isProfile:true,Thickness:f.thickness,
      origin:point(...f.matrix.slice(0,3).map(a=>a[3])),basis:f.matrix,
      // Mimic a native parameter rebuild from signed Thickness.
      builtLength:f.thickness,Build(){this.builtLength=this.Thickness;},
      ToGlobal(p){return root.ToGlobal(plus(this.origin,point(...this.basis.slice(0,3).map(r=>r[0]*p.x+r[1]*p.y+r[2]*p.z))));},
      TranslateGCS(p){const v=minus(root.ToObject(plus(root.ToGlobal(point()),p)),root.ToObject(root.ToGlobal(point())));this.origin=plus(this.origin,v);}};
    parent.Objects.push(profile);profiles.push(profile);
  }
  return {root,profiles,frame};
}
function input(fixture,width) {
  const [w,h,d]=fixture.frame.size,upper=fixture.file.startsWith('ВМ');
  return {name:'QA',source_sha256:fixture.sha256,source_default:{width:w,height:h,depth:d-(upper?3:0)},
    target:{width,height:h,depth:d-(upper?3:0)},position:point(1450,upper?1580:0,-700),rotation:0,elastic_resize:true};
}

for(const fixture of fixtures) for(const width of [400,600,800,900]) {
  test(`${fixture.file}: ${width} mm restores signed profile length and both mounting anchors`,()=>{
    const c=runtime(),{root,profiles,frame}=scene(fixture),item=input(fixture,width);
    const target={...frame.size,x:width,y:frame.size.y+80,z:frame.size.z+20};
    const checks=c.snapshotNativeProfiles(root,item,frame,target);
    assert.equal(checks.length,fixture.profiles.length);
    // Reproduce two independent faults: stale Gola length and shifted rail child.
    profiles.forEach((p,i)=>{if(fixture.file.startsWith('ВМ'))p.origin=plus(p.origin,point(95+i*17,120,-33));else p.origin.x+=70;});
    const contourBasis=profiles.map(p=>JSON.stringify(p.basis));
    c.repairNativeProfiles(checks,{min:point(),size:target},[]);
    checks.forEach((check,i)=>{
      const result=c.verifyNativeProfile(check);assert.equal(result.verified,true);
      close(result.actualLength,fixture.file.startsWith('ВМ')?50:width);
      assert.ok(result.signedLength<0);assert.equal(JSON.stringify(profiles[i].basis),contourBasis[i]);
      if(fixture.file.startsWith('ВМ')) {
        close(result.actualOrigin.x,i===0?width-2:52);
        close(result.actualOrigin.y,fixture.profiles[i].matrix[1][3]+80);
        close(result.actualOrigin.z,fixture.profiles[i].matrix[2][3]);
      } else close(result.actualOrigin.x,0);
    });
    // A second read/repair does not lengthen a profile twice.
    c.repairNativeProfiles(checks,{min:point(),size:target},[]);
    checks.forEach(check=>c.verifyNativeProfile(check));
  });
}

test('Actual resizeAndPlace uses repaired profiles before placement; post-placement readback survives every rotation',()=>{
  for(const fixture of fixtures) for(const rotation of [0,90,180,270,37]) {
    const {root,profiles}=scene(fixture),item={...input(fixture,800),rotation};
    const c=runtime({elasticTransformation:{GetObjectLocalSize:o=>o.size,GetObjectMinLocalPoint:o=>o.min,ObjectIsElasticBlock:()=>true,
      ResizeObject(o,size){o.size={...size};profiles.forEach(p=>p.origin.x+=100);}},
      objectTransformation:{RotateObject(o,axis,angle){o.angle=-angle*Math.PI/180;}}});
    const result=c.resizeAndPlace(root,item,[]);
    assert.equal(result.profileChecks.length,profiles.length);
    root.TranslateGCS(point(2000,0,1500));
    for(const check of result.profileChecks)c.verifyNativeProfile(check);
  }
});

test('Extrusion direction and sign are preserved for mirrored profiles and offset frames',()=>{
  const fixture=fixtures.find(f=>f.file.startsWith('НМ'));
  for(const direction of [1,-1])for(const sign of [1,-1]) {
    const {root,profiles,frame}=scene(fixture),c=runtime(),p=profiles[0];
    frame.min=root.min=point(31,17,12);
    p.Thickness=sign*600;p.basis=[[0,0,direction,0],[0,1,0,0],[-direction,0,0,0],[0,0,0,1]];
    p.origin.x=31+(sign*direction<0?600:0);
    const checks=c.snapshotNativeProfiles(root,input(fixture,800),frame,{x:800,y:820,z:510});
    const after={min:point(40,17,12),size:point(800,820,510)};
    c.repairNativeProfiles(checks,after,[]);
    close(p.Thickness,sign*800);close(p.origin.x,40+(sign*direction<0?800:0));
    c.repairNativeProfiles(checks,after,[]);
    close(p.origin.x,40+(sign*direction<0?800:0));
    c.verifyNativeProfile(checks[0]);
  }
});

test('Both L and C profiles resize independently and retain native Y/Z',()=>{
  const fixture=structuredClone(fixtures.find(f=>f.file.startsWith('НМ')));
  const donor=JSON.parse(read('backend/v2/cabinet_assets/planner/gola-variants.json')).find(v=>v.profiles.length===2);
  fixture.sha256=donor.source_sha256;
  const second=structuredClone(fixture.profiles[0]);second.path=second.path.replace('GOLA L','GOLA C');second.matrix[1][3]-=350;fixture.profiles.push(second);
  const {root,profiles,frame}=scene(fixture),c=runtime(),target={...frame.size,x:950};
  const checks=c.snapshotNativeProfiles(root,input(fixture,950),frame,target);
  profiles.forEach(p=>{p.origin.y+=30;p.origin.z+=20;});
  c.repairNativeProfiles(checks,{...frame,size:target},[]);
  assert.equal(checks.length,2);
  checks.forEach((check,i)=>{const result=c.verifyNativeProfile(check);close(result.actualLength,950);close(result.actualOrigin.y,fixture.profiles[i].matrix[1][3]+30);close(result.actualOrigin.z,fixture.profiles[i].matrix[2][3]+20);});
});

test('Commit-time profile drift is reported in exported evidence instead of claiming a clean import',()=>{
  const fixture=fixtures.find(f=>f.file.startsWith('НМ')),{root,profiles,frame}=scene(fixture);
  const item=input(fixture,800),model={Count:1};
  const c=runtime({currentFileData:{model},modelIOOperations:{LoadFastenerOrFragment:()=>root},
    historyOperations:{RegisterObjectChanging(){},CommitCurrentChanges(){profiles[0].Thickness=-600;}},
    elasticTransformation:{GetObjectLocalSize:o=>o.size,GetObjectMinLocalPoint:o=>o.min,ObjectIsElasticBlock:()=>true,ResizeObject(o,size){o.size={...size};}},
    objectTransformation:{RotateObject(o,axis,angle){o.angle=-angle*Math.PI/180;}}});
  c.projectBrief=()=>'';c.alignAssemblyXZ=()=>({applied:true});
  const result=c.importProject({entries:[{item,source:'read-only-source'}]},'/fixture',{items:[item]});
  assert.equal(result.loaded,1);assert.equal(result.failed,0);assert.equal(result.profileErrors,1);
  assert.equal(result.profileChecks[0].verified,false);
  assert.ok(result.log.some(s=>s.startsWith('ОШИБКА ПРОФИЛЯ ПОСЛЕ COMMIT:')));
});

test('Unknown sources, hinge extrusions and glass profiles are untouched',()=>{
  const fixture=fixtures.find(f=>f.file.startsWith('ВМ')),{root,profiles,frame}=scene(fixture),c=runtime();
  assert.equal(c.snapshotNativeProfiles(root,{source_sha256:'unknown'},frame,frame.size).length,0);
  root.Objects.push({Name:'Профиль',isProfile:true,Thickness:1,ToGlobal(){throw Error('hinge must not be inspected');}});
  assert.equal(c.snapshotNativeProfiles(root,input(fixture,800),frame,{...frame.size,x:800}).length,2);
  close(profiles[0].Thickness,-50);
});

test('Missing profiles, changed orientation, rejected writes and later commit drift are explicit failures',()=>{
  const fixture=fixtures.find(f=>f.file.startsWith('НМ'));
  const {root,profiles,frame}=scene(fixture),c=runtime(),item=input(fixture,800),target={...frame.size,x:800};
  const checks=c.snapshotNativeProfiles(root,item,frame,target),p=profiles[0];
  const basis=p.basis;p.basis=[[1,0,0,0],[0,0,1,0],[0,1,0,0],[0,0,0,1]];
  assert.throws(()=>c.repairNativeProfiles(checks,{...frame,size:target},[]),/Ось профиля/);p.basis=basis;
  Object.defineProperty(p,'Thickness',{get:()=>-600,set(){},configurable:true});
  assert.throws(()=>c.repairNativeProfiles(checks,{...frame,size:target},[]),/не подтверждены/);
  Object.defineProperty(p,'Thickness',{value:-800,writable:true,configurable:true});
  c.repairNativeProfiles(checks,{...frame,size:target},[]);p.origin.x+=1;
  assert.throws(()=>c.verifyNativeProfile(checks[0]),/не подтверждены/);
  root.Objects=[];assert.throws(()=>c.snapshotNativeProfiles(root,item,frame,target),/Не найдены все/);
});

test('46 catalogue source identities and profile counts match the single-file importer',()=>{
  const c=runtime(),counts=vm.runInContext('NATIVE_GOLA_PROFILE_COUNTS',c);
  const expected={};
  for(const name of fs.readdirSync(new URL('backend/v2/cabinet_assets/planner/',rootURL)).filter(n=>n.endsWith('variants.json'))) {
    const variants=JSON.parse(read('backend/v2/cabinet_assets/planner/'+name));if(!Array.isArray(variants))continue;
    for(const v of variants){const n=(v.profiles||[]).filter(p=>/^gola [lc]$/i.test(p.name)).length;if(n)expected[v.source_sha256]=n;}
  }
  assert.deepEqual(JSON.parse(JSON.stringify(counts)),expected);
  assert.equal(source,read('tools/bazis_import/Martin_Forest_Import_v9_9_7_NATIVE_PROFILES.js'));
  assert.ok(source.includes(read('tools/bazis_import/profile-repair.js')));
});
