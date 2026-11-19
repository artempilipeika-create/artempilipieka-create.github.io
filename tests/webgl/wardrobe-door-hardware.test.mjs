import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {anchoredShelf,wardrobeDoors} from '../../backend/v2/cabinet_assets/planner/wardrobe-door-layout.mjs';
import {boardProfileCuts,golaOutline,nativeDoorHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-door-hardware.mjs';
import {insertShelves,resizeSections,setSectionShelfCount} from '../../backend/v2/cabinet_assets/planner/wardrobe-cells.mjs';

const fields=()=>({width:1000,height:2200,depth:577,thickness:18,back:true,sections:1,sectionShelves:[1],clearLayout:true,elevation:0,
 front:{swing:'pair',offset:90,division:{scope:'all',section:0,shelf:0,above:'pair',below:'pair'}}});
const handle=(article,edge)=>({article,edge,from:'center',offset:0,inset:50});
function assembled(f,rotation=0){
 const spec=wardrobeSpec(f),built=buildCarcass(spec,{idPrefix:'cab'});
 const position={x:500,z:650,rotation,elevation_mm:0};
 return placeCarcass(built,position).map(i=>({...i,assistant_carcass:{spec,group_id:'cab',position}}));
}
const board=(items,key)=>items.find(p=>p.item_id==='cab:'+key);
const opening=(lo,hi)=>hi.bottom-lo.bottom-lo.height;

test('each meeting edge uses its own reveal and a single door overlaps its fixed shelf',()=>{
 const f=fields(),leaves=()=>wardrobeDoors(wardrobeSpec(f));
 let [a,b,c]=leaves();
 assert.equal(opening(a,c),3);assert.equal(b.left-a.left-a.width,3);
 f.front.handles={'door-lower-left':handle('92255','top'),'door-upper-left':handle('92255','bottom')};
 [a,b,c]=leaves();
 assert.equal(opening(a,c),4);assert.equal(b.left-a.left-a.width,3);
 delete f.front.handles;f.front.division.above='open';
 const [only]=leaves();
 assert.equal(only.bottom+only.height-anchoredShelf(f).y,16.5);
});

test('Gola S stays at 30 for both side machining heights and all rotations',()=>{
 for(const cutHeight of [73,74])for(const yaw of [0,90,180,270]){
  const f=fields();f.front.topProfile=true;Object.assign(f.front.division,{gola:true,cutHeight});
  const panels=assembled(f,yaw),cuts=boardProfileCuts(board(panels,'left'),panels);
  assert.deepEqual(cuts.map(c=>c.rawHigh-c.rawLow),[cutHeight,57]);
  const path=golaOutline(f.depth,f.height,cuts);
  assert.equal(path.filter(s=>s.arc).length,3);
  const leaves=wardrobeDoors(f);assert.equal(opening(leaves[0],leaves[2]),30);
  assert.equal(f.height-leaves[2].bottom-leaves[2].height,30);
  assert.equal(board(panels,'shelf-0-0').depth,f.depth-74);
  assert.equal(board(panels,'top').depth,f.depth-27);
  const native=nativeDoorHardware(panels),mounts=native.filter(p=>p.wardrobe_gola_mount);
  assert.equal(mounts.length,2);assert.ok(mounts.every(p=>p.span_mm===f.width-2*f.thickness&&p.rotation===yaw&&p.article==='118236'));
 }
});

test('a partial S uses the centre support and only the selected outer upright',()=>{
 const f=fields();f.sections=2;f.sectionShelves=[1,1];f.dividerPositions=[400];
 Object.assign(f.front.division,{scope:'left',above:'left',below:'left',gola:true});
 const items=assembled(f),profiles=nativeDoorHardware(items);
 assert.equal(wardrobeDoors(f).length,3);
 for(const p of profiles)assert.deepEqual([p.host_blank_id,p.joined_panel_id],['cab:left','cab:divider-0']);
 assert.equal(boardProfileCuts(board(items,'right'),items).length,0);
 assert.equal(boardProfileCuts(board(items,'divider-0'),items)[0].depth,26);
});

test('shelf edits preserve the selected physical partition and extend the seam into a new bay',()=>{
 const f=fields(),y=anchoredShelf(f).y;
 insertShelves(f,{section:0,level:0,column:null},2);
 assert.equal(f.front.division.shelf,2);assert.equal(anchoredShelf(f).y,y);
 setSectionShelfCount(f,0,1);
 assert.equal(f.front.division.shelf,0);assert.throws(()=>setSectionShelfCount(f,0,0));
 resizeSections(f,2);assert.equal(anchoredShelf(f).matches.length,2);assert.equal(anchoredShelf(f).y,y);
});

test('a drawer handle follows its face into native export and checks the closed-door clearance',()=>{
 const f=fields();delete f.front;f.drawerBanks=[{kind:'internal',layout:'equal',gap:3,faces:[{height:null,handle:handle('116548','top')},{height:null}]}];
 const hardware=nativeDoorHardware(assembled(f,90));
 assert.equal(hardware[0].host_blank_id,'cab:drawer-0-0-face');assert.equal(hardware[0].rotation,90);
 f.front={swing:'pair',offset:130};
 assert.throws(()=>wardrobeSpec(f),/упирается в закрытую дверь/);
});
