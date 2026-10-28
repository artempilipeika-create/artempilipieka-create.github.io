import test from 'node:test';
import assert from 'node:assert/strict';
import {fileName,exportSize,qualityProfile,RenderBudget} from '../../backend/v2/cabinet_assets/planner/presentation.mjs';
import {capturePresentation,captureAlbumViews} from '../../backend/v2/cabinet_assets/planner/presentation-capture.mjs';
import {History} from '../../backend/v2/cabinet_assets/planner/history.mjs';
import {fingerprint} from '../../backend/v2/cabinet_assets/planner/project-autosave.mjs';
test('export size respects GPU limit and has 16:9 aspect',()=>{
  assert.deepEqual(exportSize('standard'),{width:1920,height:1080});
  assert.deepEqual(exportSize('large'),{width:2560,height:1440});
  assert.equal(exportSize('large',2048).width,2048);
});
test('download filenames preserve Cyrillic without filesystem controls',()=>{
  const name=fileName('Кухня / <Анна>\n','Фасадный',true,new Date('2026-10-24T10:00:00Z'));
  assert.match(name,/Кухня Анна/);assert.match(name,/2026-10-24\.png$/);assert.doesNotMatch(name,/[<>:"/\\|?*\n]/);
  assert.match(fileName('Кухня','Общий',true,new Date('2026-10-23T22:30:00Z')),/2026-10-24\.png$/);
});
test('automatic quality responds to sustained cost, not a single shader stall',()=>{
  assert.equal(qualityProfile('auto',{memory:4,cores:8}).name,'balanced');
  assert.equal(qualityProfile('high',{memory:2}).name,'high');
  const b=new RenderBudget();assert.equal(b.record(1000),false);
  for(let i=0;i<35;i++)assert.equal(b.record(60),false);
  assert.equal(b.record(60),true);assert.equal(b.record(60),false);
  const fast=new RenderBudget();for(let i=0;i<100;i++)assert.equal(fast.record(12),false);
});
test('saved views participate in undo and autosave without changing furniture',()=>{
  let snapshot={name:'Кухня',scene:{items:[{item_id:'a',width:600}],room:{width:3600},presentationViews:[]}};
  const original=structuredClone(snapshot),adapter={snapshot:()=>snapshot,restore:s=>snapshot=s};const h=new History(adapter);
  h.run('Ракурс',()=>snapshot.scene.presentationViews.push({id:'view',name:'Вид от входа'}));
  assert.notEqual(fingerprint(snapshot),fingerprint(original));assert.deepEqual(snapshot.scene.items,original.scene.items);
  h.undo();assert.deepEqual(snapshot,original);h.redo();assert.equal(snapshot.scene.presentationViews.length,1);
});
function mockScene(){
  const box={visible:true};let ratio=1.5;
  return {adapter:{items:[{}]},canvas:{},width:1000,height:700,client:false,clientView:'front',clientFit:{x:1},
    renderer:{getPixelRatio:()=>ratio,setPixelRatio:v=>ratio=v,setSize(){}},studioRender:{maxDimension:1440},
    cameraState:{mode:'front',position:[1,2,3]},captureView(){return structuredClone(this.cameraState);},
    restoreView(v){this.cameraState=structuredClone(v);},setPresentation(v){this.client=v;},
    perspective:{updateProjectionMatrix(){}},selectedBox:{visible:true},hoverBox:{visible:true},guides:{visible:true},kitchenBoxes:new Map([['a',box]]),
    stopOrbitInertia(){},fitKitchenForClient(v){this.clientView=v;this.cameraState={mode:'3d'};},render(){},
  };
}
for(const fail of [false,true])test('capture restores renderer/camera/selection '+(fail?'after an encoding failure':'after success'),()=>{
  const s=mockScene(),before=JSON.stringify(s.adapter.items),view=s.captureView(),old=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){if(fail)throw Error('tainted');},getImageData(){}})})};
  try{
    if(fail)assert.throws(()=>capturePresentation(s,{width:1920,height:1080}),/tainted/);
    else assert.equal(capturePresentation(s,{width:1920,height:1080}).width,1920);
    assert.equal(s.client,false);assert.equal(s.clientView,'front');assert.deepEqual(s.cameraState,view);
    assert.equal(s.renderer.getPixelRatio(),1.5);assert.equal(s.width,1000);assert.equal(s.height,700);
    assert.equal(s.studioRender.maxDimension,1440);assert.equal(s.guides.visible,true);assert.equal(s.selectedBox.visible,true);
    assert.equal(s.kitchenBoxes.get('a').visible,true);assert.equal(JSON.stringify(s.adapter.items),before);assert.equal(s.exportSize,null);
  }finally{globalThis.document=old;}
});

test('album references use the complete presentation pass at export size even in a small editor',()=>{
  const s=mockScene(),old=globalThis.document,renders=[],encodings=[];
  s.width=540;s.height=360;
  s.renderer.render=()=>assert.fail('A raw renderer call skips wall visibility and studio postprocessing');
  s.render=()=>{if(s.exportSize)renders.push({width:s.width,height:s.height,client:s.client,view:s.clientView,selected:s.selectedBox.visible});};
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData(){}}),
    toDataURL(type){encodings.push([type,this.width,this.height]);return type+':'+this.width+'x'+this.height;}})};
  try{
    const result=captureAlbumViews(s);
    assert.deepEqual(renders,[
      {width:2048,height:1440,client:true,view:'threeQuarter',selected:false},
      {width:1536,height:1024,client:true,view:'front',selected:false}
    ]);
    assert.deepEqual(encodings,[['image/png',2048,1440],['image/png',1536,1024]]);
    assert.equal(result.hero,'image/png:2048x1440');assert.equal(result.detail,'image/png:1536x1024');
    assert.equal(s.width,540);assert.equal(s.height,360);assert.equal(s.client,false);
  }finally{globalThis.document=old;}
});

test('client album captures only its original hero when the second image is disabled',()=>{
  const s=mockScene(),old=globalThis.document,views=[];
  s.render=()=>{if(s.exportSize)views.push(s.clientView);};
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData(){}}),toDataURL:()=> 'original hero'})};
  try{
    assert.deepEqual(captureAlbumViews(s,{detail:false}),{hero:'original hero'});
    assert.deepEqual(views,['threeQuarter']);assert.equal(s.width,1000);assert.equal(s.client,false);
  }finally{globalThis.document=old;}
});
