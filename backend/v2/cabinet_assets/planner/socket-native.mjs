import {featureBox, featureError, featureWall, socketCount} from './room-plan.mjs';

const sourceHashes = {
  1: '2d8945a5176981eebe0b9206ce3c6f1d47aa3e77baebe13ef586e7586138f485',
  3: 'e97c325787e7237bb18511ceae98a5e00c1570f00eec914c79d52f02a152ca0d'
};
const groups = {1:[1], 2:[1,1], 3:[3], 4:[3,1]};
const orientations = {a:[0,1,0], b:[90,0,1], c:[180,-1,0], d:[270,0,-1]};

export function nativeSocketItems(room) {
  const items = [];
  for (const feature of room.features || []) {
    if (feature.kind !== 'socket') continue;
    const count = socketCount(feature);
    const native = {...feature, width:82*count, height:82, projection:10};
    const error = featureError(native, room);
    if (error) throw Error((feature.label || 'Розетка') + ': ' + error);
    const center = featureBox(native, room);
    const [rotation, dx, dz] = orientations[featureWall(native, room)];
    let cursor = -native.width/2;
    for (const units of groups[count]) {
      const size = {width:82*units, height:82, depth:10};
      const along = cursor + size.width/2;
      const item = {
        name:(feature.label || 'Розетка') + ' · ' + units + ' шт.',
        source_file:'Розетка_' + units + 'шт.fr3d', source_sha256:sourceHashes[units],
        source_default:size, target:{...size}, elastic_resize:false,
        position:{x:center.x + dx*along, y:native.elevation, z:center.z + dz*along}, rotation,
        room_feature_id:feature.id
      };
      if (feature.notes && cursor === -native.width/2) item.production_note = feature.notes;
      items.push(item);
      cursor += size.width;
    }
  }
  return items;
}
globalThis.MF_NATIVE_SOCKETS = nativeSocketItems;
