"""Production FR3D/B3D donors and archives are not public constructor assets."""
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.cabinet_ui import router

ASSETS=Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets'
PLANNER=ASSETS/'planner'

@pytest.fixture
def client():
    app=FastAPI();app.include_router(router())
    with TestClient(app) as c:
        yield c

def test_all_native_donors_and_archives_are_unavailable_even_with_range(client):
    sources=[p.relative_to(PLANNER).as_posix() for p in PLANNER.rglob('*')
             if p.is_file() and p.suffix.lower() in {'.fr3d','.b3d','.zip'}]
    assert len(sources)>40
    sources+=['modern-cabinet-sources.zip','blank-sources.zip']
    for asset in sources:
        url='/account/planner/'+quote(asset)
        for headers in [{},{'Range':'bytes=0-1023'}]:
            response=client.get(url,headers=headers)
            assert response.status_code==404,asset
            assert not response.content,asset
            assert response.headers['cache-control']=='no-store'
        assert client.head(url).status_code in {404,405}

@pytest.mark.parametrize('url',['/constructor','/constructor.html','/constructor-next','/constructor-legacy'])
def test_constructor_contains_no_native_download_links(client,url):
    html=client.get(url)
    assert html.status_code==200
    assert 'modern-cabinet-sources.zip' not in html.text
    assert 'Скачать исходники' not in html.text

def test_ui_assets_do_not_reintroduce_native_download_controls(client):
    for name in ['accessory-ui.mjs','blanks-ui.mjs','countertop-ui.mjs','wall-finish-ui.mjs']:
        response=client.get('/account/planner/'+name)
        assert response.status_code==200
        for source in ['blank-sources.zip','accessory-sources/','countertop-sources/','wall-panel-sources/']:
            assert source not in response.text,(name,source)

def test_render_assets_and_importer_remain_available(client):
    for asset in ['modern-cabinet-variants.js','modern-cabinets.js','module-mesh.mjs',
                  'hardware-photos/38402.webp','bazis-drawers-import.js']:
        assert client.get('/account/planner/'+asset).status_code==200
