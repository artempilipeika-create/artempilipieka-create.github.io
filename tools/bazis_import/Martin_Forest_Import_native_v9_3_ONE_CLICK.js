'use strict';

/*
 Martin Forest -> BAZIS native importer v9.3 ONE CLICK (2026-10-07)
 v9.3: all six verified upper donors use a 320 mm frame and 317 mm carcass.
 SHA-256 profiles are measured from each exact original FR3D, including dryers.
 Fix: use the measured elastic frame's bottom centre, not the FR3D insertion
 origin, as the scene anchor. Re-measure AFTER resize; no delta-only guessing.
 Scene X/Z rotation is the negative of a right-handed rotation about BAZIS Y.
 Rotate first, translate last, then verify the anchor and all three basis axes.
 Native FR3D panels, fittings and elastic behaviour are retained.
 Source files are read-only and must match the exported SHA-256 when supplied.
 API: https://cdn.bazissoft.ru/documentation/ru/BAZIS-Script_functions.html
*/

const fs = require('fs');
const path = require('path');
let crypto = null;
try { crypto = require('crypto'); } catch (_) {}

const LIBRARY_ROOT = String.raw`D:\BAZIS MEBEL 25\#_Фрагменты\#_Библиотека кухонь\#_ Каталог для МПЛ\Модули Для Мартин форест`;
const PROJECT_PATTERNS = [/\.mf-bazis(?:\s*\(\d+\))?\.json$/i, /\.mf-bazis.*\.json$/i];

function fail(message) {
  UI.dialogs.ErrorBox('Martin Forest\n\n' + message);
  throw new Error(message);
}

function info(message) {
  UI.dialogs.MessageBox('Martin Forest\n\n' + message);
}

function candidateDownloadDirs() {
  const out = [];
  const add = value => { if (value && !out.some(x => x.toLowerCase() === value.toLowerCase())) out.push(value); };
  const profile = process.env.USERPROFILE || (process.env.HOMEDRIVE && process.env.HOMEPATH ? process.env.HOMEDRIVE + process.env.HOMEPATH : '');
  if (profile) {
    add(path.join(profile, 'Downloads'));
    add(path.join(profile, 'Загрузки'));
  }
  if (process.env.OneDrive) {
    add(path.join(process.env.OneDrive, 'Downloads'));
    add(path.join(process.env.OneDrive, 'Загрузки'));
  }
  if (process.env.OneDriveConsumer) {
    add(path.join(process.env.OneDriveConsumer, 'Downloads'));
    add(path.join(process.env.OneDriveConsumer, 'Загрузки'));
  }
  return out;
}

function newestProjectFile() {
  const candidates = [];
  for (const dir of candidateDownloadDirs()) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { continue; }
    for (const name of names) {
      if (!PROJECT_PATTERNS.some(rx => rx.test(name))) continue;
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) candidates.push({ full, mtime: stat.mtimeMs || 0 });
      } catch (_) {}
    }
  }
  candidates.sort((a,b) => b.mtime - a.mtime);
  return candidates[0] ? candidates[0].full : '';
}

