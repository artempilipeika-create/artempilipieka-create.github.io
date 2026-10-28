from contextlib import contextmanager
from copy import deepcopy
from io import BytesIO
from uuid import uuid4
import base64
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pypdf import PdfReader
from backend.v2 import kitchen_album, three_d_api as api
from tests.test_kitchen_album import image


def kitchen(count=11):
    return {'albumSettings':{'order_number':'МФ-125'},'items':[
        dict(item_id=str(i),name=f'Нижний шкаф с ящиками {i+1}',module_type='base_cabinet',
             width=600,height=820,depth=510,x=i*600,z=0,rotation=0,worktop_thickness=38)
        for i in range(count)]}


@pytest.mark.parametrize('count',[11,12,13,16])
def test_full_module_list_fits_four_pages_without_losing_names_or_numbers(count):
    scene=kitchen(count);before=deepcopy(scene)
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',scene,{},image())))
    assert len(pdf.pages)==4 and scene==before
    text=pdf.pages[3].extract_text()
    for i in range(count):assert f'{i+1}. Нижний шкаф с ящиками {i+1}' in text
    assert text.count('600 × 820 × 510 мм')==count
    assert 'После расчёта' in text and 'Для самостоятельной сборки' in text
    assert len(pdf.pages[0].images)==1 and len(pdf.pages[1].images)==0


def test_preflight_checks_saved_layout_and_pdf_retry_reuses_original_image(monkeypatch):
    pid=uuid4();row={'version':3,'name':'Кухня','scene':kitchen()};auth={'ok':True}
    class Connection:
        def execute(self,sql,params):
            assert 'owner_user_id' in sql
            self.found=row if params==(pid,'owner') else None;return self
        def fetchone(self):return self.found
    @contextmanager
    def transaction(_):yield Connection()
    def identity(*_):
        if not auth['ok']:raise HTTPException(401)
        return {'user_id':'owner'}
    monkeypatch.setattr(api,'transaction',transaction);monkeypatch.setattr(api,'identity',identity)
    monkeypatch.setattr(api,'require',lambda *a:None);monkeypatch.setattr(api.catalogue,'active',lambda *a:None)
    monkeypatch.setattr(api.sales_render,'generate',lambda *a,**kw:pytest.fail('No paid generation during preflight or retry'))
    app=FastAPI();app.include_router(api.router(None));client=TestClient(app)
    url=f'/api/v2/3d-projects/{pid}/sales-album/preflight'
    assert client.post(url,json={'version':3}).json()=={'ok':True}
    assert client.post(url,json={'version':2}).status_code==409
    assert client.post(url.replace(str(pid),str(uuid4())),json={'version':3}).status_code==404
    jpeg=image();encoded='data:image/jpeg;base64,'+base64.b64encode(jpeg).decode()
    for _ in range(2):
        response=client.post(f'/api/v2/3d-projects/{pid}/sales-album.pdf',json={
            'version':3,'layout':'client','hero_data_url':encoded,'photo':True})
        assert response.status_code==200,response.text
        pdf=PdfReader(BytesIO(response.content));assert len(pdf.pages)==4
        assert pdf.pages[0].images[0].data==jpeg
    row['scene']=kitchen(35)
    response=client.post(url,json={'version':3});assert response.status_code==400
    assert 'Список модулей' in response.json()['detail']['code']
    auth['ok']=False;assert client.post(url,json={'version':3}).status_code==401
