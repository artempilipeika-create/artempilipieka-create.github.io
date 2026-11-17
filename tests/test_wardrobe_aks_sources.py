"""Read the exact BAZIS hardware shipped from the constructor, including drill modes."""
import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np

from scripts import fr3d_reader as fr

ROOT = Path(__file__).resolve().parents[1] / 'backend' / 'v2'


def test_aks_native_pairs_and_coaxial_spacer_holes(tmp_path):
    catalogue = json.loads((ROOT/'cabinet_assets/planner/aks-wardrobe.json').read_text())
    with zipfile.ZipFile(ROOT/'wardrobe-aks/MF_AKS_wardrobe.zip') as archive:
        def fasteners(source):
            data = archive.read('Martin Forest AKS/'+source['file'])
            assert hashlib.sha256(data).hexdigest() == source['sha']
            path = tmp_path/source['file']
            path.write_bytes(data)
            tree = fr.load(path)
            definitions = {fr.vals(d)['FastID']: d for d in fr.child(tree,'FurnList')['children']}
            for obj, matrix, _ in fr.walk(fr.child(tree,'Model')):
                if obj['key'] != 'Obj' or fr.vals(obj).get('Type') != 3001:
                    continue
                definition = definitions[fr.vals(obj)['FastID']]
                yield fr.vals(obj)['Name'], matrix, [fr.vals(h) for h in fr.child(definition,'Holes')['children']]

        for rail in catalogue['rails'].values():
            for side,sign in [('left',1),('right',-1)]:
                objects = list(fasteners(rail[side]))
                assert sum(name.startswith('Направляющая') for name,_,_ in objects) == 1
                actual = []
                for name,matrix,holes in objects:
                    if '20646' in name:
                        assert len(holes) == 1
                        h = holes[0]
                        assert (h['Radius']*2, h['Depth']) == (3,3)
                        actual.append(tuple(np.round(matrix[:3,3],3)))
                expected = [(0,y,-z) for z,y in rail['fixed']]
                expected += [(13.5*sign,y,-z) for z,y in rail['moving']]
                assert sorted(actual) == sorted(expected)
        for side,sign in [('spacerLeft',-1),('spacerRight',1)]:
            [(name,matrix,holes)] = fasteners(catalogue['joints'][side])
            assert '12867' in name and len(holes) == 2
            for h,entry,dia,depth,mode in zip(holes,[0,18],[5,3.5],[18,5],[1,2]):
                point = matrix @ [h['X'],h['Y'],h['Z'],1]
                axis = matrix @ [h['DirX'],h['DirY'],h['DirZ'],0]
                assert np.allclose(point,[entry*sign,0,0,1]) and np.allclose(axis,[sign,0,0,0])
                assert (h['Radius']*2,h['Depth'],h['DrillMode']) == (dia,depth,mode)
