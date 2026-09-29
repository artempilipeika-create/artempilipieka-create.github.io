import test from 'node:test';
import assert from 'node:assert/strict';
import {pricingCategory,modulePriceBreakdown,kitchenPriceBreakdown,pricingMatrixDescriptors} from '../../backend/v2/cabinet_assets/planner/pricing.mjs';
import {PILOT_PRODUCTION,normalizeKitchen,productionParts} from '../../backend/v2/cabinet_assets/planner/furniture-core.mjs';
const ids=Object.keys(PILOT_PRODUCTION),room={width:6200,depth:3600,height:2700};
const item=(width=600,id=ids[0],x=0)=>normalizeKitchen({item_id:id,bazis_id:id,bazis_sha256:PILOT_PRODUCTION[id].source_sha256,module_type:'base_cabinet',name:PILOT_PRODUCTION[id].label,width,height:820,depth:510,base_height:100,body_height:720,base:'plinth',layout:'doors',handles:'handles',x,z:-1485,rotation:0,shelves:structuredClone(PILOT_PRODUCTION[id].shelves)});
const template=it=>({production:PILOT_PRODUCTION[it.bazis_id]});
for(const [actual,expected]of [[270,300],[299,300],[300,300],[301,350],[320,350],[349,350],[350,350],[351,400],[599,600],[600,600],[601,650],[999,1000],[1000,1000],[1001,null]])test('Pricing width '+actual+' → '+(expected??'CUSTOM'),()=>{
 const c=pricingCategory(actual);assert.equal(c.actualWidthMm,actual);assert.equal(c.pricingWidthMm,expected);assert.equal(c.status,expected===null?'CUSTOM':'STANDARD');
});
for(const id of ids)test(PILOT_PRODUCTION[id].label+': quote uses canonical BOM without changing actual construction or inventing rates',()=>{
 const it=item(320,id),before=structuredClone(it),t=template(it),actual=productionParts(it,t),b=modulePriceBreakdown(it,t);
 assert.deepEqual(it,before);assert.deepEqual(b.actualBOM.parts,actual);assert.equal(b.actualWidthMm,320);assert.equal(b.pricingWidthMm,350);
 assert.deepEqual(b.pricingBOM.parts,productionParts({...it,width:350},t));
 const quotedArea=b.pricingBOM.parts.reduce((n,p)=>n+p.length*p.width/1e6,0);
 assert.ok(Math.abs(b.sheetMaterials.reduce((n,p)=>n+p.quantity,0)-quotedArea)<.00001);
 if(Number.isInteger(t.production.hardware.hinge_count))assert.equal(b.hardware.find(r=>r.key.startsWith('hinges:')).quantity,t.production.hardware.hinge_count);
 else{
  const slides=b.hardware.find(r=>r.key.startsWith('drawer-slides:'));
  assert.equal(slides.quantity,t.production.hardware.drawer_count);assert.equal(slides.unit,'set');
  assert.equal(slides.manufacturer,'AKS');assert.equal(slides.lengthMm,500);
 }
 assert.equal(b.hardware.find(r=>r.key.startsWith('legs:')).quantity,4);
 for(const section of ['sheetMaterials','edging','hardware','operations'])for(const r of b[section]){assert.equal(r.unitPriceMinor,null);assert.equal(r.amountMinor,null);assert.equal(r.status,r.quantity===null?'PRICING_RULE_MISSING':'PRICE_DATA_MISSING');}
 assert.equal(b.totals.costMinor,null);assert.equal(b.totals.saleMinor,null);assert.equal(b.totals.markupMinor,null);
});
test('Custom width has no capped quote and missing rules remain missing even with a supplied price',()=>{
 const it=item(1001),t=template(it),b=modulePriceBreakdown(it,t,()=>null,{markupBasisPoints:0,rates:{edging:{currency:'BYN',unit:'m',unitPriceMinor:100}}});
 assert.equal(b.status,'CUSTOM');assert.equal(b.totals.status,'CUSTOM');assert.equal(b.totals.saleMinor,null);assert.deepEqual(b.pricingBOM.parts,[]);assert.equal(b.edging[0].status,'PRICING_RULE_MISSING');
});
test('Explicit rates price only the identified row; absent rows never become zero',()=>{
 const it=item(),t=template(it),first=modulePriceBreakdown(it,t),sheet=first.sheetMaterials[0];
 const b=modulePriceBreakdown(it,t,()=>null,{rates:{[sheet.key]:{currency:'BYN',unit:'m2',unitPriceMinor:1234}}});
 assert.equal(b.sheetMaterials[0].amountMinor,Math.round(sheet.quantity*1234));assert.equal(b.sheetMaterials[0].status,'PRICED');assert.equal(b.sheetMaterials[1].amountMinor,null);assert.equal(b.totals.saleMinor,null);
});
test('Shared kitchen extras occur once and retain actual run length',()=>{
 const items=ids.map((id,i)=>item(600,id,(i-1)*600)),b=kitchenPriceBreakdown(items,room,template);
 assert.equal(b.modules.length,ids.length);assert.ok(b.modules.every(m=>!m.extras.length));
 const top=b.extras.find(r=>r.role==='counter');assert.equal(top.partCount,1);assert.equal(top.quantity,ids.length*.6*.6);assert.equal(b.extras.filter(r=>r.role==='plinth').reduce((n,r)=>n+r.partCount,0),3);
 assert.equal(b.totals.saleMinor,null);assert.equal(b.notice,'Расчёт цены требует прайс-листа');
});
test('Future matrix covers every production donor and width identity with no invented prices',()=>{
 const m=pricingMatrixDescriptors(),expected=ids.length*15;assert.equal(m.length,expected);assert.equal(new Set(m.map(r=>r.moduleType+':'+r.pricingWidthMm)).size,expected);assert.ok(m.every(r=>r.saleMinor===null&&r.status==='PRICE_DATA_MISSING'));
});
