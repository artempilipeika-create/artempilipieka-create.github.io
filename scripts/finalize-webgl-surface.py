"""Exclude visual linework from raycast picking; retain actual mesh surfaces only."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
base=ROOT/'backend/v2/cabinet_assets/planner'
def main():
    p=base/'module-mesh.mjs';s=p.read_text()
    old='outline.scale.copy(panel.scale);outline.position.copy(panel.position);group.add(outline);'
    new='outline.scale.copy(panel.scale);outline.position.copy(panel.position);outline.raycast=()=>{};group.add(outline);'
    if old in s:
        assert s.count(old)==1;s=s.replace(old,new);p.write_text(s)
    else:assert new in s
    p=base/'scene.mjs';s=p.read_text()
    old="const hit=ray.intersectObjects([...this.entries.values()].filter(e=>e.group.visible).map(e=>e.group),true)[0];"
    new="const hit=ray.intersectObjects([...this.entries.values()].filter(e=>e.group.visible).map(e=>e.group),true).find(h=>h.object.isMesh&&h.object.userData.itemId);"
    if old in s:
        assert s.count(old)==1;s=s.replace(old,new);p.write_text(s)
    else:assert new in s
    p=ROOT/'tests/webgl/core.test.mjs';s=p.read_text()
    if "Decorative outlines do not intercept real-surface selection" not in s:
        s+='''

test('Decorative outlines do not intercept real-surface selection',()=>{
 const mesh=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/module-mesh.mjs',import.meta.url),'utf8');
 const scene=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/scene.mjs',import.meta.url),'utf8');
 assert.ok(mesh.includes('outline.raycast=()=>{}'));
 assert.ok(scene.includes('.find(h=>h.object.isMesh&&h.object.userData.itemId)'));
});
''';p.write_text(s)
    print('Decorative linework excluded from selection. Geometry and project data unchanged.')
if __name__=='__main__':main()
