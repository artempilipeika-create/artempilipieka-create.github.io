import hashlib
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.material_visuals import user_textures,user_texture_bytes,visual_metadata,coverage
from backend.v2.catalogue_model import safe_item
from backend.v2.cabinet_ui import router

def item_for(article):
    uid,r=next((uid,r) for uid,r in user_textures()['variants'].items() if r['article']==article)
    return {'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}}

def test_stock_article_keeps_identity_and_gets_selected_user_reference():
    item=item_for('LNEDS18D.302.W04')
    out=safe_item({**item,'price':100},'release')
    assert out['article']=='LNEDS18D.302.W04'
    assert out['variant_id']==item['variant_id'] and out['material_id']==item['material_id']
    assert out['visual_status']=='USER_TEXTURE' and out['visual']['scale_confirmed'] is False
    assert out['visual']['texture_url'].endswith('user-5b0b13fecb9953a02a83adc3.png')
    assert 'price' not in out and 'source_filename' not in out['visual']
    assert coverage([item])['counts']['USER_TEXTURE']==1

@pytest.mark.parametrize('field,value',[('article','LNEDS18D.302.BW'),('variant_id','unknown'),('material_id','wrong'),('name','Other material'),('thickness',99),('width',1)])
def test_changed_identity_does_not_inherit_texture(field,value):
    item=item_for('LNEDS18D.302.W04');item[field]=value
    assert visual_metadata(item) is None

def test_all_original_image_bytes_match_uploads_and_only_images_are_served():
    app=FastAPI();app.include_router(router());client=TestClient(app)
    records=user_textures()['assets']
    for asset,record in records.items():
        content=user_texture_bytes(asset)
        assert len(content)==record['bytes']
        assert hashlib.sha256(content).hexdigest()==record['sha256']
    asset=next(iter(records))
    response=client.get('/account/planner/materials/'+asset)
    assert response.status_code==200 and response.headers['content-type'].startswith('image/')
    assert response.content==user_texture_bytes(asset)
    for private in ('user-textures.json','user-textures-01.zip','user-nonexistent.jpg'):
        assert client.get('/account/planner/materials/'+private).status_code==404

def test_ambiguous_sources_are_not_assigned():
    assert not any(r['article']=='LNEDS18D.515.W04' for r in user_textures()['variants'].values())

def test_empty_visual_or_scale_only_fields_do_not_hide_verified_texture():
    item=item_for('LNEDS18D.302.W04')
    for extra in ({'visual':{}},{'visual':{'texture_size_mm':[1000,1000]}},{'texture_size_mm':[1000,1000]}):
        assert visual_metadata({**item,**extra})['visual_status']=='USER_TEXTURE'
    visual=visual_metadata(item)
    assert visual_metadata({'visual':visual})['scale_confirmed'] is False
