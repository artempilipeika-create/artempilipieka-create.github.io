import assert from 'node:assert/strict';
import test from 'node:test';
import {Vector3} from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {buildCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import {newDresser,setDresserLayout,syncDresser} from '../../backend/v2/cabinet_assets/planner/dresser-layout.mjs';
import {wardrobeSpec} from '../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs';
import {questionnaireModel,studioCamera} from '../../backend/v2/cabinet_assets/planner/questionnaire-showroom.mjs';

test('survey photos use the saved arrangement, rail travel and materials without editing the assembly',()=>{
  const fields=newDresser();fields.width=1500;fields.height=800;fields.elevation=330;
  delete fields.feet;fields.dresser.installation='wall';setDresserLayout(fields,['drawers','media','shelves'],4);
  const built=buildCarcass(wardrobeSpec(syncDresser(fields)),{idPrefix:'showroom',frontMaterialId:'custom'});
  const original=JSON.stringify(built.items);
  const material=id=>id==='custom'?{color:'#667788'}:null;
  const closed=questionnaireModel(built,{material,open:false}),open=questionnaireModel(built,{material,open:true});
  const awaitingCatalogue=questionnaireModel(built,{open:false});
  try{
    const node=(view,key)=>view.model.children.find(g=>g.userData.itemId==='showroom:'+key);
    assert.equal(built.drawerBanks[0].faces.length,4);
    assert.equal(node(closed,'drawer-0-3-face').children.find(m=>m.userData.role==='front').material.color.getHexString(),'667788');
    assert.equal(node(awaitingCatalogue,'drawer-0-3-face').children.find(m=>m.userData.role==='front').material.userData.variantId,'custom');
    assert.equal(node(open,'drawer-0-1-face').position.z,node(closed,'drawer-0-1-face').position.z);
    assert.ok(node(open,'drawer-0-3-face').position.z>node(closed,'drawer-0-3-face').position.z+.12);
    assert.ok(Math.abs(Math.abs(node(open,'door-section-2-right').rotation.y)-Math.PI/2)<1e-9);
    assert.equal(node(open,'left').position.y,.33);
    assert.ok(!node(closed,'plinth'));
    const {camera}=studioCamera(built,4/3);
    assert.ok(Math.abs(new Vector3(0,0,0).project(camera).y)<1,'real floor datum is inside the picture');
    assert.equal(JSON.stringify(built.items),original);
  }finally{closed.release();open.release();awaitingCatalogue.release();}
});
