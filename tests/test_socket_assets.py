"""Socket resources use the existing fixed public UI allowlist; no DB or orders."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.v2.cabinet_ui import router
from backend.v2.three_d_room import Room

def test_socket_assets_have_correct_mime_and_keep_static_allowlist():
    app=FastAPI();app.include_router(router());client=TestClient(app)
    expected={'socket-editor.mjs':'application/javascript','socket-asset.mjs':'application/javascript','room-assets/socket-tripo.json':'application/json','room-assets/socket-tripo.bin':'application/octet-stream','room-assets/socket-tripo-color.webp':'image/webp','room-assets/socket-tripo-rm.webp':'image/webp','room-assets/socket-tripo-normal.webp':'image/webp','room-assets/socket-tripo-preview.webp':'image/webp'}
    for name,mime in expected.items():
        response=client.get('/account/planner/'+name)
        assert response.status_code==200,name
        assert response.headers['content-type'].startswith(mime)
        assert "default-src 'none'" in response.headers['content-security-policy']
    assert client.get('/account/planner/room-assets/source.glb').status_code==404
    assert client.get('/account/planner/room-assets/').status_code==404

def test_socket_room_roundtrip_preserves_all_wall_measurements():
    features=[dict(id='s-'+w,kind='socket',wall=w,offset=750,elevation=1080,width=86,height=86,projection=12,label='Розетка',notes='') for w in 'abcd']
    room=Room(width=4200,depth=3200,height=2700,setup_complete=True,survey='present',features=features)
    restored=Room.model_validate_json(room.model_dump_json())
    assert [f.model_dump() for f in restored.features]==features
