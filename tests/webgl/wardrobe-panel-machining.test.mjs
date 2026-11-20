import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {blankItem} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {footPlan,nativeFeet} from '../../backend/v2/cabinet_assets/planner/wardrobe-feet.mjs';
import {plinthFeet} from '../../backend/v2/cabinet_assets/planner/plinth-options.mjs';
import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
import {defaultBackMount,defaultCut,panelEdges,panelMachiningPlan} from '../../backend/v2/cabinet_assets/planner/panel-machining.mjs';
import {machineBoardMeshes} from '../../backend/v2/cabinet_assets/planner/panel-machining-mesh.mjs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';

const fields={width:600,height:2200,depth:510,thickness:18,sections:1,sectionShelves:[1],back:true};
const board={name:'ЛДСП',thickness:18};
function project(f){const spec=wardrobeSpec({...fields,...f});return buildCarcass(spec,{idPrefix:'qa'});}
function part(x,key){return x.parts.find(p=>p.key===key).item;}

test('five workshop-tested HDF backs keep the front datum, the adjustment and the drilling face',()=>{
 for(const [option,inset,capDepth,cutKeys] of [
  ['perimeter',14,320,['left','right','bottom','top']],
  ['sides',10,310,['left','right']],['sides',50,270,['left','right']],
  ['right',4,316,['right']],['left',4,316,['left']],
 ]){
  const mount=defaultBackMount(option);
  if(option==='sides')mount.offset=inset-mount.width;
  const b=project({depth:320,height:720,sectionShelves:[0],backMount:mount});
  assert.equal(b.depth,320);
  for(const key of ['left','right','bottom','top']){
   const panel=part(b,key);assert.equal(panel.z+panel.depth/2,160);
   if(key==='bottom'||key==='top')assert.equal(panel.depth,capDepth);
   const [op]=panel.blank_machining??[];
   assert.equal(Boolean(op),cutKeys.includes(key));
   if(op)assert.equal(op.face,Number(key==='right'||key==='bottom'));
  }
  const h=part(b,'back');assert.equal(h.z+h.depth/2,-160+inset);
  if(option!=='perimeter'){
   assert.equal(h.z+h.depth/2,part(b,'top').z-capDepth/2);
   assert.deepEqual([h.elevation_mm,h.height],[1,718]);
  }
  if(option==='left'||option==='right'){
   assert.equal(part(b,option).depth,320);assert.equal(part(b,option==='left'?'right':'left').depth,316);
   assert.equal(h.x,option==='left'?5:-5);
  }
 }
});

test('fractional recesses retain centred bindings, and feet and overlay joints fit the finished end panels',()=>{
 for(const option of ['sides','left','right']){
  const mount=defaultBackMount(option);
  if(option==='sides')mount.offset=46.5;else mount.width=4.5;
  const base={depth:510,backMount:mount,feet:{article:plinthFeet[0].article,front:80,rear:50}};
  const b=project(base),cap=part(b,'bottom'),trim=510-cap.depth;
  assert.ok([4.5,50.5].includes(trim));
  const points=footPlan(b.spec);
  assert.equal(Math.min(...points.map(p=>p.z)),-255+trim+50);
  assert.equal(Math.max(...points.map(p=>p.z)),255-80);
  const tagged=b.items.map(it=>({...it,assistant_carcass:{group_id:'qa',spec:b.spec}}));
  assert.deepEqual(nativeFeet(tagged).map(p=>p.position.z),points.map(p=>p.z));
  const overlay=project({...base,topFit:'overlay',bottomFit:'overlay',joints:{bottom:'confirmat',top:'cam_dowel'}});
  const joints=nativeCarcassJoints(overlay.items.map(it=>({...it,assistant_carcass:{group_id:'qa',spec:overlay.spec}})));
  assert.ok(joints.length>0);
  assert.ok(joints.every(j=>j.position.z>-255+trim&&j.position.z<255));
 }
 const open=project({bottomFit:'none',sections:2,sectionShelves:[1,1],backMount:defaultBackMount('sides')});
 assert.ok(!open.parts.some(p=>p.key==='bottom'));assert.equal(part(open,'top').depth,500);
 assert.equal(part(open,'rear-brace').z-part(open,'rear-brace').depth/2,part(open,'back').z+1.5);
});

test('workshop back samples drive the board size, its installed position and its native cuts',()=>{
 const b=project({backMount:defaultBackMount('groove')});
 const hdf=part(b,'back');
 assert.deepEqual([hdf.width,hdf.height,hdf.z,hdf.elevation_mm],[572,2172,-235,14]);
 for(const [key,face] of [['left',0],['right',1],['bottom',1],['top',0]]){
  const panel=part(b,key),[op]=blankNativeItem(panel,board).blank.machining;
  assert.deepEqual([op.kind,op.face,op.edge,op.offset,op.width,op.depth],['groove',face,'x0',18,4,5]);
 }
 assert.ok(part(b,'shelf-0-0').z-part(b,'shelf-0-0').depth/2>=hdf.z+1.5);
 const q=project({backMount:defaultBackMount('rabbet')});
 assert.equal(q.depth,514);assert.equal(part(q,'right').depth,514);
 assert.equal(part(q,'right').z+part(q,'right').depth/2,part(q,'left').z+255);
 assert.deepEqual([part(q,'back').width,part(q,'back').height,part(q,'back').x,part(q,'back').z],[588,2198,-5,-256.5]);
 assert.deepEqual(q.parts.filter(p=>p.item.blank_machining).map(p=>p.key),['right']);
 const edited=project({backMount:{kind:'groove',width:5,depth:7,offset:24},machining:{left:[defaultCut('miter','x1',1)]}});
 assert.equal(part(edited,'back').width,576);assert.equal(part(edited,'back').z,-228.5);
 assert.deepEqual(part(edited,'left').blank_machining.map(o=>o.kind),['groove','miter']);
 assert.throws(()=>project({backMount:{kind:'groove',width:2,depth:5,offset:18}}),/ХДФ/);
});

