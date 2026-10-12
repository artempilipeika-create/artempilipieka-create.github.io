import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectAutosave,fingerprint} from '../../backend/v2/cabinet_assets/planner/project-autosave.mjs';
const snap=(name='Кухня')=>({name,scene:{room:{width:4200},items:[],countertopSettings:{joint:'standard'}}});
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(send,extra={}){let saved=null,n=0;const e=new ProjectAutosave({snapshot:snap(),send,persist:(r,dirty)=>{saved=dirty?r:null;},uuid:()=>String(++n),...extra});return {e,record:()=>saved};}
test('fingerprint covers settings and ignores selection/camera/key ordering',()=>{
  const a=snap(),b=snap();b.scene.selected_item_id='x';b.scene.view_mode='2d';assert.equal(fingerprint(a),fingerprint(b));
  b.scene.countertopSettings.joint='euro';assert.notEqual(fingerprint(a),fingerprint(b));
  assert.equal(fingerprint(a),fingerprint({scene:a.scene,name:a.name}));
});
test('coalesces saves but does not lose an edit made during a request',async()=>{
  const first=defer(),calls=[];const {e,record}=setup(async(s,m,id)=>{calls.push({s,m,id});if(calls.length===1)await first.promise;return {project_id:'p',version:calls.length};});
  e.capture(snap('Первое'));const save=e.flush();e.capture(snap('Второе'));assert.equal(e.flush(),save);
  first.resolve();await save;assert.deepEqual(calls.map(c=>c.s.name),['Первое','Второе']);assert.equal(calls[1].m.version,1);assert.equal(e.meta.version,2);assert.equal(e.dirty,false);assert.equal(record(),null);
});
test('lost creation reply retries same request and payload after browser recovery',async()=>{
  const receipts=new Map(),calls=[];let dropped=true;
  const send=async(s,m,id)=>{calls.push({s,m,id});if(!receipts.has(id))receipts.set(id,{project_id:'only-project',version:receipts.size+1});if(dropped){dropped=false;throw Error('offline');}return receipts.get(id);};
  const first=setup(send);first.e.capture(snap('Отправлено'));await assert.rejects(first.e.flush());first.e.capture(snap('Правки без связи'));
  const recovery=setup(send,{record:first.record()});await recovery.e.flush();
  assert.equal(calls[0].id,calls[1].id);assert.equal(calls[1].s.name,'Отправлено');assert.equal(calls[2].s.name,'Правки без связи');assert.equal(calls[2].m.project_id,'only-project');assert.equal(recovery.e.dirty,false);
});
test('conflict keeps draft and never changes expected revision or silently retries',async()=>{
  let count=0;const {e,record}=setup(async()=>{count++;throw Object.assign(Error('PROJECT_3D_VERSION_CONFLICT'),{status:409});},{meta:{project_id:'p',version:2}});
  e.capture(snap('Локальный'));await assert.rejects(e.flush());await assert.rejects(e.flush());assert.equal(count,1);assert.equal(e.meta.version,2);assert.equal(record().snapshot.name,'Локальный');assert.equal(e.conflict,true);
});
test('old context acknowledges only its own captured project',async()=>{
  const response=defer(),acks=[];const a=setup(()=>response.promise,{meta:{project_id:'a',version:1},ack:r=>acks.push(r)}).e;
  a.capture(snap('A2'));const pending=a.flush();const b=setup(async()=>({project_id:'b',version:1})).e;b.capture(snap('B'));response.resolve({project_id:'a',version:2});await pending;
  assert.equal(b.meta,null);assert.equal(b.snapshot.name,'B');assert.equal(acks[0].project_id,'a');
});
test('local storage failure is visible, server save can still succeed',async()=>{
  const {e}=setup(async()=>({project_id:'p',version:1}),{persist:()=>{throw Error('quota');}});e.capture(snap('Правки'));assert.ok(e.localError);await e.flush();assert.equal(e.dirty,false);
});
test('definitive validation failure permits corrected payload with new request id',async()=>{
  const calls=[];const {e}=setup(async(s,m,id)=>{calls.push(id);if(calls.length===1)throw Object.assign(Error('invalid'),{status:422});return {project_id:'p',version:1};});
  e.capture(snap('Неверный'));await assert.rejects(e.flush());assert.equal(e.pending,null);e.capture(snap('Исправлен'));await e.flush();assert.notEqual(calls[0],calls[1]);
});
test('clean project and initial blank scene do not create redundant writes',async()=>{
  let calls=0;const {e}=setup(async()=>{calls++;return {project_id:'p',version:1};});await e.flush();assert.equal(calls,0);await e.flush(true);await e.flush(true);assert.equal(calls,1);
});
test('undo after a 422 clears its warning only when back at the acknowledged scene',async()=>{
  let calls=0;
  const {e,record}=setup(async()=>{calls++;throw Object.assign(Error('invalid'),{status:422});},{meta:{project_id:'p',version:4}});
  e.capture(snap('Неверный'));await assert.rejects(e.flush());
  e.capture(snap('Другие правки'));assert.ok(e.error);assert.equal(e.dirty,true);
  e.capture(snap());assert.equal(e.error,null);assert.equal(e.dirty,false);assert.equal(record(),null);
  await e.flush();assert.equal(calls,1);assert.equal(e.meta.version,4);
});
