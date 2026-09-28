import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {PlannerScene} from '../../backend/v2/cabinet_assets/planner/scene.mjs';

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
