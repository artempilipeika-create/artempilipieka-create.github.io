"""Package the reviewed Windows collector with exact already-received hashes."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('records', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
rows = json.loads(args.records.read_text())
received = []
for r in rows:
    name, sha = r['source_relative_path'], r['sha256']
    assert len(sha) == 64 and all(c in '0123456789abcdef' for c in sha)
    assert not name.startswith(('\\', '/')) and '..' not in name.replace('\\', '/').split('/')
    received.append({'relative_path': name.replace('/', '\\'), 'sha256': sha})
assert len({r['relative_path'].casefold() for r in received}) == len(received)
script = (root / 'tools/texture_collection/Collect-Remaining-Textures.ps1').read_text()
compact = '; '.join(line.strip() for line in script.splitlines() if line.strip()).replace('{;', '{').replace('; }', ' }')
assert '"' not in compact and '%' not in compact
command = 'powershell.exe -NoLogo -NoProfile -STA -Command "' + compact + '"'
assert len(command.encode('utf-8')) < 7800, 'CMD line exceeds safe command length'
cmd = '\r\n'.join([
    '@echo off', 'setlocal', 'chcp 65001 >nul',
    'set "MF_TEXTURE_SOURCE=D:\\BAZIS MEBEL 25\\#_Текстуры материалов"',
    'set "MF_TEXTURE_PLAN=%~dp0received-plan.json"', command,
    'set "MF_PACK_EXIT=%ERRORLEVEL%"', 'pause', 'exit /b %MF_PACK_EXIT%', ''
])
plan = {'schema': 'mf-received-textures-v1', 'received': received}
importer = root / 'tools/bazis_import/Martin_Forest_Import_v9_6_ONE_CLICK_NOTES_GLASS_TEXTURES.js'
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('MF_Collect_All_Textures.cmd', cmd.encode('utf-8'))
    archive.writestr('received-plan.json', json.dumps(plan, ensure_ascii=False, indent=2).encode('utf-8'))
    archive.write(importer, importer.name)
    archive.write(root / 'tools/texture_collection/README_RU.txt', 'README_RU.txt')
with zipfile.ZipFile(args.output) as archive:
    assert archive.testzip() is None
    assert archive.read(importer.name) == importer.read_bytes()
    assert json.loads(archive.read('received-plan.json')) == plan
print(json.dumps({'file': str(args.output.resolve()), 'bytes': args.output.stat().st_size,
                  'received': len(received), 'command_bytes': len(command.encode('utf-8')),
                  'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))
