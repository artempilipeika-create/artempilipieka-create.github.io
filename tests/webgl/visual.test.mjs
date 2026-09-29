import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshFactory,panelGeometry,VISUAL_FINISHES} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {facadeCells,heights,dimensionPatch,bounds,placementError,PILOT_PRODUCTION,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const room={width:6200,depth:3600,height:2700};
const make=(front={kind:'doors',count:2})=>new MeshFactory({room,material:()=>null,template:()=>({front})},()=>{});
const item={item_id:'fixed',module_type:'base_cabinet',width:800,height:720,depth:560,x:0,z:0,rotation:0,base:'plinth',handles:'handles',layout:'doors',drawers:0};
const roles=(g,r)=>g.children.filter(o=>o.userData.role===r);
const deepRoles=(g,r)=>{const out=[];g.traverse(o=>{if(o.userData?.role===r)out.push(o);});return out;};
function size(g){g.computeBoundingBox();const b=g.boundingBox;return[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z].map(v=>Math.round(v*10000)/10);}
test('Bevel stays inside the exact 397 by 637 by 18 mm facade envelope',()=>{const g=panelGeometry(397,637,18,.85);assert.deepEqual(size(g),[397,637,18]);assert.equal(g.index.count/3,108);assert.ok([...g.attributes.normal.array].every(Number.isFinite));g.dispose();});
test('Two separate doors, 1.5 mm on each side, handles at the meeting edges',()=>{const f=make(),g=f.build(item),doors=roles(g,'front'),handles=roles(g,'handle');assert.equal(doors.length,2);assert.equal(handles.length,2);assert.deepEqual(doors.map(m=>size(m.geometry)),[[397,637,18],[397,637,18]]);assert.ok(handles[0].position.x<0&&handles[1].position.x>0);assert.deepEqual(handles.map(m=>Math.round(m.position.x*10000)/10),[-51.5,51.5]);assert.ok(handles.every(m=>Math.abs(m.position.y*1000-668.5)<1e-6));f.dispose();});
test('Three drawers have three independent meshes and horizontal low-poly handles',()=>{const f=make({kind:'drawers',count:3}),g=f.build({...item,layout:'drawers',drawers:3});assert.equal(roles(g,'front').length,3);assert.equal(roles(g,'handle').length,3);assert.ok(roles(g,'handle').every(m=>m.rotation.z===Math.PI/2));f.dispose();});
test('Carcass boards remain 18 mm thick; no shaded single-box substitute',()=>{const f=make(),g=f.build(item);assert.equal(roles(g,'body').length,4);assert.ok(roles(g,'body').every(m=>size(m.geometry).includes(18)));f.dispose();});
test('Plinth is a recessed 18 mm apron with side returns, not a solid block',()=>{const f=make(),g=f.build(item);assert.equal(roles(g,'plinth').length,3);assert.deepEqual(size(roles(g,'plinth')[0].geometry),[800,78,18]);assert.ok(roles(g,'plinth')[0].position.z<roles(g,'front')[0].position.z-.04);f.dispose();});
test('Touching lower units share one visual countertop and one continuous plinth run',()=>{const f=make(),g=f.dress([item,{...item,item_id:'second',x:800}]);assert.equal(g.children.length,1);assert.equal(roles(g.children[0],'counter').length,1);assert.deepEqual(g.userData.mergedPlinthIds,['fixed','second']);assert.equal(size(roles(g.children[0],'counter')[0].geometry)[1],32);f.dispose();});
test('Separated rows and different heights do not create an imaginary shared countertop',()=>{const f=make(),g=f.dress([item,{...item,item_id:'second',x:1800},{...item,item_id:'third',x:800,height:800}]);assert.equal(g.children.length,3);assert.equal(g.userData.mergedPlinthIds.length,0);f.dispose();});
test('Unknown FR3D interiors do not receive invented shelves or a back',()=>{const f=make(),g=f.build({...item,bazis_id:'source',layout:'niche'});assert.equal(roles(g,'back').length,0);assert.equal(roles(g,'shelf').length,0);assert.equal(roles(g,'body').length,4);assert.equal(g.userData.visualApproximation,true);f.dispose();});

const pilotModel=PILOT_PRODUCTION['bazis.0211e4f77fc4'];
const pilotItem={...item,bazis_id:'pilot',width:600,height:820,body_height:720,base_height:100,worktop_thickness:38,depth:510,shelves:structuredClone(pilotModel.shelves)};
const pilotFactory=(doors)=>new MeshFactory({room,material:()=>null,template:()=>({production:Object.values(PILOT_PRODUCTION).find(p=>p.doors.map(d=>d.side).join()===doors.map(d=>d.side).join())})},()=>{});

test('D1 production pilot renders the actual 596x716x3 back and 564x509x18 shelf',()=>{
 const f=pilotFactory([{side:'left',hinge_count:2,open_angle:105}]),g=f.build(pilotItem);
 assert.deepEqual(roles(g,'body').map(m=>size(m.geometry)),[[600,18,510],[18,702,510],[18,702,510],[564,18,80],[564,18,80]]);
 assert.deepEqual(size(roles(g,'back')[0].geometry),[596,716,3]);
 assert.deepEqual(size(roles(g,'shelf')[0].geometry),[564,18,509]);
 assert.equal(Math.round(roles(g,'shelf')[0].position.y*1000),460);
 assert.deepEqual(size(deepRoles(g,'front')[0].geometry),[597,717,18]);
 assert.equal(g.userData.visualApproximation,false);f.dispose();
});

test('D1 L and P use opposite hinge pivots and open the real facade with its handle',()=>{
 for(const [side,sign]of [['left',-1],['right',1]]){
  const f=pilotFactory([{side,hinge_count:2,open_angle:105}]),g=f.build({...pilotItem,doors_open:true});
  const pivot=roles(g,'door-pivot')[0];assert.equal(pivot.userData.hingeSide,side);
  assert.ok(Math.abs(pivot.rotation.y-sign*105*Math.PI/180)<1e-9);
  assert.equal(deepRoles(pivot,'front').length,1);assert.equal(deepRoles(pivot,'handle').length,1);f.dispose();
 }
});

test('D2 production pilot has two 297x717 fronts on left/right pivots and one shared shelf',()=>{
 const f=pilotFactory([{side:'left',hinge_count:2,open_angle:105},{side:'right',hinge_count:2,open_angle:105}]);
 const g=f.build({...pilotItem,doors_open:true}),pivots=roles(g,'door-pivot');
 assert.deepEqual(deepRoles(g,'front').map(m=>size(m.geometry)),[[297,717,18],[297,717,18]]);
 assert.deepEqual(pivots.map(p=>p.userData.hingeSide),['left','right']);
 assert.ok(pivots[0].rotation.y<0&&pivots[1].rotation.y>0);
 assert.equal(roles(g,'shelf').length,1);assert.deepEqual(size(roles(g,'back')[0].geometry),[596,716,3]);f.dispose();
});
test('Open D1 L/P and D2 expose the real interior without changing placement collisions',async()=>{
 const {Raycaster,Vector3}=await import('../../backend/v2/cabinet_assets/planner/vendor/three.module.js');
 for(const sides of [['left'],['right'],['left','right']]){
  const f=pilotFactory(sides.map(side=>({side,open_angle:105}))),opened={...pilotItem,doors_open:true},g=f.build(opened);
  assert.equal(roles(g,'reveal').length,0);g.updateMatrixWorld(true);
  const hit=new Raycaster(new Vector3(0,.28,1),new Vector3(0,0,-1)).intersectObject(g,true)[0];
  assert.equal(hit.object.userData.role,'back');
  assert.deepEqual(bounds(opened,room),bounds(pilotItem,room));
  const beside={...pilotItem,item_id:'beside',x:600};
  assert.equal(placementError(opened,[beside],room),'');
  assert.equal(placementError(pilotItem,[beside],room),'');
  assert.match(placementError(opened,[{...beside,x:590}],room),/Пересечение/);f.dispose();
 }
});
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

for(const [id,production] of Object.entries(PILOT_PRODUCTION))test(production.label+' canonical parts survive resizing, rendering and persistence',()=>{
 const template={production},initial={...pilotItem,bazis_id:id,bazis_sha256:production.source_sha256,shelves:structuredClone(production.shelves||[]),layout:production.front_layout?'drawers':'doors',drawers:production.front_layout?.heights?.length||0};
 const old=productionParts(initial,template),resized=dimensionPatch(initial,{width:800,height:920,depth:610});
 const parts=productionParts(resized,template),byKey=Object.fromEntries(parts.map(p=>[p.key,p]));
 assert.deepEqual(byKey['bottom'].size,{x:800,y:18,z:610});
 assert.deepEqual(byKey['side-L'].size,{x:18,y:802,z:610});
 assert.deepEqual(byKey['side-P'].position,{x:391,y:519,z:0});
 assert.deepEqual(byKey['back'].size,{x:796,y:816,z:3});
 assert.deepEqual(byKey['back'].position,{x:0,y:510,z:-306.5});
 if(production.shelves?.length)assert.deepEqual(byKey['shelf-1'].size,{x:764,y:18,z:609});
 else assert.equal(byKey['shelf-1'],undefined);
 assert.deepEqual(byKey['rail-front'].position,{x:0,y:911,z:265});
 if(production.doors.length)assert.deepEqual(byKey['door-1'].size,{x:800/production.doors.length-3,y:817,z:18});
 else{
  const cells=facadeCells(resized,template),fronts=parts.filter(p=>p.role==='front');
  assert.deepEqual(fronts.map(p=>p.size),cells.map(c=>({x:c.w,y:c.h,z:18})));
  assert.ok(fronts.every(p=>p.key.startsWith('drawer-front-')));
 }
 assert.equal(new Set(parts.map(p=>p.part_id)).size,parts.length);
 assert.deepEqual(parts.map(p=>p.part_id),old.map(p=>p.part_id));
 assert.ok(parts.every(p=>p.module_id===resized.item_id&&p.length>0&&p.width>0&&p.thickness>0));
 assert.deepEqual(productionParts(JSON.parse(JSON.stringify(resized)),template),parts);
 assert.deepEqual(productionParts({...resized,doors_open:true},template),parts);
 const copy=productionParts({...resized,item_id:'copy'},template);
 assert.ok(copy.every(p=>p.module_id==='copy'&&!parts.some(q=>p.part_id===q.part_id)));
 const factory=new MeshFactory({room,material:()=>null,template:()=>template},()=>{}),g=factory.build(resized),rendered=[];
 g.updateMatrixWorld(true);g.traverse(m=>{const p=m.userData.part;if(!p)return;rendered.push(p);assert.deepEqual(size(m.geometry),[p.size.x,p.size.y,p.size.z]);
 const pos=m.getWorldPosition(m.position.clone());assert.deepEqual(pos.toArray().map(v=>Math.round(v*10000)/10),[p.position.x,p.position.y,p.position.z]);});
 assert.deepEqual(rendered,parts);factory.dispose();
});
test('D1 L and P share identical manufactured carcass, shelf and back at custom dimensions',()=>{
 const [left,right]=Object.values(PILOT_PRODUCTION),it={...pilotItem,width:750,height:900,depth:600};
 const a=productionParts(it,{production:left}),b=productionParts(it,{production:right});
 assert.deepEqual(a.filter(p=>p.role!=='front'),b.filter(p=>p.role!=='front'));
 assert.deepEqual(a.at(-1).size,b.at(-1).size);assert.equal(a.at(-1).pivot.x,-b.at(-1).pivot.x);
});
