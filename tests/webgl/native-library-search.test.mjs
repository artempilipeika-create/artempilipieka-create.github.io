import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const code=source.slice(0,source.lastIndexOf('(function main()'));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mf-library-'));
 const root=path.join(temp,'Общая папка'),app=path.join(temp,'settings');fs.mkdirSync(root);
 return {temp,root,app,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
}
function runtime(f,choices=[],extra={}){
 const prompts=[],messages=[];
 const c=vm.createContext({require:name=>name==='fs'&&extra.fs?extra.fs:require(name),process:{env:{LOCALAPPDATA:f.app},platform:process.platform},console:{log:m=>messages.push(m)},UI:{dialogs:{RunDirectorySelectDialog:(title,initial)=>{prompts.push({title,initial});return choices.shift()||'';},ErrorBox:m=>messages.push(m)}}});
 vm.runInContext(code,c);return {c,prompts,messages};
}
function donor(root,name='Модуль.fr3d',bytes='exact donor'){
 const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
 return {file,item:{source_file:path.basename(name),source_sha256:digest(bytes)}};
}

test('Published and packaged importer are byte-identical',()=>{
 assert.equal(source,fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_9_8_BLANKS.js',import.meta.url),'utf8'));
});
test('opens a numbered wardrobe export from Downloads and distinguishes upgrade, format and content errors',()=>{
 const f=fixture();
 try{
  const {c}=runtime(f);
  c.process.env.USERPROFILE=f.temp;
  const dir=path.join(f.temp,'Downloads');fs.mkdirSync(dir);
  const file=path.join(dir,'QA_AKS_27_17.11.2026.mf-bazis (4).json');
  const save=p=>fs.writeFileSync(file,'\uFEFF'+JSON.stringify(p));
  const item={source_file:'MF_Trim_Left.fr3d',wardrobe_trim:{kind:'left'},production_note:'Стык по антресоли'};
  const current={format:'martin-forest-bazis-native-v21',minimum_importer:'9.9.42',items:[item]};
  save(current);
  const loaded=c.loadProjectFile();assert.equal(loaded.filename,file);assert.equal(loaded.automatic,true);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.payload)),current);
  for(let v=2;v<=22;v++){
   const format='martin-forest-bazis-native-v'+v;save({format,items:[item]});assert.equal(c.loadProjectFile().payload.format,format);
  }
  for(const [patch,reason] of [
   [{format:'martin-forest-bazis-native-v22',minimum_importer:'9.9.100'},/нужен импортёр 9\.9\.100.+9\.9\.46/],
   [{minimum_importer:'10.0.0'},/нужен импортёр 10\.0\.0/],
   [{format:'martin-forest-bazis-native-v23'},/не поддерживает формат martin-forest-bazis-native-v23/],
   [{format:'other'},/другой тип файла/],[{items:[]},/нет деталей и модулей/],[{items:null},/отсутствует список/]
  ]){
   save({...current,...patch});assert.throws(()=>c.loadProjectFile(),e=>reason.test(e.message)&&e.message.includes(file));
  }
 }finally{f.cleanup();}
});

