import * as THREE from '/account/planner/vendor/three.module.js';
import {OrbitControls} from '/account/planner/vendor/OrbitControls.js';
import {studioEnvironment,roomSurfaceTexture} from '/account/planner/studio-environment.mjs';
import {StudioRender} from '/account/planner/studio-render.mjs';
import {readShowroomModel} from './model.mjs';

const host=document.getElementById('showroom-stage'),start=document.getElementById('showroom-start'),status=document.getElementById('showroom-status');
const views=[...document.querySelectorAll('[data-showroom-view]')],environments=[...document.querySelectorAll('[data-showroom-room]')],lights=[...document.querySelectorAll('[data-showroom-light]')];
let renderer,scene,camera,controls,environment,studioRender,frame=0,resizeObserver,active=false,room,ground,key,fill,hemi,roomName='room',lightName='daylight',viewName='front';
const textures=new Set(),walls=[];
const positions={front:[1.25,.79,1.85],back:[-1.25,.79,-1.85],detail:[.83,.82,1.1]};
function render(){
  frame=0;if(!active)return;
  for(const wall of walls)wall.visible=camera.position[wall.userData.axis]>wall.userData.limit;
  studioRender.render(scene,camera);
}
function invalidate(){if(active&&!frame)frame=requestAnimationFrame(render);}
function resize(){const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();}
function view(name){
  viewName=name;views.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showroomView===name)));
  if(active){camera.position.fromArray(positions[name]);controls.target.set(0,name==='detail'?.47:.39,0);controls.update();invalidate();}
  else{host.querySelector('img').src='/ui/showroom/'+(name==='back'?'nmd2-back.webp':'nmd2-front.webp');host.querySelector('img').alt=name==='back'?'НМД2-600 — корпус с обратной стороны':'НМД2-600 — фасады и регулируемые опоры';}
}
function setRoom(name){
  roomName=name;environments.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showroomRoom===name)));
  if(!active)return;room.visible=name==='room';ground.visible=name==='studio';invalidate();
}
function setLight(name){
  lightName=name;lights.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showroomLight===name)));
  if(!active)return;
  const warm=name==='warm';key.color.set(warm?'#ffe4c5':'#fffaf1');key.intensity=warm?2.9:3.2;
  fill.color.set(warm?'#fff4e7':'#e8f0ff');fill.intensity=.5;hemi.intensity=warm?.35:.3;
  scene.environmentIntensity=warm?.78:.82;renderer.toneMappingExposure=1.06;
  renderer.shadowMap.needsUpdate=true;invalidate();
}
views.forEach(b=>b.addEventListener('click',()=>view(b.dataset.showroomView)));
environments.forEach(b=>b.addEventListener('click',()=>setRoom(b.dataset.showroomRoom)));
lights.forEach(b=>b.addEventListener('click',()=>setLight(b.dataset.showroomLight)));
function roomMesh(){
  room=new THREE.Group();room.name='Showroom surroundings';scene.add(room);
  const wallMaterial=new THREE.MeshStandardMaterial({color:'#e4ded2',roughness:.94});
  const trimMaterial=new THREE.MeshStandardMaterial({color:'#f5f1e8',roughness:.7});
  for(const [w,h,d,x,y,z,axis,limit]of [[6,2.7,.06,0,1.35,-.95,'z',-.92],[.06,2.7,6,-2.0,1.35,0,'x',-1.97]]){
    const wall=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMaterial);wall.position.set(x,y,z);wall.receiveShadow=true;wall.userData={axis,limit};room.add(wall);walls.push(wall);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(w,.065,d+.012),trimMaterial);trim.position.y=-h/2+.0325;wall.add(trim);
  }
  const oak=new THREE.TextureLoader().load('/account/planner/materials/egger-h1180-st37.jpg',()=>invalidate(),undefined,()=>{
    room.traverse(o=>{if(o.isMesh&&o.material.map===oak){o.material.map=null;o.material.color.set('#c7b59a');o.material.needsUpdate=true;}});invalidate();
  });textures.add(oak);oak.colorSpace=THREE.SRGBColorSpace;oak.wrapS=oak.wrapT=THREE.RepeatWrapping;oak.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const p=[],uv=[],colors=[],boardWidth=.19,length=1.2;
  // Measured board sizes with staggered joints; one floor mesh, no cabinet changes.
  for(let col=0,x=-3;x<3;col++,x+=boardWidth)for(let row=0,z=-3-(col%3)*.4;z<3;row++,z+=length){
    const x0=x+.0006,x1=Math.min(x+boardWidth,3)-.0006,z0=Math.max(z,-3)+.0006,z1=Math.min(z+length,3)-.0006;
    const shade=.91+((col*7+row*3)%7)*.012,u=((col*431+row*193)%1100)/1000,v=((col*733+row*557)%1500)/1000;
    for(const [px,pz]of [[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]){p.push(px,-.002,pz);uv.push((px-x+u)/1.3,(pz-z+v)/2.8);colors.push(shade,shade,shade);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  const floor=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#e4d9c5',map:oak,roughness:.82,vertexColors:true}));floor.receiveShadow=true;room.add(floor);
  const underlay=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshStandardMaterial({color:'#a79883',roughness:.95}));underlay.rotation.x=-Math.PI/2;underlay.position.y=-.004;room.add(underlay);
  const bump=roomSurfaceTexture(6,6);textures.add(bump);
  ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#e9e5dc',roughness:.89,bumpMap:bump,bumpScale:.0008}));ground.rotation.x=-Math.PI/2;ground.position.y=-.002;ground.receiveShadow=true;scene.add(ground);
}
function release(){
  active=false;cancelAnimationFrame(frame);frame=0;resizeObserver?.disconnect();controls?.dispose();
  const geometries=new Set(),materials=new Set();scene?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());textures.clear();walls.length=0;
  environment?.dispose();studioRender?.dispose();key?.shadow.dispose();renderer?.dispose();renderer?.domElement.remove();scene=null;
}
start.addEventListener('click',async()=>{
  start.disabled=true;status.textContent='Готовим свет и загружаем модель…';
  try{
    const response=await fetch('/ui/showroom/nmd2-600.glb');if(!response.ok)throw Error('Model unavailable');
    const model=readShowroomModel(await response.arrayBuffer(),THREE);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    studioRender=new StudioRender(renderer);
    scene=new THREE.Scene();scene.background=new THREE.Color('#e9e5dc');scene.add(model);
    environment=studioEnvironment(renderer);scene.environment=environment.texture;
    hemi=new THREE.HemisphereLight('#fffaf3','#b7aa98',.55);scene.add(hemi);
    key=new THREE.DirectionalLight('#fffaf1',2.65);key.position.set(-2.4,3.4,3.8);key.target.position.set(0,.4,0);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-1.25,right:1.25,top:1.4,bottom:-1.2,near:.1,far:14});key.shadow.bias=-.00008;key.shadow.normalBias=.001;key.shadow.intensity=.6;key.shadow.radius=8;scene.add(key,key.target);
    fill=new THREE.DirectionalLight('#e8f0ff',.45);fill.position.set(3,2,1);scene.add(fill);
    roomMesh();
    // Analytic ambient contact supplements the real, cached directional shadows.
    const side=128,pixels=new Uint8Array(side*side*4);
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=(y*side+x)*4,dx=(x+.5)/side*2-1,dz=(y+.5)/side*2-1;pixels[i]=pixels[i+1]=pixels[i+2]=50;pixels[i+3]=Math.round(255*.25*Math.exp(-4.8*(dx*dx+dz*dz)));}
    const shadow=new THREE.DataTexture(pixels,side,side);shadow.magFilter=THREE.LinearFilter;shadow.needsUpdate=true;textures.add(shadow);
    const contact=new THREE.Mesh(new THREE.PlaneGeometry(.98,.88),new THREE.MeshBasicMaterial({map:shadow,transparent:true,depthWrite:false,toneMapped:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-.0005;scene.add(contact);
    camera=new THREE.PerspectiveCamera(33,1,.01,100);
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','3D-модель НМД2-600. Поворачивайте мышью или стрелками влево и вправо.');
    controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableZoom=false;controls.minPolarAngle=.2;controls.maxPolarAngle=Math.PI*.49;controls.addEventListener('change',invalidate);
    canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),event.key==='ArrowLeft'?-.2:.2);camera.position.copy(controls.target).add(offset);controls.update();invalidate();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();release();host.classList.remove('is-interactive');start.hidden=false;start.disabled=false;environments.concat(lights).forEach(b=>b.disabled=true);status.textContent='3D-просмотр прерван. Изображения доступны; можно включить 3D снова.';});
    host.append(canvas);active=true;host.classList.add('is-interactive');setRoom(roomName);setLight(lightName);view(viewName);resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
    start.hidden=true;environments.concat(lights).forEach(b=>b.disabled=false);status.textContent='Поверните модель мышью или стрелками. Выберите обстановку и свет.';canvas.focus({preventScroll:true});
  }catch(error){release();start.disabled=false;status.textContent='Не удалось открыть 3D. Изображения модели доступны, можно попробовать ещё раз.';}
});
window.addEventListener('pagehide',release,{once:true});
