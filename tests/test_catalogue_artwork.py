"""Lighting choices must load their actual WebP assets through the public router."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.cabinet_ui import router


def test_aq_and_lira_lighting_artwork_is_served_without_opening_the_asset_directory():
    app = FastAPI()
    app.include_router(router())
    client = TestClient(app)
    images = []
    for prefix in ('open-tall-none-open-tall-lighting-', 'open-tall-lira-'):
        for side in ('left', 'right', 'both'):
            response = client.get('/account/planner/execution-card-images/' + prefix + side + '.webp')
            assert response.status_code == 200
            assert response.headers['content-type'] == 'image/webp'
            assert response.content[:4] == b'RIFF'
            assert response.content[8:12] == b'WEBP'
            images.append(response.content)
    assert len(set(images)) == 6, 'Different profile and side choices need distinct images'
    assert client.get('/account/planner/execution-card-images/').status_code == 404
    assert client.get('/account/planner/execution-card-images/source.png').status_code == 404


def test_installed_kitchen_options_serve_their_images_and_keep_sources_private():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1] / 'backend/v2/cabinet_assets/planner/kitchen-option-images'
    app = FastAPI()
    app.include_router(router())
    with TestClient(app) as client:
        for name in ('0211e4f77fc4', '39f282e08f0c', '0ac4e1b6b2d3', '85c150c30ea5',
                     'ai-base-swing-shelves-3', 'ai-wall-vitrine-shelves-0', 'ai-base-sink-installed'):
            path = root / (name + '.webp')
            result = client.get('/account/planner/kitchen-option-images/' + path.name)
            assert result.status_code == 200
            assert result.headers['content-type'] == 'image/webp'
            assert result.content == path.read_bytes()
        for name in ('unlisted.webp', '0211e4f77fc4.fr3d'):
            assert client.get('/account/planner/kitchen-option-images/' + name).status_code == 404
