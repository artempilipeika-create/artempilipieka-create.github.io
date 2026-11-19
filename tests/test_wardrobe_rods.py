from base64 import b64encode
from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile
import pytest
from pydantic import ValidationError
from backend.v2.assistant_model import CarcassDesign, ROD_CATALOGUE
from backend.v2.three_d_document import hardware_for
from backend.v2.wardrobe_aks import kit_bytes, IMPORTER_NAME


def test_rods_roundtrip_purchase_and_native_sources(monkeypatch):
    spec = dict(recipe='divided', width=1400, height=2100, depth=499, thickness=18,
                shelves=1, sections=2, sectionShelves=[0,1], back=True, elevation=120,
                shelfSetback=1, shelfGap=0, edgeThickness=1, edgePolicy='front', clearLayout=True)
    rods = [dict(id='a', article='72536', section=0, level=0, anchor='top', offset=100),
            dict(id='b', article='14066', section=1, level=1, anchor='bottom', offset=400)]
    saved = CarcassDesign(**spec, rods=rods).model_dump()
    assert saved['rods'] == rods
    rows=[]
    for panel in ['left','top','right','divider-0']:
        items,_ = hardware_for(dict(module_type='blank', item_id='cab:'+panel,
                                    assistant_carcass=dict(group_id='cab',spec=saved)))
        rows.extend(i for i in items if i['article'] in ROD_CATALOGUE)
    assert [(r['qty'],r['unit'],r['article']) for r in rows] == [(1,'set','72536'),(1,'set','14066')]
    with pytest.raises(ValidationError):
        CarcassDesign(**spec, rods=[{**rods[1],'level':2}])
    # Isolated CI uses fixture bytes. Deployment QA verifies the same path against the real source hashes.
    import backend.v2.wardrobe_aks as kits
    standins={article:('fixture-'+article).encode() for article in ROD_CATALOGUE}
    monkeypatch.setattr(kits,'ROD_CATALOGUE',{article:{**v,'sha':sha256(standins[article]).hexdigest()}
                                             for article,v in ROD_CATALOGUE.items()})
    for article,data in standins.items():
        monkeypatch.setenv('MF_WARDROBE_ROD_'+article+'_FR3D',b64encode(data).decode())
    pack=kit_bytes.__wrapped__
    with ZipFile(BytesIO(pack(rods_required=True))) as archive:
        assert IMPORTER_NAME in archive.namelist() and len(ROD_CATALOGUE)==7
        for article,product in ROD_CATALOGUE.items():
            path='Martin Forest AKS/'+product['file']
            assert archive.namelist().count(path)==1 and archive.read(path)==standins[article]
    monkeypatch.delenv('MF_WARDROBE_ROD_14066_FR3D')
    with pytest.raises(ValueError,match='неполон'):
        pack(rods_required=True)
