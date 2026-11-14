import test from 'node:test';
import assert from 'node:assert/strict';
import {blankItem,updateBlank,validateBlank} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';
import {defaultHookFace,hookPlacement,hookNativeItem} from '../../backend/v2/cabinet_assets/planner/blank-hook.mjs';
import {vertices,indices} from '../../backend/v2/cabinet_assets/planner/akkord-mesh.mjs';
test('AKKORD fixing line follows either vertical plane through every quarter turn',()=>{
 for(const axis of ['back','side'])for(const face of ['positive','negative'])for(const rotation of [0,90,180,270]){
  const it=blankItem({item_id:'part:right',axis,length:600,partWidth:400,thickness:18,x:200,z:40,elevation:100,rotation,blank_hook:{article:'68416',face,height_mm:150,along_mm:60}});
  assert.equal(validateBlank(it),'');const h=hookPlacement(it),out=hookNativeItem(it),sign=face==='positive'?1:-1;
  assert.equal(axis==='side'?h.x:h.z,9*sign);assert.equal(axis==='side'?h.z:h.x,60-(axis==='side'?400:600)/2);
  const a=rotation*Math.PI/180;assert.equal(out.position.x,200+Math.round(Math.cos(a))*h.x-Math.round(Math.sin(a))*h.z);
  assert.equal(out.position.y,250);assert.equal(out.host_blank_id,it.item_id);assert.equal(out.rotation,(rotation+(axis==='back'?(sign===1?0:180):(sign===1?270:90)))%360);
  assert.equal(defaultHookFace(it),axis==='side'?'negative':'positive');
  assert.ok(validateBlank(updateBlank(it,{blank_axis:'horizontal'})));assert.equal(updateBlank(it,{blank_hook:null}).blank_hook,null);
 }
});
test('mesh uses the measured hardware bounds and mounting centre follows resized blanks',()=>{
 assert.equal(indices.length,252*3);
 for(const [axis,min,max] of [[0,-15,15],[1,-27.591,98.148],[2,0,67.445]]){
  const v=vertices.filter((_,i)=>i%3===axis);assert.equal(Math.min(...v),min);assert.equal(Math.max(...v),max);
 }
 const it=blankItem({item_id:'part',axis:'back',length:600,partWidth:400,blank_hook:{article:'68416',face:'positive'}});
 assert.equal(hookPlacement(it).y,200);assert.equal(hookPlacement(updateBlank(it,{blank_width_mm:500})).y,250);
 assert.ok(validateBlank(updateBlank(it,{blank_width_mm:90})));
});

test('hook rows preserve centre, pitch and height on both panel types after save and rotation',async()=>{
 await import('../../backend/v2/cabinet_assets/planner/blanks-native.mjs');
 for(const axis of ['side','back'])for(const count of [1,2,3,4])for(const rotation of [0,90,180,270]){
  const it=blankItem({item_id:'panel',axis,length:600,partWidth:480,rotation,x:25,z:-40,blank_hook:{article:'68416',face:'negative',height_mm:250,count}});
  const span=axis==='side'?480:600;
  assert.equal(validateBlank(it),'');
  const entries=globalThis.MF_BLANKS_NATIVE.hookItems([JSON.parse(JSON.stringify(it))]);
  assert.equal(entries.length,count);const pos=entries.map(e=>e.position);
  assert.ok(pos.every(p=>p.y===250));assert.ok(entries.every(e=>e.host_blank_id===it.item_id));
  for(let i=1;i<count;i++)assert.equal(Math.hypot(pos[i].x-pos[i-1].x,pos[i].z-pos[i-1].z),span/count);
  assert.equal(hookPlacement(it,0)[axis==='side'?'z':'x'],-span/2+span/(2*count));
  assert.ok(validateBlank(updateBlank(it,{blank_hook:{...it.blank_hook,count:5}})));
 }
});
