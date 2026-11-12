"""Embed source-checked native profile repairs into the downloadable importer."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'backend/v2/cabinet_assets/planner'
counts = {}
for source in ASSETS.glob('*variants.json'):
    values = json.loads(source.read_text())
    if not isinstance(values, list):
        continue
    for value in values:
        count = sum(p.get('name', '').upper() in ('GOLA L', 'GOLA C') for p in value.get('profiles', []))
        if count:
            counts[value['source_sha256']] = count

mounts = ['85f493fc1d177af91734d7a40d7daa105b2c00e08dc4ee7c34d694ed97c456da',
          'c98de01845cf9c395f198b32f2214c26c759f764f663c8d8d9c7b84e865da525']
code = 'const NATIVE_GOLA_PROFILE_COUNTS = ' + json.dumps(counts, sort_keys=True, separators=(',', ':')) + ';\n'
code += 'const NATIVE_CHECKED_MOUNT_SOURCES = new Set(' + json.dumps(mounts) + ');\n'
# Measured from all 22 original FR3D files, including the user's failing pair.
# Keep this evidence separate from facade Z1 profiles in the visual catalogue.
anchors = {}
for source in json.loads((ROOT / 'tests/webgl/fixtures/upper-mount-anchors.json').read_text()):
    ends = []
    for profile in source['profiles']:
        matrix, length = profile['matrix'], profile['thickness']
        assert abs(abs(length) - 50) < .001
        assert abs(abs(matrix[0][2]) - 1) < .001
        ends.extend([matrix[0][3], matrix[0][3] + matrix[0][2] * length])
    assert len(source['profiles']) == 2
    minimum = source['frame']['origin'][0]
    anchors[source['sha256']] = dict(left=round(min(ends)-minimum, 4),
        right=round(minimum+source['frame']['size'][0]-max(ends), 4))
assert set(anchors) == {v['source_sha256'] for v in json.loads((ASSETS / 'wall-special-variants.json').read_text())}
code += 'const NATIVE_MOUNT_ANCHORS = ' + json.dumps(anchors, sort_keys=True, separators=(',', ':')) + ';\n'
code += (ROOT / 'tools/bazis_import/profile-repair.js').read_text()
path = ASSETS / 'bazis-drawers-import.js'
begin, end = '// BEGIN GENERATED NATIVE PROFILE REPAIR', '// END GENERATED NATIVE PROFILE REPAIR'
original = path.read_text()
updated = original[:original.index(begin)] + begin + '\n' + code + end + original[original.index(end)+len(end):]
path.write_text(updated)
(ROOT / 'tools/bazis_import/Martin_Forest_Import_v9_9_8_BLANKS.js').write_text(updated)
print(f'Embedded {len(counts)} Gola sources; importer mirror updated')
