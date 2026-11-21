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
  for(let v=2;v<=23;v++){
   const format='martin-forest-bazis-native-v'+v;save({format,items:[item]});assert.equal(c.loadProjectFile().payload.format,format);
  }
  for(const [patch,reason] of [
   [{format:'martin-forest-bazis-native-v22',minimum_importer:'9.9.100'},/нужен импортёр 9\.9\.100.+9\.9\.47/],
   [{minimum_importer:'10.0.0'},/нужен импортёр 10\.0\.0/],
   [{format:'martin-forest-bazis-native-v24'},/не поддерживает формат martin-forest-bazis-native-v24/],
   [{format:'other'},/другой тип файла/],[{items:[]},/нет деталей и модулей/],[{items:null},/отсутствует список/]
  ]){
   save({...current,...patch});assert.throws(()=>c.loadProjectFile(),e=>reason.test(e.message)&&e.message.includes(file));
  }
 }finally{f.cleanup();}
});

test('both generations of saved Z1 assemblies resolve to separate, byte-pinned parts at every original axis',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/wardrobe-z1-data.json',import.meta.url)));
 const front=catalog.front,hinge=catalog.hinges.find(h=>h.article==='71T950A'),plate=catalog.plates.find(p=>p.article==='175H3100');
 const oldFront='e9fa21aa56315fb5f463793e812cbe0129da0b062b546f70c0b9901113cf174e';
 const oldSets=['aa1337ec405cb5a2301e4d54790554c737fb8bdb62a23febfb192c099c44762c','2589520907b8c8a1a178226390cf70ff6d576cc9f2024252da1cdb8e43b2dcf9'];
 const f=fixture();
 try{
  const {c}=runtime(f);c.sha256File=file=>fs.readFileSync(file,'utf8');
  for(const p of [front,hinge,plate])donor(f.root,'original/'+p.source_file,p.sha256);
  for(const old of oldSets){
   donor(f.root,'old/'+old+'.fr3d',old);
   const project={items:[]};
   for(const side of ['left','right']){
    project.items.push({source_file:front.source_file,source_sha256:oldFront,wardrobe_z1_front:true,blank_item_id:side});
    for(let j=0;j<5;j++)project.items.push({source_file:'old.fr3d',source_sha256:old,wardrobe_z1_hinge:true,article:hinge.sku,finish:hinge.finish,
     host_blank_id:side+'-wall',joined_panel_id:side,door_side:side,position:{x:0,y:100+150*j,z:280},rotation:90});
   }
   const saved=JSON.stringify(project);const {entries}=c.prepareProject(project,f.root);assert.equal(entries.length,22);
   const components=Array.from(entries,e=>e.item).filter(e=>e.wardrobe_blum_part);
   assert.equal(components.length,20);
   for(let n=0;n<20;n+=2){
    const [h,p]=components.slice(n,n+2);assert.equal(h.source_sha256,hinge.sha);assert.equal(p.source_sha256,plate.sha);
    assert.deepEqual(h.position,p.position);assert.equal(h.mount_blank_id,h.joined_panel_id);assert.equal(p.mount_blank_id,h.host_blank_id);
   }
   assert.equal(JSON.stringify(project),saved);assert.ok(entries.every(e=>path.dirname(e.source)===path.join(f.root,'original')));
   assert.throws(()=>c.separateBlumItems([components[0]]),/одна выбранная/);
   assert.throws(()=>c.separateBlumItems([components[1],components[0],components[1]]),/Повторная/);
   assert.throws(()=>c.separateBlumItems([{...components[0],finish:'ONS'},components[1]]),/отделка/);
  }
  const native={source_sha256:oldFront};assert.equal(c.z1OriginalItem(native).source_sha256,oldFront);
 }finally{f.cleanup();}
});

test('a native failure loading the plate removes the hinge at that point',()=>{
 const f=fixture();try{const {c}=runtime(f);const objects=[],removed=[];
 c.asList=()=>({IndexOf:()=>0});c.placeByFrame=()=>{};
 c.loadWardrobeFragment=(file)=>{if(file==='plate')throw Error('CAD load failed');const ob={};objects.push(ob);return ob;};
 c.objects3d={DeleteObject:obj=>removed.push(obj)};
 assert.throws(()=>c.loadBlumPair([{item:{name:'hinge'},source:'hinge'},{item:{name:'plate'},source:'plate'}],{},[]),/CAD load failed/);
 assert.deepEqual(removed,objects);
 }finally{f.cleanup();}
});

test('native plate and hinge transforms put the pilots into their actual boards for either side and each room rotation',()=>{
 const f=fixture();try{
  const {c}=runtime(f);const catalog=JSON.parse(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/wardrobe-z1-data.json',import.meta.url)));
  const rot=(v,axis,degrees)=>{const a=degrees*Math.PI/180,co=Math.cos(a),si=Math.sin(a),{x,y,z}=v;
   return axis.x?{x,y:y*co-z*si,z:y*si+z*co}:axis.y?{x:x*co+z*si,y,z:-x*si+z*co}:{x:x*co-y*si,y:x*si+y*co,z};};
  c.objectTransformation={RotateObject(obj,axis,deg){obj.rotations.push([axis,deg]);}};
  for(const product of [catalog.hinges[0],...catalog.plates])for(const side of ['left','right'])for(const rotation of [0,90,180,270]){
   const role=product.shape?'plate':'hinge',sign=side==='left'?1:-1,position={x:427,y:183,z:519};
   const item={source_sha256:product.sha,article:product.sku,finish:product.finish,wardrobe_blum_part:role,
    wardrobe_z1_hinge:role==='hinge',door_side:side,rotation,position};
   const obj={rotations:[],PositionX:0,PositionY:0,PositionZ:0,SetDefaultTransform(){},
    ToGlobal(v){let q=v;for(const [a,d] of this.rotations)q=rot(q,a,d);return {x:q.x+this.PositionX,y:q.y+this.PositionY,z:q.z+this.PositionZ};}};
   c.placeByFrame(obj,null,item,[],{x:0,y:0,z:0});
   const samples=product.shape?product.pilots.map(([depth,height])=>({local:{x:depth,y:height,z:-10},expected:{x:-10*sign,y:height*sign,z:-depth}})):
     [{local:{x:-10,y:6.5,z:0},expected:{x:6.5*sign,y:0,z:10}}];
   for(const {local,expected} of samples){
    const dx=rot(expected,{y:1},-rotation),out=obj.ToGlobal(local);
    for(const a of ['x','y','z'])assert.ok(Math.abs(out[a]-position[a]-dx[a])<.001);
   }
  }
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
