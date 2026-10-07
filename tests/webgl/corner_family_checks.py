"""Eight corner donors through the grouped UI, API persistence, PDF and native export."""
import base64,json,os
from pathlib import Path
import pytest
from pydantic import ValidationError
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.stage03.test_api import publish
from tests.stage03.support import master
from tests.webgl.navigation import panel,close_panels,CATALOGUE_LABELS
from tests.webgl.door_families_checks import selected,choose_material
from tests.webgl.drawer_modules_checks import export_payload
from backend.v2.three_d_corner import VARIANTS
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_document import hardware_for,module_contents,module_materials,render
from pypdf import PdfReader
from io import BytesIO

def choose(page,key,value):
    panel(page,'right')
    page.locator(f'[data-corner-option="{key}"][data-corner-value="{value}"]').click()

def shot(page,name):
    out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/corner-family'));out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/(name+'.png')),full_page=True)
    data=base64.b64encode(page.screenshot(type='jpeg',quality=70)).decode()
    print('MF_CORNER_FAMILY_IMAGE_BEGIN '+name,flush=True)
    for i in range(0,len(data),3000):print('MF_CORNER_FAMILY_IMAGE '+data[i:i+3000],flush=True)
    print('MF_CORNER_FAMILY_IMAGE_END '+name,flush=True)

def test_eight_variants_keep_data_history_save_reload_and_export(page,api,settings,admin_user):
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ['W1000 ST9','U999 ST7']]))
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','catalog')
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==CATALOGUE_LABELS
    for v in VARIANTS:
        page.locator('#module-search').fill(v['source_file'])
        expect(page.locator('#module-catalogue .mf3d-module:visible')).to_have_count(1)
        expect(page.locator('#module-catalogue .mf3d-module:visible strong')).to_have_text('Нижний угловой шкаф')
    page.locator('#module-search').fill('')
    page.locator('[data-bazis="'+VARIANTS[0]['id']+'"]').click();panel(page,'right')
    expect(page.locator('#corner-options-controls')).to_be_visible();expect(page.locator('#door-opening-controls')).to_be_hidden()
    page.locator('#studio-item-name').fill('Угол у окна');page.locator('#studio-item-name').press('Tab')
    page.locator('#width').fill('1100');page.locator('#width').press('Tab')
    page.locator('#body-height').fill('800');page.locator('#body-height').press('Tab')
    choose_material(page,'body','W1000 ST9');choose_material(page,'front','U999 ST7')
    baseline=selected(page)
    # One deliberate change is exactly one undo step, including the source hash.
    count=page.evaluate('MF_PLANNER.history.undoStack.length');choose(page,'side','right');right=selected(page)
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==count+1
    choose(page,'side','right');assert page.evaluate('MF_PLANNER.history.undoStack.length')==count+1
    close_panels(page);page.locator('#planner-undo').click();assert selected(page)==baseline
    page.locator('#planner-redo').click();assert selected(page)==right
    payloads=[]
    for index in [0,1,3,2,6,7,5,4]:
        v=VARIANTS[index]
        for key in ['side','purpose','door_count']:choose(page,key,v[key])
        it=selected(page)
        assert it['bazis_id']==v['id'] and it['bazis_sha256']==v['source_sha256'] and it['bazis_file']==v['source_file']
        for key in ['item_id','name','width','height','depth','body_height','x','z','rotation','body_variant_id','front_variant_id']:assert it[key]==baseline[key],key
        for key in ['side','purpose','door_count']:expect(page.locator(f'[data-corner-option="{key}"][data-corner-value="{v[key]}"]')).to_have_attribute('aria-pressed','true')
        expect(page.locator('#production-shelf-controls')).to_be_visible() if v['purpose']=='shelf' else expect(page.locator('#production-shelf-controls')).to_be_hidden()
        native=export_payload(page)['items'][0];payloads.append(native)
        assert native['source_sha256']==v['source_sha256'] and native['source_file']==v['source_file']
        p=native['construction']['parts'];fronts=[x for x in p if x['role']=='front' and not x.get('fixed')]
        assert len(fronts)==v['door_count'] and all(x['length']==797 for x in fronts)
        assert any(x['role']=='shelf' for x in p)==(v['purpose']=='shelf')
        assert any(x['role']=='back' for x in p)==(v['purpose']=='shelf')
        assert native['construction']['hardware']['items']==v['hardware_items']
        assert next(x for x in p if x['key']=='blind-panel')['material']['variant_id']==it['front_variant_id']
        assert next(x for x in p if x['key']=='blind-body')['material']['variant_id']==it['body_variant_id']
    panel(page,'right');page.locator('#width').fill('1300');page.locator('#width').press('Tab')
    before=selected(page);choose(page,'door_count',1);assert selected(page)==before
    page.locator('#width').fill('1100');page.locator('#width').press('Tab')
    choose(page,'side','right');choose(page,'purpose','shelf')
    page.locator('#shelf-position').fill('390');page.locator('#shelf-position').press('Tab')
    shelf=selected(page)['shelves'];choose(page,'purpose','sink');choose(page,'purpose','shelf');assert selected(page)['shelves']==shelf
    page.locator('#toggle-doors').click()
    page.evaluate('document.querySelector(".mf3d-right").scrollTop=0;MF_PLANNER.scene.fit("selected")')
    shot(page,'corner-options-desktop')
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    saved=export_payload(page);pid=page.evaluate('MF_PLANNER.adapter.projectId')
    assert api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]['bazis_id']==VARIANTS[7]['id']
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===1');assert export_payload(page)['items']==saved['items']
    close_panels(page);page.set_viewport_size({'width':390,'height':844});panel(page,'right')
    choose(page,'side','left');choose(page,'door_count',1);choose(page,'purpose','sink')
    assert selected(page)['bazis_id']==VARIANTS[0]['id']
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.evaluate('document.querySelector(".mf3d-right").scrollTop=0');shot(page,'corner-options-mobile')

@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['label'])
def test_corner_pdf_hardware_and_api_constraints(v):
    it=dict(item_id='test',name=v['label'],bazis_id=v['id'],bazis_sha256=v['source_sha256'],module_type='base_cabinet',
            width=1000,height=820,depth=510,body_height=720,base_height=100,base='plinth',rearServiceGapMm=50)
    FurnitureItem(**it)
    for patch in [{'width':1232 if v['door_count']==1 else 1835},{'depth':449},{'height':699,'body_height':599},{'rearServiceGapMm':60}]:
        with pytest.raises(ValidationError):FurnitureItem(**(it|patch))
    rows,_=hardware_for(it);assert [(r['name'],r['qty']) for r in rows]==[(r['name'],r['quantity']) for r in v['hardware_items']]
    assert len(module_materials(it,None,None))==(3 if v['purpose']=='shelf' else 2)
    data=render('Corner family',{'items':[it]},{});text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
    assert 'HCKT' in text and ('PRIME' in text)==(v['door_count']==2)
    assert '120' in module_contents(it) and '458' in module_contents(it)
