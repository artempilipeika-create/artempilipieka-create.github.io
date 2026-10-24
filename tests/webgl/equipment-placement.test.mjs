import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newEquipment} from '../../backend/v2/cabinet_assets/planner/room-equipment.mjs';
import {featureBox} from '../../backend/v2/cabinet_assets/planner/room-plan.mjs';
import {equipmentAtPoint,equipmentError,snapEquipment,findEquipmentSpace,MOVABLE_EQUIPMENT} from '../../backend/v2/cabinet_assets/planner/equipment-placement.mjs';
import {PILOT_PRODUCTION,normalizeKitchen,bounds} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {EquipmentControls} from '../../backend/v2/cabinet_assets/planner/equipment-controls.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
const room=()=>({width:4200,depth:3200,height:2700,setup_complete:true,survey:null,features:[]});
test('all equipment snaps to each wall, rotates and preserves its physical dimensions',()=>{
 for(const kind of MOVABLE_EQUIPMENT)for(const wall of 'abcd'){
  const r=room(),f={...newEquipment(r,kind,'e'),wall,offset:800,wall_gap:50},b=featureBox(f,r),result=snapEquipment(f,b,r);
  assert.equal(result.error,'');assert.equal(result.feature.wall,wall);assert.equal(result.feature.wall_gap,0);assert.equal(result.feature.offset,800);assert.equal(result.feature.width,f.width);
  const free=snapEquipment(f,b,r,[],{enabled:false});assert.equal(free.feature.wall_gap,50);assert.equal(free.guides.length,0);
  assert.deepEqual(equipmentAtPoint(f,b,r),f);
 }
});
test('free movement remains integer measured coordinates and cannot leave the room',()=>{
 const r=room(),f={...newEquipment(r,'gas_cooker','e'),offset:600,wall_gap:300},b=featureBox(f,r);
 const result=snapEquipment(f,{x:b.x+100.4,z:b.z+99.6},r,[],{enabled:false});assert.equal(result.feature.offset,700);assert.equal(result.feature.wall_gap,400);assert.equal(result.error,'');
 assert.ok(snapEquipment(f,{x:9000,z:9000},r,[],{enabled:false}).error);
 for(const wall of 'abcd'){const placed={...f,wall,offset:600,wall_gap:200};const box=featureBox(placed,r);assert.deepEqual(equipmentAtPoint(placed,box,r),placed);}
});
test('windows stay on the nearest wall and preserve their opening and sill dimensions',()=>{
 const r=room(),f=newEquipment(r,'window','w');
 for(const wall of 'abcd'){
  const desired={...f,wall,offset:500},b=featureBox({...desired,projection:0},r),result=snapEquipment(f,b,r,[],{enabled:false});
  assert.equal(result.error,'');assert.equal(result.feature.wall,wall);assert.equal(result.feature.wall_gap,0);assert.equal(result.feature.offset,500);assert.equal(result.feature.projection,f.projection);
 }
});
test('equipment rejects cabinets, countertops and other equipment; finds a free slot',()=>{
 const r=room(),f={...newEquipment(r,'gas_cooker','e'),offset:0};r.features=[f];
 const copy={...f,id:'copy'};assert.match(equipmentError(copy,r),/Пересечение/);assert.ok(findEquipmentSpace(copy,r));
 const b=featureBox(f,r),cab={item_id:'c',module_type:'chest',name:'Шкаф',width:600,height:820,depth:510,x:b.x,z:b.z,rotation:0,base:'plinth',layout:'doors',drawers:0};
 assert.match(equipmentError(f,r,[cab]),/Шкаф/);
 const wallItem={...newEquipment(r,'gas_boiler','boiler'),offset:0,elevation:2000,height:500};assert.equal(equipmentError(wallItem,r,[cab]),'');
 const id=Object.keys(PILOT_PRODUCTION)[0],base=normalizeKitchen({...cab,module_type:'base_cabinet',bazis_id:id,bazis_sha256:PILOT_PRODUCTION[id].source_sha256,body_height:720,base_height:100});
 const topOnly={...f,kind:'radiator',height:20,elevation:bounds(base,r).maxY+5};assert.match(equipmentError(topOnly,{...r,features:[]},[base]),/столешницей/);
});
function controller(){
 let state={name:'QA',scene:{room:room(),items:[]}};state.scene.room.features=[newEquipment(state.scene.room,'radiator','r')];
 const adapter={get room(){return state.scene.room;},get items(){return state.scene.items;},snapshot:()=>structuredClone(state),restore:s=>{state=structuredClone(s);},notify(){},status(){},select(){}};
 const history=new History(adapter),scene={controls:{enabled:true},canvas:{style:{},setPointerCapture(){},hasPointerCapture(){return false;}},equipmentPlane:()=>({}),planePoint:(x,y)=>({x:x/1000,y:0,z:y/1000}),previewEquipment(f){this.preview=f;},clearEquipmentPreview(){this.preview=null;}};
 const c=Object.create(EquipmentControls.prototype);c.app={adapter,history,scene,options:{enabled:true},workspace:{panel(){}},interaction:{consume(){},feedback(){},cancel(){c.cancel();},change(label,fn){c.cancel();history.run(label,fn);return true;}}};c.sync=()=>{};c.select=id=>c.selectedId=id;c.error={textContent:''};c.selectedId='r';return {c,adapter,history,scene};
}
const event=(x,y)=>({pointerId:1,button:0,clientX:x,clientY:y,pointerType:'mouse',preventDefault(){}});
test('drag previews do not change saved coordinates; release commits one undo and cancellation restores',()=>{
 const {c,adapter,history,scene}=controller(),before=structuredClone(adapter.room);
 c.down(event(0,0),{featureId:'r',point:{}});c.move(event(200,0));assert.deepEqual(adapter.room,before);assert.equal(scene.preview.offset,before.features[0].offset+200);
 c.up(event(200,0));assert.equal(adapter.room.features[0].offset,before.features[0].offset+200);assert.equal(history.undoStack.length,1);history.undo();assert.deepEqual(adapter.room,before);history.redo();
 const after=structuredClone(adapter.room);c.down(event(0,0),{featureId:'r',point:{}});c.move(event(400,0));c.cancel();assert.deepEqual(adapter.room,after);assert.equal(scene.controls.enabled,true);assert.equal(history.undoStack.length,1);
 c.down(event(0,0),{featureId:'r',point:{}});c.move(event(9000,9000));c.up(event(9000,9000));assert.deepEqual(adapter.room,after);assert.equal(history.undoStack.length,1);
});
test('catalogue placement is undoable and invalid drops leave the project intact',()=>{
 const {c,adapter,history}=controller(),e=event(0,-1300);e.dataTransfer={setData(){}};
 c.catalogueStart(e,'gas_cooker');c.catalogueOver(e);assert.equal(adapter.room.features.length,1);c.catalogueDrop(e);assert.equal(adapter.room.features.length,2);assert.equal(adapter.room.features[1].wall_gap,0);assert.equal(history.undoStack.length,1);history.undo();assert.equal(adapter.room.features.length,1);
 const invalid=event(9900,9900);invalid.dataTransfer=e.dataTransfer;c.catalogueStart(invalid,'gas_cooker');c.catalogueDrop(invalid);assert.equal(adapter.room.features.length,1);assert.equal(history.undoStack.length,0);
});
test('all four supplied assets are finite normalized meshes within the polygon budget',()=>{
 const base=new URL('../../backend/v2/cabinet_assets/planner/appliance-assets/',import.meta.url);
 for(const kind of MOVABLE_EQUIPMENT){const manifest=JSON.parse(readFileSync(new URL(kind+'-tripo.json',base))),data=readFileSync(new URL(kind+'-tripo.bin',base));assert.ok(data.length<1200000);assert.match(manifest.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(manifest.triangles<=24000);assert.equal(data.length,manifest.byteLength);for(const [name,a] of Object.entries(manifest.attributes)){assert.ok(a.count>0);for(let i=0;i<a.count*a.size;i++){const value=a.type==='float32'?data.readFloatLE(a.offset+i*4):data.readUInt32LE(a.offset+i*4);assert.ok(Number.isFinite(value));if(name==='position')assert.ok(Math.abs(value)<=.50001);if(name==='index')assert.ok(value<manifest.vertices);}}assert.ok(readFileSync(new URL(kind+'-tripo-preview.webp',base)).length>1000);}
});
