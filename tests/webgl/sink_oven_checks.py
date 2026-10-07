"""Source-specific geometry, public controls, persistence, export and API boundary."""
import json,os,base64
from pathlib import Path
import pytest
from pydantic import ValidationError
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels,add_production_variant,CATALOGUE_LABELS
from tests.webgl.drawer_modules_checks import export_payload
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_document import hardware_for,module_contents

IDS=['bazis.facfa0cd038b','bazis.b226370aab54','bazis.5731630ddd87','bazis.9e77f4333545']
OVEN=IDS[-1]

def sample(bid,width=600):
 return dict(item_id='test',name='test',module_type='base_cabinet',bazis_id=bid,width=width,height=820,body_height=720,base_height=100,depth=500,base='plinth',layout='niche' if bid==OVEN else 'doors')

def test_api_rejects_forbidden_widths_and_hardware_has_no_invented_articles():
 for bid in IDS:
  FurnitureItem(**sample(bid))
 for bid in IDS[:2]+['bazis.0211e4f77fc4','bazis.858266606bc5','bazis.b89bf9852860']:
  with pytest.raises(ValidationError):FurnitureItem(**sample(bid,601))
 for width in [599,601]:
  with pytest.raises(ValidationError):FurnitureItem(**sample(OVEN,width))
 for bid in IDS:
  rows,_=hardware_for(sample(bid));assert rows and all(not r['article'] for r in rows)
 assert '595' in module_contents(sample(OVEN))
 assert hardware_for(sample(IDS[2]))[0][6]['qty']==4

def geometry(page):
 return page.evaluate('''()=>{const it=MF_PLANNER.adapter.selected,t=MF_PLANNER.adapter.template(it),c=MF_FURNITURE_CORE;
 const parts=c.productionParts(it,t),divider=parts.find(p=>p.key==='oven-divider');return {id:it.item_id,width:it.width,height:it.height,
 body:it.body_height,niche:divider?it.height-divider.position.y-divider.size.y/2:null,parts,cells:c.facadeCells(it,t)};}''')

def test_sink_oven_controls_save_reload_export(page,api,settings,admin_user):
 login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
 expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
 panel(page,'left','catalog');expect(page.locator('#module-catalogue [data-bazis]')).to_have_count(12)
 for bid in IDS:
  add_production_variant(page,bid)
  state=geometry(page);assert state['width']==600
  if bid!=OVEN:
   assert len([p for p in state['parts'] if p['key'].startswith('rail-')])==3
   assert not [p for p in state['parts'] if p['role'] in ['shelf','back']]
   if bid in IDS[:2]:
    panel(page,'right');expect(page.locator('#width')).to_have_attribute('max','600')
    page.locator('#width').fill('601');page.locator('#width').press('Tab');assert geometry(page)['width']==600
   continue
  assert state['niche']==595;assert state['cells'][0]['h']==122
  panel(page,'right');expect(page.locator('#width')).to_be_disabled()
  expect(page.locator('#production-rule-note')).to_contain_text('595')
  page.locator('#leg-height').select_option('80')
  assert geometry(page)['niche']==595 and geometry(page)['height']==800
  page.locator('#body-height').fill('800');page.locator('#body-height').press('Tab')
  assert geometry(page)['niche']==595 and geometry(page)['cells'][0]['h']==202
  page.locator('#leg-height').select_option('150')
  assert geometry(page)['niche']==595 and geometry(page)['height']==950
  expect(page.locator('#production-hardware-summary')).to_contain_text('AKS PLUS')
  assert 'с доводчиком' not in page.locator('#production-hardware-summary').inner_text()
 close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
 pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid);assert saved.status_code==200
 assert [x['bazis_id'] for x in saved.json()['scene']['items']]==IDS
 native=export_payload(page);assert [x['bazis_id'] for x in native['items']]==IDS
 oven=native['items'][-1];assert oven['source_file']=='НШД-600. 595мм (1).fr3d'
 assert oven['target']=={'width':600,'height':900,'depth':500}
 assert oven['construction']['constraints']['niche_height_mm']==595
 assert len(oven['construction']['parts'])==10
 page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
 panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
 page.wait_for_function('()=>MF_PLANNER.adapter.items.length===4')
 assert export_payload(page)['items']==native['items']
 # Show the physical parts without facades for screenshot review.
 page.evaluate("MF_PLANNER.scene.selectionScope='kitchen'; MF_PLANNER.scene.setDisplayMode('facadesHidden'); MF_PLANNER.scene.fit('kitchen')")
 close_panels(page)
 out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/sink-oven'));out.mkdir(parents=True,exist_ok=True)
 page.screenshot(path=str(out/'sink-oven.png'),full_page=True)
 encoded=base64.b64encode(page.screenshot(type='jpeg',quality=65)).decode()
 print('MF_MODULES_IMAGE_BEGIN')
 for i in range(0,len(encoded),3000):print('MF_MODULES_IMAGE '+encoded[i:i+3000])
 print('MF_MODULES_IMAGE_END')
