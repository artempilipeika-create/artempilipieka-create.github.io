import * as THREE from './vendor/three.module.js';
import {roomById} from './render-rooms/catalogue.mjs';

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

// Palette selection never adds architecture to the scene. Both viewers draw the
// native wall panels and use the same measured-room camera.
export class RenderRooms {
  constructor() {
    this.background = new THREE.Color('#d8d8d8');
    this.id = null;
    this.room = null;
  }
  select(id) {
    if ((id ?? null) === this.id) return;
    const item = roomById(id);
    this.id = item?.n ?? null;
    this.room = item ? {item} : null;
  }
  place(dimensions, rotation = 0) {
    this.dimensions = dimensions;
    this.rotation = rotation;
  }
  async waitReady() {
    let current;
    do {
      current = this.surfacesReady;
      await current;
    } while (current !== this.surfacesReady);
  }
  cameraView() {
    if (!this.room || !this.dimensions) return null;
    const {width, depth, height} = this.dimensions;
    const turn = Math.abs(this.rotation % 180) === 90;
    const w = (turn ? depth : width) / 1000, d = (turn ? width : depth) / 1000;
    const h = height / 1000, target = new THREE.Vector3(0,h*.46,-d*.33);
    const position = new THREE.Vector3(w*.21,h*.57,Math.max(d*.52,w*.73));
    const angle = -this.rotation*Math.PI/180;
    return {position:position.applyAxisAngle(THREE.Object3D.DEFAULT_UP,angle),
      target:target.applyAxisAngle(THREE.Object3D.DEFAULT_UP,angle),fov:39};
  }
}
