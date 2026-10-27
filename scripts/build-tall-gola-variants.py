"""Build the separate PN-600 Gola family from audited, byte-identical donors."""
import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'backend/v2/cabinet_assets/planner'
LABELS = {'storage': 'полки', 'door_oven': 'дверь + духовка',
          'door_oven_micro': 'дверь + духовка + СВЧ', 'drawer_oven': 'ящик + духовка',
          'drawer_oven_micro': 'ящик + духовка + СВЧ'}


def variant(r):
    storage = r['layout'] == 'storage'
    drawer = r['layout'].startswith('drawer_')
    h = r['frame']['size'][1]
    dividers = sorted((p for p in r['panels'] if p['name'] == 'Перегородка'), key=lambda p: p['lo'][1])
    upper_bottom = dividers[-1]['lo'][1] + 18
    fronts = sorted((p for p in r['panels'] if p['name'] == 'Фасад'), key=lambda p: (p['lo'][1], p['lo'][0]))
    shelves = sorted((p for p in r['panels'] if p['name'] == 'Полка' and p['lo'][1] >= upper_bottom), key=lambda p: p['lo'][1])
    specs = []
    for p in r['panels']:
        name, lo, size = p['name'], p['lo'], p['size']
        role, stretch, key = 'body', 'fixed', None
        extra = {}
        if name == 'Дно': key = 'bottom'
        elif name == 'Крыша': key, stretch = 'top', 'top'
        elif name.startswith('Боковая Стойка'):
            key, stretch = 'side-' + name[-1], 'height'
            extra['contour_yz'] = [[q[1], q[2]] for q in p['world_contour']]
        elif name == 'Перегородка':
            i = dividers.index(p)
            key = 'divider' if storage else ['support-oven', 'support-micro' if len(dividers) == 3 else 'support-upper', 'support-upper'][i]
        elif name == 'Полка':
            role = 'shelf'
            if p in shelves: key, stretch = 'shelf-upper-' + str(shelves.index(p)+1), 'shelf'
            else: key = 'shelf-fixed'
        elif name == 'Фасад':
            i = fronts.index(p); lower = lo[1] < upper_bottom - 18
            key = ('front-lower' if lower else 'door-upper') + (('-L' if lo[0] < 300 else '-P') if r['opening'] == 'double' else '')
            role, stretch = 'front', 'fixed' if lower else 'height'
            extra.update(kind='drawer' if drawer and lower else 'door', hinge_count=0 if drawer and lower else 2 if lower or size[1] < 850 else 3)
        elif name == 'З.С':
            role = 'back'
            if size[1] == 3: key = 'drawer-bottom'
            elif storage: key, stretch = 'back', 'height'
            elif lo[1] > 200: key, stretch = 'back-upper', 'height'
            else: key = 'back-lower'
        else:
            key = {'ЗАДНЯЯ ШУФ': 'drawer-rear', 'Фронтальная ШУФ': 'drawer-front-box',
                   'Боковая напр.L': 'drawer-side-L', 'Боковая напр.P': 'drawer-side-P'}[name]
        specs.append(dict(key=key, name=name, role=role, lo=lo, size=size,
                          center=[round(lo[i]+size[i]/2-(300 if i != 1 else 0), 4) for i in range(3)],
                          axes=['xyz'[i] for i in p['axes']], stretch=stretch, material=p['material'],
                          source_id=p['source_id'], **extra))
    assert len({p['key'] for p in specs}) == len(specs)
    hw = []
    for row in r['hardware']:
        row = dict(row)
        if row['article'] == 'PK 5.0X16B': row['key'] = 'shelf-support-marcopol'
        hw.append(row)
    profiles = [dict(name=p['name'], article=p['material'].split('\r')[-1],
                     material_name=p['material'].split('\r')[0], bounds=p['bounds'], contour_yz=p['contour_yz']) for p in r['profiles']]
    return dict(id=r['id'], execution='gola', family='storage' if storage else 'appliance',
                row_height=r['base'], opening=r['opening'], doors_per_section=2 if r['opening']=='double' else 1,
                layout=r['layout'], drawer=drawer, microwave='micro' in r['layout'],
                label=f"Пенал Gola · {LABELS[r['layout']]} · база {r['base']} · " + {'left':'L','right':'P','double':'Д2'}[r['opening']],
                source_file=r['file'], source_sha256=r['sha256'], native_height=h,
                min_height=max(1800, math.ceil((upper_bottom+250)/100)*100) if not storage else 1800,
                oven_bottom=None if storage else dividers[0]['lo'][1]+18,
                upper_bottom=upper_bottom, upper_shelves=[p['lo'][1]+9 for p in shelves],
                fixed_shelf_y=next((p['lo'][1]+9 for p in r['panels'] if p['name']=='Полка' and p not in shelves), None),
                panels=specs, profiles=profiles, hardware_items=hw)


def main():
    ap=argparse.ArgumentParser();ap.add_argument('audits', nargs='+', type=Path);ap.add_argument('--sources', required=True, type=Path)
    args=ap.parse_args(); records=[r for f in args.audits for r in json.loads(f.read_text())['records']]
    assert len(records)==22 and len({r['sha256'] for r in records})==22
    for r in records:
        source=args.sources/r['file']; assert hashlib.sha256(source.read_bytes()).hexdigest()==r['sha256']
    rows=[variant(r) for r in records]
    (OUT/'tall-gola-variants.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    print(f'Generated {len(rows)} variants; original filenames and hashes preserved.')


if __name__=='__main__': main()
