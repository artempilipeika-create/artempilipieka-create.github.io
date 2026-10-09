"""Tall family: real controls, mesh, native payload, history and API persistence."""
import json,os
from pathlib import Path
from io import BytesIO
import pytest
from pypdf import PdfReader
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels,CATALOGUE_LABELS
from tests.webgl.drawer_modules_checks import export_payload
from tests.webgl.door_families_checks import selected,choose_material
from tests.stage03.test_api import publish
from tests.stage03.support import master
from backend.v2.three_d_tall import VARIANTS
from backend.v2.three_d_api import FurnitureItem
from backend.v2.three_d_document import hardware_for,module_contents,render

DEFAULT=VARIANTS[0]['id']
def choose(page,key,value):
    panel(page,'right');page.locator(f'[data-tall-option="{key}"][data-tall-value="{value}"]').click()

def screenshot(page,name):
    out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/tall'));out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/(name+'.png')),full_page=True)
    # Bounded visual evidence retrievable through CI logs as well as artifacts.
    import base64
    data=base64.b64encode(page.screenshot(type='jpeg',quality=65)).decode()
    print('MF_TALL_IMAGE_BEGIN '+name,flush=True)
    for i in range(0,len(data),3000):print('MF_TALL_IMAGE '+data[i:i+3000],flush=True)
    print('MF_TALL_IMAGE_END '+name,flush=True)

