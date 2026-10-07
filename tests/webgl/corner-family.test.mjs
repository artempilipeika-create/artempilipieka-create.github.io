import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CORNER_VARIANTS as variants,PRODUCTION_MODELS as models,cornerVariantInfo,cornerVariant,normalizeKitchen,productionParts,productionShelves,productionHardware,facadeCells,dimensionPatch,dimensionError,kitchenLegs,cornerReturnPlacement,rotateXZ,placementError,kitchenRuns,bounds,overlaps} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {findSpace,snapItem} from '../../backend/v2/cabinet_assets/planner/placement.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const fixtures=JSON.parse(fs.readFileSync(new URL('./corner-native-fixtures.json',import.meta.url)));
const room={width:6200,depth:6200,height:2700};
const catalogue=variants.map(v=>({...v,resize:true}));
const item=(v=variants[0],extra={})=>normalizeKitchen({item_id:'corner',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,
  name:'У окна',module_type:'base_cabinet',width:1000,height:820,depth:510,body_height:720,base_height:100,base:'plinth',layout:'doors',drawers:0,
  handles:'handles',doors_open:false,x:0,z:0,rotation:0,shelves:structuredClone(models[v.id].shelves),...extra});
const template=it=>({production:models[it.bazis_id],resize:true,limits:models[it.bazis_id].limits});
const parts=it=>productionParts(it,template(it));
const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,`${message}: ${a} != ${b}`);

