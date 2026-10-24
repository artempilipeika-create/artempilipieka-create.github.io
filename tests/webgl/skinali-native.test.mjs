import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {PRODUCTION_MODELS as models,normalizeKitchen} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {nativePanelItems,panelSegments,allSegments,finishSchedule} from '../../backend/v2/cabinet_assets/planner/wall-finishes.mjs';
const root=new URL('../../backend/v2/cabinet_assets/',import.meta.url);
const script=fs.readFileSync(new URL('planner/bazis-drawers-import.js',root),'utf8');
const c=vm.createContext({require:createRequire(import.meta.url),console,process,
 objectTransformation:{RotateObject:(o,axis,angle)=>{o.angle=-angle*Math.PI/180;}},
 objectTypeChecker:{ObjectIsPanel:p=>p.isPanel},historyOperations:{RegisterObjectChanging(){}},
 materialData:{CreateMaterialData:(name,thickness)=>({name,thickness}),SetupObjectMaterial:(p,m)=>{p.MaterialName=m.name;}}});
vm.runInContext(script.slice(0,script.lastIndexOf('(function main()')),c);
const room={width:6000,depth:5000,height:3000};
const panel=patch=>({id:'skin',kind:'skinali',shape:'straight',wall:'a',offset:100,width:1200,height:600,elevation:858,depth:400,thickness:6,tile_width:600,tile_height:300,grout:2,...patch});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const sourceFile=new URL('planner/wall-panel-sources/Скиналь.Прямая.fr3d',root);
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');

test('Unchanged 9.9.4 importer resolves the exact original skinali and retains its native 6 mm material',()=>{
 const before=hash(),item=nativePanelItems({room,wallPanels:[panel()]})[0];
 assert.equal(item.source_sha256,before);
 assert.deepEqual(item.source_default,{width:2000,height:600,depth:6});
 assert.equal(c.prepareProject({items:[item]},new URL('planner/wall-panel-sources/',root).pathname).entries.length,1);
 const native={Name:'Скиналь',isPanel:true,Thickness:6,MaterialName:'Скинали Скиф Дуб Вотан\r111 CH',Build(){}},log=[];
 assert.equal(c.applyProjectMaterials(native,item,log).length,1);
 assert.equal(native.MaterialName,'Скинали Скиф Дуб Вотан\r111 CH');assert.equal(native.Thickness,6);
 assert.equal(hash(),before);
});

for(const wall of ['a','b','c','d'])for(const shape of ['straight','left','right','u'])test(`Skinali ${shape} on wall ${wall}: native 9.9.4 placement matches every displayed board`,()=>{
 const p=panel({wall,shape}),items=nativePanelItems({room,wallPanels:[p]}),segments=panelSegments(p,room);
 assert.equal(items.length,segments.length);
 for(const [i,item]of items.entries()){
  const s=segments[i],obj={min:{x:0,y:0,z:0},size:{x:item.target.width,y:item.target.height,z:6},angle:0,
   PositionX:0,PositionY:0,PositionZ:0,AsList(){return this;},
   SetDefaultTransform(){this.angle=0;this.PositionX=this.PositionY=this.PositionZ=0;},
   ToGlobal(p){const a=Math.cos(this.angle),b=Math.sin(this.angle);return {x:a*p.x-b*p.z+this.PositionX,y:p.y+this.PositionY,z:b*p.x+a*p.z+this.PositionZ};}};
  c.placeByFrame(obj,{min:obj.min,size:obj.size},item,[]);
  const points=[];for(const x of [0,item.target.width])for(const y of [0,item.target.height])for(const z of [0,6])points.push(obj.ToGlobal({x,y,z}));
  const expected=[];for(const u of [0,s.length])for(const n of [0,6])expected.push({x:s.x+s.u.x*u+s.n.x*n,z:s.z+s.u.z*u+s.n.z*n});
  for(const axis of ['x','z']){close(Math.min(...points.map(p=>p[axis])),Math.min(...expected.map(p=>p[axis])));close(Math.max(...points.map(p=>p[axis])),Math.max(...expected.map(p=>p[axis])));}
  close(Math.min(...points.map(p=>p.y)),s.bottom);close(Math.max(...points.map(p=>p.y)),s.bottom+s.height);
 }
});

test('Selected 6 mm material is exported; wrong or unloaded materials block export; tile/LDSP stay explicit',()=>{
 const state={room,wallPanels:[panel({material_id:'decor'})]},material={name:'Скиналь выбранная',article:'S6',thickness:6};
 const item=nativePanelItems(state,()=>material)[0];assert.equal(item.material_assignments.body.article,'S6');
 assert.throws(()=>nativePanelItems(state,()=>({...material,thickness:18})),/6 мм/);
 assert.throws(()=>nativePanelItems(state),/6 мм/);
 for(const [kind,thickness]of [['tile',10],['ldsp',18]]){const s={room,wallPanels:[panel({kind,thickness})]};assert.deepEqual(nativePanelItems(s),[]);assert.equal(finishSchedule(s).panels[0].native_import,false);}
 const openings={...room,features:[{kind:'window',wall:'a',offset:300,width:300,elevation:1000,height:300}]};
 assert.match(nativePanelItems({room:openings,wallPanels:[panel()]})[0].production_note,/вырез выполнить в БАЗИС/);
});

test('Real JSON export and saved scene include one front plinth and native backsplash, following row edits and gaps',async()=>{
 const p=models['bazis.3079d0656398'];
 const cabinet=(id,x)=>normalizeKitchen({item_id:id,bazis_id:'bazis.3079d0656398',bazis_sha256:p.source_sha256,bazis_file:p.source_file,name:'Шкаф',module_type:'base_cabinet',width:600,height:820,body_height:720,base_height:100,depth:510,base:'plinth',x,z:-2195,rotation:0});
 const state=JSON.parse(JSON.stringify({room,items:[cabinet('one',0),cabinet('two',600)],plinths:[{id:'auto',automatic:true,members:[],excluded_members:[]}],wallPanels:[panel({automatic:true,excluded_members:[]})]}));
 let blob,message;
 const ctx=vm.createContext({MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_ACCESSORIES:globalThis.MF_ACCESSORIES,MF_WALL_FINISHES:globalThis.MF_WALL_FINISHES,state,templateFor:it=>({production:models[it.bazis_id]}),materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,$:()=>({value:'QA'}),status:m=>{message=m;},setTimeout(){},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 const source=fs.readFileSync(new URL('3d.js',root),'utf8');
 vm.runInContext(source.slice(source.indexOf('const UPPER_SOURCE_REFRESH='),source.indexOf('function normalizeItem(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),ctx);
 for(const gap of [false,true]){
  state.items[1].x=gap?1600:600;ctx.exportBazisProject();const out=JSON.parse(await blob.text());
  assert.equal(out.kitchen_production.native_plinths_included,gap?2:1);assert.equal(out.kitchen_production.native_wall_panels_included,gap?2:1);
  const skins=out.items.filter(it=>it.construction?.key==='wall.skinali');
  assert.deepEqual(skins.map(it=>it.target.width),allSegments(state).map(s=>s.length));
  assert.ok(skins.every(it=>it.position.y===858&&it.position.z===-2497));
  assert.ok(out.items.filter(it=>it.construction?.key==='row.plinth').every(it=>it.rotation===0&&it.construction.parts.length===1));
  assert.ok(out.items.every((it,i)=>it.index===i+1));assert.match(message,/участков скинали/);
 }
 blob=null;ctx.MF_WALL_FINISHES=undefined;ctx.exportBazisProject();assert.equal(blob,null);assert.match(message,/не загружен/);
});
