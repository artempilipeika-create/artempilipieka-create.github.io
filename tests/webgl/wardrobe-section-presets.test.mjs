import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSectionPreset} from '../../backend/v2/cabinet_assets/planner/wardrobe-section-presets.mjs';
import {setClearHeight} from '../../backend/v2/cabinet_assets/planner/wardrobe-cells.mjs';
import {nicheOpenings} from '../../backend/v2/cabinet_assets/planner/wardrobe-niches.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {nativeRods,planRods,rodWarnings} from '../../backend/v2/cabinet_assets/planner/wardrobe-rods.mjs';

const fields=()=>({width:1600,height:2200,depth:577,thickness:18,sections:2,sectionShelves:[0,0],back:true,clearLayout:true});
const cell=(section,level=0,column=null,opening=0)=>({section,level,column,opening});

test('one editable top shelf and native AKS rod persist after saving and export with their actual positions',()=>{
 const base=fields(),applied=prepareSectionPreset(base,cell(1),'long').fields;
 assert.deepEqual(base.sectionShelves,[0,0]);
 assert.deepEqual(applied.sectionShelves,[0,1]);
 const openings=nicheOpenings(applied,1);
 assert.equal(openings[1].top-openings[1].bottom,300);
 assert.equal(planRods(applied)[0].y,openings[0].top-100);
 setClearHeight(applied,cell(1),1550);applied.rods[0].offset=135;
 const saved=JSON.parse(JSON.stringify(wardrobeSpec(applied)));
 const built=buildCarcass(saved,{idPrefix:'wardrobe'});
 const position={x:800,z:600,elevation_mm:0,rotation:0};
 const items=placeCarcass(built,position).map(it=>({...it,assistant_carcass:{group_id:'wardrobe',spec:saved,position}}));
 const [bar]=nativeRods(items);
 assert.ok(items.some(it=>it.item_id==='wardrobe:shelf-1-0'));
 assert.equal(bar.position.y,18+1550-135);assert.equal(bar.article,'22109');assert.equal(bar.rod_id,applied.rods[0].id);
});

test('two neighbouring double-hang sections fit separate hardware without moving the first pair',()=>{
 const first=prepareSectionPreset(fields(),cell(0),'shirts').fields;
 const second=prepareSectionPreset(first,cell(1),'shirts').fields;
 const rods=planRods(second);
 assert.deepEqual(second.sectionShelves,[0,0]);assert.equal(new Set(rods.map(r=>r.id)).size,4);
 assert.ok(rods[0].y-rods[1].y>900);
 assert.deepEqual(second.rods.slice(0,2),first.rods);assert.deepEqual(rodWarnings(rods,18),[]);
 assert.throws(()=>prepareSectionPreset(second,cell(1),'long'),/уже установлены/);
 const next=prepareSectionPreset(second,cell(1),'long',null,true).fields;
 assert.equal(next.rods.length,3);assert.deepEqual(next.rods.slice(0,2),first.rods);
 assert.deepEqual(prepareSectionPreset(next,cell(1),'long',null,true).fields.sectionShelves,[0,1]);
});

test('an occupied section keeps its drawers, existing shelf and other column; blocked attempts are atomic',()=>{
 const f=fields();f.sectionShelves=[1,0];
 f.drawerBanks=[{kind:'internal',layout:'equal',gap:12,faces:[{height:null},{height:null}]}];
 f.nicheSplits=[{kind:'shelves',section:0,level:1,columns:[{gaps:[null]},{gaps:[145,null]}]}];
 const before=structuredClone(f),keys=new Map([['shelf-0-0','original-shelf'],['drawer-0-0-face','original-drawer']]);
 assert.throws(()=>prepareSectionPreset(f,cell(0),'long',keys),/шуфляды/);
 const result=prepareSectionPreset(f,cell(0,1,0),'long',keys);
 assert.deepEqual(result.fields.sectionShelves,[1,0]);assert.deepEqual(result.fields.drawerBanks,f.drawerBanks);
 assert.equal(result.fields.nicheSplits[0].columns[0].gaps.length,2);assert.deepEqual(result.fields.nicheSplits[0].columns[1],f.nicheSplits[0].columns[1]);
 assert.deepEqual(result.keys,keys);assert.deepEqual(f,before);
 assert.throws(()=>prepareSectionPreset({...fields(),height:189},cell(1),'shirts'),/недостаточно высоты/);
});
