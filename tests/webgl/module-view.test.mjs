import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_VIEWS,moduleView,changeModuleView} from '../../backend/v2/cabinet_assets/planner/module-view.mjs';
import {executionPreviewItem} from '../../backend/v2/cabinet_assets/planner/execution-previews.mjs';
import {PRODUCTION_MODELS as models,TALL_GOLA_VARIANTS} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';

function fixture(id=TALL_GOLA_VARIANTS[0].id){
 const state={name:'QA',scene:{room:{width:4000,depth:3000,height:2800},items:[{item_id:'one',bazis_id:id,bazis_file:'original.fr3d',bazis_sha256:models[id].source_sha256,width:600,height:2200,depth:600,x:120,z:100,rotation:90,doors_open:false,body_variant_id:'chosen-body',front_variant_id:'chosen-front',part_materials:{'side-L':'chosen-side'},shelves:[{material_variant_id:'chosen-shelf'}]}]}};
 const adapter={get selected(){return state.scene.items[0];},snapshot:()=>structuredClone(state),restore:s=>Object.assign(state,structuredClone(s))};
 const history=new History(adapter);
 const app={adapter,scene:{displayMode:'normal',setDisplayMode(mode){this.displayMode=mode;}},bridge:{refresh(){}},executions:{sync(){}}};
 app.interaction={modify(patch,label){history.run(label,()=>Object.assign(adapter.selected,patch));return true;}};
 return {app,history,state};
}

test('one view controls scene mode and preview without changing native identity, dimensions or materials',()=>{
 for(const v of TALL_GOLA_VARIANTS){
  const {app}=fixture(v.id),initial=structuredClone(app.adapter.selected);
  for(const view of ['open','inside','outside']){
   assert.equal(changeModuleView(app,view),true);
   const it=app.adapter.selected,selection=moduleView(it,app.scene.displayMode);
   assert.equal(selection.view,view);
   assert.equal(it.doors_open,view==='open');
   assert.equal(app.scene.displayMode,view==='inside'?'inspection':'normal');
   assert.equal(selection.preview.sceneDisplayMode,app.scene.displayMode);
   assert.equal(executionPreviewItem(it,selection.preview).doors_open,it.doors_open);
   assert.deepEqual({...it,doors_open:false},initial);
  }
 }
});

test('door state survives save/reopen and undo/redo; current selection has no stale preview mode',()=>{
 const {app,history,state}=fixture();
 changeModuleView(app,'open');
 assert.equal(history.undoStack.length,1);
 changeModuleView(app,'open');assert.equal(history.undoStack.length,1);
 history.undo();assert.equal(moduleView(app.adapter.selected,app.scene.displayMode).view,'outside');
 history.redo();assert.equal(moduleView(app.adapter.selected,app.scene.displayMode).view,'open');
 const reopened=JSON.parse(JSON.stringify(state)).scene.items[0];
 assert.equal(moduleView(reopened).view,'open');
 assert.equal(moduleView({...reopened,item_id:'another',doors_open:false}).view,'outside');
 assert.equal(moduleView(reopened,'inspection').view,'inside');
 assert.equal(moduleView(reopened,'facadesHidden').preview.sceneDisplayMode,'facadesHidden');
});

test('open shelves and drawer-only modules cannot enter the hinged-door view',()=>{
 for(const [id,p] of Object.entries(models).filter(([,p])=>!p.doors?.length)){
  const {app}=fixture(id),before=structuredClone(app.adapter.selected);
  assert.equal(moduleView(before).canOpen,false,id);
  assert.equal(changeModuleView(app,'open'),false,id);
  assert.deepEqual(app.adapter.selected,before);
  assert.equal(changeModuleView(app,'inside'),true);
  assert.equal(changeModuleView(app,'outside'),true);
 }
 assert.deepEqual(MODULE_VIEWS.map(([key])=>key),['outside','open','inside']);
});

test('failed edits, absent selection and fallback do not change scene or preview state',()=>{
 const {app}=fixture();app.scene.displayMode='inspection';
 app.interaction.modify=()=>false;
 assert.equal(changeModuleView(app,'open'),false);
 assert.equal(app.scene.displayMode,'inspection');
 assert.equal(moduleView(app.adapter.selected,app.scene.displayMode).view,'inside');
 app.scene.isFallback=true;assert.equal(changeModuleView(app,'outside'),false);
 app.scene.isFallback=false;assert.equal(changeModuleView(app,'invalid'),false);
 app.adapter={selected:null};assert.equal(changeModuleView(app,'inside'),false);
});

test('hero preview uses saved doors while option illustrations keep their independent view recipes',()=>{
 const {app}=fixture(),it={...app.adapter.selected,doors_open:true},before=structuredClone(it);
 const hero=executionPreviewItem(it,moduleView(it).preview);
 assert.equal(hero.doors_open,true);assert.equal(hero.x,0);assert.equal(hero.rotation,0);
 assert.equal(hero.body_variant_id,it.body_variant_id);assert.deepEqual(hero.part_materials,it.part_materials);
 const option=executionPreviewItem(it,{view:'closed'});assert.equal(option.body_variant_id,null);assert.deepEqual(option.part_materials,{});
 assert.equal(executionPreviewItem(it,{view:'closed'}).doors_open,false);
 assert.equal(executionPreviewItem({...it,doors_open:false},{view:'hinge'}).doors_open,true);
 assert.equal(hero.bazis_file,it.bazis_file);assert.equal(hero.bazis_sha256,it.bazis_sha256);
 assert.deepEqual(it,before);
});
