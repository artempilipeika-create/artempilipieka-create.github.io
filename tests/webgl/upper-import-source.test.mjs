import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js',import.meta.url),'utf8');
const c=vm.createContext({require:createRequire(import.meta.url),console,process});
vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);

test('Source resolver finds renamed exact bytes and rejects an older same-name donor',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mf-upper-source-'));
 try{
  const bytes=Buffer.from('verified corrected donor fixture'),sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const item={source_file:'ВМД2-600.(2).fr3d',source_sha256:sha};
  fs.writeFileSync(path.join(root,item.source_file),'different old donor');
  fs.mkdirSync(path.join(root,'nested'));
  const renamed=path.join(root,'nested','ВМД2-600..fr3d');fs.writeFileSync(renamed,bytes);
  assert.equal(c.prepareProject({items:[item]},root).entries[0].source,renamed);
  fs.unlinkSync(renamed);
  assert.throws(()=>c.prepareProject({items:[item]},root),e=>e.message.includes(sha)&&e.message.includes(root)&&e.message.includes('Найдено FR3D: 1'));
  const old={...item,source_sha256:'877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3'};
  assert.throws(()=>c.prepareProject({items:[old]},root),/повторно нажмите «Накладные ручки»/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Only two reviewed historical dryer SHA-256 values are remapped, then still verified',()=>{
 const revisions=[
  ['bazis.60f79b573cd1','ВМД1-600. отк P. (Сушка).fr3d','60f79b573cd1ae910e0f5ec2796798e4250e3c2e0a2df0f52372d528dace9005','64168cb3b82bd05c533c02bf4d95827feb75ec63ee99163a0fef60b5d97b9d6d'],
  ['bazis.1ac4fadd97b7','ВМД2-600.(Сушка).fr3d','1ac4fadd97b74ebaf1d52e9d37c5d3e8652857c9422032e64dd3d0671911a63b','91798c16d11b2f26e2126c9e6064b4deb737eb1d34394db6b815510a12fedba0']
 ];
 for(const [bazis_id,source_file,previous,current] of revisions){
  const input={bazis_id,source_file,source_sha256:previous,name:'Сохранённая сушка'};
  const canonical=c.canonicalUpperDonor(input);
  assert.equal(canonical.source_sha256,current);
  assert.equal(canonical.source_file,source_file);
  assert.equal(input.source_sha256,previous);
  assert.equal(c.nativeFrameProfile(canonical).rearInsetMm,3);
  assert.equal(c.canonicalUpperDonor({...input,source_sha256:'0'.repeat(64)}).source_sha256,'0'.repeat(64));
  assert.equal(c.canonicalUpperDonor({...input,bazis_id:'bazis.unknown'}),input);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mf-old-upper-'));
  try{
   fs.writeFileSync(path.join(root,source_file),'incorrect stale bytes');
   assert.throws(()=>c.prepareProject({items:[input]},root),e=>
    e.message.includes(current)&&e.message.includes('старый SHA экспорта')&&e.message.includes('Найдено FR3D: 1'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
