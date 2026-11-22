from copy import deepcopy
from io import BytesIO

import pytest
from pydantic import ValidationError
from pypdf import PdfReader

from backend.v2.assistant_api import LightingEstimate
from backend.v2.sales_hardware import ledger
from backend.v2.three_d_document import render
from backend.v2.wardrobe_lighting_kit import catalogue, lighting_quote, project_lighting_kits


def run(length, system='lira-17.5x6.5'):
    return {'system':system,'length':length,'label':'Полка'}


def items(lengths, control='wave', group='wardrobe', prices=None):
    spec={'lightKit':{'control':control, 'prices':prices or {}},'width':1436,'topFit':'inset'}
    def board(key):
        return {'item_id':group+':'+key,'name':'Полка','module_type':'blank','width':1400,'height':18,'depth':555,
                'blank_axis':'horizontal','blank_length_mm':1400,'blank_width_mm':555,'blank_thickness_mm':18,
                'assistant_carcass':{'group_id':group,'spec':deepcopy(spec)}}
    result=[board('top')]
    for i,length in enumerate(lengths):
        piece=board('shelf-0-'+str(i))
        piece['blank_machining']=[{'lightSystem':'lira-17.5x6.5','start':18,'end':1400-18-length}]
        result.append(piece)
    return result


def test_light_kit_prices_rods_reels_and_groups_agree_with_saved_cut_lengths():
    cuts = [run(1400), run(1400)]
    q = lighting_quote(cuts, {'control':'wave','prices':{'81771':20.01}})
    qty={r['article']:r['qty'] for r in q['rows']}
    assert qty=={'75069':1,'89672':1,'89610':4,'77267':6,'82531':1,'81771':1,'103033':2,'78715':1}
    assert q['complete'] and q['groups']==[{'lines':[0,1],'watts':26.88,'supply':'82531','rated':60,'control':'81771'}]
    custom=lighting_quote(cuts,{'holders':1})
    assert next(r['qty'] for r in custom['rows'] if r['article']=='77267')==1
    assert q['subtotal']==round(sum(r['price']*r['qty'] for r in q['rows']),2)
    assert [r['price'] for r in q['rows'] if r['article']=='81771']==[20.01]
    assert lighting_quote([run(1450),run(1450),run(510),run(510)])['stock'][0]['length']==2000


def test_reels_and_electrical_groups_respect_cut_step_reserve_outputs_and_existing_switch():
    x=lighting_quote([run(2999,'aq-4x8'),run(2800,'aq-4x8'),run(2649,'aq-4x8')],{'control':'external'})
    assert [l['fitted'] for l in x['lines']]==[2975,2800,2625]
    assert {r['article']:r['qty'] for r in x['rows']}=={'15.0341':3,'92641':3,'82531':1,'75056':1,'78715':1}
    assert len(x['groups'])==2 and all(g['control'] is None for g in x['groups'])
    q=lighting_quote([run(250)]*7)
    assert [len(g['lines']) for g in q['groups']]==[6,1]
    assert all(g['control']=='118634' for g in q['groups'])
    short=lighting_quote([run(12,'aq-4x8')])
    assert short['rows']==[] and not short['complete'] and short['notes']
    assert lighting_quote([])['rows']==[]


def test_document_and_purchase_ledger_count_one_kit_per_cabinet_even_with_repeated_metadata():
    boards=items([1300,1300])+items([1300],group='other',prices={'81771':0})
    scene={'items':boards}
    quotes=project_lighting_kits(boards)
    assert set(quotes)=={'wardrobe:top','other:top'}
    rows,_=ledger(scene)
    assert next(r['qty'] for r in rows if r['article']=='81771')==2
    pdf=PdfReader(BytesIO(render('Шкафы',scene,{})))
    text=' '.join(page.extract_text() for page in pdf.pages)
    assert 'Итого подсветка' in text and '81771' in text and 'По шкафам' in text
    assert format(sum(k['subtotal'] for k in quotes.values()),'.2f').replace('.',',') in text
    assert project_lighting_kits(items([]))=={}


def test_kit_request_schema_bounds_and_models_have_supplier_cards():
    q=LightingEstimate.model_validate({'runs':[run(1400)],'settings':{'control':'door','prices':{'78192':0}}})
    assert q.settings.prices['78192']==0
    for bad in ({'control':'xx'},{'prices':{'78192':-1}},{'prices':{'78192':1.123}}):
        with pytest.raises(ValidationError):LightingEstimate.model_validate({'runs':[run(1400)],'settings':bad})
    from pathlib import Path
    base=Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets/planner/light-kit-photos'
    for art in catalogue()['controls'].values():
        assert (base/(art+'.webp')).read_bytes()[8:12]==b'WEBP'
        assert catalogue()['products'][art]['url'].startswith('https://')


def test_silver_stock_and_fittings_follow_each_groove_and_both_liras_share_the_flat_led_reel():
    silver = 'lira-1708'
    q = lighting_quote([run(1400, silver), run(1400, silver), run(1000), run(400, 'aq-4x8')],
                       {'holders1708': 5, 'holders': 3})
    qty = {r['article']: r['qty'] for r in q['rows']}
    assert q['stock'] == [{'article': '90607', 'length': 3000, 'lines': [0, 1]},
                          {'article': '89609', 'length': 2000, 'lines': [2]}]
    assert {k: qty[k] for k in ('90607', '125300', '124677', '89609', '89610', '77267', '75069', '15.0341')} == {
        '90607': 1, '125300': 4, '124677': 5, '89609': 1, '89610': 2, '77267': 3, '75069': 1, '15.0341': 1}
    for length, article in ((80, '78319'), (2000, '78319'), (2000.5, '90607'), (3000, '90607')):
        assert lighting_quote([run(length, silver)])['stock'][0]['article'] == article
