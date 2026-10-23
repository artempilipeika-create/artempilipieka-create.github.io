"""Fixed optimized appliance resources only; no orders, DB or production mutations."""
from io import BytesIO
from PIL import Image
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.cabinet_ui import router


def test_appliance_resources_use_existing_fixed_public_allowlist():
    app=FastAPI();app.include_router(router());client=TestClient(app)
    for module in ['appliance-assets.mjs','appliance-finish.mjs']:
        response=client.get('/account/planner/'+module)
        assert response.status_code==200
        assert response.headers['content-type'].startswith('application/javascript')
    for kind in ('oven','microwave'):
        for suffix,mime in [('.json','application/json'),('.bin','application/octet-stream'),('-color.webp','image/webp'),('-rm.webp','image/webp'),('-normal.webp','image/webp')]:
            name='appliance-assets/'+kind+'-tripo'+suffix
            response=client.get('/account/planner/'+name)
            assert response.status_code==200,name
            assert response.headers['content-type'].startswith(mime)
            assert "default-src 'none'" in response.headers['content-security-policy']
            assert response.headers['x-content-type-options']=='nosniff'
            assert response.content==(Path('backend/v2/cabinet_assets/planner')/name).read_bytes()
            if suffix.endswith('.webp'):
                with Image.open(BytesIO(response.content)) as image:
                    image.load();assert image.size==(2048,2048) if suffix=='-color.webp' else image.size==(1024,1024)
    for name in ['appliance-assets/','appliance-assets/source.glb','appliance-assets/oven.glb','appliance-assets/washing-machine-tripo.bin']:
        assert client.get('/account/planner/'+name).status_code==404
