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
code += (ROOT / 'tools/bazis_import/profile-repair.js').read_text()
path = ASSETS / 'bazis-drawers-import.js'
begin, end = '// BEGIN GENERATED NATIVE PROFILE REPAIR', '// END GENERATED NATIVE PROFILE REPAIR'
original = path.read_text()
updated = original[:original.index(begin)] + begin + '\n' + code + end + original[original.index(end)+len(end):]
path.write_text(updated)
(ROOT / 'tools/bazis_import/Martin_Forest_Import_v9_9_7_NATIVE_PROFILES.js').write_text(updated)
print(f'Embedded {len(counts)} Gola sources; importer mirror updated')
