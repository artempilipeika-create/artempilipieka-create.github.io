"""Visual attachments to exact catalogue identities; never modify catalogue or manufacturing IDs."""
import json
import re
from functools import lru_cache
from pathlib import Path

ROOT=Path(__file__).parent/'cabinet_assets'/'planner'/'materials'

@lru_cache(maxsize=1)
def manifest():
    return json.loads((ROOT/'manifest.json').read_text())

def visual_metadata(item):
    # Explicit per-variant metadata always wins over the small verified decor registry.
    if isinstance(item.get('visual'),dict):
        keys=('texture_url','preview_url','render_color','texture_size_mm','rotation_deg','grain_direction','roughness','source_url')
        return {k:item['visual'][k] for k in keys if k in item['visual']}
    fields={'renderTexture':'texture_url','texture_preview':'texture_url','preview':'preview_url','preview_url':'preview_url',
            'renderColor':'render_color','render_color':'render_color','preview_color':'render_color','color_hex':'render_color',
            'textureScale':'texture_size_mm','texture_size_mm':'texture_size_mm','grainDirection':'grain_direction','rotation':'rotation_deg'}
    visual={target:item[key] for key,target in fields.items() if item.get(key) is not None}
    if visual:return visual
    article=re.sub(r'\s+',' ',str(item.get('article') or '').strip().upper())
    manufacturer=str(item.get('manufacturer') or '').strip().upper()
    # The imported master intentionally leaves manufacturer null. An explicit EGGER
    # name plus an exact full article is permitted only for these verified records.
    if manufacturer and manufacturer!='EGGER':return None
    if not manufacturer and not re.search(r'\bEGGER\b',str(item.get('name') or ''),re.I):return None
    record=manifest()['decors'].get(article)
    if not record:return None
    return {k:v for k,v in record.items() if k not in ('asset','sha256','original_sha256')}
