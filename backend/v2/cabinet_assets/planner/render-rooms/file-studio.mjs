import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {GLTFLoader, OBJLoader} from '../vendor/room-loaders.mjs';
import {RenderRooms, prepareRoomMeshes, releaseRoom} from '../render-rooms.mjs';
import {buildRoomSurfaces,wallVisible} from '../room-surfaces.mjs';
import {studioEnvironment} from '../studio-environment.mjs';
import {finishSettings,LIGHTS} from '../room-state.mjs';
import {roomDaylight,daylightKey} from '../room-daylight.mjs';
import {exportSize} from '../presentation.mjs';
import {StudioRender} from '../studio-render.mjs';
import {rooms, roomCategories, roomById} from './catalogue.mjs';

const el = id => document.getElementById(id);
const stage = el('stage'), roomChoice = el('room'), modelChoice = el('model');
const status = text => { el('status').textContent = text; };

function start() {
  const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .98;
  stage.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .045, 140);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = .35;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * .53;
  const post = new StudioRender(renderer);
  const hemi = new THREE.HemisphereLight(0xfffaf1, 0xe1e1d9, 1.1);
  const sun = new THREE.DirectionalLight(0xfff1da, 2);
  const fill = new THREE.DirectionalLight(0xf7f4ed, .92);
  const bounce = new THREE.DirectionalLight(0xfffcf3, .76);
  bounce.position.set(0, -2.5, 1.4);
  bounce.target.position.set(0, 2.2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left:-5, right:5, bottom:-4, top:5, near:.2, far:24});
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .0025;
  sun.shadow.intensity = .53;
  sun.shadow.radius = 38;
  scene.add(hemi, sun, sun.target, fill, fill.target, bounce, bounce.target);
  const viewer = new RenderRooms();
  // The file examples are authored against z=-1.5 m. Finishes share this single room.
  const dimensions={width:4200,depth:3000,height:2700,features:[]};
  const environment=studioEnvironment(renderer);
  scene.environment=environment.texture;
  viewer.place(dimensions);
  let surfaces=null,roomBusy=false,moving=false;
  scene.background = viewer.background;
  const cache = new Map();
  let current = null, custom = null, rotation = 0, revision = 0, roomRevision = 0, fileRevision = 0;
  let manualView = false;
  controls.addEventListener('start', () => { manualView = true; moving=true; });
  controls.addEventListener('end', () => { moving=false;draw(); });
  let modelBusy = false, fileBusy = false, exporting = false, modelMessage = '';
  function draw() {
    if(surfaces){
      for(const wall of surfaces.walls)wall.visible=wallVisible(wall,dimensions,camera.position);
      if(surfaces.ceiling)surfaces.ceiling.visible=camera.position.y<dimensions.height/1000;
    }
    post.render(scene, camera, moving&&!exporting);
  }
  function size() {
    renderer.setSize(Math.max(1,stage.clientWidth), Math.max(1,stage.clientHeight), false);
    camera.aspect = stage.clientWidth / Math.max(1,stage.clientHeight);
    camera.updateProjectionMatrix();
    draw();
  }
  function ready() {
    el('save').disabled = !viewer.room || roomBusy || modelBusy || fileBusy || exporting ||
      viewer.id !== Number(roomChoice.value) || (modelChoice.value !== 'empty' && !current);
  }
  function fit() {
    const view = viewer.cameraView();
    if (!view) return;
    camera.position.copy(view.position);
    controls.target.copy(view.target);
    const half = THREE.MathUtils.degToRad(view.fov / 2);
    camera.fov = Math.min(90, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) * Math.max(1, 1.5 / camera.aspect))));
    camera.updateProjectionMatrix();
    controls.update();
    draw();
  }
  async function openRoom() {
    const token = ++roomRevision, item = roomById(Number(roomChoice.value));
    viewer.select(item.n);
    roomBusy=true;
    ready();
    const settings=finishSettings({renderRoomId:item.n,floorMaterial:el('floor').value,
      lightingPreset:el('lighting').value,usePaletteFloor:el('floor').value==='palette',usePaletteLight:el('lighting').value==='palette'});
    el('floor').options[0].textContent='По варианту · '+(item.floor==='oak'?'дуб':'мрамор');
    el('lighting').options[0].textContent='По варианту · '+({neutral:'нейтральный',warm:'тёплый',daylight:'дневной'})[item.lighting];
    if(surfaces){surfaces.disposeMaps();releaseRoom(surfaces.root);}
    const box=new THREE.BoxGeometry(1,1,1);
    surfaces=buildRoomSurfaces(dimensions,settings,box,Math.min(12,renderer.capabilities.getMaxAnisotropy()),draw);
    scene.add(surfaces.root);
    viewer.surfacesReady=surfaces.ready;
    const lights=LIGHTS[settings.lightingPreset];
    hemi.color.set(lights.sky);hemi.groundColor.set(lights.ground);hemi.intensity=lights.hemi+.22;
    sun.color.set(lights.key);sun.intensity=lights.sun;
    sun.target.position.set(0,.9,-.5);
    sun.position.copy(sun.target.position).add(daylightKey(roomDaylight(dimensions,settings),item));
    fill.color.set(lights.fill);fill.intensity=lights.fillPower+.12;fill.position.set(3.1,2.5,4.8);
    bounce.intensity=.38;
    scene.environmentIntensity=lights.environment;renderer.toneMappingExposure=lights.exposure;
    if(manualView)draw();else fit();
    await viewer.waitReady();
    if(token!==roomRevision)return;
    roomBusy=false;
    status(modelMessage);
    ready();
  }
  function placeFile() {
    const arm = new THREE.Group(), oriented = new THREE.Group();
    oriented.add(custom.root.clone(true));
    if (custom.ext === 'obj' && el('axis').value === 'z') oriented.rotation.x = -Math.PI / 2;
    arm.add(oriented);
    arm.rotation.y = rotation;
    const box = new THREE.Box3().setFromObject(arm), size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(longest) || longest <= 0) throw Error('В файле нет геометрии.');
    const units = {m:1, cm:.01, mm:.001, auto:longest>600?.001:longest>30?.01:1};
    arm.scale.setScalar(units[el('unit').value]);
    box.setFromObject(arm);
    arm.position.set(-(box.min.x+box.max.x)/2, -box.min.y, -1.497-box.min.z);
    box.getSize(size);
    modelMessage = custom.name + ' · ' + [size.x,size.z,size.y].map(v=>v.toLocaleString('ru-RU',{maximumFractionDigits:2})).join(' × ') + ' м';
    return arm;
  }
  async function showModel() {
    const token = ++revision, choice = modelChoice.value;
    modelBusy = true;
    ready();
    el('custom-controls').hidden = choice !== 'custom';
    el('axis-group').hidden = custom?.ext !== 'obj';
    try {
      modelMessage = '';
      let next = null;
      if (choice === 'custom' && custom) next = placeFile();
      if (choice === 'kitchen' || choice === 'wardrobe') {
        if (!cache.has(choice)) {
          cache.set(choice, new GLTFLoader().loadAsync(new URL(choice+'.glb',import.meta.url).href).then(file=>{
            prepareRoomMeshes(file.scene,renderer);
            return file.scene;
          }).catch(error=>{cache.delete(choice);throw error;}));
        }
        const demo = await cache.get(choice);
        if (token !== revision) return;
        next = demo;
      }
      current?.removeFromParent();
      current = next;
      if (current) scene.add(current);
      if (viewer.room) status(modelMessage);
      draw();
    } catch (error) {
      if (token === revision) {current?.removeFromParent();current=null;status(error.message);}
    } finally {
      if (token === revision) { modelBusy = false; ready(); }
    }
  }
  async function openFile(file) {
    if (!file) return;
    const token = ++fileRevision;
    fileBusy = true;
    ready();
    status('Загрузка модели…');
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let root;
      if (ext === 'obj') root = new OBJLoader().parse(await file.text());
      else if (ext === 'glb') {
        const manager = new THREE.LoadingManager();
        manager.setURLModifier(url => {
          if (/^(blob:|data:)/.test(url)) return url;
          throw Error('Включите текстуры в файл GLB и откройте его ещё раз.');
        });
        root = (await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), '')).scene;
      } else throw Error('Выберите файл GLB или OBJ.');
      if (token !== fileRevision) {releaseRoom(root);return;}
      if (new THREE.Box3().setFromObject(root).isEmpty()) {releaseRoom(root);throw Error('В файле нет геометрии.');}
      prepareRoomMeshes(root, renderer);
      const previous = custom;
      custom = {root,ext,name:file.name};
      rotation = 0;
      el('unit').value = 'auto';el('axis').value = 'y';
      el('own-option').disabled = false;
      modelChoice.value = 'custom';
      await showModel();
      releaseRoom(previous?.root);
    } catch (error) { if (token === fileRevision) status(error.message); }
    finally { if(token===fileRevision){fileBusy=false;el('file').value='';ready();} }
  }
  async function download() {
    if (el('save').disabled) return;
    exporting = true;
    ready();
    const ratio = renderer.getPixelRatio(),previousLimit=post.maxDimension;
    const {width,height}=exportSize(el('resolution').value,renderer.capabilities.maxTextureSize);
    try {
      renderer.setPixelRatio(1);
      post.maxDimension=width;
      renderer.setSize(width,height,false);
      camera.aspect=width/height;
      camera.updateProjectionMatrix();
      draw();
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(renderer.domElement,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Не удалось сохранить изображение.');
      const link=document.createElement('a'), url=URL.createObjectURL(blob);
      link.href=url;link.download='Martin_Forest_'+roomChoice.value+'_'+modelChoice.value+'_'+el('floor').value+'.png';
      link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) {status(error.message);}
    finally {exporting=false;post.maxDimension=previousLimit;renderer.setPixelRatio(ratio);size();ready();}
  }
  for (const [i,name] of roomCategories.entries()) {
    const group=document.createElement('optgroup');group.label=name;
    for(const room of rooms.slice(5*i,5*i+5))group.append(new Option(room.name,String(room.n)));
    roomChoice.append(group);
  }
  const query=new URLSearchParams(location.search);
  roomChoice.value=String(roomById(Number(query.get('room')))?.n||1);
  el('floor').value=['oak','marble','light-stone','concrete'].includes(query.get('floor'))?query.get('floor'):'palette';
  if(['wardrobe','empty'].includes(query.get('model')))modelChoice.value=query.get('model');
  roomChoice.onchange=openRoom;modelChoice.onchange=showModel;
  el('floor').onchange=el('lighting').onchange=openRoom;
  el('reset').onclick=()=>{manualView=false;fit();};el('save').onclick=download;
  el('file').onchange=e=>openFile(e.target.files[0]);
  el('upload').onclick=()=>el('file').click();
  el('unit').onchange=el('axis').onchange=showModel;
  el('rotate').onclick=()=>{rotation+=Math.PI/2;showModel();};
  stage.ondragover=e=>e.preventDefault();
  stage.ondrop=e=>{e.preventDefault();openFile(e.dataTransfer.files[0]);};
  controls.addEventListener('change',draw);
  new ResizeObserver(size).observe(stage);
  size();openRoom();showModel();
}

try { start(); } catch { status('Для 3D-студии нужен браузер с поддержкой WebGL.'); }
