import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
import {localPoint} from '../../backend/v2/cabinet_assets/planner/blank-bindings.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';

const base={recipe:'divided',back:true,width:836,depth:577,shelfSetback:1,dividerSetback:1};
test('legacy overlay keeps its dimensions and the 10 mm variant is unavailable',()=>{
 const built=buildCarcass(base,{idPrefix:'g'}),back=built.parts.find(p=>p.key==='back').item;
 assert.deepEqual([built.depth,back.width,back.depth],[580,834,3]);
 assert.throws(()=>buildCarcass({...base,backThickness:10},{idPrefix:'g'}),/толщину/);
});
for(const t of [16,18])for(const width of [836,837])for(const rotation of [0,90,180,270]){
 test('wardrobe back '+[t,width,rotation].join('/'),()=>{
  const spec={...base,width,backThickness:t,bottomFit:'overlay'};
  const built=buildCarcass(spec,{idPrefix:'g',edges:{back:'1111'}});
  const items=placeCarcass(built,{x:1400,z:800,elevation_mm:100,rotation}).map(it=>({...it,assistant_carcass:{group_id:'g',spec}}));
  const back=items.find(i=>i.item_id==='g:back'),centre=localPoint(back,rotation);
  assert.equal(built.depth,577);assert.equal(back.width,width-36);
  assert.equal(blankNativeItem(back,{name:'ЛДСП',thickness:t}).blank.edge_code,'0000');
  for(const i of items.filter(it=>/:(shelf|divider)-/.test(it.item_id))){
   assert.equal(i.depth,577-t-1);
   assert.equal(localPoint(i,rotation).z-i.depth/2,centre.z+t/2);
  }
  const out=nativeCarcassJoints(items).filter(it=>it.joint_back_face);
  for(const [edge,quantity] of [['left',3],['right',3],['bottom',2],['top',width-36>800?2:1]]){
   const parts=out.filter(it=>it.host_blank_id==='g:'+edge);
   for(const kind of ['cam','dowel'])assert.equal(parts.filter(it=>it.joint_part===kind).length,quantity);
   for(const it of parts)assert.equal(localPoint(it.position,rotation).z,centre.z-t/2+9);
  }
 });
}
