import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {PlannerScene} from '../../backend/v2/cabinet_assets/planner/scene.mjs';
import {CabinetControls} from '../../backend/v2/cabinet_assets/planner/cabinet-controls.mjs';

globalThis.document={getElementById:()=>null,body:{classList:{contains:()=>false}}};
function fixture(){
  const item={item_id:'old',bazis_id:'bazis.0211e4f77fc4'},state={items:[item],selected_item_id:'old'};
  const s=Object.create(PlannerScene.prototype);
  s.adapter={state,get items(){return this.state.items;},get selected(){return this.items.find(it=>it.item_id===this.state.selected_item_id)||null;}};
  s.scene=new THREE.Scene();s.root=new THREE.Group();s.scene.add(s.root);
  const group=new THREE.Group();group.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));s.root.add(group);
  Object.assign(s,{entries:new Map([['old',{group}]]),kitchenBoxes:new Map(),selectionScope:'kitchen',
    selectedBox:new THREE.Box3Helper(new THREE.Box3()),hoverBox:new THREE.Box3Helper(new THREE.Box3()),
    invalidate:()=>{},renderer:{shadowMap:{}},factory:{release:g=>g?.removeFromParent(),ownsGeometry:()=>false}});
  s.highlight();return s;
}
test('highlight ignores entries whose modules disappeared before scene sync',()=>{
  const s=fixture(),old=[...s.kitchenBoxes.values()][0];
  assert.equal(old.visible,true);
  s.adapter.state={items:[],selected_item_id:null};
  assert.doesNotThrow(()=>s.highlight());
  assert.equal(s.kitchenBoxes.size,0);assert.equal(old.parent,null);assert.equal(s.selectedBox.visible,false);
  assert.equal(s.selectionScope,'module');
});
test('detached meshes cannot be highlighted or hovered even if their IDs remain',()=>{
  const s=fixture();s.entries.get('old').group.removeFromParent();
  s.highlight();s.hover('old');assert.equal(s.kitchenBoxes.size,0);assert.equal(s.hoverBox.visible,false);
  s.selectionScope='module';s.highlight();assert.equal(s.selectedBox.visible,false);assert.equal(s.selectedBox.box.isEmpty(),true);
});
test('project reset releases the old object graph and transient selection',()=>{
  const s=fixture(),old=s.entries.get('old').group,box=s.kitchenBoxes.get('old');
  s.preview=new THREE.Group();s.dressing=new THREE.Group();s.contacts=new THREE.Group();s.guides=new THREE.Group();
  s.scene.add(s.preview,s.dressing,s.contacts,s.guides);const objects=[old,box,s.preview,s.dressing,s.contacts,s.guides];
  s.displayMode='inspection';s.displayItemId='old';s.hoverBox.visible=true;
  s.resetProject();
  assert.equal(s.entries.size,0);assert.equal(s.kitchenBoxes.size,0);assert.equal(s.root.children.length,0);
  assert.ok(objects.every(o=>o.parent===null));assert.equal(s.selectionScope,'module');assert.equal(s.displayMode,'normal');
  assert.equal(s.displayItemId,null);assert.equal(s.preview,null);assert.equal(s.hoverBox.visible,false);
});

test('the X-ray button works without a selection, survives a scene replacement and never selects a cabinet',t=>{
  const node=()=>({after(){},append(){},parentElement:{append(){}},closest(){return this;},
    setAttribute(name,value){this[name]=value;},classList:{toggle(){}}});
  t.mock.method(document,'getElementById',node);
  const previous=document.createElement;document.createElement=node;t.after(()=>{document.createElement=previous;});
  const adapter={selected:null,items:[]},app={adapter,scene:{},sync(){controls.sync();}};
  const controls=new CabinetControls(app);controls.sync();
  assert.equal(controls.xray['aria-pressed'],'false');assert.ok(!controls.xray.disabled);
  controls.xray.onclick();assert.equal(app.scene.xrayEnabled,true);assert.equal(adapter.selected,null);
  app.scene={};controls.sync();assert.equal(app.scene.xrayEnabled,true);
  assert.equal(app.scene.cabinetSelection,null);assert.equal(controls.xray['aria-pressed'],'true');
  controls.xray.onclick();assert.equal(app.scene.xrayEnabled,false);assert.equal(adapter.selected,null);
});

test('X-ray hides existing individual, whole-kitchen and hover outlines and restores normal selection on exit',()=>{
  const s=fixture();s.xrayEnabled=true;s.highlight();s.hover('old');
  assert.equal(s.kitchenBoxes.get('old').visible,false);assert.equal(s.hoverBox.visible,false);
  s.selectionScope='module';s.highlight();assert.equal(s.selectedBox.visible,false);
  s.clearSelection();assert.equal(s.xrayEnabled,true);
  s.xrayEnabled=false;s.highlight();assert.equal(s.selectedBox.visible,true);
});
