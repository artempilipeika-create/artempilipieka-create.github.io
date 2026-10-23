"""Countertop persistence, download boundary and PDF notes; no external writes."""
import hashlib
import json
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.cabinet_ui import router
from backend.v2.three_d_api import Scene
from backend.v2.three_d_document import render

ROOT=Path(__file__).resolve().parents[1]
BASE=dict(item_id='countertop-test',name='Нижний шкаф',module_type='base_cabinet',width=600,height=820,depth=510,body_height=720,base_height=100,base='legs',x=0,z=0)

def test_countertop_settings_roundtrip_and_legacy_defaults():
    scene=Scene(items=[BASE|dict(countertopEnabled=False,countertopJoint='euro')],countertopSettings=dict(joint='euro'))
    assert Scene.model_validate_json(scene.model_dump_json())==scene
    assert scene.items[0].height==820 and scene.items[0].body_height==720
    legacy=Scene(items=[BASE])
    assert legacy.items[0].countertopEnabled is True
    assert legacy.items[0].countertopJoint==legacy.countertopSettings.joint=='standard'
    with pytest.raises(ValidationError):Scene(countertopSettings=dict(joint='guess'))

def test_exact_donors_download_with_hash_and_mime():
    app=FastAPI();app.include_router(router())
    variants=json.loads((ROOT/'backend/v2/cabinet_assets/planner/countertop-variants.json').read_text())
    with TestClient(app) as client:
        for v in variants:
            response=client.get('/account/planner/countertop-sources/'+quote(v['source_file']))
            assert response.status_code==200
            assert response.headers['content-type']=='application/octet-stream'
            assert hashlib.sha256(response.content).hexdigest()==v['source_sha256']
        assert client.get('/account/planner/countertop-sources/'+quote('Столешница_Обычная_Лево_38мм..fr3d')).status_code==404
        assert client.get('/account/planner/countertop-sources/unknown.fr3d').status_code==404

def test_visual_module_is_public_without_exposing_other_files():
    app=FastAPI();app.include_router(router())
    with TestClient(app) as client:
        response=client.get('/account/planner/countertop-visuals.mjs')
        assert response.status_code==200
        assert 'javascript' in response.headers['content-type']
        assert 'countertopGeometry' in response.text
        assert client.get('/account/planner/unknown-visuals.mjs').status_code==404

@pytest.mark.parametrize('enabled',[True,False])
def test_pdf_height_and_disabled_note(enabled):
    item=BASE|dict(countertopEnabled=enabled,countertopJoint='euro',countertopThicknessMm=38,countertopDepthMm=600)
    data=render('Столешница',dict(items=[item],room=dict(width=4200,depth=3200,height=2700)),{})
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
    assert ('Высота со столешницей: 858 мм' in text) is enabled
    assert ('Столешница над модулем отключена' in text) is (not enabled)
    if enabled:assert 'еврозапил' in text
