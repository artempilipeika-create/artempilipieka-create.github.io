import json
import subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_pullout_dryers import VARIANTS,dryer_error
from backend.v2.three_d_tall import APPLIANCE_VARIANTS
from backend.v2.three_d_document import hardware_for,module_contents
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
