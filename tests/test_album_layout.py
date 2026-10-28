from copy import deepcopy
from io import BytesIO
import pytest
from pypdf import PdfReader
from backend.v2 import album_layout, kitchen_album
from tests.test_kitchen_album import image


def item(**values):
    return dict(name='НШД-600', module_type='base_cabinet', width=600, height=820,
                depth=510, x=0, z=0, rotation=0, **values)


def test_plan_rotation_and_fractional_saved_dimensions():
    it=item();it.update(rotation=90,x=900.25,z=-300.5,depth=560.5)
    expected=[(1180.5,-600.5),(1180.5,-.5),(620,-.5),(620,-600.5)]
    for actual,wanted in zip(album_layout.footprint(it),expected):
        assert actual == pytest.approx(wanted)
    assert album_layout.schedule([it]) == [('1','НШД-600','600 × 820 × 560,5')]


def test_equal_modules_are_grouped_without_losing_plan_numbers_or_original_names():
    a=item();b=item();b['x']=600
    c=item();c['width']=700
    assert album_layout.schedule([a,b,c]) == [
        ('1, 2','НШД-600','600 × 820 × 510'),('3','НШД-600','700 × 820 × 510')]


def test_second_page_is_a_vector_plan_and_schedule_without_any_second_image():
    a=item();b=item();b.update(name='Верхний шкаф',module_type='wall_cabinet',height=720,depth=317)
    scene={'items':[a,b]};original=deepcopy(scene)
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',scene,{},image(),b'not an image')))
    assert len(pdf.pages)==4 and len(pdf.pages[0].images)==1
    assert len(pdf.pages[1].images)==0
    text=pdf.pages[1].extract_text()
    assert all(x in text for x in ['Планировка вашей кухни','НШД-600','600 × 820 × 510',
                                  'Верхний шкаф','600 × 720 × 317','Напольные модули','Верхние шкафы'])
    assert 'Второй ракурс' not in text and scene==original


def test_missing_dimensions_are_explicit_and_are_not_invented():
    assert album_layout.footprint({}) is None
    assert album_layout.schedule([{}]) == [('1','Модуль','не задано × не задано × не задано')]
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',{'items':[{}]}, {},image())))
    assert 'Для схемы нужно заполнить размеры' in pdf.pages[1].extract_text()


def test_long_module_schedule_fails_instead_of_dropping_rows():
    modules=[{**item(),'name':f'Шкафчик с индивидуальным названием {n}', 'x':n*600} for n in range(35)]
    with pytest.raises(ValueError,match='Список модулей не помещается'):
        kitchen_album.render('Кухня',{'items':modules},{},image())


def test_dimension_extents_include_real_gaps_and_do_not_sum_unrelated_widths():
    a=item();b=item();b['x']=650
    result=album_layout.dimension_geometry([(1,a),(2,b)])
    assert result['bounds']==(-300,950,-255,255)
    assert result['horizontal']==[(-300,300),(300,350),(350,950)]
    assert result['vertical']==[]  # the overall depth supplies this dimension once
    scene={'items':[a,b]}
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',scene,{},image())))
    assert '1250' in pdf.pages[1].extract_text()
    assert 'H 820' in pdf.pages[1].extract_text()


def test_dimension_spans_follow_rotated_width_and_depth_with_fractional_positions():
    a=item();a.update(rotation=90,x=900.25,z=-300.5,depth=560.5)
    b=item();b.update(x=-300,z=0)
    result=album_layout.dimension_geometry([(1,a),(2,b)])
    assert result['bounds']==(-600,1180.5,-600.5,255)
    assert (620,1180.5) in result['horizontal']
    assert (-600.5,-.5) in result['vertical']
    assert album_layout.number(24000.25)=='24000,25'


def test_narrow_or_overlapping_dimensions_get_separate_label_lanes():
    wide=album_layout.dimension_lanes([(0,600),(600,1200)],.1)
    assert [lane for _,_,lane in wide]==[0,0]
    narrow=album_layout.dimension_lanes([(0,150),(150,300)],.03)
    assert [lane for _,_,lane in narrow]==[0,1]
    overlapping=album_layout.dimension_lanes([(0,600),(300,900)],.1)
    assert [lane for _,_,lane in overlapping]==[0,1]


def test_number_ranges_keep_every_module_without_a_long_wrapped_id_column():
    assert album_layout.number_ranges(['1','2','3','5','7','8'])=='1-3, 5, 7, 8'
    assert album_layout.schedule([item() for _ in range(30)])[0][0]=='1-30'


def test_stacked_cabinets_share_an_outline_but_keep_both_numbers_and_heights():
    a=item();a.update(module_type='wall_cabinet',height=720,depth=317)
    b=dict(a,name='Антресоль',height=360,elevation_mm=2200)
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',{'items':[a,b]},{},image())))
    text=pdf.pages[1].extract_text()
    assert '1, 2' in text and 'H 720 / 360' in text
    assert '600 × 720 × 317' in text and '600 × 360 × 317' in text
