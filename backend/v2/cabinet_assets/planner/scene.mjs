import {cabinetId,cabinetEnvelope,isInterior} from './cabinet-actions.mjs';
import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {MeshFactory,CataloguePreviews} from './module-mesh.mjs';
import {MM_TO_WORLD as S,bounds,elevation,tier,kitchenSettings,scopeMatches} from './furniture-core.mjs';
import {RenderRooms} from './render-rooms.mjs';
import {roomById} from './render-rooms/catalogue.mjs';
import {finishSettings,LIGHTS} from './room-state.mjs';
import {floorOutline,featureBox} from './room-plan.mjs';
import {isEquipment} from './equipment-placement.mjs';
import {equipmentFallback,attachRoomEquipment,windowEquipment} from './room-equipment-mesh.mjs';
import {socketRotation} from './socket-asset.mjs';
import {measuredFeatures} from './room-mesh.mjs';
import {clientFrame} from './client-camera.mjs';
import {studioEnvironment} from './studio-environment.mjs';
import {roomDaylight,daylightKey} from './room-daylight.mjs';
import {buildRoomSurfaces,wallVisible} from './room-surfaces.mjs';
import {clearanceSession,drawerStroke,viewingDoor,angleLimit} from './wardrobe-clearance.mjs';
import {WardrobeMotion,drawerKey} from './wardrobe-motion.mjs';
import {StudioRender} from './studio-render.mjs';
import {allSegments} from './wall-finishes.mjs';
import {WallFinishMesh} from './wall-finish-mesh.mjs';
import {qualityProfile} from './presentation.mjs';
const SELECTION_BLUE='#1677ff',HOVER_BLUE='#80b8ff';
export class PlannerScene{
  constructor(canvas,adapter,onLost,{context,softwareRenderer}={}){
    this.canvas=canvas;this.adapter=adapter;this.onLost=onLost;this.mode='3d';this.layer='all';this.entries=new Map();this.frame=0;this.dead=false;
    this.displayMode='normal';this.displayItemId=null;this.selectionScope='module';this.kitchenBoxes=new Map();
    this.softwareRendering=Boolean(softwareRenderer);
    this.renderer=softwareRenderer||new THREE.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    this.studioRender=new StudioRender(this.renderer);
    this.scene=new THREE.Scene();this.planBackground=new THREE.Color();
    this.wardrobeContact=new THREE.Mesh(new THREE.SphereGeometry(.016,16,10),new THREE.MeshBasicMaterial({color:'#db482d',depthTest:false,depthWrite:false}));
    this.wardrobeContact.visible=false;this.wardrobeContact.renderOrder=90;this.wardrobeContact.userData.ownMaterial=true;
    this.scene.add(this.wardrobeContact);
    this.wardrobeMotion=new WardrobeMotion();this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.hemi=new THREE.HemisphereLight('#fffdf8','#b9ab94',1.0);this.scene.add(this.hemi);
    this.roomBounce=new THREE.DirectionalLight(0xfffcf3,.38);
    this.roomBounce.position.set(0,-2.5,1.4);this.roomBounce.target.position.set(0,2.2,0);
    this.roomBounce.visible=false;this.scene.add(this.roomBounce,this.roomBounce.target);
    this.studioEnvironment=softwareRenderer?null:studioEnvironment(this.renderer);
    this.scene.environment=this.studioEnvironment?.texture??null;this.scene.environmentIntensity=.55;
    this.sun=new THREE.DirectionalLight('#fff7e9',2.1);this.sun.position.set(-3,5,7);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:30});
    this.sun.shadow.bias=-.00004;this.sun.shadow.normalBias=.0007;this.sun.shadow.intensity=.58;this.sun.shadow.radius=5;this.scene.add(this.sun,this.sun.target);
    const fill=new THREE.DirectionalLight('#eaf1ff',.65);fill.position.set(4,3,1);this.scene.add(fill);this.fill=fill;
    this.perspective=new THREE.PerspectiveCamera(34,1,.025,150);
    this.ortho=new THREE.OrthographicCamera(-3,3,3,-3,.025,150);this.camera=this.perspective;
    this.camera.position.set(4,3.4,5);this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.minDistance=.5;this.controls.maxDistance=80;
    this.controls.maxPolarAngle=Math.PI*.495;this.controls.screenSpacePanning=true;this.controls.target.set(0,1,0);
    this.controls.addEventListener('change',()=>this.invalidate());
    const refreshMaterials=()=>{if(!this.dead){this.invalidate();this.onVisualChanged?.();}};
    this.boardRelief=new THREE.TextureLoader().load('/account/planner/materials/studio-matte.webp',refreshMaterials);
    this.boardRelief.wrapS=this.boardRelief.wrapT=THREE.RepeatWrapping;
    this.boardRelief.repeat.set(4,4);
    this.boardRelief.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    this.factory=new MeshFactory(adapter,refreshMaterials,this.boardRelief);this.root=new THREE.Group();this.scene.add(this.root);
    this.factory.maxAnisotropy=Math.min(12,this.renderer.capabilities.getMaxAnisotropy());
    this.guides=new THREE.Group();this.scene.add(this.guides);
    this.selectedBox=this.selectionBox();this.scene.add(this.selectedBox);
    this.hoverBox=this.selectionBox(true);this.scene.add(this.hoverBox);
    this.raycaster=new THREE.Raycaster();this.ndc=new THREE.Vector2();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);
    this.lost=e=>{e.preventDefault();if(!this.dead)this.onLost();};canvas.addEventListener('webglcontextlost',this.lost);
    this.wallFinishes=new WallFinishMesh(this);
    this.renderRooms=new RenderRooms();
    let qualityMode='auto';try{qualityMode=localStorage.getItem('mf.scene-quality')||'auto';}catch{}
    this.applyQuality(qualityMode);this.sync();this.fit('room');if(!softwareRenderer)this.previews=new CataloguePreviews(this);
    this.factory.onAssetsReady=()=>{this.renderer.shadowMap.needsUpdate=true;this.previews?.refreshAppliances();};
  }
  invalidate(){if(!this.dead&&!this.frame)this.frame=requestAnimationFrame(()=>this.render());}
  render(){
    this.frame=0;if(this.dead)return;const started=performance.now();
    this.controls.update();this.camera.updateMatrixWorld();
    const paletteView=Boolean(this.renderRooms.id)&&this.mode==='3d';
    this.scene.background=this.mode==='3d'?this.renderRooms.background:this.planBackground;
    this.roomBounce.visible=paletteView;
    const contact=this.wardrobeMotion.contact;
    this.wardrobeContact.visible=Boolean(!this.exportSize&&!this.client&&this.mode==='3d'&&this.wardrobeMotion.open&&contact);
    if(this.wardrobeContact.visible)this.wardrobeContact.position.fromArray(contact.point).multiplyScalar(S);
    const moving=!this.exportSize&&this.wardrobeMotion.step(started,this.reducedMotion?.matches);
    if(!this.exportSize&&this.wardrobeMotion.dirty){
      this.wardrobeMotion.pose(this.entries,this.adapter.items);
      this.renderer.shadowMap.needsUpdate=true;
      if(this.adapter.selected&&!this.preview)this.highlight();
    }
    if(moving)this.invalidate();
    const r=this.adapter.room;
    this.wallFinishes?.visibility();
    if(this.walls)for(const wall of this.walls)wall.visible=this.mode!=='top'&&wallVisible(wall,r,this.camera.position);
    for(const f of this.roomFeatures||[]){f.marker.visible=!this.client;for(const marker of f.plan.children)if(marker.isSprite)marker.visible=!this.client;f.group.visible=this.mode!=='top'&&((isEquipment(f.group.userData.kind)&&f.group.userData.kind!=='window')||this.camera.position[f.axis]*f.sign<(f.axis==='x'?r.width:r.depth)*S/2-.02);
      const host=f.group.userData.hostWall;if(host){const axis=['a','c'].includes(host)?'z':'x',sign=['a','d'].includes(host)?-1:1;f.group.visible&&=this.camera.position[axis]*sign<(axis==='x'?r.width:r.depth)*S/2-.02;}
      for(const m of f.extras)m.visible=f.group.visible;f.plan.visible=this.mode==='top'&&this.equipmentPreview?.id!==f.group.userData.roomFeatureId;}
    if(this.contacts)for(const m of this.contacts.children){const wall=m.userData.wall;const tierVisible=this.layer==='all'||m.userData.tier===this.layer;m.visible=tierVisible&&m.userData.contactItem!==this.preview?.userData.itemId&&(!wall||this.mode!=='top'&&this.camera.position[wall.axis]*wall.sign<(wall.axis==='x'?r.width:r.depth)*S/2-.02);}
    if(this.floorOutline)this.floorOutline.visible=this.mode==='top'&&!this.client;
    for(const line of this.countertopOutlines||[])line.visible=this.mode==='top'&&!this.client;
    if(this.grid){this.grid.visible=!this.client&&(this.mode==='top'||Boolean(this.preview));this.grid.material.opacity=this.mode==='top'?.14:.055;}
    if(this.clientFloor)this.clientFloor.visible=(this.mode==='3d'||Boolean(this.clientFloor.userData.tileSizeMm));
    if(this.floorJoints)this.floorJoints.visible=!this.clientFloor?.visible;
    if(this.ceiling)this.ceiling.visible=this.mode==='3d'&&this.camera.position.y<r.height*S;
    if(this.mode==='3d')this.studioRender.render(this.scene,this.camera);else this.renderer.render(this.scene,this.camera);this.placeLabel();
  }
  applyQuality(mode='auto'){
    this.qualityMode=['auto','balanced','high'].includes(mode)?mode:'auto';
    this.quality=qualityProfile(this.qualityMode,{memory:navigator.deviceMemory,cores:navigator.hardwareConcurrency,software:this.softwareRendering});
    if(this.softwareRendering)this.renderer.quality=this.quality;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality.ratio));
    this.studioRender.maxDimension=this.quality.limit;
    this.studioRender.occlusionSamples=this.quality.occlusionSamples;
    try{localStorage.setItem('mf.scene-quality',this.qualityMode);}catch{}this.resize();
  }
  resize(){
    if(this.dead)return;const r=this.exportSize||this.canvas.parentElement.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);
    this.renderer.setSize(this.width,this.height,false,Boolean(this.exportSize));this.perspective.aspect=this.width/this.height;
    const v=this.perspective.view;if(v?.enabled)this.perspective.setViewOffset(this.width,this.height,v.offsetX*this.width/v.fullWidth,v.offsetY*this.height/v.fullHeight,this.width,this.height);
    this.perspective.updateProjectionMatrix();
    const span=this.orthoSpan||3;this.ortho.left=-span*this.width/this.height;this.ortho.right=-this.ortho.left;this.ortho.top=span;this.ortho.bottom=-span;this.ortho.updateProjectionMatrix();this.invalidate();
  }
  disposeTree(group){
    if(!group)return;group.traverse(o=>{if(o.geometry&&!o.userData.sharedSocketAsset&&!o.userData.sharedApplianceAsset&&!this.factory.ownsGeometry(o.geometry))o.geometry.dispose();if(o.userData.ownMap)o.material?.map?.dispose();if(o.userData.ownMaterial)o.material?.dispose();});group.removeFromParent();
  }
  selectionBox(hover=false){
    const color=hover?HOVER_BLUE:SELECTION_BLUE,box=new THREE.Box3Helper(new THREE.Box3(),color);
    Object.assign(box.material,{depthTest:false,depthWrite:false,transparent:true,opacity:hover?.7:1,toneMapped:false});
    box.userData.ownMaterial=true;box.renderOrder=20;box.visible=false;
    if(!hover){
      // The helper scales a [-1,1] cube to the measured bounds. This separate
      // overlay never changes furniture materials, picking or export geometry.
      const tint=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.045,depthTest:false,depthWrite:false,toneMapped:false}));
      tint.userData.ownMaterial=true;tint.renderOrder=19;box.add(tint);
    }
    return box;
  }
  selectionColor(box,color){box.material.color.set(color);for(const child of box.children)child.material.color.set(color);}
  roomMesh(){
    this.disposeTree(this.roomRoot);
    this.surfaces?.disposeMaps();
    this.floorJoints=null;
    const r=this.adapter.room,settings=finishSettings(this.adapter.state?.displaySettings);
    const anisotropy=Math.min(12,this.renderer.capabilities.getMaxAnisotropy());
    const surfaces=buildRoomSurfaces(r,settings,this.factory.geometry,anisotropy,()=>this.invalidate());
    this.surfaces=surfaces;
    this.roomRoot=surfaces.root;
    this.scene.add(this.roomRoot);
    this.renderRooms.surfacesReady=surfaces.ready;
    this.walls=surfaces.walls;
    this.roomFloorBase=surfaces.roomFloorBase;
    this.clientFloor=surfaces.clientFloor;
    this.floorTexture=surfaces.floorTexture;
    this.roomPalette=surfaces.palette;
    this.ceiling=surfaces.ceiling;
    this.roomFeatures=measuredFeatures(this);
    const outlinePoints=floorOutline(r).flatMap(e=>[e.x1*S,.016,e.z1*S,e.x2*S,.016,e.z2*S]);
    const outlineGeometry=new THREE.BufferGeometry();outlineGeometry.setAttribute('position',new THREE.Float32BufferAttribute(outlinePoints,3));
    this.floorOutline=new THREE.LineSegments(outlineGeometry,new THREE.LineBasicMaterial({color:'#536958'}));this.floorOutline.userData.ownMaterial=true;this.roomRoot.add(this.floorOutline);
    const joints=[],plank=settings.floorMaterial==='oak',step=plank?190:600;
    if(settings.floorMaterial!=='concrete'&&settings.floorMaterial!=='marble'){
      for(let x=-r.width/2+step;x<r.width/2;x+=step)joints.push(x*S,-.0015,-r.depth*S/2,x*S,-.0015,r.depth*S/2);
      for(let col=0,x=-r.width/2;x<r.width/2;col++,x+=step)for(let z=-r.depth/2+(plank?(col%3)*400:0);z<r.depth/2;z+=1200)joints.push(x*S,-.0015,z*S,Math.min(x+step,r.width/2)*S,-.0015,z*S);
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(joints,3));
      const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:plank?'#75634f':'#9d9d96',transparent:true,opacity:plank?.2:.16}));lines.userData.ownMaterial=true;this.floorJoints=lines;this.roomRoot.add(lines);
    }
    const points=[];for(let x=-r.width/2;x<=r.width/2;x+=500)points.push(x*S,.001,-r.depth*S/2,x*S,.001,r.depth*S/2);
    for(let z=-r.depth/2;z<=r.depth/2;z+=500)points.push(-r.width*S/2,.001,z*S,r.width*S/2,.001,z*S);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const grid=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xa2afa7,transparent:true,opacity:.12}));grid.userData.ownMaterial=true;this.grid=grid;this.roomRoot.add(grid);this.renderer.shadowMap.needsUpdate=true;
  }
  clearSelection(){
    this.cabinetSelection=null;this.pickedInterior=null;this.heightOffer=null;this.heightHighlights=null;
    this.selectionScope='module';this.displayMode='normal';this.displayItemId=null;
    this.selectedBox.visible=false;this.selectedBox.box.makeEmpty();
    this.hoverBox.visible=false;this.hoverBox.box.makeEmpty();
    for(const box of this.kitchenBoxes.values())this.disposeTree(box);
    this.kitchenBoxes.clear();this.placeLabel();
  }
  resetProject(){
    this.wardrobeMotion?.reset();this.previewItems=null;
    this.clearGroupPreview();
    this.clearSelection();
    this.factory.release(this.preview);this.preview=null;this.previewSignature=null;
    this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);
    for(const entry of this.entries.values())this.factory.release(entry.group);
    this.entries.clear();this.factory.release(this.dressing);this.dressing=null;this.dressingKey=null;
    this.contacts?.removeFromParent();this.contacts=null;this.renderer.shadowMap.needsUpdate=true;
  }
  liveEntry(id,items=this.adapter.items){
    const entry=this.entries.get(id);
    return entry?.group.parent===this.root&&this.root.parent===this.scene&&items.some(it=>it.item_id===id)?entry:null;
  }
  sync(){
    // Prune against the restored document before room/presentation can highlight.
    // Same-project Undo/Redo retains valid geometry; project navigation explicitly
    // resets the entire graph, including modules with IDs reused by another project.
    const ids=new Set(this.adapter.items.map(it=>it.item_id));
    for(const [id,entry]of this.entries)if(!ids.has(id)){this.factory.release(entry.group);this.entries.delete(id);this.renderer.shadowMap.needsUpdate=true;}
    this.hover(null);
    if(this.selectionScope==='kitchen'&&!this.adapter.items.some(it=>kitchenSettings(it)))this.clearSelection();
    if(this.selectionScope!=='kitchen'&&this.displayItemId!==this.adapter.selected?.item_id){this.displayMode='normal';this.displayItemId=this.adapter.selected?.item_id||null;}
    const display=this.adapter.state?.displaySettings||{};
    this.renderRooms.select(display.renderRoomId);
    if(this.renderRooms.id)this.renderRooms.place(this.adapter.room,this.renderRotation());
    const roomKey=JSON.stringify([this.adapter.room,this.adapter.state?.wallPanels,allSegments(this.adapter.state),finishSettings(display)]);if(this.roomKey!==roomKey){this.roomKey=roomKey;this.roomMesh();this.setPresentation(document.body.classList.contains('planner-client'));}
    for(const it of this.adapter.items){
      const signature=this.factory.signature(it);let entry=this.entries.get(it.item_id);
      if(!entry||entry.group.parent!==this.root||entry.signature!==signature){if(entry)this.factory.release(entry.group);entry={group:this.factory.build(it),signature};this.entries.set(it.item_id,entry);this.root.add(entry.group);this.renderer.shadowMap.needsUpdate=true;}
      this.factory.position(entry.group,it);entry.group.visible=this.layer==='all'||tier(it)===this.layer;
      const groupedDisplay=this.selectionScope!=='module'&&scopeMatches(it,this.selectionScope);
      const mode=this.xrayEnabled?'xray':(groupedDisplay||it.item_id===this.displayItemId?this.displayMode:'normal');
      if(this.factory.updateAppearance(entry.group,it,mode))this.renderer.shadowMap.needsUpdate=true;
    }
    if(this.wardrobeMotion?.id&&!this.adapter.items.some(it=>cabinetId(it)===this.wardrobeMotion.id))this.wardrobeMotion.reset();
    if(this.wardrobeMotion?.open&&cabinetId(this.adapter.selected)!==this.wardrobeMotion.id)this.wardrobeMotion.close();
    this.wardrobeMotion?.pose(this.entries,this.adapter.items);
    const dressing=JSON.stringify(this.adapter.state?.plinths)+JSON.stringify(this.adapter.items.map(it=>[it.item_id,it.bazis_id,it.x,it.z,it.rotation,it.width,it.height,it.depth,it.elevation_mm,it.base,it.base_height,it.plinthMaterialId,it.worktop_thickness,it.worktop_fixture,kitchenSettings(it)]));
    if(this.dressingKey!==dressing){this.dressingKey=dressing;this.factory.release(this.dressing);this.dressing=this.factory.dress(this.adapter.items);this.countertopOutlines=[];this.dressing.traverse(m=>{if(m.userData.role==='countertop-outline')this.countertopOutlines.push(m);});this.scene.add(this.dressing);this.contacts?.removeFromParent();this.contacts=this.factory.contacts(this.adapter.items);this.scene.add(this.contacts);this.fitShadow();}
    if(this.dressing){
      const merged=new Set(this.dressing.userData.mergedPlinthIds||[]);
      for(const [id,entry]of this.entries)entry.group.traverse(m=>{if(m.userData.role==='plinth')m.visible=!merged.has(id);});
      for(const g of this.dressing.children){
        g.visible=this.layer==='all'||g.userData.tier===this.layer||g.userData.tiers?.includes(this.layer)===true;
        g.traverse(m=>{
          if(!m.isMesh)return;
          const {role,part}=m.userData;
          if(role==='counter'||role==='plinth'){
            this.factory.xrayOutline(m,Boolean(this.xrayEnabled));
            m.material=this.factory.material(role,part?.material?.variant_id??null,false,Boolean(this.xrayEnabled));
            m.castShadow=m.receiveShadow=!this.xrayEnabled;
          }else if(g.userData.productionRun&&part)m.material=this.factory.material(role,part.material.variant_id);
        });
      }
    }
    this.wallFinishes.sync();
    this.factory.pruneMaterials([this.root,this.dressing,this.preview,this.wallFinishes.root]);
    this.highlight();this.invalidate();
  }
  setDisplayMode(mode){
    if(!['normal','inspection','facadesHidden'].includes(mode)||!this.adapter.selected)return;
    this.displayItemId=this.adapter.selected.item_id;this.displayMode=mode;this.sync();
  }
  setPresentation(client){
    const viewChanged=this.client!==client;
    this.client=client;const p=LIGHTS[finishSettings(this.adapter.state?.displaySettings).lightingPreset];
    this.sun.color.set(p.key);this.sun.intensity=p.sun;
    const gallery=Boolean(this.renderRooms?.id);
    this.fill.color.set(p.fill);this.fill.intensity=p.fillPower+(gallery?.12:0);
    this.hemi.color.set(p.sky);this.hemi.groundColor.set(p.ground);this.hemi.intensity=p.hemi+(gallery?.22:0);
    this.planBackground.set(finishSettings(this.adapter.state?.displaySettings).wallColor);
    this.scene.fog=null;this.scene.environmentIntensity=p.environment;this.renderer.toneMappingExposure=p.exposure;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    if(viewChanged){this.perspective.fov=client?32:34;if(!client)this.perspective.clearViewOffset();this.perspective.updateProjectionMatrix();}
    // Cached key shadow plus depth-based ambient occlusion in the presentation pass.
    this.sun.shadow.intensity=gallery?.53:.51;this.sun.shadow.radius=client?46:38;
    this.sun.shadow.normalBias=.0025;this.sun.shadow.bias=-.00015;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.factory.contactMaterials.floor.opacity=gallery?.20:.14;this.factory.contactMaterials.wall.opacity=gallery?.13:.09;
    for(const m of Object.values(this.factory.contactMaterials))m.color.set(client?'#292b29':'#35443b');
    if(this.floorTexture){this.floorTexture.anisotropy=Math.min(12,this.renderer.capabilities.getMaxAnisotropy());if(this.floorTexture.image)this.floorTexture.needsUpdate=true;}
    this.fitShadow();this.highlight();this.renderer.shadowMap.needsUpdate=true;this.invalidate();
  }
  kitchenRotation(){
    const weights=new Map();for(const it of this.adapter.items){if(!kitchenSettings(it))continue;const r=it.rotation||0;weights.set(r,(weights.get(r)||0)+it.width);}
    return [...weights].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;
  }
  renderRotation(){
    return this.adapter.items.some(it=>kitchenSettings(it))?this.kitchenRotation():(this.adapter.items.find(it=>cabinetId(it)||it.module_type==='wardrobe')?.rotation||0);
  }
  fitRenderRoom(){
    const view=this.renderRooms.cameraView();
    if(!view)return;
    this.stopOrbitInertia();this.mode='3d';this.camera=this.perspective;this.controls.object=this.camera;
    this.controls.enableRotate=true;this.clientView='room';this.camera.clearViewOffset();this.camera.zoom=1;
    const viewport=this.clientViewport(),aspect=viewport.width/viewport.height;
    const halfFov=THREE.MathUtils.degToRad(view.fov/2);
    this.camera.fov=Math.min(90,THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(halfFov)*Math.max(1,1.5/aspect))));
    if(this.adapter.items.length){
      const subject=this.cameraBox('kitchen'),direction=view.position.clone().sub(view.target).normalize();
      const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right);
      const originalDistance=view.position.distanceTo(view.target);
      view.target.lerp(subject.getCenter(new THREE.Vector3()),.86);
      // Keep the entire project and a margin of its room, including furniture installed at a side wall.
      const tanY=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanX=tanY*aspect;
      let fit=.45;
      for(const x of [subject.min.x,subject.max.x])for(const y of [subject.min.y,subject.max.y])for(const z of [subject.min.z,subject.max.z]){
        const corner=new THREE.Vector3(x,y,z).sub(view.target),depth=corner.dot(direction);
        fit=Math.max(fit,depth+Math.abs(corner.dot(right))/(tanX*.80),depth+Math.abs(corner.dot(up))/(tanY*.78));
      }
      const distance=Math.max(fit,Math.min(originalDistance*.72,fit*1.16));
      view.position.copy(view.target).addScaledVector(direction,distance);
    }
    this.camera.up.set(0,1,0);this.camera.position.copy(view.position);this.controls.target.copy(view.target);
    this.resize();
    if(!this.exportSize)this.camera.setViewOffset(this.width,this.height,(this.width-viewport.width)/2-viewport.left,(this.height-viewport.height)/2-viewport.top,this.width,this.height);
    this.controls.update();this.camera.updateMatrixWorld();this.invalidate();
  }
  fitShadow(){
    const box=this.cameraBox('kitchen'),center=box.getCenter(new THREE.Vector3());
    const rotation=-this.renderRotation()*Math.PI/180;
    this.sun.target.position.copy(center);const daylight=roomDaylight(this.adapter.room,finishSettings(this.adapter.state?.displaySettings));
    const key=daylightKey(daylight,roomById(this.renderRooms?.id),rotation);
    this.sun.position.copy(center).add(key);
    this.fill.position.copy(center).add(new THREE.Vector3(3.1,2.5,4.8).applyAxisAngle(new THREE.Vector3(0,1,0),rotation));this.fill.target.position.copy(center);this.fill.target.updateMatrixWorld();
    const c=this.sun.shadow.camera;c.position.copy(this.sun.position);c.lookAt(center);c.updateMatrixWorld();
    const local=new THREE.Box3();
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])local.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse));
    c.left=local.min.x-.7;c.right=local.max.x+.7;c.bottom=local.min.y-1.2;c.top=local.max.y+.6;c.near=Math.max(.1,-local.max.z-1);c.far=Math.max(c.near+1,-local.min.z+3);c.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate=true;
  }
  inspectWardrobe(item){
    const id=cabinetId(item);if(!id)return;
    const m=this.wardrobeMotion;
    if(m.id===id&&m.open){m.close();this.onWardrobeChanged?.();this.invalidate();return;}
    if(this.mode!=='3d')this.setView('3d');
    m.reset();m.show(id);
    const members=this.adapter.items.filter(it=>cabinetId(it)===id);
    const leaves=members.filter(viewingDoor),picked=leaves.find(it=>it===item);
    m.defaultDegrees=0;m.leaf=(picked||leaves[0])?.item_id??null;
    m.drawer=members.map(drawerKey).find(Boolean)??null;
    const session=this.wardrobeChecks();
    for(const leaf of picked?[picked]:leaves){
      const result=session.swing(leaf,0,90);m.angles.set(leaf.item_id,result.degrees);
      if(result.contact&&!m.contact)this.reportDoorContact(result);
    }
    this.cabinetSelection=id;this.fit('wardrobe');this.onWardrobeChanged?.();this.invalidate();
  }
  wardrobeChecks(){return clearanceSession(this.adapter.items,this.entries,this.adapter.room,this.wardrobeMotion);}
  reportDoorContact(result){
    const m=this.wardrobeMotion;m.contact=result.contact;
    m.message='При '+result.degrees.toLocaleString('ru-RU')+'° соприкасаются '+result.contact.moving+' и '+result.contact.obstacle+'.';
  }
  selectWardrobeDoor(id){
    const m=this.wardrobeMotion;
    if(!m.open||!this.adapter.items.some(it=>it.item_id===id&&cabinetId(it)===m.id&&viewingDoor(it)))return false;
    m.leaf=id;this.onWardrobeChanged?.();return true;
  }
  setWardrobeAngle(value){
    const m=this.wardrobeMotion,item=this.adapter.items.find(it=>it.item_id===m.leaf);
    if(!m.open||!item||!Number.isFinite(value))return;
    const session=this.wardrobeChecks();
    const result=session.swing(item,m.degrees(m.leaf),Math.max(0,Math.min(angleLimit(item),value)));
    m.setDegrees(m.leaf,result.degrees);m.contact=null;m.message='';
    if(result.contact)this.reportDoorContact(result);
    else if(m.requested)this.checkDrawerTravel(session,m.requested);
    this.onWardrobeChanged?.();this.invalidate();
  }
  checkDrawerTravel(session,key){
    const m=this.wardrobeMotion,hit=session.drawer(key);
    m.limit=hit?.time??1;m.contact=hit;
    const travel=Math.round(drawerStroke(this.adapter.items,m.id,key)*m.limit);
    const reach='Ход в просмотре '+travel+' мм.';
    m.message=hit?reach+' Препятствие — '+hit.obstacle+'.':reach;
  }
  clickDrawer(item){
    const m=this.wardrobeMotion,key=drawerKey(item);
    if(!m.open||cabinetId(item)!==m.id||!item.item_id.endsWith('-face')||!key)return false;
    m.toggleDrawer(key);m.contact=null;m.message='';
    if(m.requested)this.checkDrawerTravel(this.wardrobeChecks(),key);
    this.onWardrobeChanged?.();this.invalidate();return true;
  }
  setLayer(value){this.layer=value;this.renderer.shadowMap.needsUpdate=true;this.sync();}
  highlight(error=''){
    const items=this.adapter.items,it=this.adapter.selected,entry=it?this.liveEntry(it.item_id,items):null;
    let grouped=this.selectionScope!=='module';const show=!this.preview&&!this.xrayEnabled;
    if(grouped&&!items.some(item=>scopeMatches(item,this.selectionScope))){this.selectionScope='module';grouped=false;}
    for(const [id,box]of this.kitchenBoxes)if(!this.liveEntry(id,items)){this.disposeTree(box);this.kitchenBoxes.delete(id);}
    for(const [id,e]of this.entries){
      const item=items.find(it=>it.item_id===id);if(!item||!this.liveEntry(id,items))continue;
      let box=this.kitchenBoxes.get(id);
      const heightPreview=this.heightHighlights?.has(id);
      if((grouped||heightPreview)&&!box){box=this.selectionBox();this.scene.add(box);this.kitchenBoxes.set(id,box);}
      if(box){this.selectionColor(box,SELECTION_BLUE);box.visible=Boolean(!this.client&&show&&e.group.visible&&(heightPreview||grouped&&scopeMatches(item,this.selectionScope)));if(box.visible)box.box.setFromObject(e.group).expandByScalar(.003);}
    }
    this.selectedBox.visible=Boolean(!this.client&&!grouped&&entry?.group.visible&&show);
    if(this.selectedBox.visible){if(this.cabinetSelection&&this.cabinetSelection===cabinetId(it)){
      const b=bounds(cabinetEnvelope(it.assistant_carcass),this.adapter.room);
      this.selectedBox.box.min.set(b.minX*S,b.minY*S,b.minZ*S);this.selectedBox.box.max.set(b.maxX*S,b.maxY*S,b.maxZ*S);
    }else this.selectedBox.box.setFromObject(entry.group);
    this.selectedBox.box.expandByScalar(.003);this.selectionColor(this.selectedBox,error?'#bf6c43':SELECTION_BLUE);}
    else this.selectedBox.box.makeEmpty();
    this.placeLabel();if(this.equipmentSelected&&!this.adapter.selected&&!this.equipmentPreview){const f=this.adapter.room.features?.find(f=>f.id===this.equipmentSelected.id);if(f)this.highlightEquipment(f);else this.equipmentSelected=null;}
  }
  hover(id){const entry=this.liveEntry(id);this.hoverBox.visible=Boolean(!this.xrayEnabled&&entry?.group.visible&&id!==this.adapter.selected?.item_id&&!this.preview&&!document.body.classList.contains('planner-client'));if(this.hoverBox.visible)this.hoverBox.box.setFromObject(entry.group).expandByScalar(.003);else this.hoverBox.box.makeEmpty();this.invalidate();}
  placeLabel(){
    if(this.onDimensionsRender){this.onDimensionsRender();return;}
    const label=document.getElementById('planner-dimension');if(!label)return;
    const it=this.adapter.selected;
    label.hidden=!it||!this.selectedBox.visible||Boolean(this.preview)||document.body.classList.contains('planner-client');if(label.hidden)return;
    const b=this.selectedBox.box,p=new THREE.Vector3((b.min.x+b.max.x)/2,b.max.y,(b.min.z+b.max.z)/2).project(this.camera);
    label.style.left=Math.max(90,Math.min(this.width-90,(p.x+1)*this.width/2))+'px';label.style.top=Math.max(65,Math.min(this.height-65,(1-p.y)*this.height/2-35))+'px';
    label.textContent=it.width+' × '+it.height+' × '+it.depth+' мм';
  }
  cameraBox(which){
    const b=new THREE.Box3();
    const id=which==='wardrobe'?this.wardrobeMotion?.id:which==='selected'?this.cabinetSelection:null;
    if(id){
      const members=this.adapter.items.filter(it=>cabinetId(it)===id);
      for(const it of members){const entry=this.entries.get(it.item_id);if(entry)b.expandByObject(entry.group);}
      if(!b.isEmpty())return b;
    }
    if(which==='room'||!this.adapter.items.length){const r=this.adapter.room;return b.set(new THREE.Vector3(-r.width*S/2,0,-r.depth*S/2),new THREE.Vector3(r.width*S/2,r.height*S,r.depth*S/2));}
    for(const it of this.adapter.items){if(which==='selected'&&it.item_id!==this.adapter.selected?.item_id)continue;const e=this.entries.get(it.item_id);if(e&&(e.group.visible||which==='selected'))b.expandByObject(e.group);}
    for(const g of this.dressing?.children||[]){
      if(which==='selected'?!g.userData.members.includes(this.adapter.selected?.item_id):!g.visible)continue;
      // Fit the slab too, without changing the cabinet collision/export envelope.
      if(which!=='selected'||g.userData.members.length===1)b.expandByObject(g);
    }
    if(which!=='selected'&&this.wallFinishes)b.expandByObject(this.wallFinishes.root);
    return b.isEmpty()?this.cameraBox('room'):b;
  }
  fit(which='kitchen'){
    if(this.client&&this.mode==='3d'&&which==='kitchen')return this.fitKitchenForClient();
    this.resize();this.stopOrbitInertia();
    this.perspective.clearViewOffset();
    const box=this.cameraBox(which),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    this.controls.target.copy(center);
    if(this.mode==='3d'){
      // Fit the actual projected corners, not a bounding sphere. A long
      // kitchen now uses the canvas instead of leaving a room-sized margin.
      const presentation=this.client&&which!=='room';
      const first=this.adapter.items?.[0],group=cabinetId(first);
      const single=which==='kitchen'&&group&&this.adapter.items.every(it=>cabinetId(it)===group);
      const wardrobe=which==='wardrobe'||which==='selected'&&this.cabinetSelection||single;
      const rotation=(single?first:this.adapter.selected)?.rotation||0;
      const dir=(wardrobe?new THREE.Vector3(.34,.15,1).applyAxisAngle(new THREE.Vector3(0,1,0),-rotation*Math.PI/180):which==='room'?new THREE.Vector3(.65,.42,1):presentation?new THREE.Vector3(.24,.22,1).applyAxisAngle(new THREE.Vector3(0,1,0),-this.kitchenRotation()*Math.PI/180):new THREE.Vector3(.50,.29,1)).normalize();
      const viewport=wardrobe?this.clientViewport():null;
      const padH=viewport?.width/this.width*.86||(which==='room'?.84:presentation?.82:this.width<=760?.66:.80);
      const padV=viewport?.height/this.height*.84||(which==='room'?.78:presentation?.73:.70);
      if(viewport)this.perspective.setViewOffset(this.width,this.height,(this.width-viewport.width)/2-viewport.left,(this.height-viewport.height)/2-viewport.top,this.width,this.height);
      const right=new THREE.Vector3(0,1,0).cross(dir).normalize();
      const up=dir.clone().cross(right).normalize();
      const tanV=Math.tan(this.perspective.fov*Math.PI/360),tanH=tanV*this.perspective.aspect;
      let distance=1.2;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const delta=new THREE.Vector3(x,y,z).sub(center),towardsCamera=delta.dot(dir);
        distance=Math.max(distance,towardsCamera+Math.abs(delta.dot(right))/(tanH*padH),towardsCamera+Math.abs(delta.dot(up))/(tanV*padV));
      }
      this.camera.up.set(0,1,0);this.camera.position.copy(center).addScaledVector(dir,distance);
    }else{
      const distance=20;
      const direction=this.mode==='top'?new THREE.Vector3(0,1,0):this.mode==='left'?new THREE.Vector3(-1,0,0):this.mode==='right'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
      this.camera.up.set(0,this.mode==='top'?0:1,this.mode==='top'?-1:0);this.camera.position.copy(center).addScaledVector(direction,distance);
      const horizontal=this.mode==='left'||this.mode==='right'?size.z:size.x,vertical=this.mode==='top'?size.z:size.y;
      // Keep room wall dimensions clear of the toolbar and size overview.
      this.orthoSpan=Math.max(.35,vertical/2,horizontal/2/(this.width/this.height))*(which==='room'?1.65:1.4);this.camera.zoom=1;this.resize();
    }
    this.controls.update();this.camera.updateMatrixWorld();this.invalidate();
  }
  clientViewport(){
    if(this.exportSize)return {left:0,top:0,width:this.width,height:this.height};
    const r=this.canvas.getBoundingClientRect();let left=16,top=16,right=r.width-16,bottom=r.height-16;
    const visible=el=>el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
    const bar=document.querySelector('.mf3d-stagebar');if(visible(bar))top=Math.max(top,bar.getBoundingClientRect().bottom-r.top+16);
    for(const id of ['workspace-library','workspace-inspector','planner-room-settings','workspace-cutlist','planner-mobile-nav']){
      const el=document.getElementById(id);if(!visible(el)||el.inert)continue;
      if(el.tagName==='DETAILS'&&!el.open)continue;
      const b=el.getBoundingClientRect(),x=b.left-r.left,y=b.top-r.top;
      if(b.width>r.width*.7&&y>r.height*.4)bottom=Math.min(bottom,y-16);
      else if(b.height>r.height*.2&&x<r.width*.45)left=Math.max(left,x+b.width+16);
      else if(b.height>r.height*.2&&x>r.width*.5)right=Math.min(right,x-16);
    }
    return {left,top,width:Math.max(120,right-left),height:Math.max(120,bottom-top)};
  }
  fitKitchenForClient(view=this.clientView||'threeQuarter'){
    if(view==='room'&&this.renderRooms.room)return this.fitRenderRoom();
    // Kitchen, backsplash and wall profiles; exclude the room shell and labels.
    const box=new THREE.Box3();
    for(const e of this.entries.values())if(e.group.visible)box.expandByObject(e.group);
    if(view!=='wardrobe')for(const g of this.dressing?.children||[])if(g.visible)box.expandByObject(g);
    if(view!=='wardrobe'&&this.wallFinishes)box.expandByObject(this.wallFinishes.root);
    if(box.isEmpty())return this.fit('room');
    this.stopOrbitInertia();this.clientView=view;this.mode='3d';this.camera=this.perspective;
    this.controls.object=this.camera;this.controls.enableRotate=true;this.controls.minPolarAngle=0;this.controls.maxPolarAngle=Math.PI*.495;
    this.camera.fov=32;this.camera.zoom=1;this.camera.clearViewOffset();this.resize();
    const center=box.getCenter(new THREE.Vector3()),axis=new THREE.Vector3(0,1,0);
    const rotation=view==='wardrobe'?this.renderRotation():this.kitchenRotation();
    const dir=(view==='wardrobe'?new THREE.Vector3(.32,0,1):view==='front'?new THREE.Vector3(.035,.055,1):view==='left'?new THREE.Vector3(-.6,.22,1):view==='right'?new THREE.Vector3(.6,.22,1):new THREE.Vector3(.38,.14,1)).applyAxisAngle(axis,-rotation*Math.PI/180).normalize();
    const right=axis.clone().cross(dir).normalize(),up=dir.clone().cross(right).normalize(),points=[];
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){
      const p=new THREE.Vector3(x,y,z).sub(center);points.push({x:p.dot(right),y:p.dot(up),z:p.dot(dir)});
    }
    const viewport=this.clientViewport(),frame=clientFrame(points,this.width,this.height,viewport,this.camera.fov);
    this.controls.target.copy(center);this.camera.up.set(0,1,0);this.camera.position.copy(center).addScaledVector(dir,frame.distance);
    // Shift the optical centre into the uncovered canvas; Raycaster uses this
    // same projection matrix. Camera movement remains entirely user controlled.
    this.camera.setViewOffset(this.width,this.height,frame.offsetX,frame.offsetY,this.width,this.height);
    this.controls.update();this.camera.updateMatrixWorld();this.invalidate();
    this.clientFit={...frame,viewport,view,fov:this.camera.fov};return this.clientFit;
  }
  captureView(){const v=this.perspective.view;return {mode:this.mode,aspect:this.width/this.height,position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray(),zoom:this.camera.zoom,orthoSpan:this.orthoSpan||3,fov:this.perspective.fov,viewOffset:v?.enabled?[v.offsetX/v.fullWidth,v.offsetY/v.fullHeight]:[0,0]};}
  stopOrbitInertia(){const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;}
  restoreView(view){
    if(!view)return;this.stopOrbitInertia();this.mode=view.mode;this.camera=this.mode==='3d'?this.perspective:this.ortho;this.controls.object=this.camera;this.controls.enableRotate=this.mode==='3d';
    this.controls.minPolarAngle=0;this.controls.maxPolarAngle=this.mode==='3d'?Math.PI*.495:Math.PI;
    this.camera.position.fromArray(view.position);this.controls.target.fromArray(view.target);this.camera.up.fromArray(view.up);this.camera.zoom=view.zoom;this.orthoSpan=view.orthoSpan;
    this.perspective.fov=view.fov||32;this.perspective.clearViewOffset();this.resize();
    if(view.viewOffset?.some(Boolean))this.perspective.setViewOffset(this.width,this.height,view.viewOffset[0]*this.width,view.viewOffset[1]*this.height,this.width,this.height);
    this.controls.update();this.camera.updateMatrixWorld();this.invalidate();
  }
  setView(mode){
    if(mode!=='3d'&&!this.exportSize){this.wardrobeMotion?.reset();this.wardrobeMotion?.pose(this.entries,this.adapter.items);}
    this.mode=mode;this.camera=mode==='3d'?this.perspective:this.ortho;this.controls.object=this.camera;this.controls.enableRotate=mode==='3d';
    this.controls.minPolarAngle=0;this.controls.maxPolarAngle=mode==='3d'?Math.PI*.495:Math.PI;
    if(mode==='3d')this.camera.up.set(0,1,0);this.fit('kitchen');
  }
  zoom(delta){if(this.mode==='3d'){const v=this.camera.position.clone().sub(this.controls.target);v.multiplyScalar(delta>0?.85:1.18);if(v.length()>.4&&v.length()<30)this.camera.position.copy(this.controls.target).add(v);}else{this.camera.zoom=Math.max(.15,Math.min(12,this.camera.zoom*(delta>0?1.2:.84)));this.camera.updateProjectionMatrix();}this.invalidate();}
  cast(clientX,clientY){
    const r=this.canvas.getBoundingClientRect();this.ndc.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
    this.camera.updateMatrixWorld();this.scene.updateMatrixWorld(true);this.raycaster.setFromCamera(this.ndc,this.camera);
    return this.raycaster;
  }
  pick(x,y){
    const ray=this.cast(x,y),visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    const roots=this.adapter.items.map(it=>this.liveEntry(it.item_id)).filter(e=>e?.group.visible).map(e=>e.group);
    for(const entry of this.roomFeatures||[])if(isEquipment(entry.group.userData.kind))roots.push(entry.group,entry.plan);
    let shell=null;
    for(const hit of ray.intersectObjects(roots,true)){
      const mesh=hit.object;if(!mesh.isMesh||!visible(mesh))continue;
      const data=mesh.userData,id=data.itemId;
      if(id){
        const result={id,point:hit.point};
        if(!this.xrayEnabled)return result;
        const item=this.adapter.items.find(it=>it.item_id===id);
        if(isInterior(item))return result;
        const panel=data.part;
        if(!cabinetId(item)&&(data.shelfId||data.role==='shelf'||/shelf|divider|drawer-bottom/.test(panel?.key||''))){
          result.part={name:panel?.name||'Внутренняя полка',itemId:id};return result;
        }
        if(!shell)shell=result;
      }else for(let p=mesh;p;p=p.parent)if(p.userData.roomFeatureId)return shell||{featureId:p.userData.roomFeatureId,point:hit.point};
    }return shell;
  }
  equipmentPlane(f,hit){
    if(['front','left','right'].includes(this.mode)){const normal=new THREE.Vector3();this.camera.getWorldDirection(normal);normal.y=0;normal.normalize();const b=featureBox(f,this.adapter.room);return new THREE.Plane().setFromNormalAndCoplanarPoint(normal,hit||new THREE.Vector3(b.x*S,b.y*S,b.z*S));}
    return new THREE.Plane(new THREE.Vector3(0,1,0),-(hit?.y??(f.elevation+f.height/2)*S));
  }
  highlightEquipment(f,error=''){
    const previous=this.equipmentSelected;this.equipmentSelected=f;if(!f){if(previous&&!this.adapter.selected){this.selectedBox.visible=false;this.invalidate();}return;}
    const b=featureBox(f,this.adapter.room);this.selectedBox.box.min.set((b.x-b.w/2)*S,(b.y-b.h/2)*S,(b.z-b.d/2)*S);this.selectedBox.box.max.set((b.x+b.w/2)*S,(b.y+b.h/2)*S,(b.z+b.d/2)*S);
    this.selectionColor(this.selectedBox,error?'#b65336':SELECTION_BLUE);this.selectedBox.visible=!this.client&&!this.xrayEnabled;this.invalidate();
  }
  previewEquipment(f,error=''){
    if(this.equipmentPreview?.id!==f.id){
      this.clearEquipmentPreview();let entry=(this.roomFeatures||[]).find(e=>e.group.userData.roomFeatureId===f.id),created=false;
      if(!entry){created=true;const group=new THREE.Group();this.roomRoot.add(group);if(f.kind==='window')group.add(windowEquipment(f,this.factory.geometry,this.roomPalette));else{const fallback=equipmentFallback(f.kind,this.factory.geometry);fallback.scale.set(f.width*S,f.height*S,f.projection*S);group.add(fallback);attachRoomEquipment(this,group,f,fallback);}entry={group};}
      this.equipmentPreview={id:f.id,entry,created};
    }
    const {entry}=this.equipmentPreview,b=featureBox(f.kind==='window'?{...f,projection:0}:f,this.adapter.room,0);entry.group.position.set(b.x*S,b.y*S,b.z*S);entry.group.rotation.y=socketRotation(f.wall);entry.group.visible=this.mode!=='top';
    if(entry.plan){entry.plan.visible=false;}
    // The measured outline remains visible in the top view while the object moves.
    this.highlightEquipment(f,error);this.renderer.shadowMap.needsUpdate=true;this.invalidate();
  }
  clearEquipmentPreview(){
    const p=this.equipmentPreview;this.equipmentPreview=null;if(!p)return;
    if(p.created){if(p.entry.group.parent)this.disposeTree(p.entry.group);}
    else{const f=this.adapter.room.features?.find(f=>f.id===p.id);if(f&&p.entry.group.parent===this.roomRoot){const b=featureBox(f.kind==='window'?{...f,projection:0}:f,this.adapter.room,0);p.entry.group.position.set(b.x*S,b.y*S,b.z*S);p.entry.group.rotation.y=socketRotation(f.wall);}}
    this.renderer.shadowMap.needsUpdate=true;this.highlight();this.invalidate();
  }
  planePoint(x,y,plane){const point=new THREE.Vector3();return this.cast(x,y).ray.intersectPlane(plane,point)?point:null;}
  makePlane(it,hit){
    if(this.mode==='front'||this.mode==='left'||this.mode==='right'){
      const normal=new THREE.Vector3();this.camera.getWorldDirection(normal);normal.y=0;normal.normalize();return new THREE.Plane().setFromNormalAndCoplanarPoint(normal,hit||new THREE.Vector3(it.x*S,elevation(it,this.adapter.room)*S,it.z*S));
    }
    return new THREE.Plane(new THREE.Vector3(0,1,0),-(hit?.y??elevation(it,this.adapter.room)*S));
  }
  pixelThreshold(it){const distance=this.camera.position.distanceTo(this.controls.target);return this.mode==='3d'?Math.max(15,Math.min(85,distance*1000*.018)):Math.max(12,Math.min(85,2*this.orthoSpan/this.camera.zoom/this.height*1000*14));}
  previewHookHeight(itemId,height){
    const group=this.entries.get(itemId)?.group;
    if(!group)return;
    for(const mesh of group.children)if(mesh.userData.blankHook)mesh.position.y=height*S;
    this.renderer.shadowMap.needsUpdate=true;
    this.invalidate();
  }
  showPreview(it,error,guides=[]){
    this.previewItems=[it];
    if(!this.preview||this.preview.userData.itemId!==it.item_id||this.previewSignature!==this.factory.signature(it)){
      this.factory.release(this.preview);this.preview=this.factory.build(it,true);this.previewSignature=this.factory.signature(it);this.scene.add(this.preview);
    }
    this.factory.position(this.preview,it);const existing=this.entries.get(it.item_id);if(existing&&existing.group.visible){existing.group.visible=false;this.renderer.shadowMap.needsUpdate=true;}
    this.selectedBox.visible=false;this.hoverBox.visible=false;for(const box of this.kitchenBoxes.values())box.visible=false;
    this.preview.traverse(m=>{if(m.isMesh)m.material.color.set(error?'#d1976d':'#82b6ff');});
    this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);
    const r=this.adapter.room,span=Math.max(it.width,it.depth)+450;
    for(const g of guides){let a,b;if(g.axis==='x'){a=new THREE.Vector3(g.value*S,.004,Math.max(-r.depth/2,it.z-span)*S);b=new THREE.Vector3(g.value*S,.004,Math.min(r.depth/2,it.z+span)*S);}else if(g.axis==='z'){a=new THREE.Vector3(Math.max(-r.width/2,it.x-span)*S,.004,g.value*S);b=new THREE.Vector3(Math.min(r.width/2,it.x+span)*S,.004,g.value*S);}else{a=new THREE.Vector3(-r.width*S/2,g.value*S,it.z*S);b=new THREE.Vector3(r.width*S/2,g.value*S,it.z*S);}
      const geometry=new THREE.BufferGeometry().setFromPoints([a,b]);const line=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:error?0xbd794a:SELECTION_BLUE,depthTest:false,transparent:true,opacity:.9,dashSize:.045,gapSize:.025}));line.computeLineDistances();line.userData.ownMaterial=true;line.renderOrder=30;this.guides.add(line);
    }
    this.invalidate();
  }
  clearGroupPreview(){for(const entry of this.groupPreviews?.values()||[])this.factory.release(entry.group);this.groupPreviews=new Map();if(this.dressing)this.dressing.visible=true;}
  showGroupPreview(items,error,guides=[]){
    this.showPreview(items[0],error,guides);this.groupPreviews??=new Map();
    this.previewItems=items;
    const ids=new Set(items.slice(1).map(it=>it.item_id));
    for(const [id,entry]of this.groupPreviews)if(!ids.has(id)){this.factory.release(entry.group);this.groupPreviews.delete(id);}
    for(const it of items.slice(1)){
      let entry=this.groupPreviews.get(it.item_id),signature=this.factory.signature(it);
      if(!entry||entry.signature!==signature){if(entry)this.factory.release(entry.group);entry={group:this.factory.build(it,true),signature};this.groupPreviews.set(it.item_id,entry);this.scene.add(entry.group);}
      this.factory.position(entry.group,it);entry.group.traverse(m=>{if(m.isMesh)m.material.color.set(error?'#d1976d':'#82b6ff');});
      const original=this.entries.get(it.item_id);if(original)original.group.visible=false;
    }
    if(this.dressing)this.dressing.visible=false;this.renderer.shadowMap.needsUpdate=true;this.invalidate();
  }
  clearPreview(){this.previewItems=null;this.clearGroupPreview();this.renderer.shadowMap.needsUpdate=true;this.factory.release(this.preview);this.preview=null;this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);this.sync();}
  projectPoint(point){this.camera.updateMatrixWorld();const p=new THREE.Vector3(point.x*S,point.y*S,point.z*S).project(this.camera),r=this.canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  dispose(){this.dead=true;this.wallFinishes?.dispose();this.socketAssets?.dispose();this.roomEquipmentAssets?.dispose();this.previews?.dispose();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.canvas.removeEventListener('webglcontextlost',this.lost);this.controls.dispose();this.disposeTree(this.roomRoot);this.surfaces?.disposeMaps();this.disposeTree(this.guides);this.disposeTree(this.selectedBox);this.disposeTree(this.hoverBox);this.disposeTree(this.wardrobeContact);for(const box of this.kitchenBoxes.values())this.disposeTree(box);this.kitchenBoxes.clear();this.factory.dispose();this.boardRelief.dispose();this.studioEnvironment?.dispose();this.studioRender?.dispose();this.sun.shadow.dispose();this.renderer.dispose();}
}
