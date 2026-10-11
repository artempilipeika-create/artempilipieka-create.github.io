"""Apply the user's approved Ultradecor -> Kronospan texture source mapping."""
import argparse
import hashlib
import io
import json
import re
import subprocess
import zipfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PureWindowsPath

from PIL import Image, ImageChops, ImageOps, ImageStat
from integrate_verified import identity
from matching import choose, confirmed_ultradecor_candidates, decor_code

ROOT = Path(__file__).resolve().parents[2]
BASE = 'e834c50df5c82d1303e9043a00a1ce2a682ca305'
MATERIALS = ROOT / 'backend/v2/cabinet_assets/planner/materials'
APPROVAL = 'user_confirmed_ultradecor_from_kronospan_2026-10-12'

def baseline(path):
    return subprocess.check_output(['git', 'show', BASE + ':' + path], cwd=ROOT)

def web_copy(im, output):
    """Encode deployment assets; keep source files, dimensions and ICC profile.

    Uniform samples use lossless encoding. Other previews use WebP 92 only
    when smaller and mean per-channel pixel error is at most 3/255; otherwise
    retain the verified uploaded preview. Native BAZIS always uses the original.
    """
    raw = Path(im['local_path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == im['sha256']
    with Image.open(io.BytesIO(raw)) as opened:
        icc = opened.info.get('icc_profile', b'')
        pixels = ImageOps.exif_transpose(opened).convert('RGBA' if 'A' in opened.getbands() else 'RGB')
        encoded = io.BytesIO()
        lossless = pixels.getcolors(257) is not None
        pixels.save(encoded, format='WEBP', quality=92, method=6, lossless=lossless,
                    exact=True, icc_profile=icc)
        data = encoded.getvalue()
        with Image.open(io.BytesIO(data)) as check:
            assert check.size == pixels.size and check.info.get('icc_profile', b'') == icc
            error = max(ImageStat.Stat(ImageChops.difference(check.convert(pixels.mode), pixels)).mean)
        use_webp = len(data) < len(raw) and error <= 3
        if use_webp:
            suffix = '.webp'
            representation = 'webp_lossless' if lossless else 'webp_q92'
        else:
            data = raw
            suffix = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}[im['format']]
            representation = im['representation']
            error = 0
        sha = hashlib.sha256(data).hexdigest()
        path = output / (sha + suffix)
        path.write_bytes(data)
        return {'sha256': sha, 'bytes': len(data), 'source_preview_bytes': len(raw),
                'asset': 'user-' + sha[:24] + suffix, 'path': str(path),
                'width': pixels.width, 'height': pixels.height, 'representation': representation,
                'max_mean_channel_error': error, 'source_preview_sha256': im['sha256']}

def main():
    p = argparse.ArgumentParser()
    for name in ('images_file', 'catalogue_file', 'previous_audit', 'audit_dir'):
        p.add_argument(name, type=Path)
    args = p.parse_args()
    images = json.loads(args.images_file.read_text())
    rows = json.loads(args.catalogue_file.read_text())[7:]
    audit = json.loads((args.previous_audit / 'bindings-review.json').read_text())
    by_id = {r['variant_id']: r for r in audit}
    registry = json.loads(baseline('backend/v2/cabinet_assets/planner/materials/user-textures.json'))
    source = baseline('tools/bazis_import/Martin_Forest_Import_v9_7_1_ONE_CLICK_NOTES_GLASS_TEXTURES.js').decode('utf-8-sig')
    native = json.loads(re.search(r'const NATIVE_TEXTURE_BINDINGS = (.*);\n', source)[1])
    approved = [r for r in rows if by_id[r[5]]['site_status'] == 'MISSING_VISUAL'
                and by_id[r[5]]['status'] == 'manufacturer_conflict']
    assert len(approved) == 216 and all(r[0] == 'ULTRADECOR' for r in approved)
    selected = []
    for row in approved:
        record = by_id[row[5]]
        hits = confirmed_ultradecor_candidates(row, images)
        assert all(im['source_relative_path'] in record['manufacturer_conflicts'] for im in hits)
        image = choose(hits)
        record['method'] = APPROVAL
        if not decor_code(row[1], 'ULTRADECOR'):
            record.update(status='incomplete_finish', candidates=record['manufacturer_conflicts'], manufacturer_conflicts=[])
            continue
        assert hits, row[1]
        if not image:
            record.update(status='ambiguous_images', candidates=[im['source_relative_path'] for im in hits], manufacturer_conflicts=[])
            continue
        selected.append((row, image))
    assert len(selected) == 188
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    copies_dir = args.audit_dir / 'web-copies'
    copies_dir.mkdir(exist_ok=True)
    unique = {im['sha256']: im for _, im in selected}
    with ThreadPoolExecutor(max_workers=4) as pool:
        optimized = list(pool.map(lambda im: web_copy(im, copies_dir), unique.values()))
    copies = {im['source_preview_sha256']: im for im in optimized}
    assets = {}
    for row, im in selected:
        uid = row[5]
        ident = identity(row)
        image = copies[im['sha256']]
        asset = image['asset']
        native[uid] = {**ident, 'relative_path': im['source_relative_path'],
                       'sha256': im['source_sha256'], 'expected_size_bytes': im['expected_size_bytes']}
        registry['variants'][uid] = {**ident, 'asset': asset, 'rotation_deg': 0, 'grain_direction': 'length',
            'roughness': .85, 'source_sha256': im['source_sha256'], 'image_sha256': image['sha256'],
            'source_preview_sha256': im['sha256'], 'source_filename': PureWindowsPath(im['source_relative_path']).name,
            'representation': image['representation'], 'manufacturer_mapping': APPROVAL,
            'texture_url': '/account/planner/materials/' + asset, 'visual_status': 'USER_TEXTURE',
            'texture_size_mm': [round(1000*image['width']/image['height'], 4), 1000],
            'scale_confirmed': False, 'scale_note': 'Масштаб рисунка ориентировочный: размер участка исходного изображения не задан.',
            'source_kind': 'user_texture'}
        if asset not in registry['assets']:
            assets[asset] = image
        by_id[uid].update(status='matched', source_path=im['source_relative_path'], manufacturer_conflicts=[],
                         candidates=[im['source_relative_path']], site_status='USER_TEXTURE', native_texture=True)
    first = max(int(r['archive'][14:16]) for r in registry['assets'].values()) + 1
    batches = []; current = []; size = 0
    for name, image in sorted(assets.items()):
        if current and size + image['bytes'] > 7*1024*1024:
            batches.append(current); current = []; size = 0
        current.append(name); size += image['bytes']
    if current:
        batches.append(current)
    for number, names in enumerate(batches, first):
        pack = f'user-textures-{number:02}.zip'
        with zipfile.ZipFile(MATERIALS / pack, 'w', zipfile.ZIP_STORED) as z:
            for name in names:
                im = assets[name]; data = Path(im['path']).read_bytes()
                assert hashlib.sha256(data).hexdigest() == im['sha256']
                z.writestr(zipfile.ZipInfo(name, date_time=(2026,10,12,0,0,0)), data)
                registry['assets'][name] = {'sha256': im['sha256'], 'bytes': len(data), 'archive': pack}
    (MATERIALS / 'user-textures.json').write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n')
    source = source.replace('v9.7.1', 'v9.8').replace("'9.7.1 ONE CLICK", "'9.8 ONE CLICK")
    source = re.sub(r'const NATIVE_TEXTURE_BINDINGS = .*;\n', lambda _: 'const NATIVE_TEXTURE_BINDINGS = ' + json.dumps(native, ensure_ascii=False, separators=(',', ':')) + ';\n', source, count=1)
    (ROOT / 'tools/bazis_import/Martin_Forest_Import_v9_8_ONE_CLICK_NOTES_GLASS_TEXTURES.js').write_text(source, encoding='utf-8-sig')
    summary = json.loads((args.previous_audit / 'summary.json').read_text())
    summary.update(site_counts=dict(Counter(r['site_status'] for r in audit)), native_bindings=len(native),
                   added_native_bindings=len(native)-780, site_bindings=len(registry['variants']),
                   added_site_bindings=len(registry['variants'])-673, image_assets=len(registry['assets']),
                   review_reasons=dict(Counter(r['status'] for r in audit if r['status'] != 'matched')),
                   new_image_assets=summary['new_image_assets']+len(assets),
                   new_image_bytes=summary['new_image_bytes']+sum(im['bytes'] for im in assets.values()),
                   new_packs=summary['new_packs']+len(batches),
                   confirmed_manufacturer_mapping={'catalogue':'ULTRADECOR','image_folder':'KRONOSPAN','confirmed_on':'2026-10-12',
                       'reviewed_variants':216,'added_variants':188,'ambiguous_variants':26,'incomplete_finish_variants':2},
                   patch_added_articles=[row[1] for row, _ in selected], patch_new_image_assets=len(assets),
                   patch_new_image_bytes=sum(im['bytes'] for im in assets.values()),
                   patch_source_preview_bytes=sum(im['source_preview_bytes'] for im in optimized))
    (args.audit_dir / 'bindings-review.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    (args.audit_dir / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    (args.audit_dir / 'web-encoding.json').write_text(json.dumps(optimized, ensure_ascii=False, indent=2))
    print(json.dumps({k:v for k,v in summary.items() if k!='patch_added_articles'}, ensure_ascii=False))

if __name__ == '__main__':
    main()
