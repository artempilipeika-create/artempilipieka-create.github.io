import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {Object3D, Vector3} from '../../backend/v2/cabinet_assets/planner/vendor/three.module.js';

const source = fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/bazis-drawers-import.js', import.meta.url), 'utf8');
const vector = ({x, y, z}) => new Vector3(x, y, z);
const ctx = vm.createContext({
  require: createRequire(import.meta.url), process, console,
  objectTypeChecker: {ObjectIsLimits: o => o.frame === true},
  objectTransformation: {RotateObject: (o, axis, angle) => o.rotateOnWorldAxis(vector(axis), angle * Math.PI / 180)},
  objects3d: {DeleteObject: o => o.removeFromParent()},
  historyOperations: {RegisterObjectChanging() {}},
  fastenerOperations: {holeDrillMode: {through: 1, blind: 2}},
});
vm.runInContext(source.slice(0, source.lastIndexOf('(function main()')), ctx);

class Part extends Object3D {
  AsList() { return this; }
  get Objects() { return this.children; }
  get Count() { return this.children.length; }
  set PositionX(x) { this.position.x = x; }
  set PositionY(y) { this.position.y = y; }
  set PositionZ(z) { this.position.z = z; }
  ToGlobal(p) { return this.localToWorld(vector(p)); }
  ToObject(p) { return this.worldToLocal(vector(p)); }
  SetDefaultTransform() { this.position.set(0, 0, 0); this.quaternion.identity(); }
  Build() {}
}

// Physical hole definitions from each manufacturer's fixed-size FR3D, including the three-point long MONBLAN.
const sources = [
  ['92255', '03e648493b2963c7acb72cfe487994631bcf578eaf5b6303777a5d96097a2436', [-80, 80], -7.9, 3, 3, 2],
  ['116550', 'fe1dd411e6a9a85f6877a50c830d81af69817e3e407344c69133cebbc4c64100', [-80, 80], 0, 5, 18, 1],
  ['92257', 'ddbd7d0e3fca6fffcdbb3814e5182e9563dfccb19e751801670b0977796dc584', [-370, 0, 370], -7.9, 3, 3, 2],
];
const catalogue = JSON.parse(fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/wardrobe-handle-catalogue.json', import.meta.url)));
for (const [article, part] of Object.entries(catalogue)) {
  if (part.model) sources.push([article, part.sha, part.holes.map(p => p[0]), 0, part.holeDiameter, part.holeDepth, part.drillMode]);
}
const anchor = new Vector3(812, 1500, 534);
function fixture([article, hash, xs, y, Diameter, Depth, DrillMode], layout) {
  const root = new Part(), pairs = [], holes = [];
  const shift = new Vector3(21, 4, -15);
  for (const x of xs) {
    const point = new Vector3(x, y, 0);
    const hole = {Diameter, Depth, DrillMode, Position: point.clone().add(shift), Direction: new Vector3(0, 0, -1)};
    holes.push(hole);
    if (layout === 'fastener') {
      pairs.push([root, hole]);
    } else {
      const screw = new Part();
      screw.position.copy(hole.Position);
      hole.Position.set(0, 0, 0);
      screw.Holes = {Items: [hole], Count: 1};
      root.add(screw);
      pairs.push([screw, hole]);
    }
  }
  if (layout === 'fastener') root.Holes = Object.assign(holes, {Count: holes.length});
  if (layout === 'document') root.add(Object.assign(new Part(), {frame: true, Width: 100, Height: 100, Depth: 100}));
  return {root, pairs, item: {article, source_sha256: hash, wardrobe_handle: true, position: anchor, rotation: 90, handle_roll_deg: 90}};
}

for (const data of sources) for (const layout of ['fastener', 'block', 'document']) {
  test('Native ' + data[0] + ' keeps its source holes in a ' + layout, () => {
    const {root, pairs, item} = fixture(data, layout), [, ,xs, y, ,depth, mode] = data;
    ctx.resizeAndPlace(root, item, []);
    assert.ok(root.children.every(c => !c.frame));
    for (const [i, [part, hole]] of pairs.entries()) {
      // For 90° in the facade then 90° to the next wall, hole depth runs along world X.
      const expected = new Vector3(anchor.x, anchor.y + (mode === 2 ? -xs[i] : xs[i]), anchor.z - y);
      const actual = part.ToGlobal(hole.Position);
      const tip = part.ToGlobal(hole.Position.clone().addScaledVector(hole.Direction, hole.Depth));
      assert.ok(actual.distanceTo(expected) < .001);
      expected.x += mode === 2 ? -depth : depth;
      assert.ok(tip.distanceTo(expected) < .001);
    }
  });
}

test('A fixed handle with missing or reversed native drilling is rejected', () => {
  const {root, item, pairs} = fixture(sources[0], 'fastener');
  pairs[1][1].Direction.z = 1;
  assert.throws(() => ctx.resizeAndPlace(root, item, []), /направление присадки/);
  root.Holes.Count = 1;
  assert.throws(() => ctx.resizeAndPlace(root, item, []), /ожидается присадок 2, прочитано 1/);
});

test('the plastic PS15/C15 cannot be installed from a fragment with metal-handle drilling', () => {
  const {root, item, pairs} = fixture(sources.find(([article]) => article === '52188'), 'block');
  pairs[0][1].Diameter = 5;
  assert.throws(() => ctx.resizeAndPlace(root, item, []), /Ø3/);
});
