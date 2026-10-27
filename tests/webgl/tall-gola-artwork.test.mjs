import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {TALL_GOLA_VARIANTS as variants,TALL_GOLA_FAMILY,tallVariant} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {executionArtwork} from '../../backend/v2/cabinet_assets/planner/execution-artwork.mjs';
import {TALL_GOLA_IMAGES,TALL_GOLA_OPEN_IMAGES} from '../../backend/v2/cabinet_assets/planner/execution-image-index.mjs';
import '../../backend/v2/cabinet_assets/planner/catalogue-artwork.js';
const item=v=>({bazis_id:v.id,bazis_sha256:v.source_sha256,bazis_file:v.source_file,height:v.native_height,width:600,depth:600,name:v.label,body_variant_id:'custom-body',part_materials:{'side-L':'custom-side'}});
test('Gola catalogue cover belongs to its own default donor; all 25 illustrations exist',()=>{
 const cover=globalThis.MF_CATALOGUE_ARTWORK[TALL_GOLA_FAMILY.default_id];
 assert.equal(cover.file,'tall-gola');assert.ok(cover.badges.includes('22 исполнения'));
 assert.ok(existsSync(new URL('../../backend/v2/cabinet_assets/planner/module-card-images/'+cover.file+'.webp',import.meta.url)));
 assert.equal(Object.keys(TALL_GOLA_IMAGES).length,22);assert.equal(Object.keys(TALL_GOLA_OPEN_IMAGES).length,3);
 for(const file of [...Object.values(TALL_GOLA_IMAGES),...Object.values(TALL_GOLA_OPEN_IMAGES)])assert.ok(existsSync(new URL('../../backend/v2/cabinet_assets/planner/execution-card-images/'+file,import.meta.url)),file);
});
test('option art follows the selected native donor across all bases, layouts and openings without changing the item',()=>{
 for(const v of variants){
  const it=item(v),before=structuredClone(it);
  for(const [key,values] of Object.entries({row_height:['820','900'],layout:['storage','door_oven','door_oven_micro','drawer_oven','drawer_oven_micro'],opening:v.layout==='storage'?['left','right','double']:['left','right']}))for(const value of values){
   const target=tallVariant(it,{[key]:key==='row_height'?Number(value):value},variants);
   const selected=variants.find(v=>v.id===target.bazis_id);
   const open=key==='opening'&&selected.row_height===820&&selected.layout==='storage';
   const expected=`gola-${selected.row_height}-${selected.layout}-${selected.opening}-${open?'open':'closed'}.webp`;
   const url=new URL(executionArtwork(it,'tall',key,value),'https://example.invalid');
   assert.equal(url.pathname,'/account/planner/execution-card-images/'+expected);
   assert.equal(url.searchParams.get('v'),'20261027-pn600-gola');
   assert.deepEqual(it,before);
  }
 }
});
test('unverified source identity and unsupported controls retain geometry previews',()=>{
 const it=item(variants[0]);
 assert.equal(executionArtwork({...it,bazis_sha256:'wrong'},'tall','opening','left'),null);
 assert.equal(executionArtwork(it,'tall','upper_shelf_count',3),null);
});
