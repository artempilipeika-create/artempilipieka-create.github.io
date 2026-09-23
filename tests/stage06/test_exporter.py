from copy import deepcopy
import json
import pytest
from backend.v2.oblx_exporter import PREVIEW,manufacturing_input,export,inspect,SIDES
from backend.v2.calculation_engine import calculate
from backend.v2.calculation_math import hash_value
from tests.stage04.test_engine import fixture,detail
from agent.protocol import initialize,Ledger,native_boundary


def inputs(grain='none',rotation=False,glued=False,customer=False):
    x,e=fixture();x['production_profile']['profile_id']='profile-fixture-v1'
    d=detail(x);d.update(grain=grain,rotation=rotation,qty=3,route='glued_18_18' if glued else 'solid')
    d['material'].update(article='621 PO',catalogue_release='fixture-release')
    if customer: d.update(supply_source='customer',provided_sheets=5,customer_reason='Explicit customer stock')
    d['edges']={s:{'edge':{**e,'name':'Edge '+s+' & Ąžuolas','article':'SKU-'+s,'edge_id':'edge-'+s,'catalogue_release':'fixture-release'},
        'supply_source':'company','state':'confirmed'} for s in SIDES}
    result=calculate(x);r={'content':x['revision'],'content_hash':hash_value(x['revision']),'catalogue_release_id':'fixture-release'}
    x['revision_hash']=r['content_hash'];c={'input_snapshot':x,'input_hash':hash_value(x),'result':result}
    return r,c


def test_oblx_exp01_determinism_escaping_no_prices_pii_uuid_native_fields():
    r,c=inputs();m=manufacturing_input(r,c,PREVIEW);data=export(m,'MF-000069')
    assert data==export(deepcopy(m),'MF-000069')
    assert b'&amp;' in data and b'<!DOCTYPE' not in data
    for forbidden in (b'price',b'tariff',b'discount',b'calculation_id',b'credential',b'Rotation',b'profile-fixture'):
        assert forbidden not in data
    assert b'Programm="mf-server-oblx-v1"' in data


def test_oblx_exp02_four_sides_are_distinct_parser_not_native():
    r,c=inputs();m=manufacturing_input(r,c,PREVIEW);parsed=inspect(export(m,'MF-000069'))
    assert parsed['details'][0]['edges']=={s:'SKU-'+s for s in SIDES}
    assert parsed['details'][0]['length']=='600' and parsed['details'][0]['width']=='400'
    assert parsed['native_calibration']=='NOT VERIFIED'


def test_oblx_exp03_exact_material_no_fuzzy_substitution():
    r,c=inputs();a=manufacturing_input(r,c,PREVIEW)
    r2,c2=inputs();r2['content']['details'][0]['material']['article']='621 PE'
    r2['content_hash']=hash_value(r2['content']);c2['input_snapshot']['revision_hash']=r2['content_hash'];c2['input_hash']=hash_value(c2['input_snapshot'])
    b=manufacturing_input(r2,c2,PREVIEW)
    assert hash_value(a)!=hash_value(b) and b'621 PE' in export(b,'MF-000069') and b'621 PO' in export(a,'MF-000069')


def test_oblx_exp04_manual_edge_preserved_and_unknown_rejected():
    r,c=inputs();m=manufacturing_input(r,c,PREVIEW)
    assert all(a['manual_lock'] and a['mode']=='explicit_revision' for a in m['parts'][0]['finished_edges'].values())
    r['content']['details'][0]['edges']['L1']['state']='unresolved';r['content_hash']=hash_value(r['content']);c['input_snapshot']['revision_hash']=r['content_hash'];c['input_hash']=hash_value(c['input_snapshot'])
    with pytest.raises(ValueError,match='EXACT_EDGE'): manufacturing_input(r,c,PREVIEW)


def test_oblx_exp05_customer_material_specific_input_no_price():
    r,c=inputs(customer=True);m=manufacturing_input(r,c,PREVIEW)
    assert m['parts'][0]['supply_source']=='customer' and m['parts'][0]['material']['article']=='621 PO'
    assert 'price' not in json.dumps(m) and 'customer_reason' not in json.dumps(m)


