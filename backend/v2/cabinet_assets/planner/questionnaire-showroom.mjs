import * as THREE from './vendor/three.module.js';
import {MeshFactory} from './module-mesh.mjs';
import {placeCarcass} from './carcass-model.mjs';
import {WardrobeMotion,drawerKey} from './wardrobe-motion.mjs';
import {materialVisual} from './material-visuals.mjs';
import {DEFAULT_MATERIALS} from './furniture-core.mjs';
import {retainedBlankMaterial} from './blanks-model.mjs';
import {drawerBottom} from './wardrobe-drawers.mjs';
import {surroundFace} from './wardrobe-surround.mjs';

const room={width:5000,depth:4500,height:3000};

function panelMaterials(built,ui){
  const current=ui?.mode?.value==='update'?ui.current:null;
  const previous=new Map(current?.items.map(part=>[part.item_id.split(':').at(-1),part])||[]);
  const lookup=id=>ui?.app?.adapter?.material(id);
  return built.items.map(part=>{
    if(part.blank_front_frame||part.blank_shelf&&!part.blank_shelf.startsWith('board/'))return null;
    const key=part.item_id.split(':').at(-1);
    const face=part.blank_axis==='front'||surroundFace(key);
    const role=face?'front':key==='back'||key==='mezz-back'?'back':key.startsWith('drawer-')&&built.spec.thickness!==18?'drawer':'body';
    const chosen=part.body_variant_id||ui?.materials?.[role]?.variant_id;
    const old=previous.get(key);
    const preserve=old&&!ui.materialChanged?.[role]&&!(drawerBottom(part.item_id)&&part.blank_thickness_mm===3);
    const assigned=preserve?retainedBlankMaterial({...part,body_variant_id:chosen},old,lookup):chosen;
    return assigned||((face||key==='plinth')?DEFAULT_MATERIALS.front_variant_id:DEFAULT_MATERIALS.body_variant_id);
  });
}

// Both the catalogue photographs and the editable previews use these native
// panels, poses, guide lengths and fitting meshes. All positions are view-local.
export function questionnaireModel(built,{open=true,material=()=>null,state={},section=null,sceneFactory=null,variants=panelMaterials(built)}={}){
  const id=built.items[0].item_id.split(':')[0];
  const position={x:0,z:0,elevation_mm:built.spec.elevation,rotation:0};
  const meta={group_id:id,spec:built.spec,position};
  const items=placeCarcass(built,position).map((part,i)=>({...part,assistant_carcass:meta,body_variant_id:variants[i]}));
  const factory=new MeshFactory({room,items,state,template:()=>null,material},()=>{});
  // Geometry belongs to this snapshot. Materials and their asynchronous textures
  // belong to the active scene and stay cached when the snapshot is released.
  if(sceneFactory)factory.material=sceneFactory.material.bind(sceneFactory);
  const model=new THREE.Group(),entries=new Map();
  try{
    for(const it of items){
      const group=factory.build(it);
      factory.position(group,it);
      entries.set(it.item_id,{group});model.add(group);
    }
    if(open){
      const motion=new WardrobeMotion();
      motion.show(id);
      const bank=built.drawerBanks.find(b=>b&&b.faces.length&&(section===null||b.section===section));
      if(bank){
        const end=items.find(it=>it.item_id.endsWith(':drawer-'+bank.slot+'-'+(bank.faces.length-1)+'-face'));
        if(end)motion.toggleDrawer(drawerKey(end),.54);
      }
      motion.step(0,true);motion.pose(entries,items);
    }
    model.updateMatrixWorld(true);
  }catch(error){factory.release(model);factory.dispose();throw error;}
  return {model,release(){factory.release(model);factory.dispose();}};
}

export function studioCamera(built,aspect=1.38){
  const s=built.spec;
  const tall=s.height>s.width*1.12&&!s.dresser;
  const dir=new THREE.Vector3(.4,tall?.115:.27,1).normalize();
  const right=new THREE.Vector3(0,1,0).cross(dir).normalize(),up=dir.clone().cross(right).normalize();
  // Frame the same enclosure in both poses and include the floor for a suspended dresser.
  const bottom=built.items.reduce((n,p)=>Math.min(n,p.elevation_mm),Infinity)*.001;
  const floor=s.dresser?.installation==='wall'?0:Math.max(0,bottom-Math.max(.4,s.height*.00075));
  const box=new THREE.Box3();
  for(const it of built.items){
    const y=it.elevation_mm*.001;
    box.expandByPoint(new THREE.Vector3((it.x-it.width/2)*.001,y,(it.z-it.depth/2)*.001));
    box.expandByPoint(new THREE.Vector3((it.x+it.width/2)*.001,y+it.height*.001,(it.z+it.depth/2)*.001));
  }
  const w=s.width*.001, depth=s.depth*.001;
  box.min.y=Math.min(box.min.y,floor);box.max.z+=Math.min(.31,depth*.5);
  const centre=box.getCenter(new THREE.Vector3());
  const corners=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z).sub(centre));
  const hw=Math.max(...corners.map(p=>Math.abs(p.dot(right)))),hh=Math.max(...corners.map(p=>Math.abs(p.dot(up))));
  const half=Math.max(hw/aspect,hh)*1.105;
  const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.01,60);
  camera.position.copy(centre).addScaledVector(dir,Math.max(w,s.height*.001,depth)*4+1);
  camera.lookAt(centre);camera.updateMatrixWorld();
  return {camera,centre,half};
}

