"""Exact decor attachments and saved part identities, without database mutation."""
import hashlib
from uuid import uuid4
import pytest
from pydantic import ValidationError
from backend.v2.material_visuals import ROOT,manifest,visual_metadata
from backend.v2.catalogue_model import safe_item
from backend.v2.three_d_api import FurnitureItem

@pytest.mark.parametrize('article',['W1000 ST9','U999 ST7','U708 ST9','H1180 ST37'])
def test_exact_existing_decor_has_verified_local_image(article):
    item=dict(kind='material',variant_id=str(uuid4()),material_id=str(uuid4()),article=article,name='ЛДСП EGGER 18мм '+article,manufacturer=None,thickness=18,price=999)
    out=safe_item(item,'release');v=out['visual'];record=manifest()['decors'][article]
    assert out['variant_id']==item['variant_id'] and out['material_id']==item['material_id']
    assert out['article']==article and out['thickness']==18 and 'price' not in out
    assert v['texture_url']=='/account/planner/materials/'+record['asset']
    data=(ROOT/record['asset']).read_bytes();assert data.startswith(b'\xff\xd8')
    assert hashlib.sha256(data).hexdigest()==record['sha256']
    assert v['texture_size_mm']==[1300,2800] and v['source_url'].startswith('https://www.egger.com/')

@pytest.mark.parametrize('article,name,manufacturer',[
    ('W1000','EGGER','EGGER'),('W1000 ST9','Other board','OTHER'),('W1000 ST9','Unknown',None),('brown oak','EGGER brown oak','EGGER')])
def test_unverified_material_does_not_receive_a_guessed_decor(article,name,manufacturer):
    assert visual_metadata(dict(article=article,name=name,manufacturer=manufacturer)) is None

def test_explicit_variant_metadata_wins_and_unknown_fields_are_not_exposed():
    item=dict(kind='material',article='W1000 ST9',manufacturer='EGGER',visual={'preview_url':'/actual.png','render_color':'#123456','private_token':'hidden'})
    assert safe_item(item,'r')['visual']=={'preview_url':'/actual.png','render_color':'#123456'}
    assert visual_metadata({'renderColor':'#222222','renderTexture':'/real.jpg'})=={'render_color':'#222222','texture_url':'/real.jpg'}

def test_back_and_part_material_ids_roundtrip_without_display_state():
    uid=str(uuid4());item=dict(item_id='a',name='Д1 L',width=600,height=820,depth=510,back_variant_id=uid,part_materials={'shelf-1':uid})
    saved=FurnitureItem.model_validate(item).model_dump(mode='json')
    assert saved['part_materials']=={'shelf-1':uid} and saved['back_variant_id']==uid
    assert FurnitureItem.model_validate(saved).model_dump(mode='json')==saved
    with pytest.raises(ValidationError):FurnitureItem.model_validate({**item,'display_mode':'inspection'})
    with pytest.raises(ValidationError):FurnitureItem.model_validate({**item,'part_materials':{'../bad':uid}})