test('cut side, reference edge, depth and uncut land are identical in the importer and the editor',()=>{
 const s=readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
 const code=s.slice(s.indexOf('function panelMachiningPlan('),s.indexOf('function resizeAndPlaceBlank('));
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 const makeContour=()=>({Count:0,Objects:[],AddLine(x,y,a,b){this.Objects.push({Pos1:{x,y},Pos2:{x:a,y:b}});this.Count++;}});
 ctx.panelOperations={cutType:{freeForm:4},AddCut(panel,type,name){
  const cut={Name:name,CutType:type,Trajectory:makeContour(),Contour:makeContour()};panel.Cuts.Count++;panel.Cuts.Cuts.push(cut);return cut;
 }};
 const panel={Name:'Полка',Cuts:{Count:0,Cuts:[]}};
 for(const kind of ['groove','rabbet','miter'])for(const edge of panelEdges)for(const face of [0,1]){
  const op=defaultCut(kind,edge,face);
  if(kind==='miter')op.land=1.5;
  const built=ctx.addPanelMachining(panel,op,510,600,18);
  assert.deepEqual(JSON.parse(JSON.stringify(built.plan)),panelMachiningPlan(op,510,600,18));
  assert.equal(ctx.verifyPanelMachining(built).verified,true);
 }
 const last=panel.Cuts.Cuts.at(-1);last.Contour.Objects[0].Pos1.y+=.5;
 assert.throws(()=>ctx.verifyPanelMachining({panel,index:panel.Cuts.Count-1,plan:panelMachiningPlan({...defaultCut('miter','y1',1),land:1.5},510,600,18)}));
});

test('3D board volume removes the real cut in each installed plane and remains closed',()=>{
 const volume=geometry=>{
  const p=geometry.attributes.position,v=i=>new THREE.Vector3().fromBufferAttribute(p,i);
  let sum=0;for(let i=0;i<p.count;i+=3)sum+=v(i).dot(v(i+1).cross(v(i+2)))/6;return sum;
 };
 for(const axis of ['front','horizontal','side','back'])for(const kind of ['groove','rabbet','miter']){
  const op=defaultCut(kind,'x0',1),item=blankItem({axis,length:600,partWidth:510,thickness:18,blank_machining:[op]});
  const {width:w,height:h,depth:d}=item;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w*.001,h*.001,d*.001));mesh.position.y=h*.0005;mesh.userData.geometryKey='base';
  const factory={pool:new Map([['base',{refs:1}]]),acquire:(key,f)=>f()};
  machineBoardMeshes(factory,item,[mesh],'x');
  const removed=600*(kind==='miter'?18*18/2:op.width*op.depth);
  assert.ok(Math.abs(volume(mesh.geometry)*1e9-(w*h*d-removed))<4,axis+' '+kind);
  assert.equal(mesh.geometry.attributes.uv.count,mesh.geometry.attributes.position.count);
 }
});

test('groove and rabbet require the matching external edge across faces, rotations and choices of PVC',()=>{
 for(const axis of ['side','back','horizontal'])for(const kind of ['groove','rabbet','miter']){
  for(const [edge,mask] of Object.entries({x0:'0100',x1:'1000',y0:'0010',y1:'0001'})){
   const item=blankItem({axis,length:600,partWidth:510,edges:'0000',rotation:90,
    blank_edge_thickness_mm:.8,blank_machining:[defaultCut(kind,edge,0)]});
   const target=kind==='miter'?'0000':mask;
   const out=blankNativeItem({...item,blank_edge_code:'0000'},board).blank;
   assert.equal(item.blank_edge_code,target);assert.equal(out.edge_code,target);
   assert.equal(out.cut.width,target.slice(0,2).includes('1')?509.2:510);
   assert.equal(out.cut.length,target.slice(2).includes('1')?599.2:600);
   assert.equal(out.machining[0].edge,edge);
  }
 }
 const back=project({backMount:defaultBackMount('rabbet')});
 assert.equal(part(back,'right').blank_edge_code,'1111');assert.equal(part(back,'left').blank_edge_code,'1011');
 assert.equal(part(back,'back').blank_edge_code,'0000');
 const shelved=project({sectionShelves:[4],shelfChoices:[['board/95388','board/134286','board/confirmat','6/48846']]});
 assert.deepEqual(shelved.parts.filter(p=>p.key.startsWith('shelf-')).map(p=>p.item.blank_edge_code),['1111','1111','1000','0000']);
});