function loadProjectFile() {
  let filename = newestProjectFile();
  if (!filename) {
    // Zero-click path is the default; a dialog is only a recovery fallback when
    // Windows Downloads cannot be resolved or no Martin Forest export exists there.
    const params = {
      extensions: ['json'],
      initialDir: '',
      title: 'Martin Forest — экспорт не найден в Загрузках; выберите *.mf-bazis.json'
    };
    filename = UI.dialogs.RunOpenFileDialog(params);
    if (!filename) fail('В папке Загрузки не найден файл *.mf-bazis.json.');
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (e) {
    fail('Не удалось прочитать JSON проекта:\n' + e.message);
  }

  if (!payload || payload.format !== 'martin-forest-bazis-native-v2' || !Array.isArray(payload.items)) {
    fail('Самый свежий файл имеет неподдерживаемый формат:\n' + filename);
  }
  if (!payload.items.length) fail('В проекте нет модулей БАЗИС.');

  return { filename, payload };
}

function libraryRoot() {
  if (!fs.existsSync(LIBRARY_ROOT)) fail('Не найдена библиотека Martin Forest:\n' + LIBRARY_ROOT);
  return LIBRARY_ROOT;
}

function normalizeSourceName(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  let stem = path.basename(filename || '', ext);
  // Windows/browser duplicate downloads commonly become "name (1).fr3d"
  // or "name.(1).fr3d". Treat those as the same donor identity.
  stem = stem.replace(/[\s.]*\(\d+\)$/u, '');
  stem = stem.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return stem + ext;
}

function collectSourceFiles(root) {
  const files = [];
  const stack = [root];
  const seen = new Set();
  const maxDirectories = 10000;
  let truncated = false;

  while (stack.length) {
    if (seen.size >= maxDirectories) { truncated = true; break; }
    const dir = stack.pop();
    let real = dir;
    try { real = fs.realpathSync(dir); } catch (_) {}
    const key = String(real).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== '.fr3d') continue;
      files.push(full);
    }
  }

  return { files, directories: seen.size, truncated };
}

function sha256File(filename) {
  if (!crypto) return '';
  try {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(filename));
    return h.digest('hex').toLowerCase();
  } catch (_) {
    return '';
  }
}

function resolveSourceFile(root, item, scan) {
  if (!item || !item.source_file) return '';
  const files = scan && Array.isArray(scan.files) ? scan.files : collectSourceFiles(root).files;
  const exact = path.join(root, item.source_file);
  const wantedName = normalizeSourceName(item.source_file);
  const candidates = [];
  const add = file => { if (!candidates.includes(file)) candidates.push(file); };
  if (fs.existsSync(exact)) add(exact);
  for (const file of files) {
    if (normalizeSourceName(path.basename(file)) === wantedName) add(file);
  }
  const wantedSha = String(item.source_sha256 || '').trim().toLowerCase();
  if (wantedSha) {
    if (!/^[a-f0-9]{64}$/.test(wantedSha)) throw new Error('Некорректный SHA-256: ' + item.source_file);
    if (!crypto) throw new Error('Недоступна проверка SHA-256. Импорт остановлен.');
    // A same-named older FR3D is NOT the same production module.
    for (const file of files) add(file);
    const cache = scan ? (scan.hashes || (scan.hashes = new Map())) : new Map();
    for (const file of candidates) {
      if (!cache.has(file)) cache.set(file, sha256File(file));
      if (cache.get(file) === wantedSha) return file;
    }
    return '';
  }
  return candidates[0] || '';
}

function asList(obj) {
  try {
    if (typeof obj.AsList === 'function') return obj.AsList();
  } catch (_) {}
  return obj;
}

function getLocalSize(list) {
  return elasticTransformation.GetObjectLocalSize(list);
}

function axisValue(v, axis) {
  if (axis === 'x') return Number(v.x) || 0;
  if (axis === 'y') return Number(v.y) || 0;
  return Number(v.z) || 0;
}

function setAxisValue(v, axis, value) {
  if (axis === 'x') v.x = value;
  else if (axis === 'y') v.y = value;
  else v.z = value;
}

function detectAxisMap(current, sourceDefault) {
  // role -> axis
  const perms = [
    { width:'x', height:'y', depth:'z' },
    { width:'x', height:'z', depth:'y' },
    { width:'y', height:'x', depth:'z' },
    { width:'y', height:'z', depth:'x' },
    { width:'z', height:'x', depth:'y' },
    { width:'z', height:'y', depth:'x' }
  ];

  const wanted = {
    width: Number(sourceDefault.width) || 0,
    height: Number(sourceDefault.height) || 0,
    depth: Number(sourceDefault.depth) || 0
  };

  let best = null;
  for (const map of perms) {
    const score =
      Math.abs(axisValue(current, map.width)  - wanted.width) +
      Math.abs(axisValue(current, map.height) - wanted.height) +
      Math.abs(axisValue(current, map.depth)  - wanted.depth);

    if (!best || score < best.score) best = { map, score };
  }
  return best;
}

