"""Read PN-600 FR3D sources without executing Scheme or altering source bytes.

Usage: python scripts/audit-pn600-gola.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
Produces evidence for review, not approved production catalogue entries.
"""
import argparse
import collections
import hashlib
import importlib.util
import io
import json
import re
import struct
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from fr3d_reader import load, child, vals, walk, scheme, cached, frame, planeinfo, rules, points_bound, r

spec = importlib.util.spec_from_file_location('gola_geometry', Path(__file__).with_name('build-gola-variants.py'))
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


def thumbnail(data):
    start = data.index(b'\x89PNG\r\n\x1a\n')
    at = start + 8
    while True:
        length = struct.unpack_from('>I', data, at)[0]
        tag = data[at+4:at+8]
        payload = data[at+8:at+8+length]
        crc = struct.unpack_from('>I', data, at+8+length)[0]
        assert zlib.crc32(tag+payload) & 0xffffffff == crc
        at += length + 12
        if tag == b'IEND':
            result = data[start:at]
            with Image.open(io.BytesIO(result)) as im:
                size = list(im.size)
                im.verify()
            return result, size


def inspect(path, out):
    data = path.read_bytes()
    assert data[:4] == b'BZ85'
    digest = hashlib.sha256(data).hexdigest()
    tree = load(path)
    model = child(tree, 'Model')
    filename = path.name
    layout = ('drawer_' if 'РШ1' in filename else 'door_') + ('oven_micro' if 'СВЧ' in filename else 'oven') if 'ДШ' in filename else 'storage'
    record = dict(file=filename, bytes=len(data), sha256=digest, id='bazis.'+digest[:12],
                  base=int(re.search(r'База (820|900)', filename)[1]), layout=layout,
                  opening='double' if 'Д2' in filename else 'left' if 'отк L' in filename else 'right',
                  frame=frame(model), panels=[], profiles=[], schemes=[], warnings=[],
                  hardware=geometry.purchase(tree), model_elastic=planeinfo(child(child(tree, 'ModelParams'), 'Params')))
    thumb, thumb_size = thumbnail(data)
    (out/'thumbnails'/f'{digest[:12]}.png').write_bytes(thumb)
    record['thumbnail_size'] = thumb_size
    for node, matrix, node_path in walk(model):
        v = vals(node)
        if v.get('Type') == 4002 and v.get('Thick', 0) >= 1:
            panel = geometry.panel(node, matrix, node_path)
            panel['material'] = v.get('Mat')
            panel['elastic'] = planeinfo(child(node, 'Params'))
            # Preserve complete source contours, including Gola notches.
            xy = geometry.poly(v['Contour'])
            panel['world_contour'] = r(np.array([(matrix@[*p, 0, 1])[:3] for p in xy]))
            panel['cuts'] = [{'name':vals(c).get('Name'), 'sign':vals(c).get('Sign')}
                             for c in child(node, 'Cuts')['children']]
            assert all(np.isfinite(panel['lo'])) and min(panel['size']) > 0
            record['panels'].append(panel)
        # Material article is authoritative when an object name contains Goal.
        if v.get('Type') == 2004 and (str(v.get('Mat', '')).split('\r')[-1] == '89731'
                                      or re.fullmatch(r'go(?:la|al)\s+l', v.get('Name', ''), re.I)):
            xy = geometry.poly(v['Contour'])
            record['profiles'].append(dict(name=v['Name'], material=v.get('Mat'),
                bounds=points_bound([(matrix@[*p,z,1])[:3] for p in xy for z in (0,v['Thickness'])]),
                contour_yz=r(np.array([(matrix@[*p,0,1])[1:3] for p in xy]))))
            if 'goal' in v['Name'].lower(): record['warnings'].append('object_name_goal')
        sc = scheme(node)
        if sc:
            primary = vals(child(sc, 'PrimObj'))
            cache_present = bool(child(child(sc,'PrimObj'),'ObjectCache')['value'])
            cache_read = False
            if cache_present:
                cached(sc)
                cache_read = True
            record['schemes'].append(dict(name=vals(sc).get('Name'), holder=v.get('Name'),
                file=primary.get('File'), rules=rules(sc), has_cache=cache_present, cache_read=cache_read))
    record['partitions_y'] = sorted(p['lo'][1] for p in record['panels'] if p['name']=='Перегородка')
    record['niche_heights'] = [round(b-a-18,4) for a,b in zip(record['partitions_y'], record['partitions_y'][1:])]
    record['lower_front_y'] = min(p['lo'][1] for p in record['panels'] if p['name']=='Фасад')
    record['lower_front_top'] = min(p['lo'][1]+p['size'][1] for p in record['panels'] if p['name']=='Фасад')
    record['profile_to_front_gap'] = round(record['profiles'][0]['bounds']['hi'][1]-record['lower_front_top'],4)
    if 'Goal' in filename: record['warnings'].append('filename_goal')
    if abs(record['lower_front_y'] - 101.5) > .01: record['warnings'].append('lower_front_offset')
    assert len(record['profiles'])==1
    assert record['niche_heights'] == ([] if layout=='storage' else [595,380] if 'micro' in layout else [595])
    assert hashlib.sha256(path.read_bytes()).hexdigest()==digest
    return record


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('sources',type=Path)
    ap.add_argument('output',type=Path)
    args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'thumbnails').mkdir(exist_ok=True)
    records=[inspect(p,args.output) for p in sorted(args.sources.glob('*.fr3d'))]
    assert len(set(v['sha256'] for v in records))==len(records)
    groups=collections.defaultdict(dict)
    for v in records: groups[(v['base'],v['layout'])][v['opening']]=v
    comparisons=[]
    for key, pair in groups.items():
        if not {'left','right'}.issubset(pair): continue
        left,right=pair['left'],pair['right']
        changes=[]
        for name in sorted(set(p['name'] for p in left['panels']+right['panels'])):
            a=sorted((p['lo'],p['size']) for p in left['panels'] if p['name']==name)
            b=sorted((p['lo'],p['size']) for p in right['panels'] if p['name']==name)
            if a!=b:changes.append(dict(name=name,left=a,right=b))
        hw=lambda v:sorted((h['name'],str(h['article']),h['quantity']) for h in v['hardware'])
        comparisons.append(dict(base=key[0],layout=key[1],left=left['file'],right=right['file'],
            panel_differences=changes,hardware_equal=hw(left)==hw(right)))
    expected={(base,layout,opening) for base in (820,900)
              for layout in ('storage','door_oven','door_oven_micro','drawer_oven','drawer_oven_micro')
              for opening in (('left','right','double') if layout=='storage' else ('left','right'))}
    missing=sorted(expected-{(v['base'],v['layout'],v['opening']) for v in records})
    report=dict(date='2026-10-27',status='source_review_required',scope='static FR3D audit; no native execution',
                original_files_unchanged=True,count=len(records),missing_for_symmetric_catalogue=missing,
                comparisons=comparisons,records=records)
    (args.output/'source-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(count=len(records),unique_sha256=len(set(v['sha256'] for v in records)),
          profiles=sum(len(v['profiles']) for v in records),parsed_caches=sum(len(v['schemes']) for v in records),
          pairs=len(comparisons),hardware_pairs_equal=sum(v['hardware_equal'] for v in comparisons),missing=missing),ensure_ascii=False))


if __name__=='__main__':main()
