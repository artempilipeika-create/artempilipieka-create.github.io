"""Schema, PDF and JS/Python parity. No browser, external DB, orders or messaging."""
import json
import subprocess
from io import BytesIO
from pathlib import Path
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem, Scene
from backend.v2.three_d_vitrine import VARIANTS, vitrine_metrics, vitrine_hardware, glass_shelves
from backend.v2.three_d_document import render, module_materials

ROOT=Path(__file__).resolve().parents[1]

def item(v):
    return dict(item_id=v['id'], name='Пенал-витрина', module_type='tall_cabinet',
                bazis_id=v['id'], bazis_file=v['source_file'], bazis_sha256=v['source_sha256'],
                width=600,height=2000,depth=600,body_height=1900,base_height=100,base='legs',drawers=0,
                handles='handleless',x=0,z=0,rotation=0)

def test_roundtrip_all_donors_and_shelf_options():
    for v in VARIANTS:
        for n in (None,0,1,3,8):
            original=FurnitureItem(**dict(item(v),glass_shelf_count=n))
            saved=FurnitureItem.model_validate_json(original.model_dump_json())
            assert saved==original
            assert saved.bazis_resize==v['global_elastic_defined']
            assert saved.glass_shelf_count==n
            assert len(glass_shelves(saved.model_dump()))==(1 if n is None else n)

def test_validation_prevents_invalid_donors_and_fixed_size_resize():
    base=item(VARIANTS[0])
    for patch in [dict(bazis_sha256='0'*64),dict(width=601),dict(base_height=150),dict(glass_shelf_count=9),dict(glass_shelf_count=True)]:
        with pytest.raises(ValidationError):FurnitureItem(**(base|patch))
    fixed=item(next(v for v in VARIANTS if not v['global_elastic_defined']))
    with pytest.raises(ValidationError):FurnitureItem(**(fixed|dict(height=2200,body_height=2100)))

def test_js_python_metrics_and_hardware_parity():
    specimens=[dict(item(v),glass_shelf_count=n,height=2201 if v['global_elastic_defined'] else 2000) for v in VARIANTS for n in (None,0,3)]
    js="""import {VITRINE as V,productionHardware} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';
    let input='';for await(const c of process.stdin)input+=c;
    console.log(JSON.stringify(JSON.parse(input).map(it=>({metrics:V.metrics(it),hardware:productionHardware(it).items.map(({key,quantity,article,unit})=>({key,quantity,article,unit}))}))));"""
    actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],input=json.dumps(specimens).encode(),cwd=ROOT))
    for it,out in zip(specimens,actual):
        for k,v in vitrine_metrics(it).items():assert out['metrics'][k]==v
        assert out['hardware']==[{k:r.get(k) for k in ('key','quantity','article','unit')} for r in vitrine_hardware(it)]

def test_pdf_contains_separate_lighting_profile_seal_and_glass(tmp_path):
    it=dict(item(VARIANTS[5]),glass_shelf_count=3)
    data=render('Витрина Z1 · проверка',dict(items=[it],room=dict(width=4200,depth=3200,height=2700)),{})
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
    for value in ['15.0341','3.8','4.984','4.874','Уплотнитель Z1','Уголки Z1','Стекло 4 мм','18 мм','вручную']:
        assert value in text,value
    assert all('ЛХДФ' not in str(r) for r in module_materials(it,None,None))
    (tmp_path/'vitrine-check.pdf').write_bytes(data)
