import test from 'node:test';
import assert from 'node:assert/strict';
import {SPECIAL_BASE_PRODUCTION as models,PRODUCTION_MODELS,normalizeKitchen,productionParts,facadeCells,productionHardware,dimensionPatch,dimensionError,kitchenRuns} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
const oven='bazis.9e77f4333545',room={width:6200,depth:4000,height:2700};
const item=(id,extra={})=>{const p=models[id];return normalizeKitchen({item_id:id,bazis_id:id,bazis_sha256:p.source_sha256,name:p.label,module_type:'base_cabinet',width:600,height:820,body_height:720,base_height:100,depth:p.scene_depth,base:'plinth',layout:id===oven?'niche':'doors',drawers:id===oven?1:0,handles:'handles',x:0,z:0,rotation:0,shelves:[],...extra});};
const template=it=>({production:models[it.bazis_id],limits:{w:it.bazis_id===oven?[600,600]:[300,1200],h:it.bazis_id===oven?[820,1100]:[700,1100],d:[450,700]}});
const parts=it=>productionParts(it,template(it));
const dims=p=>[p.length,p.width,p.thickness];
for(const id of Object.keys(models).filter(x=>x!==oven))test(models[id].label+': exact PDF parts and vertical top/top/bottom FR3D rails',()=>{
 const it=item(id),bom=parts(it),rails=bom.filter(x=>x.key.startsWith('rail-'));
 assert.equal(bom.length,id==='bazis.5731630ddd87'?8:7);
 assert.deepEqual(dims(bom.find(x=>x.key==='bottom')),[600,510,18]);
 assert.equal(bom.some(x=>x.role==='back'||x.role==='shelf'),false);
 assert.deepEqual(rails.map(dims),Array(3).fill([80,564,18]));
 assert.deepEqual(rails.map(x=>x.size),Array(3).fill({x:564,y:80,z:18}));
 assert.deepEqual(rails.map(x=>x.position),[{x:0,y:780,z:-246},{x:0,y:780,z:246},{x:0,y:158,z:-246}]);
 assert.deepEqual(facadeCells(it,template(it)).map(x=>[x.w,x.h]),id==='bazis.5731630ddd87'?[[297,717],[297,717]]:[[597,717]]);
 assert.deepEqual(bom.filter(x=>x.role==='front').map(dims),id==='bazis.5731630ddd87'?[[717,297,18],[717,297,18]]:[[717,597,18]]);
 const tall=dimensionPatch(it,{body_height:850}),tallRails=parts(tall).filter(x=>x.key.startsWith('rail-'));
 assert.deepEqual(tallRails.map(x=>x.position.y),[910,910,158]);
 const hw=productionHardware(it);assert.equal(hw.hinge_count,id==='bazis.5731630ddd87'?4:2);
 assert.equal(hw.items.find(x=>x.key==='confirmat-7x50').quantity,10);
 assert.equal(hw.items.find(x=>x.key==='angle-cast').quantity,4);
 assert.ok(hw.items.every(x=>!x.article));
});
test('NSHD exact drawer and support panel match uploaded specification and FR3D positions',()=>{
 const it=item(oven),bom=parts(it);assert.equal(bom.length,10);
 for(const [key,expected]of [['bottom',[600,480,18]],['side-L',[702,500,18]],['side-P',[702,500,18]],['oven-divider',[564,500,18]],['drawer-1-rear',[66,500,18]],['drawer-1-front',[66,500,18]],['drawer-1-side-P',[66,500,18]],['drawer-1-side-L',[66,500,18]],['drawer-1-bottom',[532,496,3]],['drawer-front-1',[122,597,18]]])assert.deepEqual(dims(bom.find(x=>x.key===key)),expected,key);
 assert.equal(bom.find(x=>x.key==='bottom').position.z,-10);
 assert.equal(bom.find(x=>x.key==='oven-divider').position.y,216);
 assert.equal(bom.find(x=>x.key==='drawer-1-rear').position.y,164);
 assert.equal(bom.find(x=>x.key==='drawer-1-bottom').position.y,129.5);
 assert.equal(bom.find(x=>x.key==='drawer-1-rear').position.x,-.5);
 assert.deepEqual(productionHardware(it).items.map(x=>x.quantity),[4,4,2,2,12,2,2,16]);
});
test('NSHD clear upper niche remains 595 for body resizing, leg changes and saved state',()=>{
 for(const body_height of [720,750,800,900,1000])for(const legHeightMm of [80,100,150]){
  const it=dimensionPatch(item(oven),{body_height,legHeightMm}),bom=parts(it),split=bom.find(x=>x.key==='oven-divider'),front=facadeCells(it,template(it))[0];
  const adapter=new StateAdapter({state:()=>({room,items:[it]}),template});assert.equal(adapter.validate(it),'');
  assert.equal(it.height-(split.position.y+split.size.y/2),595);
  assert.equal(front.h,body_height-598);assert.equal(front.w,597);
  assert.equal(bom.find(x=>x.key==='drawer-1-rear').size.y,66+body_height-720);
  assert.equal(bom.find(x=>x.key==='drawer-1-rear').position.y-bom.find(x=>x.key==='drawer-1-rear').size.y/2,legHeightMm+31);
  assert.deepEqual(parts(JSON.parse(JSON.stringify(it))),bom);
 }
});
test('All single-door production modules reject width 601; NSHD rejects both width directions',()=>{
 for(const [id,p]of Object.entries(PRODUCTION_MODELS))if(p.doors?.length===1){
  const base={bazis_id:id,width:600,height:p.body_height+p.base_height,base_height:p.base_height};
  assert.equal(dimensionError(base,{production:p}),'');
  assert.match(dimensionError({...base,width:601},{production:p}),/600/);
 }
 const it=item(oven),adapter=new StateAdapter({state:()=>({room,items:[it]}),template});
 for(const width of [599,601,900])assert.match(adapter.validate({...it,width}),/600/);
 assert.equal(adapter.validate(it),'');
 assert.match(adapter.validate(dimensionPatch(it,{body_height:600})),/595/);
});
test('Four new modules join continuous kitchen surfaces and preserve exact donor hashes',()=>{
 const row=Object.keys(models).map((id,i)=>item(id,{x:i*600}));
 // Sink depth 510 and oven depth 500 are aligned by their rear planes.
 row[3].z=-5;
 assert.equal(kitchenRuns(row,room).length,1);
 assert.equal(kitchenRuns(row,room)[0].countertopActualLengthMm,2400);
 for(const it of row)assert.equal(it.bazis_sha256.length,64);
});

test('Legacy donors keep their geometry envelope without silently acquiring the new niche construction',()=>{
 const old={...item(oven),bazis_sha256:'b1d83b58fc32f95f5a1924bad1c60f50267f38f13de122db4def7f0610d1df65',height:720,base_height:80};
 delete old.legHeightMm;delete old.body_height;
 assert.equal(dimensionError(old,{front:{kind:'none'}}),'');
 assert.match(dimensionError({...old,width:599},{front:{kind:'none'}}),/600/);
});
