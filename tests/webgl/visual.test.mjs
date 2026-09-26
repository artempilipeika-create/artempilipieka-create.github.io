import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshFactory,panelGeometry,VISUAL_FINISHES} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {facadeCells,heights,dimensionPatch} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const room={width:6200,depth:3600,height:2700};
const make=(front={kind:'doors',count:2})=>new MeshFactory({room,material:()=>null,template:()=>({front})},()=>{});
const item={item_id:'fixed',module_type:'base_cabinet',width:800,height:720,depth:560,x:0,z:0,rotation:0,base:'plinth',handles:'handles',layout:'doors',drawers:0};
const roles=(g,r)=>g.children.filter(o=>o.userData.role===r);
function size(g){g.computeBoundingBox();const b=g.boundingBox;return[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z].map(v=>Math.round(v*10000)/10);}
test('Bevel stays inside the exact 397 by 637 by 18 mm facade envelope',()=>{const g=panelGeometry(397,637,18,.85);assert.deepEqual(size(g),[397,637,18]);assert.equal(g.index.count/3,108);assert.ok([...g.attributes.normal.array].every(Number.isFinite));g.dispose();});
test('Two separate doors, 1.5 mm on each side, handles at the meeting edges',()=>{const f=make(),g=f.build(item),doors=roles(g,'front'),handles=roles(g,'handle');assert.equal(doors.length,2);assert.equal(handles.length,2);assert.deepEqual(doors.map(m=>size(m.geometry)),[[397,637,18],[397,637,18]]);assert.ok(handles[0].position.x<0&&handles[1].position.x>0);assert.deepEqual(handles.map(m=>Math.round(m.position.x*10000)/10),[-51.5,51.5]);assert.ok(handles.every(m=>Math.abs(m.position.y*1000-668.5)<1e-6));f.dispose();});
test('Three drawers have three independent meshes and horizontal low-poly handles',()=>{const f=make({kind:'drawers',count:3}),g=f.build({...item,layout:'drawers',drawers:3});assert.equal(roles(g,'front').length,3);assert.equal(roles(g,'handle').length,3);assert.ok(roles(g,'handle').every(m=>m.rotation.z===Math.PI/2));f.dispose();});
test('Carcass boards remain 18 mm thick; no shaded single-box substitute',()=>{const f=make(),g=f.build(item);assert.equal(roles(g,'body').length,4);assert.ok(roles(g,'body').every(m=>size(m.geometry).includes(18)));f.dispose();});
test('Plinth is a recessed 18 mm apron with side returns, not a solid block',()=>{const f=make(),g=f.build(item);assert.equal(roles(g,'plinth').length,3);assert.deepEqual(size(roles(g,'plinth')[0].geometry),[800,78,18]);assert.ok(roles(g,'plinth')[0].position.z<roles(g,'front')[0].position.z-.04);f.dispose();});
test('Touching lower units share one visual countertop and one continuous plinth run',()=>{const f=make(),g=f.dress([item,{...item,item_id:'second',x:800}]);assert.equal(g.children.length,1);assert.equal(roles(g.children[0],'counter').length,1);assert.deepEqual(g.userData.mergedPlinthIds,['fixed','second']);assert.equal(size(roles(g.children[0],'counter')[0].geometry)[1],32);f.dispose();});
test('Separated rows and different heights do not create an imaginary shared countertop',()=>{const f=make(),g=f.dress([item,{...item,item_id:'second',x:1800},{...item,item_id:'third',x:800,height:800}]);assert.equal(g.children.length,3);assert.equal(g.userData.mergedPlinthIds.length,0);f.dispose();});
test('Unknown FR3D interiors do not receive invented shelves or a back',()=>{const f=make(),g=f.build({...item,bazis_id:'source',layout:'niche'});assert.equal(roles(g,'back').length,0);assert.equal(roles(g,'body').length,4);assert.equal(g.userData.visualApproximation,true);f.dispose();});
test('Render-only geometry never mutates the project or native BAZIS identifiers',()=>{const f=make(),it=Object.freeze({...item,bazis_id:'id',bazis_file:'source.fr3d',bazis_sha256:'a'.repeat(64),bazis_resize:true});const before=JSON.stringify(it);f.build(it);f.dress([it]);f.contacts([it]);assert.equal(JSON.stringify(it),before);f.dispose();});
test('Material roughness separates roles without invented texture data',()=>{const f=make();assert.ok(VISUAL_FINISHES.front.roughness>=.65&&VISUAL_FINISHES.front.roughness<=.85);assert.ok(VISUAL_FINISHES.body.roughness>VISUAL_FINISHES.front.roughness);assert.equal(f.material('front').metalness,0);assert.equal(f.material('front').map,null);assert.notEqual(f.material('front').color.getHexString(),f.material('body').color.getHexString());f.dispose();});
test('Visual legs have a separate foot geometry and preserve facade arithmetic',()=>{const f=make(),it={...item,base:'legs'},g=f.build(it);assert.equal(roles(g,'leg').length,4);assert.deepEqual(roles(g,'front').map(m=>m.userData.facade),facadeCells(it,{front:{kind:'doors',count:2}}));f.dispose();});
test('Geometry cache stays bounded through 250 resize cycles',()=>{const f=make();for(let i=0;i<250;i++){const g=f.build({...item,width:800+i});f.release(g);}assert.ok(f.pool.size<=192);assert.ok([...f.pool.values()].every(v=>v.refs===0));f.dispose();assert.equal(f.pool.size,0);});

