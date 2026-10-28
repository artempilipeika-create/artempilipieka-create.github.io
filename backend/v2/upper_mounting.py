"""600 mm clear apron above the associated worktop; independent of ceiling height."""
from math import cos, sin, radians


def local(item):
    angle = radians(item.get('rotation', 0))
    c, s = round(cos(angle)), round(sin(angle))
    x, z = item.get('x', 0), item.get('z', 0)
    return x*c+z*s, -x*s+z*c


def worktop_top(item):
    thickness = 0
    if item.get('countertopEnabled', True) and item.get('depth', 510) <= 750:
        thickness = item.get('countertopThicknessMm')
        if thickness is None: thickness = item.get('worktop_thickness')
        if thickness is None: thickness = 38 if item.get('bazis_id') or item.get('legHeightMm') is not None else 32
    return item['height'] + thickness


def upper_worktop_top(item, items):
    x, z = local(item)
    back = z-item['depth']/2
    candidates = []
    for lower in items:
        if lower.get('module_type') != 'base_cabinet' or lower.get('rotation', 0) != item.get('rotation', 0): continue
        lx, lz = local(lower)
        if abs(lz-lower['depth']/2-back) > 180: continue
        candidates.append((lx-lower['width']/2, lx+lower['width']/2, lower))
    if not candidates: return 858
    # Choose the nearest continuous run, rather than an island or another wall.
    runs = []
    for a, b, lower in sorted(candidates, key=lambda v: v[0]):
        if runs and a <= runs[-1]['end']+2:
            runs[-1]['end'] = max(runs[-1]['end'], b); runs[-1]['items'].append(lower)
        else: runs.append({'start': a, 'end': b, 'items': [lower]})
    run = min(runs, key=lambda r: max(r['start']-x, x-r['end'], 0))
    return max(worktop_top(lower) for lower in run['items'])


def mounted_items(items):
    """Return copies. Preserve explicitly stacked uppers and exact source identities."""
    result = [dict(it) for it in items]
    uppers = sorted([it for it in result if it.get('module_type') == 'wall_cabinet'],
                    key=lambda it: it.get('elevation_mm') if it.get('elevation_mm') is not None else 1458)
    old = {id(it): it.get('elevation_mm') if it.get('elevation_mm') is not None else 1458 for it in uppers}
    placed = []
    for it in uppers:
        x, z = local(it); parent = None; gap = 0
        for other in placed:
            if other.get('rotation', 0) != it.get('rotation', 0): continue
            ox, oz = local(other)
            overlap = min(x+it['width']/2, ox+other['width']/2)-max(x-it['width']/2, ox-other['width']/2)
            offset = old[id(it)]-old[id(other)]-other['height']
            if overlap > min(it['width'], other['width'])*.5 and abs(z-oz)<100 and -1 <= offset <= 50:
                parent, gap = other, max(0, offset)
        it['elevation_mm'] = round(parent['elevation_mm']+parent['height']+gap if parent else upper_worktop_top(it, result)+600)
        placed.append(it)
    return result
