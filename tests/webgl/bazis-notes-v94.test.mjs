import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const source = readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_4_NOTES_VERIFIED_ONE_CLICK.js',import.meta.url),'utf8');
const beforeMain = source.split('(function main() {')[0];
assert.ok(beforeMain.includes('function verifiedObjectNote'), 'Notes helpers must precede main()');
const sandbox = {require:createRequire(import.meta.url),process, console, UI:{dialogs:{ErrorBox:()=>{},MessageBox:()=>{}}}};
vm.createContext(sandbox);
vm.runInContext(beforeMain+'\nthis.testing = {normalizedNote,existingObjectNotes,verifiedObjectNote,projectBrief,importProject,saveHandoffText};',sandbox);
const {verifiedObjectNote,projectBrief,importProject,saveHandoffText}=sandbox.testing;
const order={
  project_name:'Кухня Лесная',
  project_note:'Проверить счётчики у стены',
  exported_at:'2026-10-09T17:50:00.000Z',
  items:[
    {name:'ПН-600 ДШ + СВЧ',source_file:'PN-600.fr3d',production_note:'Bosch HBG111, арт. 123, https://example.com/bosch.pdf'},
    {name:'НМ-600',source_file:'NM-600.fr3d',production_note:'Доступ к розетке'}
  ]
};

test('Model brief includes project, item names, appliance article, link and room notes',()=>{
  const text=projectBrief(order);
  for(const x of ['Кухня Лесная','Проверить счётчики','ПН-600','123','https://example.com/bosch.pdf','НМ-600','Доступ к розетке'])assert.ok(text.includes(x),x);
});

test('Native objectData setter preserves FR3D notes and verifies round-trip',()=>{
  sandbox.objectData={GetObjectNotes:obj=>obj.Notes,SetObjectNotes:(obj,v)=>{obj.Notes=v;}};
  const module={Notes:'Исходная заметка фрагмента'},log=[];
  const result=verifiedObjectNote(module,'MARTIN FOREST / СВЧ Bosch','ПН-600',log);
  assert.equal(result.verified,true);
  assert.ok(module.Notes.includes('Исходная заметка фрагмента'));
  assert.ok(module.Notes.includes('MARTIN FOREST / СВЧ Bosch'));
  assert.match(log.join('\n'),/ЗАМЕТКИ OK/);
  const again=verifiedObjectNote(module,'MARTIN FOREST / СВЧ Bosch','ПН-600',log);
  assert.equal(again.verified,true);
  assert.equal(module.Notes.split('MARTIN FOREST \/ СВЧ Bosch').length-1,1);
});

test('Documented obj.Notes fallback verifies when objectData is unavailable',()=>{
  delete sandbox.objectData;
  const obj={Notes:''},log=[];
  const result=verifiedObjectNote(obj,'Заметка конструктора','ПН-600',log);
  assert.equal(result.verified,true);
  assert.equal(obj.Notes,'Заметка конструктора');
});

test('Silent note write failure is caught and never counted as success',()=>{
  sandbox.objectData={GetObjectNotes:obj=>obj.Notes,SetObjectNotes:()=>{}};
  const obj=Object.defineProperty({},'Notes',{value:'',writable:false,configurable:false}),log=[];
  const result=verifiedObjectNote(obj,'Должна быть заметка','Модуль',log);
  assert.equal(result.verified,false);
  assert.ok(log.some(x=>x.startsWith('ЗАМЕТКИ НЕ ЗАПИСАНЫ:')));
});

test('Native import writes notes to both model and module without changing geometry',()=>{
  sandbox.objectData={GetObjectNotes:obj=>obj.Notes,SetObjectNotes:(obj,v)=>{obj.Notes=v;}};
  const root={Notes:''},objs=[];
  sandbox.currentFileData={model:root};
  sandbox.modelIOOperations={LoadFastenerOrFragment:(filename,model)=>{assert.equal(model,root);const obj={Name:'',Notes:''};objs.push(obj);return obj;}};
  sandbox.resizeAndPlace=()=>({frame:{},placementFrame:{}});
  sandbox.historyOperations={CommitCurrentChanges:()=>{}};
  const result=importProject({scan:{directories:2,files:2},entries:order.items.map(item=>({item,source:item.source_file}))},'/dummy',order);
  assert.equal(result.loaded,2);
  assert.equal(result.failed,0);
  assert.equal(result.notesRequested,3);
  assert.equal(result.notesVerified,3);
  assert.equal(result.modelNotesVerified,true);
  assert.ok(root.Notes.includes('Проверить счётчики'));
  assert.ok(root.Notes.includes('https://example.com/bosch.pdf'));
  assert.ok(objs[0].Notes.includes('https://example.com/bosch.pdf'));
  assert.ok(!objs[0].Notes.includes('Проверить счётчики')); // No clutter from global note on each module
  assert.ok(objs[1].Notes.includes('Доступ к розетке'));
});

test('UTF-8 TXT safety copy preserves Cyrillic and links',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'mf-v94-note-test-'));
  try {
    const json=path.join(directory,'Test.mf-bazis.json');
    const result={brief:projectBrief(order)};
    const filename=saveHandoffText(json,result);
    assert.ok(filename.endsWith('.mf-notes.txt'));
    const content=readFileSync(filename,'utf8');
    assert.ok(content.startsWith('\uFEFF'));
    assert.ok(content.includes('Проверить счётчики'));
    assert.ok(content.includes('https://example.com/bosch.pdf'));
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
