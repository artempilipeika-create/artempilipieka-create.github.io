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
    planes=fr.planeinfo(fr.child(fr.child(tree,'ModelParams'),'Params'))
    expected_planes={'Left':{0:55,1:845},'Right':{0:55,1:845},'End':{1:795,2:55},'Ceiling':{0:845,1:65}}
    assert {p['Axis']:p['Pos'] for p in planes}==expected_planes[name]
    assert all(p['Weight']==1 for p in planes)
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
    key={'Left':'trim-right-face','Right':'trim-left-face','End':'trim-right-end','Ceiling':'trim-cap-face'}[name]
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


@pytest.mark.parametrize('cabinet_side,source', [('left','Right'),('right','Left')])
def test_return_and_native_bores_follow_the_cabinet_edge_after_width_resize(tmp_path,cabinet_side,source):
    path=tmp_path/f'MF_Trim_{source}.fr3d'
    with ZipFile(BytesIO(kit_bytes())) as kit:
        path.write_bytes(kit.read('Martin Forest AKS/'+path.name))
    tree=fr.load(path)
    definitions={fr.vals(n)['FastID']:n for n in fr.child(tree,'FurnList')['children']}
    model=fr.child(tree,'Model')
    planes=fr.planeinfo(fr.child(fr.child(tree,'ModelParams'),'Params'))
    plane=next(p['Pos'] for p in planes if p['Axis']==0)
    stock=fr.frame(model)['size'][0]
    for width in (40,100,125,1200):
        def resized(x):
            return x+(width-stock if x>plane else 0)
        low=width-18 if cabinet_side=='left' else 0
        high=low+18
        bores=Counter()
        for node,matrix,at in fr.walk(model):
            obj=fr.vals(node)
            if obj.get('Name')=='Боковая Проставка':
                bounds=fr.panelinfo(node,matrix,at)['bounds']
                assert [resized(bounds[k][0]) for k in ('lo','hi')]==pytest.approx([low,high])
            if obj.get('Type')!=3001:
                continue
            for hole in fr.child(definitions[obj['FastID']],'Holes')['children']:
                h=fr.vals(hole)
                x=(matrix@[h['X'],h['Y'],h['Z'],1])[0]
                dx=(matrix[:3,:3]@[h['DirX'],h['DirY'],h['DirZ']])[0]
                diameter=round(h['Radius']*2)
                start=resized(x)
                assert start==pytest.approx(high if diameter==15 else low+9)
                assert low-1e-6<=start+dx*h['Depth']<=high+1e-6
                bores[diameter]+=1
        assert bores=={5:3,8:9,15:3}


def test_web_schedule_uses_the_native_two_end_offsets_and_explicit_intervals():
    for length,expected in [(100,1),(300,1),(301,2),(800,2),(801,3),(1400,3),(1401,4),(2001,5),(2600,5),(2800,None)]:
        panel={'item_id':'a:trim-left-face','module_type':'blank','blank_axis':'back','height':length,
               'assistant_carcass':{'group_id':'a','spec':{'surround':{'left':{'kind':'filler'}}}}}
        rows,note=_panel_hardware(panel)
        if expected is None:
            assert not rows and '2800' in note and '39319' in note
        else:
            assert [r['qty'] for r in rows]==[expected,expected]


def test_schedule_counts_each_side_segment_once_at_its_own_length():
    from backend.v2.three_d_document import hardware_for

    quantities=Counter()
    for owner in ('first','second'):
        for side in ('left','right'):
            for number,length in enumerate((100,800.25,400.25),1):
                key='trim-'+side+('' if number==1 else '-'+str(number))
                for role in ('face','return') if side=='left' else ('end',):
                    panel={'item_id':f'{owner}:{key}-{role}','module_type':'blank','height':length,
                           'blank_axis':'back' if role=='face' else 'side',
                           'assistant_carcass':{'group_id':owner,'spec':{'surround':{'left':{'kind':'filler'},'right':{'kind':'end'}}}}}
                    rows,_=hardware_for(panel)
                    expected=(1,3,2)[number-1] if role=='face' else 0
                    assert [(r['article'],r['qty']) for r in rows]==([('',expected),('39319',expected)] if expected else [])
                    for row in rows:
                        quantities[row['article']]+=row['qty']
    assert quantities=={'':12,'39319':12}


@pytest.mark.parametrize('hand',['Left','Right'])
def test_shortest_segment_accommodates_every_boring_in_a_native_cam_and_dowel_pair(tmp_path,hand):
    path=tmp_path/('MF_Trim_'+hand+'.fr3d')
    with ZipFile(BytesIO(kit_bytes())) as kit:
        path.write_bytes(kit.read('Martin Forest AKS/'+path.name))
    tree=fr.load(path)
    definitions={fr.vals(n)['FastID']:n for n in fr.child(tree,'FurnList')['children']}
    by_fitting={'cam':[],'dowel':[]}
    for native,matrix,_ in fr.walk(fr.child(tree,'Model')):
        obj=fr.vals(native)
        if obj.get('Type')!=3001:
            continue
        bore_bounds=[]
        for hole in fr.child(definitions[obj['FastID']],'Holes')['children']:
            h=fr.vals(hole)
            y=(matrix@[h['X'],h['Y'],h['Z'],1])[1]
            dy=(matrix[:3,:3]@[h['DirX'],h['DirY'],h['DirZ']])[1]
            assert dy==pytest.approx(0,abs=1e-6)
            bore_bounds.append((y-h['Radius'],y+h['Radius']))
        kind='dowel' if '39319' in obj['Name'] else 'cam'
        by_fitting[kind].append((y,bore_bounds))
    cam=min(by_fitting['cam'],key=lambda v:v[0])
    dowel=min(by_fitting['dowel'],key=lambda v:v[0])
    spacing=dowel[0]-cam[0]
    assert spacing==pytest.approx(32)
    # At a 100 mm joint the native symmetric scheme has one central main
    # fastener. Translate its measured shop drilling to that axis and check
    # all five bores, including the +/-32 mm companion on either end.
    shift=50-cam[0]
    for low,high in cam[1]+dowel[1]:
        assert low+shift>0 and high+shift<100
    assert min(100-high-shift for _,high in dowel[1])==pytest.approx(14)
