"""Build exact variant attachments from verified collector output, preserving v9.6."""
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from collections import Counter
from pathlib import Path, PureWindowsPath

from PIL import Image, ImageStat
from matching import brand, candidates, choose, decor_code, image_brand

BASELINE = '49b2cd0e30ded19903416ba9f2723383f34ffcaf'
ROOT = Path(__file__).resolve().parents[2]
MATERIALS = ROOT / 'backend/v2/cabinet_assets/planner/materials'
OLD_IMPORTER = ROOT / 'tools/bazis_import/Martin_Forest_Import_v9_6_ONE_CLICK_NOTES_GLASS_TEXTURES.js'
BAD_SAMPLE_CODES = {'U998 ST38', 'W1000 ST19', 'W1100 ST9'}

def identity(row):
    return dict(zip(('article','material_id','name','thickness','length','width'), (row[1],row[4],row[2],row[8],row[9],row[10])))

def representative_color(image):
    # Reviewed plain-colour Senosan/Evogloss samples: keep reflections/borders in
    # the thumbnail only. Median from the lower-left interior is approximate.
    with Image.open(image['local_path']) as im:
        w,h=im.size
        region=im.convert('RGB').crop((int(w*.15),int(h*.45),int(w*.40),int(h*.80)))
        rgb=ImageStat.Stat(region).median
    return '#' + ''.join(f'{round(v):02x}' for v in rgb)

