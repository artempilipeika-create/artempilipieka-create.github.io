"""Appliance tall choice: real UI, exact donors, persistence, PDF and native export."""
import json
from io import BytesIO
import pytest
from pypdf import PdfReader
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels,CATALOGUE_LABELS
from tests.webgl.tall_checks import screenshot,choose
from tests.webgl.door_families_checks import selected,choose_material
from tests.webgl.drawer_modules_checks import export_payload
from tests.stage03.test_api import publish
from tests.stage03.support import master
from backend.v2.three_d_tall import APPLIANCE_VARIANTS as VARIANTS
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_document import hardware_for,module_contents,render

DEFAULT=next(v['id'] for v in VARIANTS if v['row_height']==820 and v['opening']=='left' and v['layout']=='door_oven')

def choice_layout(page):
    geometry=page.evaluate('''()=>{const root=document.querySelector('#appliance-tall-choice'),panel=document.querySelector('.mf3d-right');return {
      height:root.querySelector('#appliance-tall-preview svg').getBoundingClientRect().height,
      fits:panel.scrollWidth<=panel.clientWidth+1,
      labels:[...root.querySelectorAll('.ap-layouts button')].every(b=>b.scrollWidth<=b.clientWidth+1),
      icons:[...root.querySelectorAll('.ap-option-image svg')].every(s=>s.getBoundingClientRect().height>=80)};}''')
    assert geometry['height']>=150 and geometry['fits'] and geometry['labels'] and geometry['icons'],geometry

def test_designer_brief_persists_and_reaches_native_export_and_order(page,api,settings,admin_user):
    from urllib.parse import urlparse,parse_qs
    from backend.v2.db import connect
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ['W1000 ST9','U999 ST7']]))
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','catalog')
    page.locator(f'[data-bazis="{DEFAULT}"]').click()
    choose(page,'layout','door_oven_micro')
    panel(page,'right')
    page.locator('#appliance-brief-controls summary').click()
    expect(page.locator('#appliance-brief-controls')).to_be_visible()
    page.locator('[data-appliance-kind="oven"][data-appliance-field="mode"]').select_option('model')
    page.locator('[data-appliance-kind="oven"][data-appliance-field="manufacturer"]').fill('Bosch')
    page.locator('[data-appliance-kind="oven"][data-appliance-field="model"]').fill('TEST-HBG-595')
    page.locator('[data-appliance-kind="oven"][data-appliance-field="article"]').fill('ART-595')
    page.locator('[data-appliance-kind="oven"][data-appliance-field="documentation_url"]').fill('https://example.com/installation.pdf')
    page.locator('[data-appliance-kind="oven"][data-appliance-field="documentation_url"]').press('Tab')
    page.locator('#appliance-remarks').fill('Согласовать вентиляцию')
    page.locator('#appliance-remarks').press('Tab')
    page.locator('#item-brief-details summary').click()
    page.locator('#item-production-note').fill('Установить справа от колонны')
    page.locator('#item-production-note').press('Tab')
    page.locator('#production-brief-button').click()
    expect(page.locator('#production-brief-dialog')).to_be_visible()
    page.locator('#production-brief-text').fill('Проверить розетки перед выпуском')
    page.locator('#production-brief-text').press('Tab')
    summary=page.locator('#production-brief-summary').inner_text()
    assert 'Bosch' in summary and 'ART-595' in summary and 'СТАНДАРТНАЯ НИША' in summary
    page.locator('#production-brief-close').click()
    choose_material(page,'body','W1000 ST9')
    choose_material(page,'front','U999 ST7')
    close_panels(page)
    page.locator('#save-project').click()
    expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    saved=api.get('/api/v2/3d-projects/'+pid)
    assert saved.status_code==200,saved.text
    scene=saved.json()['scene'];item=scene['items'][0]
    assert scene['production_note']=='Проверить розетки перед выпуском'
    assert item['production_note']=='Установить справа от колонны'
    assert item['appliance_details']['oven']['article']=='ART-595'
    assert item['appliance_details']['oven']['documentation_url']=='https://example.com/installation.pdf'
    exported=export_payload(page)
    assert exported['project_note']=='Проверить розетки перед выпуском'
    assert 'ART-595' in exported['items'][0]['production_note']
    assert 'https://example.com/installation.pdf' in exported['items'][0]['production_note']
    assert 'Согласовать вентиляцию' in exported['items'][0]['production_note']
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects')
    page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('MF_PLANNER.adapter.items.length===1')
    assert page.evaluate('MF_PLANNER.adapter.state.production_note')=='Проверить розетки перед выпуском'
    close_panels(page)
    page.locator('#to-order').click()
    expect(page.locator('#production-brief-dialog')).to_be_visible()
    expect(page.locator('#production-brief-to-order')).to_be_visible()
    assert 'ART-595' in page.locator('#production-brief-summary').inner_text()
    page.locator('#production-brief-to-order').click()
    page.wait_for_url('**/editor?order=*',timeout=20000)
    order_id=parse_qs(urlparse(page.url).query)['order'][0]
    with connect(settings) as conn:
        rev=conn.execute('SELECT content FROM mf_order_revisions WHERE order_id=%s',(order_id,)).fetchone()
        assert rev and 'ART-595' in rev['content']['comment']
        assert 'Проверить розетки перед выпуском' in rev['content']['comment']
        assert 'https://example.com/installation.pdf' in rev['content']['comment']


