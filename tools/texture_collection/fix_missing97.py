"""Append exact matches missed by v9.7 without rewriting existing bindings."""
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from collections import Counter
from pathlib import Path, PureWindowsPath

from integrate_verified import identity, representative_color
from matching import candidates, choose, image_brand

ROOT = Path(__file__).resolve().parents[2]
BASE = '6c340ea8c1581032b4482d3c2e2f47766568fa04'
MATERIALS = ROOT / 'backend/v2/cabinet_assets/planner/materials'

def baseline(path):
    return subprocess.check_output(['git', 'show', BASE + ':' + path], cwd=ROOT)

def main():
    p = argparse.ArgumentParser()
    for name in ('images_file', 'catalogue_file', 'previous_audit', 'audit_dir'):
        p.add_argument(name, type=Path)
    args = p.parse_args()
    images = json.loads(args.images_file.read_text())
    rows = json.loads(args.catalogue_file.read_text())[7:]
    audit = json.loads((args.previous_audit / 'bindings-review.json').read_text())
    review = {r['variant_id']: r for r in audit}
    registry = json.loads(baseline('backend/v2/cabinet_assets/planner/materials/user-textures.json'))
    source = baseline('tools/bazis_import/Martin_Forest_Import_v9_7_ONE_CLICK_NOTES_GLASS_TEXTURES.js').decode('utf-8-sig')
    native = json.loads(re.search(r'const NATIVE_TEXTURE_BINDINGS = (.*);\n', source)[1])
    added = []
    assets = {}
    pack = 'user-textures-27.zip'
    for row in rows:
        uid = row[5]
        if review[uid]['site_status'] != 'MISSING_VISUAL':
            continue
        hits, method, conflicts = candidates(row, images)
        im = choose(hits)
        if not im:
            continue
        ident = identity(row)
        asset = 'user-' + im['sha256'][:24] + {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}[im['format']]
        v = {**ident, 'asset': asset, 'rotation_deg': 0, 'grain_direction': 'length', 'roughness': .85,
             'source_sha256': im['source_sha256'], 'image_sha256': im['sha256'],
             'source_filename': PureWindowsPath(im['source_relative_path']).name, 'representation': im['representation']}
        url = '/account/planner/materials/' + asset
        sample = image_brand(im['source_relative_path']) == 'EVOGLOSS'
        if sample:
            v.update(preview_url=url, visual_status='USER_PREVIEW', map_to_surface=False,
                     render_color=representative_color(im), color_confirmed=False,
                     color_note='Приблизительный цвет по изображению образца; отражения и рамка не переносятся на фасад.',
                     source_kind='user_sample')
        else:
            w, h = im['width'], im['height']
            if im.get('exif_orientation') in (5, 6, 7, 8):
                w, h = h, w
            v.update(texture_url=url, visual_status='USER_TEXTURE', texture_size_mm=[round(1000*w/h, 4), 1000],
                     scale_confirmed=False, scale_note='Масштаб рисунка ориентировочный: размер участка исходного изображения не задан.',
                     source_kind='user_texture')
            native[uid] = {**ident, 'relative_path': im['source_relative_path'], 'sha256': im['source_sha256'],
                           'expected_size_bytes': im['expected_size_bytes']}
        registry['variants'][uid] = v
        if asset not in registry['assets']:
            assets[asset] = im
            registry['assets'][asset] = {'sha256': im['sha256'], 'bytes': im['preview_bytes'], 'archive': pack}
        review[uid].update(status='matched', method='exact_decor_or_complete_title_and_article',
                           source_path=im['source_relative_path'], candidates=[x['source_relative_path'] for x in hits],
                           manufacturer_conflicts=conflicts, site_status=v['visual_status'], native_texture=uid in native)
        added.append(ident['article'])
    assert set(added) == {'537 WML', 'EVS001', 'EVS003', 'EVS007', 'P013'}, added
    with zipfile.ZipFile(MATERIALS / pack, 'w', zipfile.ZIP_STORED) as z:
        for asset, im in sorted(assets.items()):
            data = Path(im['local_path']).read_bytes()
            assert hashlib.sha256(data).hexdigest() == im['sha256'] and len(data) == im['preview_bytes']
            z.writestr(zipfile.ZipInfo(asset, date_time=(2026, 10, 12, 0, 0, 0)), data)
    (MATERIALS / 'user-textures.json').write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n')
    source = source.replace('v9.7', 'v9.7.1').replace("'9.7 ONE CLICK", "'9.7.1 ONE CLICK").replace('(2026-10-11)', '(2026-10-12)', 1)
    source = re.sub(r'const NATIVE_TEXTURE_BINDINGS = .*;\n', lambda _: 'const NATIVE_TEXTURE_BINDINGS = ' + json.dumps(native, ensure_ascii=False, separators=(',', ':')) + ';\n', source, count=1)
    (ROOT / 'tools/bazis_import/Martin_Forest_Import_v9_7_1_ONE_CLICK_NOTES_GLASS_TEXTURES.js').write_text(source, encoding='utf-8-sig')
    summary = json.loads((args.previous_audit / 'summary.json').read_text())
    summary.update(site_counts=dict(Counter(r['site_status'] for r in audit)), native_bindings=len(native),
                   added_native_bindings=len(native)-780, site_bindings=len(registry['variants']),
                   added_site_bindings=len(registry['variants'])-673, image_assets=len(registry['assets']),
                   review_reasons=dict(Counter(r['status'] for r in audit if r['status'] != 'matched')),
                   new_image_assets=summary['new_image_assets']+len(assets),
                   new_image_bytes=summary['new_image_bytes']+sum(v['preview_bytes'] for v in assets.values()),
                   new_packs=summary['new_packs']+1, patch_added_articles=added, patch_new_image_assets=len(assets), patch_new_image_bytes=sum(v['preview_bytes'] for v in assets.values()))
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    (args.audit_dir / 'bindings-review.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
    (args.audit_dir / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == '__main__':
    main()
