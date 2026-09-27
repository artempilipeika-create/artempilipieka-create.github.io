/** Pricing is a projection of canonical production geometry, never scene state.
 * Money uses integer BYN minor units. No default rates or default markup.
 */
import {productionParts,kitchenRuns,kitchenLegs,PILOT_PRODUCTION} from './furniture-core.mjs';
export const PRICING_WIDTHS=Object.freeze(Array.from({length:15},(_,i)=>300+i*50));
export function pricingCategory(actualWidthMm){
  if(!Number.isFinite(actualWidthMm)||actualWidthMm<=0)return {actualWidthMm,pricingWidthMm:null,status:'INVALID_WIDTH'};
  return {actualWidthMm,pricingWidthMm:actualWidthMm>1000?null:Math.max(300,Math.ceil(actualWidthMm/50)*50),status:actualWidthMm>1000?'CUSTOM':'STANDARD'};
}
const row=(key,label,quantity,unit,source,extra={})=>({key,label,quantity,unit,source,...extra,
  status:quantity===null?'PRICING_RULE_MISSING':'PRICE_DATA_MISSING',unitPriceMinor:null,amountMinor:null});
function panelRows(parts){
  const groups=new Map();
  for(const p of parts){
    const role=p.role==='front'?'front':p.role==='back'?'back':['body','shelf'].includes(p.role)?'body':p.role;
    const key=[role,p.material.variant_id||p.material.name||'unassigned',p.thickness].join(':');
    if(!groups.has(key))groups.set(key,row('sheet:'+key,{body:'Корпус',front:'Фасады',back:'Задник',counter:'Столешница',plinth:'Цоколь'}[role]||'Другие детали',0,'m2','productionParts',
      {role,material:{...p.material},thicknessMm:p.thickness,partIds:[],partCount:0}));
    const r=groups.get(key);r.quantity+=p.length*p.width/1e6;r.partIds.push(p.part_id);r.partCount++;
  }
  return [...groups.values()].map(r=>({...r,quantity:Math.round(r.quantity*1e6)/1e6}));
}
function priceRows(rows,rates){
  return rows.map(r=>{
    const rate=rates?.[r.key];
    if(r.quantity===null)return r;
    if(!rate||rate.currency!=='BYN'||rate.unit!==r.unit||!Number.isSafeInteger(rate.unitPriceMinor)||rate.unitPriceMinor<0)return r;
    const amountMinor=Math.round(r.quantity*rate.unitPriceMinor);
    if(!Number.isSafeInteger(amountMinor))return r;
    return {...r,status:'PRICED',unitPriceMinor:rate.unitPriceMinor,amountMinor};
  });
}
function totals(rows,markupBasisPoints){
  const complete=rows.length>0&&rows.every(r=>r.status==='PRICED');
  const costMinor=complete?rows.reduce((n,r)=>n+r.amountMinor,0):null;
  const markupMinor=costMinor!==null&&Number.isSafeInteger(markupBasisPoints)&&markupBasisPoints>=0?Math.round(costMinor*markupBasisPoints/10000):null;
  return {currency:'BYN',status:!complete?'PRICE_DATA_MISSING':markupMinor===null?'MARKUP_RULE_MISSING':'PRICED',
    costMinor,markupBasisPoints:markupBasisPoints??null,markupMinor,saleMinor:markupMinor===null?null:costMinor+markupMinor};
}
export function modulePriceBreakdown(item,template,materialLookup=()=>null,priceList=null){
  const category=pricingCategory(item.width),actualParts=productionParts(item,template,materialLookup);
  // The same production generator calculates a quote at the next standard width.
  // Only this isolated copy is resized. Actual scene/export geometry is untouched.
  const categoryParts=category.status==='STANDARD'&&actualParts?productionParts({...item,width:category.pricingWidthMm},template,materialLookup):null;
  const parts=categoryParts||actualParts||[],hardware=template?.production?.hardware,legs=kitchenLegs(item);
  const sections={sheetMaterials:panelRows(parts),
    edging:[row('edging','Кромка: тип и метраж',null,'m','Edge assignments not defined by production model')],
    hardware:[row('hinges:'+String(hardware?.hinge_article||'missing'),'Петли',Number.isInteger(hardware?.hinge_count)?hardware.hinge_count:null,'pcs','FR3D donor',{article:hardware?.hinge_article||null}),
      row('legs:'+String(item.legHeightMm??item.base_height??''),'Ножки',legs?legs.length:null,'pcs','kitchenLegs'),
      row('fasteners','Крепёж',null,'pcs','Quantity rule not supplied'),
      ...(parts.some(p=>p.role==='shelf')?[row('shelf-fittings','Крепление полки',null,'pcs','Quantity rule not supplied')]:[]),
      ...(item.handles!=='handleless'?[row('handles','Ручки',null,'pcs','Article and quantity rule not supplied')]:[])],
    operations:['Распил','Кромкооблицовка','Присадка','Сборка'].map((label,i)=>row('operation:'+i,label,null,'operation','Billing quantity rule not supplied')),
    extras:[]};
  if(!actualParts)sections.operations.push(row('production','Производственная модель',null,'module','Unsupported donor'));
  for(const key of Object.keys(sections))sections[key]=priceRows(sections[key],priceList?.rates);
  const all=Object.values(sections).flat(),calculated=totals(all,priceList?.markupBasisPoints);
  if(category.status!=='STANDARD')Object.assign(calculated,{status:category.status,costMinor:null,markupMinor:null,saleMinor:null});
  return {schema:'ModulePriceBreakdown/1',moduleId:item.item_id,moduleType:template?.production?.key||item.bazis_id||item.module_type,
    label:template?.production?.label||item.name,...category,quantityBasis:categoryParts?'PRICING_CATEGORY':'ACTUAL_REFERENCE_ONLY',
    actualBOM:{parts:actualParts||[],sheetMaterials:panelRows(actualParts||[])},pricingBOM:{parts:categoryParts||[]},
    ...sections,extrasScope:'KITCHEN_SHARED_RUNS',totals:calculated,
    missing:all.filter(r=>r.status!=='PRICED').map(r=>({key:r.key,status:r.status}))};
}
export function kitchenPriceBreakdown(items,room,templateLookup,materialLookup=()=>null,priceList=null){
  const modules=items.map(it=>modulePriceBreakdown(it,templateLookup(it),materialLookup,priceList));
  const parts=kitchenRuns(items,room,materialLookup).flatMap(run=>run.parts);
  const extras=priceRows(panelRows(parts).map(r=>({...r,source:'kitchenRuns',key:'shared:'+r.key})),priceList?.rates);
  const summary=totals([...modules.map(m=>({status:m.totals.status,amountMinor:m.totals.costMinor})),...extras],priceList?.markupBasisPoints);
  return {schema:'KitchenPriceBreakdown/1',modules,extras,totals:summary,status:summary.status,
    notice:summary.saleMinor===null?'Расчёт цены требует прайс-листа':''};
}
export function pricingMatrixDescriptors(){
  return Object.entries(PILOT_PRODUCTION).flatMap(([moduleType,p])=>PRICING_WIDTHS.map(pricingWidthMm=>({moduleType,label:p.label,pricingWidthMm,status:'PRICE_DATA_MISSING',saleMinor:null})));
}
