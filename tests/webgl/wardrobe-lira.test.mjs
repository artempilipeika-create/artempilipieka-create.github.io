import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {nativeLiraProfiles} from '../../backend/v2/cabinet_assets/planner/wardrobe-lira-native.mjs';
import {panelLightMeshes} from '../../backend/v2/cabinet_assets/planner/wardrobe-lighting.mjs';
import {worldPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';

const importer=readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const code=importer.slice(importer.indexOf('const LIRA_1708_SOURCES='),importer.indexOf('function placeWardrobeRod('));
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
   profilePose:()=>({length:100,basis:[{},{},{x:1}],origin:{x:0,y:38.9281,z:39.1185}}),verifyNativeProfile:c=>assert.equal(tube.Thickness,c.length),
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
