import test from 'node:test';
import assert from 'node:assert/strict';
import {roomSettings,presetSettings,ROOM_PRESETS} from '../../backend/v2/cabinet_assets/planner/room-state.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
test('Old projects receive a stable display preset and all three presets round trip',()=>{
 assert.deepEqual(roomSettings(),presetSettings('studio'));
 for(const key of Object.keys(ROOM_PRESETS)){const settings=presetSettings(key);assert.equal(settings.environmentPreset,key);assert.deepEqual(roomSettings(JSON.parse(JSON.stringify(settings))),settings);}
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
