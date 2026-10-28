import base64
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID, uuid4
import threading
import pytest
from PIL import Image
from pypdf import PdfReader
from backend.v2 import kitchen_album, sales_render_store, sales_render


def image():
    out=BytesIO();Image.new('RGB',(600,400),'#b9aa8b').save(out,'JPEG');return out.getvalue()


def scene():
    return {'items':[dict(item_id='unit',module_type='base_cabinet',width=600,height=820,depth=600,
                         body_variant_id='body',front_variant_id='front',countertopMaterialId='stone')]}


def test_client_album_four_pages_no_private_costs_or_false_price():
    data=scene();data['items'][0].update(bazis_file='PRIVATE_FILE.b3d',procurement_cost=430.32)
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня Анны',data,{'body':'Белый 605 PO','front':'Дуб 890 PO','stone':'Камень'},image(),image())))
    assert len(pdf.pages)==4
    assert float(pdf.pages[0].mediabox.width)==pytest.approx(841.89,abs=.1)
    text=' '.join(p.extract_text() for p in pdf.pages)
    assert all(v in text for v in ['Кухня Анны','Белый 605 PO','Дуб 890 PO','Камень','После расчёта','самостоятельной сборки'])
    assert 'PRIVATE_FILE' not in text and '430.32' not in text and '590' not in text
    assert 'Материал требует выбора' in text


def test_client_material_overflow_continues_without_losing_names():
    data=scene();data['items']=[{**data['items'][0],'body_variant_id':str(i)} for i in range(30)]
    names={str(i):f'Материал №{i:02d}' for i in range(30)}
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',data,names,image())))
    assert len(pdf.pages)>4
    text=' '.join(p.extract_text() for p in pdf.pages[2:-1])
    assert all(text.count(name)==1 for name in names.values())
    assert 'КОРПУС · ПРОДОЛЖЕНИЕ' in text
    assert 'После расчёта' in pdf.pages[-1].extract_text()


def test_receipt_is_persistent_and_never_repeats_a_failed_or_ready_request(tmp_path):
    owner,pid,rid='owner',uuid4(),uuid4();calls=[]
    def generate():calls.append(1);return 'image'
    args=tmp_path,owner,pid,rid,3,'preview',generate
    result=sales_render_store.once(*args)
    assert result['state']=='ready'
    assert sales_render_store.once(*args)==result and calls==[1]
    assert sales_render_store.read(tmp_path,'other',pid,rid) is None
    with pytest.raises(ValueError,match='другому виду'):
        sales_render_store.once(tmp_path,owner,pid,rid,4,'preview',generate)
    def failed():calls.append(2);raise ValueError('Provider rejected')
    args=tmp_path,owner,pid,uuid4(),3,'preview',failed
    assert sales_render_store.once(*args)['state']=='failed'
    assert sales_render_store.once(*args)['state']=='failed' and calls==[1,2]


def test_concurrent_double_click_and_interrupted_receipt(tmp_path):
    entered,release=threading.Event(),threading.Event();calls=[]
    def generate():calls.append(1);entered.set();assert release.wait(3);return 'image'
    args=tmp_path,'owner',uuid4(),uuid4(),3,'preview',generate
    with ThreadPoolExecutor() as executor:
        first=executor.submit(sales_render_store.once,*args);assert entered.wait(3)
        try:assert sales_render_store.once(*args)['state']=='pending'
        finally:release.set()
        assert first.result()['state']=='ready' and calls==[1]
    args=list(args);args[3]=uuid4()
    path=sales_render_store.location(*args[:4]);path.mkdir()
    assert sales_render_store.once(*args)['state']=='pending' and calls==[1]


def test_render_style_is_bound_to_receipt_and_old_catalogue_receipts_still_work(tmp_path):
    owner,pid,rid='owner',uuid4(),uuid4();calls=[]
    args=tmp_path,owner,pid,rid,3,'preview',lambda:calls.append(1) or 'image'
    result=sales_render_store.once(*args,render_style='lived_in')
    assert result['render_style']=='lived_in'
    assert sales_render_store.once(*args,render_style='lived_in')==result and calls==[1]
    with pytest.raises(ValueError,match='другому виду'):
        sales_render_store.once(*args,render_style='catalog')
    assert calls==[1]
    rid=uuid4();path=sales_render_store.location(tmp_path,owner,pid,rid);path.mkdir()
    signature=hashlib.sha256(b'3\npreview').hexdigest()
    (path/'request.json').write_text(json.dumps({'version':3,'signature':signature}))
    (path/'result.json').write_text(json.dumps({'state':'ready','image_data_url':'old image','version':3}))
    old=sales_render_store.once(tmp_path,owner,pid,rid,3,'preview',lambda:pytest.fail('Already paid'))
    assert old['image_data_url']=='old image' and old['render_style']=='catalog'


