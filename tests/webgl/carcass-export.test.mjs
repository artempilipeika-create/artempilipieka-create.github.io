import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CARCASSES,CARCASS_BACK_MATERIAL_ID,buildCarcass,placeCarcass} from '../../backend/v2/cabinet_assets/planner/carcass-model.mjs';
import '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import '../../backend/v2/cabinet_assets/planner/blanks-native.mjs';
const core=globalThis.MF_FURNITURE_CORE,source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/3d.js',import.meta.url),'utf8');
const materials=new Map([
 [core.DEFAULT_MATERIALS.body_variant_id,{variant_id:core.DEFAULT_MATERIALS.body_variant_id,name:'ЛДСП BYSPAN 18мм Белый 605 PO',article:'605 PO',thickness:18}],
 [CARCASS_BACK_MATERIAL_ID,{variant_id:CARCASS_BACK_MATERIAL_ID,name:'ЛХДФ 3ММ Белый, 2800х2070 мм',article:null,thickness:3}],
 ['custom',{variant_id:'custom',name:'Материал заказчика',article:'CUSTOM',thickness:18}]
]);
function exporter(items){
 let blob=null,message='',filename='';const button={disabled:false,value:'Carcass QA'};
 const state={items,room:{width:6000,depth:4000,height:3000},plinths:[],wallPanels:[]};
 const context=vm.createContext({state,materials,MF_FURNITURE_CORE:core,MF_BLANKS_NATIVE:globalThis.MF_BLANKS_NATIVE,templateFor:()=>null,
 api:async()=>({roles:['admin']}),MF_CONSTRUCTOR_ACCESS:{apply:()=>true},Blob,Date,JSON,Math,FACADE_GAP_MM:1.5,$:()=>button,hydrateMaterials:async()=>{},status:s=>message=s,setTimeout:()=>{},
 alert:s=>assert.fail(s),confirm:()=>true,URL:{createObjectURL:b=>{blob=b;return 'blob:qa';},revokeObjectURL(){}},
 document:{body:{append(){}},createElement:()=>({style:{},click(){filename=this.download;},remove(){}})}});
 vm.runInContext(source.slice(source.indexOf('function exportSafeName('),source.indexOf('async function toOrder(')),context);
 return {context,button,result:async()=>({payload:blob?JSON.parse(await blob.text()):null,message,filename})};
}
test('export rechecks the account and refuses client or expired sessions before creating any file',async()=>{
 for(const expired of [false,true]){
  const e=exporter([]);let checked=0;
  e.context.api=async()=>{checked++;if(expired)throw Error('Сессия завершена');return {roles:['client']};};
  e.context.MF_CONSTRUCTOR_ACCESS={apply:()=>false};
  await e.context.exportBazisProjectReady();const r=await e.result();
  assert.equal(checked,1);assert.equal(r.payload,null);assert.equal(e.button.disabled,false);assert.ok(r.message);
 }
});
for(const recipe of CARCASSES)test('full download export: '+recipe.id,async()=>{
 const b=buildCarcass({recipe:recipe.id},{bodyMaterialId:core.DEFAULT_MATERIALS.body_variant_id,backMaterialId:CARCASS_BACK_MATERIAL_ID,edges:{left:'1011'}});
 const items=placeCarcass(b,{x:200,z:300,elevation_mm:100,rotation:90});items[0].body_variant_id='custom';
 const before=JSON.stringify(items),e=exporter(items);await e.context.exportBazisProjectReady();const {payload,message,filename}=await e.result();
 const supports=recipe.sections*recipe.shelves*4;
 const vertical=recipe.id==='divided'?4:0;
 assert.equal(payload.minimum_importer,vertical?'9.9.20':supports?'9.9.17':'9.9.9');assert.equal(payload.items.length,items.length+supports+vertical);
 assert.equal(payload.items.filter(p=>p.article==='95388').length,supports);assert.equal(filename,'Carcass_QA.mf-bazis.json');
 assert.match(message,new RegExp('деталей корпуса: '+items.length));assert.equal(e.button.disabled,false);
 assert.equal(payload.items[0].material_assignments.body.article,'CUSTOM');assert.equal(payload.items[0].blank.edge_code,'1011');
 for(let i=0;i<items.length;i++){
  const out=payload.items[i],part=items[i];assert.equal(out.index,i+1);assert.equal(out.rotation,90);
  assert.deepEqual(out.position,{x:part.x,y:part.elevation_mm,z:part.z});
  assert.deepEqual(out.target,{width:part.width,height:part.height,depth:part.depth});
  assert.equal(out.material_assignments.body.thickness,part.blank_thickness_mm);assert.equal(out.source_sha256.length,64);
 }
 assert.equal(JSON.stringify(items),before,'export must not mutate saved materials, PVC or source data');
});
test('missing or wrong HDF assignment blocks the download with the named panel',async()=>{
 for(const id of [null,core.DEFAULT_MATERIALS.body_variant_id]){
  const b=buildCarcass({recipe:'shelves'},{bodyMaterialId:core.DEFAULT_MATERIALS.body_variant_id,backMaterialId:id});
  const e=exporter(b.items);await e.context.exportBazisProjectReady();const r=await e.result();
  assert.equal(r.payload,null);assert.match(r.message,/Задняя стенка ХДФ 3 мм: выберите материал толщиной 3 мм/);assert.equal(e.button.disabled,false);
 }
});

