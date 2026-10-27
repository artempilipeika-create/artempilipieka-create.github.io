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
