import {PRODUCTION_MODELS} from './furniture-core.mjs';

export const MODULE_VIEWS=Object.freeze([
 ['outside','Снаружи'],['open','Открытые двери'],['inside','Внутри']
]);

// The scene and saved door state are authoritative; the preview keeps no own mode.
export function moduleView(item,displayMode='normal'){
 const canOpen=Boolean(PRODUCTION_MODELS[item?.bazis_id]?.doors?.length);
 const inside=['inspection','facadesHidden'].includes(displayMode);
 const view=inside?'inside':canOpen&&item?.doors_open?'open':'outside';
 return {view,canOpen,preview:{view:view==='open'?'hinge':inside?'inspection':'closed',sceneDisplayMode:inside?displayMode:'normal'}};
}

export function changeModuleView(app,view){
 const item=app.adapter.selected,scene=app.scene;
 if(!item||!scene||scene.isFallback||!MODULE_VIEWS.some(([key])=>key===view))return false;
 if(view==='open'&&!moduleView(item).canOpen)return false;
 const open=view==='open';
 if(Boolean(item.doors_open)!==open&&!app.interaction.modify({doors_open:open},open?'Открывание дверей':'Закрытие дверей'))return false;
 scene.setDisplayMode(view==='inside'?'inspection':'normal');
 app.bridge.refresh();
 app.executions?.sync();
 return true;
}
