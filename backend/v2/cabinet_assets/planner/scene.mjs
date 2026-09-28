import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {MeshFactory,CataloguePreviews} from './module-mesh.mjs';
import {MM_TO_WORLD as S,bounds,elevation,tier,kitchenSettings} from './furniture-core.mjs';
import {roomSettings,LIGHTS} from './room-state.mjs';
import {clientFrame} from './client-camera.mjs';
export class PlannerScene{
  constructor(canvas,adapter,onLost){
    this.canvas=canvas;this.adapter=adapter;this.onLost=onLost;this.mode='3d';this.layer='all';this.entries=new Map();this.frame=0;this.dead=false;
    this.displayMode='normal';this.displayItemId=null;this.selectionScope='module';this.kitchenBoxes=new Map();
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.03;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#ede9e2');
    this.hemi=new THREE.HemisphereLight('#fffdf8','#b9ab94',1.0);this.scene.add(this.hemi);
    // Small procedural studio environment: 128x64 source, no HDRI download or room decor.
    const ew=128,eh=64,data=new Float32Array(ew*eh*4);
    const keyDirection=new THREE.Vector3(-.45,.65,1).normalize(),fillDirection=new THREE.Vector3(.85,.35,.5).normalize(),n=new THREE.Vector3();
    for(let y=0;y<eh;y++)for(let x=0;x<ew;x++){
      const theta=(y+.5)/eh*Math.PI,phi=(x+.5)/ew*Math.PI*2;
      n.set(Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi));
      const light=.18+.25*(n.y+1)/2+3*Math.pow(Math.max(0,n.dot(keyDirection)),10)+1.5*Math.pow(Math.max(0,n.dot(fillDirection)),8),i=(y*ew+x)*4;
      data[i]=light;data[i+1]=light*.995;data[i+2]=light*.98;data[i+3]=1;
    }
    const source=new THREE.DataTexture(data,ew,eh,THREE.RGBAFormat,THREE.FloatType);source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
    const pmrem=new THREE.PMREMGenerator(this.renderer);this.studioEnvironment=pmrem.fromEquirectangular(source);source.dispose();pmrem.dispose();
    this.scene.environment=this.studioEnvironment.texture;this.scene.environmentIntensity=.55;
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
    this.factory=new MeshFactory(adapter,()=>{this.invalidate();this.onVisualChanged?.();});this.root=new THREE.Group();this.scene.add(this.root);
    this.guides=new THREE.Group();this.scene.add(this.guides);
    this.selectedBox=new THREE.Box3Helper(new THREE.Box3(),0x346d4a);this.selectedBox.material.depthTest=true;this.selectedBox.material.transparent=true;this.selectedBox.material.opacity=.78;this.selectedBox.renderOrder=20;this.selectedBox.visible=false;this.scene.add(this.selectedBox);
    this.hoverBox=new THREE.Box3Helper(new THREE.Box3(),0x9cb49b);this.hoverBox.material.depthTest=true;this.hoverBox.material.transparent=true;this.hoverBox.material.opacity=.65;this.hoverBox.visible=false;this.scene.add(this.hoverBox);
    this.raycaster=new THREE.Raycaster();this.ndc=new THREE.Vector2();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);
    this.lost=e=>{e.preventDefault();if(!this.dead)this.onLost();};canvas.addEventListener('webglcontextlost',this.lost);
    this.resize();this.sync();this.fit('room');this.previews=new CataloguePreviews(this);
  }
  invalidate(){if(!this.dead&&!this.frame)this.frame=requestAnimationFrame(()=>this.render());}
  render(){
    this.frame=0;if(this.dead)return;
    this.controls.update();this.camera.updateMatrixWorld();
    const r=this.adapter.room;
    if(this.walls)this.walls.forEach(w=>{w.visible=this.mode!=='top'&&(w.userData.axis==='x'?this.camera.position.x*w.userData.sign<r.width*S/2-.02:this.camera.position.z*w.userData.sign<r.depth*S/2-.02);if(w.userData.trim)w.userData.trim.visible=w.visible;});
    if(this.contacts)for(const m of this.contacts.children){const wall=m.userData.wall;const tierVisible=this.layer==='all'||m.userData.tier===this.layer;m.visible=tierVisible&&m.userData.contactItem!==this.preview?.userData.itemId&&(!wall||this.mode!=='top'&&this.camera.position[wall.axis]*wall.sign<(wall.axis==='x'?r.width:r.depth)*S/2-.02);}
    if(this.grid){this.grid.visible=!this.client;this.grid.material.opacity=this.mode==='top'?.14:.035;}
    if(this.clientFloor)this.clientFloor.visible=Boolean(this.client);
    if(this.floorJoints)this.floorJoints.visible=!this.client||!this.clientFloor;
    this.renderer.render(this.scene,this.camera);this.placeLabel();
  }
  resize(){
    if(this.dead)return;const r=this.canvas.parentElement.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);
    this.renderer.setSize(this.width,this.height,false);this.perspective.aspect=this.width/this.height;
    const v=this.perspective.view;if(v?.enabled)this.perspective.setViewOffset(this.width,this.height,v.offsetX*this.width/v.fullWidth,v.offsetY*this.height/v.fullHeight,this.width,this.height);
    this.perspective.updateProjectionMatrix();
    const span=this.orthoSpan||3;this.ortho.left=-span*this.width/this.height;this.ortho.right=-this.ortho.left;this.ortho.top=span;this.ortho.bottom=-span;this.ortho.updateProjectionMatrix();this.invalidate();
  }
  disposeTree(group){
    if(!group)return;group.traverse(o=>{if(o.geometry&&!this.factory.ownsGeometry(o.geometry))o.geometry.dispose();if(o.userData.ownMaterial)o.material?.dispose();});group.removeFromParent();
  }
  roomMesh(){
    this.disposeTree(this.roomRoot);this.floorTexture?.dispose();this.floorTexture=null;this.clientFloor=null;this.floorJoints=null;this.roomRoot=new THREE.Group();this.scene.add(this.roomRoot);const r=this.adapter.room,settings=roomSettings(this.adapter.state?.displaySettings);
    // Flush overlay backs share the wall plane. Bias only the visual room surface, never cabinet geometry.
    const make=(w,h,d,x,y,z,color,wall=false)=>{const material=new THREE.MeshStandardMaterial({color,roughness:wall?.92:.82,polygonOffset:wall,polygonOffsetFactor:1,polygonOffsetUnits:4});const m=new THREE.Mesh(this.factory.geometry,material);m.userData.ownMaterial=true;m.scale.set(w*S,h*S,d*S);m.position.set(x*S,y*S,z*S);m.receiveShadow=true;this.roomRoot.add(m);return m;};
    const floor=make(r.width,20,r.depth,0,-12,0,settings.floorMaterial==='oak'?'#ffffff':settings.floorMaterial==='concrete'?'#b8b7b3':'#d9d8d1');this.walls=[];
    floor.material.roughness=settings.floorMaterial==='oak'?.78:.94;
    if(settings.floorMaterial==='oak'){
      const texture=new THREE.TextureLoader().load('/account/planner/materials/egger-h1180-st37.jpg',()=>this.invalidate(),undefined,()=>{if(this.floorTexture===texture){for(const m of [floor,this.clientFloor].filter(Boolean)){m.material.map=null;m.material.color.set('#bca585');m.material.needsUpdate=true;}this.invalidate();}});
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(r.width/1300,r.depth/2800);texture.anisotropy=4;floor.material.map=texture;this.floorTexture=texture;
      // Environment floor only: 190 x 1200 mm staggered boards, UVs in physical
      // millimetres of the existing scan. One draw call, no new decor assets.
      const positions=[],uvs=[],colors=[],width=190,length=1200;
      for(let col=0,x=-r.width/2;x<r.width/2;col++,x+=width){
        let row=0;for(let z=-r.depth/2-(col%3)*400;z<r.depth/2;row++,z+=length){
          const x0=x+.5,x1=Math.min(x+width,r.width/2)-.5,z0=Math.max(z,-r.depth/2)+.5,z1=Math.min(z+length,r.depth/2)-.5;
          const u=(col*431+row*193)%1100,v=(col*733+row*557)%1500,tint=.965+((col*7+row*3)%5)*.007;
          for(const [px,pz]of [[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]){
            positions.push(px*S,-.001,pz*S);uvs.push((px-x+u)/r.width,(pz-z+v)/r.depth);colors.push(tint,tint,tint);
          }
        }
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
      const material=new THREE.MeshStandardMaterial({color:'#d8d5cd',map:texture,roughness:.88,metalness:0,vertexColors:true});
      this.clientFloor=new THREE.Mesh(geometry,material);this.clientFloor.userData={ownMaterial:true,visualOnly:true,plankSizeMm:[width,length],scanSizeMm:[1300,2800]};this.clientFloor.receiveShadow=true;this.clientFloor.raycast=()=>{};this.roomRoot.add(this.clientFloor);
    }
    for(const sign of[-1,1]){
      const z=make(r.width,r.height,20,0,r.height/2,sign*(r.depth/2+10),settings.wallColor,true);z.userData.axis='z';z.userData.sign=sign;this.walls.push(z);
      const x=make(20,r.height,r.depth,sign*(r.width/2+10),r.height/2,0,settings.wallColor,true);x.userData.axis='x';x.userData.sign=sign;this.walls.push(x);
      z.userData.trim=make(r.width,65,9,0,32.5,sign*(r.depth/2-4),'#edece7');
      x.userData.trim=make(9,65,r.depth,sign*(r.width/2-4),32.5,0,'#edece7');
    }
    const joints=[],plank=settings.floorMaterial==='oak',step=plank?190:600;
    if(settings.floorMaterial!=='concrete'){
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
    this.selectionScope='module';this.displayMode='normal';this.displayItemId=null;
    this.selectedBox.visible=false;this.selectedBox.box.makeEmpty();
    this.hoverBox.visible=false;this.hoverBox.box.makeEmpty();
    for(const box of this.kitchenBoxes.values()){box.geometry.dispose();box.material.dispose();box.removeFromParent();}
    this.kitchenBoxes.clear();this.placeLabel();
  }
  resetProject(){
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
    // A restore replaces the scene document even when module IDs are reused.
    // Release the old object graph before room/presentation can call highlight.
    if(this.syncedState!==this.adapter.state){
      // Undo/Redo may keep the kitchen scope, but never its old mesh references.
      // Project navigation clears that scope in before-project.
      const keepKitchen=this.selectionScope==='kitchen'&&this.adapter.items.some(it=>this.entries.has(it.item_id));
      this.resetProject();if(keepKitchen)this.selectionScope='kitchen';this.syncedState=this.adapter.state;
    }
    const ids=new Set(this.adapter.items.map(it=>it.item_id));
    for(const [id,entry]of this.entries)if(!ids.has(id)){this.factory.release(entry.group);this.entries.delete(id);this.renderer.shadowMap.needsUpdate=true;}
    this.hover(null);
    if(this.selectionScope==='kitchen'&&!this.adapter.items.some(it=>kitchenSettings(it)))this.clearSelection();
    if(this.selectionScope!=='kitchen'&&this.displayItemId!==this.adapter.selected?.item_id){this.displayMode='normal';this.displayItemId=this.adapter.selected?.item_id||null;}
    const roomKey=JSON.stringify([this.adapter.room,roomSettings(this.adapter.state?.displaySettings)]);if(this.roomKey!==roomKey){this.roomKey=roomKey;this.roomMesh();this.setPresentation(document.body.classList.contains('planner-client'));}
    for(const it of this.adapter.items){
      const signature=this.factory.signature(it);let entry=this.entries.get(it.item_id);
      if(!entry||entry.group.parent!==this.root||entry.signature!==signature){if(entry)this.factory.release(entry.group);entry={group:this.factory.build(it),signature};this.entries.set(it.item_id,entry);this.root.add(entry.group);this.renderer.shadowMap.needsUpdate=true;}
      this.factory.position(entry.group,it);entry.group.visible=this.layer==='all'||tier(it)===this.layer;
      if(this.factory.updateAppearance(entry.group,it,this.selectionScope==='kitchen'&&kitchenSettings(it)||it.item_id===this.displayItemId?this.displayMode:'normal'))this.renderer.shadowMap.needsUpdate=true;
    }
    const dressing=JSON.stringify(this.adapter.items.map(it=>[it.item_id,it.x,it.z,it.rotation,it.width,it.height,it.depth,it.elevation_mm,it.base,it.base_height,it.worktop_thickness,kitchenSettings(it)]));
    if(this.dressingKey!==dressing){this.dressingKey=dressing;this.factory.release(this.dressing);this.dressing=this.factory.dress(this.adapter.items);this.scene.add(this.dressing);this.contacts?.removeFromParent();this.contacts=this.factory.contacts(this.adapter.items);this.scene.add(this.contacts);this.fitShadow();}
    if(this.dressing){
      const merged=new Set(this.dressing.userData.mergedPlinthIds||[]);
      for(const [id,entry]of this.entries)entry.group.traverse(m=>{if(m.userData.role==='plinth')m.visible=!merged.has(id);});
      for(const g of this.dressing.children){
        g.visible=this.layer==='all'||g.userData.tier===this.layer;
        if(g.userData.productionRun)g.traverse(m=>{if(m.isMesh&&m.userData.part)m.material=this.factory.material(m.userData.role,m.userData.part.material.variant_id);});
      }
    }
    this.factory.pruneMaterials([this.root,this.dressing,this.preview]);
    this.highlight();this.invalidate();
  }
  setDisplayMode(mode){
    if(!['normal','inspection','facadesHidden'].includes(mode)||!this.adapter.selected)return;
    this.displayItemId=this.adapter.selected.item_id;this.displayMode=mode;this.sync();
  }
  setPresentation(client){
    this.client=client;const p=LIGHTS[roomSettings(this.adapter.state?.displaySettings).lightingPreset];
    this.sun.color.set(client?p.key:'#fff7e9');this.sun.intensity=client?p.sun:2.1;
    this.fill.color.set(client?p.fill:'#eaf1ff');this.fill.intensity=client?p.fillPower:.65;
    this.hemi.color.set(client?p.sky:'#fffdf8');this.hemi.groundColor.set(client?p.ground:'#b9ab94');this.hemi.intensity=client?p.hemi:1;
    this.scene.background.set(roomSettings(this.adapter.state?.displaySettings).wallColor);
    this.scene.environmentIntensity=client?p.environment:.55;this.renderer.toneMappingExposure=client?p.exposure:1.03;
    // ACES kept after comparing the real U708 preview in the neutral showroom.
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.perspective.fov=client?36:34;if(!client)this.perspective.clearViewOffset();this.perspective.updateProjectionMatrix();
    // Cached shadow map plus analytic contact masks: no fullscreen AO pass.
    this.sun.shadow.intensity=client?.32:.58;this.sun.shadow.radius=client?12:5;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.factory.contactMaterials.floor.opacity=client?.32:.14;this.factory.contactMaterials.wall.opacity=client?.20:.19;
    for(const m of Object.values(this.factory.contactMaterials))m.color.set(client?'#292b29':'#35443b');
    if(this.floorTexture){this.floorTexture.anisotropy=client?Math.min(8,this.renderer.capabilities.getMaxAnisotropy()):4;this.floorTexture.needsUpdate=true;}
    this.fitShadow();this.highlight();this.renderer.shadowMap.needsUpdate=true;this.invalidate();
  }
  kitchenRotation(){
    const weights=new Map();for(const it of this.adapter.items){if(!kitchenSettings(it))continue;const r=it.rotation||0;weights.set(r,(weights.get(r)||0)+it.width);}
    return [...weights].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;
  }
  fitShadow(){
    const box=this.cameraBox('kitchen'),center=box.getCenter(new THREE.Vector3());
    const rotation=-this.kitchenRotation()*Math.PI/180;
    this.sun.target.position.copy(center);this.sun.position.copy(center).add(this.client?new THREE.Vector3(-4,3.8,5).applyAxisAngle(new THREE.Vector3(0,1,0),rotation):new THREE.Vector3(-3,5,7));
    this.fill.position.copy(this.client?center.clone().add(new THREE.Vector3(4,2.3,4).applyAxisAngle(new THREE.Vector3(0,1,0),rotation)):new THREE.Vector3(4,3,1));this.fill.target.position.copy(this.client?center:new THREE.Vector3());this.fill.target.updateMatrixWorld();
    const c=this.sun.shadow.camera;c.position.copy(this.sun.position);c.lookAt(center);c.updateMatrixWorld();
    const local=new THREE.Box3();
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])local.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse));
    c.left=local.min.x-.7;c.right=local.max.x+.7;c.bottom=local.min.y-1.2;c.top=local.max.y+.6;c.near=.1;c.far=60;c.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate=true;
  }
  setLayer(value){this.layer=value;this.renderer.shadowMap.needsUpdate=true;this.sync();}
  highlight(error=''){
    const items=this.adapter.items,it=this.adapter.selected,entry=it?this.liveEntry(it.item_id,items):null;
    const whole=this.selectionScope==='kitchen',show=!this.preview;
    this.selectedBox.material.opacity=this.client?.32:.78;
    for(const [id,box]of this.kitchenBoxes)if(!this.liveEntry(id,items)){box.geometry.dispose();box.material.dispose();box.removeFromParent();this.kitchenBoxes.delete(id);}
    for(const [id,e]of this.entries){
      const item=items.find(it=>it.item_id===id);if(!item||!this.liveEntry(id,items))continue;
      let box=this.kitchenBoxes.get(id);
      if(whole&&!box){box=new THREE.Box3Helper(new THREE.Box3(),0x588575);box.material.transparent=true;box.material.opacity=.58;box.renderOrder=20;this.scene.add(box);this.kitchenBoxes.set(id,box);}
      if(box){box.material.opacity=this.client?.22:.58;box.material.color.set(this.client?'#79796b':'#588575');box.visible=Boolean(whole&&show&&e.group.visible&&kitchenSettings(item));if(box.visible)box.box.setFromObject(e.group).expandByScalar(.003);}
    }
    this.selectedBox.visible=Boolean(!whole&&entry?.group.visible&&show);
    if(this.selectedBox.visible){this.selectedBox.box.setFromObject(entry.group).expandByScalar(.003);this.selectedBox.material.color.set(error?'#bf6c43':this.client?'#79796b':'#346d4a');}
    else this.selectedBox.box.makeEmpty();
    this.placeLabel();
  }
  hover(id){const entry=this.liveEntry(id);this.hoverBox.visible=Boolean(entry?.group.visible&&id!==this.adapter.selected?.item_id&&!this.preview&&!document.body.classList.contains('planner-client'));if(this.hoverBox.visible)this.hoverBox.box.setFromObject(entry.group).expandByScalar(.003);else this.hoverBox.box.makeEmpty();this.invalidate();}
  placeLabel(){
    const label=document.getElementById('planner-dimension');if(!label)return;
    const it=this.adapter.selected;
    label.hidden=!it||!this.selectedBox.visible||Boolean(this.preview)||document.body.classList.contains('planner-client');if(label.hidden)return;
    const b=this.selectedBox.box,p=new THREE.Vector3((b.min.x+b.max.x)/2,b.max.y,(b.min.z+b.max.z)/2).project(this.camera);
    label.style.left=Math.max(90,Math.min(this.width-90,(p.x+1)*this.width/2))+'px';label.style.top=Math.max(65,Math.min(this.height-65,(1-p.y)*this.height/2-35))+'px';
    label.textContent=it.width+' × '+it.height+' × '+it.depth+' мм';
  }
  cameraBox(which){
    const b=new THREE.Box3();
    if(which==='room'||!this.adapter.items.length){const r=this.adapter.room;return b.set(new THREE.Vector3(-r.width*S/2,0,-r.depth*S/2),new THREE.Vector3(r.width*S/2,r.height*S,r.depth*S/2));}
    for(const it of this.adapter.items){if(which==='selected'&&it.item_id!==this.adapter.selected?.item_id)continue;const e=this.entries.get(it.item_id);if(e&&(e.group.visible||which==='selected'))b.expandByObject(e.group);}
    for(const g of this.dressing?.children||[]){
      if(which==='selected'?!g.userData.members.includes(this.adapter.selected?.item_id):!g.visible)continue;
      // Fit the slab too, without changing the cabinet collision/export envelope.
      if(which!=='selected'||g.userData.members.length===1)b.expandByObject(g);
    }
    return b.isEmpty()?this.cameraBox('room'):b;
  }
  fit(which='kitchen'){
    if(this.client&&this.mode==='3d'&&which==='kitchen')return this.fitKitchenForClient();
    this.perspective.clearViewOffset();
    if(this.client)this.stopOrbitInertia();
    const box=this.cameraBox(which),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    this.controls.target.copy(center);
    if(this.mode==='3d'){
      // Fit the actual projected corners, not a bounding sphere. A long
      // kitchen now uses the canvas instead of leaving a room-sized margin.
      const presentation=this.client&&which!=='room';
      const dir=(which==='room'?new THREE.Vector3(.65,.42,1):presentation?new THREE.Vector3(.24,.22,1).applyAxisAngle(new THREE.Vector3(0,1,0),-this.kitchenRotation()*Math.PI/180):new THREE.Vector3(.50,.29,1)).normalize();
      const padH=which==='room'?.84:presentation?.82:.90,padV=which==='room'?.78:presentation?.73:.85;
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
      this.orthoSpan=Math.max(.35,vertical/2,horizontal/2/(this.width/this.height))*1.16;this.camera.zoom=1;this.resize();
    }
    this.controls.update();this.camera.updateMatrixWorld();this.invalidate();
  }
  clientViewport(){
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
    // Furniture and derived kitchen pieces only. No walls, floor, guides or labels.
    const box=new THREE.Box3();
    for(const e of this.entries.values())if(e.group.visible)box.expandByObject(e.group);
    for(const g of this.dressing?.children||[])if(g.visible)box.expandByObject(g);
    if(box.isEmpty())return this.fit('room');
    this.stopOrbitInertia();this.clientView=view;this.mode='3d';this.camera=this.perspective;
    this.controls.object=this.camera;this.controls.enableRotate=true;this.controls.minPolarAngle=0;this.controls.maxPolarAngle=Math.PI*.495;
    this.camera.fov=36;this.camera.zoom=1;this.camera.clearViewOffset();this.resize();
    const center=box.getCenter(new THREE.Vector3()),axis=new THREE.Vector3(0,1,0);
    const dir=(view==='front'?new THREE.Vector3(.035,.22,1):new THREE.Vector3(.30,.32,1)).applyAxisAngle(axis,-this.kitchenRotation()*Math.PI/180).normalize();
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
  captureView(){return {mode:this.mode,position:this.camera.position.toArray(),target:this.controls.target.toArray(),up:this.camera.up.toArray(),zoom:this.camera.zoom,orthoSpan:this.orthoSpan};}
  stopOrbitInertia(){const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=damping;}
  restoreView(view){
    if(!view)return;this.stopOrbitInertia();this.mode=view.mode;this.camera=this.mode==='3d'?this.perspective:this.ortho;this.controls.object=this.camera;this.controls.enableRotate=this.mode==='3d';
    this.controls.minPolarAngle=0;this.controls.maxPolarAngle=this.mode==='3d'?Math.PI*.495:Math.PI;
    this.camera.position.fromArray(view.position);this.controls.target.fromArray(view.target);this.camera.up.fromArray(view.up);this.camera.zoom=view.zoom;this.orthoSpan=view.orthoSpan;this.resize();this.controls.update();this.camera.updateMatrixWorld();this.invalidate();
  }
  setView(mode){
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
  pick(x,y){const ray=this.cast(x,y);const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};const hit=ray.intersectObjects(this.adapter.items.map(it=>this.liveEntry(it.item_id)).filter(e=>e?.group.visible).map(e=>e.group),true).find(h=>h.object.isMesh&&h.object.userData.itemId&&visible(h.object));return hit?{id:hit.object.userData.itemId,point:hit.point}:null;}
  planePoint(x,y,plane){const point=new THREE.Vector3();return this.cast(x,y).ray.intersectPlane(plane,point)?point:null;}
  makePlane(it,hit){
    if(this.mode==='front'||this.mode==='left'||this.mode==='right'){
      const normal=new THREE.Vector3();this.camera.getWorldDirection(normal);normal.y=0;normal.normalize();return new THREE.Plane().setFromNormalAndCoplanarPoint(normal,hit||new THREE.Vector3(it.x*S,elevation(it,this.adapter.room)*S,it.z*S));
    }
    return new THREE.Plane(new THREE.Vector3(0,1,0),-(hit?.y??elevation(it,this.adapter.room)*S));
  }
  pixelThreshold(it){const distance=this.camera.position.distanceTo(this.controls.target);return this.mode==='3d'?Math.max(15,Math.min(85,distance*1000*.018)):Math.max(12,Math.min(85,2*this.orthoSpan/this.camera.zoom/this.height*1000*14));}
  showPreview(it,error,guides=[]){
    if(!this.preview||this.preview.userData.itemId!==it.item_id||this.previewSignature!==this.factory.signature(it)){
      this.factory.release(this.preview);this.preview=this.factory.build(it,true);this.previewSignature=this.factory.signature(it);this.scene.add(this.preview);
    }
    this.factory.position(this.preview,it);const existing=this.entries.get(it.item_id);if(existing&&existing.group.visible){existing.group.visible=false;this.renderer.shadowMap.needsUpdate=true;}
    this.selectedBox.visible=false;this.hoverBox.visible=false;for(const box of this.kitchenBoxes.values())box.visible=false;
    this.preview.traverse(m=>{if(m.isMesh)m.material.color.set(error?'#d1976d':'#b9cfb4');});
    this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);
    const r=this.adapter.room,span=Math.max(it.width,it.depth)+450;
    for(const g of guides){let a,b;if(g.axis==='x'){a=new THREE.Vector3(g.value*S,.004,Math.max(-r.depth/2,it.z-span)*S);b=new THREE.Vector3(g.value*S,.004,Math.min(r.depth/2,it.z+span)*S);}else if(g.axis==='z'){a=new THREE.Vector3(Math.max(-r.width/2,it.x-span)*S,.004,g.value*S);b=new THREE.Vector3(Math.min(r.width/2,it.x+span)*S,.004,g.value*S);}else{a=new THREE.Vector3(-r.width*S/2,g.value*S,it.z*S);b=new THREE.Vector3(r.width*S/2,g.value*S,it.z*S);}
      const geometry=new THREE.BufferGeometry().setFromPoints([a,b]);const line=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:error?0xbd794a:0x50875a,depthTest:false,transparent:true,opacity:.78,dashSize:.045,gapSize:.025}));line.computeLineDistances();line.userData.ownMaterial=true;line.renderOrder=30;this.guides.add(line);
    }
    this.invalidate();
  }
  clearPreview(){this.renderer.shadowMap.needsUpdate=true;this.factory.release(this.preview);this.preview=null;this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);this.sync();}
  projectPoint(point){this.camera.updateMatrixWorld();const p=new THREE.Vector3(point.x*S,point.y*S,point.z*S).project(this.camera),r=this.canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  dispose(){this.dead=true;this.previews?.dispose();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.canvas.removeEventListener('webglcontextlost',this.lost);this.controls.dispose();this.disposeTree(this.roomRoot);this.floorTexture?.dispose();this.disposeTree(this.guides);this.selectedBox.geometry.dispose();this.selectedBox.material.dispose();this.hoverBox.geometry.dispose();this.hoverBox.material.dispose();for(const box of this.kitchenBoxes.values()){box.geometry.dispose();box.material.dispose();}this.kitchenBoxes.clear();this.factory.dispose();this.studioEnvironment?.dispose();this.sun.shadow.dispose();this.renderer.dispose();}
}
