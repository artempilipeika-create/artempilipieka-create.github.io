import base64,json,subprocess
from io import BytesIO
from pathlib import Path
from copy import deepcopy
import pytest
from PIL import Image
from pypdf import PdfReader
from backend.v2.sales_album import render,image_bytes,client_title
from backend.v2.sales_hardware import LEGACY,ledger,module_hardware
from backend.v2 import sales_render

ROOT=Path(__file__).resolve().parents[1]

def item(bid,p,**kw):
    return dict(item_id=bid,name=p['label'],bazis_id=bid,bazis_sha256=p['source_sha256'],module_type='wall_cabinet' if p['tier']=='wall' else 'base_cabinet',**p['native_defaults'],**kw)

def preview():
    out=BytesIO();Image.new('RGB',(500,300),'#c0b49a').save(out,'PNG');return out.getvalue()

def test_registry_and_legacy_hardware_parity():
    subprocess.run(['node','scripts/export-sales-hardware.mjs','--check'],cwd=ROOT,check=True)
    cases=[]
    for bid,p in LEGACY.items():
        for h,d in [(p['native_defaults']['height'],510),(900,450),(1000,600)]:
            it=item(bid,p);it.update(height=h,depth=d);cases.append(it)
    script="""import fs from 'node:fs';import {productionHardware} from './backend/v2/cabinet_assets/planner/furniture-core.mjs';
    const cases=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(cases.map(it=>productionHardware(it))));"""
    data=json.loads(subprocess.check_output(['node','--input-type=module','-e',script],input=json.dumps(cases).encode(),cwd=ROOT))
    for it,hw in zip(cases,data):
        actual,_=module_hardware(it)
        for row in hw['items']:
            r=next(x for x in actual if x['name']==row['name'])
            assert r['qty']==row['quantity']
        if hw.get('hinge_count'):
            assert sum(x['qty'] for x in actual if x['name'].startswith('Петля'))==hw['hinge_count']
        if hw.get('drawer_count'):
            guides=[r for r in actual if r['name'].startswith('Направляющие')]
            assert len(guides)==1 and guides[0]['qty']==hw['drawer_count'] and guides[0]['unit']=='pair'
            assert str(hw['slide_length_mm']) in guides[0]['name']

def test_disabled_shelf_unknown_revision_and_zero(monkeypatch):
    bid='bazis.784bf9af84f8';p=LEGACY[bid];it=item(bid,p,shelves=[dict(enabled=False)])
    rows,notes=module_hardware(it);assert not any('Полкодержатель' in r['name'] for r in rows)
    it['bazis_sha256']='unknown';assert module_hardware(it)[0]==[] and module_hardware(it)[1]
    monkeypatch.setattr('backend.v2.sales_hardware.module_hardware',lambda it:([dict(name='Zero',qty=0,unit='pcs',article='')],[]))
    assert ledger({'items':[it]})[0][0]['qty']==0

def test_five_pages_all_rows_materials_and_overflow():
    ids=['bazis.5731630ddd87','bazis.39f282e08f0c','bazis.9e77f4333545','bazis.784bf9af84f8','bazis.877ba2f68d92','bazis.877ba2f68d92','bazis.2175c60e84a6']
    items=[item(bid,LEGACY[bid],front_variant_id='front',body_variant_id='body',handles='handles') for bid in ids]
    scene={'items':items};rows,_=ledger(scene)
    pdf=PdfReader(BytesIO(render('Тест <&>',scene,{'front':'890 PO','body':'605 PO'},preview())))
    assert len(pdf.pages)==5
    all_text='\n'.join(p.extract_text() for p in pdf.pages)
    assert 'Инструкция' not in all_text and '890 PO' in all_text and '605 PO' in all_text
    for r in rows:assert r['name'] in all_text.replace('\n',' ')
    assert sum(r['qty'] for r in rows if r['unit']=='pair')==3
    assert sum(r['qty'] for r in rows if r['name'].startswith('Петля'))==16
    assert sum(r['qty'] for r in rows if r['name'].startswith('Ручка'))==11
    with pytest.raises(ValueError,match='не помещается'):
        render('Large',{'items':items*5},{},preview())

def test_images_and_no_automatic_provider_without_key(monkeypatch):
    good='data:image/png;base64,'+base64.b64encode(preview()).decode()
    assert image_bytes(good).startswith(b'\xff\xd8')
    for bad in ['https://example.com/photo.png','data:image/png;base64,broken','data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\nfake').decode()]:
        with pytest.raises(ValueError):image_bytes(bad)
    monkeypatch.delenv('MF_IMAGE_API_KEY',raising=False);assert not sales_render.available()
    with pytest.raises(ValueError,match='не подключён'):sales_render.generate('owner',{}, {},good)

