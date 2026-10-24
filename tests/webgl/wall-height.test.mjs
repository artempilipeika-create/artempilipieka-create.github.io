import test from 'node:test';
import assert from 'node:assert/strict';
import {PRODUCTION_MODELS,dimensionPatch,elevation,bounds} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {StateAdapter} from '../../backend/v2/cabinet_assets/planner/state-adapter.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {applyChanges,replacement,translateItems} from '../../backend/v2/cabinet_assets/planner/mobility.mjs';

const room={width:4200,depth:3200,height:2700,setup_complete:true};
const wall=(extra={})=>({item_id:'upper',name:'Верхний',module_type:'wall_cabinet',width:600,height:720,depth:317,
  body_height:720,base_height:0,worktop_thickness:0,base:'wall',x:0,z:0,rotation:0,layout:'doors',drawers:0,...extra});

test('Every upper family grows upward and shrinks from the top at its existing bottom',()=>{
  for(const [id,p] of Object.entries(PRODUCTION_MODELS).filter(([,p])=>p.tier==='wall')){
    for(const roomHeight of [2400,2700,3000])for(const rotation of [0,90,180,270]){
      const r={...room,height:roomHeight},source=wall({bazis_id:id,bazis_sha256:p.source_sha256,rotation}),original=structuredClone(source);
      const low=elevation(source,r);let changed=source;
      for(const height of [900,600,1000,720]){
        changed=dimensionPatch(changed,{height},r);
        assert.equal(changed.elevation_mm,low);assert.equal(changed.body_height,height);
        assert.equal(bounds(changed,r).minY,low);assert.equal(bounds(changed,r).maxY,low+height);
        for(const key of ['x','z','rotation','width','depth','bazis_id','bazis_sha256'])assert.equal(changed[key],source[key]);
      }
      assert.deepEqual(source,original);
    }
  }
});

test('Custom and zero elevations stay fixed; legacy/null elevation is pinned only on height edits',()=>{
  for(const elevation_mm of [0,1458]){
    const it=wall({elevation_mm});assert.equal(dimensionPatch(it,{body_height:900},room).elevation_mm,elevation_mm);
  }
  const legacy=wall({elevation_mm:null});assert.equal(elevation(legacy,room),1480);
  assert.equal(dimensionPatch(legacy,{height:900},room).elevation_mm,1480);
  assert.equal(dimensionPatch(legacy,{width:700},room).elevation_mm,null);
  assert.equal(Object.hasOwn(dimensionPatch(wall(),{height:720},room),'elevation_mm'),false);
  const lower={...wall(),module_type:'base_cabinet',base:'plinth',base_height:100};
  assert.equal(Object.hasOwn(dimensionPatch(lower,{height:900},room),'elevation_mm'),false);
});

test('Anchor survives saved snapshots, undo/redo, horizontal moves, copies and upper replacement',()=>{
  let state={room:structuredClone(room),items:[wall()],selected_item_id:'upper'};
  const bridge={supportsElevation:true,state:()=>state,selected:()=>state.items.find(it=>it.item_id===state.selected_item_id),
    template:()=>({limits:{w:[300,1200],h:[300,1400],d:[250,500]}}),refresh:()=>{},
    snapshot:()=>({name:'Кухня',scene:structuredClone(state)}),restore:s=>{state=structuredClone(s.scene);},
    select:id=>{state.selected_item_id=id;}};
  const adapter=new StateAdapter(bridge),history=new History(adapter);
  history.run('Высота',()=>applyChanges(adapter,[dimensionPatch(adapter.selected,{height:900},room)]));
  assert.equal(adapter.selected.elevation_mm,1480);assert.equal(adapter.selected.height,900);
  history.undo();assert.equal(adapter.selected.height,720);assert.equal(elevation(adapter.selected,room),1480);
  history.redo();assert.equal(adapter.selected.height,900);assert.equal(adapter.selected.elevation_mm,1480);
  adapter.restore(JSON.parse(JSON.stringify(adapter.snapshot())));assert.equal(adapter.selected.elevation_mm,1480);
  applyChanges(adapter,translateItems([adapter.selected],600,0));assert.equal(adapter.selected.elevation_mm,1480);
  adapter.insert({...adapter.selected,item_id:'copy',x:1200});assert.equal(adapter.selected.elevation_mm,1480);
  for(const source of [wall(),wall({height:900,body_height:900,elevation_mm:1480})]){
    const next=replacement(source,wall({height:600,body_height:600}),{},{},false,room);
    assert.equal(next.height,600);assert.equal(next.elevation_mm,1480);
  }
  assert.match(adapter.validate(dimensionPatch(adapter.selected,{height:1300},room)),/выше потолка/);
  assert.match(adapter.validate({...adapter.selected,elevation_mm:-1}),/Высота навески/);
  assert.equal(Object.hasOwn(adapter.persistent({...wall(),module_type:'base_cabinet',elevation_mm:0}),'elevation_mm'),false);
});
