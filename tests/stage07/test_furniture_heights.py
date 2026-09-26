"""Saved v2 JSON remains readable; inconsistent dimensions cannot be persisted."""
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem

def item(**changes):
    return dict(item_id='test',name='Cabinet',module_type='base_cabinet',width=600,height=820,depth=560,base='plinth',**changes)

def test_explicit_dimensions_roundtrip_and_old_payload_stays_accepted():
    old=FurnitureItem(**item());assert old.height==820 and old.body_height is None
    new=FurnitureItem(**item(body_height=720,base_height=100,worktop_thickness=38))
    assert FurnitureItem.model_validate_json(new.model_dump_json())==new
    assert new.height==820

@pytest.mark.parametrize('changes',[{'body_height':758,'base_height':100,'worktop_thickness':38},{'base_height':-1},{'worktop_thickness':101}])
def test_reject_inconsistent_heights(changes):
    with pytest.raises(ValidationError):FurnitureItem(**item(**changes))

def test_no_worktop_on_upper_or_tall_cabinet():
    for kind in ('wall_cabinet','tall_cabinet'):
        values=item(worktop_thickness=38);values['module_type']=kind
        with pytest.raises(ValidationError):FurnitureItem(**values)
