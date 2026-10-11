import hashlib
import importlib.util
import json
import re
from pathlib import Path

from backend.v2.catalogue_model import safe_item
from backend.v2.material_visuals import user_textures, user_texture_bytes, visual_metadata, coverage

spec=importlib.util.spec_from_file_location('texture_matching',Path(__file__).parents[2]/'tools/texture_collection/matching.py')
matching=importlib.util.module_from_spec(spec);spec.loader.exec_module(matching)

def item(article):
    uid,r=next((uid,r) for uid,r in user_textures()['variants'].items() if r['article']==article)
    return {'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}}

def test_816_po_uses_confirmed_preview_and_preserves_original_identity():
    value=item('816 PO');v=safe_item(value,'fixture')
    assert v['variant_id']==value['variant_id'] and v['article']=='816 PO'
    assert v['visual']['texture_url'].endswith('user-670c70ebbee9fa984b9559a2.jpg')
    record=user_textures()['variants'][value['variant_id']]
    assert record['source_sha256']=='524586b58970dd720f423b8273ac7fd4d985facd18c5bbed5eece9aa72f09b89'
    assert record['image_sha256']=='670c70ebbee9fa984b9559a246e91e1dd530b5a2d94181b50732acd4c7d27362'
    assert hashlib.sha256(user_texture_bytes(record['asset'])).hexdigest()==record['image_sha256']

def test_photo_sample_stays_a_thumbnail_and_approximate_color():
    value=item('1982 TopX');v=visual_metadata(value)
    assert v['visual_status']=='USER_PREVIEW' and v['map_to_surface'] is False
    assert 'texture_url' not in v and v['preview_url'] and v['render_color']
    assert v['color_confirmed'] is False
    assert safe_item(value,'fixture')['visual_status']=='USER_PREVIEW'
    assert visual_metadata({'visual':v})==v
    assert coverage([value])['counts']['USER_PREVIEW']==1

def test_identifier_normalization_keeps_finishes_separate():
    assert matching.decor_code('621 PO (16мм)','BYSPAN')=='621 PO'
    assert matching.decor_code('621PE (10)','BYSPAN')=='621 PE'
    assert matching.decor_code('641 РО','BYSPAN')=='641 PO'
    assert matching.decor_code('U999 ST38 (10мм)','EGGER')=='U999 ST38'
    assert matching.decor_code('U999 TM/ST9','EGGER') is None
    assert matching.extra_codes('М.435.S03 Серый бетонный')=={'M.435.S03'}
    assert matching.extra_codes('M.435.S3')==set()

def test_cross_brand_and_wrong_stock_thickness_do_not_bind():
    row=['ULTRADECOR','K009 PW (18)','ЛДСП Ultradecor K009 PW',None,'m','v',None,None,18,2800,2070]
    im={'source_relative_path':'Kronospan\\K009 PW.jpg','article_candidate':'K009 PW'}
    hits,_,conflicts=matching.candidates(row,[im]);assert not hits and conflicts
    row=['EXTRAVERT','LNEDS10M.100.S01','EXTRAVERT M.100.S01',None,'m','v',None,None,18,2800,2070]
    assert matching.candidates(row,[])[1]=='stock_thickness_conflict'

def test_different_images_are_never_selected_by_similarity():
    a={'source_relative_path':'one.jpg','width':100,'height':100,'rgb_sha256':'same','rgba_sha256':'one'}
    b={**a,'source_relative_path':'two.jpg','rgba_sha256':'two'}
    assert matching.choose([a,b]) is None

def test_cedar_decor_does_not_override_byspan_folder():
    assert matching.image_brand('Bayspan\\Кедр Орегон 537 WML.jpg') == 'BYSPAN'
    assert matching.image_brand('Столешницы Кедр\\690S.jpg') == 'KEDR'
    assert matching.image_brand('Evaglos\\Столешница Slotex Мрамор бланко R5.jpg') == 'SLOTEX'
    row=['BYSPAN','537 WML','ЛДСП BYSPAN 18мм Кедр Орегон 537 WML',None,'m','v',None,None,18,2800,2070]
    im={'source_relative_path':'Bayspan\\Кедр Орегон 537 WML.jpg','article_candidate':'Кедр Орегон 537 WML'}
    hits,_,conflicts=matching.candidates(row,[im])
    assert hits == [im] and not conflicts

def test_complete_title_article_match_keeps_nearby_codes_and_brands_separate():
    row=[None,'P013','Р013 Светло-серый матовый',None,'m','v',None,None,18,2800,1220]
    im={'source_relative_path':'Evaglos\\Р013 Светло-серый матовый.jpg','article_candidate':'Р013 Светло-серый матовый'}
    assert matching.candidates(row,[im])[0] == [im]
    wrong=row.copy();wrong[1]='P01'
    assert not matching.candidates(wrong,[im])[0]
    wrong=row.copy();wrong[0]='BYSPAN'
    assert not matching.candidates(wrong,[im])[0]
    wrong=row.copy();wrong[2]='Р013 Светло-серый глянцевый'
    assert not matching.candidates(wrong,[im])[0]
    wrong=row.copy();wrong[1]=None
    assert not matching.candidates(wrong,[im])[0]

def test_patch_adds_only_cedar_to_native_and_keeps_samples_as_previews():
    root=Path(__file__).parents[2]/'tools/bazis_import'
    def bindings(version):
        source=(root/f'Martin_Forest_Import_v{version}_ONE_CLICK_NOTES_GLASS_TEXTURES.js').read_text(encoding='utf-8-sig')
        return json.loads(re.search(r'const NATIVE_TEXTURE_BINDINGS = (.*);\n',source)[1])
    old,new=bindings('9_7'),bindings('9_7_1')
    assert all(new[k]==v for k,v in old.items())
    added=[new[k] for k in new.keys()-old.keys()]
    assert len(added)==1 and added[0]['article']=='537 WML'
    for article in ('EVS001','EVS003','EVS007','P013'):
        v=visual_metadata(item(article))
        assert v['visual_status']=='USER_PREVIEW' and v['map_to_surface'] is False
        assert v['color_confirmed'] is False and v['render_color'] and v['preview_url']
        assert 'texture_url' not in v
