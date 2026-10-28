// Synchronous capture: no RAF can observe an intermediate export camera/size.
// The actual WebGL scene is rendered with its existing studio lighting and AO.
export function captureAlbumViews(scene,{detail=true}={}){
  // Album references use the same full-size render, independent of the editor
  // viewport. render() also updates cutaway walls after moving the camera.
  return {
    hero:capturePresentation(scene,{width:2048,height:1440,view:'threeQuarter'}).toDataURL('image/png'),
    ...(detail?{detail:capturePresentation(scene,{width:1536,height:1024,view:'front'}).toDataURL('image/png')}:{})
  };
}

export function capturePresentation(scene,{width,height,view='threeQuarter',savedView=null}={}){
  if(scene.isFallback||scene.dead||!scene.adapter.items.length)throw Error('Добавьте мебель и дождитесь готовности 3D-сцены.');
  const r=scene.renderer,previous={view:scene.captureView(),client:scene.client,clientView:scene.clientView,clientFit:scene.clientFit,
    ratio:r.getPixelRatio(),width:scene.width,height:scene.height,limit:scene.studioRender.maxDimension,
    selected:scene.selectedBox.visible,hover:scene.hoverBox.visible,guides:scene.guides.visible};
  const boxes=[...scene.kitchenBoxes.values()].map(box=>[box,box.visible]);
  try{
    scene.stopOrbitInertia();scene.exportSize={width,height};scene.width=width;scene.height=height;
    r.setPixelRatio(1);r.setSize(width,height,false);scene.studioRender.maxDimension=width;
    scene.perspective.aspect=width/height;scene.perspective.updateProjectionMatrix();
    scene.setPresentation(true);
    if(savedView)scene.restoreView(savedView);
    else if(view==='top'){scene.setView('top');}
    else scene.fitKitchenForClient(view);
    scene.selectedBox.visible=false;scene.hoverBox.visible=false;scene.guides.visible=false;
    for(const [box]of boxes)box.visible=false;
    scene.render();
    const result=document.createElement('canvas');result.width=width;result.height=height;
    result.getContext('2d').drawImage(scene.canvas,0,0,width,height);
    // Force origin-clean validation while finally can still restore the scene.
    result.getContext('2d').getImageData(0,0,1,1);
    return result;
  }finally{
    scene.exportSize=null;scene.width=previous.width;scene.height=previous.height;r.setPixelRatio(previous.ratio);
    scene.studioRender.maxDimension=previous.limit;scene.setPresentation(previous.client);scene.restoreView(previous.view);
    scene.clientView=previous.clientView;scene.clientFit=previous.clientFit;
    scene.selectedBox.visible=previous.selected;scene.hoverBox.visible=previous.hover;scene.guides.visible=previous.guides;
    for(const [box,visible]of boxes)box.visible=visible;
    scene.render();
  }
}