for(const rotation of [0,90,180,270])test('Asymmetric countertop overhang stays inside room at rotation '+rotation,async()=>{
 const {Box3}=await import('../../backend/v2/cabinet_assets/planner/vendor/three.module.js');
 const f=make(),axis=rotation%180?'z':'x',wall=axis==='x'?room.width/2:room.depth/2;
 const it={...item,rotation,[axis]:-wall+item.width/2};const g=f.dress([it]);g.updateMatrixWorld(true);
 const counter=roles(g.children[0],'counter')[0],b=new Box3().setFromObject(counter);
 assert.ok(Math.abs(b.min[axis]+wall/1000)<1e-6);assert.ok(Math.abs(b.max[axis]-(-wall+item.width+12)/1000)<1e-6);f.dispose();
});
test('Countertop free-end overhang stops at adjacent tall cabinet',async()=>{
 const {Box3}=await import('../../backend/v2/cabinet_assets/planner/vendor/three.module.js');const f=make();
 const g=f.dress([item,{...item,item_id:'tall',module_type:'tall_cabinet',x:800,height:2200}]);g.updateMatrixWorld(true);
 const b=new Box3().setFromObject(roles(g.children[0],'counter')[0]);assert.ok(Math.abs(b.max.x-.4)<1e-6);assert.ok(Math.abs(b.min.x+.412)<1e-6);f.dispose();
});
test('Edge shading preserves the front colour and darkens only physical edges',()=>{
 const f=make(),g=f.build(item),panel=roles(g,'front')[0],n=panel.geometry.attributes.normal,c=panel.geometry.attributes.color;
 assert.ok(panel.material.vertexColors);for(let i=0;i<n.count;i++){if(n.getZ(i)>.999)assert.equal(c.getX(i),1);if(Math.abs(n.getZ(i))<.001)assert.ok(c.getX(i)<.6);}assert.deepEqual(size(panel.geometry),[397,637,18]);f.dispose();
});

const separated={...item,height:820,body_height:720,base_height:100,worktop_thickness:38};
test('720 body + 100 base = 820 module; the separate 38 mm worktop ends at 858',()=>{
 const f=make(),g=f.build(separated),dress=f.dress([separated]);
 assert.deepEqual(heights(separated),{body_height:720,base_height:100,module_height:820,worktop_thickness:38,overall_height_with_worktop:858});
 assert.deepEqual(roles(g,'front').map(m=>size(m.geometry)),[[397,717,18],[397,717,18]]);
 const side=roles(g,'body')[0];assert.equal(size(side.geometry)[1],720);assert.equal(Math.round(side.position.y*1000),460);
 assert.equal(roles(g,'leg').length,4);assert.equal(size(roles(g,'leg')[0].geometry)[1],100);
 const top=roles(dress.children[0],'counter')[0];assert.equal(size(top.geometry)[1],38);assert.equal(top.position.y*1000,839);
 assert.equal(roles(g,'counter').length,0);f.dispose();
});
test('Editing worktop cannot resize the module or its facade; body and base edits stay additive',()=>{
 const changed=dimensionPatch(separated,{worktop_thickness:50});assert.equal(changed.height,820);assert.equal(changed.body_height,720);
 assert.deepEqual(facadeCells(changed),facadeCells(separated));assert.equal(heights(changed).overall_height_with_worktop,870);
 const taller=dimensionPatch(separated,{body_height:750});assert.equal(taller.height,850);assert.equal(taller.base_height,100);
 const base=dimensionPatch(separated,{base_height:120});assert.equal(base.height,840);assert.equal(base.body_height,720);
 const total=dimensionPatch(separated,{height:900});assert.equal(total.body_height,800);
});
test('Legacy lower native target remains 720 and old worktop remains 32 without mutating data',()=>{
 const legacy={...item,bazis_id:'original',bazis_file:'original.fr3d',bazis_sha256:'a'.repeat(64)};
 const json=JSON.stringify(legacy);assert.equal(heights(legacy).module_height,720);assert.equal(heights(legacy).overall_height_with_worktop,752);
 assert.equal(dimensionPatch(legacy,{worktop_thickness:38}).height,720);assert.equal(JSON.stringify(legacy),json);
});
for(const module_type of ['base_cabinet','wall_cabinet','tall_cabinet'])test('Every swing handle axis is exactly 50 by 50: '+module_type,()=>{
 for(const count of [1,2]){const f=make({kind:'doors',count}),g=f.build({...separated,module_type,base:module_type==='wall_cabinet'?'wall':'plinth'});
 const fronts=roles(g,'front'),handles=roles(g,'handle');assert.equal(handles.length,count);
 for(let i=0;i<count;i++){const a=fronts[i].userData.facade,h=handles[i];assert.ok(Math.abs(a.cy+a.h/2-h.position.y*1000-50)<1e-6);assert.ok(Math.abs(a.w/2-Math.abs(h.position.x*1000-a.cx)-50)<1e-6);}
 if(module_type!=='base_cabinet')assert.equal(f.dress([{...separated,module_type}]).children.length,0);f.dispose();}
});
test('Different worktop thicknesses and zero worktop do not create doubled shared slabs',()=>{
 const f=make(),dress=f.dress([separated,{...separated,item_id:'b',x:800,worktop_thickness:20},{...separated,item_id:'c',x:1600,worktop_thickness:0}]);
 assert.deepEqual(dress.children.flatMap(g=>roles(g,'counter')).map(m=>size(m.geometry)[1]),[38,20]);f.dispose();
});
