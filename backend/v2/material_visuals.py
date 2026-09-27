"""Visual attachments to exact catalogue identities; never modify catalogue or manufacturing IDs."""
import json
import re
from functools import lru_cache
from pathlib import Path
from collections import Counter

ROOT=Path(__file__).parent/'cabinet_assets'/'planner'/'materials'
STATUSES=('EXACT_TEXTURE','OFFICIAL_PREVIEW','COLOR_ONLY','MISSING_VISUAL')

def visual_manufacturer(item):
    explicit=str(item.get('manufacturer') or '').strip().upper()
    if explicit:return explicit
    # This is attachment provenance, never a change to catalogue identity.
    brands=re.findall(r'\b(EGGER|BYSPAN|ULTRADECOR|KRONOSPAN|EXTRAVERT)\b',str(item.get('name') or ''),re.I)
    return brands[0].upper() if len(set(b.upper() for b in brands))==1 else None

def visual_status(visual):
    v=visual or {}
    def local(url):
        return isinstance(url,str) and re.fullmatch(r'/(?!/)[\w/.-]+\.(?:png|jpe?g|webp)',url,re.I) and '..' not in url
    if local(v.get('texture_url')):return 'EXACT_TEXTURE'
    if local(v.get('preview_url')):return 'OFFICIAL_PREVIEW'
    if re.fullmatch(r'#[\da-fA-F]{6}',str(v.get('render_color') or '')):return 'COLOR_ONLY'
    return 'MISSING_VISUAL'

def coverage(items,release=None):
    rows=[]
    for item in items:
        if item.get('kind')!='material':continue
        v=visual_metadata(item);status=visual_status(v)
        rows.append({**{k:item.get(k) for k in ('material_id','variant_id','manufacturer','article','name','thickness','length','width')},
                     'visual_manufacturer':visual_manufacturer(item),'visual_status':status,
                     'visual_asset':(v or {}).get('texture_url') or (v or {}).get('preview_url'),
                     'source_url':(v or {}).get('source_url'),
                     'reason':('manufacturer unconfirmed' if not visual_manufacturer(item) else
                               'full article missing' if not item.get('article') else 'confirmed visual not available') if status=='MISSING_VISUAL' else None})
    counts=Counter(r['visual_status'] for r in rows)
    identified=[r for r in rows if r['visual_manufacturer'] and r['article']]
    return {'catalogue_release':str(release) if release else None,'total':len(rows),
            'identity_counts':{'unique_material_ids':len({r['material_id'] for r in rows if r['material_id']}),
              'unique_variant_ids':len({r['variant_id'] for r in rows if r['variant_id']}),
              'unique_full_articles':len({r['article'] for r in rows if r['article']}),
              'article_missing':sum(not r['article'] for r in rows),
              'manufacturer_field_present':sum(bool(r['manufacturer']) for r in rows),
              'manufacturer_explicit_in_name':sum(not r['manufacturer'] and bool(r['visual_manufacturer']) for r in rows),
              'manufacturer_unconfirmed':sum(not r['visual_manufacturer'] for r in rows),
              'unique_identified_decor_structures':len({(r['visual_manufacturer'],r['article']) for r in identified})},
            'counts':{s:counts[s] for s in STATUSES},'items':rows,
            'needs_source':[r for r in rows if r['visual_status'] in ('MISSING_VISUAL','COLOR_ONLY')]}

@lru_cache(maxsize=1)
def manifest():
    return json.loads((ROOT/'manifest.json').read_text())

def visual_metadata(item):
    # Explicit per-variant metadata always wins over the small verified decor registry.
    if isinstance(item.get('visual'),dict):
        keys=('texture_url','preview_url','render_color','texture_size_mm','rotation_deg','grain_direction','roughness','source_url','visual_status')
        return {k:item['visual'][k] for k in keys if k in item['visual']}
    fields={'renderTexture':'texture_url','texture_preview':'texture_url','preview':'preview_url','preview_url':'preview_url',
            'renderColor':'render_color','render_color':'render_color','preview_color':'render_color','color_hex':'render_color',
            'textureScale':'texture_size_mm','texture_size_mm':'texture_size_mm','grainDirection':'grain_direction','rotation':'rotation_deg'}
    visual={target:item[key] for key,target in fields.items() if item.get(key) is not None}
    if visual:return visual
    article=re.sub(r'\s+',' ',str(item.get('article') or '').strip().upper())
    manufacturer=visual_manufacturer(item)
    # The imported master intentionally leaves manufacturer null. An explicit EGGER
    # name plus an exact full article is permitted only for these verified records.
    if not manufacturer:return None
    key=article if manufacturer=='EGGER' else manufacturer+'|'+article
    record=manifest()['decors'].get(key)
    if not record:return None
    return {k:v for k,v in record.items() if k not in ('asset','sha256','original_sha256')}
