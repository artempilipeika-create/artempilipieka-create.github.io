"""Half-millimetre Gola facade clearance survives save, reopen and production notes."""
import pytest
from pydantic import ValidationError
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_gola import VARIANTS as GOLA
from backend.v2.three_d_pullout_dryers import VARIANTS as DRYERS
from backend.v2.three_d_accessories import BY_ID
from backend.v2.three_d_document import module_contents

VARIANTS=[*GOLA,*(v for v in DRYERS if v['execution']=='gola'),*(v for v in BY_ID.values() if v['variant']=='gola')]
def item(v,**patch):
 return dict(item_id=v['id'],name='Gola',module_type='base_cabinet',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=600,height=820,depth=510,body_height=720,base_height=100,base='legs',x=0,z=21.5,rotation=0,**patch)

@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['id'])
def test_gola_clearance_save_reopen_and_notes(v):
 saved=FurnitureItem(**item(v,rearServiceGapMm=71.5,countertopDepthMm=600))
 reopened=FurnitureItem.model_validate_json(saved.model_dump_json())
 assert reopened.rearServiceGapMm==71.5 and reopened.z==21.5
 assert reopened.bazis_sha256==v['source_sha256']
 assert '0,5 мм' in module_contents(reopened.model_dump())
 with pytest.raises(ValidationError):FurnitureItem(**item(v,rearServiceGapMm=50))
 with pytest.raises(ValidationError):FurnitureItem(**item(v,rearServiceGapMm=71.25))

def test_ordinary_module_keeps_fifty_mm_service_gap():
 v=next(v for v in BY_ID.values() if v['variant']!='gola')
 assert FurnitureItem(**item(v,rearServiceGapMm=50)).rearServiceGapMm==50
 with pytest.raises(ValidationError):FurnitureItem(**item(v,rearServiceGapMm=71.5))
