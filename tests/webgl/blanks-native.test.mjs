import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {blankItem,cuttingSize} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {BLANK_SOURCES,blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const material={name:'ЛДСП тест',article:'T',thickness:18};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function setup(code){
 const panel={isPanel:true,Name:'Заготовка_Вертикальная',Thickness:18,PositionX:18,Build(){},
 Contour:{lines:[],Clear(){this.lines=[];},AddLine(...l){this.lines.push(l);}},
 Butts:{Butts:[1,3,0,2].filter((_,i)=>code[i]==='1').map(ElemIndex=>({ElemIndex})),get Count(){return this.Butts.length;},Clear(){this.Butts=[];},Add(){const b={};this.Butts.push(b);return b;}}};
 const frame={isFrame:true,Width:18,Height:600,Depth:510};
 const obj={Name:'Заготовка',Count:2,Objects:[frame,panel],rotations:[],PositionX:0,PositionY:0,PositionZ:0,AsList(){return this;},Build(){},
 SetDefaultTransform(){this.rotations=[];this.PositionX=this.PositionY=this.PositionZ=0;},
 ToGlobal(p){let v={...p};for(const [ax,deg] of this.rotations){const a=deg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),{x,y,z}=v;
 v=ax.x?{x,y:c*y-s*z,z:s*y+c*z}:ax.y?{x:c*x+s*z,y,z:-s*x+c*z}:{x:c*x-s*y,y:s*x+c*y,z};}
 return {x:v.x+this.PositionX,y:v.y+this.PositionY,z:v.z+this.PositionZ};}};
 const c=vm.createContext({require:createRequire(import.meta.url),process,console,
 objectTransformation:{RotateObject:(o,a,d)=>o.rotations.push([a,d])},
 objectTypeChecker:{ObjectIsPanel:p=>p.isPanel,ObjectIsLimits:p=>p.isFrame},historyOperations:{RegisterObjectChanging(){}},
 materialData:{CreateMaterialData:(name,thickness)=>({name,thickness}),SetupObjectMaterial:(p,m)=>{p.MaterialName=m.name;}}});
 vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);
 return {c,obj,panel,frame};
}
for(const code of Object.keys(BLANK_SOURCES))for(const axis of ['side','horizontal','back'])for(const rotation of [0,90,180,270])test(`native blank ${code} ${axis} ${rotation}: edges, cut allowance, dimensions and pose`,()=>{
 const item=blankItem({length:764,partWidth:430,axis,edges:code,rotation,elevation:650,x:-1200,z:345,blank_edge_thickness_mm:2});
 const out=blankNativeItem(item,material),{c,obj,panel,frame}=setup(code);
 const result=c.resizeAndPlace(obj,out,[]);
 assert.equal(result.materialChecks.length,1);assert.equal(panel.Contour.lines.length,4);
 assert.deepEqual(panel.Contour.lines,[[0,0,430,0],[430,0,430,764],[430,764,0,764],[0,764,0,0]]);
 assert.equal(frame.Height,764);assert.equal(frame.Depth,430);assert.equal(frame.Width,18);
 assert.equal(panel.Butts.Count,code.split('1').length-1);
 panel.Butts.Butts.forEach(e=>{assert.equal(e.ClipPanel,true);assert.equal(e.Thickness,2);assert.equal(e.Allowance,0);});
 const corners=[];for(const x of [0,18])for(const y of [0,764])for(const z of [0,430])corners.push(obj.ToGlobal({x,y,z}));
 const min=k=>Math.min(...corners.map(p=>p[k])),max=k=>Math.max(...corners.map(p=>p[k]));
 close(min('y'),650);close((min('x')+max('x'))/2,-1200);close((min('z')+max('z'))/2,345);
 close(max('y')-min('y'),item.height);close(max('x')-min('x'),rotation%180?item.depth:item.width);
});
test('donor bytes match pins and unsupported source fails before mutation',()=>{
 for(const donor of Object.values(BLANK_SOURCES)){const bytes=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/blank-sources/'+donor.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),donor.sha256);}
 const {c,obj,panel}=setup('1000'),out=blankNativeItem(blankItem(),material);out.source_sha256='bad';assert.throws(()=>c.resizeAndPlace(obj,out,[]),/исходник/);assert.equal(panel.Contour.lines.length,0);
});
test('cut size subtracts only the two physically opposite edges; any four bits export',()=>{
 assert.deepEqual(cuttingSize(blankItem({length:800,partWidth:500,edges:'1011',blank_edge_thickness_mm:2})),{length:796,width:498});
 const out=blankNativeItem(blankItem({edges:'0101'}),material);assert.equal(out.source_sha256,BLANK_SOURCES['1111'].sha256);
 assert.throws(()=>blankNativeItem(blankItem(),null),/материал/);
});

// Use the rebuilt panel contour and the actual donor's local transform (not the
// service frame) to check adjoining faces after the importer has placed them.
for(const rotation of [0,90,180,270])for(const thickness of [16,18,25])
test(`carcass shelves reach supports after native import: ${rotation}°, ${thickness} mm`,()=>{
 for(const shelfGap of [undefined,2])for(const edgePolicy of ['front','all']){
  const built=buildCarcass({recipe:'divided',width:1001,sections:3,thickness,edgePolicy,
    ...(shelfGap===undefined?{}:{shelfGap})});
  const items=placeCarcass(built,{x:-400,z:700,elevation_mm:100,rotation});
  const imported=new Map();
  for(const item of items){
   const out=blankNativeItem(item,{name:'Материал тест',thickness:item.blank_thickness_mm});
   const {c,obj,panel}=setup(item.blank_edge_code);c.resizeAndPlace(obj,out,[]);
   const points=panel.Contour.lines.flatMap(([u,v])=>[0,panel.Thickness].map(w=>{
    const global=obj.ToGlobal({x:panel.PositionX-w,y:v,z:u});
    return localPoint(global,rotation);
   }));
   imported.set(item.item_id,{min:Math.min(...points.map(p=>p.x)),max:Math.max(...points.map(p=>p.x))});
  }
  for(const shelf of items.filter(i=>i.blank_binding)){
   const b=shelf.blank_binding,p=imported.get(shelf.item_id);
   const gap=shelf.name.includes('Полка')?(shelfGap??0):0;
   close(p.min-imported.get(b.left_id).max,gap);
   close(imported.get(b.right_id).min-p.max,gap);
  }
 }
});

for(const spec of [{axis:'back',length:598,partWidth:2198,thickness:3,edges:'0000'},
 {axis:'horizontal',length:564,partWidth:80,thickness:18,edges:'1000'},
 {axis:'back',length:564,partWidth:80,thickness:18,edges:'1100'}])
test('corpus panel native rebuild '+JSON.stringify(spec),()=>{
 const item=blankItem(spec),out=blankNativeItem(item,{name:'Материал тест',thickness:spec.thickness});
 const {c,obj,panel}=setup(BLANK_SOURCES[spec.edges]?spec.edges:'1111');
 c.resizeAndPlace(obj,out,[]);
 assert.equal(panel.Thickness,spec.thickness);
 assert.equal(panel.Butts.Count,spec.edges.split('1').length-1);
 assert.deepEqual(panel.Contour.lines,[[0,0,spec.partWidth,0],[spec.partWidth,0,spec.partWidth,spec.length],
   [spec.partWidth,spec.length,0,spec.length],[0,spec.length,0,0]]);
});

test('back cam entry is on rear face and blind bore remains inside 16/18 mm stock at every edge and yaw',async()=>{
 const {nativeCarcassJoints}=await import('../../backend/v2/cabinet_assets/planner/carcass-joints.mjs');
 for(const thickness of [16,18])for(const rotation of [0,90,180,270]){
  const spec={recipe:'shelves',width:920,back:true,backThickness:thickness};
  const items=placeCarcass(buildCarcass(spec,{idPrefix:'g'}),{x:1000,z:750,elevation_mm:80,rotation})
   .map(it=>({...it,assistant_carcass:{group_id:'g',spec}}));
  const back=items.find(i=>i.item_id==='g:back'),centre=localPoint(back,rotation),rear=centre.z-thickness/2;
  for(const joint of nativeCarcassJoints(items).filter(i=>i.joint_part==='cam'&&i.joint_back_face)){
   const {obj,c}=setup('0000');c.placeByFrame(obj,null,joint,[],{x:0,y:0,z:0});
   const entry=obj.ToGlobal({x:34,y:-9,z:0}),end=obj.ToGlobal({x:34,y:4,z:0});
   close(localPoint(entry,rotation).z,rear);close(localPoint(end,rotation).z,rear+13);
   close(localPoint(entry,rotation).x,localPoint(end,rotation).x);close(entry.y,end.y);
   const x=localPoint(entry,rotation).x-centre.x,y=entry.y-back.elevation_mm;
   assert.ok(Math.abs(x)+7.5<back.width/2 && y>7.5 && y<back.height-7.5);
   assert.ok(thickness-13>=3);
  }
 }
});

test('PRIME 112595 native blank, cup and two plate holes on each side after all room rotations',async()=>{
 const {doorHinges}=await import('../../backend/v2/cabinet_assets/planner/wardrobe-hinges.mjs');
 for(const rotation of [0,90,180,270]){
  const spec={recipe:'shelves',width:801,height:1500,sections:1,shelves:0,front:{swing:'pair',offset:130}};
  const items=placeCarcass(buildCarcass(spec,{idPrefix:'g'}),{x:800,z:700,elevation_mm:80,rotation}).map(it=>({...it,assistant_carcass:{group_id:'g',spec}}));
  for(const door of items.filter(it=>it.blank_axis==='front')){
   const {c,obj}=setup('1111'),pos=localPoint(door,rotation),out=blankNativeItem(door,material);
   c.resizeAndPlace(obj,out,[]);
   const rear=localPoint(obj.ToGlobal({x:18,y:0,z:0}),rotation);
   close(rear.x,pos.x-door.width/2);close(rear.z,pos.z-9);
   for(const joint of doorHinges(door,items)){
    const {c,obj}=setup('0000');c.resizeAndPlace(obj,joint,[]);
    const sign=joint.door_side==='left'?1:-1,edge=pos.x-sign*door.width/2;
    const pt=(x,y,z)=>localPoint(obj.ToGlobal({x,y,z}),rotation);
    close(pt(0,4.5,0).x,edge+sign*21);close(pt(0,4.5,0).z,rear.z);
    close(pt(-12,4.5,0).z,rear.z+12);
    for(const z of [-16,16]){
     close(pt(37,0,z).x,edge+sign*16.5);close(pt(37,0,z).z,rear.z-37);
     close(obj.ToGlobal({x:37,y:0,z}).y,joint.position.y-sign*z);
    }
   }
  }
 }
});

test('wardrobe spacer through cut, split PVC, clipped corners and real thin drawer blanks',()=>{
 for(const [cuts,edges,segments] of [[[[74,144]],2,8],[[[0,35]],1,6],[[[180,200]],1,6],[[],1,4]]){
  const {c,obj,panel}=setup('1000'),out=blankNativeItem(blankItem({item_id:'g:drawer-0-spacer-left',length:200,partWidth:550,axis:'side',edges:'1000'}),material);
  out.blank.spacer_cuts=cuts;c.resizeAndPlace(obj,out,[]);
  assert.equal(panel.Contour.lines.length,segments);assert.equal(panel.Butts.Count,edges);
  for(const e of panel.Butts.Butts){const [x,,a]=panel.Contour.lines[e.ElemIndex];assert.equal(x,550);assert.equal(a,550);}
 }
 for(const [key,axis,L,T] of [['0-bottom','horizontal',463,3],['0-side-left','side',77,18]]){
  const out=blankNativeItem(blankItem({item_id:'g:drawer-0-'+key,length:L,partWidth:500,thickness:T,axis,edges:'0000'}),{name:'board',thickness:T});
  const {c,obj}=setup('0000');assert.doesNotThrow(()=>c.resizeAndPlace(obj,out,[]));
 }
});

test('the importer mills through clipped PVC on each AKS edge and accepts existing unbanded exports',()=>{
 const contour=()=>({Objects:[],get Count(){return this.Objects.length;},
  AddLine(x,y,a,b){this.Objects.push({Pos1:{x,y},Pos2:{x:a,y:b}});},
  AddRectangle(x,y,a,b){this.AddLine(x,y,a,y);this.AddLine(a,y,a,b);this.AddLine(a,b,x,b);this.AddLine(x,b,x,y);}});
 for(const article of ['67698','75975'])for(const [index,edge] of ['right','left','bottom','top'].entries()){
  const item=blankItem({axis:'front',edges:'1111',length:700,partWidth:410,
   blank_edge_thickness_mm:2,blank_edge_pull:{article,edge}});
  const out=blankNativeItem(item,material),{c,obj,panel}=setup('1111');
  panel.Cuts={Cuts:[],get Count(){return this.Cuts.length;}};
  c.panelOperations={cutType:{freeForm:4},AddCut(p,type,name){
   const cut={CutType:type,Name:name,Contour:contour(),Trajectory:contour()};p.Cuts.Cuts.push(cut);return cut;
  }};
  const plan=c.edgeGripGroovePlan(out.blank),depth=article==='67698'?10.5:13.5;
  const line=index<2?[edge==='right'?410-depth/2:depth/2,0,edge==='right'?410-depth/2:depth/2,700]:
   [0,edge==='top'?700-depth/2:depth/2,410,edge==='top'?700-depth/2:depth/2];
  assert.deepEqual([...plan.line],line);
  c.resizeAndPlace(obj,out,[]);
  assert.equal(panel.Cuts.Count,1);assert.equal(panel.Butts.Count,4);
  assert.ok(panel.Butts.Butts.every(b=>b.Thickness===2 && b.ClipPanel));
  const oldCode=['0111','1011','1101','1110'][index];
  assert.deepEqual([...c.edgeGripGroovePlan({...out.blank,edge_code:oldCode}).line],line);
 }
});
