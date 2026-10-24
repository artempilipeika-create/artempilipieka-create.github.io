from io import BytesIO
import re
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem,Scene,projection
from backend.v2.three_d_document import render


def upper(**patch):
    return dict(item_id='upper',name='Верхний',module_type='wall_cabinet',width=600,height=900,
                depth=317,body_height=900,base='wall',base_height=0,worktop_thickness=0,**patch)


def test_upper_bottom_survives_api_serialization_reopening_and_projection():
    scene=Scene(items=[upper(elevation_mm=1480)])
    saved=scene.model_dump(mode='json');reopened=Scene(**saved)
    assert reopened.items[0].elevation_mm==1480
    assert reopened.items[0].height+reopened.items[0].elevation_mm==2380
    row=dict(project_id='test',name='Кухня',module_type='kitchen',scene=saved,version=2,created_at=None,updated_at=None)
    assert projection(row)['scene']['items'][0]['elevation_mm']==1480
    assert FurnitureItem(**upper()).elevation_mm is None
    assert FurnitureItem(**upper(elevation_mm=None)).elevation_mm is None


@pytest.mark.parametrize('value',[-1,1.5,True,5001])
def test_invalid_bottom_is_rejected(value):
    with pytest.raises(ValidationError):FurnitureItem(**upper(elevation_mm=value))


def test_explicit_upper_top_cannot_pass_ceiling_and_floor_modules_stay_on_floor():
    with pytest.raises(ValidationError,match='выше потолка'):
        Scene(items=[{**upper(elevation_mm=1480),'height':1300,'body_height':1300}])
    assert Scene(items=[{**upper(elevation_mm=1480),'height':1220,'body_height':1220}]).items[0].height==1220
    with pytest.raises(ValidationError,match='только для верхнего'):
        FurnitureItem(**{**upper(elevation_mm=1480),'module_type':'base_cabinet'})


def test_pdf_records_fixed_bottom_and_changed_top_without_a_new_render():
    scene=Scene(items=[upper(elevation_mm=1480)]).model_dump(mode='json')
    pdf=render('Кухня',scene,{})
    text=re.sub(r'\s+',' ',' '.join(p.extract_text() for p in PdfReader(BytesIO(pdf)).pages))
    assert 'низ 1480 мм' in text and 'верх 2380 мм' in text
