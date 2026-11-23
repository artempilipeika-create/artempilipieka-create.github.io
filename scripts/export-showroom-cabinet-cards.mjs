// node scripts/export-showroom-cabinet-cards.mjs /tmp/mf-cabinet-shoot
// The render inputs are the same native models and option selectors used in the constructor.
import fs from 'node:fs';
import { visitKitchenCards } from './kitchen-card-views.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from '../backend/v2/cabinet_assets/planner/vendor/three.module.js';
import {
  PRODUCTION_MODELS,
  CORNER_VARIANTS,
  normalizeKitchen,
  productionParts,
  drawerSlideLengthMm,
} from '../backend/v2/cabinet_assets/planner/furniture-core.mjs';
import {
  EXECUTION_IMAGES,
  TALL_GOLA_IMAGES,
  TALL_GOLA_OPEN_IMAGES,
} from '../backend/v2/cabinet_assets/planner/execution-image-index.mjs';
import { MeshFactory } from '../backend/v2/cabinet_assets/planner/module-mesh.mjs';
import { optionDescriptor, previewVariant } from '../backend/v2/cabinet_assets/planner/execution-options.mjs';
import { readApplianceGeometry } from '../backend/v2/cabinet_assets/planner/appliance-assets.mjs';
import {
  trimApplianceBody,
  buildApplianceFront,
} from '../backend/v2/cabinet_assets/planner/appliance-finish.mjs';
import '../backend/v2/cabinet_assets/planner/catalogue-artwork.js';

const output = path.resolve(process.argv[2]),
  room = { width: 6000, depth: 5000, height: 3000 };
fs.mkdirSync(path.join(output, 'geometry'), { recursive: true });
const catalogue = Object.entries(PRODUCTION_MODELS).map(([id, p]) => ({
  id,
  source_file: p.source_file,
  source_sha256: p.source_sha256,
  production: p,
  resize: p.resize,
}));
const families = {};
for (const [id, entry] of Object.entries(globalThis.MF_CATALOGUE_ARTWORK)) {
  families[entry.file] ??= id;
}
const defaults = {
  base: 'bazis.0211e4f77fc4',
  'base-double': 'bazis.3079d0656398',
  drawer: families['base-drawers'],
  oven: families['base-oven'],
  corner: families['base-corner'],
  cargo: families.cargo,
  dryer: families['pullout-dryer'],
  dishwasher: families.dishwasher,
  upper: 'bazis.858266606bc5',
  'upper-double': 'bazis.6c187245284a',
  'open-tall-none': families['open-tall-none'],
  'tall-vitrine': families['tall-vitrine'],
  'tall-appliance': families['tall-appliance'],
  'tall-storage': families['tall-storage'],
};
const assets = new URL('../backend/v2/cabinet_assets/planner/appliance-assets/', import.meta.url);
const state = { items: [], room, plinths: [] };
const factory = new MeshFactory(
  { room, state, template: (it) => ({ production: PRODUCTION_MODELS[it.bazis_id] }), material: () => null },
  () => {},
);
for (const kind of ['oven', 'microwave', 'sink', 'faucet']) {
  const meta = JSON.parse(fs.readFileSync(new URL(kind + '-tripo.json', assets)));
  const bytes = fs.readFileSync(new URL(meta.buffer, assets));
  const original = readApplianceGeometry(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    meta,
  );
  const front = ['oven', 'microwave'].includes(kind) ? buildApplianceFront(kind) : null;
  const mat = new THREE.MeshPhysicalMaterial({ color: '#999999', roughness: 0.42, metalness: 0.3 });
  mat.userData.asset = kind;
  factory.applianceAssets.entries.set(kind, {
    ready: true,
    textures: [],
    geometry: front ? trimApplianceBody(original) : original,
    material: mat,
    ghost: mat,
    frontGeometry: front?.geometry,
    frontMaterials: front?.materials,
    frontGhostMaterials: front?.materials,
    mountAnchor: meta.mountAnchor,
    nominalSize: meta.nominalSize,
  });
}

