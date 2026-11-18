import test from 'node:test';
import assert from 'node:assert/strict';
import {roomSettings,presetSettings,selectInterior,ROOM_PRESETS} from '../../backend/v2/cabinet_assets/planner/room-state.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
test('New rooms start with graphite and oak; every saved interior round trips',()=>{
 assert.deepEqual(roomSettings(),presetSettings('graphite'));
 assert.equal(roomSettings().floorMaterial,'oak');
 for(const key of Object.keys(ROOM_PRESETS)){const settings=presetSettings(key);assert.equal(settings.environmentPreset,key);assert.deepEqual(roomSettings(JSON.parse(JSON.stringify(settings))),settings);}
});
test('all three designed interiors preserve a separately selected floor and light',()=>{
 let current={...presetSettings('showroom'),floorMaterial:'marble',lightingPreset:'warm'};
 for(const name of ['warm-oak','classic','graphite']){
   current=selectInterior(current,name);
   assert.deepEqual(current,{...presetSettings(name),floorMaterial:'marble',lightingPreset:'warm'});
   assert.deepEqual(roomSettings(JSON.parse(JSON.stringify(current))),current);
 }
});
test('Invalid presentation values are bounded independently without changing room geometry',()=>{
 const source={environmentPreset:'warm',floorMaterial:'external-url',lightingPreset:'infinite',wallColor:'url(data:text/plain,x)',width:12000},before=structuredClone(source),s=roomSettings(source);
 assert.deepEqual(source,before);assert.deepEqual(s,presetSettings('warm'));assert.equal(s.width,undefined);
 assert.equal(roomSettings({wallColor:'#123ABC'}).wallColor,'#123ABC');
});
test('Room settings undo and redo preserve the original furniture snapshot',()=>{
 let state={name:'Room',scene:{room:{width:6200,depth:3600,height:2700},items:[{item_id:'cabinet',width:320}],displaySettings:presetSettings('studio')}};
 const initial=structuredClone(state),h=new History({snapshot:()=>structuredClone(state),restore:v=>{state=structuredClone(v)}});
 h.run('Room',()=>{state.scene.displaySettings=presetSettings('warm')});assert.equal(h.undoStack.length,1);assert.deepEqual(state.scene.items,initial.scene.items);
 h.undo();assert.deepEqual(state,initial);h.redo();assert.equal(state.scene.displaySettings.floorMaterial,'oak');assert.deepEqual(state.scene.room,initial.scene.room);
});

test('interior decoration follows every measured wall without filling windows or doorways', async()=>{
 const {interiorWall,interiorPalette}=await import('../../backend/v2/cabinet_assets/planner/room-interiors.mjs');
 const {wallPanels}=await import('../../backend/v2/cabinet_assets/planner/room-plan.mjs');
 for(const wall of ['a','b','c','d']){
   const room={width:4500,depth:3500,height:2700,features:[
     {kind:'window',wall,offset:210,width:1100,height:1400,elevation:820},
     {kind:'door',wall,offset:1700,width:850,height:2110,elevation:0}
   ]};
   const length=['a','c'].includes(wall)?room.width:room.depth;
   for(const style of ['graphite','warm-oak','classic']){
     const parts=interiorWall({style,wall,length,height:room.height,panels:wallPanels(room,wall),openings:room.features});
     assert.ok(parts.size>=3&&parts.size<=8);
     assert.ok(interiorPalette(presetSettings(style)).frame.isColor);
     for(const {point} of parts.values()){
       for(let i=0;i<point.length;i+=9){
         const x=(point[i]+point[i+3]+point[i+6])*1000/3+length/2;
         const y=(point[i+1]+point[i+4]+point[i+7])*1000/3;
         assert.ok(point[i+2]<=0 && x>=-.001&&x<=length+.001);
         for(const f of room.features){
           const inOpening=x>f.offset+.01&&x<f.offset+f.width-.01&&y>f.elevation+.01&&y<f.elevation+f.height-.01;
           assert.ok(!inOpening,style+' on wall '+wall+' covers '+f.kind);
         }
       }
     }
   }
 }
});
