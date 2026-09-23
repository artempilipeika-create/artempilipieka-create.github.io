from copy import deepcopy
from collections import Counter
import pytest
from backend.v2.xlsx import read_workbook
from backend.v2.catalogue_model import normalize_master,matches,HEADERS
from backend.v2.identity import resolve
from backend.v2.excel_import import parse
from backend.v2.auto import apply_auto
from .support import master,xlsx,parts,part,template,PART_HEADERS


def test_lhdf_search_articleless_and_negative_hdf():
    rows=[ [None,name,'кв.м',0,2800,2070,t,None,None,'M1','false',None] for name,t in
          [('ЛХДФ 3ММ Белый, 2800х2070 мм',3),('ЛХДФ 3ММ Черный, 3мм',3),('ЛХДФ  Белый',3),('HDF, šviesiai pilka. 4 mm',4),('HDF,  2.8 mm Pilka (U708)/U5034',2.8)]]
    rows[4][0]='U708/U5034'
    rows.append(['117663','Смеситель HDF-2861','шт',90,0,0,0,None,None,None,'false',None])
    records,_=normalize_master(read_workbook(master(rows)),'test.master')
    boards=[r['normalized'] for r in records if r['disposition']=='published']
    assert len(boards)==5
    for q in ('ЛХДФ','ХДФ','HDF'): assert sum(matches(b,q) for b in boards)==5
    assert [b for b in boards if matches(b,'U708/U5034')]==[boards[4]]
    assert all(b['article'] is None for b in boards[:4]) and len({b['variant_id'] for b in boards})==5
    assert records[-1]['disposition']=='excluded'


def test_stable_ids_row_reordering_prices_and_scope():
    first=read_workbook(master()); changed=deepcopy(first)
    changed['sheets'][0]['rows'][1:]=reversed(changed['sheets'][0]['rows'][1:])
    for i,r in enumerate(changed['sheets'][0]['rows'][1:],2): r['row']=i;r['cells']['D']['value']='101'
    a,_=normalize_master(first,'one');b,_=normalize_master(changed,'one');c,_=normalize_master(first,'two')
    keys=lambda rs:{r['signature']:r['normalized'].get('variant_id',r['normalized'].get('edge_id')) for r in rs}
    assert keys(a)==keys(b) and not set(keys(a).values())&set(keys(c).values())


def test_all_rows_accounted_mixed_zero_and_external_collision():
    base=['X','Board','кв.м',0,2800,2070,18,'PO','','M1','false','sync']
    other=base.copy();other[0]='Y'
    mixed=base.copy();mixed[9]='M0 M1';mixed[11]=''
    zero=base.copy();zero[4:7]=[0,0,0];zero[11]=''
    result,_=normalize_master(read_workbook(master([base,other,mixed,zero])),'scope')
    assert len(result)==4 and Counter(r['disposition'] for r in result)=={'review':3,'excluded':1}
    assert result[0]['normalized']['variant_id']!=result[1]['normalized']['variant_id']


def test_exact_duplicate_links_and_similar_names_do_not_merge():
    a=[None,'ЛХДФ  Белый','кв.м',0,2800,2070,3,None,None,'M1',False,None]
    b=a.copy();b[1]='ЛХДФ 3мм Белый'
    rows,_=normalize_master(read_workbook(master([a,b,a])),'scope')
    assert [r['disposition'] for r in rows]==['published','published','duplicate']
    assert rows[2]['duplicate_of']==rows[0]['raw_row_id']


def item():
    return {'variant_id':'variant','material_id':'material','article':'621 PO','name':'Board',
            'manufacturer':'Maker','structure':'PO','thickness':'18','length':'2800','width':'2070'}


def raw():
    return {'raw_article':'621 PO','raw_material_name':'Board','raw_manufacturer':'Maker','raw_structure':'PO',
            'raw_thickness':'18','raw_format_length':'2800','raw_format_width':'2070'}


@pytest.mark.parametrize('article',['621 PE','621 POX','unknown','621  PO','621 РО'])
def test_no_fuzzy_identity(article):
    r=raw();r['raw_article']=article
    result=resolve(r,[item()],'release')
    assert result['status']=='unresolved' and result['selected'] is None and result['raw']['raw_article']==article


@pytest.mark.parametrize('field,value',[('raw_manufacturer','Other'),('raw_structure','PE'),('raw_thickness','16'),('raw_format_width','1220'),('raw_format_length','2440')])
def test_physical_conflict_no_cheaper_format(field,value):
    r=raw();r[field]=value
    result=resolve(r,[item()],'release')
    assert result['status']=='ambiguous' and result['selected'] is None


def test_exact_requires_known_features_and_alias_cannot_override_conflict():
    assert resolve(raw(),[item()],'release')['status']=='exact_match'
    r=raw();r.pop('raw_thickness')
    assert resolve(r,[item()],'release')['status']=='unresolved'
    r=raw();r['raw_article']='ALIAS';r['raw_thickness']='16'
    a={'source_namespace':'client','source_value':'ALIAS','variant_id':'variant','manufacturer':None,'approved_by':'a','approved_at':'now','version':1,'reason':'approved','alias_id':'id'}
    assert resolve(r,[item()],'release',[a])['status']=='unresolved'
    r['raw_thickness']='18'
    assert resolve(r,[item()],'release',[a])['status']=='confirmed_mapping'


