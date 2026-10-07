"""Exact corner donor identities and PDF hardware shared with the browser catalogue."""
import json
from pathlib import Path

VARIANTS=json.loads((Path(__file__).parent/'cabinet_assets/planner/corner-variants.json').read_text())
BY_ID={v['id']:v for v in VARIANTS}

def corner_variant(it):
    v=BY_ID.get(it.get('bazis_id'))
    return v if v and v['source_sha256']==it.get('bazis_sha256') else None
