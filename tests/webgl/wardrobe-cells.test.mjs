import test from 'node:test';
import assert from 'node:assert/strict';
import {cellGeometry,heightLimits,insertShelves,keysAfterInsertion,resizeSections,setClearHeight,setClearWidth} from '../../backend/v2/cabinet_assets/planner/wardrobe-cells.mjs';
import {columnOpenings,isRightBank,levelOf,nicheSlot,sectionOf} from '../../backend/v2/cabinet_assets/planner/wardrobe-layout.mjs';
import {nicheOpenings} from '../../backend/v2/cabinet_assets/planner/wardrobe-niches.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,sectionWidths} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-aks-native.mjs';

const blank=()=>({width:1000,height:2000,depth:577,thickness:18,sections:1,sectionShelves:[0],back:true,clearLayout:true,drawerFixing:'cam_dowel'});
const cell=(section,level,column=null,opening=0)=>({section,level,column,opening});
const group='4bbed5d6-872f-44c6-a13d-60aa2cb80654';
const heights=(f,s)=>nicheOpenings(f,s).map(r=>r.top-r.bottom);

test('1000 × 2000: clear dimensions from faces, top remainder and movement confined to adjacent openings',()=>{
 const f=blank();resizeSections(f,2);setClearWidth(f,cell(0,0),400);
 insertShelves(f,cell(0,0),2);
 setClearHeight(f,cell(0,0),500);setClearHeight(f,cell(0,1),600);
 assert.deepEqual(sectionWidths(f),[400,546]);assert.deepEqual(heights(f,0),[500,600,828]);
 setClearHeight(f,cell(0,1),650);assert.deepEqual(heights(f,0),[500,650,778]);
 assert.deepEqual(heights(f,1),[1964]);assert.ok(heightLimits(f,cell(1,0)).reason);
 f.gapLocks=[[0],[]];setClearHeight(f,cell(0,2),750);assert.deepEqual(heights(f,0),[500,678,750]);
 assert.throws(()=>setClearHeight(f,cell(0,0),420),/фиксацию/);
 assert.throws(()=>setClearWidth(f,cell(1,0),900),/ширину/);
 const built=buildCarcass(wardrobeSpec(f),{idPrefix:group});
 assert.deepEqual(built.parts.filter(p=>/^shelf-0-/.test(p.key)).map(p=>p.item.elevation_mm),[518,1214]);
});

test('adding shelves within a local column preserves the adjacent column and the original full shelves',()=>{
 const f=blank();insertShelves(f,cell(0,0),1);
 f.nicheSplits=[{kind:'shelves',section:0,level:1,columns:[{gaps:[null]},{gaps:[null]}]}];
 const top=nicheOpenings(f,0)[1];insertShelves(f,cell(0,1,1),2);
 setClearWidth(f,cell(0,1,1),350);assert.deepEqual(cellGeometry(f,cell(0,1,1)).widths,[596,350]);
 setClearHeight(f,cell(0,1,1,1),240);const snapshot=cellGeometry(f,cell(0,1,1)).sizes;
 insertShelves(f,cell(0,1,1,0),1);
 assert.deepEqual(cellGeometry(f,cell(0,1,1)).sizes.slice(2),snapshot.slice(1));
 assert.deepEqual(columnOpenings(top.bottom,top.top,f.nicheSplits[0].columns[0],18),[{bottom:top.bottom,top:top.top}]);
 assert.deepEqual(nicheOpenings(f,0)[1],top);assert.doesNotThrow(()=>wardrobeSpec(f));
});

test('fourth section uses distinct stable legacy-compatible slots for shared rails and both 30 mm clearances',()=>{
 const slots=new Set();
 for(let s=0;s<4;s++)for(let l=0;l<=10;l++)for(let c=0;c<=1;c++){
   const index=nicheSlot(s,l,c);slots.add(index);
   if(s<3)assert.equal(index,s+3*l+33*c);
   assert.deepEqual([sectionOf(index),levelOf(index),Number(isRightBank(index))],[s,l,c]);
 }
 assert.equal(slots.size,88);
 const f={...blank(),width:1200};resizeSections(f,4);setClearWidth(f,cell(3,0),410);
 f.front={swing:'pair',offset:90,autoHinges:true};insertShelves(f,cell(3,0),1);setClearHeight(f,cell(3,0),540);
 const bank={kind:'internal',layout:'equal',gap:12,faces:[{height:null},{height:null}]};
 f.drawerBanks=Array(78).fill(null);f.drawerBanks[66]=structuredClone(bank);f.drawerBanks[77]=structuredClone(bank);
 f.nicheSplits=[{kind:'drawers',section:3,level:0,edge:'overlay'}];
 const spec=wardrobeSpec(f),built=buildCarcass(spec,{idPrefix:group}),items=built.items.map(i=>({...i,assistant_carcass:{spec,group_id:group}}));
 const item=key=>items.find(i=>i.item_id===group+':'+key);
 for(const slot of [66,77]){
   const face=item('drawer-'+slot+'-1-face');assert.equal(item('shelf-3-0').elevation_mm-face.elevation_mm-face.height,30);
 }
 const rails=wardrobeHardware(items).filter(r=>r.aks_kind==='rail'&&r.host_blank_id===item('niche-3-0-divider').item_id);
 assert.equal(rails.length,4);
});

test('inserting below an occupied niche preserves its height, partners, material keys and original panel notes',()=>{
 const f=blank();insertShelves(f,cell(0,0),2);
 const bank={kind:'external',layout:'equal',gap:5,faces:[{height:null}]};
 f.drawerBanks=[null,null,null,bank];
 const before=nicheOpenings(f,0)[1];
 const oldKeys=new Map([['shelf-0-0','noted shelf'],['drawer-3-0-face','custom front']]);
 insertShelves(f,cell(0,0),1);
 assert.deepEqual(nicheOpenings(f,0)[2],before);assert.equal(f.drawerBanks[6],bank);
 const keys=keysAfterInsertion(oldKeys,cell(0,0),1);
 assert.equal(keys.get('shelf-0-1'),'noted shelf');assert.equal(keys.get('drawer-6-0-face'),'custom front');
 assert.ok(!keys.has('shelf-0-0'));assert.doesNotThrow(()=>wardrobeSpec(f));
});