@pytest.mark.parametrize('qty',[0,-1,'1.5',None,'text'])
def test_bad_quantity_retained(qty):
    result=parse(read_workbook(parts([part(qty=qty)])),template(),['Parts'])['rows'][1]
    assert result['disposition']=='problematic' and result['raw_fields']['qty']==(None if qty is None else str(qty))
    assert result['values']['qty']!=1 and any(e['field']=='qty' for e in result['errors'])
    if qty==0: assert result['values']['qty']==0


@pytest.mark.parametrize('value',[None,0,-5,'bad',{'formula':'1+1','cached':None}])
def test_bad_dimension_and_formula_not_dropped(value):
    result=parse(read_workbook(parts([part(length=value)])),template(),['Parts'])
    assert len(result['rows'])==2 and result['rows'][1]['disposition']=='problematic'
    assert any(e['field']=='length' for e in result['rows'][1]['errors'])


def test_formula_cache_precision_units_and_independent_texture():
    t=template();t['units']['length']='cm'
    r=parse(read_workbook(parts([part(length={'formula':'2+3','cached':'5'},width='1,23456',texture='grain')])),t,['Parts'])['rows'][1]
    assert r['values']['length']==50 and r['values']['width']=='1.23456'
    assert r['values']['texture']=='grain' and r['values']['rotation'] is None
    assert r['cells']['F']['formula']=='2+3' and r['cells']['F']['cached']=='5'
    assert len(r['conversions'])==2 and any(e['reason']=='precision_requires_review_no_rounding' for e in r['errors'])


def test_explicit_sheets_header_inheritance_reset_and_side_conflict():
    rows=[PART_HEADERS,part(kind='MATERIAL',article='OLD',material='old',length=None,width=None,qty=None),
          part(article=None,material=None,X1='EDGE-SKU',L1='DIFFERENT'),
          part(kind='MATERIAL',article=None,material='NEW',length=None,width=None,qty=None),part(article=None,material=None)]
    w=read_workbook(parts(sheets={'A':rows,'B':[PART_HEADERS,part()]}))
    assert parse(w,template(),[])['available_sheets']==['A','B']
    parsed=parse(w,template(),['A','B'])
    a=parsed['rows'];assert len(a)==7 and a[1]['reason']=='material_header'
    assert a[2]['values']['article']=='OLD' and a[4]['values']['article'] is None and a[4]['values']['material']=='NEW'
    assert a[2]['edges']['L1']['raw_sku']=='DIFFERENT' and a[2]['edges']['L1']['raw']['X1']=='EDGE-SKU'
    assert any(e['reason']=='side_alias_conflict' for e in a[2]['errors'])


def test_template_edge_dictionary_version_and_axis_mapping():
    t=template();source=read_workbook(parts([part(X1='0',X2='1',Y1='no',Y2='SKU')]))
    old=parse(source,t,['Parts'])['rows'][1];t['edge_dictionary']['0']='present'
    new=parse(source,t,['Parts'])['rows'][1]
    assert old['edges']['L1']['mark']=='none' and new['edges']['L1']['mark']=='present'
    assert old['edges']['L2']['mark']=='present' and old['edges']['W1']['mark']=='none' and old['edges']['W2']['raw_sku']=='SKU'


def test_auto_preserves_manual_none_and_material_incompatible_and_suggestion():
    snapshot={'resolution':{'status':'manual_override','selected':item()},'edges':{
      'L1':{'mode':'manual_override','edge_id':'small'},'L2':{'mode':'manual_override','edge_id':None},
      'W1':{'mode':'auto_suggestion','mark':'present'},'W2':{'mode':'auto_suggestion','mark':'present'}}}
    edges=[{'edge_id':'small','width':'2','designation':'621 POX'},{'edge_id':'wide','width':'22','designation':'621 POX'}]
    value=apply_auto(snapshot,edges,[])
    assert value['resolution']==snapshot['resolution'] and value['edges']['L1']['edge_id']=='small'
    assert value['edges']['L1']['warnings'] and value['edges']['L2']['edge_id'] is None
    assert value['edges']['W1']['mode']=='auto_suggestion' and not value['edges']['W1']['confirmed']
    mapping={'variant_id':'variant','edge_id':'wide','mapping_id':'mapping','version':2}
    mapped=apply_auto(value,edges,[mapping]);assert mapped['edges']['W1']['mapping_version']==2
    assert mapped['edges']['L1']['edge_id']=='small' and mapped['edges']['L2']['mode']=='manual_override'


def test_macro_and_external_worksheet_rejected():
    from zipfile import ZipFile
    from io import BytesIO
    data=BytesIO(master())
    with ZipFile(data,'a') as z: z.writestr('xl/vbaProject.bin',b'no execution')
    with pytest.raises(ValueError): read_workbook(data.getvalue())