function targetVector(map, target) {
  const out = { x:0, y:0, z:0 };
  setAxisValue(out, map.width,  Number(target.width)  || 0);
  setAxisValue(out, map.height, Number(target.height) || 0);
  setAxisValue(out, map.depth,  Number(target.depth)  || 0);
  return out;
}

const PLACEMENT_TOLERANCE_MM = 0.05;

// Measured from all six exact original upper FR3D files (hash checked before loading):
// frame Z=0..320; overlay back Z=0..3; carcass Z=3..320 (depth 317).
// Unknown hashes retain the strict zero-offset profile. Source files are never changed.
const NATIVE_FRAME_PROFILES = Object.freeze({
  // ВМД1-600. отк P. (Сушка).fr3d
  '60f79b573cd1ae910e0f5ec2796798e4250e3c2e0a2df0f52372d528dace9005': { rearInsetMm: 3 },
  // ВМД1-600. отк L. (Сушка).fr3d
  'b89bf98528601e2bc74e52bc19cc6904a20ff90ed6f0785c1d599c7aac4250fd': { rearInsetMm: 3 },
  // ВМД1-600. отк P.fr3d
  '2175c60e84a6eb6eeefa62eaddc611f2180b6a3060a0ea3aa1b5305ffbcc6ed5': { rearInsetMm: 3 },
  // ВМД1-600. отк L.fr3d
  '858266606bc5e6f36a96635c155beb8f86161ce869956a8f961f27406db7ebc2': { rearInsetMm: 3 },
  // ВМД2-600.(Сушка).fr3d
  '1ac4fadd97b74ebaf1d52e9d37c5d3e8652857c9422032e64dd3d0671911a63b': { rearInsetMm: 3 },
  // ВМД2-600..fr3d
  '877ba2f68d92a70a6eab2c792300e3fea8cc126ab9fbc8966f36b6f2d52ffad3': { rearInsetMm: 3 }
});

function nativeFrameProfile(item) {
  return NATIVE_FRAME_PROFILES[String(item.source_sha256 || '').toLowerCase()] || { rearInsetMm: 0 };
}

function nativeDimensions(dimensions, profile) {
  return { width:Number(dimensions.width), height:Number(dimensions.height),
    depth:Number(dimensions.depth) + profile.rearInsetMm };
}

function sceneFrame(nativeFrame, profile) {
  return {
    min: {x:nativeFrame.min.x, y:nativeFrame.min.y, z:nativeFrame.min.z + profile.rearInsetMm},
    size: {x:nativeFrame.size.x, y:nativeFrame.size.y, z:nativeFrame.size.z - profile.rearInsetMm}
  };
}

function vector(value, label) {
  const out = {};
  for (const axis of ['x', 'y', 'z']) {
    if (!value || !Number.isFinite(Number(value[axis]))) throw new Error('Нет координаты ' + label + '.' + axis);
    out[axis] = Number(value[axis]);
  }
  return out;
}

function readFrame(list) {
  const min = vector(elasticTransformation.GetObjectMinLocalPoint(list), 'frame.min');
  const size = vector(getLocalSize(list), 'frame.size');
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) throw new Error('Некорректная габаритная рамка FR3D');
  return { min, size };
}

function rotateScene(v, degrees) {
  const a = degrees * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: v.x*c - v.z*s, y: v.y, z: v.x*s + v.z*c };
}

function distance(a, b) {
  return Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
}