function item(id) {
  const p = PRODUCTION_MODELS[id],
    base = p.base_height,
    height = p.body_height + base;
  const plain = p.modern ?? p.wall_special ?? p.upper ?? p.tall ?? p.cargo ?? p.gola ?? p.metal_drawers ?? {};
  const handleless =
    plain.execution === 'gola' ||
    plain.opening === 'push' ||
    p.dishwasher?.variant === 'gola' ||
    ['push', 'handleless'].includes(plain.execution) ||
    p.vitrine ||
    p.open_tall ||
    p.modern?.family === 'fridge';
  return normalizeKitchen({
    item_id: 'cabinet',
    name: p.label,
    bazis_id: id,
    bazis_sha256: p.source_sha256,
    bazis_file: p.source_file,
    module_type: { wall: 'wall_cabinet', tall: 'tall_cabinet', base: 'base_cabinet' }[p.tier],
    width: p.native_defaults?.width ?? 600,
    height,
    depth: p.scene_depth,
    body_height: p.body_height,
    base_height: base,
    base: p.tier === 'wall' ? 'wall' : 'legs',
    handles: handleless ? 'handleless' : 'handles',
    layout: p.front?.kind ?? 'doors',
    drawers: p.front?.kind === 'drawers' ? p.front.count : 0,
    x: 0,
    z: 0,
    rotation: 0,
    part_materials: {},
  });
}

const jobs = new Map();
function add(folder, file, it, view = 'closed') {
  const key = folder + '/' + file.replace(/\.webp$/, '') + '.webp';
  if (!jobs.has(key)) jobs.set(key, { it, view });
}
const moduleCard = (file, it, view) => add('module-card-images', file, it, view);
const executionCard = (file, it, view) => add('execution-card-images', file, it, view);
for (const [file, id] of Object.entries(families)) {
  let mode = 'closed';
  if (['waste-standard', 'cargo', 'pullout-dryer'].includes(file)) mode = 'pulled';
  if (file === 'modern-gaslift') mode = 'hinge';
  if (file === 'dishwasher') mode = 'appliance';
  moduleCard(file, item(id), mode);
}
for (const f of Object.values(globalThis.MF_MODERN_CABINETS.families))
  moduleCard('modern-' + f.key, item(f.default_id), f.key === 'gaslift' ? 'hinge' : 'closed');
for (const v of globalThis.MF_MODERN_CABINETS.variants)
  add('kitchen-option-images', v.id.slice(6), item(v.id), v.family === 'fridge' ? 'closed' : 'hinge');
for (const v of [...globalThis.MF_DRAWERS.choices(), ...globalThis.MF_CARGO.variants, ...globalThis.MF_PULLOUT_DRYERS.variants])
  add('kitchen-option-images', v.id.slice(6), item(v.id), 'pulled');
for (const v of globalThis.MF_GOLA.baseChoices())
  add('kitchen-option-images', v.id.slice(6), item(v.id), v.purpose === 'sink' ? 'bareHinge' : 'hinge');
for (const v of globalThis.MF_WALL_SPECIAL.variants)
  moduleCard(v.id.replace('bazis.', 'wall-special-'), item(v.id));
for (const v of globalThis.MF_OPEN_TALL.variants.filter((v) => v.wall && v.catalogue_primary))
  moduleCard(v.id.replace('bazis.', 'open-wall-'), item(v.id));
for (const v of CORNER_VARIANTS)
  moduleCard(
    'corner-' + [v.side, v.purpose, v.door_count].join('-'),
    item(v.id),
    v.purpose === 'shelf' ? 'hinge' : 'bareHinge',
  );
for (const v of globalThis.MF_CARGO.variants.filter((v) => v.waste))
  moduleCard('waste-' + v.execution, item(v.id), 'pulled');
for (const [id, file] of Object.entries(TALL_GOLA_IMAGES)) executionCard(file, item(id));
for (const [id, file] of Object.entries(TALL_GOLA_OPEN_IMAGES)) executionCard(file, item(id), 'hinge');

