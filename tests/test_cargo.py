import json,subprocess
from pathlib import Path
from io import BytesIO
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_cargo import VARIANTS,cargo_error,cargo_kit
from backend.v2.three_d_document import hardware_for,module_contents,module_materials,render
from backend.v2.sales_hardware import module_hardware,purchasing_rows
ROOT=Path(__file__).resolve().parents[1]
def item(v,**patch):
    return {**dict(item_id='cargo',name='Карго',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],module_type='base_cabinet',width=200,height=820,depth=510,base_height=100,base='legs',handles='handleless' if v['execution']=='gola' else 'handles',x=0,z=0,rotation=0),**patch}
def test_browser_api_bom_and_purchasing_agree():
    specimens=[item(v,width=w,base_height=base,height=720+base) for v in VARIANTS for w in [150,175,200,250,300,350,400] for base in [80,100,150]]
    script="""import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(it=>{const error=C.dimensionError(it);return {error,items:error?[]:C.productionHardware(it).items}})));"""
    actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(specimens).encode(),cwd=ROOT))
    for it,js in zip(specimens,actual):
        assert bool(js['error'])==bool(cargo_error(it))
        if js['error']:
            with pytest.raises(ValidationError):FurnitureItem(**it)
            continue
        saved=FurnitureItem(**it).model_dump(mode='json');assert FurnitureItem(**saved).model_dump(mode='json')==saved
        assert saved['layout']=='drawers' and saved['drawers']==1 and saved['shelves']==[] and saved['bazis_resize']
        rows,note=hardware_for(saved)
        assert rows==[dict(name=r['name'],qty=r['quantity'],unit=r['unit'],article=r.get('article') or '') for r in js['items']]
        purchased=purchasing_rows(saved,module_hardware(saved)[0])[0]
        kits=[r for r in purchased if 'корзина-карго' in r['name'].lower()]
        assert len(kits)==1 and kits[0]['qty']==1 and kits[0]['unit']=='set' and kits[0]['article']==cargo_kit(saved)['article']
        assert not any('петля' in r['name'].lower() or 'LED' in r['name'] for r in rows)
        assert cargo_kit(saved)['article'] in module_contents(saved)
        if 'Gola' in it['bazis_file']:
            assert next(r for r in rows if r['article']=='60965')['qty']==it['width']/1000
            assert '0,5 мм' in module_contents(saved)
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_source_dimensions_and_document(v):
    for patch in [dict(bazis_sha256='0'*64),dict(depth=509),dict(depth=701),dict(height=699),dict(height=1101),dict(module_type='tall_cabinet'),dict(base='wall')]:
        with pytest.raises(ValidationError):FurnitureItem(**item(v,**patch))
    it=FurnitureItem(**item(v)).model_dump(mode='json')
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render('Карго',{'items':[it]},{}))).pages)
    assert v['brand'].upper() in text and cargo_kit(it)['article'] in text
    assert '200 x 820 x 510' in text
    assert 'LED' not in str(module_materials(it,None,None))
    if v['execution']=='gola':
        assert '60965' in text
        with pytest.raises(ValidationError):FurnitureItem(**item(v,rearServiceGapMm=50))
        assert FurnitureItem(**item(v,rearServiceGapMm=71.5)).rearServiceGapMm==71.5
    deep=FurnitureItem(**item(v,depth=600)).model_dump(mode='json')
    assert 'задняя царга сохраняет 80 мм' in hardware_for(deep)[1]
def test_expected_kits_and_source_width_mismatch_are_explicit():
    expected={'focus':['114064','114066','112512','112513'],'norwing':['36027','36028','36029','72261'],'icon':['115622','112519','112521','112522']}
    for v in VARIANTS:
        assert [k['article'] for k in v['kits']]==expected[v['brand']]
        assert v['native_frame']['size']==[150,820,510]
        if v['brand']=='norwing':
            assert 150 not in v['allowed_widths'] and v['kits'][0]['bounds']['hi'][0]>114
            with pytest.raises(ValidationError,match='пересекают'):FurnitureItem(**item(v,width=150))
