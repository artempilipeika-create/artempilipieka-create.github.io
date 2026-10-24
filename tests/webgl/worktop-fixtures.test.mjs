import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PRODUCTION_MODELS,normalizeKitchen,kitchenRuns,rotateXZ,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {defaultFixture,fixturePlans,fixtureError} from '../../backend/v2/cabinet_assets/planner/worktop-fixtures.mjs';
import {buildWorktopFixture} from '../../backend/v2/cabinet_assets/planner/worktop-fixture-mesh.mjs';
import {countertopGeometry,countertopSurfaces} from '../../backend/v2/cabinet_assets/planner/countertop-visuals.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import {WorktopFixtureUI} from '../../backend/v2/cabinet_assets/planner/worktop-fixture-ui.mjs';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {readApplianceGeometry} from '../../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const room={width:6000,depth:4000,height:2700},id='bazis.0211e4f77fc4',p=PRODUCTION_MODELS[id];
const item=(patch={})=>normalizeKitchen({item_id:'a',name:'Шкаф',module_type:'base_cabinet',bazis_id:id,bazis_sha256:p.source_sha256,bazis_file:p.source_file,width:600,height:820,depth:510,body_height:720,base_height:100,base:'legs',layout:'doors',drawers:0,handles:'handles',x:0,z:0,rotation:0,...patch});
const area=poly=>Math.abs(poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2);
const topArea=g=>{let a=0;const p=g.attributes.position,n=g.attributes.normal;for(let i=0;i<p.count;i+=3)if(n.getY(i)>.999999&&n.getY(i+1)>.999999&&n.getY(i+2)>.999999)a+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;return a;};
for(const kind of ['sink','hob'])for(const rotation of [0,90,180,270])test(`${kind} follows cabinet at ${rotation}, cuts real surface without changing production`,()=>{
 const it=item({x:700,z:300,rotation,worktop_fixture:{...defaultFixture(kind),offset_x:5}}),before=JSON.stringify(it),runs=kitchenRuns([it],room),native=JSON.stringify(runs),parts=JSON.stringify(productionParts(it,{production:p}));
 const [f]=fixturePlans([it],room,runs);assert.equal(f.error,undefined);assert.equal(f.y,858);
 const local=rotateXZ(f.x-it.x,f.z-it.z,-rotation);assert.ok(Math.abs(local.x-5)<1e-6);assert.ok(Math.abs(local.z+5)<1e-6);
 const surface=countertopSurfaces(runs).get(f.part),plain=countertopGeometry(surface),cut=countertopGeometry({...surface,holes:[f.hole]});
 assert.ok(Math.abs(topArea(plain)-topArea(cut)-area(f.hole)/1e6)<1e-6,'top triangles leave the bowl or hob opening empty');
 assert.equal(cut.userData.visualCutouts,1);for(const v of cut.attributes.normal.array)assert.ok(Number.isFinite(v));
 assert.equal(JSON.stringify(runs),native);assert.equal(JSON.stringify(it),before);assert.equal(JSON.stringify(productionParts(it,{production:p})),parts);plain.dispose();cut.dispose();
});
test('placement rejects overhang, missing worktop, bad dimensions and slab seam crossing',()=>{
 for(const patch of [{width:601},{offset_x:80},{front_offset:10},{front_offset:121},{width:NaN}])assert.ok(fixtureError(item({worktop_fixture:{...defaultFixture('sink'),...patch}})));
 assert.ok(fixtureError(item({countertopEnabled:false,worktop_fixture:defaultFixture('sink')})));
 assert.ok(fixtureError({...item(),bazis_id:null,worktop_fixture:defaultFixture('sink')}));
 const items=Array.from({length:8},(_,i)=>item({item_id:String(i),x:i*600}));items[6].worktop_fixture=defaultFixture('sink');
 assert.match(fixturePlans(items,room)[0].error,/стык/);
});
test('multiple fixtures share a row with independent openings; mesh resources release exactly once',()=>{
 const items=[item({worktop_fixture:defaultFixture('sink')}),item({item_id:'b',x:600,worktop_fixture:defaultFixture('hob')})];
 const factory=new MeshFactory({room,state:{items},material:()=>null,template:()=>({production:p})},()=>{}),group=factory.dress(items);
 const fixtures=group.children.filter(g=>g.userData.role==='worktop-fixture');assert.equal(fixtures.length,2);assert.deepEqual(fixtures.map(g=>g.userData.members),[['a'],['b']]);
 const counters=[];group.traverse(m=>{if(m.userData.part?.role==='counter')counters.push(m);});assert.equal(counters[0].geometry.userData.visualCutouts,2);
 let geometries=0,disposed=0;for(const g of fixtures)g.traverse(m=>{if(m.geometry){geometries++;m.geometry.addEventListener('dispose',()=>disposed++);}});
 factory.release(group);factory.release(group);assert.equal(disposed,geometries);factory.dispose();
});
for(const faucet of ['arch','angled','compact'])test(`smooth ${faucet} faucet and bowl have finite normals and limited mesh budget`,()=>{
 const f=fixturePlans([item({worktop_fixture:{...defaultFixture('sink'),faucet}})],room)[0],group=buildWorktopFixture(f);let triangles=0,maxY=-Infinity;
 group.traverse(m=>{if(!m.geometry)return;const g=m.geometry;triangles+=(g.index?.count??g.attributes.position.count)/3;for(const v of g.attributes.position.array)assert.ok(Number.isFinite(v));for(let i=0;i<g.attributes.normal.count;i++)assert.ok(Math.abs(Math.hypot(g.attributes.normal.getX(i),g.attributes.normal.getY(i),g.attributes.normal.getZ(i))-1)<1e-5);g.computeBoundingBox();maxY=Math.max(maxY,g.boundingBox.max.y);});
 assert.ok(triangles<18000);assert.ok(maxY>.18&&maxY<.35);group.traverse(m=>m.geometry?.dispose());group.userData.ownedMaterials.forEach(m=>m.dispose());
});
test('real inspector controls support precise position, finishes, undo/redo, invalid input and removal',()=>{
 class Node{constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.events={};this.attrs={};}append(...n){this.children.push(...n);}after(){}setAttribute(k,v){this.attrs[k]=v;}scrollIntoView(){}}
 const doc=globalThis.document;globalThis.document={createElement:tag=>new Node(tag),getElementById:()=>new Node('div')};
 try{
  let s={room,items:[item()]},ui;const messages=[];
  const adapter={get state(){return s},get room(){return room},get items(){return s.items},get selected(){return s.items[0]},status:m=>messages.push(m),replace:it=>{s.items[0]=it;ui.sync();},snapshot:()=>({name:'QA',scene:s}),restore:v=>{s=structuredClone(v.scene);ui.sync();}};
  const history=new History(adapter),app={adapter,workspace:{panel(){}},interaction:{change:(label,fn)=>history.run(label,fn)},listen:(node,event,fn)=>node.events[event]=fn};
  ui=new WorktopFixtureUI(app);ui.sync();ui.buttons[0].events.click();assert.equal(s.items[0].worktop_fixture.kind,'sink');
  ui.fields.offset_x.value='25';ui.fields.offset_x.events.change();assert.equal(s.items[0].worktop_fixture.offset_x,25);
  ui.fields.faucet.value='compact';ui.fields.faucet.events.change();assert.equal(s.items[0].worktop_fixture.faucet,'compact');history.undo();assert.equal(s.items[0].worktop_fixture.faucet,'arch');history.redo();
  ui.fields.offset_x.value='300';ui.fields.offset_x.events.change();assert.equal(s.items[0].worktop_fixture.offset_x,25);assert.match(messages.at(-1),/ширину/);
  ui.patch(null);assert.equal(s.items[0].worktop_fixture,null);history.undo();assert.equal(s.items[0].worktop_fixture.faucet,'compact');
  ui.buttons[1].events.click();ui.fields.hood.value='chimney';ui.fields.hood.events.change();assert.equal(s.items[0].worktop_fixture.hood,'chimney');assert.equal(ui.hoodSettings.hidden,false);
  ui.fields.hood_gap.value='720';ui.fields.hood_gap.events.change();assert.equal(s.items[0].worktop_fixture.hood_gap,720);history.undo();assert.equal(s.items[0].worktop_fixture.hood_gap,650);history.redo();assert.equal(s.items[0].worktop_fixture.hood_gap,720);
 }finally{globalThis.document=doc;}
});
test('existing scene normalizer and payload retain fixture settings through a roundtrip',()=>{
 const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
 const s={schema_version:2,room,items:[item({worktop_fixture:{...defaultFixture('sink'),offset_x:12,faucet:'angled'}})],selected_item_id:'a'};
 const c=vm.createContext({state:s,selectedId:'a',viewMode:'3d',materials:new Map(),legacyItem:()=>({}),normalizeItem:x=>x});
 vm.runInContext(source.slice(source.indexOf('function normalizeScene('),source.indexOf('function modulePreviewCanvas(')),c);
 const payload=c.scenePayload(),restored=c.normalizeScene(payload);assert.deepEqual(JSON.parse(JSON.stringify(restored.items[0].worktop_fixture)),s.items[0].worktop_fixture);
});