def test_route_requires_confirmation_ownership_and_current_version(tmp_path,monkeypatch):
    from fastapi import FastAPI,HTTPException
    from fastapi.testclient import TestClient
    import backend.v2.three_d_api as api
    pid=uuid4();row={'version':3,'name':'Кухня','scene':scene()};auth={'ok':True};calls=[];styles=[]
    class Connection:
        def execute(self,sql,params):
            assert 'owner_user_id' in sql
            self.found=row if params==(pid,'owner') else None;return self
        def fetchone(self):return self.found
    @contextmanager
    def transaction(_):yield Connection()
    def identity(conn,req):
        if not auth['ok']:raise HTTPException(401)
        return {'user_id':'owner'}
    encoded='data:image/jpeg;base64,'+base64.b64encode(image()).decode()
    monkeypatch.setattr(api,'transaction',transaction);monkeypatch.setattr(api,'identity',identity)
    monkeypatch.setattr(api,'require',lambda *a:None)
    monkeypatch.setattr(api.catalogue,'active',lambda *a:None)
    row['scene']['items'][0]['countertopEnabled']=False
    def generate(*args):
        calls.append(1);styles.append(args[4]);return encoded
    monkeypatch.setattr(sales_render,'generate',generate)
    app=FastAPI();app.include_router(api.router(SimpleNamespace(storage_root=tmp_path)))
    client=TestClient(app);url=f'/api/v2/3d-projects/{pid}/sales-photo'
    payload={'version':3,'preview_data_url':encoded,'request_id':str(uuid4()),'paid_confirmed':True}
    assert client.post(url,json={**payload,'paid_confirmed':False}).status_code==422
    assert client.post(url,json={**payload,'render_style':'untrusted instructions'}).status_code==422
    assert client.post(url,json={**payload,'version':2}).status_code==409
    assert client.post(url.replace(str(pid),str(uuid4())),json=payload).status_code==404
    assert calls==[]
    assert client.post(url,json=payload).json()['state']=='ready'
    assert client.post(url,json=payload).json()['state']=='ready' and calls==[1]
    assert client.post(url,json={**payload,'render_style':'lived_in'}).json()['state']=='ready'
    assert calls==[1]
    living={**payload,'request_id':str(uuid4()),'render_style':'lived_in'}
    assert client.post(url,json=living).json()['render_style']=='catalog'
    assert calls==[1] and styles==['catalog']
    assert client.get(url).json()['image_data_url']==encoded
    assert client.post(url+'/reuse',json={'version':3,'preview_data_url':encoded}).json()['state']=='ready'
    status=url+'/'+payload['request_id']
    assert client.get(status).json()['image_data_url']==encoded
    row['version']=4
    assert client.get(status).status_code==200
    assert client.post(url,json={**living,'version':4}).json()['state']=='ready' and calls==[1]
    row['version']=5;row['scene']['items'][0]['width']=700
    assert client.get(url).json()['state']=='none'
    assert client.get(status).status_code==409
    auth['ok']=False;assert client.get(status).status_code==401
    assert client.get(url).status_code==401
    assert client.post(url+'/reuse',json={'version':5,'preview_data_url':encoded}).status_code==401


@pytest.mark.parametrize('style',['catalog','lived_in'])
def test_provider_contract_is_one_edit_with_no_automatic_retry(monkeypatch,style):
    captured=[];encoded=base64.b64encode(image()).decode()
    class Client:
        def __init__(self,**kw):pass
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def post(self,url,**kw):
            captured.append((url,kw));return SimpleNamespace(status_code=200,json=lambda:{'data':[{'b64_json':encoded}]})
    monkeypatch.setenv('MF_IMAGE_API_KEY','synthetic-test-key')
    monkeypatch.setenv('MF_IMAGE_MODEL','configured-model')
    monkeypatch.setattr(sales_render.httpx,'Client',Client)
    result=sales_render.generate('owner',scene(),{'stone':'Камень'},'data:image/jpeg;base64,'+encoded,style)
    assert result.startswith('data:image/jpeg;base64,') and len(captured)==1
    url,request=captured[0];assert url=='https://api.openai.com/v1/images/edits'
    assert request['data']['n']=='1' and request['data']['model']=='configured-model'
    assert request['data']['quality']=='high' and request['data']['size']=='1536x1024'
    assert 'Preserve room geometry' in request['data']['prompt']
    assert ('at most three loose objects' in request['data']['prompt'])==(style=='lived_in')
    assert ('Do not add decor' in request['data']['prompt'])==(style=='catalog')
    assert 'never merge separate fronts' in request['data']['prompt']
