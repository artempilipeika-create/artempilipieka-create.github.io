from decimal import Decimal
from io import BytesIO

from pypdf import PdfReader

from backend.v2.three_d_api import Scene
from backend.v2.three_d_drawers import VARIANTS
from backend.v2.wardrobe_estimate import calculate
from backend.v2.wardrobe_estimate_pdf import render

BODY='71118e45-0ce3-534b-ad68-db1238304f18'
FRONT='389a2abc-c6e2-5214-a41b-60054320d0ff'
DRAWER='7b8e6d4f-f8ea-590d-b91e-dcae0fad9710'


def cabinet(system='aq',width=357):
    v=next(v for v in VARIANTS if v['system']==system and v['layout']=='three' and v['opening']=='soft')
    return dict(item_id='A',module_type='base_cabinet',name='Тумба с тремя шуфлядами',bazis_id=v['id'],
                bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=width,height=820,depth=510,
                x=0,z=0,rotation=0,drawers=3,base='legs',legHeightMm=100,layout='drawers',
                body_variant_id=BODY,front_variant_id=FRONT,part_materials={p['key']:DRAWER for p in v['panels'] if p['role']=='drawer'})


def quote(*items):
    scene=Scene(items=list(items)).model_dump(mode='json')
    return calculate(scene,20,'2026-11-25')


def test_exact_width_and_real_drawer_kits_and_customer_reconciliation():
    a=cabinet()
    first=quote(a)
    bigger=quote({**a,'width':489})
    assert [first['modules'][0]['width'],bigger['modules'][0]['width']]==[357,489]
    assert bigger['modules'][0]['base']>first['modules'][0]['base'] and len(first['modules'][0]['drawers'])==3
    assert bigger['modules'][0]['drawers'][0]['total']>first['modules'][0]['drawers'][0]['total']
    assert first['groups']['hardware']['total']==bigger['groups']['hardware']['total']
    rows=first['groups']['hardware']['rows']
    assert sum(r['qty'] for r in rows if r['article'] in ('12.0068','12.0095'))==3
    assert not any(r['name'].startswith('AQ LineBox Направляющая,') for r in rows)
    assert any(r['key']=='drill:3:blind' and r['qty']>=28 for r in first['groups']['work']['rows'])
    def money(rows):return sum(Decimal(str(r['total'])) for r in rows)
    assert money(first['modules'])==money(first['groups'].values())==Decimal(str(first['total']))
    assert sum(d['total'] for d in first['modules'][0]['drawers']) < first['modules'][0]['total']
    slim=quote(cabinet('slimbox',489))
    assert not any((r.get('article') or '').startswith('12.00') for r in slim['groups']['hardware']['rows'])
    assert slim['modules'][0]['drawers'][0]['total']!=bigger['modules'][0]['drawers'][0]['total']
    doc=PdfReader(BytesIO(render('Кухня',{'items':[a]},first)))
    assert 5<=len(doc.pages)<=10 and 'Шуфляда 3' in ''.join(p.extract_text() for p in doc.pages)


def test_rear_milling_tracks_geometry_and_project_row_is_counted_once():
    a=cabinet()
    a['kitchenFilling']={'kind':'drawers-three','backMount':{'kind':'groove','layout':'sides','width':4,'depth':5,'offset':3}}
    plain=quote(cabinet())
    cut=quote(a)
    before=sum(r['qty'] or 0 for r in plain['groups']['work']['rows'] if r['key']=='mill16to18')
    after=sum(r['qty'] or 0 for r in cut['groups']['work']['rows'] if r['key']=='mill16to18')
    assert after>before
    pair=quote(cabinet(),{**cabinet(width=489),'item_id':'B','x':423})
    assert [m['id'] for m in pair['modules']]==['A','B',None]
    totals=sum(Decimal(str(m['total'])) for m in pair['modules'])
    assert totals==Decimal(str(pair['total']))
    assert all(m['missing'] for m in pair['modules'] if m['id'] is None)


def test_saved_material_identity_preserves_the_16_mm_drawer_override():
    item = cabinet()
    identities = {DRAWER: {'manufacturer': 'ULTRADECOR', 'article': '0101 PE'}}
    scene = Scene(items=[item], materialIdentities=identities).model_dump(mode='json')
    with_identity = calculate(scene, 20, '2026-11-25')
    assert with_identity['modules'] == quote(item)['modules']
    sheet_key = 'sheet:' + DRAWER + ':16'
    assert any(r['key'] == sheet_key for r in with_identity['groups']['materials']['rows'])
    item['part_materials'] = {}
    other = quote(item)
    assert all(r['key'] != sheet_key for r in other['groups']['materials']['rows'])


def test_corner_front_notch_uses_its_actual_inner_cut_path():
    from backend.v2.kitchen_estimate import project_geometry
    from backend.v2.three_d_wall_special import VARIANTS
    source = next(v for v in VARIANTS if v['id'] == 'bazis.74184f6983e5')
    item = dict(item_id='C', name='Верхний угловой', module_type='wall_cabinet', bazis_id=source['id'],
                bazis_file=source['source_file'], bazis_sha256=source['source_sha256'], width=1000, height=720, depth=300,
                x=0, z=0, rotation=0, drawers=0, base='wall', body_variant_id=BODY, front_variant_id=FRONT)
    geometry = project_geometry({'items':[item]})['modules']['C']
    lengths = [cut['mm'] for p in geometry['panels'] for cut in p['cuts'] if cut['key']=='curveCut']
    assert lengths == [631]
