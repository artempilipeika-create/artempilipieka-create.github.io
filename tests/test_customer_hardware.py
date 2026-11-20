from io import BytesIO
from uuid import uuid4

from pypdf import PdfReader
from backend.v2 import customer_hardware as hardware, customer_hardware_pdf as pdf, kitchen_album
from tests.test_wardrobe_lighting_kit import items
from tests.test_kitchen_album import image
from backend.v2.db import transaction
from tests.stage03.test_api import PASSWORD, api, settings, login


def read(data):
    return PdfReader(BytesIO(data))


def test_module_rows_and_photo_sheets_match_the_installed_runs():
    a=items([1400,1400],group='a')
    b=items([1011],group='b')
    for p in a+b:
        p['assistant_carcass']['name']='Шкаф слева' if p in a else 'Шкаф справа'
    for p in a[1:]:
        p['blank_binding']={'mounting':'sekura-95388'}
    scene={'items':[*a,*b]}
    report=hardware.build('Два шкафа',scene)
    left,right=report['modules']
    rows={r['article']:r for r in left['rows']}
    assert left['name']=='Шкаф слева' and right['name']=='Шкаф справа'
    assert rows['95388']['installed']=='8 шт.'
    assert rows['75069']['installed']==rows['89672']['installed']=='2,8 м'
    assert rows['75069']['purchase']=='1 × 5 м · бобина'
    assert rows['89672']['purchase']=='1 × 3 м · хлыст'
    assert left['light_total']=='209,98' and rows['81771']['installed']=='1 шт.'
    assert next(r for r in right['rows'] if r['article']=='75069')['installed']=='1 м'
    standalone=read(pdf.render(report))
    assert sum(len(p.images) for p in standalone.pages)>=9
    pages=[p.extract_text() for p in standalone.pages]
    assert '209,98' in ''.join(pages) and pages[-1].count('Шкаф справа')==1
    album=kitchen_album.render('Два шкафа',scene,{},image(),include_hardware=True)
    assert 'Фурнитура по модулям' in read(album).pages[2].extract_text()


def test_order_draft_freezes_scope_and_reuses_one_revision(api,settings):
    def client():
        email=uuid4().hex+'@example.invalid'
        res=api.post('/api/v2/auth/register',json={'email':email,'password':PASSWORD})
        assert res.status_code==201,res.text
        with transaction(settings) as conn:
            conn.execute('UPDATE mf_users SET email_verified_at=now() WHERE email=%s',(email,))
        login(api,email)
    client()
    scene={'items':[{'item_id':'box','name':'Шкаф у окна','module_type':'wardrobe',
                     'width':800,'height':2000,'depth':600}]}
    project=api.post('/api/v2/3d-projects',json={'name':'Заказ покупателя','scene':scene})
    assert project.status_code==201,project.text
    path='/api/v2/3d-projects/'+project.json()['project_id']
    version=project.json()['version']
    assert api.get(path+'/hardware.pdf',params={'version':version+1}).status_code==409
    assert 'Шкаф у окна' in read(api.get(path+'/hardware.pdf',params={'version':version}).content).pages[0].extract_text()
    body={'version':version,'comment':'Проверить крепления на месте'}
    first=api.post(path+'/hardware-draft',json=body)
    assert first.status_code==201,first.text
    assert api.post(path+'/hardware-draft',json=body).json()==first.json()
    order=first.json()['order_id']
    docs=api.get('/api/v2/account/orders/'+order+'/documents').json()['items']
    assert len(docs)==1 and docs[0]['kind']=='module_hardware'
    url=docs[0]['download_url']
    scene['items'][0]['name']='Шкаф у стены'
    update=api.patch(path,json={'version':version,'name':'Заказ покупателя','scene':scene})
    assert update.status_code==200,update.text
    assert 'Шкаф у стены' in read(api.get(path+'/hardware.pdf',params={'version':update.json()['version']}).content).pages[0].extract_text()
    frozen=read(api.get(url).content).pages[0].extract_text()
    assert 'Шкаф у окна' in frozen and 'Шкаф у стены' not in frozen
    client()
    assert api.get(url).status_code in (403,404)
    assert api.get(path+'/hardware.pdf',params={'version':version}).status_code in (403,404)
