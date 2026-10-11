import hashlib
import importlib.util
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
