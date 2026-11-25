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
    assert '/account/planner/bridge.js?' in client.get('/constructor').text
    entry=client.get('/account/3d.js').text
    assert '/account/planner/kitchen-album-ui.mjs?' in entry
    assert '/account/planner/album-geometry.mjs?' in entry


def test_two_section_wardrobe_pdf_before_and_after_photo():
    from backend.v2.album_elevation import dimension_entries
    def panel(key,axis,x,y,w,h):
        return dict(item_id=key, module_type='blank', blank_axis=axis, name=key,
                    width=w,height=h,depth=340,x=x,z=0,elevation_mm=y,
                    assistant_carcass={'group_id':'cabinet'})
    items=[panel('left','side',9,0,18,2200),panel('right','side',791,0,18,2200),
           panel('divider','side',400,18,18,2164),panel('HDF','back',400,1,798,2198),
           panel('top','horizontal',400,2182,764,18),panel('bottom','horizontal',400,0,764,18)]
    items.extend(panel('shelf'+str(i),'horizontal',x,y,w,h)
                 for i,(x,y,w,h) in enumerate([(204.5,680,371,6),(204.5,1400,371,6),
                                                (595.5,480,373,18),(595.5,960,373,18),(595.5,1440,373,18)]))
    group,=elevations(items)
    assert [e['bottom'] for e in group['items']]==[it['elevation_mm'] for it in items]
    assert dimension_entries(group['items'])=={(0,800)}
    jpeg=BytesIO();Image.new('RGB',(24,18),'ivory').save(jpeg,'JPEG')
    for photo in (False,True):
        data=kitchen_album.render('Шкаф-1',{'items':items},{},jpeg.getvalue(),photo=photo)
        pdf=PdfReader(BytesIO(data));drawing=pdf.pages[1].extract_text()
        assert '2200' in drawing and '800' in drawing
        assert 'Контур' not in drawing
        assert 'shelf4' in ''.join(p.extract_text() for p in pdf.pages[2:])


@pytest.mark.parametrize('rotation', [0,90,180,270])
def test_wardrobe_section_levels_and_depth_use_saved_finished_faces(rotation):
    from backend.v2.album_wardrobe import drawing_sets,profile
    from math import cos,sin,radians
    def panel(key,axis,x,z,y,w,h,d):
        c,s=round(cos(radians(rotation))),round(sin(radians(rotation)))
        return dict(item_id='q:'+key,name='Шкаф ИИ · '+key,module_type='blank',
                    blank_axis=axis,width=w,height=h,depth=d,x=400+x*c-z*s,
                    z=500+x*s+z*c,elevation_mm=y,rotation=rotation,
                    assistant_carcass={'group_id':'q','spec':{'recipe':'divided','sections':2}})
    items=[panel('left','side',-391,0,80,18,2200,340),panel('right','side',391,0,80,18,2200,340),
           panel('back','back',0,-171.5,81,798,2198,3),panel('top','horizontal',0,0,2262,764,18,340),
           panel('shelf-0-0','horizontal',-190,-10,760,370,6,320),
           panel('shelf-1-0','horizontal',190,-10,560,373,18,320)]
    assert drawing_sets(specimen()['items'])==[None]
    assert drawing_sets(items)==[items]
    assert drawing_sets(items+specimen()['items'])==[None,items]
    blocks,levels=profile(items)
    assert levels==[[766],[578]]
    assert max(z+d for _,z,_,_,d,_,_ in blocks)-min(p[1] for p in blocks)==343
    buf=BytesIO();Image.new('RGB',(12,8)).save(buf,'JPEG')
    pages=PdfReader(BytesIO(kitchen_album.render('Шкаф',{'items':items},{},buf.getvalue()))).pages
    text=pages[1].extract_text()
    assert all(t in text for t in ('Вид сбоку','Сек. 2','343','766','578','2200','800','Шаг','1514','1702'))


def test_standard_wardrobe_uses_enabled_shelf_top_above_base_and_floor():
    from backend.v2.album_wardrobe import profile,drawing_sets
    item=dict(item_id='w',module_type='wardrobe',name='Шкаф',width=600,height=2000,depth=340,
              base='legs',base_height=100,elevation_mm=50,
              shelves=[dict(offset_mm=400,thickness=18),dict(offset_mm=320,thickness=6,enabled=False)])
    assert drawing_sets([item])==[[item]]
    assert profile([item])[1]==[[559]]

@pytest.mark.parametrize('backdrop,light_text',[(250,False),(20,True)])
def test_price_is_one_regular_line_in_the_lower_right_and_keeps_the_drawings(backdrop, light_text):
    name = 'Щ' * 200
    scene = specimen()
    scene['albumSettings']['order_number'] = 'W' * 60
    price = dict(total=2005.51, complete=False, missing=24, groups={})
    # The original photograph stays intact under the line, including in the printed crop.
    picture = BytesIO()
    Image.new('RGB',(320,180),(backdrop,)*3).save(picture,'JPEG')
    doc = kitchen_album.render(name, scene, {}, picture.getvalue(), include_hardware=True, price=price)
    pdf = PdfReader(BytesIO(doc))
    page = pdf.pages[0]
    caption = 'Стоимость заказа — 2 005,51 BYN'
    runs = []
    def visit(text, cm, tm, font, size):
        if caption in text:
            runs.append((text.strip(),tm[4],tm[5],font['/BaseFont'],size))
    cover = page.extract_text(visitor_text=visit)
    assert name in ''.join(cover.split()) and 'W' * 60 in cover
    assert len(runs)==1 and runs[0][0]==caption
    _,x,y,font,size=runs[0]
    assert x>kitchen_album.W/2 and 0<y<kitchen_album.H*.1 and 'Bold' not in font and size<=12
    ops=page.get_contents().operations
    assert any(op==b'w' and values==[.5] for values,op in ops)
    assert all(op not in (b'f',b'f*',b'B',b'B*') for values,op in ops)
    color=next(values for values,op in reversed(ops) if op==b'rg')
    assert color[0]==color[1]==color[2] and (color[0]>.5)==light_text
    assert next(iter(page['/Resources']['/XObject'].values())).get_object().get_data()==picture.getvalue()
    assert 'Вид спереди' in pdf.pages[1].extract_text()
    assert 'Фурнитура по модулям' in pdf.pages[2].extract_text()
    assert 'Материалы и характер' in pdf.pages[-2].extract_text()
    assert 'Состав кухни' in pdf.pages[-1].extract_text() and caption in pdf.pages[-1].extract_text()
    assert all('Рассчитанная часть' not in pg.extract_text() for pg in pdf.pages)
