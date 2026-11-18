"""Read the exact BAZIS hardware shipped from the constructor, including drill modes."""
from io import BytesIO
import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np

from scripts import fr3d_reader as fr
from backend.v2.wardrobe_aks import kit_bytes, IMPORTER_NAME

ROOT = Path(__file__).resolve().parents[1] / 'backend' / 'v2'


def test_aks_native_pairs_and_coaxial_spacer_holes(tmp_path):
    catalogue = json.loads((ROOT/'cabinet_assets/planner/aks-wardrobe.json').read_text())
    with zipfile.ZipFile(BytesIO(kit_bytes())) as archive:
        importer = archive.read(IMPORTER_NAME)
        assert importer == (ROOT/'cabinet_assets/planner/bazis-drawers-import.js').read_bytes()
        assert importer == (ROOT.parents[1]/'tools/bazis_import/Martin_Forest_Import_v9_9_8_BLANKS.js').read_bytes()
        assert len(archive.namelist()) == len(set(archive.namelist()))
        with zipfile.ZipFile(ROOT/'wardrobe-aks/MF_AKS_wardrobe.zip') as original:
            for name in original.namelist():
                assert archive.read(name) == original.read(name)

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
            for h,entry,dia,depth,mode in zip(holes,[0,18],[5,5],[18,1],[1,2]):
                point = matrix @ [h['X'],h['Y'],h['Z'],1]
                axis = matrix @ [h['DirX'],h['DirY'],h['DirZ'],0]
                assert np.allclose(point,[entry*sign,0,0,1]) and np.allclose(axis,[sign,0,0,0])
                assert (h['Radius']*2,h['Depth'],h['DrillMode']) == (dia,depth,mode)

            tip = point + axis * holes[-1]['Depth']
            assert np.allclose(tip, [19*sign,0,0,1])
            assert catalogue['joints'][side]['sha'].encode() in importer

        for thickness in (16,25):
            file = f'MF_confirmat_7x50_side_{thickness}.fr3d'
            digest = hashlib.sha256(archive.read('Martin Forest AKS/'+file)).hexdigest()
            assert digest.encode() in importer
            [(_,matrix,holes)] = fasteners({'file':file,'sha':digest})
            for hole,x,depth,dia,mode in zip(holes,[-thickness,0],[thickness,52-thickness],[8,5],[1,2]):
                assert np.allclose(matrix @ [hole['X'],hole['Y'],hole['Z'],1],[x,0,0,1])
                assert np.allclose(matrix @ [hole['DirX'],hole['DirY'],hole['DirZ'],0],[1,0,0,0])
                assert (hole['Depth'],hole['Radius']*2,hole['DrillMode']) == (depth,dia,mode)


def test_shared_guides_use_real_staggered_holes_and_18_mm_fixed_screws(tmp_path):
    catalogue = json.loads((ROOT/'cabinet_assets/planner/aks-wardrobe.json').read_text())
    with zipfile.ZipFile(BytesIO(kit_bytes())) as kit:
        for rail in catalogue['rails'].values():
            native_rows = []
            for side in ('left','right'):
                for variant in ('shared','sharedAlt'):
                    donor=rail[variant][side]
                    path=tmp_path/donor['file']
                    path.write_bytes(kit.read('Martin Forest AKS/'+donor['file']))
                    assert hashlib.sha256(path.read_bytes()).hexdigest()==donor['sha']
                    tree=fr.load(path)
                    defs={fr.vals(d)['FastID']:fr.vals(d) for d in fr.child(tree,'FurnList')['children']}
                    points=[]
                    moving=0
                    for obj,mat,_ in fr.walk(fr.child(tree,'Model')):
                        fields=fr.vals(obj)
                        if obj['key']!='Obj' or fields.get('Type')!=3001:continue
                        definition=defs[fields['FastID']]
                        if '3,5×18' in fields['Name']:
                            assert definition['ParamOffset']==18 and definition['Name']==fields['Name']
                            assert abs(mat[0,3])<.01
                            points.append([round(-mat[2,3],2),round(mat[1,3],2)])
                        elif '20646' in fields['Name']:
                            assert abs(abs(mat[0,3])-13.5)<.01
                            moving+=1
                    assert moving==len(rail['moving'])
                    assert sorted(points)==sorted(donor['fixed'])
                    assert len(points)>=2 and all(p in rail['fixed'] for p in points)
                    if variant=='shared':native_rows.append(points)
            assert all(np.linalg.norm(np.subtract(a,b))>=4 for a in native_rows[0] for b in native_rows[1])
