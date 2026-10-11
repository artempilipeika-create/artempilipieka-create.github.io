import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_6_ONE_CLICK_NOTES_GLASS_TEXTURES.js',import.meta.url),'utf8');
const bindings=JSON.parse(source.match(/const NATIVE_TEXTURE_BINDINGS = (.*);\n/)[1]);
function lookup(article,size=5869384){
 const [id,record]=Object.entries(bindings).find(([k,v])=>v.article===article),descriptor={...record,variant_id:id};
 const c=vm.createContext({console,process,require:n=>n==='path'?path.win32:n==='fs'?{statSync:()=>({isFile:()=>true,size}),readFileSync:()=>Buffer.from('local file')}:n==='crypto'?{createHash:()=>({update:()=>({digest:()=> 'a'.repeat(64)})})}:null});
 vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);const log=[];
 return {result:c.verifiedTexturePath(descriptor,log),descriptor,log};
}
test('User-confirmed 816 TM image applies to both full identities without changing article',()=>{
 for(const article of ['816 PO','816 TM']){
  const r=lookup(article);assert.equal(r.result,'D:\\BAZIS MEBEL 25\\#_Текстуры материалов\\Bayspan\\816 TM.jpg');assert.equal(r.descriptor.article,article);
  assert.ok(r.log.some(line=>line.includes('ПОДТВЕРЖДЁННОМУ ПУТИ')));
 }
});
test('The explicit alias refuses a file with a changed size',()=>{assert.equal(lookup('816 PO',1).result,'');});
test('Every existing verified native binding remains byte-identical',()=>{
 const old=fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_5_ONE_CLICK_NOTES_GLASS_TEXTURES.js',import.meta.url),'utf8');
 for(const [id,r]of Object.entries(JSON.parse(old.match(/const NATIVE_TEXTURE_BINDINGS = (.*);\n/)[1])))assert.deepEqual(bindings[id],r);
});
