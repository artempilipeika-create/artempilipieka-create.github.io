"""Schema, PDF and JS/Python parity. No browser, external DB, orders or messaging."""
import json
import subprocess
from io import BytesIO
from pathlib import Path
import pytest
from PIL import Image
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

def test_corrected_sources_upgrade_saved_projects_and_unlock_aq_resize():
    assert all(v['global_elastic_defined'] for v in VARIANTS if v['light_system']=='aq-4x8')
    for v in VARIANTS:
        for old in v.get('previous_sources', []):
            raw=dict(item(v),bazis_file=old['source_file'],bazis_sha256=old['source_sha256'],
                     height=2200,body_height=2100,width=550,depth=550,glass_shelf_count=3,production_note='Сохранить полки')
            saved=FurnitureItem(**raw).model_dump()
            assert saved['bazis_sha256']==v['source_sha256']
            assert saved['bazis_file']==v['source_file'] and saved['bazis_resize']
            for key in ['item_id','name','width','height','depth','x','z','rotation','glass_shelf_count','production_note']:
                assert saved[key]==raw[key]
            assert vitrine_metrics(raw)==vitrine_metrics(saved)

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

def test_lira_pdf_contains_selected_stock_and_unresolved_mounting_quantities(tmp_path):
    v=next(v for v in VARIANTS if v['light_system']=='lira-17.5x6.5' and v['lighting']=='both' and v['opening']=='right')
    it=dict(item(v),height=2201,body_height=2101,glass_shelf_count=3)
    data=render('Витрина LIRA · проверка',dict(items=[it],room=dict(width=4200,depth=3200,height=2700)),{})
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
    for value in ['17.5','6.5','LIRA-1707','89672','89610','77267','75069','4.25','количество по монтажу','KUBIC']:
        assert value in text,value
    hw=vitrine_hardware(it)
    assert next(h for h in hw if h['article']=='89672')['quantity']==2
    assert next(h for h in hw if h['article']=='77267')['quantity'] is None
    assert next(h for h in hw if h['key']=='kubic-screws')['quantity']==12
    assert '89609' not in text
    (tmp_path/'lira-check.pdf').write_bytes(data)
    preview=BytesIO();Image.new('RGB',(300,180),'#edf1ea').save(preview,format='PNG')
    illustrated=render('Витрина LIRA · проверка эскиза',dict(items=[it],room=dict(width=4200,depth=3200,height=2700)),{},module_previews={it['item_id']:preview.getvalue()})
    pages=PdfReader(BytesIO(illustrated)).pages
    assert len(pages)==3
    assert all(word in pages[1].extract_text() for word in ['75069','Материалы','Вид модуля'])
    assert '77267' in pages[2].extract_text() and 'Уточнить' in pages[2].extract_text()
    (tmp_path/'lira-preview-check.pdf').write_bytes(illustrated)