function placeByFrame(obj, frame, item, log) {
  const desired = vector(item.position, 'position');
  const angle = Number(item.rotation || 0);
  if (!Number.isFinite(angle)) throw new Error('Некорректный угол поворота');
  // This anchor includes empty installation allowances (corner: left 50 mm),
  // excludes protruding fronts/handles, and preserves floor/upper elevation.
  const anchor = {
    x: frame.min.x + frame.size.x/2,
    y: frame.min.y,
    z: frame.min.z + frame.size.z/2
  };
  obj.SetDefaultTransform();
  if (angle) objectTransformation.RotateObject(obj, {x:0, y:1, z:0}, -angle, true);
  // Read the actual transform, so placement is independent of API pivot choice.
  const rotatedAnchor = vector(obj.ToGlobal(anchor), 'rotatedAnchor');
  const origin = vector(obj.ToGlobal({x:0, y:0, z:0}), 'origin');
  setObjectPosition(obj, {
    x: desired.x - (rotatedAnchor.x-origin.x),
    y: desired.y - (rotatedAnchor.y-origin.y),
    z: desired.z - (rotatedAnchor.z-origin.z)
  });
  const actual = vector(obj.ToGlobal(anchor), 'actualAnchor');
  const error = distance(actual, desired);
  if (error > PLACEMENT_TOLERANCE_MM) throw new Error('Ошибка привязки ' + error.toFixed(3) + ' мм');
  const finalOrigin = vector(obj.ToGlobal({x:0,y:0,z:0}), 'finalOrigin');
  for (const unit of [{x:100,y:0,z:0}, {x:0,y:100,z:0}, {x:0,y:0,z:100}]) {
    const measured = vector(obj.ToGlobal(unit), 'basis');
    const expected = rotateScene(unit, angle);
    const difference = distance({x:measured.x-finalOrigin.x,y:measured.y-finalOrigin.y,z:measured.z-finalOrigin.z}, expected);
    if (difference > PLACEMENT_TOLERANCE_MM) throw new Error('Поворот БАЗИС не совпал с экспортом: ' + angle + '°');
  }
  log.push('ПОЗИЦИЯ OK ' + item.name + ': центр низа=' + fmtSize(actual) +
    '; поворот сайта=' + angle + '°; ошибка=' + error.toFixed(3) + ' мм' +
    '; min рамки=' + fmtSize(frame.min));
}


function normalizePanelName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function materialNameForBazis(material) {
  if (!material) return '';
  let name = String(material.name || '').trim();
  const article = String(material.article || '').trim();
  if (!name && !article) return '';
  if (article) {
    const lower = name.toLowerCase();
    const suffix = article.toLowerCase();
    if (lower.endsWith(suffix)) {
      name = name.slice(0, Math.max(0, name.length - article.length)).replace(/[\s,;|/\-]+$/u, '').trim();
    }
    return (name || article) + '\r' + article;
  }
  return name;
}

function firstMaterial(parts, predicate) {
  for (const part of parts || []) {
    if (!predicate(part)) continue;
    const material = part && part.material;
    if (material && (material.name || material.article)) return {
      name: material.name || '',
      article: material.article || '',
      thickness: Number(part.thickness) || 0
    };
  }
  return null;
}

function materialPalette(item) {
  const construction = item && item.construction;
  const parts = construction && Array.isArray(construction.parts) ? construction.parts : [];
  const body = firstMaterial(parts, p => p && (p.role === 'body' || p.role === 'shelf'));
  const front = firstMaterial(parts, p => p && p.role === 'front');
  const hdf = firstMaterial(parts, p => p && p.role === 'back' && Number(p.thickness) <= 6) ||
              firstMaterial(parts, p => p && p.role === 'back');
  return { body, front, hdf, parts };
}

// Exact source hashes: a filename alone must never enable a new material rule.
const SPLIT_CORNER_SOURCES = new Set([
  'a310afbf587f4de0fbd02874b6c8254021ee9cabca422d87b2b82003511f28ad',
  '7978c3a98bf8e0c40cdf69f9c1b30d93ce600c44db7dccac0280ac31c2306638',
  '4f35b7ae7fa751f63ddd64bcb8e2656f79db697485cfc8a2ef57fc4e07ce7e0d',
  '0843131e63bb2f056bbf7270e9492afdbb34b72cbab7629ac323fbe39bf15e2e',
  '33f5a50f71d39713000977131f07ee44fa09f448c7e76334d0000c1d43a03bc9',
  'b0f0037a933b8ad13dd1dff545729b20b5b70ee03fb350ec6de6ee6d6ef74aaf',
  '73465be5d5658b662a20ca1c4f5dc347a5482d3975ef75765e25471c73368df8',
  '54cffd5bd9708f3063537bcfbb5ed40be192c14a857c142a5aa6972d39963b5c'
]);