test('shared divider seats, drilling separation, legacy shelves and disabled fixings',()=>{
 for(const rotation of [0,90,180,270]){
  const built=buildCarcass({recipe:'divided',shelves:1},{idPrefix:'probe'});
  const items=placeCarcass(built,{x:65,z:34,elevation_mm:120,rotation});
  for(const it of items)if(it.blank_binding)delete it.blank_binding.mounting;
  const supports=globalThis.MF_BLANKS_NATIVE.supportItems(items);
  assert.equal(supports.length,8);
  const shared=supports.filter(x=>x.host_blank_id==='probe:divider-0');
  assert.equal(shared.length,4);
  for(const a of shared){
   const shelf=items.find(i=>i.item_id===a.shelf_blank_id);
   assert.equal(a.position.y,shelf.elevation_mm);
   const others=shared.filter(b=>a.rotation!==b.rotation);
   for(const b of others){
    const axis=[0,180].includes(rotation)?'z':'x';
    assert.ok(Math.abs(a.position[axis]-b.position[axis])>5);
   }
  }
  const shelf=items.find(i=>i.item_id==='probe:shelf-0-0');
  shelf.blank_binding.mounting='none';assert.equal(globalThis.MF_BLANKS_NATIVE.supportItems(items).length,4);
  delete shelf.blank_binding.mounting;
  const host=items.find(i=>i.item_id==='probe:left');host.width=10;
  const inward={0:[4,0],90:[0,4],180:[-4,0],270:[0,-4]}[rotation];host.x+=inward[0];host.z+=inward[1];
  assert.throws(()=>globalThis.MF_BLANKS_NATIVE.supportItems(items),/12 мм/);
 }
});

