import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const parse=path=>readFileSync(new URL(path,import.meta.url),'utf8');
import * as C from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {MeshFactory} from '../../backend/v2/cabinet_assets/planner/module-mesh.mjs';
await import('../../backend/v2/cabinet_assets/planner/production-notes.js');
const brief=globalThis.MF_PRODUCTION_NOTES;
const v=C.APPLIANCE_TALL_VARIANTS.find(v=>v.microwave),p=C.PRODUCTION_MODELS[v.id];
const oven={item_id:'t1',name:'ПН-600',bazis_id:v.id,bazis_sha256:p.source_sha256,module_type:'tall_cabinet',width:600,height:v.native_height,depth:600,body_height:v.native_height-100,base_height:100,base:'plinth',worktop_thickness:0,x:0,z:0,rotation:0};
test('default PН-600 provides two explicit unresolved standard mounting niches',()=>{
  assert.equal(brief.validate({items:[oven]}),'');
  const note=brief.projectText({items:[oven]});
  assert.match(note,/564 × 595/);
  assert.match(note,/564 × 380/);
  assert.match(note,/Модель и монтажную схему уточнить до производства/);
});
test('specific appliance model and link are included in production and BAZIS notes',()=>{
  const item={...oven,production_note:'Проверить вентиляцию и вывод розетки',appliance_details:{
    oven:{mode:'model',manufacturer:'Bosch',model:'HBG123',article:'A-321',documentation_url:'https://example.com/install.pdf'},
    microwave:{mode:'model',manufacturer:'NEFF',model:'MIX-8',article:'M-99',documentation_url:'https://example.com/micro.pdf'},
    remarks:'Схема прилагается'}};
  const project={production_note:'Шкаф у окна проверить по месту',items:[item]};
  assert.equal(brief.validate(project),'');
  const text=brief.projectText(project);
  for(const expected of ['ПН-600','Bosch','HBG123','A-321','https://example.com/install.pdf','NEFF','M-99',
    'Проверить вентиляцию','Шкаф у окна'])assert.ok(text.includes(expected),expected);
});
test('specific equipment requires a model or article and HTTP(S) documentation only',()=>{
  const a={...oven,appliance_details:{oven:{mode:'model',documentation_url:'https://example.com'}}};
  assert.match(brief.validate({items:[a]}),/модель или артикул/);
  a.appliance_details.oven.article='ART-123';
  a.appliance_details.oven.documentation_url='javascript:alert(1)';
  assert.match(brief.validate({items:[a]}),/https:\/\//);
  a.appliance_details.oven.documentation_url='https://example.com/tech.pdf';
  assert.equal(brief.validate({items:[a]}),'');
});
test('free notes on ordinary modules and empty project are supported',()=>{
  assert.equal(brief.projectText({items:[]}), '');
  assert.match(brief.projectText({items:[{name:'Нижний шкаф',production_note:'Угол по факту'}]}), /Угол по факту/);
});
test('native BAZIS script writes per-object notes without replacing old notes',()=>{
  const code=parse('../../tools/bazis_import/Martin_Forest_Import_native_v9_3_ONE_CLICK.js');
  assert.match(code,/objectData\.GetObjectNotes/);
  assert.match(code,/objectData\.SetObjectNotes/);
  assert.match(code,/existing, incoming/);
  assert.match(code,/writeProductionNote\(obj, item, projectNote, log\)/);
});
test('visual-only faceplate changes do not change production niche heights',()=>{
  const template=()=>({production:p}),before=structuredClone(oven),parts=C.productionParts(oven,template());
  const factory=new MeshFactory({room:{width:4200,depth:3200,height:3000},material:()=>null,template},()=>{});
  const mesh=factory.build(oven);
  for(const mode of ['inspection','facadesHidden','normal'])factory.updateAppearance(mesh,oven,mode);
  assert.deepEqual(oven,before);assert.deepEqual(C.productionParts(oven,template()),parts);
  assert.match(brief.moduleText(oven),/564 × 595/);assert.match(brief.moduleText(oven),/564 × 380/);
  factory.release(mesh);factory.dispose();
  const code=parse('../../backend/v2/cabinet_assets/3d.js');
  assert.match(code,/project_note:state\.production_note/);
  assert.match(code,/production_note:globalThis\.MF_PRODUCTION_NOTES\?\.moduleText\(it\)/);
});