def test_appliance_tall_choices_save_reopen_export_history_and_mobile(page,api,settings,admin_user):
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ['W1000 ST9','U999 ST7']]))
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','catalog')
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==CATALOGUE_LABELS
    page.locator('[data-module-filter="tall"]').click();expect(page.locator('#module-catalogue .mf3d-module:visible')).to_have_count(2)
    screenshot(page,'appliance-catalogue')
    page.locator(f'[data-bazis="{DEFAULT}"]').click();panel(page,'right')
    expect(page.locator('#appliance-tall-choice')).to_be_visible()
    expect(page.locator('[data-tall-value="double"]')).to_be_hidden()
    expect(page.locator('#appliance-tall-choice [data-tall-option="layout"]')).to_have_count(4)
    choice_layout(page)
    page.locator('#appliance-tall-height').select_option('2400')
    page.locator('#studio-item-name').fill('Пенал с техникой у окна');page.locator('#studio-item-name').press('Tab')
    choose_material(page,'body','W1000 ST9');choose_material(page,'front','U999 ST7')
    first=selected(page)
    for v in VARIANTS:
        choose(page,'layout',v['layout']);choose(page,'row_height',v['row_height']);choose(page,'opening',v['opening'])
        it=selected(page);assert it['bazis_id']==v['id'] and it['bazis_sha256']==v['source_sha256']
        for k in ['item_id','name','height','width','depth','x','z','rotation','body_variant_id','front_variant_id']:assert it[k]==first[k]
        native=export_payload(page)['items'][0];assert native['source_sha256']==v['source_sha256']
        assert native['source_file']==v['source_file']
        assert native['construction']['tall']['layout']==v['layout']
        ps=native['construction']['parts'];assert len([p for p in ps if p['role']=='front'])==2
        assert not any(p.get('visualOnly') for p in ps)
        mesh=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,r={hinges:[],appliances:[]};p.scene.entries.get(it.item_id).group.traverse(m=>{
          if(m.userData.role==='door-pivot')r.hinges.push(m.userData.hingeSide);if(m.userData.appliance)r.appliances.push(m.userData.appliance);});return r;}''')
        assert mesh['hinges']==[v['opening']]*(1 if v['drawer'] else 2)
        assert len(mesh['appliances'])==(6 if v['microwave'] else 3)
    # Last choice is the 900 right drawer + microwave; exercise the revised 820 pair.
    choose(page,'row_height',820);choose(page,'opening','left')
    before=selected(page);choose(page,'opening','right');after=selected(page)
    close_panels(page);page.locator('#planner-undo').click();assert selected(page)==before
    page.locator('#planner-redo').click();assert selected(page)==after
    panel(page,'right');page.locator('#tall-shelf-plus').click();assert selected(page)['upper_shelf_count']==2
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');assert api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]['bazis_sha256']=='c432f96c661e9687955bb8d5397e43cbe214bbdaccde235f88a9828d1eb47fb1'
    native=export_payload(page)
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click();page.wait_for_function('MF_PLANNER.adapter.items.length===1')
    assert export_payload(page)['items']==native['items']
    panel(page,'right');page.locator('#module-display').select_option('normal');page.evaluate('document.querySelector("#tall-options-controls").scrollIntoView({block:"start"});MF_PLANNER.scene.fit("selected")')
    screenshot(page,'appliance-desktop')
    page.set_viewport_size({'width':390,'height':844});panel(page,'right');page.evaluate('document.querySelector("#tall-options-controls").scrollIntoView({block:"start"})')
    choice_layout(page)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    screenshot(page,'appliance-mobile')
    choose(page,'layout','door_oven');expect(page.locator('[data-tall-value="door_oven"]')).to_have_attribute('aria-pressed','true')

@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['label'])
def test_appliance_api_pdf_and_hardware(v):
    it=dict(item_id='test',name=v['label'],bazis_id=v['id'],bazis_sha256=v['source_sha256'],bazis_file=v['source_file'],
        module_type='tall_cabinet',width=600,depth=600,height=v['native_height'],body_height=v['native_height']-100,base='plinth',base_height=100,worktop_thickness=0)
    assert FurnitureItem(**it).height==v['native_height']
    for patch in [dict(width=599),dict(depth=550),dict(height=v['min_height']-1,body_height=v['min_height']-101),dict(upper_shelf_count=9)]:
        with pytest.raises(ValueError):FurnitureItem(**{**it,**patch})
    hw,_=hardware_for(it);assert sum(r['qty'] for r in hw if r['name'].startswith('Петля'))==sum(r['quantity'] for r in v['hardware_items'] if r['name'].startswith('Петля'))
    assert '564 × 595' in module_contents(it)
    pdf='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render('Техника',{'items':[it]},{}))).pages)
    assert 'Полкодержатель' in pdf and 'духовка' in pdf