function panelMaterialKind(panelName, panel, item) {
  const n = normalizePanelName(panelName);
  if (!n) return 'body';
  if (SPLIT_CORNER_SOURCES.has(String(item && item.source_sha256 || '').toLowerCase())) {
    if (n === 'бленда') return 'front';
    if (n === 'вставка' || n === 'фп задняя') return 'body';
    if (n === 'фп') {
      // Both physical panels can be named "ФП". Their in-plane widths are fixed.
      // GetObjectLocalSize accepts TObject3D (including TFurnPanel), not only blocks.
      // https://cdn.bazissoft.ru/documentation/ru/BAZIS-Script_functions.html
      try {
        const size = getLocalSize(panel), width = Math.min(Number(size.x), Number(size.y));
        if (Math.abs(width - 120) < 0.1) return 'front';
        if (Math.abs(width - 458) < 0.1) return 'body';
      } catch (_) {}
      return null;
    }
  }
  // Internal drawer box panels are carcass material by user rule.
  if (/шуф|ящик|боковая напр|фронтальная шуф/.test(n)) return 'body';
  // HDF cabinet backs and drawer bottoms stay their own thin material.
  if (n === 'з с' || /задняя стен|задн стен|двп|хдф|hdf/.test(n)) return 'hdf';
  if (/фасад/.test(n)) return 'front';
  return 'body';
}

function childAt(list, index) {
  try { return list.Objects[index]; } catch (_) {}
  try { return list.Objects(index); } catch (_) {}
  return null;
}

function walkPanels(obj, callback, seen) {
  if (!obj) return;
  seen = seen || new Set();
  let key = null;
  try { key = obj; if (seen.has(key)) return; seen.add(key); } catch (_) {}
  try {
    if (objectTypeChecker.ObjectIsPanel(obj)) callback(obj);
  } catch (_) {}
  let list = null;
  try { list = obj.AsList(); } catch (_) {}
  if (!list) return;
  let count = 0;
  try { count = Number(list.Count) || 0; } catch (_) { return; }
  for (let i = 0; i < count; i++) {
    const child = childAt(list, i);
    if (child && child !== obj) walkPanels(child, callback, seen);
  }
}

function applyProjectMaterials(obj, item, log) {
  const palette = materialPalette(item);
  if (!palette.body && !palette.front && !palette.hdf) {
    log.push('МАТЕРИАЛЫ ПРОПУЩЕНЫ: ' + item.name + ' — в JSON нет данных материалов');
    return;
  }

  const cache = new Map();
  const stats = { body:0, front:0, hdf:0, skipped:0 };
  const getMaterial = (kind, thickness) => {
    const descriptor = palette[kind] || (kind === 'front' ? palette.body : null);
    if (!descriptor) return null;
    const fullName = materialNameForBazis(descriptor);
    if (!fullName) return null;
    const t = Number(thickness) || Number(descriptor.thickness) || 18;
    const key = kind + '|' + fullName + '|' + t;
    if (!cache.has(key)) cache.set(key, materialData.CreateMaterialData(fullName, t));
    return cache.get(key);
  };

  walkPanels(obj, panel => {
    const kind = panelMaterialKind(panel.Name, panel, item);
    if (!kind) {
      stats.skipped++;
      log.push('МАТЕРИАЛ СОХРАНЁН ИЗ FR3D: ' + item.name + ' / ' + panel.Name + ' — размер ФП не распознан');
      return;
    }
    const descriptor = palette[kind] || (kind === 'front' ? palette.body : null);
    if (!descriptor) { stats.skipped++; return; }
    let thickness = Number(descriptor.thickness) || 0;
    try { if (Number(panel.Thickness) > 0) thickness = Number(panel.Thickness); } catch (_) {}
    const material = getMaterial(kind, thickness);
    if (!material) { stats.skipped++; return; }
    try {
      try { historyOperations.RegisterObjectChanging(panel); } catch (_) {}
      // false = do not alter panel thickness; only assign the material parameters.
      materialData.SetupObjectMaterial(panel, material, false);
      if (typeof panel.Build === 'function') panel.Build();
      stats[kind]++;
    } catch (e) {
      stats.skipped++;
      log.push('ОШИБКА МАТЕРИАЛА: ' + item.name + ' / ' + String(panel.Name || 'панель') + ' — ' + e.message);
    }
  });

  log.push(
    'МАТЕРИАЛЫ ' + item.name + ': корпус/шуфляды=' + stats.body +
    ', фасады=' + stats.front + ', ЛХДФ=' + stats.hdf +
    (stats.skipped ? ', пропущено=' + stats.skipped : '')
  );
}

