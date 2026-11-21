import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {Object3D,Vector3,Matrix4} from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';

const importer=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/z1-front-native.json',import.meta.url)));
const v=(p={})=>new Vector3(p.x??0,p.y??0,p.z??0);
function contour(rows){
  return {Objects:rows.map(([x,y,x2,y2])=>({Pos1:{x,y},Pos2:{x:x2,y:y2}})),
    get Count(){return this.Objects.length;},Clear(){this.Objects=[];},
    AddLine(x,y,x2,y2){this.Objects.push({Pos1:{x,y},Pos2:{x:x2,y:y2}});}};
}
class Node extends Object3D{
  get Objects(){return this.children;}
  get Count(){return this.children.length;}
  AsList(){return this;}
  IndexOf(p){return this.children.indexOf(p);}
  set Owner(owner){owner.add(this);}
  set PositionX(x){this.position.x=x;}
  set PositionY(y){this.position.y=y;}
  set PositionZ(z){this.position.z=z;}
  SetDefaultTransform(){this.position.set(0,0,0);this.quaternion.identity();}
  ToGlobal(p){return this.localToWorld(v(p));}
  ToObject(p){return this.worldToLocal(v(p));}
  TranslateGCS(delta){const at=this.ToGlobal({}).add(v(delta));this.position.copy(this.parent?this.parent.worldToLocal(at):at);}
  OrientGCS(z,y){
    const za=v(z).normalize(),ya=v(y).normalize(),xa=ya.clone().cross(za);
    this.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xa,ya,za));
    if(this.parent)this.quaternion.premultiply(this.parent.getWorldQuaternion(this.quaternion.clone()).invert());
  }
  Build(){}
}
// Build the real clipped end vertices from the source contour and both native
// plane equations. Length alone would miss a stale far mitre on a tall door.
class Profile extends Node{
  constructor(global=false){super();this.global=global;this.planes=[];this.MaterialWidth=1;}
  get TriListsCount(){return 1;}
  get TriLists(){
    const vertices=[];
    for(const {Pos1:{x,y}} of this.Contour.Objects){
      let lo=0,hi=this.Thickness;
      for(const [a,b,c,d] of this.planes){
        const z=-(a*x+b*y+d)/c;
        if(c>0)lo=Math.max(lo,z);else hi=Math.min(hi,z);
      }
      if(hi<lo)continue;
      for(const z of [lo,hi])vertices.push(this.global?this.ToGlobal({x,y,z}):{x,y,z});
    }
    const triangles=vertices.map((p,i)=>({Vertex1:p,Vertex2:vertices[(i+1)%vertices.length],Vertex3:vertices[(i+2)%vertices.length]}));
    return [{Count:triangles.length,Triangles:triangles}];
  }
  Clip(p,n){this.planes.push([n.x,n.y,n.z,-(p.x*n.x+p.y*n.y+p.z*n.z)]);}
}
function loadSource(global=false){
  const root=new Node();root.size=v({x:600,y:700,z:22});root.min=v();
  for(const row of fixture.parts){
    const obj=row.clips?new Profile(global):new Node();
    obj.Name=row.name;obj.Thickness=row.length;obj.MaterialName=row.material;
    obj.Contour=contour(fixture.sections[row.section]);
    if(row.clips)obj.planes=structuredClone(row.clips);
    const m=new Matrix4().set(...row.matrix.flat(),0,0,0,1);m.decompose(obj.position,obj.quaternion,obj.scale);
    root.add(obj);
  }
  return root;
}
function setup(mode){
  const opts={global:mode==='global'};
  let localAttempts=0,newProfiles=0;
  const ctx=vm.createContext({require:createRequire(import.meta.url),process,console,
    objectTypeChecker:{ObjectIsPanel:o=>o.Name==='Стекло',ObjectIsExtrusionBody:o=>o instanceof Profile},
    objectTransformation:{RotateObject(o,axis,deg){o.rotateOnWorldAxis(v(axis),deg*Math.PI/180);}},
    historyOperations:{RegisterObjectChanging(){}},
    modelIOOperations:{LoadFastenerOrFragment(path,root){assert.equal(path,'signed-donor');const d=loadSource(opts.global);root.add(d);return d;}},
    objects3d:{
      NewBlock(name,owner){const block=new Node();block.helper=true;owner.add(block);return block;},
      NewLimits(name,size,owner){const o=new Node();owner.add(o);return o;},
      CloneObject(original,owner){const p=loadSource(opts.global).children.find(p=>p.Name===original.Name);owner.add(p);return p;},
      DeleteObject:o=>o.removeFromParent(),
      NewExtrusionBody(a,b,length,owner){newProfiles++;const p=new Profile(opts.global);p.Thickness=length;p.Contour=contour([]);owner.add(p);if(mode==='reject')p.Clip=()=>{};return p;}
    },
    elasticTransformation:{GetObjectLocalSize:o=>o.size,GetObjectMinLocalPoint:o=>o.min,
      ObjectIsElasticBlock:()=>true,ElasticAxis:{z:2},LoadElasticParameters:()=>({}),SaveElasticParameters:(o,e)=>{o.elastic=e;},
      ResizeObject(o,target){
        if(!o.helper){o.size=v(target);return;} // The service frame moves while the physical members stay stale.
        localAttempts++;const p=o.children.find(c=>c instanceof Profile);
        assert.equal(o.elastic.planes[0].position,p.Thickness/2);
        if(mode==='local'||mode==='global'){
          for(const plane of p.planes)if(plane[2]<0)plane[3]-=plane[2]*(target.z-p.Thickness);
          p.Thickness=target.z;
        }
      }}});
  vm.runInContext(importer.slice(0,importer.lastIndexOf('(function main()')),ctx);
  const root=loadSource(opts.global);
  return {ctx,root,stats:()=>({localAttempts,newProfiles})};
}
function item(w,h,rotation){
  return {wardrobe_z1_front:true,name:'Витрина Z1',source_sha256:fixture.source_sha256,
    source_default:{width:600,height:700,depth:22},target:{width:w+4,height:h+4,depth:22},elastic_resize:true,rotation,position:{x:250,y:90,z:-740}};
}
for(const [w,h] of [[497,397],[497,2007],[596,696],[333.5,791.5]])for(const rotation of [0,90,180,270]){
 test(`Z1 physical frame ${w}×${h} at ${rotation}°, local native resize and post-commit readback`,()=>{
   const {ctx,root}=setup(rotation===270?'global':'local'),log=[];
   const r=ctx.resizeAndPlace(root,item(w,h,rotation),log,null,'signed-donor'),check=r.profileChecks[0];
   assert.equal(root.children.length,5);assert.equal(ctx.verifyZ1Front(check).verified,true);
   assert.ok(log.every(l=>!l.startsWith('ОШИБКА МАТЕРИАЛА')));
   assert.deepEqual(root.children.filter(x=>x instanceof Profile).map(p=>Math.round(p.Thickness*10)/10).sort((a,b)=>a-b),[w,w,h,h].sort((a,b)=>a-b));
   const glass=root.children.find(p=>p.Name==='Стекло'),xs=glass.Contour.Objects.map(l=>l.Pos1.x),ys=glass.Contour.Objects.map(l=>l.Pos1.y);
   assert.equal(Math.round((Math.max(...xs)-Math.min(...xs))*10)/10,w-27.5);
   assert.equal(Math.round((Math.max(...ys)-Math.min(...ys))*10)/10,h-27.5);
   assert.equal(glass.MaterialName,fixture.parts.at(-1).material);
   const left=root.children.find(p=>p.Name==='Левая Стойка');
   left.planes[0][3]-=2;assert.throws(()=>ctx.verifyZ1Front(check),/запилы/);
 });
}
test('a host retaining old clip planes can build an exact new native extrusion from the original section',()=>{
  const {ctx,root,stats}=setup('clip');const {profileChecks:[check]}=ctx.resizeAndPlace(root,item(497,2007,90),[],null,'signed-donor');
  assert.equal(ctx.verifyZ1Front(check).verified,true);assert.ok(stats().newProfiles>0);
  assert.equal(root.Count,5);
});
test('when the native host refuses both mitre repairs, no trial objects remain',()=>{
  const {ctx,root}=setup('reject');assert.throws(()=>ctx.resizeAndPlace(root,item(497,397,0),[],null,'signed-donor'),/подрезку/);
  assert.equal(root.Count,5);
});
