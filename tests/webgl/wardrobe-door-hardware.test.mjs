import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {anchoredShelf,wardrobeDoors,doorHardware,handlePlacement,orientHandle} from '../../backend/v2/cabinet_assets/planner/wardrobe-door-layout.mjs';
import {boardProfileCuts,horizontalProfileCuts,golaOutline,nativeDoorHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-door-hardware.mjs';
import {nativeCarcassJoints} from '../../backend/v2/cabinet_assets/planner/carcass-joints.mjs';
import {measuredRooms} from '../../backend/v2/cabinet_assets/planner/wardrobe-gola-shelves.mjs';
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
  const shelf=board(panels,'shelf-0-0');
  assert.equal(shelf.elevation_mm,anchoredShelf(f).y+f.thickness/2+36.5);
  assert.equal(shelf.depth,f.depth);assert.deepEqual(horizontalProfileCuts(shelf,panels),[]);
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
 const left=board(items,'shelf-0-0'),right=board(items,'shelf-1-0');
 assert.equal(left.depth,f.depth);assert.equal(right.depth,f.depth-1);
 assert.equal(left.elevation_mm-right.elevation_mm,45.5);
 const mounts=nativeCarcassJoints(items).filter(it=>it.joined_panel_id===left.item_id);
 assert.equal(mounts.length,8);assert.ok(mounts.every(p=>p.position.y===left.elevation_mm+9));
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

const drawerStack=(kind,count)=>({kind,layout:'equal',gap:3,faces:Array.from({length:count},()=>({height:null}))});
const profile=(article,edge)=>({article,edge});
function drawerFields(kind='external',sections=1){
 return {width:sections===1?800:1200,height:2200,depth:600,thickness:18,back:true,sections,sectionShelves:Array(sections).fill(1),
  elevation:0,clearLayout:true,shelfLevels:Array.from({length:sections},()=>[{mode:'floor',mm:600}]),drawerFixing:'cam_dowel',
  front:{swing:'pair',offset:90},drawerBanks:Array.from({length:sections},()=>drawerStack(kind,2))};
}
for(const kind of ['internal','external'])test('assigning Gola from either '+kind+' drawer keeps the runners and counts a shared grip once',()=>{
 const f=drawerFields(kind),original=buildCarcass(wardrobeSpec(f));
 f.drawerBanks[0].faces[0].handle=profile('118129','top');
 f.drawerBanks[0].faces[1].handle=profile('118129','bottom');
 const spec=wardrobeSpec(f),built=buildCarcass(spec),[low,high]=built.drawerBanks[0].faces;
 assert.equal(high.y-low.y-low.height,30);
 assert.deepEqual(built.drawerBanks[0].faces.map(v=>v.railY),original.drawerBanks[0].faces.map(v=>v.railY));
 assert.equal(built.profiles.length,1);
 const r=built.profiles[0];assert.equal(r.top,kind==='internal'?304:314);
 assert.ok(high.boxY-3>=r.top+1);assert.ok(low.boxTop<=r.top-74);
 const panels=assembled(f,270),native=nativeDoorHardware(panels);
 assert.equal(native.filter(v=>v.wardrobe_profile).length,1);
 assert.equal(native.filter(v=>v.wardrobe_gola_mount).length,1);
 assert.deepEqual(board(panels,'top').blank_gola_runs,[{article:'118129',length_mm:kind==='internal'?728:800}]);
 if(kind==='internal')assert.equal(boardProfileCuts(board(panels,'left'),panels).length,0);
});

test('a drawer and two doors share a 30 mm grip at the fixed shelf, independently of door hardware',()=>{
 const f=drawerFields();f.drawerBanks[0].faces[1].handle=profile('118129','top');
 f.front.handles={'door-left':handle('116550','right'),'door-right':handle('92255','left')};
 const built=buildCarcass(wardrobeSpec(f)),upper=built.drawerBanks[0].faces[1];
 assert.equal(upper.y+upper.height,594);
 assert.deepEqual(built.doors.map(p=>p.bottom),[624,624]);
 const hw=nativeDoorHardware(assembled(f));assert.deepEqual(hw.filter(p=>p.wardrobe_handle).map(p=>p.article).sort(),['116550','92255']);
});

test('an upper L on one door cuts only its bay and leaves the other door at 1.5 mm',async()=>{
 const {horizontalProfileCuts,gripShelfOutline}=await import('../../backend/v2/cabinet_assets/planner/wardrobe-door-hardware.mjs');
 const f=drawerFields('external',2);f.shelfLevels[1][0].mm=740;
 f.front.handles={'door-right':profile('118124','top')};
 f.drawerBanks[0].faces[0].handle=profile('118129','top');
 for(const yaw of [0,90,180,270]){
  const panels=assembled(f,yaw),roof=board(panels,'top'),left=board(panels,'door-left'),right=board(panels,'door-right');
  assert.equal(f.height-left.height-left.elevation_mm,1.5);assert.equal(f.height-right.height-right.elevation_mm,30);
  const [notch]=horizontalProfileCuts(roof,panels);
  assert.equal(roof.depth,f.depth);assert.deepEqual(notch,{a:582,b:1164,depth:27});
  const contour=gripShelfOutline(roof.depth,roof.width,[notch]);assert.ok(contour.some(s=>s.line.includes(roof.depth-27)));
 }
});


test('the L shelf meets the aluminium and the divider above it fits between actual bearing faces',()=>{
 const f=drawerFields();Object.assign(f,{width:1000,depth:577,elevation:100,sectionShelves:[2],
  shelfLevels:[[{mode:'floor',mm:646},{mode:'floor',mm:1737}]],
  nicheSplits:[{section:0,level:1,kind:'shelves',columns:[{gaps:[null]},{gaps:[null,null,null]}]}],
  drawerBanks:[{kind:'external',layout:'manual',gap:3,faces:[{height:227,handle:profile('118129','top')},{height:null,handle:profile('118124','top')}]}]});
 f.front.offset=130;
 const spec=wardrobeSpec(f),built=buildCarcass(spec,{idPrefix:'cab'}),legacy=buildCarcass(spec,{idPrefix:'cab',legacyGolaShelves:true});
 const shelf=board(built.items,'shelf-0-0'),divider=board(built.items,'niche-0-1-divider');
 assert.deepEqual([shelf.width,shelf.depth,shelf.height,shelf.elevation_mm],[964,577,18,656.5]);
 assert.equal(shelf.z+shelf.depth/2,board(built.items,'left').z+spec.depth/2);
 assert.deepEqual([divider.elevation_mm,divider.height,divider.elevation_mm+divider.height],[674.5,1062.5,1737]);
 assert.deepEqual([...built.installedLevels.keys()],['shelf-0-0']);
 for(const key of ['shelf-0-1','shelf-niche-0-1-1-0','shelf-niche-0-1-1-1','door-left','door-right','drawer-0-0-face','drawer-0-1-face']){
  assert.deepEqual(board(built.items,key),board(legacy.items,key));
 }
 assert.deepEqual(built.drawerBanks,legacy.drawerBanks);
 const [lower,upper]=measuredRooms(spec,0,1,null,built.installedLevels);
 assert.equal(lower.top-lower.bottom,538.5);assert.equal(upper.top-upper.bottom,1062.5);
 const rooms=measuredRooms(spec,0,1,1,built.installedLevels),rightShelf=board(built.items,'shelf-niche-0-1-1-0');
 assert.equal(rooms[0].bottom+spec.elevation,divider.elevation_mm);
 assert.equal(rooms[0].top+spec.elevation,rightShelf.elevation_mm);
});

test('all catalogue pulls fit using their own span and keep the other leaf independent',()=>{
 const leaf={key:'door-left',side:'left',left:0,bottom:0,width:597,height:2197};
 const products=Object.entries(doorHardware).filter(([,part])=>part.model);
 assert.equal(products.length,46);
 assert.equal(products.filter(([,part])=>part.family==='rail').length,30);
 for(const [article,part] of products){
  assert.equal(part.holes.length,2);
  assert.equal(part.holes[1][0]-part.holes[0][0],part.pitch);
  assert.equal(part.holeDiameter,part.family==='ps15'?3:5);
  assert.ok(part.outline.startsWith('M'));
  const initial=handle(article,'right'), rotated=orientHandle(leaf,initial,'horizontal');
  assert.equal(handlePlacement(leaf,rotated).angle,0);
  assert.equal(handlePlacement(leaf,initial).angle,90);
  const f=fields();delete f.front.division;
  f.width=1200;f.front.handles={'door-left':rotated,'door-right':handle('116550','left')};
  const rows=nativeDoorHardware(assembled(f,270)).filter(row=>row.wardrobe_handle);
  const selected=rows.find(row=>row.host_blank_id==='cab:door-left');
  assert.deepEqual([selected.article,selected.source_sha256,selected.handle_roll_deg,selected.rotation],[article,part.sha,0,270]);
  assert.equal(rows.find(row=>row.host_blank_id==='cab:door-right').article,'116550');
 }
});
