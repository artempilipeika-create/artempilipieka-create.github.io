import base64
from io import BytesIO
from copy import deepcopy
import pytest
from PIL import Image
from pypdf import PdfReader
from backend.v2 import kitchen_album, sales_album, sales_render, sales_render_store
from backend.v2.upper_mounting import mounted_items
from backend.v2.album_elevation import validate_geometry, elevations
from backend.v2.three_d_api import Scene

def specimen():
    return {'upperMountingRule':'worktop600','albumSettings':{'order_number':'МФ-125'},'items':[
        dict(item_id='base',name='Нижний',module_type='base_cabinet',width=600,height=820,body_height=720,base_height=100,
             depth=510,base='legs',legHeightMm=100,worktop_thickness=38,countertopThicknessMm=38,x=0,z=0,rotation=0),
        dict(item_id='upper',name='Верхний',module_type='wall_cabinet',width=600,height=720,body_height=720,base_height=0,
             depth=317,base='wall',worktop_thickness=0,x=0,z=-96.5,rotation=0)]}

def test_metadata_never_invalidates_the_paid_photo():
    s=specimen();old=deepcopy(s);old.pop('albumSettings');old.pop('upperMountingRule')
    s['albumSettings']['order_number']='МФ-126'
    assert sales_render_store.scene_key(s)==sales_render_store.scene_key(old)
    s['items'][0]['width']=700
    assert sales_render_store.scene_key(s)!=sales_render_store.scene_key(old)

def test_paid_jpeg_is_preserved_byte_for_byte_and_full_size_on_the_cover():
    data=BytesIO();Image.new('RGB',(2048,1440),'#e8e2d6').save(data,'JPEG',quality=100);jpeg=data.getvalue()
    assert sales_album.image_bytes('data:image/jpeg;base64,'+base64.b64encode(jpeg).decode())==jpeg
    s=specimen();s['items']=mounted_items(s['items'])
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня для Анны',s,{},jpeg)))
    assert pdf.pages[0].extract_text().splitlines()==['MARTIN FOREST','ЗАКАЗ № МФ-125','Кухня для Анны']
    assert len(pdf.pages[0].images)==1 and len(pdf.pages[1].images)==0
    assert pdf.pages[0].images[0].image.size==(2048,1440)
    assert pdf.pages[0].images[0].data==jpeg
    assert 'ФАРТУК 600 мм' in pdf.pages[1].extract_text()

def test_upper_mounting_survives_save_and_reopen_and_ignores_ceiling_height():
    for leg in (80,100,150):
        s=specimen();s['items'][0].update(height=720+leg,base_height=leg,legHeightMm=leg)
        for ceiling in (2400,2700,3100):
            s['room']={'height':ceiling};opened=Scene(**s);reopened=Scene(**opened.model_dump(mode='json'))
            assert reopened.items[1].elevation_mm==720+leg+38+600
            assert reopened.albumSettings.order_number=='МФ-125'
    s=specimen();s['room']={'height':2100}
    with pytest.raises(ValueError,match='выше потолка'):Scene(**s)

def test_geometry_must_match_the_saved_source_and_dimensions():
    s=specimen();geometry=[{**{k:it[k] for k in ('item_id','width','height','depth')},'source_sha256':None,
                          'detail':'parametric','shapes':[{'x':-300,'y':100,'w':18,'h':720}]} for it in s['items']]
    assert len(validate_geometry(s['items'],geometry))==2
    geometry[0]['width']=700
    with pytest.raises(ValueError,match='Размеры'):validate_geometry(s['items'],geometry)
    geometry[0]['width']=600;geometry[0]['source_sha256']='different'
    with pytest.raises(ValueError,match='Размеры'):validate_geometry(s['items'],geometry)

def test_new_render_settings_are_high_quality_and_single_image(monkeypatch):
    monkeypatch.setenv('MF_IMAGE_MODEL','gpt-image-2.5-sunburst')
    assert sales_render.render_settings()==dict(model='gpt-image-2.5-sunburst',quality='xhigh',size='2048x1440',output_format='jpeg',output_compression='100')
    monkeypatch.setenv('MF_IMAGE_MODEL','gpt-image-2')
    assert sales_render.render_settings()['quality']=='high'

def test_corner_and_island_get_separate_actual_front_views():
    s=specimen();s['items']+=[{**s['items'][0],'item_id':'corner','rotation':90,'x':1000},
                            {**s['items'][0],'item_id':'island','z':1600}]
    views=elevations(s['items']);assert len(views)==3
    assert sorted(e['number'] for g in views for e in g['items'])==[1,2,3,4]


def test_elevation_module_is_served_with_the_constructor_assets():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    app=FastAPI();app.include_router(router());client=TestClient(app)
    r=client.get('/account/planner/album-geometry.mjs')
    assert r.status_code==200 and 'export function albumGeometry' in r.text
    assert '20261029-approved-album' in client.get('/constructor').text
