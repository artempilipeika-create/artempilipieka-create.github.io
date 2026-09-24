"""Legacy-shaped synthetic workbooks; never commit customer files or credentials."""
from copy import deepcopy
import pytest
from backend.v2.xlsx import read_workbook
from backend.v2.excel_import import parse,validate_template,header_values,identity_input
from backend.v2.identity import resolve,search_candidates
from tests.stage03.support import xlsx


def layout(rows,**inheritance):
    w=read_workbook(xlsx({'Parts':rows}))
    mapping={'material':'A','length':'B','width':'C','qty':'D','L1':'E'}
    t={'headers':header_values(w['sheets'][0]['rows'],mapping.values(),1,1),
       'sheet_policy':{'mode':'named','sheets':['Parts'],'header_row':1},'mapping':mapping,
       'inheritance':inheritance or {'enabled':False,'blank_resets':True},
       'edge_dictionary':{'':'none','0':'none','1':'present'},'units':{'length':'mm','width':'mm'}}
    return w,t


def parts(p):return [r for r in p['rows'] if r['disposition'] in {'valid','problematic'}]


def test_explicit_block_materials_include_preamble_and_reset_at_next_block():
    rows=[['№ TEST ЛДСП 621 PO',None,None,'Количество','L1'],[None,600,400,2,1],
          [None,500,300,0,0],[None,'ДСП 621 PE'],[None,450,250,1,1],
          [None,None,None,None,None],[None,400,200,1,0],[None,'bad',200,'oops',0]]
    w,t=layout(rows,enabled=True,confirmed=True,material_blocks=True,blank_resets=True)
    del t['mapping']['material'];t['headers'].pop('A')
    result=parse(w,t,['Parts']);p=parts(result)
    assert len(result['rows'])==len(rows) and len(p)==5
    assert [r['values'].get('material') for r in p]==['№ TEST ЛДСП 621 PO','№ TEST ЛДСП 621 PO','ДСП 621 PE',None,None]
    assert p[1]['values']['qty']==0 and p[-1]['values']['qty']=='oops'
    assert p[0]['inheritance']['header_row']==1 and p[2]['inheritance']['header_row']==4
    assert identity_input(p[0],'file')['raw_material_name']=='№ TEST ЛДСП 621 PO'


def test_fill_down_clears_old_article_and_retains_material_source():
    rows=[['Материал','Длина','Ширина','Кол-во','L1','Артикул'],['Board PO',600,400,1,0,'621 PO'],
          [None,500,300,2,1,None],['Board PE',450,250,1,1,None],[None,400,200,1,0,None]]
    w,t=layout(rows,enabled=True,confirmed=True,fill_down=True,blank_resets=True)
    t['mapping']['article']='F';t['headers']['F']='Артикул'
    p=parts(parse(w,t,['Parts']))
    assert p[1]['values']['article']=='621 PO'
    assert p[2]['values']['article'] is None and p[3]['values']['article'] is None
    assert p[3]['values']['material']=='Board PE'
    assert identity_input(p[3],'file')['raw_material_name']=='Board PE'


def test_fill_down_formula_without_cache_cannot_seed_identity():
    w,t=layout([['Материал','Длина','Ширина','Кол-во','L1'],[{'formula':'A9','cached':None},600,400,1,0],[None,500,300,2,0]],
               enabled=True,confirmed=True,fill_down=True,blank_resets=True)
    p=parts(parse(w,t,['Parts']))
    assert p[0]['disposition']=='problematic' and not p[1]['values'].get('material')


@pytest.mark.parametrize('rules',[{'enabled':True,'material_blocks':True},{'enabled':False,'material_blocks':True,'confirmed':True},
                                  {'enabled':True,'fill_down':True,'confirmed':False}])
def test_inheritance_requires_explicit_approved_rule(rules):
    _,t=layout([['Материал','Длина','Ширина','Кол-во','L1']],**rules)
    with pytest.raises(ValueError,match='confirmation'):validate_template(t)


def test_multiline_header_and_explicit_first_data_row_with_sparse_numbers():
    rows=[['Позиция','Размеры',None,'Количество','Кромка'],['№','Длина','Ширина','шт.','X1'],
          ['Служебный текст'],['Полка',600,400,2,0]]
    w,t=layout(rows);t['mapping']['name']=t['mapping'].pop('material')
    t['sheet_policy'].update(header_start=1,header_row=2,data_start=4)
    t['headers']=header_values(w['sheets'][0]['rows'],t['mapping'].values(),1,2)
    p=parts(parse(w,t,['Parts']));assert len(p)==1 and p[0]['row']==4 and p[0]['values']['name']=='Полка'
    sparse=deepcopy(w);sparse['sheets'][0]['rows'].pop(2)
    assert len(parts(parse(sparse,t,['Parts'])))==1
    t['headers']['B']='Wrong'
    with pytest.raises(ValueError,match='fingerprint'):parse(w,t,['Parts'])


def test_physical_conflict_is_never_a_single_preselected_candidate():
    items=[{'variant_id':'18','article':'621 PO','name':'Board','thickness':18},
           {'variant_id':'16','article':'621 PO','name':'Board','thickness':16}]
    assert resolve({'raw_article':'621 PO','raw_thickness':25},items,'r')['candidates']==[]
    raw={'raw_material_name':'ЛДСП 621 PO 16мм','normalized_physical':{'thickness':None}}
    assert [i['variant_id'] for i in search_candidates(raw,items)]==['16']
    assert resolve(raw,items,'r')['selected'] is None
    assert resolve({**raw,'raw_article':'621 PO'},items,'r')['candidates']==['16']


def test_numeric_article_prefix_is_not_an_automatic_material_candidate():
    items=[{'variant_id':'other','article':'621 POX','name':'Board','thickness':18}]
    assert search_candidates({'raw_article':'621 PO'},items)==[]
    assert search_candidates({'raw_material_name':'ДСП 621 PO 18 мм'},items)==[]
