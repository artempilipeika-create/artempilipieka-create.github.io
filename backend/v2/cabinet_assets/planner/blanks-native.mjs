import {normalizeBlank,validateBlank,cuttingSize} from './blanks-model.mjs';
import {hookNativeItem} from './blank-hook.mjs';
export const BLANK_SOURCES={"0000": {"file": "Заготовка_1.Без ПВХ.fr3d", "sha256": "2d1ab93e53d1691e1db7d058a1001888d3953400a0c6a237a150fa3b3fdd022e"}, "1000": {"file": "Заготовка_2.ПВХ_1000.fr3d", "sha256": "832a1af0a6e126a75af5ab54286c3f24892ed6eddc03e60b60612ca39b373a25"}, "1010": {"file": "Заготовка_3.ПВХ_1010..fr3d", "sha256": "dcc7cdbb5a0555789ca0955bf35fce22242b6a286c5795a27983e9701644989f"}, "1110": {"file": "Заготовка_4.ПВХ_1110..fr3d", "sha256": "a532f5ac5c4a6912e66ce7c9ca43caadf0e7f76a2c1e6ffab208b41511340b10"}, "1011": {"file": "Заготовка_5.ПВХ_1011..fr3d", "sha256": "e07c4d7834c384a3bb7a7e5a12e8c88d97ae238ff011a5db9b75e9c0f10aadfb"}, "1111": {"file": "Заготовка_6.ПВХ_в круг..fr3d", "sha256": "bdd018565b8d860277e5d1dcd6b1312486754f53d67ca63fdc7626f11127a5d3"}};

export function blankNativeItem(it,material){
 const error=validateBlank(it);if(error)throw Error(error);
 const b=normalizeBlank(it),source=BLANK_SOURCES[b.code]||BLANK_SOURCES['1111'];
 if(!material?.name||Number(material.thickness)!==b.thickness)throw Error(it.name+': выберите материал толщиной '+b.thickness+' мм.');
 return {name:it.name,blank_item_id:it.item_id,source_file:source.file,source_sha256:source.sha256,
 source_default:{width:18,height:600,depth:510},elastic_resize:false,
 target:{width:it.width,height:it.height,depth:it.depth},
 position:{x:it.x,y:b.elevation,z:it.z},rotation:it.rotation||0,
 material_assignments:{body:material},production_note:it.production_note||'',
 blank:{schema:1,length:b.length,width:b.width,thickness:b.thickness,axis:b.axis,
 edge_code:b.code,edge_thickness:b.edgeThickness,finished_dimensions:true,
 cut:cuttingSize(it),edge_elements:[1,3,0,2]}};
}
globalThis.MF_BLANKS_NATIVE={hookItems:items=>items.filter(it=>it.module_type==='blank'&&it.blank_hook).flatMap(it=>Array.from({length:it.blank_hook.count??1},(_,i)=>hookNativeItem(it,i))),nativeItems:(items,lookup)=>items.filter(it=>it.module_type==='blank').map(it=>blankNativeItem(it,lookup(it.body_variant_id)))};
