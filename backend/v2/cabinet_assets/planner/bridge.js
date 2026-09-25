/* Explicit boundary between the existing account application and the planner. */
'use strict';
(function installPlannerBridge(){
  if(document.body.dataset.plannerRequested!=='webgl'||window.MF_PLANNER_BRIDGE)return;
  const listeners=new Set(),copy=value=>JSON.parse(JSON.stringify(value));
  const emit=reason=>{for(const listener of listeners)listener(reason);};
  const oldUpdate=updateAll;
  updateAll=function(){const result=oldUpdate();emit('state');return result;};
  const oldNew=newProject,oldOpen=openProject;
  newProject=async function(...args){const result=await oldNew(...args);emit('project');return result;};
  openProject=async function(...args){const result=await oldOpen(...args);emit('project');return result;};
  const oldShare=shareProject,oldCopy=duplicateProject,oldPdf=downloadSpec;
  shareProject=async function(){await saveProject();return oldShare();};
  duplicateProject=async function(){await saveProject();return oldCopy();};
  downloadSpec=async function(){await saveProject();return oldPdf();};
  const bridge={
    supportsElevation:false,
    state:()=>state,
    selected:()=>selected(),
    projectId:()=>project?.project_id||null,
    catalogue:{templates:kitchenTemplates,bazisModules,moduleDefs},
    template:item=>templateFor(item),
    material:id=>materials.get(String(id))||null,
    facadeCells:item=>facadeCells(item),
    status:message=>status(message),
    subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    select:id=>{
      selectedId=state.items.some(it=>it.item_id===id)?id:null;state.selected_item_id=selectedId;
      Promise.resolve(syncControls()).catch(error=>status(error.message));updateAll();
    },
    snapshot:()=>copy({name:$('project-name').value,scene:state,selectedId}),
    restore:snapshot=>{
      state=copy(snapshot.scene);selectedId=snapshot.selectedId||state.selected_item_id||null;
      if(!state.items.some(it=>it.item_id===selectedId))selectedId=state.items[0]?.item_id||null;
      state.selected_item_id=selectedId;viewMode=state.view_mode||'3d';$('project-name').value=snapshot.name;
      syncRoom();Promise.resolve(syncControls()).catch(error=>status(error.message));updateAll();renderProjects();
    },
    refresh:()=>{Promise.resolve(syncControls()).catch(error=>status(error.message));updateAll();},
    view:mode=>{viewMode=mode==='top'?'2d':'3d';state.view_mode=viewMode;updateAll();},
    payload:()=>scenePayload(),
    save:()=>saveProject(),
    open:id=>openProject(id),
    newProject:()=>newProject(),
    duplicateProject:()=>duplicateProject(),
    share:()=>shareProject(),
    exportBazis:()=>exportBazisProject(),
    toOrder:()=>toOrder(),
    rendererState:()=>({legacyLoopEnabled:document.body.dataset.plannerRequested!=='webgl',legacyPointerEnabled:document.body.dataset.plannerRequested!=='webgl'})
  };
  window.MF_PLANNER_BRIDGE=Object.freeze(bridge);
  document.dispatchEvent(new Event('mf:planner-bridge-ready'));
})();
