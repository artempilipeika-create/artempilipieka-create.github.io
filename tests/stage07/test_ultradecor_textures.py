import importlib.util
import json
import re
from pathlib import Path

from backend.v2.material_visuals import user_textures, user_texture_bytes, visual_metadata

ROOT=Path(__file__).parents[2]
spec=importlib.util.spec_from_file_location('ultra_matching',ROOT/'tools/texture_collection/matching.py')
matching=importlib.util.module_from_spec(spec);spec.loader.exec_module(matching)

def row(brand='ULTRADECOR',article='K009 PW (18)'):
    return [brand,article,'ЛДСП '+brand+' '+article,None,'m','v',None,None,18,2800,2070]

def image(path):
    return {'source_relative_path':path,'article_candidate':path.split('\\')[-1].rsplit('.',1)[0]}

def test_approval_is_directional_and_needs_complete_identical_finish():
    source=image('Kronospan\\K009 PW.jpg')
    assert matching.confirmed_ultradecor_candidates(row(),[source])==[source]
    assert not matching.candidates(row(),[source])[0]
    assert not matching.confirmed_ultradecor_candidates(row(article='K009 PE'),[source])
    assert not matching.confirmed_ultradecor_candidates(row(article='K009'),[source])
    assert not matching.confirmed_ultradecor_candidates(row('BYSPAN'),[source])
    assert not matching.confirmed_ultradecor_candidates(row('KRONOSPAN'),[image('Ultradecor\\K009 PW.jpg')])
    assert not matching.confirmed_ultradecor_candidates(row(),[image('EGGER\\K009 PW.jpg')])
    source=image('Kronospan\\С509 CB.jpg')
    assert matching.confirmed_ultradecor_candidates(row(article='C509 CB'),[source])==[source]

def test_native_release_keeps_old_bindings_and_catalogue_identity():
    def bindings(version):
        source=(ROOT/f'tools/bazis_import/Martin_Forest_Import_v{version}_ONE_CLICK_NOTES_GLASS_TEXTURES.js').read_text(encoding='utf-8-sig')
        return json.loads(re.search(r'const NATIVE_TEXTURE_BINDINGS = (.*);\n',source)[1])
    old,new=bindings('9_7_1'),bindings('9_8')
    assert all(new[k]==v for k,v in old.items())
    added=set(new)-set(old)
    assert len(added)==188
    variants=user_textures()['variants']
    for uid in added:
        site,native=variants[uid],new[uid]
        for key in ('article','name','material_id','thickness','length','width'):
            assert site[key]==native[key]
        assert 'Ultradecor' in native['name']
        assert site['source_sha256']==native['sha256']
        assert site['manufacturer_mapping']=='user_confirmed_ultradecor_from_kronospan_2026-10-12'
        assert visual_metadata({'variant_id':uid,**site})['visual_status']=='USER_TEXTURE'
    assert not any(r['article'] in ('K097','Бук Бавария 0381','0515 PE (18)') for uid,r in variants.items() if uid in added)

def test_web_images_decode_and_keep_hash_separate_from_native_original():
    import hashlib
    import io
    from PIL import Image
    variants=user_textures()['variants']
    selected=[r for r in variants.values() if r.get('manufacturer_mapping')]
    assets={r['asset']:r for r in selected}
    assert assets
    for asset,r in assets.items():
        data=user_texture_bytes(asset)
        assert hashlib.sha256(data).hexdigest()==r['image_sha256']
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            assert max(im.size)<=2048 and min(im.size)>0
