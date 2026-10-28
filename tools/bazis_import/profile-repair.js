// Included in the single-file native importer; no external dependency in BAZIS.
// Profile thickness is signed extrusion length, NOT board/material thickness.
// API: https://cdn.bazissoft.ru/documentation/ru/BAZIS-Script_functions.html
function profilePoint(root, obj, p) {
  return vector(root.ToObject(obj.ToGlobal(p)), 'profile.point');
}

function profilePose(root, obj) {
  const origin = profilePoint(root, obj, {x:0,y:0,z:0});
  const basis = ['x','y','z'].map(axis => {
    const p = profilePoint(root, obj, {x:axis==='x'?1:0,y:axis==='y'?1:0,z:axis==='z'?1:0});
    return {x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z};
  });
  const length = Number(obj.Thickness);
  if (!Number.isFinite(length) || Math.abs(length) < .01) throw new Error('Не прочитана длина профиля ' + obj.Name);
  if (Math.abs(Math.abs(basis[2].x)-1) > .00001 || Math.abs(basis[2].y)+Math.abs(basis[2].z) > .00001)
    throw new Error('Ось профиля не совпадает с шириной шкафа: ' + obj.Name);
  return {origin, basis, length};
}

function profileAt(root, indices, names) {
  let obj = root;
  for (let n=0; n<indices.length; n++) {
    obj = childAt(asList(obj), indices[n]);
    if (!obj || String(obj.Name) !== names[n]) throw new Error('Структура профиля изменилась: ' + names.join(' / '));
  }
  if (!objectTypeChecker.ObjectIsExtrusionBody(obj)) throw new Error('Вместо профиля получен другой объект');
  return obj;
}

function snapshotNativeProfiles(root, item, before, target) {
  const sha = String(item.source_sha256 || '').toLowerCase();
  const golaCount = NATIVE_GOLA_PROFILE_COUNTS[sha] || 0;
  const upper = !!NATIVE_FRAME_PROFILES[sha];
  if (!golaCount && !upper) return [];
  const result = [], seen = new Set();
  function visit(obj, indices, names) {
    if (!obj || seen.has(obj)) return;
    seen.add(obj);
    const name = String(obj.Name || '');
    const kind = golaCount && /^gola\s+[lc]$/i.test(name.trim()) ? 'gola' :
      upper && name.trim()==='Профиль' && names.some(n=>/^Шина для навесов(?:\s|$)/i.test(n)) ? 'mount' : null;
    if (kind) {
      if (!objectTypeChecker.ObjectIsExtrusionBody(obj)) throw new Error('Недоступно тело профиля: ' + name);
      const pose = profilePose(root, obj), endX = pose.origin.x+pose.basis[2].x*pose.length;
      const lo = Math.min(pose.origin.x,endX), hi = Math.max(pose.origin.x,endX);
      const min = before.min.x, max = min+before.size.x;
      let right = false;
      if (kind==='gola') {
        if (Math.abs(lo-min)>.05 || Math.abs(hi-max)>.05)
          throw new Error('Исходный Gola не совпадает с шириной рамки: ' + name);
      } else {
        // Audited native rail: two separate 50 mm pieces, 2 mm from cabinet ends.
        if (Math.abs(Math.abs(pose.length)-50)>.05 ||
            !(Math.abs(lo-min-2)<.05 || Math.abs(max-hi-2)<.05))
          throw new Error('Не распознана привязка короткой монтажной шины');
        right = Math.abs(max-hi-2)<.05;
      }
      const expected = {...pose.origin};
      expected.x += (kind==='gola' ? pose.basis[2].x*pose.length<0 : right) ? target.x-before.size.x : 0;
      if (kind==='mount') expected.y += target.y-before.size.y;
      const length = kind==='gola' ? Math.sign(pose.length)*target.x : pose.length;
      result.push({root, indices, names, kind, pose, anchor:expected, expected:{...expected}, length, before, target, moduleName:item.name});
    }
    let list;
    try { list = obj.AsList(); } catch (_) { return; }
    if (!list) return;
    const count = Number(list.Count);
    if (!Number.isInteger(count) || count<0) throw new Error('Не прочитан состав блока профилей');
    for (let i=0; i<count; i++) {
      const child = childAt(list,i);
      if (!child) throw new Error('Не прочитан объект блока профилей: '+i);
      visit(child, [...indices,i], [...names,String(child.Name || '')]);
    }
  }
  visit(root,[],[]);
  if (result.filter(p=>p.kind==='gola').length !== golaCount)
    throw new Error('Не найдены все исходные профили Gola: ожидается '+golaCount);
  if (NATIVE_CHECKED_MOUNT_SOURCES.has(sha) && result.filter(p=>p.kind==='mount').length!==2)
    throw new Error('Не найдены оба отрезка монтажной шины');
  return result;
}

function verifyNativeProfile(check) {
  const obj = profileAt(check.root,check.indices,check.names), actual = profilePose(check.root,obj);
  if (Math.abs(actual.length-check.length)>.05 || distance(actual.origin,check.expected)>.05 ||
      actual.basis.some((axis,i)=>distance(axis,check.pose.basis[i])>.00001))
    throw new Error('Размер или положение профиля не подтверждены: '+check.names.join(' / '));
  return {moduleName:check.moduleName, name:String(obj.Name), kind:check.kind,
    path:check.names, expectedLength:Math.abs(check.length), actualLength:Math.abs(actual.length),
    signedLength:actual.length, expectedOrigin:check.expected, actualOrigin:actual.origin, verified:true};
}

function repairNativeProfiles(checks, after, log) {
  for (const check of checks) {
    const obj = profileAt(check.root,check.indices,check.names), current = profilePose(check.root,obj);
    if (current.basis.some((axis,i)=>distance(axis,check.pose.basis[i])>.00001))
      throw new Error('При изменении шкафа повернулся профиль: '+obj.Name);
    // Gola Y/Z follow the original native elasticity; only its width is repaired.
    // Mounts keep source offsets from the top and back, independently of nested blocks.
    check.expected={...check.anchor};
    if (check.kind==='gola') { check.expected.y=current.origin.y; check.expected.z=current.origin.z; }
    for (const axis of check.kind==='gola'?['x']:['x','y','z']) check.expected[axis]+=after.min[axis]-check.before.min[axis];
    const changed = Math.abs(current.length-check.length)>.05 || distance(current.origin,check.expected)>.05;
    if (changed) {
      historyOperations.RegisterObjectChanging(obj);
      if (Math.abs(current.length-check.length)>.05) {
        obj.Thickness=check.length;
        obj.Build();
      }
      const now = obj.ToGlobal({x:0,y:0,z:0}), desired = check.root.ToGlobal(check.expected);
      obj.TranslateGCS({x:desired.x-now.x,y:desired.y-now.y,z:desired.z-now.z});
    }
    const result = verifyNativeProfile(check);
    log.push('ПРОФИЛЬ '+(changed?'ИСПРАВЛЕН':'OK')+': '+check.moduleName+' / '+obj.Name+
      ' / '+check.kind+'; длина '+result.actualLength.toFixed(3)+' мм; положение проверено');
  }
}
