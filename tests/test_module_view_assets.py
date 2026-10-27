from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.cabinet_ui import router


def test_shared_module_view_assets_are_served():
    app = FastAPI()
    app.include_router(router())
    root = Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets/planner'
    with TestClient(app) as client:
        for asset in ('module-view.mjs', 'execution-ui.mjs', 'execution-previews.mjs', 'execution-cards.css'):
            response = client.get('/account/planner/'+asset)
            assert response.status_code == 200, asset
            assert response.content == (root/asset).read_bytes()
