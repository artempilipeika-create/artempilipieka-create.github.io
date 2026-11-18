import * as THREE from './vendor/three.module.js';
import {roomById} from './render-rooms/catalogue.mjs';

const back = -1.5, depth = 3.68;
const asset = file => new URL('./render-rooms/' + file, import.meta.url).href;
const roomFile = id => String(id).padStart(2, '0') + '.glb';

export function releaseRoom(root) {
  if (!root) return;
  root.removeFromParent();
  const geometry = new Set(), materials = new Set(), textures = new Set();
  root.traverse(node => {
    if (node.geometry) geometry.add(node.geometry);
    for (const m of [].concat(node.material || [])) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  geometry.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

export function prepareRoomMeshes(root, renderer) {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  root.traverse(node => {
    if (node.isLight) node.visible = false;
    if (!node.isMesh) return;
    const list = [].concat(node.material);
    node.castShadow = !list.some(m => m.transparent && m.opacity < 0.2);
    node.receiveShadow = true;
    for (const m of list) if (m.map) m.map.anisotropy = anisotropy;
  });
}

// Classify the authored shell once, in its own metres, for unobstructed orbit views.
function cutaway(root, item) {
  const sides = {left: [], right: [], rear: [], roof: []};
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  const architecture = root.getObjectByName('MF_ARCHITECTURE');
  // These are the exterior scenery nodes in the room files. Balcony and window joinery stay visible.
  root.traverse(node => {
    const name = node.userData.name || node.name;
    if (/^(?:Neighbour(?:[ _](?:frame|glass))?|Garden[ _]lawn|Path[ _]stone)(?:[._]?\d+)?$/i.test(name)) node.visible = false;
  });
  architecture.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    box.setFromObject(mesh);
    if (box.max.x < -item.w / 2 + .48) sides.left.push(mesh);
    else if (box.min.x > item.w / 2 - .48) sides.right.push(mesh);
    else if (box.min.y > item.h - .15) sides.roof.push(mesh);
    else if (box.max.z < back + .17) sides.rear.push(mesh);
  });
  return sides;
}

export class RenderRooms {
  constructor(scene, renderer, changed) {
    this.scene = scene;
    this.renderer = renderer;
    this.changed = changed;
    this.background = new THREE.Color('#d8d8d8');
    this.skies = new Map();
    this.sequence = 0;
    this.floor = 'oak';
    this.eye = new THREE.Vector3();
  }
  async loadSky(name, Loader) {
    if (!this.skies.has(name)) {
      const task = new Loader().loadAsync(asset(name + '.exr')).then(texture => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        return texture;
      }).catch(error => { this.skies.delete(name); throw error; });
      this.skies.set(name, task);
    }
    return this.skies.get(name);
  }
  select(id, retry = false) {
    const item = roomById(id);
    if ((item?.n || null) === this.id && !retry) return;
    const sequence = ++this.sequence;
    this.id = item?.n || null;
    this.error = null;
    this.remove();
    this.pending = item ? this.load(item, sequence) : Promise.resolve();
    this.changed();
  }
  async load(item, sequence) {
    let root;
    try {
      const {GLTFLoader, EXRLoader} = await import('./vendor/room-loaders.mjs');
      if (sequence !== this.sequence) return;
      const skyTask = this.loadSky(item.outside === 'garden' ? 'forest' : 'city', EXRLoader);
      const [model, sky] = await Promise.allSettled([new GLTFLoader().loadAsync(asset(roomFile(item.n))), skyTask]);
      if (model.status === 'fulfilled') root = model.value.scene;
      if (sequence !== this.sequence) return;
      if (model.status === 'rejected' || sky.status === 'rejected') throw Error('Не удалось загрузить комнату «' + item.name + '». Выберите её ещё раз.');
      prepareRoomMeshes(root, this.renderer);
      const walls = cutaway(root, item);
      this.room = {root, walls, item, sky: sky.value, camera: root.getObjectByName('MF_CAMERA'),
        oak: root.getObjectByName('MF_FLOOR_OAK'), marble: root.getObjectByName('MF_FLOOR_MARBLE')};
      this.scene.add(root);
      root = null;
      this.setFloor(this.floor);
      this.place(this.dimensions, this.rotation);
    } catch (error) {
      if (sequence === this.sequence) { this.remove(); this.error = error.message; }
    } finally {
      releaseRoom(root);
      if (sequence === this.sequence) this.changed();
    }
  }
  async waitReady() {
    let pending;
    do { pending = this.pending; await pending; } while (pending !== this.pending);
    if (this.error) throw Error(this.error);
  }
  setFloor(value) {
    this.floor = value === 'marble' ? 'marble' : 'oak';
    if (!this.room) return;
    for (const floor of ['oak', 'marble']) {
      this.room[floor].scale.setScalar(1);
      this.room[floor].visible = this.floor === floor;
    }
  }
  place(dimensions, rotation = 0) {
    this.dimensions = dimensions;
    this.rotation = rotation;
    if (!this.room) return;
    const {root, item} = this.room;
    if (!dimensions) return; // File studio uses the original room dimensions and anchor.
    const turn = Math.abs(rotation % 180) === 90;
    const w = (turn ? dimensions.depth : dimensions.width) / 1000;
    const d = (turn ? dimensions.width : dimensions.depth) / 1000;
    root.scale.set(w / item.w, dimensions.height / (1000 * item.h), d / depth);
    root.rotation.y = -rotation * Math.PI / 180;
    root.position.set(0, 0, -d / 2 - back * root.scale.z).applyAxisAngle(THREE.Object3D.DEFAULT_UP, root.rotation.y);
    root.updateMatrixWorld(true);
  }
  show(perspective, camera) {
    if (!this.room) return false;
    const {root, walls, item} = this.room;
    root.visible = perspective;
    if (!perspective) return false;
    const eye = root.worldToLocal(this.eye.copy(camera.position));
    const visible = {left: eye.x > -item.w / 2, right: eye.x < item.w / 2, rear: eye.z > back, roof: eye.y < item.h};
    for (const [side, meshes] of Object.entries(walls)) {
      for (const mesh of meshes) mesh.visible = visible[side];
    }
    return true;
  }
  cameraView() {
    if (!this.room) return null;
    const {camera, item} = this.room;
    const position = camera.getWorldPosition(new THREE.Vector3());
    const local = new THREE.Vector3(0, -.14, -(item.w + .93));
    return {position, target: camera.localToWorld(local), fov: camera.fov};
  }
  remove() {
    releaseRoom(this.room?.root);
    this.room = null;
  }
  dispose() {
    ++this.sequence;
    this.remove();
    for (const pending of this.skies.values()) pending.then(texture => texture.dispose(), () => {});
    this.skies.clear();
  }
}
