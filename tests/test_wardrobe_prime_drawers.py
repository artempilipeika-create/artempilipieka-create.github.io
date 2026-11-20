from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json

import pytest

from backend.v2.three_d_document import hardware_for
from backend.v2.wardrobe_aks import kit_bytes, IMPORTER_NAME
from scripts import fr3d_reader as fr

ROOT=Path(__file__).resolve().parents[1]/'backend/v2'
CATALOGUE=json.loads((ROOT/'cabinet_assets/planner/wardrobe-prime.json').read_text())


@pytest.mark.parametrize('mode,articles',[
    ('soft',[113641,113643,113645,113647,113650,113652]),
    ('push',[113654,113657,113661,113663,113665,113667])])
def test_one_exact_purchase_item_per_installed_pair(mode,articles,tmp_path):
    with ZipFile(BytesIO(kit_bytes())) as bundle:
        importer=bundle.read(IMPORTER_NAME).decode()
        for length,article in zip(range(300,551,50),map(str,articles)):
            part=CATALOGUE[mode][str(length)]
            raw=bundle.read('Martin Forest AKS/'+part['file'])
            assert sha256(raw).hexdigest()==part['sha'] and part['sha'] in importer
            source=tmp_path/part['file']
            source.write_bytes(raw)
            nodes=[fr.vals(n) for n,_,_ in fr.walk(fr.child(fr.load(source),'Model'))]
            assert [n['Name'].split('\r')[-1] for n in nodes if n.get('Type')==4001]==[article]
            assert sum(n.get('Type')==2004 for n in nodes)==int(mode=='push')
            for fixing in ['cam','plank']:
                bank={'kind':'external','railFamily':'concealed','opening':mode,'faceFixing':fixing,'faces':[{'height':197}]}
                meta={'group_id':'qa','spec':{'depth':length+5,'drawerBanks':[bank]}}
                board={'module_type':'blank','assistant_carcass':meta}
                floor,_=hardware_for({**board,'item_id':'qa:drawer-0-0-bottom','width':551,'depth':length-10})
                face,_=hardware_for({**board,'item_id':'qa:drawer-0-0-face'})
                assert [r['article'] for r in [*floor,*face] if r['unit']=='set']==[article]
                assert sum(r['qty'] for r in floor if r['article']=='12867')==(3 if fixing=='plank' else 0)
                assert sum(r['qty'] for r in floor if r['article']=='114679')==int(mode=='push')
                assert next(r['qty'] for r in floor if r['name'].startswith('Эксцентрик'))==(10 if fixing=='cam' else 4)
