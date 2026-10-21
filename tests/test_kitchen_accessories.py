import json
from io import BytesIO
from pathlib import Path
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from backend.v2.three_d_api import FurnitureItem,Scene
from backend.v2.three_d_accessories import BY_ID,dishwasher_contents,plinth_summary
from backend.v2.three_d_document import render

def item(v):
 return dict(item_id=v['id'],name='Посудомойка',module_type='base_cabinet',bazis_id=v['id'],bazis_file=v['source_file'],bazis_sha256=v['source_sha256'],width=600,height=820,depth=510,body_height=720,base_height=100,base='legs',x=0,z=0,rotation=0)

@pytest.mark.parametrize('v',BY_ID.values())
def test_dishwasher_save_and_identity(v):
 saved=FurnitureItem(**dict(item(v),bazis_file='old.fr3d')).model_dump()
 assert saved['bazis_file']==v['source_file'] and saved['bazis_resize'] and saved['drawers']==0
 assert ('688.5' if v['variant']=='gola' else '717') in dishwasher_contents(saved)
 for patch in [dict(bazis_sha256='0'*64),dict(width=700),dict(base_height=80,body_height=740),dict(module_type='wall_cabinet')]:
  with pytest.raises(ValidationError):FurnitureItem(**dict(item(v),**patch))

def test_saved_plinth_settings_and_pdf():
 a,b=[item(v) for v in BY_ID.values()];a['x']=-300;b['x']=300
 plinth=dict(id='plinth-1',members=[a['item_id'],b['item_id']],shape='u',width=1250,depth=450,height=100,inset=40,material_id='11111111-1111-4111-8111-111111111111')
 saved=Scene(items=[a,b],plinths=[plinth]).model_dump(mode='json')
 assert saved['plinths']==[plinth]
 assert '1214 × 100 × 18' in plinth_summary(saved,plinth)
 data=render('Цоколь и ПМ',saved,{plinth['material_id']:'Материал цоколя 18 мм'})
 text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
 for expected in ['Цоколи по рядам','1214 × 100 × 18','100 × 450 × 18','Материал цоколя 18 мм','Без мебельного корпуса']:
  assert expected in text
 Path('/tmp/mf-accessories-qa.pdf').write_bytes(data)
 for patch in [dict(shape='bad'),dict(inset=-1),dict(width=0),dict(height=301)]:
  with pytest.raises(ValidationError):Scene(items=[a,b],plinths=[dict(plinth,**patch)])

def test_served_assets_are_allowlisted_without_enabling_other_paths():
 from fastapi import FastAPI
 from fastapi.testclient import TestClient
 from backend.v2.cabinet_ui import router
 from backend.v2.three_d_accessories import VARIANTS
 import hashlib
 app=FastAPI();app.include_router(router());client=TestClient(app)
 for asset in ['accessories.js','accessories.css','accessory-ui.mjs','accessory-variants.js','accessory-variants.json']:
  r=client.get('/account/planner/'+asset);assert r.status_code==200 and r.content
 for v in VARIANTS:
  r=client.get('/account/planner/accessory-sources/'+v['source_file']);assert r.status_code==200
  assert hashlib.sha256(r.content).hexdigest()==v['source_sha256']
 assert client.get('/account/planner/accessory-sources/unknown.fr3d').status_code==404