def integrate(images_file, catalogue_file, audit_dir):
    images=json.loads(images_file.read_text()); by={r['source_relative_path']:r for r in images}
    rows=json.loads(catalogue_file.read_text())[7:]
    registry=json.loads(subprocess.check_output(['git','show',BASELINE+':backend/v2/cabinet_assets/planner/materials/user-textures.json'],cwd=ROOT))
    official=json.loads((MATERIALS/'manifest.json').read_text())['decors']
    source=OLD_IMPORTER.read_text(encoding='utf-8-sig')
    old_native=json.loads(re.search(r'const NATIVE_TEXTURE_BINDINGS = (.*);\n',source)[1])
    native={}; selected={}; audit=[]; new_assets={}
    for row in rows:
        uid=row[5]; ident=identity(row); hits,method,conflicts=candidates(row,images)
        record=old_native.get(uid)
        if record:
            image=by[record['relative_path']]
            for k in ('article','material_id','name','thickness','length','width'):
                assert record[k]==ident[k], (uid,k)
            if record.get('sha256'):
                assert record['sha256']==image['source_sha256']
                native[uid]=record.copy()
            else:
                assert row[1] in ('816 PO','816 TM') and record['relative_path']=='Bayspan\\816 TM.jpg'
                assert record['expected_size_bytes']==image['expected_size_bytes']
                native[uid]={**record,'sha256':image['source_sha256']}
            method='preserved_v9_6' if record.get('sha256') else 'user_confirmed_816_alias_with_source_hash'
        else:
            image=choose(hits)
        status='matched' if image else 'ambiguous_images' if hits else 'manufacturer_conflict' if conflicts else 'no_exact_image'
        if image and decor_code(row[1],row[0]) in BAD_SAMPLE_CODES:
            image=None; status='caption_or_border_in_sample'
        sample=bool(image and image_brand(image['source_relative_path']) in ('SENOSAN','EVOGLOSS'))
        entry={'variant_id':uid,**ident,'status':status,'method':method,
               'source_path':image['source_relative_path'] if image else None,
               'candidates':[r['source_relative_path'] for r in hits], 'manufacturer_conflicts':conflicts}
        if image:
            selected[uid]=image
            if uid not in native and not sample:
                native[uid]={**ident,'relative_path':image['source_relative_path'], 'sha256':image['source_sha256'],
                             'expected_size_bytes':image['expected_size_bytes']}
            if uid not in registry['variants']:
                key=row[1] if row[0]=='EGGER' else str(row[0])+'|'+str(row[1])
                if key not in official:
                    ext={'JPEG':'.jpg','PNG':'.png','WEBP':'.webp'}[image['format']]
                    asset='user-'+image['sha256'][:24]+ext
                    if asset not in registry['assets']:
                        new_assets[asset]={'sha256':image['sha256'],'bytes':image['preview_bytes'],'local_path':image['local_path']}
                    v={**ident,'asset':asset,'rotation_deg':0,'grain_direction':'length','roughness':.85,
                       'source_sha256':image['source_sha256'],'image_sha256':image['sha256'],
                       'source_filename':PureWindowsPath(image['source_relative_path']).name,
                       'representation':image['representation']}
                    url='/account/planner/materials/'+asset
                    if sample:
                        v.update(preview_url=url,visual_status='USER_PREVIEW',map_to_surface=False,
                                 render_color=representative_color(image),color_confirmed=False,
                                 color_note='Приблизительный цвет по изображению образца; отражения и рамка не переносятся на фасад.',
                                 source_kind='user_sample',roughness=.3 if 'TOPX' in str(row[1]).upper() or 'ГЛЯН' in str(row[2]).upper() else .85)
                    else:
                        w,h=image['width'],image['height']
                        if image.get('exif_orientation') in (5,6,7,8): w,h=h,w
                        v.update(texture_url=url,visual_status='USER_TEXTURE',texture_size_mm=[round(1000*w/h,4),1000],
                                 scale_confirmed=False,scale_note='Масштаб рисунка ориентировочный: размер участка исходного изображения не задан.',
                                 source_kind='user_texture')
                    registry['variants'][uid]=v
        entry['site_status']=registry['variants'].get(uid,{}).get('visual_status')
        official_key=row[1] if row[0]=='EGGER' else str(row[0])+'|'+str(row[1])
        if not entry['site_status'] and official_key in official:
            o=official[official_key]
            entry['site_status']='EXACT_TEXTURE' if o.get('texture_url') else 'OFFICIAL_PREVIEW' if o.get('preview_url') else 'COLOR_ONLY' if o.get('render_color') else 'MISSING_VISUAL'
        entry['site_status']=entry['site_status'] or 'MISSING_VISUAL'
        entry['native_texture']=uid in native
        audit.append(entry)
    # Append only; previously published texture URLs and pack bytes remain valid.
    first=max(int(v['archive'][14:16]) for v in registry['assets'].values())+1
    batches=[]; current=[]; total=0
    for name,v in sorted(new_assets.items()):
        if current and total+v['bytes']>7*1024*1024:
            batches.append(current);current=[];total=0
        current.append(name);total+=v['bytes']
    if current:batches.append(current)
    for index,names in enumerate(batches,first):
        pack=f'user-textures-{index:02d}.zip'
        with zipfile.ZipFile(MATERIALS/pack,'w',zipfile.ZIP_STORED) as z:
            for name in names:
                v=new_assets[name];data=Path(v['local_path']).read_bytes()
                assert hashlib.sha256(data).hexdigest()==v['sha256'] and len(data)==v['bytes']
                z.writestr(zipfile.ZipInfo(name,date_time=(2026,10,11,0,0,0)),data)
                registry['assets'][name]={k:v[k] for k in ('sha256','bytes')};registry['assets'][name]['archive']=pack
        with zipfile.ZipFile(MATERIALS/pack) as z:assert z.testzip() is None
    registry['collection']={'source_files':1315,'new_received_files':924,'archive_parts':11,'file_errors':0}
    (MATERIALS/'user-textures.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')
    updated=source.replace('v9.6','v9.7').replace("'9.6 ONE CLICK", "'9.7 ONE CLICK")
    updated=re.sub(r'const NATIVE_TEXTURE_BINDINGS = .*;\n',lambda _: 'const NATIVE_TEXTURE_BINDINGS = '+json.dumps(native,ensure_ascii=False,separators=(',',':'))+';\n',updated,count=1)
    updated=updated.replace('// Exact catalogue identities and original uploaded SHA-256; no fuzzy fallback.',
        '// Exact catalogue identities and source SHA-256 (original uploads / read-only local collector). Never hash a web preview in place of the BAZIS original.')
    output=ROOT/'tools/bazis_import/Martin_Forest_Import_v9_7_ONE_CLICK_NOTES_GLASS_TEXTURES.js'
    output.write_text(updated,encoding='utf-8-sig')
    audit_dir.mkdir(parents=True,exist_ok=True)
    summary={'catalogue_snapshot':'2026-09-27','catalogue_variants':len(rows),
             'site_counts':dict(Counter(r['site_status'] for r in audit)),
             'native_bindings':len(native),'added_native_bindings':len(native)-len(old_native),
             'site_bindings':len(registry['variants']),'added_site_bindings':len(registry['variants'])-673,
             'image_assets':len(registry['assets']),'new_image_assets':len(new_assets),
             'new_image_bytes':sum(v['bytes'] for v in new_assets.values()),'new_packs':len(batches),
             'review_reasons':dict(Counter(r['status'] for r in audit if r['status']!='matched'))}
    (audit_dir/'bindings-review.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    (audit_dir/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser()
    for arg in ('images_file','catalogue_file','audit_dir'):p.add_argument(arg,type=Path)
    a=p.parse_args();integrate(a.images_file,a.catalogue_file,a.audit_dir)