function optionItem(category, family, key, value) {
  let base = item(defaults[category]);
  if (category === 'cargo' && key === 'brand') base.width = 200;
  if (category === 'drawer' && (value === 'inner' || value === 'push'))
    base = item(
      globalThis.MF_DRAWERS.variants.find(
        (v) =>
          v.system === 'slimbox' && v.execution === 'standard' && v.layout === 'two' && v.opening === 'soft',
      ).id,
    );
  if (category === 'open-tall-none' && key === 'lighting')
    base = previewVariant(base, family, 'light_system', 'aq-4x8', catalogue);
  return previewVariant(base, family, key, value, catalogue);
}
for (const [key, file] of Object.entries(EXECUTION_IMAGES)) {
  if (jobs.has('execution-card-images/' + file)) continue;
  const [category, family, field, value] = key.split(':');
  const it = optionItem(category, family, field, value);
  let view = optionDescriptor(family, field, value).view;
  if (
    (it.layout === 'drawers' && ['brand', 'system', 'dryer_brand', 'layout'].includes(field)) ||
    PRODUCTION_MODELS[it.bazis_id].cargo ||
    PRODUCTION_MODELS[it.bazis_id].pullout_dryer
  )
    view = 'pulled';
  if (category === 'corner' && field === 'purpose' && value === 'shelf') view = 'hinge';
  if (family === 'upper' && field === 'filling') view = 'hinge';
  executionCard(file, it, view);
}
for (const v of globalThis.MF_OPEN_TALL.variants.filter(
  (v) => !v.wall && v.catalogue_primary && v.light_system === 'lira-17.5x6.5',
))
  executionCard('open-tall-lira-' + v.lighting, item(v.id));

function openDrawers(body, it) {
  const p = PRODUCTION_MODELS[it.bazis_id],
    fronts = [];
  body.traverse((m) => {
    if (m.isMesh && m.userData.role === 'front' && m.userData.facade?.kind === 'drawer') fronts.push(m);
  });
  if (!fronts.length)
    body.traverse((m) => {
      if (m.isMesh && m.userData.role === 'front' && !m.userData.part?.fixed) fronts.push(m);
    });
  const levels = fronts
    .map((f) => ({
      y: f.position.y,
      pullY: f.position.y + (f.userData.facade?.h ?? f.userData.part?.size.y ?? 0) * 0.0005 - 0.036,
      index: f.userData.part?.drawer_index,
    }))
    .sort((a, b) => b.y - a.y);
  const idx = levels[0]?.index,
    travel = Math.min(0.29, it.depth * 0.00054);
  const visibleDrawer = p.cargo || p.pullout_dryer;
  function indexFor(m) {
    const u = m.userData;
    if (Number.isFinite(u.drawerIndex ?? u.part?.drawer_index)) return u.drawerIndex ?? u.part.drawer_index;
    const hit = /^drawer-(\d+)-/.exec(u.part?.key || '');
    return hit ? Number(hit[1]) : null;
  }
  body.traverse((m) => {
    if (!m.isMesh) return;
    const u = m.userData,
      role = u.role,
      part = u.part;
    if (
      !(
        u.cargoBasket ||
        u.pulloutDryer ||
        u.drawerMetal ||
        part?.role === 'drawer' ||
        /^drawer-/.test(part?.key ?? '') ||
        fronts.includes(m) ||
        (role === 'handle' && u.frontAccessory)
      )
    )
      return;
    const index = indexFor(m),
      heightKey = role === 'handle' ? 'pullY' : 'y';
    const closest = levels.reduce(
      (a, b) => (!a || Math.abs(m.position.y - b[heightKey]) < Math.abs(m.position.y - a[heightKey]) ? b : a),
      null,
    );
    const top = idx != null && index != null ? index === idx : closest === levels[0];
    // Stagger fronts enough to see each native side and runner, most travel at the top.
    const rank = levels.findIndex((l) => (index != null ? l.index === index : l === closest));
    const d =
      visibleDrawer || levels.length < 2 ? travel : top ? travel : rank === 1 ? travel * 0.43 : travel * 0.1;
    m.position.z += d;
  });
}

