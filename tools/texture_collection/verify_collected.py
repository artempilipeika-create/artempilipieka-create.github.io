"""Verify read-only collector packs and extract only validated image entries."""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

from PIL import Image

def sha(data):
    return hashlib.sha256(data).hexdigest()

def verify(upload, old_records, inventory, output):
    previous = {r['source_relative_path']: r for r in json.loads(old_records.read_text())}
    summary = json.loads((upload / 'summary.json').read_text(encoding='utf-8-sig'))
    assert summary['schema'] == 'mf-texture-preview-summary-v2'
    assert summary['file_errors'] == 0 and not summary['scan_errors']
    with zipfile.ZipFile(inventory) as z:
        expected = {r['relative_path']: r for r in csv.DictReader(io.StringIO(z.read('textures.csv').decode('utf-8-sig')), delimiter=';')}
    packs = sorted(upload.glob('MF_All_Textures_*.zip'))
    assert len(packs) == summary['parts']
    output.mkdir(parents=True, exist_ok=True)
    rows = []; seen = set(); cache = {}; statuses = Counter()
    for number, p in enumerate(packs, 1):
        with zipfile.ZipFile(p) as z:
            assert len(z.namelist()) == len(set(z.namelist()))
            m = json.loads(z.read('manifest.json').decode('utf-8-sig'))
            assert m['schema'] == 'mf-texture-preview-images-v2' and m['part'] == number
            used = {'manifest.json'}
            for r in m['files']:
                name = r['source_relative_path']; status = r['status']
                assert name not in seen and name in expected
                assert not PurePosixPath(name.replace('\\', '/')).is_absolute() and '..' not in name.replace('\\', '/').split('/')
                assert r['expected_size_bytes'] == int(expected[name]['size_bytes'])
                assert re.fullmatch('[0-9a-f]{64}', r['source_sha256'])
                assert not r['error']; seen.add(name); statuses[status] += 1
                if status == 'already_received':
                    old = previous[name]
                    data = Path(old['local_path']).read_bytes()
                    assert len(data) == r['expected_size_bytes'] and sha(data) == r['source_sha256'] == old['sha256']
                    row = {**old, 'status': 'already_received', 'source_sha256': old['sha256'], 'preview_bytes': len(data), 'representation': 'original'}
                    with Image.open(io.BytesIO(data)) as im:
                        row['rgba_sha256'] = sha(im.convert('RGBA').tobytes())
                        row['exif_orientation'] = im.getexif().get(274, 1)
                else:
                    assert status == 'packed'
                    path = r['archive_path']
                    assert re.fullmatch(r'textures/[0-9a-f]{64}\.(jpg|jpeg|png|webp)', path)
                    assert r['representation'] in ('original', 'web_preview_2048')
                    data = z.read(path); used.add(path)
                    assert len(data) == r['preview_bytes'] and sha(data) == r['sha256']
                    if r['representation'] == 'original':
                        assert len(data) == r['expected_size_bytes'] and r['sha256'] == r['source_sha256']
                    if r['sha256'] not in cache:
                        with Image.open(io.BytesIO(data)) as im:
                            im.load(); width, height = im.size
                            assert im.format in ('JPEG', 'PNG', 'WEBP')
                            rgba = im.convert('RGBA')
                            meta = {'width': width, 'height': height, 'format': im.format, 'mode': im.mode,
                                    'rgb_sha256': sha(im.convert('RGB').tobytes()), 'rgba_sha256': sha(rgba.tobytes()),
                                    'has_icc': bool(im.info.get('icc_profile')), 'exif_orientation': im.getexif().get(274, 1)}
                        file = output / (r['sha256'] + Path(path).suffix)
                        file.write_bytes(data); meta['local_path'] = str(file.resolve()); cache[r['sha256']] = meta
                    meta = cache[r['sha256']]
                    if r['representation'] == 'web_preview_2048':
                        assert max(meta['width'], meta['height']) <= 2048
                        assert [meta['width'], meta['height']] == [r['preview_width'], r['preview_height']]
                    row = {**r, **meta}
                row['article_candidate'] = expected[name]['article_candidate']
                rows.append(row)
            assert used == set(z.namelist()), f'Unexpected archive entries in {p.name}'
        print(f'{p.name}: verified', flush=True)
    assert seen == set(expected) and len(rows) == summary['scanned_files']
    assert statuses == Counter(packed=summary['packed'], already_received=summary['already_received'])
    (output / 'image_records.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    report = {'files': len(rows), 'new_files': statuses['packed'], 'old_files': statuses['already_received'],
              'unique_new_previews': len(cache), 'new_preview_bytes': sum(x['preview_bytes'] for x in rows if x['status'] == 'packed'),
              'original_source_bytes': sum(x['expected_size_bytes'] for x in rows), 'formats': dict(Counter(x['format'] for x in rows)),
              'exif_orientations': dict(Counter(x.get('exif_orientation', 1) for x in rows))}
    (output / 'verification.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, ensure_ascii=False), flush=True)
    return rows

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    for arg in ('upload', 'old_records', 'inventory', 'output'):
        p.add_argument(arg, type=Path)
    a = p.parse_args()
    verify(a.upload, a.old_records, a.inventory, a.output)
