"""Corner donor acceptance: actual browser, isolated Postgres, save/reload/export."""
import base64,json,os
from pathlib import Path
from io import BytesIO
import pytest
from pydantic import ValidationError
from pypdf import PdfReader
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels
from tests.webgl.drawer_modules_checks import export_payload
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_document import hardware_for,module_contents,module_materials,render

ID='bazis.b4420a0b4bbc'
SHA='e5145e6878304cde87b0344685ac309ed92302216394e01c6bb2fbdebb5b7b60'

def sample(**changes):
    return dict(item_id='corner',name='НМУ-1000 Д1 L · Мойка',module_type='base_cabinet',bazis_id=ID,bazis_sha256=SHA,
                width=1000,height=820,depth=510,body_height=720,base_height=100,base='plinth',rearServiceGapMm=50,**changes)

def test_corner_api_and_pdf_match_uploaded_parts_and_hardware():
    it=sample();FurnitureItem(**it)
    for patch in [{'width':1232},{'depth':449},{'body_height':590,'height':690},{'rearServiceGapMm':60}]:
        with pytest.raises(ValidationError):FurnitureItem(**(it|patch))
    FurnitureItem(**(it|{'width':1231}))
    rows,_=hardware_for(it);assert [r['qty'] for r in rows]==[6,12,10,3,3,3,3,3,3,5,4,2]
    assert all(not r['article'] for r in rows)
    assert '950' in module_contents(it) and '369' in module_contents(it)
    assert module_materials(it,None,None)==[('Корпус','ЛДСП- БЕЛЫЙ'),('Фасад','Evagloss P004')]
    data=render('Corner verification',{'room':{'width':4200,'depth':3200,'height':2700},'items':[it]}, {})
    reader=PdfReader(BytesIO(data));text='\n'.join(p.extract_text() for p in reader.pages)
    assert 'HCKT' in text and '950' in text and '578' in text
    assert hardware_for(it|{'bazis_sha256':'5bc821b8f246c9e93a777dab38a032d900731b92b14be0839b9c5a5116117764'})[0]==[]

def state(page):
    return page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,c=MF_FURNITURE_CORE;return {
      item:it,parts:c.productionParts(it,p.adapter.template(it)),fronts:c.facadeCells(it,p.adapter.template(it)),
      runs:c.kitchenRuns(p.adapter.items,p.adapter.room),error:c.placementError(it,p.adapter.items,p.adapter.room)};}''')

def shot(page,name):
    out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/corner'));out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/(name+'.png')),full_page=True)
    encoded=base64.b64encode(page.screenshot(type='jpeg',quality=65)).decode()
    print('MF_CORNER_IMAGE_BEGIN '+name,flush=True)
    for i in range(0,len(encoded),3000):print('MF_CORNER_IMAGE '+encoded[i:i+3000],flush=True)
    print('MF_CORNER_IMAGE_END '+name,flush=True)

def test_corner_controls_assembly_save_reload_native(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','catalog');expect(page.locator('#module-catalogue [data-bazis]')).to_have_count(16)
    page.locator(f'[data-bazis="{ID}"]').click();s=state(page);corner_id=s['item']['item_id']
    assert (s['item']['width'],s['item']['height'],s['item']['depth'])==(1000,820,510)
    assert s['error']=='' and len(s['parts'])==11 and s['fronts'][0]['w']==369
    panel(page,'right');expect(page.locator('#rear-service-gap')).to_be_disabled()
    expect(page.locator('#rear-service-gap')).to_have_value('50')
    expect(page.locator('#production-rule-note')).to_contain_text('корпус 950')
    expect(page.locator('#production-hardware-summary')).to_contain_text('HCKT')
    assert 'PRIME' not in page.locator('#production-hardware-summary').inner_text()
    page.locator('#width').fill('1100');page.locator('#width').press('Tab');assert state(page)['fronts'][0]['w']==469
    page.locator('#width').fill('1232');page.locator('#width').press('Tab');assert state(page)['item']['width']==1100
    page.locator('#width').fill('1000');page.locator('#width').press('Tab')
    page.locator('#body-height').fill('800');page.locator('#body-height').press('Tab');assert state(page)['fronts'][0]['h']==796
    page.locator('#body-height').fill('720');page.locator('#body-height').press('Tab')
    page.locator('#toggle-doors').click();assert state(page)['item']['doors_open']
    close_panels(page);page.evaluate("MF_PLANNER.scene.fit('kitchen')");shot(page,'corner-open')
    panel(page,'right');page.locator('#toggle-doors').click()
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
    s=state(page);assert s['item']['rotation']==270 and s['error']==''
    assert s['item']['rearServiceGapMm']==50
    assert len(s['runs'])==2 and sorted(r['countertopActualLengthMm'] for r in s['runs'])==[628,1000]
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid)
    assert saved.status_code==200 and len(saved.json()['scene']['items'])==2
    native=export_payload(page);corner=native['items'][0]
    assert corner['source_file']=='НМУ-1000. Д1 (Мойка) L(1).fr3d' and corner['source_sha256']==SHA
    assert corner['source_default']==corner['target']=={'width':1000,'height':820,'depth':510}
    assert len(corner['construction']['parts'])==11 and len(corner['construction']['legs'])==6
    assert corner['construction']['corner']['wall_gap_mm']==50
    assert corner['construction']['facade']['vertical_gap_mm']==2
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===2')
    assert export_payload(page)['items']==native['items']
    close_panels(page);page.evaluate("MF_PLANNER.scene.fit('kitchen')");shot(page,'corner-l-junction')
    page.evaluate("MF_PLANNER.scene.selectionScope='kitchen';MF_PLANNER.scene.setDisplayMode('facadesHidden')")
    shot(page,'corner-carcass')
