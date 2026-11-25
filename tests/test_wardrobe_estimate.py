from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from pypdf import PdfReader
from tests.stage03.test_api import settings, api, admin_user, login
from backend.v2.wardrobe_estimate import calculate
from backend.v2.wardrobe_estimate_pdf import render

BOARD='71118e45-0ce3-534b-ad68-db1238304f18'


def panel():
    return dict(item_id='sample',module_type='blank',name='Полка',width=600,height=18,depth=400,
                base='wall',layout='niche',drawers=0,handles='handleless',blank_axis='horizontal',
                blank_length_mm=600,blank_width_mm=400,blank_thickness_mm=18,blank_edge_thickness_mm=.8,
                blank_edge_code='1100',body_variant_id=BOARD)


def test_measured_panel_and_fractional_edge():
    sheet=dict(variantIds=[BOARD],brand='SAMPLE',code='A',texture='B',thickness=18,price=100)
    edge=dict(brand='SAMPLE',code='A',texture='B',width=22,thickness=.8,price=3)
    ops={k:dict(name=k,unit=u,price=v) for k,u,v in [('edgeNormal','м',2),('pack','м²',1),('cut18','м',.75)]}
    rates=(dict(sheets=[sheet],edges=[edge],operations=ops,sheetFormats={BOARD:[2800,2070]}),{}, {})
    q=calculate({'items':[panel()]},17.5,'2026-11-25',rates)
    material=q['groups']['materials']
    assert q['complete'] and material['base']==27.50
    assert [r['qty'] for r in material['rows']]==[1.2,.23904]
    assert q['total']==float((Decimal(str(q['base']))*Decimal('1.175')).quantize(Decimal('.01')))
    assert sum(Decimal(str(g['total'])) for g in q['groups'].values())==Decimal(str(q['total']))
    rates[0]['edges']=[]
    partial=calculate({'items':[panel()]},17.5,'2026-11-25',rates)
    assert partial['missing']==1 and not partial['complete'] and partial['total']<q['total']


def test_three_priced_sections_and_pdf_limit():
    q=calculate({'items':[panel()]},20,'2026-11-25')
    g=q['groups']['hardware']
    synthetic=dict(key='fixture',name='Дополнительное крепление',article='TEST',qty=1,unit='шт.',
                   unitPrice=1.2,amount=1.2,photo=None,reason=None)
    g['rows']=[dict(synthetic,article=str(i)) for i in range(150)]
    doc=PdfReader(BytesIO(render('Шкаф с полками',{'items':[panel()]},q)))
    assert len(doc.pages)==10
    all_text=' '.join(page.extract_text() for page in doc.pages)
    assert '25.11.2026' in all_text and 'Прочие позиции' in all_text and 'Наценка' not in all_text


def test_owner_markup_and_dated_snapshot(api,settings,admin_user):
    from backend.v2.db import transaction
    from backend.v2.security import grant, password_hash
    from tests.stage03.test_api import PASSWORD
    terms='/api/v2/account/estimate-settings'
    projects='/api/v2/3d-projects'
    scene={'items':[panel()]}
    assert api.get(terms).json()['markup']==0
    assert api.put(terms,json={'markup':20}).json()['markup']==20
    q=api.post('/api/v2/3d-estimates/preview',json=scene).json()
    created=api.post(projects,json={'name':'Образец','scene':scene})
    assert created.status_code==201,created.text
    pid=created.json()['project_id']
    path=f'{projects}/{pid}/estimates'
    request=dict(version=1,fingerprint=q['fingerprint'])
    response=api.post(path,json=request)
    assert response.status_code==201,response.text
    eid=response.json()['estimate_id']
    assert api.post(path,json=request).json()['estimate_id']==eid
    url=f'{path}/{eid}.pdf'
    original=api.get(url).content
    assert len(PdfReader(BytesIO(original)).pages)==5
    assert api.put(terms,json={'markup':45}).status_code==200
    assert api.post(path,json=request).status_code==409 and api.get(url).content==original
    assert len(api.get(path).json()['items'])==1
    uid=uuid4();email=uid.hex+'@example.invalid'
    with transaction(settings) as conn:
        conn.execute('INSERT INTO mf_users(user_id,email,password_hash,email_verified_at) VALUES(%s,%s,%s,now())',(uid,email,password_hash(PASSWORD)))
        conn.execute("INSERT INTO mf_user_roles VALUES(%s,'manager')",(uid,))
        grant(conn,user_id=uid,permission='orders.draft.write',scope='own',actor=admin_user['user_id'])
    login(api,email)
    assert api.get(terms).json()['markup']==0
    assert api.get(url).status_code==404 and api.get(path).status_code==404
    with transaction(settings) as conn:
        conn.execute("UPDATE mf_user_roles SET role='client' WHERE user_id=%s",(uid,))
    assert api.get(terms).status_code==403
    assert api.post('/api/v2/3d-estimates/preview',json=scene).status_code==403
