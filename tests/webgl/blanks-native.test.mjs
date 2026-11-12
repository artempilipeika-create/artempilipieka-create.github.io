import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {blankItem,cuttingSize} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {BLANK_SOURCES,blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
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
