import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {nativeLiraProfiles} from '../../backend/v2/cabinet_assets/planner/wardrobe-lira-native.mjs';
import {panelLightMeshes} from '../../backend/v2/cabinet_assets/planner/wardrobe-lighting.mjs';
import {worldPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';

const importer=readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const code=importer.slice(importer.indexOf('const LIRA_SOURCES='),importer.indexOf('function placeWardrobeRod('));
const point=p=>new THREE.Vector3(p.x,p.y,p.z);
const epsilon=(a,b)=>assert.ok(Math.abs(a-b)<.01, String(a)+' vs '+b);

test('installed LIRA follows both faces and native datums under every cabinet rotation',async()=>{
 for(const rotation of [0,90,180,270])for(const axis of ['horizontal','side'])for(const face of [0,1]){
  const vertical=axis==='side',cut={lightSystem:'lira-1708',face,edge:'x1',offset:30,width:17,depth:8,start:13,end:100};
  const board={item_id:'cab:left',name:'Деталь',blank_axis:axis,blank_machining:[cut],blank_length_mm:2536,blank_width_mm:550,
   x:320,z:240,width:vertical?18:2536,height:vertical?2536:18,elevation_mm:226,rotation};
  const [row]=await nativeLiraProfiles([board],async(path,method,body)=>{
   assert.equal(body.runs[0].length,2423);return {stock:[{article:'90607',length:3000,lines:[0]}]};
  });
  const expectedBase=worldPoint({x:vertical?(face?-9:9):13-1268,z:275-30-8.5},rotation);
  assert.deepEqual(row.position,{x:board.x+expectedBase.x,y:226+(vertical?13:face?18:0),z:board.z+expectedBase.z});
  const initial=()=>new THREE.Matrix4().identity(),root={matrix:initial(),PositionX:0,PositionY:0,PositionZ:0,
   SetDefaultTransform(){this.matrix.identity();},ToGlobal(p){return point(p).applyMatrix4(this.matrix).add(new THREE.Vector3(this.PositionX,this.PositionY,this.PositionZ));},Build(){}};
  const frame={Width:100},tube={Name:'LIRA',Thickness:100,Build(){}},children=[frame,tube];
  const place=vm.runInNewContext(code+';placeLiraProfile',{asList:()=>({Count:2}),childAt:(_,n)=>children[n],
   isServiceFrame:c=>c===frame,objectTypeChecker:{ObjectIsExtrusionBody:c=>c===tube},historyOperations:{RegisterObjectChanging(){}},
   profilePoint:()=>({x:0,y:0,z:0}),profilePose:()=>({length:100,basis:[{},{},{x:1}],origin:{x:0,y:38.9281,z:39.1185}}),verifyNativeProfile:c=>assert.equal(tube.Thickness,c.length),
   objectTransformation:{RotateObject:(obj,dir,angle)=>obj.matrix.premultiply(new THREE.Matrix4().makeRotationAxis(point(dir),angle*Math.PI/180))},
   vector:p=>p,rotateScene:(p,angle)=>({...worldPoint(p,angle),y:p.y}),setObjectPosition:(r,p)=>Object.assign(r,{PositionX:p.x,PositionY:p.y,PositionZ:p.z}),
   distance:(a,b)=>point(a).distanceTo(point(b))});
  place(root,row,[]);assert.equal(frame.Width,2423);assert.equal(tube.Thickness,2423);
  const group=new THREE.Group(),mat=new THREE.MeshBasicMaterial();
  const factory={acquire:(_,fn)=>fn(),mesh:(g,role,geo,key,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.userData.role=role;m.position.set(x,y,z).multiplyScalar(.001);g.add(m);return m;},
   box(g,role,w,h,d,x,y,z){return this.mesh(g,role,new THREE.BoxGeometry(w*.001,h*.001,d*.001),'',x,y,z);}};
  panelLightMeshes(factory,group,board,false);const box=new THREE.Box3().setFromObject(group);
  const size=box.getSize(new THREE.Vector3()).multiplyScalar(1000);epsilon(size.z,21);epsilon(vertical?size.y:size.x,2423);epsilon(vertical?size.x:size.y,9.62);
  assert.equal(group.children.filter(c=>c.userData.role==='liraScreen').length,1);
  group.children.forEach(c=>c.geometry.dispose());mat.dispose();
 }
});

test('LIRA-1707 shelf and diffuser follow the same cut after resizing, including the reverse extrusion',async()=>{
 const system='lira-17.5x6.5';
 for(const [length,start,end,article,stock] of [[564,12,23,'89609',2000],[684,12,23,'89609',2000],[2420.5,0,10,'89672',3000]]){
  for(const rotation of [0,90,180,270])for(const face of [0,1]){
   const span=length-start-end;
   const cut={lightSystem:system,face,edge:'x1',offset:50,width:17.5,depth:6.5,start,end};
   const shelf={item_id:'cab:shelf-0-0',name:'Полка',blank_axis:'horizontal',blank_machining:[{},cut],
    blank_length_mm:length,blank_width_mm:558,x:300,z:280,width:length,height:18,elevation_mm:500,rotation};
   const [row]=await nativeLiraProfiles([shelf],async(_path,_method,{runs})=>{
    assert.deepEqual(runs,[{label:'Полка',system,length:span}]);return {stock:[{article,length:stock,lines:[0]}]};
   });
   const startLocal={x:start-length/2,z:558/2-50-17.5/2},delta=worldPoint(startLocal,rotation);
   assert.equal(row.cut_index,1);assert.equal(row.host_blank_id,shelf.item_id);
   assert.equal(row.article,article);assert.equal(row.span_mm,span);assert.ok(row.source_file.includes('LIRA-1707'));
   assert.deepEqual(row.position,{x:300+delta.x,y:500+18*face,z:280+delta.z});
   const frame={Name:'Габаритная рамка',Width:100},rail={Name:'профиль цвет белый',Thickness:100,Build(){}},
    screen={Name:'Профиль',Thickness:-100,Build(){}},holder={Name:'Экран',children:[screen]};
   const root={children:[frame,rail,holder],matrix:new THREE.Matrix4(),at:new THREE.Vector3(),
    SetDefaultTransform(){this.matrix.identity();this.at.set(0,0,0);},Build(){},
    ToGlobal(p){return point(p).applyMatrix4(this.matrix).add(this.at);}};
   const datum={x:4,y:-3,z:6},inspect=vm.runInNewContext(code+';placeLiraProfile',{
    asList:o=>({Count:o.children?.length??0,children:o.children}),childAt:(list,i)=>list.children[i],
    isServiceFrame:o=>o===frame,objectTypeChecker:{ObjectIsExtrusionBody:o=>o===rail||o===screen},historyOperations:{RegisterObjectChanging(){}},
    profilePoint:()=>datum,profilePose:(_root,o)=>({length:o.Thickness,basis:[{},{},{x:o===rail?1:-1}],origin:{x:datum.x,y:38.9281,z:39.1185}}),
    verifyNativeProfile:c=>assert.equal(c.indices.reduce((parent,i)=>parent.children[i],root).Thickness,c.length),
    objectTransformation:{RotateObject:(obj,axis,angle)=>obj.matrix.premultiply(new THREE.Matrix4().makeRotationAxis(point(axis),angle*Math.PI/180))},
    vector:p=>p,rotateScene:(p,angle)=>({...worldPoint(p,angle),y:p.y}),setObjectPosition:(o,p)=>o.at.copy(point(p)),
    distance:(a,b)=>point(a).distanceTo(point(b))});
   const checks=inspect(root,row,[]).profileChecks;
   assert.equal(checks.length,2);assert.equal(frame.Width,span);assert.equal(rail.Thickness,span);assert.equal(screen.Thickness,-span);
   if(article==='89672')assert.match(rail.Name,/цвет черный/);
   const endLocal={...startLocal,x:length/2-end},far=worldPoint(endLocal,rotation);
   const actual=root.ToGlobal({...datum,x:datum.x+span,z:datum.z-8.5});
   epsilon(actual.x,300+far.x);epsilon(actual.y,row.position.y);epsilon(actual.z,280+far.z);
   root.children.pop();assert.throws(()=>inspect(root,row,[]),/состав фрагмента LIRA-1707/);
  }
 }
});

test('mixed LIRA systems use only the stock assigned to their own cut',async()=>{
 const panel={item_id:'s',name:'Полка',blank_axis:'horizontal',blank_length_mm:1400,blank_width_mm:550,width:1400,height:18,
  x:0,z:0,elevation_mm:0,blank_machining:['lira-17.5x6.5','aq-4x8','lira-1708','lira-17.5x6.5'].map((system,i)=>({
   lightSystem:system,edge:'x1',face:0,width:[17.5,4,17,17.5][i],offset:25*i}))};
 const black={article:'89672',length:3000,lines:[0,2]},silver={article:'78319',length:2000,lines:[1]};
 const rows=await nativeLiraProfiles([panel],async()=>({stock:[silver,black]}));
 assert.deepEqual(rows.map(r=>[r.cut_index,r.article]),[[0,'89672'],[2,'78319'],[3,'89672']]);
 await assert.rejects(nativeLiraProfiles([panel],async()=>({stock:[{...black,lines:[1]}]})),/раскрой/);
});
