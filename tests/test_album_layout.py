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