function setObjectPosition(obj, p) {
  obj.PositionX = p.x;
  obj.PositionY = p.y;
  obj.PositionZ = p.z;
}

function fmtSize(v) {
  return [
    Math.round((Number(v.x)||0) * 10) / 10,
    Math.round((Number(v.y)||0) * 10) / 10,
    Math.round((Number(v.z)||0) * 10) / 10
  ].join(' × ');
}

function fmtMap(map) {
  return 'ширина=' + map.width.toUpperCase() +
         ', высота=' + map.height.toUpperCase() +
         ', глубина=' + map.depth.toUpperCase();
}

function resizeAndPlace(obj, item, log) {
  const list = asList(obj);
  if (!item.source_default || !item.target) throw new Error('Нет исходных или целевых габаритов');
  obj.SetDefaultTransform();
  const before = readFrame(list);
  const profile = nativeFrameProfile(item);
  const detected = detectAxisMap(before.size, nativeDimensions(item.source_default, profile));
  const map = detected.map;
  log.push('ОСИ ' + item.name + ': ' + fmtMap(map) + ' | local=' + fmtSize(before.size));
  // All verified Martin Forest donors use X=width, Y=height, Z=depth.
  // Permuting positions alone cannot orient a differently-authored donor.
  if (map.width !== 'x' || map.height !== 'y' || map.depth !== 'z' || detected.score > 0.15) {
    throw new Error('Габаритная рамка/оси FR3D не совпадают с исходником: ' + fmtSize(before.size));
  }
  // Resize the full native frame by the requested carcass delta. Never shrink
  // a 320 mm native frame to the 317 mm carcass depth (which would lose 3 mm).
  const target = vector(targetVector(map, nativeDimensions(item.target, profile)), 'target');
  if (target.x <= 0 || target.y <= 0 || target.z <= 0) throw new Error('Некорректный целевой размер');
  if (distance(before.size, target) > PLACEMENT_TOLERANCE_MM) {
    if (!item.elastic_resize || !elasticTransformation.ObjectIsElasticBlock(list)) {
      throw new Error('Размер отличается, но FR3D не поддерживает эластичное изменение');
    }
    elasticTransformation.ResizeObject(list, target);
    if (typeof obj.Build === 'function') obj.Build();
  }
  const after = readFrame(list);
  if (distance(after.size, target) > PLACEMENT_TOLERANCE_MM) {
    throw new Error('БАЗИС не применил размер: ' + fmtSize(after.size) + ', нужен ' + fmtSize(target));
  }
  applyProjectMaterials(obj, item, log);
  const placementFrame = sceneFrame(after, profile);
  if (profile.rearInsetMm) log.push('РАМКА ' + item.name + ': корпус=' + fmtSize(placementFrame.size) +
    '; с задником=' + fmtSize(after.size) + '; задник=' + profile.rearInsetMm + ' мм');
  placeByFrame(obj, placementFrame, item, log);
  return { frame: after, placementFrame };
}