def test_oblx_exp06_glued_600_400_3_becomes_620_420_6_only():
    r,c=inputs(glued=True);before=deepcopy(c['result']);m=manufacturing_input(r,c,PREVIEW);p=inspect(export(m,'MF-000069'))
    assert p['positions']==1 and p['parts']==6 and p['details'][0]['length']=='620' and p['details'][0]['width']=='420'
    assert set(p['details'][0]['edges'].values())=={''}
    assert m['parts'][0]['recipe']['operations']==['blank_nesting','glue','glued_finish_cut','edge_processing','packaging']
    assert c['result']==before and m['parts'][0]['finished_edges']['L1']['edge']['article']=='SKU-L1'


@pytest.mark.parametrize('grain,rotation',[('length',False),('length',True),('none',True),('width',False)])
def test_native_rotation_grain_fixtures_remain_unverified(grain,rotation):
    r,c=inputs(grain,rotation);m=manufacturing_input(r,c,PREVIEW);p=inspect(export(m,'MF-000069'))
    assert m['parts'][0]['grain']==grain and m['parts'][0]['rotation_allowed']==rotation
    assert p['native_calibration']=='NOT VERIFIED'
    with pytest.raises(RuntimeError,match='CALIBRATION'): native_boundary({'native_calibration':'NOT VERIFIED'},None)


@pytest.mark.parametrize('xml',[b'<!DOCTYPE Root [<!ENTITY x SYSTEM "file:///etc/passwd">]><Root/>',b'<!ENTITY x "x"><Root/>',b'x'*(4*1024*1024+1),'<!DOCTYPE Root [<!ENTITY x \"boom\">]><Root>&x;</Root>'.encode('utf-16')],ids=['doctype','entity','oversized','utf16-doctype'])
def test_xml_xxe_and_size_rejected(xml):
    with pytest.raises(ValueError): inspect(xml)


def test_exporter_rejects_invalid_characters_and_profile():
    r,c=inputs();m=manufacturing_input(r,c,PREVIEW);m['parts'][0]['material']['name']='bad\x00text'
    with pytest.raises(ValueError): export(m,'MF-000001')
    r,c=inputs();m=manufacturing_input(r,c,PREVIEW);m['export_profile']={**PREVIEW,'rotation':'guess'}
    with pytest.raises(ValueError): export(m,'MF-000001')


def test_agent_isolated_paths_and_durable_ledger(tmp_path):
    with pytest.raises(ValueError): initialize('D:\\pgm')
    with pytest.raises(ValueError): initialize(tmp_path/'pgm'/'staging')
    root=initialize(tmp_path/'agent-staging');ledger=Ledger(root)
    m={'input_hash':'a'*64,'purpose':'produce'};lease={'job_id':'job','run_id':'run1','manifest_sha256':'b'*64,'fencing':1}
    assert ledger.claim(m,lease);ledger.mark('run1','physical_intent');assert not Ledger(root).claim(m,lease)
    with pytest.raises(ValueError): Ledger(root).claim(m,{**lease,'run_id':'run2','fencing':2})
    assert {p.name for p in root.iterdir()}>={'inbox','work','outbox','failed','archive','logs'}


def test_custom_customer_lhdf_exact_three_mm_without_company_price():
    r,c=inputs(customer=True);d=r['content']['details'][0]
    d['material']={'name':'Synthetic customer LHDF','family':'customer','length':'2440','width':'1220','thickness':'3'}
    d['customer_material_key']='synthetic-customer-sheet';d['edges']={}
    r['content_hash']=hash_value(r['content']);c['input_snapshot']['revision_hash']=r['content_hash'];c['input_hash']=hash_value(c['input_snapshot'])
    m=manufacturing_input(r,c,PREVIEW)
    assert m['parts'][0]['material']['thickness']=='3' and m['parts'][0]['material_key']=='customer:synthetic-customer-sheet'
    assert b'<Thickness>3</Thickness>' in export(m,'MF-000069') and 'price' not in json.dumps(m)
