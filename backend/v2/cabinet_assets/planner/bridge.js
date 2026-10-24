/* Explicit boundary between the existing account application and the planner. */
'use strict';
(function installPlannerBridge(){
  if(document.body.dataset.plannerRequested!=='webgl'||window.MF_PLANNER_BRIDGE)return;
  const listeners=new Set(),copy=value=>JSON.parse(JSON.stringify(value));
  const emit=reason=>{for(const listener of listeners)listener(reason);};
  const oldUpdate=updateAll;
  updateAll=function(){const result=oldUpdate();emit('state');return result;};
  const oldNew=newProject,oldOpen=openProject;
  const switchProject=async action=>{emit('before-project');const result=await action();emit('project');return result;};
  const navigate=action=>window.MF_PROJECT_SAFETY?window.MF_PROJECT_SAFETY.navigate(action):action();
  newProject=(...args)=>navigate(()=>switchProject(()=>oldNew(...args)));
  openProject=(...args)=>navigate(()=>switchProject(()=>oldOpen(...args)));
  const oldSave=saveProject;
  saveProject=()=>window.MF_PROJECT_SAFETY?window.MF_PROJECT_SAFETY.flush(true):oldSave();
  const oldDelete=deleteProject;
  deleteProject=()=>window.MF_PROJECT_SAFETY?window.MF_PROJECT_SAFETY.removeProject():oldDelete();
  const oldShare=shareProject,oldCopy=duplicateProject,oldPdf=downloadSpec;
  shareProject=async function(){await saveProject();return oldShare();};
  duplicateProject=async function(){if(window.MF_PROJECT_SAFETY)return window.MF_PROJECT_SAFETY.duplicate();await saveProject();return oldCopy();};
  downloadSpec=async function(){await saveProject();return oldPdf();};
  const bridge={
    supportsElevation:true,
    state:()=>state,
    selected:()=>selected(),
    projectId:()=>project?.project_id||null,
    userId:()=>user?.user_id,
    projectMeta:()=>project?copy({project_id:project.project_id,version:project.version}):null,
    request:(path,method,body)=>api(path,method,body,{}, {timeoutMs:20000}),
    saveSnapshot:(snapshot,meta,request_id)=>api('/3d-projects'+(meta?'/'+meta.project_id:''),meta?'PATCH':'POST',
      {name:snapshot.name.trim()||'3D-проект',scene:snapshot.scene,request_id,...(meta?{version:meta.version}:{})},{},{timeoutMs:20000}),
    acknowledge:row=>{
      project=copy(row);projects=projects.filter(p=>p.project_id!==row.project_id);projects.unshift(copy(row));renderProjects();
    },
    loadSnapshot:async(snapshot,meta)=>{
      emit('before-project');project=meta?{...meta,name:snapshot.name,scene:copy(snapshot.scene)}:null;
      state=normalizeScene(copy(snapshot.scene));selectedId=state.selected_item_id;viewMode=state.view_mode;$('project-name').value=snapshot.name;
      await hydrateMaterials();syncRoom();await syncControls();updateAll();renderProjects();emit('project');
    },
    resetProject:()=>switchProject(()=>oldNew()),
    reloadProjects:loadProjects,
    catalogue:{templates:kitchenTemplates,bazisModules,moduleDefs},
    template:item=>templateFor(item),
    material:id=>materials.get(String(id))||null,
    cacheMaterial:m=>materials.set(String(m.variant_id),m),
    facadeCells:item=>facadeCells(item),
    status:message=>status(message),
    subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
    select:id=>{
      selectedId=state.items.some(it=>it.item_id===id)?id:null;state.selected_item_id=selectedId;
      Promise.resolve(syncControls()).then(()=>emit('state')).catch(error=>status(error.message));updateAll();
    },
    snapshot:()=>copy({name:$('project-name').value,scene:state,selectedId}),
    restore:snapshot=>{
      state=copy(snapshot.scene);selectedId=snapshot.selectedId||state.selected_item_id||null;
      if(!state.items.some(it=>it.item_id===selectedId))selectedId=state.items[0]?.item_id||null;
      state.selected_item_id=selectedId;viewMode=state.view_mode||'3d';$('project-name').value=snapshot.name;
      syncRoom();Promise.resolve(syncControls()).then(()=>emit('state')).catch(error=>status(error.message));updateAll();renderProjects();
    },
    refresh:()=>{Promise.resolve(syncControls()).then(()=>emit('state')).catch(error=>status(error.message));updateAll();},
    view:mode=>{viewMode=mode==='top'?'2d':'3d';state.view_mode=viewMode;updateAll();},
    payload:()=>scenePayload(),
    save:()=>saveProject(),
    open:id=>openProject(id),
    newProject:()=>newProject(),
    duplicateProject:()=>duplicateProject(),
    share:()=>shareProject(),
    exportBazis:()=>exportBazisProjectReady(),
    toOrder:()=>toOrder(),
    rendererState:()=>({legacyLoopEnabled:document.body.dataset.plannerRequested!=='webgl',legacyPointerEnabled:document.body.dataset.plannerRequested!=='webgl'})
  };
  window.MF_PLANNER_BRIDGE=Object.freeze(bridge);
  document.dispatchEvent(new Event('mf:planner-bridge-ready'));
})();
