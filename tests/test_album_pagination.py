"""A complete kitchen must not need to be reduced to fit the client PDF."""
import base64
from contextlib import contextmanager
from copy import deepcopy
from io import BytesIO
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader

from backend.v2 import kitchen_album, material_visuals, three_d_api as api
from tests.test_album_pdf_recovery import kitchen
from tests.test_kitchen_album import image


FIELDS=('body_variant_id','front_variant_id','plinthMaterialId','countertopMaterialId')


def test_paginated_album_embeds_the_original_jpeg_stream_without_recompression():
    photo=Image.new('RGB',(600,400))
    photo.putdata([((x*17+y)%256,(x+y*31)%256,(x*7+y*13)%256) for y in range(400) for x in range(600)])
    source=BytesIO();photo.save(source,'JPEG',quality=92,subsampling=0);jpeg=source.getvalue()
    scene,names,visuals=mixed_materials(3)
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',scene,names,jpeg,material_visuals=visuals)))
    # Inspect the embedded DCT stream: image-extraction helpers can re-encode JPEGs.
    objects=list(pdf.pages[0]['/Resources']['/XObject'].values())
    assert len(objects)==1 and objects[0].get_object().get_data()==jpeg


def mixed_materials(count):
    scene=kitchen(count);names={};visuals={}
    for n,item in enumerate(scene['items']):
        for field in FIELDS:
            ident=f'{field}-{n}'
            item[field]=ident
            names[ident]=f'EGGER · H1180 ST37 · Дуб Галифакс натуральный для кухни · Декор-{field}-{n:03d}'
            visuals[ident]=material_visuals.visual_metadata({'manufacturer':'EGGER','article':'H1180 ST37'})
    return scene,names,visuals


@pytest.mark.parametrize('count',[3,11,35])
def test_every_material_and_module_survives_continuations_with_original_photo(count):
    scene,names,visuals=mixed_materials(count);before=deepcopy(scene);jpeg=image()
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',scene,names,jpeg,material_visuals=visuals)))
    assert len(pdf.pages)>4 and scene==before
    assert pdf.pages[0].images[0].data==jpeg
    assert len(pdf.pages[1].images)==0
    texts=[p.extract_text() for p in pdf.pages]
    schedule_start=next(n for n,t in enumerate(texts,1) if 'Ваша кухня. Ваш комплект.' in t)
    material_text=' '.join(' '.join(t.split()) for t in texts[2:schedule_start-1])
    for name in names.values():assert material_text.count(name)==1
    assert material_text.count('Текстура материала')==len(names)
    assert all(len(p.images)>0 for p in pdf.pages[2:schedule_start-1])
    assert all(f'{n:02d} / {len(pdf.pages):02d}' in t for n,t in enumerate(texts,1) if n>1)
    reference=f'лист {schedule_start}' if schedule_start==len(pdf.pages) else f'листы {schedule_start}–{len(pdf.pages)}'
    assert reference in texts[1]
    schedule_text=' '.join(texts[schedule_start-1:])
    assert schedule_text.count('600 × 820 × 510 мм')==count
    for n in range(count):assert f'{n+1}. Нижний шкаф с ящиками {n+1}\n' in schedule_text
    assert schedule_text.count('После расчёта')==1


def test_single_long_catalogue_name_continues_at_readable_size_without_truncation():
    scene=kitchen(1);scene['items'][0]['body_variant_id']='long'
    words=[f'декор{n:03d}' for n in range(240)]
    pdf=PdfReader(BytesIO(kitchen_album.render('Кухня',scene,{'long':' '.join(words)},image())))
    assert len(pdf.pages)>4
    text=' '.join(p.extract_text() for p in pdf.pages[2:-1])
    for word in words:assert text.count(word)==1
    assert 'Текстура не добавлена' in text


def test_material_overflow_preflight_and_pdf_succeed_without_a_paid_request(monkeypatch):
    pid,release=uuid4(),uuid4();scene=kitchen(11);records={}
    for n,item in enumerate(scene['items']):
        for field in FIELDS:
            mid=uuid4();item[field]=str(mid)
            records[mid]={'variant_id':str(mid),'kind':'material','manufacturer':'EGGER',
                'article':'H1180 ST37','name':f'Дуб Галифакс натуральный · Выбранный-{field}-{n:03d}'}
    row={'version':3,'name':'Кухня','scene':scene}
    class Connection:
        def execute(self,sql,params):
            if 'mf_catalogue_items' in sql:
                assert params[0]==release
                self.found={'snapshot':records[params[1]]}
            else:
                assert 'owner_user_id' in sql and params==(pid,'owner')
                self.found=row
            return self
        def fetchone(self):return self.found
    @contextmanager
    def transaction(_):yield Connection()
    monkeypatch.setattr(api,'transaction',transaction)
    monkeypatch.setattr(api,'identity',lambda *a:{'user_id':'owner'})
    monkeypatch.setattr(api,'require',lambda *a:None)
    monkeypatch.setattr(api.catalogue,'active',lambda *a:release)
    monkeypatch.setattr(api.sales_render,'generate',lambda *a,**kw:pytest.fail('No paid generation'))
    app=FastAPI();app.include_router(api.router(None));jpeg=image()
    encoded='data:image/jpeg;base64,'+base64.b64encode(jpeg).decode()
    with TestClient(app) as client:
        assert client.post(f'/api/v2/3d-projects/{pid}/sales-album/preflight',json={'version':3}).json()=={'ok':True}
        for _ in range(2):
            response=client.post(f'/api/v2/3d-projects/{pid}/sales-album.pdf',json={
                'version':3,'layout':'client','hero_data_url':encoded,'photo':True})
            assert response.status_code==200,response.text
            pdf=PdfReader(BytesIO(response.content));assert len(pdf.pages)>4
            text=' '.join(' '.join(p.extract_text().split()) for p in pdf.pages)
            for record in records.values():assert text.count(record['name'])==1
            assert pdf.pages[0].images[0].data==jpeg