// The integrated dishwasher donor is intentionally a furniture front only. This
// measured illustration supplies an appliance envelope and wire racks behind it.
function dishwasherExample(body, it, opened) {
  const w = it.width - 16,
    h = it.height - it.base_height,
    d = Math.min(it.depth - 26, 550),
    front = it.depth / 2 - 7;
  const midY = it.base_height + h / 2,
    z = front - d / 2;
  const panel = (width, height, depth, x, y, z, role = 'applianceMetal') =>
    factory.box(body, role, width, height, depth, x, y, z, null, false, 1.3);
  const frontGroup = new THREE.Group();
  frontGroup.position.set(0, it.base_height * 0.001, (it.depth / 2 + 0.001) * 0.001);
  for (const mesh of [...body.children])
    if (mesh.userData.frontAccessory || mesh.userData.role === 'front') {
      body.updateMatrixWorld(true);
      frontGroup.updateMatrixWorld(true);
      frontGroup.attach(mesh);
    }
  body.add(frontGroup);
  // Tub and outer skin with a recessed, open mouth for the lower and upper racks.
  for (const sign of [-1, 1]) {
    panel(13, h - 10, d, sign * (w / 2 - 6.5), midY, z);
    for (const level of [0.22, 0.46, 0.7])
      panel(3, 5, d * 0.85, sign * (w / 2 - 14), it.base_height + h * level, z);
  }
  panel(w - 26, 14, d, 0, it.base_height + 7, z);
  panel(w - 26, 12, d, 0, it.height - 6, z);
  panel(w - 26, h - 22, 12, 0, midY, front - d + 6);
  // A presentation-only tub panel and gasket follow the native furniture door.
  const liner = factory.box(frontGroup, 'applianceMetal', w - 20, h - 18, 18, 0, h / 2, -12, null, false, 8);
  const tray = factory.box(
    frontGroup,
    'applianceDark',
    w * 0.29,
    48,
    7,
    -w * 0.19,
    h * 0.68,
    -24,
    null,
    false,
    5,
  );
  liner.userData.visualOnly = tray.userData.visualOnly = true;
  for (const y of [it.base_height + h * 0.28, it.base_height + h * 0.62]) {
    const bw = w - 71,
      bd = d - 74,
      cy = y + 35;
    for (const sign of [-1, 1]) {
      panel(bw, 4, 4, 0, cy, front - bd / 2 - 24 + (sign * bd) / 2, 'rackSteel');
      panel(4, 4, bd, (sign * bw) / 2, cy, front - bd / 2 - 24, 'rackSteel');
    }
    for (let x = -bw / 2 + 15; x <= bw / 2; x += 32) {
      panel(3, 3, bd, x, y, front - bd / 2 - 24, 'rackSteel');
      for (const sg of [-1, 1]) panel(3, 36, 3, x, y + 17, front - bd / 2 - 24 + (sg * bd) / 2, 'rackSteel');
    }
    for (let a = 21; a < bd; a += 49) panel(bw, 4, 3, 0, y, front - a - 24, 'rackSteel');
  }
  if (opened) frontGroup.rotation.x = 1.13;
}
function ballRunners(body, it) {
  const p = PRODUCTION_MODELS[it.bazis_id];
  if (!String(p.hardware?.slide_type ?? '').includes('ball_bearing')) return;
  const sidePanels = productionParts(it, { production: p }).filter((pt) =>
    /^drawer-\d+-side-[LP]$/.test(pt.key),
  );
  const length = drawerSlideLengthMm(it.depth);
  for (const pt of sidePanels) {
    const { x, y, z } = pt.position,
      sign = Math.sign(x);
    const outer = x + sign * (pt.size.x / 2 + 1.6);
    const rail = factory.box(body, 'railSteel', 3.2, 24, length - 13, outer, y, z + 4, null, false, 0.7);
    Object.assign(rail.userData, { drawerMetal: true, drawerIndex: pt.drawer_index });
    for (const offset of [-9, 9]) {
      const lip = factory.box(
        body,
        'hinge',
        2,
        2.6,
        length - 17,
        outer + sign * 2,
        y + offset,
        z + 4,
        null,
        false,
        0.5,
      );
      Object.assign(lip.userData, { drawerMetal: true, drawerIndex: pt.drawer_index });
    }
  }
}
const geomData = new Map(),
  geoCache = new WeakMap(),
  outScenes = {},
  cards = {};

