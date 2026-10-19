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