function prepareProject(payload, root) {
  const scan = collectSourceFiles(root);
  const entries = [], errors = [];
  for (const item of payload.items) {
    const source = resolveSourceFile(root, item, scan);
    if (!source) errors.push(item.source_file + ' — точный FR3D по SHA-256 не найден');
    else entries.push({ item, source });
  }
  if (errors.length) throw new Error('Проверьте исходные FR3D в библиотеке:\n' + errors.join('\n'));
  return { entries, scan };
}

function importProject(prepared, root) {
  const log = ['ПАПКА ПОИСКА: ' + root,
    'ПРОСМОТРЕНО ПАПОК: ' + prepared.scan.directories + '; FR3D: ' + prepared.scan.files.length];
  let loaded = 0, failed = 0;
  for (const entry of prepared.entries) {
    const item = entry.item, source = entry.source;
    let obj;
    try {
      log.push('НАЙДЕН: ' + item.source_file + ' -> ' + source);
      obj = modelIOOperations.LoadFastenerOrFragment(source, currentFileData.model);
      if (!obj) throw new Error('БАЗИС не загрузил FR3D');
      obj.Name = item.name || item.source_file;
      resizeAndPlace(obj, item, log);
      loaded++;
    } catch (e) {
      failed++;
      log.push('ОШИБКА: ' + item.name + ' — ' + e.message);
      // Never leave an unplaced failed module at the model origin.
      if (obj) {
        try { objects3d.DeleteObject(obj); }
        catch (cleanupError) { throw new Error('Не удалось удалить ошибочный модуль: ' + cleanupError.message); }
      }
    }
  }
  historyOperations.CommitCurrentChanges('Martin Forest v9.3 — импорт проекта');
  return { loaded, failed, log };
}

function saveImportLog(projectFilename, result) {
  const filename = projectFilename.replace(/\.json$/i, '') + '.import-v9_3.log.txt';
  fs.writeFileSync(filename, '\uFEFFMartin Forest v9.3\r\n' + new Date().toISOString() + '\r\n' +
    'Проверено модулей: ' + result.loaded + '; ошибок: ' + result.failed + '\r\n' +
    result.log.join('\r\n'), 'utf8');
  return filename;
}

function saveNativeModel(projectFilename) {
  const params = {
    extensions: ['b3d'],
    initialDir: path.dirname(projectFilename),
    title: 'Martin Forest — сохранить модель БАЗИС (*.b3d)'
  };

  let filename = UI.dialogs.RunSaveFileDialog(params);
  if (!filename) return '';

  if (!/\.b3d$/i.test(filename)) filename += '.b3d';
  modelIOOperations.SaveModelToFile(filename);
  return filename;
}

(function main() {
  try {
    const project = loadProjectFile();
    const root = libraryRoot();
    // Resolve and hash-check every donor before starting a new model.
    const prepared = prepareProject(project.payload, root);
    modelIOOperations.NewModel();
    const result = importProject(prepared, root);
    let logFilename = '';
    try { logFilename = saveImportLog(project.filename, result); }
    catch (e) { result.log.push('Лог не сохранён: ' + e.message); }
    for (const line of result.log) console.log(line);
    const lines = [
      result.failed ? 'Импорт завершён с ошибками.' : 'ONE CLICK v9.3 — готово.',
      'Проект: ' + path.basename(project.filename),
      'Загружено и проверено модулей: ' + result.loaded + ' из ' + project.payload.items.length,
      'Ошибок: ' + result.failed,
      'Проверены: габариты, координаты центра, направление поворота.',
      logFilename ? 'Полная диагностика: ' + logFilename : 'Полная диагностика выведена в консоль БАЗИС.'
    ];
    lines.push(...result.log.filter(line => line.startsWith('ОШИБКА:')));
    if (result.failed) UI.dialogs.ErrorBox('Martin Forest\n\n' + lines.join('\n'));
    else info(lines.join('\n'));
  } catch (e) {
    console.log(e && e.stack ? e.stack : String(e));
    UI.dialogs.ErrorBox('Martin Forest v9.3\n\n' + (e.message || String(e)));
  }
})();