// Each dialog uses the existing planner renderer; snapshots are read back once
// and reused on redraw. In canvas-free mode the dimensioned front view remains.
const images=new Map();
function paint(canvas,built,ui,open,section){
  const owner=ui.app?.scene,renderer=owner?.renderer;
  if(!canvas.isConnected)return;
  if(!renderer||owner.dead){canvas.dataset.previewState='waiting-for-renderer';return;}
  const material=id=>id&&ui.app.adapter.material(id);
  const state=ui.app.adapter.state??{};
  const variants=panelMaterials(built,ui),unique=new Set(variants.filter(Boolean));
  const stamp=JSON.stringify([built.spec,open,section,variants,[...unique].map(id=>materialVisual(material(id))),state.displaySettings?.materialAppearance]);
  const cached=images.get(stamp),ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx){canvas.dataset.previewState='unavailable';return;}
  if(cached){ctx.putImageData(cached,0,0);canvas.hidden=false;canvas.dataset.previewState='ready';return;}
  const {model,release}=questionnaireModel(built,{open,material,state,section,sceneFactory:owner.factory,variants});
  const scene=new THREE.Scene();scene.background=new THREE.Color('#f4f1eb');
  scene.environment=owner.scene.environment;scene.environmentIntensity=.55;scene.add(model);
  scene.add(new THREE.HemisphereLight('#fffdf7','#bfb5a7',1.45));
  const {camera,centre,half}=studioCamera(built,canvas.width/canvas.height);
  const key=new THREE.DirectionalLight('#fff8ed',2.05);
  key.position.copy(centre).add(new THREE.Vector3(-2.7,4.3,3.6).multiplyScalar(half));key.target.position.copy(centre);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.00006;key.shadow.normalBias=.00027;
  Object.assign(key.shadow.camera,{left:-half*2,right:half*2,top:half*2,bottom:-half*2,near:.01,far:half*15+4});
  key.shadow.camera.updateProjectionMatrix();scene.add(key,key.target);
  const fill=new THREE.DirectionalLight('#f2f5fc',.55);fill.position.set(4,2,1);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:'#e6e3dc',roughness:.94}));
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(60,60),new THREE.MeshStandardMaterial({color:'#e8e5df',roughness:.93}));
  const wallGap=built.spec.dresser?.installation==='wall'?5:130;
  wall.position.z=-(built.spec.depth/2+wallGap)*.001;wall.receiveShadow=true;scene.add(wall);
  floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
  const width=canvas.width,height=canvas.height;
  const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true,samples:Math.min(2,renderer.capabilities.maxSamples)});
  target.texture.colorSpace=THREE.SRGBColorSpace;
  const pixels=new Uint8Array(width*height*4),data=ctx.createImageData(width,height);
  const old=renderer.getRenderTarget(),shadows=renderer.shadowMap.enabled,dirty=renderer.shadowMap.needsUpdate,exposure=renderer.toneMappingExposure;
  try{
    renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;renderer.toneMappingExposure=1;
    renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    for(let y=0;y<height;y++)data.data.set(pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);
    ctx.putImageData(data,0,0);canvas.hidden=false;canvas.dataset.previewState='ready';
    const pending=new Set();
    model.traverse(o=>{if(o.isMesh)for(const t of [o.material?.map,o.material?.bumpMap])if(t&&!t.image&&!t.userData.failed)pending.add(t);});
    const missing=[...unique].filter(id=>id!==DEFAULT_MATERIALS.body_variant_id&&id!==DEFAULT_MATERIALS.front_variant_id&&!material(id));
    if(!pending.size&&!missing.length){images.set(stamp,data);if(images.size>9)images.delete(images.keys().next().value);}
    else{
      const expiry=performance.now()+12000;
      function ready(){
        if(!canvas.isConnected||owner.dead)return;
        if((pending.size&&[...pending].every(t=>t.image||t.userData.failed))||missing.some(id=>material(id))){
          try{paint(canvas,built,ui,open,section);}catch{/* Keep the previous portrait during a renderer reset. */}
          return;
        }
        if(performance.now()<expiry)setTimeout(ready,300);
      }
      setTimeout(ready,180);
    }
  }finally{
    renderer.setRenderTarget(old);renderer.shadowMap.enabled=shadows;renderer.shadowMap.needsUpdate=dirty;renderer.toneMappingExposure=exposure;
    target.dispose();key.shadow.dispose();floor.geometry.dispose();floor.material.dispose();wall.geometry.dispose();wall.material.dispose();release();owner.invalidate();
  }
}
export function showroomSnapshot(built,ui,{open=true,section=null}={}){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=360;canvas.hidden=true;
  canvas.className='questionnaire-studio';canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',(built.spec.dresser?'Комод':'Шкаф')+(open?' · вид наполнения':' · с фасадами'));
  canvas.dataset.previewState='queued';
  const until=performance.now()+15000;
  function render(){
    if(!canvas.isConnected)return;
    try{
      paint(canvas,built,ui,open,section);
      if(canvas.dataset.previewState==='waiting-for-renderer'&&performance.now()<until)setTimeout(render,250);
    }catch(error){
      canvas.hidden=true;canvas.dataset.previewState='unavailable';
      console.warn('Questionnaire preview:',error);
    }
  }
  requestAnimationFrame(render);
  return canvas;
}