test('old Z1 exports retain both door IDs, all ten hinge joints and resolve only original native files',()=>{
 const f=fixture();
 try{
  const {c}=runtime(f);
  const oldFrame='e9fa21aa56315fb5f463793e812cbe0129da0b062b546f70c0b9901113cf174e';
  const oldHinge='aa1337ec405cb5a2301e4d54790554c737fb8bdb62a23febfb192c099c44762c';
  const catalog=JSON.parse(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/wardrobe-z1-data.json',import.meta.url)));
  const front=catalog.front,hinge=catalog.hinges.find(h=>h.article==='71T950A');
  const project={items:[]};
  for(const side of ['left','right']){
   project.items.push({source_file:front.source_file,source_sha256:oldFrame,wardrobe_z1_front:true,blank_item_id:side});
   for(let j=0;j<5;j++)project.items.push({source_file:hinge.file,source_sha256:oldHinge,wardrobe_z1_hinge:true,article:hinge.sku,finish:hinge.finish,host_blank_id:side+'-wall',joined_panel_id:side});
  }
  const saved=JSON.stringify(project);
  for(const [product,old] of [[front,oldFrame],[hinge,oldHinge]]){
   donor(f.root,'old/'+product.source_file,old);
   donor(f.root,'original/'+product.source_file,product.sha256);
  }
  // Model the reported hashes of real FR3Ds without publishing private workshop fragments in CI.
  c.sha256File=file=>fs.readFileSync(file,'utf8');
  const {entries}=c.prepareProject(project,f.root);
  assert.equal(entries.length,12);
  assert.deepEqual(Array.from(entries,(e,i)=>({...e.item,source_sha256:project.items[i].source_sha256})),project.items);
  for(const {item,source} of entries){
   assert.equal(path.dirname(source),path.join(f.root,'original'));
   assert.equal(item.source_sha256,item.wardrobe_z1_front?front.sha256:hinge.sha256);
  }
  assert.equal(JSON.stringify(project),saved);
  assert.equal(c.z1OriginalItem({...project.items[1],finish:'ONS'}).source_sha256,oldHinge);
  assert.equal(c.z1OriginalItem({source_sha256:oldFrame}).source_sha256,oldFrame);
  assert.equal(c.z1OriginalItem({...project.items[0],source_sha256:front.sha256}).source_sha256,front.sha256);
  fs.rmSync(path.join(f.root,'original'),{recursive:true});
  assert.throws(()=>c.prepareProject(project,f.root),/точный FR3D/);
 }finally{f.cleanup();}
});

test('First run chooses the common folder; later script instances remember it without prompting',()=>{
 const f=fixture();try{
  const d=donor(f.root,'Нижние/Ящики/Корпус.FR3D'),before=fs.readFileSync(d.file),{c,prompts}=runtime(f,[f.root]);
  const p=c.prepareProjectWithLibrary({items:[d.item]});assert.equal(p.root,f.root);assert.equal(p.prepared.entries[0].source,d.file);assert.equal(prompts.length,1);
  assert.match(prompts[0].title,/ОБЩУЮ папку/);
  const saved=JSON.parse(fs.readFileSync(path.join(f.app,'MartinForest','bazis-import-settings.json'),'utf8'));assert.equal(saved.libraryRoot,f.root);
  const next=runtime(f);assert.equal(next.c.libraryRoot(),f.root);assert.equal(next.prompts.length,0);assert.deepEqual(fs.readFileSync(d.file),before);
  assert.deepEqual(fs.readdirSync(f.root),['Нижние']);
 }finally{f.cleanup();}
});
test('Moving the whole library triggers re-selection and updates only the per-user preference',()=>{
 const f=fixture();try{
  const first=runtime(f,[f.root]);first.c.libraryRoot();const moved=path.join(f.temp,'Библиотека на новом месте');fs.renameSync(f.root,moved);
  const next=runtime(f,[moved]);assert.equal(next.c.libraryRoot(),moved);assert.equal(next.prompts.length,1);assert.equal(next.c.savedLibraryRoot(),moved);
 }finally{f.cleanup();}
});
test('A still-existing narrow folder can be replaced by its common parent when another donor is missing',()=>{
 const f=fixture();try{
  const a=donor(f.root,'Нижние/А.fr3d','A'),b=donor(f.root,'Верхние/Б.fr3d','B'),{c,prompts}=runtime(f,[path.dirname(a.file),f.root]);
  const payload={items:[a.item,b.item]},before=JSON.stringify(payload),p=c.prepareProjectWithLibrary(payload);
  assert.equal(p.root,f.root);assert.equal(p.prepared.entries.length,2);assert.equal(prompts.length,2);assert.equal(c.savedLibraryRoot(),f.root);assert.equal(JSON.stringify(payload),before);
 }finally{f.cleanup();}
});
test('Cancellation at first selection or at missing-source recovery leaves the model untouched',()=>{
 const f=fixture();try{
  const {c}=runtime(f,['']);assert.equal(c.prepareProjectWithLibrary({items:[{source_file:'missing.fr3d',source_sha256:'a'.repeat(64)}]}),null);
  const recovery=runtime(f,[f.root,'']);assert.equal(recovery.c.prepareProjectWithLibrary({items:[{source_file:'missing.fr3d',source_sha256:'a'.repeat(64)}]}),null);
  let loads=0;c.loadProjectFile=()=>({filename:'/synthetic.json',payload:{items:[{source_file:'missing.fr3d'}]}});c.projectBrief=()=>'';c.saveHandoffText=()=>'';c.assertEmptyTestModel=()=>{};c.importProject=()=>{loads++;};
  vm.runInContext(source.slice(source.lastIndexOf('(function main()')),c);assert.equal(loads,0);
 }finally{f.cleanup();}
});
test('Invalid or corrupt settings recover via selection; choosing a file fails without overwriting settings',()=>{
 const f=fixture();try{
  const {c}=runtime(f,[f.root]);const settings=c.librarySettingsFile();fs.mkdirSync(path.dirname(settings),{recursive:true});fs.writeFileSync(settings,'{broken');assert.equal(c.libraryRoot(),f.root);
  const original=fs.readFileSync(settings),d=donor(f.root),next=runtime(f,[d.file]);assert.throws(()=>next.c.libraryRoot(true),/Папка недоступна/);assert.deepEqual(fs.readFileSync(settings),original);
 }finally{f.cleanup();}
});
test('An unwritable preference folder does not block a valid import or write into the source library',()=>{
 const f=fixture();try{
  fs.writeFileSync(f.app,'not a directory');const d=donor(f.root),r=runtime(f,[f.root]);assert.equal(r.c.prepareProjectWithLibrary({items:[d.item]}).prepared.entries[0].source,d.file);assert.ok(r.messages.some(m=>m.includes('ПАПКА НЕ ЗАПОМНЕНА')));assert.deepEqual(fs.readdirSync(f.root),['Модуль.fr3d']);
 }finally{f.cleanup();}
});
test('Deep nesting, Cyrillic, uppercase extensions, old full paths and renamed files keep exact source bytes',()=>{
 const f=fixture();try{
  const deep=Array.from({length:40},(_,i)=>'п'+i).join('/'),d=donor(f.root,deep+'/Новое имя.FR3D'),r=runtime(f);const original={source_file:'D:\\старое место\\шкаф.fr3d',source_sha256:d.item.source_sha256};
  const prepared=r.c.prepareProject({items:[original]},f.root);assert.equal(prepared.entries[0].source,d.file);assert.equal(prepared.scan.directories,41);assert.equal(r.c.normalizeSourceName('D:\\old\\МОДУЛЬ (2).FR3D'),'модуль.fr3d');
 }finally{f.cleanup();}
});
test('Directory links are searched, cycles and duplicate aliases terminate, broken links are reported',()=>{
 const f=fixture();try{
  const target=path.join(f.temp,'linked-library');fs.mkdirSync(target);const d=donor(target);
  fs.symlinkSync(target,path.join(f.root,'Ссылка'),'junction');fs.symlinkSync(f.root,path.join(target,'Цикл'),'junction');fs.symlinkSync(target,path.join(f.root,'Дубликат'),'junction');fs.symlinkSync(path.join(f.temp,'missing'),path.join(f.root,'Сломанная'),'junction');
  const r=runtime(f),scan=r.c.collectSourceFiles(f.root);assert.equal(scan.files.length,1);assert.equal(scan.directories,2);assert.equal(scan.unreadable.length,1);assert.ok(r.c.resolveSourceFile(f.root,d.item,scan));
 }finally{f.cleanup();}
});
test('Unreadable folders are explained separately from missing files, with no silent partial search',()=>{
 const f=fixture();try{
  const d=donor(f.root,'Закрыто/Модуль.fr3d');const wrapped=Object.create(fs);wrapped.readdirSync=(dir,...args)=>{if(dir===path.dirname(d.file))throw Object.assign(Error('blocked'),{code:'EACCES'});return fs.readdirSync(dir,...args);};
  const {c}=runtime(f,[],{fs:wrapped});assert.throws(()=>c.prepareProject({items:[d.item]},f.root),e=>e.code==='MF_LIBRARY_SOURCES_MISSING'&&e.message.includes('EACCES')&&e.message.includes('Закрыто'));
 }finally{f.cleanup();}
});
test('Different same-named legacy donors are never selected at random; identical copies remain usable',()=>{
 const f=fixture();try{
  const a=donor(f.root,'А/Шкаф.fr3d','A'),b=donor(f.root,'Б/Шкаф.fr3d','B'),{c}=runtime(f);
  assert.throws(()=>c.prepareProject({items:[{source_file:'Шкаф.fr3d'}]},f.root),/несколько разных/);
  assert.equal(c.prepareProject({items:[a.item]},f.root).entries[0].source,a.file);
  fs.writeFileSync(b.file,'A');assert.equal(c.prepareProject({items:[{source_file:'Шкаф.fr3d'}]},f.root).entries.length,1);
 }finally{f.cleanup();}
});
test('A path in the export cannot make the resolver read files outside the selected search tree',()=>{
 const f=fixture();try{
  const d=donor(f.temp,'outside.fr3d'),{c}=runtime(f);assert.equal(c.resolveSourceFile(f.root,{...d.item,source_file:'../outside.fr3d'},c.collectSourceFiles(f.root)),'');
 }finally{f.cleanup();}
});
test('Repeated project items hash each candidate only once per scan',()=>{
 const f=fixture();try{
  donor(f.root,'old.fr3d','old');const d=donor(f.root,'new.fr3d','exact');let reads=0;const wrapped=Object.create(fs);wrapped.readFileSync=(file,...args)=>{if(String(file).endsWith('.fr3d'))reads++;return fs.readFileSync(file,...args);};
  const {c}=runtime(f,[],{fs:wrapped});const item={...d.item,source_file:'renamed.fr3d'};assert.equal(c.prepareProject({items:[item,item,item]},f.root).entries.length,3);assert.ok(reads<=2);
 }finally{f.cleanup();}
});

test('Add a separate donor folder without losing the original library and reuse both after restart',()=>{
 const f=fixture();try{
  const a=donor(f.root,'Нижние/Корпус.fr3d','original');
  donor(f.root,'Верхние/ВМУД1L-1000.ГЛ-340мм.fr3d','previous revision');
  const second=path.join(f.temp,'Новые модули'),b=donor(second,'Верхние/ВМУД1L-1000.ГЛ-340мм.fr3d','corrected');
  const payload={items:[a.item,{...b.item,source_file:'ВМУД1L-1000.ГЛ-340мм(1).fr3d'}]};
  const first=runtime(f,[f.root,second]);const imported=first.c.prepareProjectWithLibrary(payload);
  assert.deepEqual(Array.from(imported.prepared.entries,e=>e.source),[a.file,b.file]);
  const again=runtime(f);assert.equal(again.c.prepareProjectWithLibrary(payload).prepared.entries.length,2);
  assert.equal(again.prompts.length,0);
 }finally{f.cleanup();}
});
test('A repeat selection rescans when the requested FR3D was just added to the same folder',()=>{
 const f=fixture();try{
  const {c}=runtime(f,[f.root]);c.libraryRoot();const content='just copied',name='Новый.fr3d';
  c.UI.dialogs.RunDirectorySelectDialog=()=>{donor(f.root,name,content);return f.root;};
  assert.equal(c.prepareProjectWithLibrary({items:[{source_file:name,source_sha256:digest(content)}]}).prepared.entries.length,1);
 }finally{f.cleanup();}
});
