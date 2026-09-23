"""Literal SPEC boundary/financial fixtures, independent of cloud infrastructure."""
from copy import deepcopy
from decimal import Decimal
import json
import pytest
from backend.v2.calculation_engine import calculate
from backend.v2.calculation_math import category_totals,hash_value
from backend.v2.calculation_models import CalculationRequest,Detail
from backend.v2.sheet_estimator import estimate,PlacementError


def fixture():
    settings={'kerf_mm':'4.4','trim_left_mm':'10','trim_right_mm':'10','trim_top_mm':'10','trim_bottom_mm':'10',
      'glue_layers':2,'glue_allowance_each_side_mm':'10','glued_finished_thickness_mm':'36','complex_edge_threshold_mm':'60','geometry_decimal_places':3}
    mat={'variant_id':'material-18','name':'Synthetic 18','thickness':'18','length':'2800','width':'2070','family':'board'}
    edge={'edge_id':'edge-22','width':'22','thickness':'0.4'}
    detail={'detail_id':'d1','length':'600','width':'400','qty':1,'material':mat,'supply_source':'company','rotation':False,
      'grain':'none','route':'solid','packaging':False,'edges':{},'provided_sheets':None,'customer_reason':None}
    amounts={'cutting_18':'0.75','glued_finish_cut':'1.70','edge_normal':'2.10','edge_complex':'4.00','edge_thick':'3.50','glue':'14.00','packaging':'1.50'}
    return {'revision':{'details':[detail],'issues':[]},'production_profile':{'settings':settings,'policies':{
      'edge_consumption':{'basis':'net'},'cutting_18':{'basis':'estimated_plan_excluding_trim','families':['board','customer'],'include_glue_blanks':True},
      'glue_area':None,'edge_classification':None}},'tariffs':{k:{'amount':v,'entry_id':k} for k,v in amounts.items()},
      'prices':{'material-18':{'entry_id':'price-board','amount':'100','unit':'sheet'},'edge-22':{'entry_id':'price-edge','amount':'4','unit':'m'}},
      'discount':{'materials':'0','edge_material':'0','services':'0'}},edge

def detail(x): return x['revision']['details'][0]
def op(result,name): return [l for l in result['lines'] if l['operation']==name]
def net_fixture():
    x,e=fixture();d=detail(x);d.update(length='1000',width='500',qty=3)
    d['edges']={'L1':{'edge':e,'supply_source':'company'},'L2':{'edge':e,'supply_source':'company'}}
    return x

def test_cal01_minimum_full_sheet_and_exact_m2_conversion():
    x,_=fixture();detail(x).update(length='10',width='10');r=calculate(x)
    assert op(r,'clean_sheets')[0]['gross']=='100.00' and r['sheet_estimates'][0]['estimated_sheet_count']==1
    x['prices']['material-18'].update(unit='m2',amount='5.0137');r=calculate(x)
    assert op(r,'clean_sheets')[0]['unit_price']=='29.0594052'
    assert op(r,'clean_sheets')[0]['gross']=='29.06'

def test_cal02_oversized_detail_no_fake_sheet():
    x,_=fixture();detail(x).update(length='2781',width='100');r=calculate(x)
    assert r['completeness']=='invalid' and r['total'] is None and r['sheet_estimates']==[]
    assert any(reason['code']=='DETAIL_EXCEEDS_USABLE_FIELD' for reason in r['reasons'])

@pytest.mark.parametrize('length,sheets',[('1388',2),('1387.8',1)])
def test_cal03_cal04_exact_decimal_kerf_boundary(length,sheets):
    x,_=fixture();detail(x).update(length=length,width='1100',qty=2);r=calculate(x)
    assert r['sheet_estimates'][0]['estimated_sheet_count']==sheets
    if sheets==1:
        placement=r['sheet_estimates'][0]['sheets'][0]['placements'][1]
        assert Decimal(placement['x'])+Decimal(placement['length'])==Decimal('2780')

def test_placement_nonoverlap_grain_reproducible_and_segments_not_perimeter():
    x,_=fixture();detail(x).update(length='2700',width='1000',qty=3)
    a=calculate(x);b=calculate(deepcopy(x));assert hash_value(a)==hash_value(b)
    assert Decimal(a['sheet_estimates'][0]['cut_metres'])!=Decimal(2*(2700+1000)*3)/1000
    for s in a['sheet_estimates'][0]['sheets']:
        for i,p in enumerate(s['placements']):
            assert not p['rotated']
            for q in s['placements'][i+1:]:
                assert (Decimal(p['x'])+Decimal(p['length'])+Decimal('4.4')<=Decimal(q['x']) or
                        Decimal(q['x'])+Decimal(q['length'])+Decimal('4.4')<=Decimal(p['x']) or
                        Decimal(p['y'])+Decimal(p['width'])+Decimal('4.4')<=Decimal(q['y']) or
                        Decimal(q['y'])+Decimal(q['width'])+Decimal('4.4')<=Decimal(p['y']))
    detail(x).update(length='2000',width='2700',rotation=True,grain='none');assert calculate(x)['completeness']=='complete'
    detail(x)['grain']='length';assert calculate(x)['completeness']=='invalid'

def test_cal05_customer_material_services_company_edge():
    x=net_fixture();detail(x).update(supply_source='customer',provided_sheets=5,customer_reason='Explicit customer stock')
    r=calculate(x);assert op(r,'clean_sheets')[0]['gross']=='0.00'
    assert Decimal(op(r,'edge_material')[0]['gross'])>0 and Decimal(op(r,'edge_normal')[0]['gross'])>0
    assert Decimal(op(r,'cutting_18')[0]['gross'])>0