// Some BAZIS donors describe the drying kit by article only. Show the two
// installed baskets and drip tray in the illustration, in the supplier finish.
function dryingRacks(body, it, finish) {
  const w = it.width - 49, d = Math.min(it.depth - 40, 260);
  const wire = new THREE.MeshStandardMaterial(finish === 'inox'
    ? {color: '#aeb7bf', metalness: .85, roughness: .24}
    : {color: '#f6f7f5', metalness: .08, roughness: .42});
  const segment = new THREE.CylinderGeometry(1, 1, 1, 8);
  const axis = new THREE.Vector3(0, 1, 0);
  function rod(a, b, diameter=3) {
    const from = new THREE.Vector3(...a).multiplyScalar(.001), to = new THREE.Vector3(...b).multiplyScalar(.001);
    const direction = to.sub(from), mesh = new THREE.Mesh(segment, wire);
    mesh.position.copy(from).addScaledVector(direction, .5);
    mesh.scale.set(diameter / 2000, direction.length(), diameter / 2000);
    mesh.quaternion.setFromUnitVectors(axis, direction.normalize());
    mesh.userData.role = 'rackWire';
    body.add(mesh);
  }
  const front = d/2, back = -front;
  for (const [y, plates] of [[65, false], [Math.min(it.height*.46, 322), true]]) {
    for (const z of [back, front]) rod([-w/2,y+13,z],[w/2,y+13,z],6);
    for (const x of [-w/2, w/2]) rod([x,y+13,back],[x,y+13,front],6);
    for (let x = -w/2+13; x < w/2-8; x += plates ? 27 : 16) {
      const points = plates ? [[x, y+41, back], [x,y+4,back+46], [x,y+4,front-74], [x+4,y+65,front-36], [x,y+13,front]]
                            : [[x,y+13,back],[x,y,back+14],[x,y,front-14],[x,y+13,front]];
      for (let k=1; k<points.length; k++) rod(points[k-1],points[k]);
    }
    factory.box(body,'dripTray',w-10,5,d-10,0,y-15,0,null,false,2);
  }
}

