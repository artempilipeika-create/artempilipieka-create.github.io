import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {MeshFactory,CataloguePreviews} from './module-mesh.mjs';
import {MM_TO_WORLD as S,bounds,elevation,tier} from './furniture-core.mjs';
export class PlannerScene{
  constructor(canvas,adapter,onLost){
    this.canvas=canvas;this.adapter=adapter;this.onLost=onLost;this.mode='3d';this.layer='all';this.entries=new Map();this.frame=0;this.dead=false;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.shadowMap.needsUpdate=true;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eef1ef');
    this.scene.add(new THREE.HemisphereLight('#ffffff','#adb9af',1.05));
    this.sun=new THREE.DirectionalLight('#fffaf3',1.85);this.sun.position.set(-3.8,6.2,4.6);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:30});
    this.sun.shadow.bias=-.00004;this.sun.shadow.normalBias=.0007;this.sun.shadow.intensity=.68;this.scene.add(this.sun,this.sun.target);
    const fill=new THREE.DirectionalLight('#edf3ff',.55);fill.position.set(4,3,1);this.scene.add(fill);
    this.perspective=new THREE.PerspectiveCamera(34,1,.025,150);
    this.ortho=new THREE.OrthographicCamera(-3,3,3,-3,.025,150);this.camera=this.perspective;
    this.camera.position.set(4,3.4,5);this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=true;this.controls.dampingFactor=.12;this.controls.minDistance=.5;this.controls.maxDistance=80;
    this.controls.maxPolarAngle=Math.PI*.495;this.controls.screenSpacePanning=true;this.controls.target.set(0,1,0);
    this.controls.addEventListener('change',()=>this.invalidate());
    this.factory=new MeshFactory(adapter,()=>this.invalidate());this.root=new THREE.Group();this.scene.add(this.root);
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
    if(this.walls)this.walls.forEach(w=>{w.visible=this.mode!=='top'&&(w.userData.axis==='x'?this.camera.position.x*w.userData.sign<r.width*S/2-.02:this.camera.position.z*w.userData.sign<r.depth*S/2-.02);});
    if(this.contacts)for(const m of this.contacts.children){const wall=m.userData.wall;const tierVisible=this.layer==='all'||m.userData.tier===this.layer;m.visible=tierVisible&&(!wall||this.mode!=='top'&&this.camera.position[wall.axis]*wall.sign<(wall.axis==='x'?r.width:r.depth)*S/2-.02);}
    if(this.grid)this.grid.visible=!document.body.classList.contains('planner-client');
    this.renderer.render(this.scene,this.camera);this.placeLabel();
  }
  resize(){
    if(this.dead)return;const r=this.canvas.parentElement.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);
    this.renderer.setSize(this.width,this.height,false);this.perspective.aspect=this.width/this.height;this.perspective.updateProjectionMatrix();
    const span=this.orthoSpan||3;this.ortho.left=-span*this.width/this.height;this.ortho.right=-this.ortho.left;this.ortho.top=span;this.ortho.bottom=-span;this.ortho.updateProjectionMatrix();this.invalidate();
  }
  disposeTree(group){
    if(!group)return;group.traverse(o=>{if(o.geometry&&!this.factory.ownsGeometry(o.geometry))o.geometry.dispose();if(o.userData.ownMaterial)o.material?.dispose();});group.removeFromParent();
  }
  roomMesh(){
    this.disposeTree(this.roomRoot);this.roomRoot=new THREE.Group();this.scene.add(this.roomRoot);const r=this.adapter.room;
    const make=(w,h,d,x,y,z,color)=>{const material=new THREE.MeshStandardMaterial({color,roughness:1});const m=new THREE.Mesh(this.factory.geometry,material);m.userData.ownMaterial=true;m.scale.set(w*S,h*S,d*S);m.position.set(x*S,y*S,z*S);m.receiveShadow=true;this.roomRoot.add(m);return m;};
    make(r.width,20,r.depth,0,-12,0,'#dce1dc');this.walls=[];
    for(const sign of[-1,1]){
      const z=make(r.width,r.height,20,0,r.height/2,sign*(r.depth/2+10),'#ecefea');z.userData.axis='z';z.userData.sign=sign;this.walls.push(z);
      const x=make(20,r.height,r.depth,sign*(r.width/2+10),r.height/2,0,'#e7ece7');x.userData.axis='x';x.userData.sign=sign;this.walls.push(x);
    }
    const points=[];for(let x=-r.width/2;x<=r.width/2;x+=500)points.push(x*S,.001,-r.depth*S/2,x*S,.001,r.depth*S/2);
    for(let z=-r.depth/2;z<=r.depth/2;z+=500)points.push(-r.width*S/2,.001,z*S,r.width*S/2,.001,z*S);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    const grid=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xa2afa7,transparent:true,opacity:.12}));grid.userData.ownMaterial=true;this.grid=grid;this.roomRoot.add(grid);this.renderer.shadowMap.needsUpdate=true;
  }
  sync(){
    const roomKey=JSON.stringify(this.adapter.room);if(this.roomKey!==roomKey){this.roomKey=roomKey;this.roomMesh();}
    const ids=new Set(this.adapter.items.map(it=>it.item_id));
    for(const [id,entry]of this.entries)if(!ids.has(id)){this.factory.release(entry.group);this.entries.delete(id);this.renderer.shadowMap.needsUpdate=true;}
    for(const it of this.adapter.items){
      const signature=this.factory.signature(it);let entry=this.entries.get(it.item_id);
      if(!entry||entry.signature!==signature){if(entry)this.factory.release(entry.group);entry={group:this.factory.build(it),signature};this.entries.set(it.item_id,entry);this.root.add(entry.group);this.renderer.shadowMap.needsUpdate=true;}
      this.factory.position(entry.group,it);entry.group.visible=this.layer==='all'||tier(it)===this.layer;
    }
    const dressing=JSON.stringify(this.adapter.items.map(it=>[it.item_id,it.x,it.z,it.rotation,it.width,it.height,it.depth,it.elevation_mm,it.base,it.body_variant_id]));
    if(this.dressingKey!==dressing){this.dressingKey=dressing;this.factory.release(this.dressing);this.dressing=this.factory.dress(this.adapter.items);this.scene.add(this.dressing);this.contacts?.removeFromParent();this.contacts=this.factory.contacts(this.adapter.items);this.scene.add(this.contacts);this.fitShadow();}
    if(this.dressing){
      const merged=new Set(this.dressing.userData.mergedPlinthIds||[]);
      for(const [id,entry]of this.entries)entry.group.traverse(m=>{if(m.userData.role==='plinth')m.visible=!merged.has(id);});
      for(const g of this.dressing.children)g.visible=this.layer==='all'||g.userData.tier===this.layer;
    }
    this.highlight();this.invalidate();
  }
  fitShadow(){
    const box=this.cameraBox('kitchen'),center=box.getCenter(new THREE.Vector3());
    this.sun.target.position.copy(center);this.sun.position.copy(center).add(new THREE.Vector3(-3.8,6.2,4.6));
    const c=this.sun.shadow.camera;c.position.copy(this.sun.position);c.lookAt(center);c.updateMatrixWorld();
    const local=new THREE.Box3();
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])local.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(c.matrixWorldInverse));
    c.left=local.min.x-.7;c.right=local.max.x+.7;c.bottom=local.min.y-1.2;c.top=local.max.y+.6;c.near=.1;c.far=60;c.updateProjectionMatrix();
    this.renderer.shadowMap.needsUpdate=true;
  }
  setLayer(value){this.layer=value;this.renderer.shadowMap.needsUpdate=true;this.sync();}
  highlight(error=''){
    const it=this.adapter.selected,entry=it?this.entries.get(it.item_id):null;
    this.selectedBox.visible=Boolean(entry?.group.visible&&!this.preview&&!document.body.classList.contains('planner-client'));
    if(this.selectedBox.visible){this.selectedBox.box.setFromObject(entry.group).expandByScalar(.003);this.selectedBox.material.color.set(error?'#bf6c43':'#346d4a');}
    this.placeLabel();
  }
  hover(id){const entry=this.entries.get(id);this.hoverBox.visible=Boolean(entry?.group.visible&&id!==this.adapter.selected?.item_id&&!this.preview&&!document.body.classList.contains('planner-client'));if(this.hoverBox.visible)this.hoverBox.box.setFromObject(entry.group).expandByScalar(.003);this.invalidate();}
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
    return b.isEmpty()?this.cameraBox('room'):b;
  }
  fit(which='kitchen'){
    const box=this.cameraBox(which),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    this.controls.target.copy(center);
    if(this.mode==='3d'){
      // Fit the actual projected corners, not a bounding sphere. A long
      // kitchen now uses the canvas instead of leaving a room-sized margin.
      const dir=new THREE.Vector3(.50,.29,1).normalize();
      const right=new THREE.Vector3(0,1,0).cross(dir).normalize();
      const up=dir.clone().cross(right).normalize();
      const tanV=Math.tan(this.perspective.fov*Math.PI/360),tanH=tanV*this.perspective.aspect;
      let distance=1.2;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const delta=new THREE.Vector3(x,y,z).sub(center),towardsCamera=delta.dot(dir);
        distance=Math.max(distance,towardsCamera+Math.abs(delta.dot(right))/(tanH*.90),towardsCamera+Math.abs(delta.dot(up))/(tanV*.85));
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
  pick(x,y){const ray=this.cast(x,y);const hit=ray.intersectObjects([...this.entries.values()].filter(e=>e.group.visible).map(e=>e.group),true).find(h=>h.object.isMesh&&h.object.userData.itemId);return hit?{id:hit.object.userData.itemId,point:hit.point}:null;}
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
    this.factory.position(this.preview,it);const existing=this.entries.get(it.item_id);if(existing)existing.group.visible=false;
    this.selectedBox.visible=false;this.hoverBox.visible=false;
    this.preview.traverse(m=>{if(m.isMesh)m.material.color.set(error?'#d1976d':'#b9cfb4');});
    this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);
    const r=this.adapter.room,span=Math.max(it.width,it.depth)+450;
    for(const g of guides){let a,b;if(g.axis==='x'){a=new THREE.Vector3(g.value*S,.004,Math.max(-r.depth/2,it.z-span)*S);b=new THREE.Vector3(g.value*S,.004,Math.min(r.depth/2,it.z+span)*S);}else if(g.axis==='z'){a=new THREE.Vector3(Math.max(-r.width/2,it.x-span)*S,.004,g.value*S);b=new THREE.Vector3(Math.min(r.width/2,it.x+span)*S,.004,g.value*S);}else{a=new THREE.Vector3(-r.width*S/2,g.value*S,it.z*S);b=new THREE.Vector3(r.width*S/2,g.value*S,it.z*S);}
      const geometry=new THREE.BufferGeometry().setFromPoints([a,b]);const line=new THREE.Line(geometry,new THREE.LineDashedMaterial({color:error?0xbd794a:0x50875a,depthTest:false,transparent:true,opacity:.78,dashSize:.045,gapSize:.025}));line.computeLineDistances();line.userData.ownMaterial=true;line.renderOrder=30;this.guides.add(line);
    }
    this.invalidate();
  }
  clearPreview(){this.factory.release(this.preview);this.preview=null;this.disposeTree(this.guides);this.guides=new THREE.Group();this.scene.add(this.guides);this.sync();}
  projectPoint(point){this.camera.updateMatrixWorld();const p=new THREE.Vector3(point.x*S,point.y*S,point.z*S).project(this.camera),r=this.canvas.getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  dispose(){this.dead=true;this.previews?.dispose();cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.canvas.removeEventListener('webglcontextlost',this.lost);this.controls.dispose();this.disposeTree(this.roomRoot);this.disposeTree(this.guides);this.selectedBox.geometry.dispose();this.selectedBox.material.dispose();this.hoverBox.geometry.dispose();this.hoverBox.material.dispose();this.factory.dispose();this.renderer.dispose();}
}
