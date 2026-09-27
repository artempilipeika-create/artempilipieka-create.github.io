import test from 'node:test';
import assert from 'node:assert/strict';
import {clientFrame} from '../../backend/v2/cabinet_assets/planner/client-camera.mjs';
const points=[];
for(const x of[-.9,.9])for(const y of[-.43,.43])for(const z of[-.3,.3])points.push({x,y,z});
for(const [width,height,viewport]of [
 [1440,848,{left:16,top:70,width:1408,height:762}],
 [1366,716,{left:16,top:70,width:1334,height:630}],
 [1920,1028,{left:390,top:70,width:1110,height:942}],
 [390,792,{left:16,top:70,width:358,height:706}]
])test('Client fit fills usable viewport '+width+' / '+viewport.width,()=>{
 const frame=clientFrame(points,width,height,viewport,36);
 assert.ok(frame.widthFraction>=.65&&frame.widthFraction<=.8);
 assert.ok(frame.heightFraction<=.821);
 assert.ok(frame.bounds.left>=viewport.left&&frame.bounds.right<=viewport.left+viewport.width);
 assert.ok(frame.bounds.top>=viewport.top&&frame.bounds.bottom<=viewport.top+viewport.height);
 assert.ok(Math.abs((frame.bounds.left+frame.bounds.right)/2-(viewport.left+viewport.width/2))<1e-7);
});
test('Tall composition fits height without clipping or altering its points',()=>{
 const tall=points.map(p=>({...p,y:p.y*3})),before=structuredClone(tall);
 const f=clientFrame(tall,1440,848,{left:16,top:70,width:1408,height:762});
 assert.ok(f.heightFraction>.81&&f.heightFraction<=.821);assert.deepEqual(tall,before);
});
