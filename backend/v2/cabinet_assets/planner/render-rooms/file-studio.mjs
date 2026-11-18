import * as THREE from '../vendor/three.module.js';
import {OrbitControls} from '../vendor/OrbitControls.js';
import {GLTFLoader, OBJLoader} from '../vendor/room-loaders.mjs';
import {RenderRooms, prepareRoomMeshes, releaseRoom} from '../render-rooms.mjs';
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
  sun.shadow.normalBias = .009;
  sun.shadow.radius = 4;
  scene.add(hemi, sun, sun.target, fill, fill.target, bounce, bounce.target);
  const viewer = new RenderRooms(scene, renderer, () => {});
  scene.background = viewer.background;
  const cache = new Map();
  let current = null, custom = null, rotation = 0, revision = 0, roomRevision = 0, fileRevision = 0;
  let manualView = false;
  controls.addEventListener('start', () => { manualView = true; });
  let modelBusy = false, fileBusy = false, exporting = false, modelMessage = '';
  function draw() {
    viewer.show(true, camera);
    post.render(scene, camera, false);
  }
  function size() {
    renderer.setSize(Math.max(1,stage.clientWidth), Math.max(1,stage.clientHeight), false);
    camera.aspect = stage.clientWidth / Math.max(1,stage.clientHeight);
    camera.updateProjectionMatrix();
    draw();
  }
  function ready() {
    el('save').disabled = !viewer.room || modelBusy || fileBusy || exporting ||
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
    viewer.select(item.n, Boolean(viewer.error));
    viewer.setFloor(el('floor').value);
    status('Загрузка комнаты…');
    ready();
    try {
      await viewer.waitReady();
      if (token !== roomRevision) return;
      scene.environment = viewer.room.sky;
      scene.environmentIntensity = .45;
      const side = item.side === 'L' ? -1 : 1;
      const low = ['morning','afternoon'].includes(item.light);
      sun.color.set(low ? 0xffe3bb : 0xfff0da);
      sun.intensity = item.light === 'soft' ? 1.35 : 2.2;
      sun.position.set(side * 7.3, low ? 4.4 : 6, 3.4);
      sun.target.position.set(0,.2,-.45);
      fill.position.set(-side*.65,3.2,4);
      viewer.room.root.getObjectByName('MF_DRESSING').visible = el('dress').checked;
      if (manualView) draw(); else fit();
      status(modelMessage);
    } catch (error) { if (token === roomRevision) status(error.message); }
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
    const ratio = renderer.getPixelRatio();
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(1920,1150,false);
      camera.aspect=1920/1150;
      camera.updateProjectionMatrix();
      draw();
      const canvas=document.createElement('canvas');
      canvas.width=1920;canvas.height=1150;
      canvas.getContext('2d').drawImage(renderer.domElement,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('Не удалось сохранить изображение.');
      const link=document.createElement('a'), url=URL.createObjectURL(blob);
      link.href=url;link.download='Martin_Forest_'+roomChoice.value+'_'+modelChoice.value+'_'+el('floor').value+'.png';
      link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) {status(error.message);}
    finally {exporting=false;renderer.setPixelRatio(ratio);size();ready();}
  }
  for (const [i,name] of roomCategories.entries()) {
    const group=document.createElement('optgroup');group.label=name;
    for(const room of rooms.slice(5*i,5*i+5))group.append(new Option(room.name,String(room.n)));
    roomChoice.append(group);
  }
  const query=new URLSearchParams(location.search);
  roomChoice.value=String(roomById(Number(query.get('room')))?.n||1);
  el('floor').value=query.get('floor')==='marble'?'marble':'oak';
  if(query.get('model')==='wardrobe')modelChoice.value='wardrobe';
  roomChoice.onchange=openRoom;modelChoice.onchange=showModel;
  el('floor').onchange=()=>{viewer.setFloor(el('floor').value);draw();};
  el('dress').onchange=()=>{if(viewer.room){viewer.room.root.getObjectByName('MF_DRESSING').visible=el('dress').checked;draw();}};
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
