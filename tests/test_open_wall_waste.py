"""Cross-runtime contract for the nine FR3D files added on 2026-10-26."""
import json
import subprocess
from pathlib import Path
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_open_tall import VARIANTS as OPEN, open_tall_metrics, open_tall_hardware
from backend.v2.three_d_cargo import VARIANTS as CARGO, cargo_hardware
from backend.v2.three_d_document import hardware_for, module_contents

ROOT = Path(__file__).resolve().parents[1]
WALL = [v for v in OPEN if v.get('wall')]
WASTE = [v for v in CARGO if v.get('waste')]

def item(v, **patch):
    wall = bool(v.get('wall'))
    return dict(item_id='qa', name=v['label'], bazis_id=v['id'], bazis_sha256=v['source_sha256'],
                bazis_file=v['source_file'], module_type='wall_cabinet' if wall else 'base_cabinet',
                width=600 if wall else 350, height=720 if wall else 820, depth=317 if wall else 510,
                base_height=0 if wall else 100, base='wall' if wall else 'legs', x=0, z=0, rotation=0) | patch

def test_saved_items_bom_and_lighting_match_browser():
    specimens = [item(v, width=w, height=h, depth=d, upper_shelf_count=n)
                 for v in WALL for w in (300,600) for h in (300,720,900,2400)
                 for d in (250,317,600) for n in (None,1,2)]
    specimens += [item(v, width=w, depth=d, height=720+b, base_height=b)
                  for v in WASTE for w,d in ((350,510),(400,510),(450,525),(450,600)) for b in (80,100,150)]
    script = """import * as C from './backend/v2/cabinet_assets/planner/furniture-core.mjs';
let s='';for await(const c of process.stdin)s+=c;
console.log(JSON.stringify(JSON.parse(s).map(it=>({error:C.dimensionError(it),
 metrics:MF_OPEN_TALL.info(it)?MF_OPEN_TALL.metrics(it):null, items:C.productionHardware(it).items,
 parts:C.productionParts(it,{production:C.PRODUCTION_MODELS[it.bazis_id]})}))));"""
    rows = json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(specimens).encode(),cwd=ROOT))
    for it,js in zip(specimens,rows):
        assert not js['error']
        saved = FurnitureItem(**it).model_dump(mode='json')
        assert FurnitureItem(**saved).model_dump(mode='json') == saved
        wall = saved['module_type']=='wall_cabinet'
        assert js['items'] == (open_tall_hardware(it) if wall else cargo_hardware(it))
        if wall:
            assert js['metrics']==open_tall_metrics(it)
            assert len(js['parts'])==5+len(js['metrics']['shelf_centers_mm'])
            assert saved['front_variant_id'] is None and saved['layout']=='niche'
            assert any(r['key']=='wall-mounting' and r['quantity'] is None for r in js['items'])
            for p in js['parts']:
                assert p['thickness']==18 and p['position']['y']-p['size']['y']/2>=-1e-5
            lengths=[p['machining'][0]['length_mm'] for p in js['parts'] if p.get('machining')]
            assert sorted(lengths)==sorted(js['metrics']['groove_lengths_mm'])
        else:
            assert len(js['parts'])==7 and saved['drawers']==1
            kits=[r for r in js['items'] if r['key']=='cargo-kit']
            assert len(kits)==1 and kits[0]['quantity']==1
            assert kits[0]['article']=={350:'122847',400:'122848',450:'122849'}[it['width']]
        purchase,note=hardware_for(saved)
        assert purchase==[dict(name=r['name'],qty=r['quantity'],unit=r['unit'],article=r.get('article') or '') for r in js['items']]
        assert ('Верхний открытый' if wall else 'GEO X') in module_contents(saved)

@pytest.mark.parametrize('v',WALL+WASTE,ids=lambda v:v['id'])
def test_sources_and_invalid_dimensions_rejected(v):
    patches=[dict(bazis_sha256='0'*64)]
    patches += ([dict(base_height=100),dict(width=601),dict(height=299),dict(depth=249),dict(upper_shelf_count=9),dict(height=300,upper_shelf_count=8)]
                if v.get('wall') else [dict(width=600),dict(width=450,depth=510),dict(depth=509)])
    for patch in patches:
        with pytest.raises(ValidationError):
            FurnitureItem(**item(v,**patch))
