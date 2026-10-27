import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TALL_GOLA_VARIANTS as variants,TALL_GOLA_FAMILY,tallFamily,TALL_VARIANTS,APPLIANCE_TALL_VARIANTS,PRODUCTION_MODELS as models,productionParts,productionHardware,tallGolaProfiles,tallVariant,tallDefaultId,dimensionError,dimensionPatch,facadeCells} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {applianceLayout} from '../../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
const native=JSON.parse(readFileSync(new URL('./fixtures/tall-gola-native-panels.json',import.meta.url)));
const item=v=>({item_id:'gola-qa',name:'Мой пенал',bazis_id:v.id,bazis_file:v.source_file,bazis_sha256:v.source_sha256,bazis_resize:true,module_type:'tall_cabinet',
 width:600,height:v.native_height,depth:600,base:'plinth',base_height:100,body_height:v.native_height-100,worktop_thickness:0,x:100,z:300,rotation:90,handles:'handleless',
 body_variant_id:'body',front_variant_id:'front',back_variant_id:'back',upper_shelf_count:null,production_note:'Сохранить заметку',appliance_details:{remarks:'Техника клиента'}});
const parts=it=>productionParts(it,{production:models[it.bazis_id]});
for(const v of variants)test(v.label+': exact source, panels, contours, facades, profile and niches',()=>{
 const n=native.find(n=>n.id===v.id),it=item(v),actual=parts(it),remaining=[...n.panels];
 assert.equal(v.source_file,n.file);assert.equal(v.source_sha256,n.sha256);
 assert.equal(actual.length,remaining.length);assert.equal(dimensionError(it),'');
 for(const p of actual){
  const lo=['x','y','z'].map(k=>p.position[k]-p.size[k]/2+(k==='y'?0:300));
  const i=remaining.findIndex(n=>n.name===p.name&&n.lo.every((q,j)=>Math.abs(q-lo[j])<.0001)&&n.size.every((q,j)=>Math.abs(q-p.size['xyz'[j]])<.0001));
  assert.ok(i>=0,JSON.stringify({key:p.key,lo,size:p.size}));const source=remaining.splice(i,1)[0];
  if(p.key.startsWith('side-'))assert.ok(p.contour_yz.every((q,i)=>q.every((x,j)=>Math.abs(x-(source.world_contour[i][j+1]-(j===1?300:0)))<.0001)));
  if(p.facade?.kind==='door')assert.equal(p.hinge_side,v.opening==='double'?(p.position.x<0?'left':'right'):v.opening);
 }
 assert.equal(facadeCells(it,{production:models[v.id]}).length,n.panels.filter(p=>p.name==='Фасад').length);
 const profile=tallGolaProfiles(it)[0];assert.equal(profile.length,600);
 assert.ok(profile.contour_yz.every((q,i)=>q.every((x,j)=>Math.abs(x-(n.profiles[0].contour_yz[i][j]-(j===1?300:0)))<.0001)));
 const hardware=productionHardware(it).items;
 for(const h of n.hardware)assert.equal(hardware.find(x=>x.name===h.name&&x.article===h.article)?.quantity,h.quantity);
 assert.equal(hardware.find(h=>h.article==='89731').quantity,.6);
 const supports=actual.filter(p=>p.key.startsWith('support-')).sort((a,b)=>a.position.y-b.position.y);
 for(const [i,appliance] of applianceLayout(it,models[v.id]).entries()){
  assert.equal(appliance.nicheBottom,supports[i].position.y+9);
  assert.equal(supports[i+1].position.y-9-appliance.nicheBottom,appliance.nicheHeight);
 }
});
test('Gola is a separate card and never selects a conventional donor',()=>{
 assert.equal(variants.length,22);assert.equal(TALL_VARIANTS.length,6);assert.equal(APPLIANCE_TALL_VARIANTS.length,16);
 assert.equal(tallDefaultId([],null,TALL_GOLA_FAMILY),TALL_GOLA_FAMILY.default_id);
 const catalogue=[...variants,...TALL_VARIANTS,...APPLIANCE_TALL_VARIANTS].map(v=>({...v,resize:true}));
 for(const from of variants)for(const to of variants){
  const before=item(from),next=tallVariant(before,{row_height:to.row_height,layout:to.layout,opening:to.opening},catalogue);
  for(const k of ['item_id','name','x','z','rotation','body_variant_id','front_variant_id','back_variant_id','production_note','appliance_details'])assert.deepEqual(next[k],before[k]);
  assert.equal(next.bazis_id,to.id);assert.equal(next.bazis_file,to.source_file);assert.equal(next.bazis_sha256,to.source_sha256);
  assert.equal(next.handles,'handleless');assert.equal(next.height,to.native_height);assert.equal(dimensionError(next),'');
  assert.equal(tallFamily(to),TALL_GOLA_FAMILY);
 }
 const double=variants.find(v=>v.opening==='double');
 assert.equal(models[tallVariant(item(double),{layout:'drawer_oven'},catalogue).bazis_id].tall.opening,'left');
 const resized=tallVariant({...item(double),width:1200,upper_shelf_count:3},{layout:'door_oven'},catalogue);
 assert.equal(resized.width,600);assert.equal(resized.upper_shelf_count,3);assert.equal(dimensionError(resized),'');
});
test('Gola resizing preserves fixed niches, profile cutouts, drawer rail depth and shelf hardware',()=>{
 for(const v of variants)for(const depth of [v.family==='appliance'?500:300,600,700]){
  const it=dimensionPatch(item(v),{height:2600,depth}),ps=parts(it);assert.equal(dimensionError(it),'');
  assert.ok(ps.every(p=>Object.values(p.size).every(n=>n>0&&Number.isFinite(n))));
  const supports=ps.filter(p=>p.key.startsWith('support-')).sort((a,b)=>a.position.y-b.position.y);
  if(v.family==='appliance')assert.equal(supports[1].position.y-supports[0].position.y-18,595);
  if(v.microwave)assert.equal(supports[2].position.y-supports[1].position.y-18,380);
  const profile=tallGolaProfiles(it)[0];assert.equal(Math.max(...profile.contour_yz.map(q=>q[1])),v.profiles[0].bounds.hi[2]+depth-600-depth/2);
  if(v.drawer){assert.equal(ps.find(p=>p.key==='drawer-side-L').size.z,depth<550?400:500);}
  const hw=productionHardware({...it,upper_shelf_count:3}).items;
  const support=v.hardware_items.find(h=>h.key==='shelf-support-marcopol');
  assert.equal(hw.find(h=>h.key==='shelf-support-marcopol').quantity,support.quantity+4*(3-v.upper_shelves.length));
 }
});
