import * as THREE from './vendor/three.module.js';
import {MeshFactory} from './module-mesh.mjs';
import {PRODUCTION_MODELS,heights} from './furniture-core.mjs';

export function executionPreviewItem(item,options={}){
 const it=structuredClone(item);Object.assign(it,{x:0,z:0,rotation:0,elevation_mm:0,doors_open:options.sceneDisplayMode?Boolean(item.doors_open):options.view==='hinge',body_variant_id:null,front_variant_id:null,back_variant_id:null,drawer_variant_id:null,countertopMaterialId:null,plinthMaterialId:null,part_materials:{}});
 for(const shelf of it.shelves||[])shelf.material_variant_id=null;
 return it;
}

// Isolated drafts, one existing WebGL context, and a bounded cache. No project writes.
export class ExecutionPreviews{
 constructor(owner){
  this.owner=owner;this.jobs=new Map();this.cache=new Map();this.visible=new Set();this.width=512;this.height=400;this.closed=false;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f2efe8');this.scene.environment=owner.scene.environment;this.scene.environmentIntensity=.7;
  this.scene.add(new THREE.HemisphereLight('#fffaf2','#b9b2a5',1.5));
  this.key=new THREE.DirectionalLight('#fff9ee',2.4);this.key.castShadow=true;this.key.shadow.mapSize.set(1024,1024);this.key.shadow.bias=-.00004;this.key.shadow.normalBias=.0006;this.key.shadow.intensity=.6;
  this.scene.add(this.key,this.key.target);const fill=new THREE.DirectionalLight('#ecf2ff',.9);fill.position.set(3,2,2);this.scene.add(fill);
  this.factory=new MeshFactory({room:{width:4000,depth:4000,height:3000},state:{},template:it=>({production:PRODUCTION_MODELS[it.bazis_id]}),material:()=>null},()=>{});
  this.factory.onAssetsReady=()=>{if(this.closed)return;this.cache.clear();for(const c of this.jobs.keys())delete c.dataset.previewReady;this.schedule();};
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({color:'#544b3a',opacity:.17,depthWrite:false}));this.floor.rotation.x=-Math.PI/2;this.floor.receiveShadow=true;this.scene.add(this.floor);
  this.target=new THREE.WebGLRenderTarget(this.width,this.height,{depthBuffer:true,samples:4});this.target.texture.colorSpace=THREE.SRGBColorSpace;this.pixels=new Uint8Array(this.width*this.height*4);
  this.observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)this.visible.add(e.target);else this.visible.delete(e.target);}this.schedule();},{root:document.querySelector('.mf3d-right'),rootMargin:'80px'});
 }
 request(canvas,item,options={}){
  const it=executionPreviewItem(item,options);
  const key=JSON.stringify([this.factory.signature(it),options]);
  if(this.jobs.get(canvas)?.key===key&&canvas.dataset.previewReady)return;
  const first=!this.jobs.has(canvas);this.jobs.set(canvas,{key,it,options});if(first)this.observer.observe(canvas);delete canvas.dataset.previewReady;canvas.setAttribute('aria-busy','true');this.schedule();
 }
 cancel(canvas){this.observer.unobserve(canvas);this.jobs.delete(canvas);this.visible.delete(canvas);}
 schedule(){if(this.closed||this.timer)return;this.timer=setTimeout(()=>{this.timer=0;this.tick();},32);}
 tick(){
  if(this.closed||this.owner.dead)return;
  if(this.owner.preview||this.owner.equipmentPreview){this.schedule();return;}
  for(const [canvas,job]of this.jobs){
   if(!canvas.isConnected){this.observer.unobserve(canvas);this.jobs.delete(canvas);this.visible.delete(canvas);continue;}
   if(!this.visible.has(canvas)||canvas.dataset.previewReady||!canvas.getBoundingClientRect().width)continue;
   try{const cached=this.cache.get(job.key),pixels=cached||this.paint(job.it,job.options);canvas.width=this.width;canvas.height=this.height;canvas.getContext('2d').putImageData(pixels,0,0);canvas.dataset.previewReady='true';canvas.closest('.execution-visual')?.classList.remove('execution-failed');if(!cached){this.cache.set(job.key,pixels);while(this.cache.size>24)this.cache.delete(this.cache.keys().next().value);}}
   catch(error){canvas.dataset.previewReady='fallback';canvas.closest('.execution-visual')?.classList.add('execution-failed');console.warn('Execution preview:',error.message);}
   canvas.setAttribute('aria-busy','false');this.schedule();break;
  }
 }
 bounds(root){const box=new THREE.Box3();root.updateMatrixWorld(true);root.traverseVisible(m=>{if(m.isMesh){m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));}});return box;}
 paint(it,opt){
  const f=this.factory,p=PRODUCTION_MODELS[it.bazis_id],model=f.build(it),extra=new THREE.Group(),owned=new Set();model.position.set(0,0,0);model.rotation.set(0,0,0);
  const inside=opt.view==='inside',pull=inside&&(p?.cargo||p?.pullout_dryer||p?.metal_drawers||it.layout==='drawers'||p?.tall?.drawer),moved=[];
  model.traverse(m=>{
   if(m.userData.role==='reveal')m.visible=false;
   if(inside&&m.userData.role==='door-pivot')m.visible=false;
   if(!m.isMesh)return;
   const part=m.userData.part,role=m.userData.role,inner=p?.metal_drawers?.layout==='inner'||p?.gola?.layout==='inner';
   if(inside&&role==='front'&&!part?.fixed&&!pull)m.visible=false;
   if(inside&&m.userData.frontAccessory&&!pull)m.visible=false;
   if(inside&&inner&&(role==='front'&&part?.drawer_index===2||role==='handle'&&m.userData.frontAccessory&&m.position.y>it.height/2000))m.visible=false;
   const drawer=part?.role==='drawer'||/^drawer-/.test(part?.key||'')||m.userData.drawerMetal||m.userData.cargoBasket||m.userData.pulloutDryer||role==='front'&&m.userData.facade?.kind==='drawer'||role==='handle'&&m.userData.frontAccessory;
   if(pull&&drawer){m.position.z+=Math.min(.32,it.depth/1800);moved.push(m);}
   if(role==='body'||role==='shelf'||role==='front'||role==='back'){const mat=m.material.clone();mat.color.set(role==='front'?'#d9cdb7':role==='back'?'#c7bdad':'#e0d8c8');m.material=mat;owned.add(mat);}
   if(m.userData.cargoBasket||m.userData.pulloutDryer){const mat=m.material.clone(),chrome=p.cargo?.brand==='norwing'||p.pullout_dryer?.dryer_brand==='flat_line';mat.color.set(chrome?'#aab7c5':'#414a51');mat.metalness=.45;mat.roughness=.42;m.material=mat;owned.add(mat);}
   if(opt.highlight==='filler'&&/^filler/.test(part?.key||'')){const mat=m.material.clone();mat.color.set('#62a7f6');m.material=mat;owned.add(mat);}
  });
  // The hero uses the scene's appearance rules; option illustrations retain their own recipes.
  if(opt.sceneDisplayMode)f.updateAppearance(model,it,opt.sceneDisplayMode);
  // Schematic hardware illustration within the real upper cabinet; never BOM geometry.
  if(inside&&p?.dryer){
   const w=it.width-60,d=Math.min(it.depth-45,260),levels=[70,Math.min(it.height*.48,320)];
   for(const y of levels){for(let x=-w/2;x<=w/2;x+=24)f.box(extra,'drawerMetal',2,2,d,x,y,0,null);for(const z of[-d/2,d/2])f.box(extra,'drawerMetal',w,4,3,0,y,z,null);}
   for(let x=-w/2+28;x<w/2;x+=38)f.box(extra,'drawerMetal',2,48,d*.75,x,94,0,null);
  }
  if(heights(it).base_height>0){const base=heights(it).base_height;f.box(extra,'plinth',it.width-2,base-2,18,0,base/2,it.depth/2-55,null);}
  this.scene.add(model,extra);model.updateMatrixWorld(true);
  let box=this.bounds(model).union(this.bounds(extra)),direction=new THREE.Vector3(.58,.36,1.5);
  if(p?.corner?.side==='right'||opt.view==='hinge'&&(p?.doors?.[0]?.side==='right'||p?.vitrine?.opening==='right'))direction.x*=-1;
  if(opt.front)direction.set(.1,.18,1.6);
  if(opt.focus==='grip'){
   const selected=[];model.traverseVisible(m=>{if(m.isMesh&&(m.userData.frontAccessory&&m.userData.role==='handle'||m.userData.golaProfile))selected.push(m);});
   const b=new THREE.Box3();for(const m of selected)b.union(this.bounds(m));
   if(!b.isEmpty()){const center=b.getCenter(new THREE.Vector3());center.y=this.bounds(selected[0]).getCenter(new THREE.Vector3()).y;const span=Math.min(it.width/1000,.52);box=new THREE.Box3(new THREE.Vector3(center.x-span/2,center.y-.14,it.depth/2000-.1),new THREE.Vector3(center.x+span/2,center.y+.14,it.depth/2000+.11));}
   else{
    const bottom=p?.tier==='wall',baseHeight=heights(it).base_height;
    // A handleless NShD choice must show its small drawer below the oven.
    const y=p?.front?.kind==='niche'?(baseHeight+Math.max(80,it.height-baseHeight-595)/2)/1000:bottom?.045:it.height/1000-.1;
    box=new THREE.Box3(new THREE.Vector3(-it.width/2200,y-.12,it.depth/2000-.08),new THREE.Vector3(it.width/2200,y+.12,it.depth/2000+.1));}
   direction.set(.38,.25,1.7);
  }
  if(['drawer','basket','dryer'].includes(opt.focus)){
   const candidates=[];model.traverseVisible(m=>{if(m.isMesh&&(opt.focus==='basket'?m.userData.cargoBasket:opt.focus==='dryer'?m.userData.pulloutDryer:m.userData.drawerMetal||/^drawer-/.test(m.userData.part?.key||'')))candidates.push(m);});
   if(candidates.length){
    const indexes=candidates.map(m=>m.userData.drawerIndex??m.userData.part?.drawer_index).filter(Number.isFinite),index=opt.focus==='drawer'?Math.min(...indexes):null;
    const selected=candidates.filter(m=>index==null||!Number.isFinite(index)||(m.userData.drawerIndex??m.userData.part?.drawer_index)===index),set=new Set(selected);
    model.traverse(m=>{if(m.isMesh&&!set.has(m))m.visible=false;});extra.visible=false;box=this.bounds(model);direction.set(.8,.75,1.4);
   }
  }
  if(box.isEmpty()){f.release(model);f.release(extra);for(const mat of owned)mat.dispose();throw Error('Пустой вид модуля');}
  const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.y,size.z,.1);direction.normalize();
  const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right).normalize();let half=.05;
  for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){const point=new THREE.Vector3(x,y,z).sub(center);half=Math.max(half,Math.abs(point.dot(up))*1.12,Math.abs(point.dot(right))*this.height/this.width*1.12);}
  const camera=new THREE.OrthographicCamera(-half*this.width/this.height,half*this.width/this.height,half,-half,.01,30);camera.position.copy(center).addScaledVector(direction,5+span);camera.lookAt(center);camera.updateMatrixWorld();
  this.floor.visible=!opt.focus;this.floor.position.y=box.min.y-.004;this.key.position.copy(center).add(new THREE.Vector3(-3,5,7).multiplyScalar(span));this.key.target.position.copy(center);
  Object.assign(this.key.shadow.camera,{left:-span*2,right:span*2,top:span*2,bottom:-span*2,near:.01,far:span*16});this.key.shadow.camera.updateProjectionMatrix();
  const renderer=this.owner.renderer,old={target:renderer.getRenderTarget(),exposure:renderer.toneMappingExposure,shadows:renderer.shadowMap.enabled,update:renderer.shadowMap.needsUpdate};
  try{
   renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;renderer.setRenderTarget(this.target);renderer.render(this.scene,camera);renderer.readRenderTargetPixels(this.target,0,0,this.width,this.height,this.pixels);
   const result=new ImageData(this.width,this.height);for(let y=0;y<this.height;y++)result.data.set(this.pixels.subarray((this.height-1-y)*this.width*4,(this.height-y)*this.width*4),y*this.width*4);
   // A readable glow follows the actual light segments; it never changes their geometry.
   if(p?.open_tall||p?.vitrine){const overlay=document.createElement('canvas');overlay.width=this.width;overlay.height=this.height;const ctx=overlay.getContext('2d');ctx.putImageData(result,0,0);
    model.traverseVisible(m=>{if(m.userData.role!=='led')return;m.geometry.computeBoundingBox();const b=m.geometry.boundingBox,c=b.getCenter(new THREE.Vector3());
     const a=new THREE.Vector3(c.x,b.min.y,c.z).applyMatrix4(m.matrixWorld).project(camera),z=new THREE.Vector3(c.x,b.max.y,c.z).applyMatrix4(m.matrixWorld).project(camera);
     ctx.save();ctx.beginPath();ctx.moveTo((a.x+1)*this.width/2,(1-a.y)*this.height/2);ctx.lineTo((z.x+1)*this.width/2,(1-z.y)*this.height/2);ctx.shadowColor='#ffd366';ctx.shadowBlur=12;ctx.strokeStyle='#fff1a5';ctx.lineWidth=4;ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#fffef2';ctx.lineWidth=1.8;ctx.stroke();ctx.restore();
    });return ctx.getImageData(0,0,this.width,this.height);
   }
   return result;
  }finally{renderer.setRenderTarget(old.target);renderer.toneMappingExposure=old.exposure;renderer.shadowMap.enabled=old.shadows;renderer.shadowMap.needsUpdate=true;f.release(model);f.release(extra);for(const mat of owned)mat.dispose();this.owner.invalidate();}
 }
 dispose(){this.closed=true;clearTimeout(this.timer);this.observer.disconnect();this.jobs.clear();this.cache.clear();this.visible.clear();this.factory.dispose();this.target.dispose();this.key.shadow.dispose();this.floor.geometry.dispose();this.floor.material.dispose();this.scene.clear();}
}
