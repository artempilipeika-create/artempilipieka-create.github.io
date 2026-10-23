import pytest
from pydantic import ValidationError
from backend.v2.three_d_room import Room,feature_box

def features(wall='a',face='front',count=4):
    shaft=dict(id='shaft',kind='shaft',wall=wall,offset=900,elevation=0,width=600,height=2700,projection=350)
    socket=dict(id='socket',kind='socket',wall=wall,offset=25,elevation=1100,width=86+71*(count-1),height=86,projection=12,mount_id='shaft',mount_face=face,socket_count=count)
    return [shaft,socket]

@pytest.mark.parametrize('wall',list('abcd'))
@pytest.mark.parametrize('face',['front','start','end'])
@pytest.mark.parametrize('count',[1,2,3,4])
def test_mounted_blocks_roundtrip_and_touch_solid(wall,face,count):
    room=Room(width=4200,depth=3200,height=2700,features=features(wall,face,count))
    restored=Room.model_validate_json(room.model_dump_json());shaft,socket=restored.features
    assert socket.socket_count==count and socket.mount_id=='shaft' and socket.mount_face==face
    x,y,z,w,h,d=feature_box(socket,restored,shaft);sx,sy,sz,sw,sh,sd=feature_box(shaft,restored)
    assert y-h/2==1100
    assert abs(x-sx)>=(w+sw)/2-.001 or abs(z-sz)>=(d+sd)/2-.001

@pytest.mark.parametrize('changes',[{'mount_id':'missing'},{'mount_id':'socket'},{'mount_face':'back'},{'socket_count':0},{'socket_count':5},{'socket_count':2.5},{'offset':500},{'elevation':2650},{'mount_id':None}])
def test_invalid_mount_or_count_rejected(changes):
    fs=features();fs[1].update(changes)
    if changes.get('mount_id','unset') is None:fs[1]['offset']=1000
    with pytest.raises(ValidationError):Room(width=4200,depth=3200,height=2700,features=fs)

def test_outer_corner_has_no_room_for_socket_on_hidden_side():
    fs=features(face='start');fs[0]['offset']=0
    with pytest.raises(ValidationError,match='outside room'):Room(width=4200,depth=3200,height=2700,features=fs)

def test_non_socket_cannot_mount_on_itself():
    fs=features();fs[0]['mount_id']='shaft'
    with pytest.raises(ValidationError,match='only to sockets'):Room(features=fs)
