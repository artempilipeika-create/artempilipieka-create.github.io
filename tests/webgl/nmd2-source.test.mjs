import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const r=C.BASE_SOURCE_REVISION;
const audit=JSON.parse(fs.readFileSync(new URL('../fixtures/nmd2-600-20261024.json',import.meta.url)));
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const importer=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const ic=vm.createContext({require:createRequire(import.meta.url),console,process});
vm.runInContext(importer.slice(0,importer.lastIndexOf('(function main()')),ic);
const item=(patch={})=>({item_id:'nmd2',name:'Мой шкаф',module_type:'base_cabinet',bazis_id:r.id,bazis_sha256:r.previous,bazis_file:'НМД2-600..fr3d',bazis_resize:true,width:600,height:820,depth:510,base_height:100,body_height:720,base:'legs',layout:'doors',drawers:0,handles:'handles',x:125,z:350,rotation:90,rearServiceGapMm:50,production_note:'Сохранить заметку',...patch});
const template=it=>({production:C.PRODUCTION_MODELS[it.bazis_id]});

test('Reviewed source reproduces all nine original FR3D panel bounds',()=>{
 assert.equal(r.current,audit.source_sha256);assert.equal(r.file,audit.source_file);
 const it=C.normalizeKitchen(item({bazis_sha256:r.current,bazis_file:r.file})),p=template(it).production;
 assert.deepEqual(Object.values(p.native_defaults),audit.frame.size);
 const parts=C.productionParts(it,template(it));assert.equal(parts.length,9);
 const bounds=parts.map(p=>({lo:['x','y','z'].map((a,i)=>p.position[a]-p.size[a]/2+[it.width/2,0,it.depth/2][i]),size:Object.values(p.size)}));
 for(const expected of audit.panels)assert.ok(bounds.some(b=>b.lo.every((v,i)=>Math.abs(v-expected.lo[i])<1e-6)&&b.size.every((v,i)=>Math.abs(v-expected.size[i])<1e-6)),JSON.stringify(expected));
 const other=C.PRODUCTION_MODELS['bazis.0211e4f77fc4'];assert.equal(other.facade.clearance_mm,2);
});

test('Opening a saved base module preserves source identity and project choices',()=>{
 const original=item({width:800,depth:550,body_variant_id:'body',front_variant_id:'front',part_materials:{bottom:'custom'},shelves:[{id:'shelf-1',offset_mm:420,enabled:false}]});
 const revived=C.refreshBaseSource(original);
 assert.deepEqual(revived,original);
 assert.equal(original.bazis_sha256,r.previous);
 for(const sha of ['0'.repeat(64),'d79434c8d5e93744fcb37461491c9ec7560c1c78ad16d99a76ce7433fb9dfc80']){
  const unknown=item({bazis_sha256:sha});assert.equal(C.refreshBaseSource(unknown),unknown);
 }
 for(const id of ['bazis.0211e4f77fc4','bazis.facfa0cd038b','bazis.unknown']){
  const other=item({bazis_id:id});assert.equal(C.refreshBaseSource(other),other);
 }
 const ctx=vm.createContext({MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_UPPERS:globalThis.MF_UPPERS,MF_GOLA:globalThis.MF_GOLA});
 vm.runInContext(source.slice(source.indexOf('function inferTemplate('),source.indexOf('function legacyItem('))+'\n'+source.slice(source.indexOf('function refreshUpperSource('),source.indexOf('function scenePayload(){')),ctx);
 const saved=ctx.normalizeScene({room:{width:4200,depth:3200,height:2700},items:[original]}).items[0];
 for(const field of ['item_id','width','height','depth','x','z','rotation','production_note','body_variant_id','front_variant_id'])assert.equal(saved[field],original[field]);
 assert.equal(saved.bazis_sha256,original.bazis_sha256);assert.equal(saved.bazis_file,original.bazis_file);
});

test('Actual exporter leaves an already-open scene and source pins unchanged',async()=>{
 let blob;
 const original=item(),state={room:{width:4200,depth:3200,height:2700},items:[original]};
 const c=vm.createContext({MF_FURNITURE_CORE:globalThis.MF_FURNITURE_CORE,MF_PRODUCTION_NOTES:{validate:()=>'',moduleText:it=>it.production_note},state,templateFor:template,materials:new Map(),Blob,Date,JSON,Math,console,FACADE_GAP_MM:1.5,$:()=>({value:'НМД2 проверка'}),status:()=>{},setTimeout:()=>{},alert:m=>assert.fail(m),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:test'},revokeObjectURL(){}},document:{createElement:()=>({style:{},click(){},remove(){}}),body:{append(){}}}});
 vm.runInContext(source.slice(source.indexOf('function refreshUpperSource('),source.indexOf('function normalizeItem(')),c);
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),c);
 c.exportBazisProject();assert.ok(blob);const payload=JSON.parse(await blob.text()),out=payload.items[0];
 assert.equal(out.source_file,original.bazis_file);assert.equal(out.source_sha256,original.bazis_sha256);assert.equal(state.items[0],original);assert.equal(out.bazis_id,r.id);
 assert.deepEqual(out.source_default,{width:600,height:820,depth:510});assert.deepEqual(out.target,{width:600,height:820,depth:510});
 assert.equal(out.position.x,125);assert.equal(out.position.z,350);assert.equal(out.rotation,90);assert.equal(out.production_note,original.production_note);
 assert.equal(out.construction.parts.length,9);assert.equal(ic.nativeFrameProfile(out).rearInsetMm,0);
});

test('Standalone importer retains the known previous hash and rejects wrong FR3D bytes',()=>{
 const old={bazis_id:r.id,source_sha256:r.previous,source_file:'НМД2-600..fr3d',target:{width:800,height:820,depth:510},position:{x:100,z:350},production_note:'Не менять'},out=ic.canonicalBaseDonor(old);
 assert.deepEqual(JSON.parse(JSON.stringify(out)),old);
 assert.equal(ic.canonicalBaseDonor(out),out);
 const other={...old,bazis_id:'bazis.unknown'};assert.equal(ic.canonicalBaseDonor(other),other);
 const unknown={...old,source_sha256:'0'.repeat(64)};assert.equal(ic.canonicalBaseDonor(unknown),unknown);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mf-nmd2-'));
 try{
  fs.writeFileSync(path.join(root,r.file),'Wrong same-named FR3D');
  assert.throws(()=>ic.prepareProject({items:[old]},root),e=>e.message.includes(r.previous)&&e.message.includes(old.source_file)&&e.message.includes('Автозамена отключена'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
