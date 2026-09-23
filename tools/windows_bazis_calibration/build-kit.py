#!/usr/bin/env python3
"""Deterministic offline ZIP builder, no application/infrastructure interaction."""
import argparse,hashlib
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('output',type=Path);a=p.parse_args()
if a.output.exists():raise SystemExit('Refusing overwrite')
listed=[]
for line in (root/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split('  ',1); f=root/name
 if '..' in Path(name).parts or f.is_symlink() or not f.resolve().is_relative_to(root):raise SystemExit('Unsafe source')
 if hashlib.sha256(f.read_bytes()).hexdigest()!=sha:raise SystemExit('Source hash mismatch: '+name)
 listed.append(name)
with zipfile.ZipFile(a.output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for name in sorted(listed+['SHA256SUMS']):
  entry=zipfile.ZipInfo('kit/'+name,(2026,9,23,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o100644<<16
  archive.writestr(entry,(root/name).read_bytes())
print(hashlib.sha256(a.output.read_bytes()).hexdigest()+'  '+a.output.name)