def test_tall_catalogue_variants_history_save_export_and_mobile(page,api,settings,admin_user):
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ['W1000 ST9','U999 ST7']]))
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','catalog')
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==CATALOGUE_LABELS
    for category,count in [('base',8),('wall',4),('tall',2)]:
        page.locator(f'[data-module-filter="{category}"]').click()
        expect(page.locator('#module-catalogue .mf3d-module:visible')).to_have_count(count)
    screenshot(page,'tall-catalogue')
    page.locator(f'[data-bazis="{DEFAULT}"]').click();panel(page,'right')
    expect(page.locator('#tall-options-controls')).to_be_visible()
    expect(page.locator('#door-opening-controls')).to_be_hidden()
    page.locator('#studio-item-name').fill('Пенал у окна');page.locator('#studio-item-name').press('Tab')
    page.locator('#width').fill('500');page.locator('#width').press('Tab')
    page.locator('#height').fill('2200');page.locator('#height').press('Tab')
    choose_material(page,'body','W1000 ST9');choose_material(page,'front','U999 ST7')
    first=selected(page)
    for v in VARIANTS:
        choose(page,'row_height',v['row_height']);choose(page,'opening',v['opening'])
        it=selected(page)
        assert it['bazis_id']==v['id'] and it['bazis_sha256']==v['source_sha256'] and it['bazis_file']==v['source_file']
        for key in ['item_id','name','width','height','depth','x','z','rotation','body_variant_id','front_variant_id']:
            assert it[key]==first[key]
        geometry=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,a=[];p.scene.entries.get(it.item_id).group.traverse(m=>{
          if(m.userData.role==='door-pivot')a.push(m.userData.hingeSide);});return a;}''')
        assert len(geometry)==v['doors_per_section']*2
        assert geometry==(['left','right']*2 if v['opening']=='double' else [v['opening']]*2)
        native=export_payload(page)['items'][0]
        assert native['source_sha256']==v['source_sha256'] and native['source_file']==v['source_file']
        ps=native['construction']['parts'];fronts=[p for p in ps if p['role']=='front'];n=v['doors_per_section']
        assert len(fronts)==n*2
        assert [(p['length'],p['width']) for p in fronts]==[(v['row_height']-103,500/n-3)]*n+[(2200-v['row_height']-1.5,500/n-3)]*n
        assert all(p['material']['variant_id']==it['front_variant_id'] for p in fronts)
    before=selected(page);undo=page.evaluate('MF_PLANNER.history.undoStack.length')
    choose(page,'opening','left');after=selected(page)
    assert page.evaluate('MF_PLANNER.history.undoStack.length')==undo+1
    close_panels(page);page.locator('#planner-undo').click();assert selected(page)==before
    page.locator('#planner-redo').click();assert selected(page)==after
    choose(page,'opening','double')
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');response=api.get('/api/v2/3d-projects/'+pid)
    assert response.status_code==200,response.text
    assert response.json()['scene']['items'][0]['bazis_id']==VARIANTS[-1]['id']
    native=export_payload(page)
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===1')
    assert export_payload(page)['items']==native['items']
    panel(page,'right');page.evaluate('document.querySelector(".mf3d-right").scrollTop=0;MF_PLANNER.scene.fit("selected")')
    screenshot(page,'tall-desktop')
    page.locator('#toggle-doors').click();close_panels(page);page.evaluate('MF_PLANNER.scene.fit("selected")');screenshot(page,'tall-open')
    page.set_viewport_size({'width':390,'height':844});panel(page,'right');choose(page,'row_height',820);choose(page,'opening','right')
    expect(page.locator('[data-tall-option="opening"][data-tall-value="right"]')).to_have_attribute('aria-pressed','true')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.evaluate('document.querySelector(".mf3d-right").scrollTop=0');screenshot(page,'tall-mobile')

def test_new_tall_uses_lower_row_base_900(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.0211e4f77fc4"]').click();panel(page,'right')
    page.locator('#body-height').fill('800');page.locator('#body-height').press('Tab')
    panel(page,'left','catalog');page.locator(f'[data-bazis="{DEFAULT}"]').click();panel(page,'right')
    expect(page.locator('[data-tall-option="row_height"][data-tall-value="900"]')).to_have_attribute('aria-pressed','true')
    assert selected(page)['height']==2000 and selected(page)['base_height']==100

@pytest.mark.parametrize('v',VARIANTS,ids=lambda v:v['label'])
def test_tall_backend_validation_hardware_and_pdf(v):
    it={'item_id':'test','name':v['label'],'bazis_id':v['id'],'bazis_sha256':v['source_sha256'],'bazis_file':v['source_file'],
        'module_type':'tall_cabinet','width':600,'height':2000,'depth':600,'base':'plinth','base_height':100,'body_height':1900,'worktop_thickness':0}
    assert FurnitureItem(**it).height==2000
    for changes in [{'width':600*v['doors_per_section']+1},{'base_height':150,'body_height':1850},{'worktop_thickness':38},{'height':1700,'body_height':1600}]:
        with pytest.raises(ValueError):FurnitureItem(**{**it,**changes})
    hw,_=hardware_for(it);assert sum(row['qty'] for row in hw if 'Петля' in row['name'])==5*v['doors_per_section']
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render('Пенал',{'items':[it]},{}))).pages)
    assert str(v['row_height']) in text and '1,5' in text and 'Полкодержатель' in text
    assert str(2000-v['row_height']-1.5) in module_contents(it)

def test_upper_shelf_controls_mesh_resize_history_and_persistence(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','catalog')
    page.locator(f'[data-bazis="{DEFAULT}"]').click();panel(page,'right')
    expect(page.locator('#tall-shelf-count')).to_have_text('1')
    def mesh_shelves():
        return page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,parts=[];p.scene.entries.get(it.item_id).group.traverse(m=>{
          const part=m.userData.part;if(part?.key.startsWith('shelf-'))parts.push({key:part.key,y:part.position.y});});return parts;}""")
    original=mesh_shelves()
    for _ in range(3):page.locator('#tall-shelf-plus').click()
    expect(page.locator('#tall-shelf-count')).to_have_text('4')
    assert selected(page)['upper_shelf_count']==4
    assert len(mesh_shelves())==5
    assert page.evaluate('MF_PLANNER.scene.displayMode')=='inspection'
    page.locator('#height').fill('2400');page.locator('#height').press('Tab')
    assert len(mesh_shelves())==5
    choose(page,'row_height',900);choose(page,'opening','double')
    assert selected(page)['upper_shelf_count']==4
    assert [p['y'] for p in mesh_shelves() if p['key'].startswith('shelf-upper-')]==[1191,1491,1791,2091]
    panel(page,'right');before=selected(page)
    page.locator('#tall-shelf-minus').click();assert selected(page)['upper_shelf_count']==3
    close_panels(page);page.locator('#planner-undo').click();assert selected(page)==before
    page.locator('#planner-redo').click();assert selected(page)['upper_shelf_count']==3
    panel(page,'right');page.locator('#tall-shelf-plus').click()
    native=export_payload(page)['items'][0]
    assert native['construction']['tall']['upper_shelf_count']==4
    assert native['construction']['tall']['upper_shelves']==[1191,1491,1791,2091]
    assert native['construction']['native_adjustment']['requires_manual_native_adjustment'] is True
    assert next(p for p in native['construction']['hardware']['items'] if p['key']=='shelf-support-marcopol')['quantity']==16
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    assert api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]['upper_shelf_count']==4
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===1')
    panel(page,'right');expect(page.locator('#tall-shelf-count')).to_have_text('4')
    assert len(mesh_shelves())==5
    page.locator('#tall-shelf-show').click();page.evaluate('MF_PLANNER.scene.fit("selected")')
    screenshot(page,'tall-four-upper-shelves')
    page.locator('#tall-shelf-reset').click();expect(page.locator('#tall-shelf-count')).to_have_text('2')
    assert selected(page)['upper_shelf_count'] is None
    assert [p['y'] for p in mesh_shelves() if p['key'].startswith('shelf-upper-')]==VARIANTS[-1]['upper_shelves']
    for _ in range(2):page.locator('#tall-shelf-minus').click()
    expect(page.locator('#tall-shelf-count')).to_have_text('0');expect(page.locator('#tall-shelf-minus')).to_be_disabled()
    assert len(mesh_shelves())==1
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    assert api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]['upper_shelf_count']==0
    page.set_viewport_size({'width':390,'height':844});panel(page,'right')
    for _ in range(8):page.locator('#tall-shelf-plus').click()
    expect(page.locator('#tall-shelf-count')).to_have_text('8');expect(page.locator('#tall-shelf-plus')).to_be_disabled()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    screenshot(page,'tall-shelves-mobile')
