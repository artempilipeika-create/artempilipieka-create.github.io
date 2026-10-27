"""Native Gola identity survives API, purchasing and PDF projection."""
import json
import subprocess
from io import BytesIO
from pathlib import Path

import pytest
from pydantic import ValidationError
from pypdf import PdfReader

from backend.v2.three_d_api import FurnitureItem, projection
from backend.v2.three_d_tall import GOLA_VARIANTS
from backend.v2.three_d_document import hardware_for, module_contents, render
from backend.v2.sales_hardware import module_hardware, purchasing_rows

ROOT = Path(__file__).resolve().parents[1]


def item(v, **patch):
    return {**dict(item_id='gola-qa', name='Мой пенал Gola', bazis_id=v['id'],
                   bazis_file=v['source_file'], bazis_sha256=v['source_sha256'],
                   module_type='tall_cabinet', width=600, height=v['native_height'], depth=600,
                   base_height=100, base='plinth', x=500, z=700, rotation=90,
                   production_note='Заметка клиента',
                   front_variant_id='11111111-1111-4111-8111-111111111111',
                   part_materials={'top': '22222222-2222-4222-8222-222222222222'}), **patch}


def test_all_variants_share_browser_api_and_purchasing_contract():
    specimens = [item(v, height=h, depth=d, upper_shelf_count=n)
                 for v in GOLA_VARIANTS for h in [v['native_height'], 2800]
                 for d in [300 if v['family']=='storage' else 500, 600, 700]
                 for n in [None, 0, 3, 8]]
    script = """import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';
let s='';for await(const c of process.stdin)s+=c;
console.log(JSON.stringify(JSON.parse(s).map(it=>({error:C.dimensionError(it),items:C.productionHardware(it).items}))));"""
    browser = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script],
                                                input=json.dumps(specimens).encode(), cwd=ROOT))
    for it, js in zip(specimens, browser):
        assert not js['error']
        saved = FurnitureItem(**it).model_dump(mode='json')
        assert FurnitureItem(**saved).model_dump(mode='json') == saved
        for key in ['bazis_id', 'bazis_file', 'bazis_sha256', 'front_variant_id', 'part_materials',
                    'production_note', 'x', 'z', 'rotation', 'upper_shelf_count']:
            assert saved[key] == it.get(key)
        assert saved['handles']=='handleless' and saved['bazis_resize']
        rows = [dict(name=r['name'], qty=r['quantity'], unit=r['unit'], article=r.get('article')) for r in js['items']]
        assert hardware_for(saved)[0] == rows
        purchase = [{**r, 'unit':'set' if r['article']=='114797' else r['unit']} for r in rows]
        assert purchasing_rows(saved, module_hardware(saved)[0])[0] == purchase
        assert next(r for r in rows if r['article']=='89731')['qty'] == .6
        project = dict(project_id='gola-qa', name='Проверка', module_type='kitchen',
                       scene={'items':[saved]}, version=1, created_at=None, updated_at=None)
        assert projection(project)['scene']['items'][0] == saved
        assert 'Gola L; база' in module_contents(saved)


@pytest.mark.parametrize('v', GOLA_VARIANTS, ids=lambda v:v['id'])
def test_source_pin_and_rejected_invalid_dimensions(v):
    invalid = [dict(bazis_sha256='0'*64), dict(width=299), dict(height=v['min_height']-1),
               dict(height=2801), dict(depth=299 if v['family']=='storage' else 499),
               dict(depth=701), dict(base_height=80), dict(base='wall'),
               dict(module_type='base_cabinet'), dict(upper_shelf_count=9)]
    if v['family']=='appliance': invalid.append(dict(width=601))
    for patch in invalid:
        with pytest.raises(ValidationError): FurnitureItem(**item(v, **patch))
    assert FurnitureItem(**item(v, bazis_file=None)).bazis_file == v['source_file']


@pytest.mark.parametrize('layout', ['storage', 'door_oven_micro', 'drawer_oven'])
def test_pdf_contains_gola_profile_and_source_specific_fronts(layout):
    v = next(v for v in GOLA_VARIANTS if v['row_height']==900 and v['layout']==layout)
    saved = FurnitureItem(**item(v)).model_dump(mode='json')
    text = '\n'.join(p.extract_text() for p in PdfReader(BytesIO(render('Пенал Gola', {'items':[saved]}, {}))).pages)
    assert 'Gola L; база 900' in text and '89731' in text
    assert '600' in text and 'фасады' in text and 'отрезок 600 мм' in text


def test_private_native_sources_are_not_served():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI(); app.include_router(router())
    with TestClient(app) as client:
        for v in GOLA_VARIANTS:
            response=client.get('/account/planner/tall-gola-sources/'+v['source_file'])
            assert response.status_code==404
        assert client.get('/account/planner/tall-gola-sources/unknown.fr3d').status_code==404