def test_sales_routes_authorization_revision_and_pdf(monkeypatch):
    from contextlib import contextmanager
    from uuid import UUID
    from fastapi import FastAPI,HTTPException
    from fastapi.testclient import TestClient
    import backend.v2.three_d_api as api
    pid=UUID('11111111-1111-4111-8111-111111111111')
    bid='bazis.877ba2f68d92';row={'version':3,'name':'Project','scene':{'items':[item(bid,LEGACY[bid])]}}
    auth={'ok':True};checks=[]
    class Connection:
        def execute(self,sql,params):
            assert 'owner_user_id' in sql
            checks.append(params)
            self.found=row if params==(pid,'owner') else None
            return self
        def fetchone(self):return self.found
    @contextmanager
    def transaction(_):yield Connection()
    def identity(conn,req):
        if not auth['ok']:raise HTTPException(401)
        return {'user_id':'owner'}
    monkeypatch.setattr(api,'transaction',transaction);monkeypatch.setattr(api,'identity',identity)
    monkeypatch.setattr(api,'require',lambda *args:None);monkeypatch.setattr(api.catalogue,'active',lambda conn:None)
    monkeypatch.delenv('MF_IMAGE_API_KEY',raising=False)
    app=FastAPI();app.include_router(api.router(None));client=TestClient(app)
    payload={'version':3,'hero_data_url':'data:image/png;base64,'+base64.b64encode(preview()).decode(),'photo':False}
    url=f'/api/v2/3d-projects/{pid}/sales-album.pdf'
    r=client.post(url,json=payload);assert r.status_code==200 and len(PdfReader(BytesIO(r.content)).pages)==5
    assert client.post(url,json={**payload,'version':2}).status_code==409
    assert client.post(url.replace(str(pid),'22222222-2222-4222-8222-222222222222'),json=payload).status_code==404
    assert client.get('/api/v2/3d-sales-capabilities').json()['automatic_render'] is False
    auth['ok']=False;assert client.post(url,json=payload).status_code==401
    assert client.get('/api/v2/3d-sales-capabilities').status_code==401
    assert checks


def test_purchase_ledger_uses_parent_aq_kits_and_merges_slide_pairs():
    from backend.v2.three_d_gola import VARIANTS
    from backend.v2.three_d_tall import APPLIANCE_VARIANTS
    aq=next(v for v in VARIANTS if v['kind']=='drawers' and v['system']=='aq' and v['layout']=='three')
    ball=next(v for v in VARIANTS if v['kind']=='drawers' and v['system']=='ball' and v['layout']=='two')
    tall=next(v for v in APPLIANCE_VARIANTS if v['drawer'] and v['microwave'] and v['row_height']==820)
    def native(v,**kw):
        return dict(bazis_id=v['id'],bazis_sha256=v['source_sha256'],width=600,height=820,depth=510,module_type='base_cabinet',legHeightMm=100,**kw)
    t=native(tall);t.update(height=2100,depth=600,module_type='tall_cabinet')
    scene={'items':[native(ball),native(ball),native(aq),t]}
    before=deepcopy(scene)
    raw,_=module_hardware(scene['items'][2])
    assert any(r['name'].startswith('AQ LineBox Царга') for r in raw)
    rows,notes=ledger(scene)
    assert scene==before
    assert not any(r['name'].startswith(('AQ LineBox','Заглушка AQ','Ограничитель высоты')) for r in rows)
    assert next(r for r in rows if r['article']=='12.0068')['qty']==1
    assert next(r for r in rows if r['article']=='12.0062')['qty']==2
    slides=[r for r in rows if r['article']=='114797']
    assert len(slides)==1 and slides[0]['qty']==5 and slides[0]['unit']=='set'
    assert slides[0]['modules']==['М1: 2','М2: 2','М4: 1']
    assert any('повторно не закупать' in n for n in notes)
    assert next(r for r in rows if r['article']=='81320')['qty']==118


def test_unresolved_countertop_stops_before_paid_request(monkeypatch):
    monkeypatch.setenv('MF_IMAGE_API_KEY','synthetic-test-key')
    monkeypatch.setattr(sales_render.httpx,'Client',lambda *a,**kw:pytest.fail('Provider must not be called'))
    with pytest.raises(ValueError,match='выберите материал столешницы: М1'):
        sales_render.generate('test',{'items':[{'module_type':'base_cabinet'}]}, {}, None)
    sales_render.validate_render_scene({'items':[{'module_type':'base_cabinet','countertopMaterialId':'stone'}]}, {'stone':'Stone'})
    sales_render.validate_render_scene({'items':[{'module_type':'wall_cabinet'}]}, {})
    sales_render.validate_render_scene({'items':[{'module_type':'base_cabinet','countertopEnabled':False}]}, {})


def test_client_album_technical_name_and_unapproved_visual_details():
    assert client_title('QA_Equipment_Drag_20261024_new')=='Кухня · индивидуальный проект'
    assert client_title('Кухня Жанны')=='Кухня Жанны'
    bid='bazis.39f282e08f0c'
    pdf=PdfReader(BytesIO(render('QA_Equipment_Drag_20261024_new',{'items':[item(bid,LEGACY[bid])]}, {},preview())))
    text=' '.join(p.extract_text() for p in pdf.pages)
    assert 'QA_Equipment' not in text and 'QA_Equipment' not in pdf.metadata.title
    assert 'Столешница не согласована' in text and 'Подсветка на визуализации' in text
    assert 'Комплект шариковых направляющих = пара' in text
