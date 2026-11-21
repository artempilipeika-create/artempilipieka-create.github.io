import z1 from './wardrobe-z1-data.json' with {type:'json'};
import {worldPoint} from './blank-bindings.mjs';
import {alignSavedTrimReturns,nativeTrimRows} from './wardrobe-trim-native.mjs';
import {lightingSystems} from './wardrobe-lighting.mjs';
import {nativeGrip} from './wardrobe-edge-pulls.mjs';
import {assignCabinetBlocks} from './wardrobe-blocks.mjs';
import {nativeDoorHardware,boardProfileCuts,horizontalProfileCuts} from './wardrobe-door-hardware.mjs';
import {nativeRods} from './wardrobe-rods.mjs';
import {installedCuts,wardrobeHardware} from './wardrobe-aks-native.mjs';
import {nativeDoorHinges,doorPush} from './wardrobe-hinges.mjs';
import {nativeFeet} from './wardrobe-feet.mjs';
import {normalizeBlank,validateBlank,cuttingSize} from './blanks-model.mjs';
import {glassShelves} from './shelf-donors.mjs';
import {nativeCarcassJoints} from './carcass-joints.mjs';
import {nativeShelfSupports} from './sekura.mjs';
import {hookNativeItem} from './blank-hook.mjs';
export const BLANK_SOURCES={"0000": {"file": "Заготовка_1.Без ПВХ.fr3d", "sha256": "2d1ab93e53d1691e1db7d058a1001888d3953400a0c6a237a150fa3b3fdd022e"}, "1000": {"file": "Заготовка_2.ПВХ_1000.fr3d", "sha256": "832a1af0a6e126a75af5ab54286c3f24892ed6eddc03e60b60612ca39b373a25"}, "1010": {"file": "Заготовка_3.ПВХ_1010..fr3d", "sha256": "dcc7cdbb5a0555789ca0955bf35fce22242b6a286c5795a27983e9701644989f"}, "1110": {"file": "Заготовка_4.ПВХ_1110..fr3d", "sha256": "a532f5ac5c4a6912e66ce7c9ca43caadf0e7f76a2c1e6ffab208b41511340b10"}, "1011": {"file": "Заготовка_5.ПВХ_1011..fr3d", "sha256": "e07c4d7834c384a3bb7a7e5a12e8c88d97ae238ff011a5db9b75e9c0f10aadfb"}, "1111": {"file": "Заготовка_6.ПВХ_в круг..fr3d", "sha256": "bdd018565b8d860277e5d1dcd6b1312486754f53d67ca63fdc7626f11127a5d3"}};

export function blankNativeItem(it,material,items=[]){
 const error=validateBlank(it);if(error)throw Error(error);
 if(it.blank_front_frame==='Z1'){
  // BAZIS's nominal envelope has 2 mm on each edge of the physical frame.
  const delta=worldPoint({x:0,z:.75},it.rotation||0);
  return {name:it.name,wardrobe_z1_front:true,blank_item_id:it.item_id,source_file:z1.front.source_file,source_sha256:z1.front.sha256,
   source_default:{width:600,height:700,depth:22},target:{width:it.width+4,height:it.height+4,depth:22},elastic_resize:true,
   position:{x:it.x+delta.x,y:it.elevation_mm-2,z:it.z+delta.z},rotation:it.rotation||0,production_note:it.production_note||''};
 }
 const golaCuts=boardProfileCuts(it,items),shelfCuts=horizontalProfileCuts(it,items);
 const upper=it.assistant_carcass?.spec?.surround?.upper;
 const upperNote=upper&&/:mezz-door-(?:left|right)$/.test(it.item_id)?
  (upper.opening==='lift'?'Беспружинные петли и газлифт':'Беспружинные петли')+' · модель и присадка подбираются по образцу.':'';
 const b=normalizeBlank(it),source=it.blank_edge_pull?BLANK_SOURCES['1111']:BLANK_SOURCES[b.code]||BLANK_SOURCES['1111'];
 if(it.blank_shelf&&!it.blank_shelf.startsWith('board/')){
  const donor=glassShelves[b.thickness];
  return {name:it.name,glass_shelf:true,blank_item_id:it.item_id,source_file:donor.file,source_sha256:donor.sha,
   target:{width:it.width,height:it.height,depth:it.depth},position:{x:it.x,y:b.elevation,z:it.z},
   rotation:it.rotation||0,production_note:it.production_note||''};
 }
 if(!material?.name||Number(material.thickness)!==b.thickness)throw Error(it.name+': выберите материал толщиной '+b.thickness+' мм.');
 return {name:it.name,blank_item_id:it.item_id,source_file:source.file,source_sha256:source.sha256,
 source_default:{width:18,height:600,depth:510},elastic_resize:false,
 target:{width:it.width,height:it.height,depth:it.depth},
 position:{x:it.x,y:b.elevation,z:it.z},rotation:it.rotation||0,
 material_assignments:{body:material},production_note:[it.production_note,upperNote,...(it.blank_machining??[]).filter(op=>op.lightSystem).map(op=>{
  const m=lightingSystems[op.lightSystem],length=b.length-(op.start??0)-(op.end??0);
  return m.label+' · арт. '+(m.profile?.stock.find(s=>s.length_mm>=length)?.article??m.led_article)+' · паз '+op.width+' × '+op.depth+' мм · длина '+length+' мм';
 }),it.blank_edge_pull&&!it.blank_edge_pull.grooveWidth?'Врезная ручка AKS '+it.blank_edge_pull.article+' · расчётная посадка, проверить на обрезке перед серией.':''].filter(Boolean).join('\n'),
 blank:{schema:1,length:b.length,width:b.width,thickness:b.thickness,axis:b.axis,
 ...(it.blank_machining?.length?{machining:it.blank_machining}:{}),...(it.blank_edge_pull?{edge_grip:nativeGrip(it.blank_edge_pull)}:{}),edge_code:b.code,edge_thickness:b.edgeThickness,finished_dimensions:true,...(shelfCuts.length?{gola_shelf_cuts:shelfCuts}:{}),...(golaCuts.length?{gola_cuts:golaCuts}:{}),
 ...(/:drawer-\d+-spacer-(left|right)$/.test(it.item_id)?{spacer_cuts:installedCuts(it,items)}:{}),cut:cuttingSize(it),edge_elements:[1,3,0,2]}};
}
function nativeItems(items,lookup){
 const trim=nativeTrimRows(items,lookup),rows=[];
 for(const it of items){
  if(it.module_type!=='blank')continue;
  if(trim.has(it.item_id)){
   const row=trim.get(it.item_id);
   if(row)rows.push(row);
  }else rows.push(blankNativeItem(it,lookup(it.body_variant_id),items));
 }
 return rows;
}
globalThis.MF_BLANKS_NATIVE={alignSavedTrimReturns,assignCabinetBlocks,doorHardwareItems:nativeDoorHardware,rodItems:nativeRods,drawerItems:wardrobeHardware,hingeItems:items=>items.filter(it=>it.blank_axis==='front').flatMap(it=>[...nativeDoorHinges(it,items),...doorPush(it,items)]),footItems:nativeFeet,jointItems:nativeCarcassJoints,supportItems:nativeShelfSupports,hookItems:items=>items.filter(it=>it.module_type==='blank'&&it.blank_hook).flatMap(it=>Array.from({length:it.blank_hook.count??1},(_,i)=>hookNativeItem(it,i))),nativeItems};
