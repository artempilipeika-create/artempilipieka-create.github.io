"""Verified PN-600 donors, shared with the browser catalogue and PDF."""
import json
from pathlib import Path
VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/tall-variants.json').read_text())
APPLIANCE_VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/appliance-tall-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS+APPLIANCE_VARIANTS}

def tall_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None


def tall_shelf_count(it):
    v=tall_variant(it)
    if not v:return 0
    value=it.get('upper_shelf_count')
    return len(v['upper_shelves']) if value is None else value