for(const rotation of [0,90,180,270])test(`hood follows hob and stays against rear wall at ${rotation}`,()=>{
 const it=item({x:400,z:600,rotation,worktop_fixture:{...defaultFixture('hob'),hood:'chimney',hood_gap:720,hood_width:900}});
 const [f]=fixturePlans([it],room);assert.equal(f.error,undefined);assert.equal(f.hoodLayout.width,900);
 const h=f.hoodLayout,relative=rotateXZ(f.x-it.x,f.z-it.z,-rotation);
 assert.equal(h.y-h.height/2,720);assert.ok(Math.abs(relative.z+h.z-h.depth/2-(-it.depth/2-50))<1e-6);
 assert.ok(f.y+h.y+h.height/2<room.height);
});
test('hood validates integer dimensions, ceiling and intersecting upper cabinets',()=>{
 const f={...defaultFixture('hob'),hood:'chimney'},it=item({worktop_fixture:f});
 for(const patch of [{hood_gap:399},{hood_gap:650.5},{hood_width:1201},{kind:'sink'}])assert.ok(fixtureError({...it,worktop_fixture:{...f,...patch}}));
 assert.match(fixturePlans([it],{...room,height:1800})[0].error,/потолка/);
 const upper={...item(),item_id:'upper',name:'Верхний',module_type:'wall_cabinet',elevation_mm:1400,height:720,depth:350,z:-130,worktop_fixture:null};
 assert.match(fixturePlans([it,upper],room)[0].error,/пересекается/);
 upper.x=1200;assert.equal(fixturePlans([it,upper],room)[0].error,undefined);
});
test('uploaded fixtures share real resources, mount faucet by its foot and release safely',()=>{
 const a=item({worktop_fixture:defaultFixture('sink')}),b=item({item_id:'b',x:600,worktop_fixture:{...defaultFixture('hob'),hood:'chimney'}});
 const factory=new MeshFactory({room,state:{items:[a,b]},material:()=>null,template:()=>({production:p})},()=>{});
 for(const kind of ['sink','faucet','hood']){
  const base=new URL('../../backend/v2/cabinet_assets/planner/appliance-assets/',import.meta.url),meta=JSON.parse(fs.readFileSync(new URL(kind+'-tripo.json',base))),bytes=fs.readFileSync(new URL(meta.buffer,base));
  factory.applianceAssets.entries.set(kind,{ready:true,textures:[],geometry:readApplianceGeometry(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),meta),material:new THREE.MeshPhysicalMaterial(),ghost:new THREE.MeshPhysicalMaterial(),mountAnchor:meta.mountAnchor,nominalSize:meta.nominalSize});
 }
 const g=factory.dress([a,b]),second=factory.dress([a]);g.updateMatrixWorld(true);let faucet,sink,hood;
 g.traverse(m=>{if(m.userData.appliance==='faucet')faucet=m;if(m.userData.appliance==='sink')sink=m;if(m.userData.appliance==='hood')hood=m;});
 assert.ok(faucet&&sink&&hood);const e=factory.applianceAssets.entries.get('faucet');
 const foot=faucet.localToWorld(new THREE.Vector3().fromArray(e.mountAnchor));const [plan]=fixturePlans([a],room);
 assert.ok(Math.abs(foot.x-plan.x*.001)<1e-6);assert.ok(Math.abs(foot.y-(plan.y+3)*.001)<1e-6);assert.ok(Math.abs(foot.z-(plan.z-a.worktop_fixture.depth/2+34)*.001)<1e-6);
 let same;second.traverse(m=>{if(m.userData.appliance==='sink')same=m;});assert.equal(same.geometry,sink.geometry);
 let disposed=0;sink.geometry.addEventListener('dispose',()=>disposed++);factory.release(g);assert.equal(disposed,0);factory.release(second);factory.dispose();assert.equal(disposed,1);
});
test('late fixture requests do not mount into a discarded dressing',async()=>{
 const it=item({worktop_fixture:defaultFixture('sink')}),factory=new MeshFactory({room,state:{items:[it]},material:()=>null,template:()=>({production:p})},()=>{}),pending=[];
 factory.applianceAssets.load=()=>new Promise(resolve=>pending.push(resolve));const root=factory.dress([it]);factory.release(root);
 const e={geometry:new THREE.BoxGeometry(),material:new THREE.MeshBasicMaterial(),mountAnchor:[0,-.5,0],nominalSize:[70,330,220]};
 for(const resolve of pending)resolve(e);await Promise.resolve();let count=0;root.traverse(m=>{if(m.userData.sharedApplianceAsset)count++;});assert.equal(count,0);e.geometry.dispose();e.material.dispose();factory.dispose();
});
