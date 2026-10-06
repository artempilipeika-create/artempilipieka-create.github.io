import test from 'node:test';
import assert from 'node:assert/strict';
import {CORNER_PRODUCTION,PRODUCTION_MODELS,cornerSpec,cornerReturnPlacement,normalizeKitchen,kitchenSettings,productionParts,facadeCells,productionHardware,kitchenLegs,dimensionPatch,dimensionError,kitchenRuns,rotateXZ,bounds,overlaps,placementError} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {findSpace,snapItem} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const id='bazis.b4420a0b4bbc',p=CORNER_PRODUCTION[id],room={width:6200,depth:6200,height:2700};
const template=it=>({production:PRODUCTION_MODELS[it.bazis_id],resize:true,limits:PRODUCTION_MODELS[it.bazis_id].limits||{w:[300,600],h:[700,1100],d:[450,700]}});
const item=(bid=id,extra={})=>{const m=PRODUCTION_MODELS[bid];return normalizeKitchen({item_id:bid,bazis_id:bid,bazis_file:m.source_file,bazis_sha256:m.source_sha256,name:m.label,module_type:'base_cabinet',width:m.native_defaults.width,height:820,depth:m.scene_depth,body_height:720,base_height:100,base:'plinth',layout:'doors',drawers:0,handles:'handles',x:0,z:0,rotation:0,shelves:[],...extra});};
const parts=it=>productionParts(it,template(it));
// Independently decoded FR3D world coordinates (native origin, not renderer coordinates).
// All eleven panels also match Деталировка(1).pdf, printed 2026-10-07.
const native={
 bottom:[[50,100,0],[1000,118,510],[950,510,18]],
 'side-L':[[50,118,0],[68,820,510],[702,510,18]],
 'side-P':[[982,118,0],[1000,820,510],[702,510,18]],
 'rail-rear':[[68,740,0],[982,820,18],[80,914,18]],
 'rail-front':[[68,740,492],[982,820,510],[80,914,18]],
 'rail-rear-lower':[[68,118,0],[982,198,18],[80,914,18]],
 'blind-panel':[[50,102,510],[628,818,528],[716,578,18]],
 'filler-support-left':[[114,102,528],[132,818,578],[50,716,18]],
 'filler-support-right':[[542,102,528],[560,818,578],[50,716,18]],
 'filler-front':[[560,102,528],[578,818,578],[50,716,18]],
 'door-1':[[629.5,102,510],[998.5,818,528],[716,369,18]]
};
test('NMU donor: exact eleven blanks, positions, orientations, materials and six supports',()=>{
 const it=item(),bom=parts(it);assert.equal(bom.length,11);
 assert.equal(p.source_sha256,'e5145e6878304cde87b0344685ac309ed92302216394e01c6bb2fbdebb5b7b60');
 for(const part of bom){
  const [lo,hi,blank]=native[part.key];
  assert.deepEqual([part.length,part.width,part.thickness],blank,part.key);
  for(const [i,axis]of ['x','y','z'].entries()){
   const shift=axis==='x'?500:axis==='z'?255:0;
   assert.equal(part.position[axis]-part.size[axis]/2+shift,lo[i],part.key+' min '+axis);
   assert.equal(part.position[axis]+part.size[axis]/2+shift,hi[i],part.key+' max '+axis);
  }
  assert.equal(part.material.name,part.role==='front'?'Evagloss P004':'ЛДСП- БЕЛЫЙ');
 }
 assert.equal(kitchenLegs(it).length,6);assert.equal(bom.filter(v=>v.fixed).length,4);
 const hw=productionHardware(it);assert.equal(hw.hinge_count,2);assert.match(hw.hinge_name,/HCKT/);
 assert.deepEqual(hw.items.map(v=>v.quantity),[6,12,10,3,3,3,3,3,3,5,4]);
});
test('Corner width grows right: fixed blind panel/fillers, doorway grows, door cannot exceed 600',()=>{
 for(const width of [800,950,1000,1100,1200,1231]){
  const it=dimensionPatch(item(),{width}),bom=parts(it),f=facadeCells(it,template(it))[0];
  assert.equal(f.w,width-631);assert.equal(f.h,716);assert.equal(dimensionError(it,template(it)),'');
  assert.equal(bom.find(v=>v.key==='bottom').length,width-50);
  assert.equal(bom.find(v=>v.key==='blind-panel').width,578);
  assert.equal(bom.find(v=>v.key==='side-L').position.x-9+width/2,50);
  assert.equal(bom.find(v=>v.key==='filler-front').position.x+width/2,569);
 }
 assert.match(dimensionError({...item(),width:1232},template(item())),/600/);
});
test('Height/depth resize preserves 18 mm boards, 80 mm rails, 50 mm fillers and empty wall space',()=>{
 for(const body_height of [600,720,850,1000])for(const legHeightMm of [80,100,150])for(const depth of [450,510,600,700]){
  const it=dimensionPatch(item(),{body_height,legHeightMm,depth}),bom=parts(it);
  const adapter=new StateAdapter({state:()=>({room,items:[it]}),template});assert.equal(adapter.validate(it),'');
  assert.ok(bom.every(v=>v.thickness===18));
  assert.equal(bom.find(v=>v.key==='rail-rear-lower').position.y,legHeightMm+58);
  assert.equal(bom.find(v=>v.key==='rail-front').position.y,it.height-40);
  assert.equal(bom.find(v=>v.key==='door-1').length,body_height-4);
  assert.equal(bom.find(v=>v.key==='filler-front').length,50);
  assert.equal(bom.find(v=>v.key==='bottom').width,depth);
 }
});
for(const rotation of [0,90,180,270])test('50 mm wall gaps and exact L junction at '+rotation+' degrees',()=>{
 const a=item(id,{rotation,...rotateXZ(-2600,-2795,rotation)}),b=cornerReturnPlacement(a,item('bazis.0211e4f77fc4'));
 const all=[a,b];assert.equal(b.rotation,(rotation+270)%360);
 for(const it of all)assert.equal(placementError(it,all,room),'');
 const local=rotateXZ(b.x-a.x,b.z-a.z,-rotation);assert.deepEqual(local,{x:-195,z:623});
 const aParts=parts(a),left=aParts.find(v=>v.key==='side-L');assert.equal(left.position.x-9+a.width/2,50);
 const made=findSpace(item('bazis.0211e4f77fc4'),[a],room,a);assert.deepEqual([made.x,made.z,made.rotation],[b.x,b.z,b.rotation]);
 const snap=snapItem({...b,x:b.x+10,z:b.z+12},[a],room,{threshold:45});assert.equal(snap.error,'');assert.deepEqual([snap.item.x,snap.item.z,snap.item.rotation],[b.x,b.z,b.rotation]);
 const runs=kitchenRuns(all,room),tops=[];assert.equal(runs.length,2);
 assert.equal(runs.find(v=>v.members.includes(b.item_id)).countertopActualLengthMm,628);
 for(const r of runs)for(const part of r.parts.filter(v=>v.role==='counter')){
  const q=rotateXZ(part.position.x,part.position.z,r.rotation);
  tops.push(bounds({x:r.position.x+q.x,z:r.position.z+q.z,width:part.size.x,depth:part.size.z,height:part.size.y,elevation_mm:part.position.y-part.size.y/2,rotation:r.rotation},room,false));
 }
 assert.equal(overlaps(tops[0],tops[1]),false);
 const near=rotation%180?Math.min(Math.abs(tops[0].maxX-tops[1].minX),Math.abs(tops[1].maxX-tops[0].minX)):Math.min(Math.abs(tops[0].maxZ-tops[1].minZ),Math.abs(tops[1].maxZ-tops[0].minZ));
 assert.equal(near,0);
 assert.match(placementError({...b,...rotateXZ(-195,603,rotation),x:a.x+rotateXZ(-195,603,rotation).x,z:a.z+rotateXZ(-195,603,rotation).z},[a],room),/Пересечение/);
});
test('Fixed blind faces retain their actual orientation, do not pivot, and follow facade material',()=>{
 const it=item(),factory=new MeshFactory({room,template,material:()=>null},()=>{}),g=factory.build(it);
 let fixed=[],pivots=[];g.traverse(m=>{if(m.userData.part?.fixed)fixed.push(m);if(m.userData.role==='door-pivot')pivots.push(m);});
 assert.equal(fixed.length,4);assert.equal(pivots.length,1);
 assert.equal(fixed.find(m=>m.userData.part.key==='filler-front').userData.part.size.x,18);
 factory.updateAppearance(g,it,'facadesHidden');assert.equal(pivots[0].visible,false);
 assert.equal(fixed.find(m=>m.userData.part.key==='blind-panel').visible,false);
 assert.equal(fixed.find(m=>m.userData.part.key==='filler-support-left').visible,true);
 factory.release(g);factory.dispose();
});
test('New 50 mm gap migrates wall-attached 60/80 mm projects once and preserves floating coordinates',()=>{
 for(const rotation of [0,90,180,270])for(const oldGap of [60,80]){
  const before={...item('bazis.0211e4f77fc4'),rotation,rearServiceGapMm:oldGap,...rotateXZ(0,-3100+255+oldGap,rotation)};
  const after=normalizeKitchen(before,room),local=rotateXZ(after.x,after.z,-rotation);
  assert.equal(local.z,-2795);assert.equal(after.rearServiceGapMm,50);assert.deepEqual(normalizeKitchen(after,room),after);
 }
 const floating={...item(),x:250,z:200,rearServiceGapMm:80};assert.equal(normalizeKitchen(floating,room).z,200);
 assert.equal(kitchenSettings(floating).rearServiceGapMm,50);
 const legacy={...item(),bazis_sha256:'5bc821b8f246c9e93a777dab38a032d900731b92b14be0839b9c5a5116117764'};
 assert.equal(cornerSpec(legacy),null);assert.equal(kitchenSettings(legacy),null);
});
