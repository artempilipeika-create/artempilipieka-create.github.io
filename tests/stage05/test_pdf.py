from copy import deepcopy
from io import BytesIO
from pathlib import Path
import json
import pytest
from pypdf import PdfReader
from backend.v2.calculation_engine import calculate
from backend.v2.document_projection import project,CUSTOMER,DISCLAIMER
from backend.v2.document_renderer import render,bounded_render,validate
from tests.stage04.test_engine import fixture,detail,net_fixture


def sample(count=1,mode='complete'):
    x,e=fixture();base=deepcopy(detail(x));x['revision']['details']=[]
    for i in range(count):
        d=deepcopy(base);key='material-'+str(i);d['detail_id']='detail-'+str(i);d['material'].update(variant_id=key,
          name=('Дуб натуральный с выраженной текстурой для мебельных фасадов и интерьерных панелей · ЛХДФ Ąžuolas Šviesus Ė Ę Į Ų Ū Ž ą č ę ė į š ų ū ž' if count>1 else 'Дуб натуральный'),
          manufacturer='Martin Forest · Тестовый каталог',article='H3331-ST10-ЛХДФ-'+str(i+1),structure='ST10 / натур')
        x['prices'][key]={'entry_id':'price-'+str(i),'amount':'100','unit':'sheet'};x['revision']['details'].append(d)
    x['discount']={'materials':'10','edge_material':'20','services':'5'}
    if mode=='customer':
        detail(x).update(supply_source='customer',provided_sheets=5,customer_reason='Explicit customer stock')
        detail(x)['edges']={'L1':{'edge':{**e,'name':'Кромка натуральный дуб','article':'TEST-22-04'},'supply_source':'company'}}
    if mode=='glue':
        detail(x).update(route='glued_18_18',qty=3,packaging=True);x['production_profile']['policies']['glue_area']='finished_area'
    if mode=='incomplete': x['prices'].pop('material-0')
    result=calculate(x);result['synthetic']=True
    c={'result':result,'input_snapshot':x}
    view=project(c,number='MF-000123',name='Гостиная и кухня',customer='Александра Константиновна · Ąžuolo baldų dirbtuvės, мебельная мастерская индивидуальных проектов',revision_number=2,date='2026-09-23')
    return c,view

@pytest.mark.parametrize('count',[1,5,20])
def test_pdf01_pdf02_pdf08_pdf09_actual_text_multipage(count):
    c,v=sample(count);data=render(v);reader=PdfReader(BytesIO(data));text='\n'.join(p.extract_text() for p in reader.pages)
    assert 'ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ' in text and 'Ąžuolo' in text and 'Александра' in text
    assert str(c['result']['total'])+' BYN' in text
    assert len(reader.pages)>1 if count>=5 else 1<=len(reader.pages)<=2
    assert 'Деталировка' in text and 'Кромка по сторонам' in text
    assert len(v['details'])==count
    for i,p in enumerate(reader.pages,1):
        assert not p.images and 'Страница '+str(i) in p.extract_text() and 'MF-000123' in p.extract_text()
    for i in range(count): assert 'H3331-ST10-ЛХДФ-'+str(i+1) in text
    if count>1: assert 'Ąžuolas Šviesus' in text
    assert render(deepcopy(v))==data

@pytest.mark.parametrize('mode',['customer','glue','incomplete'])
def test_pdf03_pdf04_pdf06_pdf07_snapshot_numbers(mode):
    c,v=sample(mode=mode);data=bounded_render(v);text=' '.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
    for d in v['discounts']:
        for k in ('gross','percent','discount','net'): assert str(d[k]) in text
    if mode=='customer':
        assert v['materials'][0]['amount']=='0.00' and 'Материал заказчика.' in text
        assert float(v['edges'][0]['amount'])>0 and any(float(s['amount'])>0 for s in v['services'])
    if mode=='glue': assert 'Склейка' in text and 'Финальная обрезка 36 мм' in text and v['amount']=='111.02'
    if mode=='incomplete':
        assert c['result']['total'] is None and 'РАССЧИТАННАЯ ЧАСТЬ' in text
        assert 'ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ' not in text and 'Стоимость материала' in text
    assert v['disclaimer']==DISCLAIMER

def test_pdf05_pdf10_no_edge_no_internal_and_escape():
    c,v=sample();c['result']['token']='TOPSECRET';c['input_snapshot']['internalComment']='INTERNAL';
    v=project(c,number='MF-000123',name='<img src="https://example.invalid/x">',customer='Клиент',revision_number=1,date='2026-09-23')
    data=render(v);reader=PdfReader(BytesIO(data));text=' '.join(p.extract_text() for p in reader.pages)
    assert 'Чистовой' not in text and 'Метраж' not in text and v['edges']==[]
    for token in ['OBLX','BAZIS','Agent','TOPSECRET','INTERNAL','material-0','price-0','plan_hash','storage_key']:
        assert token not in text and token not in str(reader.metadata)
    assert '<img src=' in text and not any(p.get('/Annots') for p in reader.pages)

def test_resource_limits_and_no_silent_missing_glyph():
    _,v=sample();v['order_name']='x'*2001
    with pytest.raises(ValueError): render(v)
    _,v=sample();v['order_name']='\U0001f9cc'
    with pytest.raises(ValueError,match='Unsupported glyph'): render(v)

if __name__=='__main__':
    out=Path('docs/stage05/pdf');out.mkdir(parents=True,exist_ok=True)
    evidence={}
    for name,count,mode in [('one-material',1,'complete'),('five-materials',5,'complete'),('twenty-materials',20,'complete'),('customer-material',1,'customer'),('glued-36mm',1,'glue'),('incomplete',1,'incomplete')]:
        c,v=sample(count,mode);(out/(name+'.pdf')).write_bytes(render(v));evidence[name]={'snapshot':c,'projection':v}
    (out/'synthetic-fixtures.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2))


def test_unknown_discount_labels_fit_and_never_fake_total():
    c,v=sample(mode='incomplete');c['input_snapshot']['discount']=None;c['result']=calculate(c['input_snapshot'])
    view=project(c,number='MF-000124',name='Неизвестные условия',customer='Клиент',revision_number=1,date='2026-09-23')
    text=' '.join(p.extract_text() for p in PdfReader(BytesIO(render(view))).pages)
    assert 'Уточняетс\nя' not in text and 'РАССЧИТАННАЯ ЧАСТЬ' in text and 'ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ' not in text
