import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {materialVisual} from '../../backend/v2/cabinet_assets/planner/material-visuals.mjs';
const source=fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_7_ONE_CLICK_NOTES_GLASS_TEXTURES.js',import.meta.url),'utf8');
const bindings=JSON.parse(source.match(/const NATIVE_TEXTURE_BINDINGS = (.*);\r?\n/)[1]);
const registry=JSON.parse(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/materials/user-textures.json',import.meta.url),'utf8'));
test('All previous verified native bindings remain unchanged',()=>{
  const old=fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_6_ONE_CLICK_NOTES_GLASS_TEXTURES.js',import.meta.url),'utf8');
  for(const [id,r] of Object.entries(JSON.parse(old.match(/const NATIVE_TEXTURE_BINDINGS = (.*);\r?\n/)[1]))){
    if(r.sha256)assert.deepEqual(bindings[id],r);
    else{assert.match(bindings[id].sha256,/^[a-f0-9]{64}$/);assert.equal(bindings[id].relative_path,r.relative_path);}
  }
});
test('816 PO checks the original Windows file hash, never the smaller web preview',()=>{
  const [id,r]=Object.entries(bindings).find(([k,v])=>v.article==='816 PO');
  const lookup=hash=>{
    const context=vm.createContext({require:n=>n==='path'?path.win32:n==='crypto'?{createHash:()=>({update:()=>({digest:()=>hash})})}:n==='fs'?{statSync:()=>({isFile:()=>true,size:r.expected_size_bytes}),readFileSync:()=>Buffer.from('fixture')}:null});
    vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),context);
    return context.verifiedTexturePath({...r,variant_id:id},[]);
  };
  assert.equal(lookup(r.sha256),'D:\\BAZIS MEBEL 25\\#_Текстуры материалов\\Bayspan\\816 TM.jpg');
  assert.equal(lookup(registry.variants[id].image_sha256),'');
});
test('Sample photographs never tile onto surfaces or enter native texture bindings',()=>{
  for(const [id,v]of Object.entries(registry.variants).filter(([k,v])=>v.visual_status==='USER_PREVIEW')){
    const visual=materialVisual({visual:v});
    assert.equal(visual.status,'USER_PREVIEW');assert.equal(visual.url,null);assert.equal(visual.color,v.render_color);
    assert.equal(bindings[id],undefined);
  }
});
