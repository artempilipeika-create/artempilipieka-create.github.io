import base64,json,subprocess
from io import BytesIO
from pathlib import Path
from copy import deepcopy
import pytest
from PIL import Image
from pypdf import PdfReader
from backend.v2.sales_album import render,image_bytes
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
