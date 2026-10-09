import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const parse=path=>readFileSync(new URL(path,import.meta.url),'utf8');
globalThis.MF_FURNITURE_CORE={tallVariantInfo:item=>item?.appliancePenal?{family:'appliance',microwave:Boolean(item.microwave)}:null};
await import('../../backend/v2/cabinet_assets/planner/production-notes.js');
const brief=globalThis.MF_PRODUCTION_NOTES;
const oven={item_id:'t1',name:'ПН-600',appliancePenal:true,microwave:true};
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
  const mesh=parse('../../backend/v2/cabinet_assets/planner/module-mesh.mjs');
  assert.match(mesh,/const extension=a\.microwave\?9\.5:0/);
  assert.match(mesh,/visualOnly=true/);
  const code=parse('../../backend/v2/cabinet_assets/3d.js');
  assert.match(code,/project_note:state\.production_note/);
  assert.match(code,/production_note:globalThis\.MF_PRODUCTION_NOTES\?\.moduleText\(it\)/);
});
