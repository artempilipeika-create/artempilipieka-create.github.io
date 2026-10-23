import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {countertopContour,countertopSurfaces,countertopGeometry} from '../../backend/v2/cabinet_assets/planner/countertop-visuals.mjs';
import {PRODUCTION_MODELS as models,CORNER_VARIANTS,normalizeKitchen,kitchenRuns,cornerReturnPlacement} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
const room={width:12000,depth:12000,height:3000};
let next=0;
function item(id='bazis.0211e4f77fc4',patch={}){
  const p=models[id];return normalizeKitchen({item_id:'counter-test-'+next++,bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,module_type:'base_cabinet',width:p.native_defaults.width,height:820,body_height:720,base_height:100,depth:510,base:'plinth',x:0,z:0,rotation:0,...patch});
}
const corner=(side,patch)=>item(CORNER_VARIANTS.find(v=>v.side===side&&v.purpose==='sink'&&v.door_count===1).id,patch);
function inside(x,z,points){
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const [ax,az]=points[j],[bx,bz]=points[i],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    if(Math.hypot(x-ax-t*dx,z-az-t*dz)<.002)return true;
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)hit=!hit;
  }
  return hit;
}
function verifyGeometry(part,surface){
  const g=countertopGeometry(surface,part.thickness),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,contour=countertopContour(part);
  assert.ok(p.count/3<8000,'bounded mesh budget');
  for(let i=0;i<p.count;i++){
    assert.ok(inside(p.getX(i)*1000,p.getZ(i)*1000,contour),`outside footprint: ${p.getX(i)*1000}, ${p.getZ(i)*1000}`);
    assert.ok(p.getY(i)>=-1e-7&&p.getY(i)<=.0380001);
    assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
    assert.ok(Number.isFinite(uv.getX(i))&&Number.isFinite(uv.getY(i)));
  }
  assert.ok(Math.abs(g.boundingBox.max.y-g.boundingBox.min.y-.038)<1e-7);
  for(let i=0;i<p.count;i+=3){
    const a=new Vector3().fromBufferAttribute(p,i),b=new Vector3().fromBufferAttribute(p,i+1),c=new Vector3().fromBufferAttribute(p,i+2);
    const normal=new Vector3().fromBufferAttribute(n,i).add(new Vector3().fromBufferAttribute(n,i+1)).add(new Vector3().fromBufferAttribute(n,i+2));
    assert.ok(b.sub(a).cross(c.sub(a)).dot(normal)>-1e-9,'outward triangle winding');
  }
  return g;
}
test('38 mm top has a smooth front, continuous laminate UVs and exact overall bounds',()=>{
  const runs=kitchenRuns([item(),item(undefined,{x:600})],room),[part,s]=[...countertopSurfaces(runs)][0],g=verifyGeometry(part,s),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  assert.ok(Math.abs(g.boundingBox.max.x-g.boundingBox.min.x-1.2)<1e-6);
  assert.ok(Math.abs(g.boundingBox.max.z-g.boundingBox.min.z-.6)<1e-6);
  assert.ok([...Array(n.count).keys()].some(i=>n.getZ(i)>.2&&n.getZ(i)<.9&&n.getY(i)>.2));
  // At the top-front tangent both cap and curved edge use z/x UVs in metres.
  for(let i=0;i<p.count;i++)if(p.getY(i)>.0379999&&p.getZ(i)>.5959&&Math.abs(n.getZ(i))<1e-6){assert.ok(Math.abs(uv.getX(i)-p.getZ(i))<1e-6);assert.ok(Math.abs(uv.getY(i)-p.getX(i))<1e-6);}
  g.dispose();
});
for(const joint of ['standard','euro'])for(const side of ['left','right'])for(const rotation of [0,90,180,270])test(`${side} ${joint} corner at ${rotation}: no exterior growth or rounded shared joints`,()=>{
  const a=corner(side,{rotation,countertopJoint:joint}),b=cornerReturnPlacement(a,item(undefined,{countertopJoint:joint})),items=[a,b],before=JSON.stringify(items),runs=kitchenRuns(items,room),source=JSON.stringify(runs);
  let shared=0,rounded=0;
  for(const [part,s]of countertopSurfaces(runs)){
    verifyGeometry(part,s).dispose();shared+=s.radii.filter(r=>r===0).length;rounded+=s.radii.filter(r=>r===4).length;
    for(const [a,b]of s.joints){assert.ok(s.points.some((p,i)=>s.radii[i]===0&&Math.hypot(p[0]-a[0],p[1]-a[1])<.001));assert.ok(Math.hypot(b[0]-a[0],b[1]-a[1])>.01);}
  }
  assert.ok(shared>=2&&rounded===2);assert.equal(JSON.stringify(items),before);assert.equal(JSON.stringify(runs),source);
});
test('U-shaped euro tops retain their exact native export and production parts',()=>{
  const a=corner('left',{x:-1000,countertopJoint:'euro'}),b=corner('right',{x:1000,countertopJoint:'euro'}),items=[a,item('bazis.3079d0656398',{width:1000,countertopJoint:'euro'}),b,cornerReturnPlacement(a,item(undefined,{countertopJoint:'euro'})),cornerReturnPlacement(b,item(undefined,{countertopJoint:'euro'}))];
  const runs=kitchenRuns(items,room),before=JSON.stringify(globalThis.MF_COUNTERTOPS.nativeItems(runs));
  for(const [part,s]of countertopSurfaces(runs))verifyGeometry(part,s).dispose();
  const f=new MeshFactory({room,material:()=>null,template:it=>({production:models[it.bazis_id]})},()=>{}),g=f.dress(items);let count=0;
  g.traverse(m=>{if(m.userData.part?.role==='counter'){count++;assert.equal(m.geometry.userData.profile,'postformed-38');assert.ok(m.material.isMeshPhysicalMaterial);}});
  assert.equal(count,3);assert.equal(JSON.stringify(globalThis.MF_COUNTERTOPS.nativeItems(kitchenRuns(items,room))),before);
  f.release(g);assert.ok([...f.pool.values()].every(v=>v.refs===0));f.dispose();
});
test('Stock length butt joints remain full-height, with only one visual seam',()=>{
  const runs=kitchenRuns(Array.from({length:8},(_,i)=>item(undefined,{x:i*600})),room),surfaces=countertopSurfaces(runs);
  assert.equal(surfaces.size,2);assert.equal([...surfaces.values()].reduce((n,s)=>n+s.joints.length,0),1);
  for(const [part,s]of surfaces){assert.equal(s.radii.filter(r=>r===0).length,1);verifyGeometry(part,s).dispose();}
});
test('Countertop satin finish respects an explicit roughness and leaves cabinet materials alone',()=>{
  const f=new MeshFactory({room,material:()=>({visual:{roughness:.91,render_color:'#aaaaaa'}})},()=>{});
  assert.equal(f.material('counter').metalness,0);assert.equal(f.material('counter').roughness,.58);assert.equal(f.material('counter','matte').roughness,.91);assert.ok(f.material('counter').clearcoat>0);
  assert.equal(f.material('body').isMeshPhysicalMaterial,undefined);f.dispose();
});