function geometry(g, group, slot) {
  let ids = geoCache.get(g);
  if (!ids) {
    ids = [];
    geoCache.set(g, ids);
  }
  if (ids[slot]) return ids[slot];
  const position = g.getAttribute('position'),
    normal = g.getAttribute('normal'),
    uv = g.getAttribute('uv');
  const n = position.count,
    indices = new Uint32Array(group.count);
  for (let i = 0; i < indices.length; i++)
    indices[i] = g.index ? g.index.getX(group.start + i) : group.start + i;
  const chunks = [
    new Uint32Array([n, indices.length, Boolean(normal), Boolean(uv)]),
    new Float32Array(position.array),
  ];
  if (normal) chunks.push(new Float32Array(normal.array));
  if (uv) chunks.push(new Float32Array(uv.array));
  chunks.push(indices);
  const data = Buffer.concat(chunks.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
  const id = crypto.createHash('sha256').update(data).digest('hex').slice(0, 22);
  if (!geomData.has(id)) {
    fs.writeFileSync(path.join(output, 'geometry', id + '.mesh'), data);
    geomData.set(id, true);
  }
  ids[slot] = id;
  return id;
}
function sceneEntries(root, production) {
  root.updateMatrixWorld(true);
  const entries = [];
  root.traverseVisible((m) => {
    if (!m.isMesh || m.material?.alphaMap || m.userData.role === 'reveal') return;
    const g = m.geometry,
      materials = Array.isArray(m.material) ? m.material : [m.material];
    const groups =
      materials.length > 1 && g.groups.length
        ? g.groups
        : [{ start: 0, count: g.index?.count ?? g.attributes.position.count, materialIndex: 0 }];
    groups.forEach((group, i) => {
      const mat = materials[group.materialIndex] ?? materials[0],
        role =
          m.userData.role === 'glass' && m.userData.part?.role === 'shelf'
            ? 'glassShelf'
            : (m.userData.artRole ?? (production ? null : m.userData.appliance) ?? m.userData.role ?? '');
      let color = mat.color?.getHexString() ?? 'a9a8a6',
        metalness = mat.metalness ?? 0;
      if (m.userData.wasteColor) {
        color = m.userData.wasteColor.replace('#', '');
        metalness = 0.08;
      } else if (m.userData.cargoBasket || m.userData.pulloutDryer) {
        const chrome = production?.cargo?.brand === 'norwing' || production?.pullout_dryer?.dryer_brand === 'flat_line';
        color = chrome ? '9aa4ac' : '43494c';
        metalness = chrome ? 0.78 : 0.36;
      }
      entries.push({
        geometry: geometry(g, group, i),
        matrix: m.matrixWorld.toArray(),
        material: {
          role,
          color,
          roughness: mat.roughness ?? 0.55,
          metalness,
          asset: mat.userData.asset ?? (['sink','faucet'].includes(role) ? role : null),
        },
        lightSide: m.userData.lightingSide ?? null,
      });
    });
  });
  return entries;
}
function makeScene(it, view) {
  it = { ...it, doors_open: view === 'hinge' || view === 'bareHinge' };
  const p = PRODUCTION_MODELS[it.bazis_id];
  state.items = [it];
  const root = new THREE.Group(),
    body = factory.build(it);
  root.add(body);
  if (p.dishwasher) dishwasherExample(body, it, view === 'appliance');
  if (view === 'pulled') ballRunners(body, it);
  if (view === 'inside')
    body.traverse((m) => {
      if (
        m.userData.role === 'door-pivot' ||
        (m.isMesh && ((m.userData.role === 'front' && !m.userData.part?.fixed) || m.userData.frontAccessory))
      )
        m.visible = false;
    });
  if (view === 'pulled') openDrawers(body, it);
  if ((p.dryer || p.modern?.filling === 'dryer') && ['inside','hinge'].includes(view))
    dryingRacks(body, it, p.modern?.dryer || 'mount');
  // Expose the top rails of a sink carcase in the filling view.
  if (
    p.tier === 'base' &&
    view !== 'bareHinge' &&
    !(
      view === 'inside' &&
      (p.carcass?.type?.includes('sink') || p.corner?.purpose === 'sink' || p.gola?.purpose === 'sink')
    )
  ) {
    const dress = factory.dress([it], state);
    root.add(dress);
  }
  if (p.base_height > 0)
    factory.box(
      root,
      'plinth',
      it.width - 2,
      p.base_height - 3,
      18,
      0,
      (p.base_height - 3) / 2,
      it.depth / 2 - 55,
      null,
    );
  const entries = sceneEntries(root, p);
  const side = it.doors_open
    ? (p.vitrine?.opening ?? p.tall?.opening ?? p.doors?.[0]?.side)
    : p.tall?.execution === 'gola'
      ? p.tall.opening
      : null;
  const light = p.open_tall?.lighting ?? p.vitrine?.lighting ?? p.wall_special?.lighting;
  const cameraX =
    side === 'right' || p.corner?.side === 'right' || p.wall_special?.side === 'right' || light === 'right'
      ? -0.48
      : 0.48;
  const camera = [
    view === 'pulled' ? cameraX * 2.2 : cameraX,
    p.tier === 'tall' ? 0.19 : p.tier === 'wall' ? 0.24 : view === 'pulled' ? 0.69 : 0.41,
    1.35,
  ];
  const shot = { camera, wall: p.tier === 'wall', entries };
  factory.release(body);
  for (const child of [...root.children]) factory.release(child);
  return shot;
}
const cache = new Map();
for (const [file, { it, view }] of jobs) {
  const key = [it.bazis_id, it.handles, it.width, it.height, it.depth, view].join('/');
  if (!cache.has(key)) {
    const shot = makeScene(it, view);
    const id = crypto.createHash('sha256').update(JSON.stringify(shot)).digest('hex').slice(0, 20);
    if (!outScenes[id]) outScenes[id] = { id, source: it.bazis_id, view, ...shot };
    cache.set(key, id);
  }
  cards[file] = cache.get(key);
}
visitKitchenCards((folder, file, root, {wall, sink}) => {
  const shot = {camera:[.48, sink ? .66 : wall ? .24 : .41, 1.35], wall, entries:sceneEntries(root)};
  const id = crypto.createHash('sha256').update(JSON.stringify(shot)).digest('hex').slice(0, 20);
  outScenes[id] ??= {id, source:file, view:'questionnaire', ...shot};
  cards[folder+'/'+file+'.webp'] = id;
}, true);
fs.writeFileSync(path.join(output, 'catalogue.json'), JSON.stringify({ cards, scenes: outScenes }));
console.log(
  Object.keys(cards).length +
    ' card images, ' +
    Object.keys(outScenes).length +
    ' distinct views, ' +
    geomData.size +
    ' reusable meshes',
);
factory.dispose();
