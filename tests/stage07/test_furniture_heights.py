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

@pytest.mark.parametrize('leg',[80,100,150])
def test_kitchen_parameters_roundtrip_without_body_stretch(leg):
    from uuid import uuid4
    data=item(body_height=720,base_height=leg,worktop_thickness=38,legHeightMm=leg,rearServiceGapMm=60,
              plinthMaterialId=uuid4(),countertopMaterialId=uuid4(),countertopDepthMm=600,countertopStockLengthMm=4100,countertopThicknessMm=38)
    data['height']=720+leg
    cabinet=FurnitureItem(**data)
    assert FurnitureItem.model_validate_json(cabinet.model_dump_json())==cabinet
    assert cabinet.body_height==720 and cabinet.height==720+leg

@pytest.mark.parametrize('extra',[{'legHeightMm':120},{'legHeightMm':150,'base_height':100},{'rearServiceGapMm':49},{'rearServiceGapMm':81},{'countertopStockLengthMm':1800},{'countertopThicknessMm':40,'worktop_thickness':38}])
def test_reject_invalid_kitchen_dimensions_or_disagreeing_legacy_aliases(extra):
    with pytest.raises(ValidationError):FurnitureItem(**item(**extra))
