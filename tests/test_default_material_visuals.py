import hashlib
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.cabinet_ui import router
from backend.v2.catalogue_model import safe_item
from backend.v2.material_visuals import ROOT,manifest,visual_metadata

@pytest.mark.parametrize('article,color',[('605 PO','#ffffff'),('890 PO','#e1d7cb')])
def test_default_decors_use_verified_official_samples_without_tiling_borders(article,color):
    item={'kind':'material','variant_id':'unchanged','material_id':'original','article':article,'name':'ЛДСП BYSPAN 18мм '+article,'thickness':18}
    result=safe_item(item,'release');visual=result['visual'];record=manifest()['decors']['BYSPAN|'+article]
    assert result['variant_id']=='unchanged' and result['material_id']=='original' and result['article']==article
    assert visual['render_color']==color and visual['map_to_surface'] is False
    assert 'texture_url' not in visual and result['visual_status']=='OFFICIAL_PREVIEW'
    assert record['source_url'].startswith('https://span.by/design/dekory/')
    data=(ROOT/record['asset']).read_bytes();assert hashlib.sha256(data).hexdigest()==record['sha256']
    app=FastAPI();app.include_router(router())
    with TestClient(app) as client:
        response=client.get(visual['preview_url'])
        assert response.status_code==200 and response.content==data

@pytest.mark.parametrize('article,manufacturer',[('605 PE','BYSPAN'),('605 SM','BYSPAN'),('890 PE','BYSPAN'),('810 PO','BYSPAN'),('890 PO','EGGER'),('605 PO',None)])
def test_other_finishes_brands_and_articles_do_not_inherit_default_samples(article,manufacturer):
    assert visual_metadata({'article':article,'manufacturer':manufacturer}) is None
