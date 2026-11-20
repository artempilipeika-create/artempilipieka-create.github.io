import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {blankNativeItem} from '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
import {nativeDoorHardware} from '../../backend/v2/cabinet_assets/planner/wardrobe-door-hardware.mjs';
import {orientHandle,handlePlacement,mirrorHandle} from '../../backend/v2/cabinet_assets/planner/wardrobe-door-layout.mjs';
import {finishedFaceSize,groovedBoxes} from '../../backend/v2/cabinet_assets/planner/wardrobe-edge-pulls.mjs';

const material={name:'Пробная плита',thickness:18};
const fields={width:800,height:2000,depth:550,thickness:18,sections:1,sectionShelves:[1],back:true,
 front:{swing:'pair',offset:90}};
function face(grip,side){
 const key='door-'+side;
 const spec=wardrobeSpec({...fields,front:{...fields.front,handles:{[key]:grip}}});
 const panels=buildCarcass(spec,{idPrefix:'wardrobe'}).items.map(p=>({...p,assistant_carcass:{group_id:'wardrobe',spec}}));
 return {board:panels.find(p=>p.item_id==='wardrobe:'+key),hardware:nativeDoorHardware(panels)};
}
test('inset metal, unfinished edge and actual cutter follow each selected facade edge',()=>{
 for(const [article,depth] of [['67698',10],['75975',13]])for(const [edge,code] of Object.entries({left:'1011',right:'0111',top:'1110',bottom:'1101'})){
  const grip={article,edge,grooveDepth:depth+.5,grooveWidth:2.4},side=edge==='left'?'right':'left';
  const {board,hardware}=face(grip,side),native=blankNativeItem(board,material);
  const {width,height}=finishedFaceSize(board),vertical=['left','right'].includes(edge);
  assert.equal(width,397);assert.equal(height,1997);assert.equal(native.blank.edge_code,code);
  assert.equal(native.blank.edge_grip.groove_depth_mm,depth+.5);assert.equal(native.blank.edge_grip.groove_width_mm,2.4);
  assert.equal(hardware.length,1);assert.equal(hardware[0].span_mm,vertical?height:width);
  assert.equal(hardware[0].wardrobe_edge_pull,true);assert.equal(hardware[0].joined_panel_id,board.item_id);
  const lo=[-board.width/2,0,-9],hi=[board.width/2,board.height,9];
  const volume=groovedBoxes(lo,hi,board,grip).reduce((sum,[a,b])=>sum+(b[0]-a[0])*(b[1]-a[1])*(b[2]-a[2]),0);
  const expected=board.width*board.height*18-hardware[0].span_mm*grip.grooveWidth*grip.grooveDepth;
  assert.ok(Math.abs(volume-expected)<.00001);
 }
});
test('a new grip gets its article-specific trial cut and the hinge edge remains available for cups',()=>{
 const grip={article:'75975',edge:'top'};
 const native=blankNativeItem(face(grip,'left').board,material);
 assert.deepEqual([native.blank.edge_grip.groove_width_mm,native.blank.edge_grip.groove_depth_mm],[3,13.5]);
 const other=blankNativeItem(face({...grip,article:'67698'},'left').board,material);
 assert.deepEqual([other.blank.edge_grip.groove_width_mm,other.blank.edge_grip.groove_depth_mm],[2,10.5]);
 assert.match(native.production_note,/расчётная посадка/);
 assert.throws(()=>face({...grip,edge:'left'},'left'),/петли/);
});
test('AK700 pivots around a fixing on doors and around its centre on drawers',()=>{
 const leaf={key:'door-left',side:'left',width:397,height:1997};
 const original={article:'116550',edge:'right',inset:50,from:'end',offset:50};
 const horizontal=orientHandle(leaf,original,'horizontal');
 assert.deepEqual(horizontal,{...original,edge:'top'});
 assert.deepEqual(orientHandle(leaf,horizontal,'vertical'),original);
 const before=handlePlacement(leaf,original),after=handlePlacement(leaf,horizontal);
 assert.deepEqual([before.x,before.y+80],[after.x+80,after.y]);
 const drawer={slot:0,width:640,height:300};
 const A={...original,edge:'top',from:'center',inset:130,offset:0};
 const B=orientHandle(drawer,A,'vertical'),center=s=>{const p=handlePlacement(drawer,s);return [p.x,p.y];};
 assert.deepEqual(center(A),center(B));
 assert.deepEqual(mirrorHandle({article:'67698',edge:'right'}),{article:'67698',edge:'left'});
});
