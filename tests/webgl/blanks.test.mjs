import test from 'node:test';
import assert from 'node:assert/strict';
import {
  geometryFromBlank,blankItem,updateBlank,edgeMeters,blanksCSV,validateBlank
} from '../../backend/v2/cabinet_assets/planner/blanks-model.mjs';

test('independent panels use physical width, height and depth by orientation',()=>{
  assert.deepEqual(geometryFromBlank(720,400,18,'horizontal'),{width:720,height:18,depth:400});
  assert.deepEqual(geometryFromBlank(720,400,18,'side'),{width:18,height:720,depth:400});
  assert.deepEqual(geometryFromBlank(720,400,18,'back'),{width:720,height:400,depth:18});
});

test('board retains original dimensions after rotating into a side or back',()=>{
  const base=blankItem({blank_length_mm:720,blank_width_mm:400,blank_thickness_mm:18,blank_edge_code:'1010'});
  assert.equal(base.module_type,'blank');
  assert.equal(base.bazis_id,null);
  assert.equal(base.height,18);
  const side=updateBlank(base,{blank_axis:'side',elevation_mm:100});
  assert.equal(side.height,720);
  assert.equal(side.width,18);
  assert.equal(side.blank_edge_code,'1010');
  assert.equal(side.elevation_mm,100);
  assert.equal(base.height,18);
  const back=updateBlank(side,{blank_axis:'back'});
  assert.equal(back.depth,18);
  assert.equal(back.width,720);
  assert.equal(back.height,400);
});

test('four edge bits follow long1, long2, short1, short2 in millimetres',()=>{
  const item=blankItem({blank_length_mm:720,blank_width_mm:400,blank_thickness_mm:18});
  for(const [code,m] of [['0000',0],['1000',.72],['1010',1.12],['1110',1.84],['1011',1.52],['1111',2.24]]){
    assert.equal(edgeMeters({...item,blank_edge_code:code}),m,code);
  }
});

test('rejects impossible dimensions and malformed PVC code',()=>{
  const item=blankItem({blank_length_mm:720,blank_width_mm:400,blank_thickness_mm:18});
  assert.equal(validateBlank(item,{height:2700}),'');
  assert.match(validateBlank({...item,blank_width_mm:0}),/Ширина/);
  assert.match(validateBlank({...item,blank_thickness_mm:4}),/Толщина/);
  assert.match(validateBlank({...item,blank_edge_code:'1200'}),/Код ПВХ/);
  assert.match(validateBlank({...item,blank_axis:'side',elevation_mm:2500},{height:2700}),/высоту/);
});

test('CSV includes full source dimensions, material, all four edges and total PVC metres',()=>{
  const item=blankItem({name:'Полка 1',blank_length_mm:720,blank_width_mm:400,blank_thickness_mm:18,
    blank_edge_code:'1011',body_variant_id:'material-uuid'});
  const csv=blanksCSV([item,{module_type:'base_cabinet'}],
    id=>id==='material-uuid'?{name:'ЛДСП 605 PO',article:'605 PO'}:null);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"720";"400";"18";"1";"0";"1";"1";"1011";"1,52";"ЛДСП 605 PO";"605 PO";"material-uuid"'));
  assert.equal(csv.split('Полка 1').length-1,1);
});