test('downloads one pinned native trim per assembly and a separately grouped upper cabinet at every rotation',async()=>{
 const id='wardrobe:entrance',name='Шкаф у окна';
 const surround={left:{kind:'filler',width:114,heightMode:'custom',height:2013,bottom:42},
  right:{kind:'end',depth:142,projection:20},cap:{length:1000,height:94},
  upper:{height:410,leaves:2,opening:'swing',side:'left',divider:true}};
 for(const rotation of [0,90,180,270]){
  const b=buildCarcass({width:1000,height:2000,depth:550,recipe:'shelves',surround},
   {idPrefix:id,name,frontMaterialId:'custom',bodyMaterialId:core.DEFAULT_MATERIALS.body_variant_id,backMaterialId:CARCASS_BACK_MATERIAL_ID});
  const items=placeCarcass(b,{x:500,z:760,elevation_mm:100,rotation})
   .map(it=>({...it,assistant_carcass:{group_id:id,name,spec:b.spec}}));
  const part=key=>items.find(it=>it.item_id===id+':'+key);
  part('trim-left-return').production_note='Подписать стену А';
  part('mezz-door-left').production_note='Сохранить направление';
  const e=exporter(items);await e.context.exportBazisProjectReady();
  const {payload,message}=await e.result();
  assert.ok(payload,message);
  assert.equal(payload.minimum_importer,'9.9.44');assert.equal(payload.format,'martin-forest-bazis-native-v21');
  assert.match(message,/импортёр БАЗИС 9\.9\.44 или новее/);
  assert.doesNotMatch(message,/импортёр 9\.9\.1[678]/);
  const trims=payload.items.filter(it=>it.wardrobe_trim);
  assert.deepEqual(trims.map(it=>it.source_file),['MF_Trim_Right.fr3d','MF_Trim_End.fr3d','MF_Trim_Ceiling.fr3d']);
  assert.ok(trims.every(it=>it.cabinet_block.id===id&&!it.blank&&it.rotation===rotation));
  assert.equal(payload.items.filter(it=>it.blank_item_id?.includes(':trim-')).length,0);
  assert.deepEqual(trims[0].target,{width:114,height:2013,depth:100});
  // For every orientation the bottom-centre is calculated from the placed face.
  const front=part('trim-left-face'),dx=[0,41,0,-41][rotation/90],dz=[-41,0,41,0][rotation/90];
  assert.deepEqual(trims[0].position,{x:front.x+dx,y:front.elevation_mm,z:front.z+dz});
  assert.deepEqual(trims[1].position,{x:part('trim-right-end').x,y:100,z:part('trim-right-end').z});
  assert.deepEqual(trims[2].target,{width:1000,height:94,depth:100});
  assert.ok(trims[0].production_note.includes('Подписать стену А'));
  assert.deepEqual(trims[2].wardrobe_trim.panels.map(p=>[p.role,p.material.article]),
   [['face','CUSTOM'],['upright','605 PO'],['base','CUSTOM']]);
  const upper=payload.items.filter(it=>it.cabinet_block?.module_key==='mezzanine');
  assert.equal(upper.filter(it=>it.blank).length,8);
  const back=upper.find(it=>it.blank_item_id===id+':mezz-back');
  assert.equal(back.name,'Задняя стенка');assert.equal(back.blank.axis,'back');assert.equal(back.blank.thickness,3);
  assert.ok(upper.every(it=>it.cabinet_block.module_name==='Антресоль'));
  const upperDoor=upper.find(it=>it.blank_item_id===id+':mezz-door-left');
  assert.equal(upperDoor.name,'Левый фасад');
  assert.match(upperDoor.production_note,/Сохранить направление[\s\S]*Беспружинные петли/);
  assert.equal(upper.filter(it=>it.prime_hinge).length,0);
 }
});

test('exports the real equal split from the lower facade edge through the download button',async()=>{
 const {wardrobeSpec}=await import('../../backend/v2/cabinet_assets/planner/wardrobe-questionnaire.mjs');
 const id='segmented',name='Шкаф у ниши';
 const spec=wardrobeSpec({width:594,height:2001,depth:580,thickness:18,back:true,sections:1,sectionShelves:[0],
  front:{swing:'left',offset:90,hinges:{'door-left':{article:'112595'}}},
  surround:{left:{kind:'filler',width:92,heightMode:'body',start:'facade',bottom:0,split:'equal'}}});
 const built=buildCarcass(spec,{idPrefix:id,name,frontMaterialId:'custom',bodyMaterialId:core.DEFAULT_MATERIALS.body_variant_id,backMaterialId:CARCASS_BACK_MATERIAL_ID});
 const items=placeCarcass(built,{x:600,z:400,elevation_mm:75,rotation:270})
  .map(it=>({...it,assistant_carcass:{group_id:id,name,spec:built.spec}}));
 const part=key=>items.find(p=>p.item_id===id+':'+key);
 const second=part('trim-left-2-face');
 assert.ok(second,'the generated second panel must exist');
 second.production_note='Лицевой стык сверху';
 const e=exporter(items);await e.context.exportBazisProjectReady();
 const {payload,message}=await e.result();assert.ok(payload,message);
 const halves=payload.items.filter(it=>it.wardrobe_trim);
 assert.equal(payload.minimum_importer,'9.9.44');assert.equal(halves.length,2);
 assert.deepEqual(halves.map(row=>row.source_file),['MF_Trim_Right.fr3d','MF_Trim_Right.fr3d']);
 assert.deepEqual(halves.map(row=>row.position.y),[part('door-left').elevation_mm,second.elevation_mm]);
 assert.equal(halves[0].target.height,halves[1].target.height);
 assert.equal(halves[0].position.y+halves[0].target.height,halves[1].position.y);
 assert.equal(halves[1].position.y+halves[1].target.height,part('top').elevation_mm+part('top').height);
 assert.ok(!Number.isInteger(halves[0].target.height*2)&&Number.isInteger(halves[0].target.height*4));
 assert.deepEqual(halves.map(row=>row.wardrobe_trim.panels.length),[2,2]);
 assert.equal(halves[1].wardrobe_trim.panels.find(p=>p.role==='face').production_note,'Лицевой стык сверху');
 assert.equal(payload.items.filter(row=>row.blank_item_id?.includes(':trim-left')).length,0);
});