def test_cal06_raw_zero_never_free_and_cal07_partial_not_total():
    x=net_fixture();x['prices'].pop('material-18');x['raw_master_price']='0'
    r=calculate(x);assert r['total'] is None and op(r,'clean_sheets')[0]['gross'] is None
    x=net_fixture();x['prices'].pop('edge-22');r=calculate(x)
    assert r['completeness']=='incomplete' and r['total'] is None and Decimal(r['calculated_part'])>0

def test_cal08_three_discounts_literal_179():
    lines=[{'category':c,'gross':v,'state':'complete'} for c,v in [('materials','100.00'),('edge_material','40.00'),('services','60.00')]]
    r=category_totals(lines,{'materials':'10','edge_material':'20','services':'5'})
    assert [r[c]['net'] for c in ('materials','edge_material','services')]==['90.00','32.00','57.00']
    assert sum(Decimal(v['net']) for v in r.values())==Decimal('179.00')

def test_cal09_independent_edge_discount():
    x=net_fixture();before=calculate(x);x['discount']['edge_material']='20';after=calculate(x)
    assert before['category_totals']['services']==after['category_totals']['services']
    assert before['category_totals']['materials']==after['category_totals']['materials']
    assert before['category_totals']['edge_material']!=after['category_totals']['edge_material']

def test_cal11_no_hidden_policy_cal12_explicit_synthetic_and_cal13_group_once():
    x=net_fixture();x['production_profile']['policies']['edge_consumption']=None
    r=calculate(x);assert op(r,'edge_material')[0]['net_metres']=='6'
    assert op(r,'edge_material')[0]['procurement_metres'] is None and r['total'] is None
    x['production_profile']['policies']['edge_consumption']={'basis':'factor_ceil','factor':'1.15','step_m':'5'}
    r=calculate(x);assert op(r,'edge_material')[0]['procurement_metres']=='10'
    assert op(r,'edge_normal')[0]['quantity']=='6' and len(op(r,'edge_material'))==1
    original=detail(x);original['qty']=1
    x['revision']['details']=[{**deepcopy(original),'detail_id':str(n)} for n in range(3)]
    grouped=calculate(x);assert len(op(grouped,'edge_material'))==1 and op(grouped,'edge_material')[0]['quantity']=='10'

def test_cal14_glue_recipe_cal15_finish_cut_and_packaging():
    x,_=fixture();detail(x).update(qty=3,route='glued_18_18',packaging=True);r=calculate(x)
    recipe=r['manufacturing_recipes'][0]
    assert (recipe['blank_length'],recipe['blank_width'],recipe['child_qty'],recipe['finished_qty'])==('620','420',6,3)
    assert op(r,'packaging')[0]['quantity']=='0.72' and op(r,'packaging')[0]['gross']=='1.08'
    assert op(r,'glued_finish_cut')[0]['quantity']=='3' and op(r,'glued_finish_cut')[0]['gross']=='5.10'
    assert len([l for l in r['lines'] if l['category']=='materials'])==1
    assert op(r,'glue')[0]['state']=='needs_confirmation'
    assert sum(len(s['placements']) for s in r['sheet_estimates'][0]['sheets'])==6
    x['production_profile']['policies']['glue_area']='one_blank_area'
    assert op(calculate(x),'glue')[0]['quantity']=='0.7812'

def test_cal16_solid36_not_glued_not_cut18():
    x,_=fixture();detail(x)['material']['thickness']='36';r=calculate(x)
    assert not r['manufacturing_recipes'] and not op(r,'cutting_18') and not op(r,'glued_finish_cut')
    assert any(r['code']=='NC-09_CUT_SCOPE_REQUIRED' for r in r['reasons'])

def test_cal17_ambiguous_thick_complex_not_double_billed():
    x,e=fixture();detail(x).update(length='40',width='500');e.update(width='43',thickness='2')
    detail(x)['edges']={'W1':{'edge':e,'supply_source':'company'}};r=calculate(x)
    assert not op(r,'edge_complex') and not op(r,'edge_thick')
    assert op(r,'edge_processing')[0]['state']=='needs_confirmation'

def test_cal18_financial_input_injection_and_float_rejected():
    from pydantic import ValidationError
    for key in ('preliminaryTotal','finalTotal','discounts','tariff','material_price','edge_price','sheet_count'):
        with pytest.raises(ValidationError): CalculationRequest(revision_id='04000000-0000-4000-8000-000000000001',**{key:'0'})
    with pytest.raises(ValidationError): Detail(detail_id='bad',length=1387.8,width='100',qty=1)
    with pytest.raises(ValidationError): Detail(detail_id='bad',length='100',width='100',qty=True)

def test_customer_edge_zero_only_material_and_packaging_absent():
    x=net_fixture()
    for e in detail(x)['edges'].values(): e['supply_source']='customer'
    r=calculate(x);assert op(r,'edge_material')[0]['gross']=='0.00' and Decimal(op(r,'edge_normal')[0]['gross'])>0
    assert not op(r,'packaging')

def test_raw_qty_zero_preserved_invalid_not_corrected():
    x,_=fixture();detail(x)['qty']=0;r=calculate(x)
    assert r['completeness']=='invalid' and r['total'] is None and detail(x)['qty']==0
