import json
import subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_pullout_dryers import VARIANTS,dryer_error
from backend.v2.three_d_tall import APPLIANCE_VARIANTS,VARIANTS as TALL_VARIANTS
from backend.v2.three_d_document import hardware_for,module_contents,module_materials
from backend.v2.three_d_accessories import VARIANTS as ACCESSORIES
ROOT=Path(__file__).resolve().parents[1]
def item(v,**patch):
    return dict(item_id='dryer',name='Сушка',bazis_id=v['id'],bazis_sha256=v['source_sha256'],module_type='base_cabinet',width=600,height=820,depth=510,base_height=100,base='legs',handles='handles',x=0,z=0,rotation=0,**patch)
def test_discrete_widths_and_dynamic_purchasing_match_browser():
    specimens=[{**item(v),'width':w} for v in VARIANTS for w in [599,600,650,700,750,800,850,900,901]]
    script="""import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';let s='';for await(const c of process.stdin)s+=c;console.log(JSON.stringify(JSON.parse(s).map(it=>{const error=C.dimensionError(it);return {error,items:error?[]:C.productionHardware(it).items}})));"""
    actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(specimens).encode(),cwd=ROOT))
    for it,actual in zip(specimens,actual):
        assert bool(actual['error'])==bool(dryer_error(it))
        if actual['error']:
            with pytest.raises(ValidationError):FurnitureItem(**it)
        else:
            saved=FurnitureItem(**it).model_dump()
            assert hardware_for(saved)[0]==[dict(name=r['name'],qty=r['quantity'],unit=r['unit'],article=r.get('article') or '') for r in actual['items']]
            dryers=[r for r in actual['items'] if 'корзина-сушка' in r['name'].lower()]
            assert len(dryers)==1 and str(it['width']) in dryers[0]['name'] and dryers[0]['quantity']==1
            assert 'сверху выдвижная сушка' in module_contents(saved)
@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_source_guard(v):
    with pytest.raises(ValidationError):FurnitureItem(**{**item(v),'bazis_sha256':'0'*64})
    with pytest.raises(ValidationError):FurnitureItem(**{**item(v),'depth':500})
def test_tall_depth_and_nonlit_document_profile():
    for v in APPLIANCE_VARIANTS:
        for depth in (600,650,700):
            FurnitureItem(**{**item(v),'module_type':'tall_cabinet','height':v['native_height'],'depth':depth})
        with pytest.raises(ValidationError):FurnitureItem(**{**item(v),'module_type':'tall_cabinet','height':v['native_height'],'depth':550})
    v=next(v for v in ACCESSORIES if v['kind']=='dishwasher' and v['variant']=='gola')
    rows=hardware_for(item(v))[0]
    assert any(r['article']=='60965' for r in rows)
    assert all('LED' not in r['name'] and r['article']!='89731' for r in rows)
    assert 'LED' not in str(module_materials(item(v),None,None))

@pytest.mark.parametrize('v',TALL_VARIANTS,ids=lambda v:v['id'])
def test_shallow_tall_depth_persists_in_api_and_document(v):
    from io import BytesIO
    from pypdf import PdfReader
    from backend.v2.three_d_document import render
    from backend.v2.three_d_api import projection
    for depth in (300,317,400,449,450,600,700):
        it={**item(v),'module_type':'tall_cabinet','height':2000,'depth':depth,'upper_shelf_count':4}
        saved=FurnitureItem(**it).model_dump(mode='json')
        assert FurnitureItem(**saved).depth==depth
        row=dict(project_id='shallow',name='Пенал',module_type='kitchen',scene={'items':[saved]},version=1,created_at=None,updated_at=None)
        assert projection(row)['scene']['items'][0]['depth']==depth
        if depth==300:
            text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render('Пенал',{'items':[saved]},{}))).pages)
            assert '600 x 2000 x 300' in text
    for depth in (299,701):
        with pytest.raises(ValidationError):FurnitureItem(**{**it,'depth':depth})

def test_corrected_norwing_source_refreshes_saved_projects_without_loosening_sha_guard():
    from backend.v2.three_d_pullout_dryers import refresh_dryer_source
    from backend.v2.three_d_api import projection
    from backend.v2.sales_hardware import module_hardware,purchasing_rows
    v=next(v for v in VARIANTS if v.get('previous_sources'))
    previous=v['previous_sources'][0]
    legacy={**item(v),'bazis_sha256':previous['source_sha256'],'bazis_file':previous['source_file'],
            'production_note':'Сохранить заметку','part_materials':{'drawer-1-bottom':'11111111-1111-4111-8111-111111111111'}}
    updated=refresh_dryer_source(legacy)
    assert updated['bazis_sha256']==v['source_sha256']
    assert updated['bazis_file'].endswith('NORWING(1).fr3d')
    assert legacy['bazis_sha256']==previous['source_sha256']
    for key in ['item_id','name','width','height','depth','production_note','part_materials']:
        assert updated[key]==legacy[key]
    assert FurnitureItem(**legacy).bazis_sha256==v['source_sha256']
    row=dict(project_id='saved',name='Кухня',module_type='kitchen',scene={'items':[legacy]},version=7,created_at=None,updated_at=None)
    assert projection(row)['scene']['items'][0]['bazis_sha256']==v['source_sha256']
    assert row['scene']['items'][0]['bazis_sha256']==previous['source_sha256']
    unknown={**legacy,'bazis_sha256':'0'*64}
    assert refresh_dryer_source(unknown) is unknown
    with pytest.raises(ValidationError):FurnitureItem(**unknown)
    assert module_hardware(legacy)==module_hardware(updated)
    assert purchasing_rows(legacy,module_hardware(legacy)[0])==purchasing_rows(updated,module_hardware(updated)[0])
    assert not v['warnings'] and v['dryer_bounds']==dict(lo=[18,478.5,60],size=[562,220,450])
    assert hardware_for(legacy)==hardware_for(updated)
    assert module_contents(legacy)==module_contents(updated)
