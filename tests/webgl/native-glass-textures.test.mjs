import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {VITRINE_VARIANTS} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {materialVisual} from '../../backend/v2/cabinet_assets/planner/material-visuals.mjs';
const source=fs.readFileSync(new URL('../../tools/bazis_import/Martin_Forest_Import_v9_7_ONE_CLICK_NOTES_GLASS_TEXTURES.js',import.meta.url),'utf8');
const bindings=JSON.parse(source.match(/const NATIVE_TEXTURE_BINDINGS = (.*);\n/)[1]);
const uid=Object.keys(bindings).find(k=>bindings[k].article==='LNEDS18D.302.W04');
const descriptor={...bindings[uid],variant_id:uid};
function context(options={}){
 const c=vm.createContext({console,process,require:n=>n==='path'?path.win32:n==='crypto'?{createHash:()=>({update:()=>({digest:()=>options.badHash?'bad':descriptor.sha256})})}:n==='fs'?{statSync:()=>({isFile:()=>true}),readFileSync:()=>Buffer.from('fixture')}:null,
 elasticTransformation:{GetObjectLocalSize:p=>p.size},historyOperations:{RegisterObjectChanging:()=>{}},
 objectTypeChecker:{ObjectIsPanel:p=>p.isPanel===true},
 materialData:{CreateMaterialData:(name,thickness)=>({name,thickness}),SetupObjectMaterial:(p,m,changeThickness)=>{assert.equal(changeThickness,false);p.MaterialName=m.name;p.assignments=(p.assignments||0)+1;if(options.databasePath)p.Material.Path=options.databasePath;}}});
 vm.runInContext(source.slice(0,source.lastIndexOf('(function main()')),c);return c;
}
function panel(Name,Thickness){return {Name,Thickness,isPanel:true,MaterialName:'Old donor',Material:{Path:'old.jpg'},Build(){this.builds=(this.builds||0)+1;}};}
function item(v){return {name:'Витрина',source_sha256:v.source_sha256,construction:{parts:[
 {role:'front',optical_material:'glass',material:{name:'Стекло 4 мм'},thickness:4},
 {role:'shelf',optical_material:'glass',material:{name:'Стекло 4 мм'},thickness:4},
 {role:'front',optical_material:'frame',material:{name:'Профиль Z1'},thickness:19},
 {role:'body',material:descriptor,thickness:18},
 {role:'back',material:descriptor,thickness:18}
 ]}};}
test('All 12 vitrines preserve native glass/shelf/Z1 and apply corpus texture',()=>{
 for(const variant of VITRINE_VARIANTS){
  const c=context(),input=item(variant),panels=[panel('Боковая стойка',18),panel('Стекло',4),panel('Полка',4),panel('Z1 стойка',19),panel('З.С',18),panel('Полка',18)];
  const root={AsList(){return this;},Count:panels.length,Objects:panels},log=[];
  c.applyProjectMaterials(root,input,log);
  for(const i of [1,2,3]){assert.equal(panels[i].assignments,undefined);assert.equal(panels[i].Material.Path,'old.jpg');}
  for(const i of [0,4,5]){assert.equal(panels[i].assignments,1);assert.equal(panels[i].Thickness,18);assert.equal(panels[i].Material.Path,'D:\\BAZIS MEBEL 25\\#_Текстуры материалов\\D.302 W04.png');}
  assert.equal(c.materialPalette(input).front,null);
 }
});
test('Thin HDF and regular shelves still receive their chosen materials',()=>{
 const c=context();assert.equal(c.panelMaterialKind('З.С',panel('З.С',4),{}),'hdf');
 assert.equal(c.panelMaterialKind('Полка',panel('Полка',4),{source_sha256:'unknown'}),'body');
 const p=panel('Полка',4);p.MaterialName='Стекло прозрачное\rGL4';assert.equal(c.panelMaterialKind(p.Name,p,{}),null);
});
test('Texture lookup requires exact variant, material and full article',()=>{
 const c=context();assert.ok(c.verifiedTexturePath(descriptor,[]));
 for(const patch of [{article:'LNEDS18D.302.BW'},{variant_id:'wrong'},{material_id:'wrong'},{name:'wrong'}])assert.equal(c.verifiedTexturePath({...descriptor,...patch},[]),'');
});
test('Changed texture file is refused and stale donor image is cleared',()=>{
 const c=context({badHash:true}),p=panel('Боковая стойка',18),log=[];
 c.applyProjectMaterials(p,item(VITRINE_VARIANTS[0]),log);
 assert.equal(p.Material.Path,'');assert.ok(log.some(s=>s.includes('файл изменился')));assert.equal(p.Thickness,18);
});
test('A texture newly resolved by BAZIS is retained without a verified file',()=>{
 const c=context(),p=panel('Корпус',18);p.Material.Path='database-new.jpg';
 c.setProjectTexture(p,{variant_id:'unmapped',name:'New',article:'NEW'},{name:'Old',texture:'old.jpg'},[]);
 assert.equal(p.Material.Path,'database-new.jpg');
});
test('User image keeps its status and aspect-ratio mapping in WebGL',()=>{
 const v=materialVisual({visual:{texture_url:'/account/planner/materials/user-abc.png',visual_status:'USER_TEXTURE',texture_size_mm:[803/804*1000,1000]}});
 assert.equal(v.status,'USER_TEXTURE');assert.ok(v.size[0]<v.size[1]);assert.equal(v.source,'texture');
});
