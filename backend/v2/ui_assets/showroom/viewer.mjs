import * as THREE from '/account/planner/vendor/three.module.js';
import {OrbitControls} from '/account/planner/vendor/OrbitControls.js';
import {readShowroomModel} from './model.mjs';

const host=document.getElementById('showroom-stage'),start=document.getElementById('showroom-start'),status=document.getElementById('showroom-status');
const views=[...document.querySelectorAll('[data-showroom-view]')];
let renderer,scene,camera,controls,frame=0,resizeObserver,active=false;
const positions={front:[1.25,1.05,1.65],back:[-1.25,1.05,-1.65],detail:[.75,.85,.95]};
function render(){frame=0;if(active)renderer.render(scene,camera);}
function invalidate(){if(active&&!frame)frame=requestAnimationFrame(render);}
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();}
function view(name){
  views.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.showroomView===name)));
  if(active){camera.position.fromArray(positions[name]);controls.target.set(0,.4,0);controls.update();invalidate();}
  else{host.querySelector('img').src='/ui/showroom/'+(name==='back'?'nmd2-back.webp':'nmd2-front.webp');host.querySelector('img').alt=name==='back'?'НМД2-600 — корпус с обратной стороны':'НМД2-600 — фасады и регулируемые опоры';}
}
views.forEach(b=>b.addEventListener('click',()=>view(b.dataset.showroomView)));
start.addEventListener('click',async()=>{
  start.disabled=true;status.textContent='Загружаем модель…';
  try{
    const response=await fetch('/ui/showroom/nmd2-600.glb');if(!response.ok)throw Error('Model unavailable');
    const model=readShowroomModel(await response.arrayBuffer(),THREE);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    scene=new THREE.Scene();scene.background=new THREE.Color('#efede7');scene.add(model);
    scene.add(new THREE.HemisphereLight('#fffaf3','#b0aaa0',2.0));
    const key=new THREE.DirectionalLight('#fff8ec',2.8);key.position.set(-2,4,4);key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.1,far:12});key.shadow.bias=-.0002;key.shadow.normalBias=.002;key.shadow.intensity=.35;scene.add(key);
    const fill=new THREE.DirectionalLight('#eef3ff',1);fill.position.set(3,2,1);scene.add(fill);
    const rim=new THREE.DirectionalLight('#fffaf5',1.3);rim.position.set(0,3,-3);scene.add(rim);
    // Broad contact shadow: no hard rectangle across the studio background.
    const side=128,pixels=new Uint8Array(side*side*4);
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){const i=(y*side+x)*4,dx=(x+.5)/side*2-1,dz=(y+.5)/side*2-1;pixels[i]=pixels[i+1]=pixels[i+2]=60;pixels[i+3]=Math.round(255*.22*Math.exp(-3.6*(dx*dx+dz*dz)));}
    const shadow=new THREE.DataTexture(pixels,side,side);shadow.needsUpdate=true;
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1.15,1.05),new THREE.MeshBasicMaterial({map:shadow,transparent:true,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
    camera=new THREE.PerspectiveCamera(32,1,.01,100);
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','3D-модель НМД2-600. Поворачивайте мышью или стрелками влево и вправо.');
    controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableZoom=false;controls.minPolarAngle=.2;controls.maxPolarAngle=Math.PI*.49;controls.addEventListener('change',invalidate);
    canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),event.key==='ArrowLeft'?-.2:.2);camera.position.copy(controls.target).add(offset);controls.update();invalidate();});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();active=false;host.classList.remove('is-interactive');status.textContent='3D-просмотр недоступен. Можно посмотреть изображения модели.';});
    host.append(canvas);active=true;host.classList.add('is-interactive');view('front');resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
    start.hidden=true;status.textContent='Потяните модель, чтобы повернуть. Доступно управление стрелками.';canvas.focus({preventScroll:true});
  }catch(error){active=false;renderer?.dispose();renderer?.domElement.remove();start.disabled=false;status.textContent='Не удалось открыть 3D. Изображения модели доступны, можно попробовать ещё раз.';}
});
window.addEventListener('pagehide',()=>{active=false;cancelAnimationFrame(frame);resizeObserver?.disconnect();controls?.dispose();scene?.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});renderer?.dispose();},{once:true});
