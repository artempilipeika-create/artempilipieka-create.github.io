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
    panel(page,'right');page.locator('#module-display').select_option('normal');page.evaluate('document.querySelector(".mf3d-right").scrollTop=0;MF_PLANNER.scene.fit("selected")')
    screenshot(page,'appliance-desktop')
    page.set_viewport_size({'width':390,'height':844});panel(page,'right');page.evaluate('document.querySelector(".mf3d-right").scrollTop=0')
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