test('Canonical JSON and browser data agree',()=>assert.deepEqual(variants,JSON.parse(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/corner-variants.json',import.meta.url)))));
for(const v of variants)test(v.label+': every panel matches independently decoded final FR3D',()=>{
  const it=item(v),bom=parts(it),native=fixtures.find(f=>f.sha===v.source_sha256);
  assert.equal(bom.length,native.parts.length);
  const remaining=[...native.parts];
  for(const p of bom){
    const lo=['x','y','z'].map((axis,i)=>p.position[axis]-p.size[axis]/2+[500,0,255][i]);
    const hi=['x','y','z'].map((axis,i)=>p.position[axis]+p.size[axis]/2+[500,0,255][i]);
    const index=remaining.findIndex(n=>n.min.every((x,i)=>Math.abs(x-lo[i])<1e-6)&&n.max.every((x,i)=>Math.abs(x-hi[i])<1e-6));
    assert.ok(index>=0,p.key+' '+JSON.stringify({lo,hi}));remaining.splice(index,1);
    assert.equal(p.material.name,p.role==='front'?'Evagloss P004':p.role==='back'?'ЛХДФ 3ММ Белый':'ЛДСП- БЕЛЫЙ');
  }
  assert.equal(remaining.length,0);
  assert.deepEqual(facadeCells(it,template(it)).map(f=>[f.h,f.w]),Array(v.door_count).fill([717,v.door_count===1?369:183]));
  assert.equal(kitchenLegs(it).length,6);
  const hw=productionHardware(it);assert.deepEqual(hw.items,v.hardware_items);assert.equal(hw.items.filter(r=>r.key==='hinge-hckt')[0].quantity,2);
  assert.equal(hw.items.some(r=>r.key==='hinge-prime'),v.door_count===2);
  assert.equal(bom.some(p=>p.role==='shelf'),v.purpose==='shelf');assert.equal(bom.some(p=>p.role==='back'),v.purpose==='shelf');
  assert.equal(bom.find(p=>p.key==='blind-panel').width,120);assert.equal(bom.find(p=>p.key==='blind-body').width,458);
  assert.equal(dimensionError(it,template(it)),'');
});

test('All transitions preserve dimensions, materials, placement, custom name and the actual donor identity',()=>{
  for(const from of variants)for(const to of variants){
    const a=item(from,{width:1100,height:900,body_height:800,x:10.5,z:20,rotation:270,body_variant_id:'body',front_variant_id:'front',part_materials:{'blind-panel':'special'}});
    const b=cornerVariant(a,{side:to.side,purpose:to.purpose,door_count:to.door_count},catalogue);
    assert.equal(cornerVariantInfo(b),to);assert.equal(b.bazis_file,to.source_file);assert.equal(b.bazis_sha256,to.source_sha256);
    for(const k of ['item_id','name','width','height','body_height','depth','x','z','rotation','body_variant_id','front_variant_id','part_materials'])assert.deepEqual(b[k],a[k],k);
    assert.equal(productionShelves(b).length,to.purpose==='shelf'?1:0);
    assert.deepEqual(cornerVariantInfo(JSON.parse(JSON.stringify(b))),to);
  }
  assert.throws(()=>cornerVariant({...item(),bazis_sha256:'stale'},{side:'right'},catalogue));
  assert.throws(()=>cornerVariant(item(),{side:'up'},catalogue));
  assert.throws(()=>cornerVariant(item(),{side:'right'},[]));
  assert.equal(cornerVariantInfo({bazis_id:'bazis.b4420a0b4bbc',bazis_sha256:models['bazis.b4420a0b4bbc'].source_sha256}),null);
  const a=item(variants[2],{shelves:[{...models[variants[2].id].shelves[0],offset_mm:390,material_variant_id:'shelf'}]});
  const sink=cornerVariant(a,{purpose:'sink'},catalogue);assert.equal(parts(sink).some(p=>p.role==='shelf'),false);
  assert.deepEqual(cornerVariant(sink,{purpose:'shelf'},catalogue),a);
});

test('Every facade is limited to 600 mm; odd widths keep exact gaps and fixed split blind panels',()=>{
  for(const v of variants)for(const width of [800,1001,v.door_count===1?1231:1834]){
    const it=dimensionPatch(item(v),{width,body_height:800,legHeightMm:150,depth:600}),bom=parts(it),fs=facadeCells(it,template(it)).sort((a,b)=>a.cx-b.cx);
    assert.equal(dimensionError(it,template(it)),'');assert.ok(fs.every(f=>f.w<=600&&f.h===797));
    if(fs.length===2)near(fs[1].cx-fs[1].w/2-(fs[0].cx+fs[0].w/2),3,'centre gap');
    assert.equal(bom.find(p=>p.key==='bottom').length,width-50);
    assert.equal(bom.find(p=>p.key==='blind-panel').width,120);assert.equal(bom.find(p=>p.key==='blind-body').width,458);
    assert.match(dimensionError({...it,width:v.door_count===1?1232:1835},template(it)),/600/);
  }
});

for(const side of ['left','right'])for(const rotation of [0,90,180,270])test(side+' corner: mirrored wall anchoring and L junction at '+rotation,()=>{
  const v=variants.find(v=>v.side===side&&v.purpose==='sink'&&v.door_count===1),sign=side==='left'?1:-1;
  const a=item(v,{rotation,...rotateXZ(-sign*2600,-2795,rotation)});
  const cabinet=normalizeKitchen({...item(),item_id:'return',bazis_id:'bazis.0211e4f77fc4',bazis_sha256:models['bazis.0211e4f77fc4'].source_sha256,width:600});
  const b=cornerReturnPlacement(a,cabinet);assert.equal(b.rotation,(rotation+(side==='left'?270:90))%360);
  for(const it of [a,b])assert.equal(placementError(it,[a,b],room),'');
  assert.deepEqual(rotateXZ(b.x-a.x,b.z-a.z,-rotation),{x:-sign*195,z:623});
  assert.deepEqual(findSpace(cabinet,[a],room,a),{...b,elevation_mm:0});
  const snap=snapItem({...b,x:b.x+10,z:b.z+10},[a],room);assert.equal(snap.error,'');assert.equal(snap.item.x,b.x);assert.equal(snap.item.z,b.z);
  const cs=snapItem({...a,x:a.x+10,z:a.z+10},[],room);assert.equal(cs.item.x,a.x);assert.equal(cs.item.z,a.z);
  const plan=kitchenRuns([a,b],room),tops=[];assert.deepEqual(plan.map(r=>r.countertopActualLengthMm).sort((x,y)=>x-y),[628,1000]);
  for(const r of plan)for(const p of r.parts){assert.ok(p.length>0);if(p.role==='counter'){
    const q=rotateXZ(p.position.x,p.position.z,r.rotation);tops.push(bounds({x:r.position.x+q.x,z:r.position.z+q.z,width:p.size.x,depth:p.size.z,height:p.size.y,elevation_mm:p.position.y-p.size.y/2,rotation:r.rotation},room,false));
  }}
  assert.equal(overlaps(tops[0],tops[1]),false);
  const placed=findSpace(item(v),[],room,null);assert.equal(placed.x,side==='left'?-2600:2600);
});

test('Open two-door corners retain the fixed blind panels and put handles opposite each hinge',()=>{
  for(const v of variants.filter(v=>v.door_count===2)){
    const it=item(v,{doors_open:true}),factory=new MeshFactory({room,template,material:()=>null},()=>{}),g=factory.build(it),pivots=[],fixed=[];
    g.traverse(m=>{if(m.userData.role==='door-pivot')pivots.push(m);if(m.userData.part?.fixed)fixed.push(m);});
    assert.equal(pivots.length,2);assert.equal(fixed.length,5);
    for(const pivot of pivots){const handle=pivot.children.find(m=>m.userData.role==='handle');assert.ok(handle);assert.ok(handle.position.x*(pivot.userData.hingeSide==='left'?1:-1)>0);}
    factory.release(g);factory.dispose();
  }
});
