from collections import Counter
from hashlib import sha256
from io import BytesIO
from zipfile import ZipFile

import pytest

from backend.v2.three_d_document import _panel_hardware
from backend.v2.wardrobe_aks import kit_bytes
from scripts import fr3d_reader as fr


@pytest.mark.parametrize('name,pin,panels', [
    ('Left','30be270bbfac56f50a29e10319db4d64a03afe46e58abca0b46d265458078dd1',2),
    ('Right','6021bf08e71f565041b181a01e3b8db350e1d1fa767f5fc26665aef391918604',2),
    ('End','2fb535965b6a2cdd48a5061256dc72f45ea8e09c73645833049150ee0b293eec',1),
    ('Ceiling','1593b2bf163f12120e40c96b9feca7ff7a035da5ba5b67f96f197b97aaf7f5a9',3),
])
def test_downloadable_trim_retains_the_workshop_boards_joints_and_drilling(tmp_path,name,pin,panels):
    path=tmp_path/('MF_Trim_'+name+'.fr3d')
    with ZipFile(BytesIO(kit_bytes())) as kit:
        data=kit.read('Martin Forest AKS/'+path.name)
    assert sha256(data).hexdigest()==pin
    path.write_bytes(data)
    tree=fr.load(path)
    definitions={fr.vals(n)['FastID']:n for n in fr.child(tree,'FurnList')['children']}
    model=fr.child(tree,'Model')
    boards=[n for n in model['children'] if fr.vals(n).get('Type')==4002]
    assert len(boards)==panels and all(fr.vals(n)['Thick']==18 for n in boards)
    parts=Counter()
    drilling=Counter()
    for native,_,_ in fr.walk(model):
        obj=fr.vals(native)
        if obj.get('Type')!=3001:
            continue
        parts[obj['Name'].split('\r')[-1]]+=1
        for hole in fr.child(definitions[obj['FastID']],'Holes')['children']:
            h=fr.vals(hole)
            drilling[(h['Radius']*2,h['Depth'])]+=1
    key={'Left':'trim-left-face','Right':'trim-right-face','End':'trim-right-end','Ceiling':'trim-cap-face'}[name]
    scene={'item_id':'a:'+key,'module_type':'blank','blank_axis':'side' if name=='End' else 'back',
           'width':1000 if name=='Ceiling' else 100,'height':100 if name=='Ceiling' else 1000,
           'assistant_carcass':{'group_id':'a','spec':{'surround':{'cap':{'height':100}}}}}
    rows,_=_panel_hardware(scene)
    if name=='End':
        assert not parts and not rows and not drilling
    else:
        assert parts=={'Эксцентриковая стяжка 18мм':3,'39319':3}
        assert dict(drilling)=={(8,34):3,(15,13):3,(5,13):3,(8,25):3,(8,13):3}
        assert [(r['article'],r['qty']) for r in rows]==[('',3),('39319',3)]
        for secondary in (['trim-cap-base','trim-cap-upright'] if name=='Ceiling' else [key.replace('face','return')]):
            assert not _panel_hardware({**scene,'item_id':'a:'+secondary})[0]


def test_web_schedule_uses_the_native_two_end_offsets_and_explicit_intervals():
    for length,expected in [(100,1),(300,1),(301,2),(800,2),(801,3),(1400,3),(1401,4),(2001,5),(2600,5),(2800,None)]:
        panel={'item_id':'a:trim-left-face','module_type':'blank','blank_axis':'back','height':length,
               'assistant_carcass':{'group_id':'a','spec':{'surround':{'left':{'kind':'filler'}}}}}
        rows,note=_panel_hardware(panel)
        if expected is None:
            assert not rows and '2800' in note and '39319' in note
        else:
            assert [r['qty'] for r in rows]==[expected,expected]
