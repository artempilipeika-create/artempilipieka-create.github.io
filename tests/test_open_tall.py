import json,subprocess
from pathlib import Path
from io import BytesIO
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_open_tall import VARIANTS,open_tall_error,open_tall_metrics,open_tall_hardware
from backend.v2.three_d_document import hardware_for,module_contents,module_materials,render
from backend.v2.sales_hardware import module_hardware,purchasing_rows,ledger
VARIANTS=[v for v in VARIANTS if not v.get('wall')]
ROOT=Path(__file__).resolve().parents[1]
def item(v,**patch):
    return {**dict(item_id='open',name='Открытый пенал',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],module_type='tall_cabinet',width=600,height=2000,depth=600,base_height=100,base='plinth',x=0,z=0,rotation=0),**patch}
def test_geometry_quantities_api_and_sales_have_one_contract():
    specimens=[item(v,height=h,depth=d,upper_shelf_count=n) for v in VARIANTS for h in [1800,2000,2800] for d in [300,609.5] for n in [None,1,3,8]]
    script="""import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(it=>({error:C.dimensionError(it),metrics:MF_OPEN_TALL.metrics(it),items:C.productionHardware(it).items}))));"""
    actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(specimens).encode(),cwd=ROOT))
    for it,js in zip(specimens,actual):
        assert not js['error'] and not open_tall_error(it)
        assert js['metrics']==open_tall_metrics(it)
        assert js['items']==open_tall_hardware(it)
        saved=FurnitureItem(**it).model_dump(mode='json');assert FurnitureItem(**saved).model_dump(mode='json')==saved
        assert saved['layout']=='niche' and saved['drawers']==0 and saved['shelves']==[] and saved['front_variant_id'] is None and saved['handles']=='handleless'
        rows,note=hardware_for(saved)
        assert rows==[dict(name=r['name'],qty=r['quantity'],unit=r['unit'],article=r.get('article') or '') for r in js['items']]
        assert purchasing_rows(saved,module_hardware(saved)[0])[0]==rows
        assert not any('Z1' in r['name'] or 'KUBIC' in r['name'] or 'петля' in r['name'].lower() for r in rows)
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_reject_wrong_source_invalid_bounds_and_preserve_pdf(v):
    for patch in [dict(bazis_sha256='0'*64),dict(depth=299),dict(depth=701),dict(width=601),dict(height=1799),dict(height=2801),dict(base_height=80),dict(module_type='base_cabinet'),dict(base='wall'),dict(upper_shelf_count=0),dict(upper_shelf_count=9)]:
        with pytest.raises(ValidationError):FurnitureItem(**item(v,**patch))
    it=FurnitureItem(**item(v,upper_shelf_count=3)).model_dump(mode='json')
    assert 'присадку' in hardware_for(it)[1]
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render('Открытый пенал',{'items':[it]},{}))).pages)
    assert 'Открытый пенал' in text and 'ЛДСП 18 мм' in text
    assert 'KUBIC' not in text and 'Z1' not in text
    assert all('Фасад' not in name for name,_ in module_materials(it,None,None))
    if v['light_system']=='none':assert 'Без подсветки' in text and 'LIRA' not in text and 'LED' not in text
    else:assert 'между полками' in text and 'питание 12 В' in text
    result=ledger({'items':[it]});assert result
    if v['light_system']=='lira-17.5x6.5':
        rows,notes=ledger({'items':[it,it]})
        assert next(r for r in rows if r['article']=='77267')['qty'] is None
        assert any('количество уточнить' in n for n in notes)
        from PIL import Image
        from backend.v2.sales_album import render as sales_render
        image=BytesIO();Image.new('RGB',(100,100),'white').save(image,'PNG')
        pdf=PdfReader(BytesIO(sales_render('Открытый пенал',{'items':[it]}, {},image.getvalue())))
        text='\n'.join(p.extract_text() for p in pdf.pages)
        assert len(pdf.pages)==5 and 'Без фасада' in text and 'Уточнить' in text
