"""Grouped cards, native L/P identity, history and persistence through real UI/API."""
import base64,json,os
from pathlib import Path
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.stage03.test_api import publish
from tests.stage03.support import master
from tests.webgl.navigation import panel,close_panels,DOOR_PAIRS,CATALOGUE_LABELS,add_production_variant
from tests.webgl.drawer_modules_checks import export_payload

def selected(page):
    return page.evaluate('JSON.parse(JSON.stringify(MF_PLANNER.adapter.selected))')

def choose_material(page,kind,article):
    page.locator('#'+kind+'-search').fill(article)
    page.locator('#'+kind+'-results button').filter(has_text=article).first.click()
    page.wait_for_function('kind=>Boolean(MF_PLANNER.adapter.selected[kind+"_variant_id"])',arg=kind)

def side_geometry(page,side):
    actual=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected,pivots=[],handles=[],materials=[];
      p.scene.entries.get(it.item_id).group.traverse(m=>{
        if(m.userData.role==='door-pivot')pivots.push({side:m.userData.hingeSide,angle:m.rotation.y,x:m.position.x});
        if(m.userData.role==='handle')handles.push(m.position.x);
        if(m.userData.part?.role==='front')materials.push(m.material.userData.variantId);
      });return {pivots,handles,materials};}''')
    assert len(actual['pivots'])==1 and actual['pivots'][0]['side']==side
    sign=1 if side=='right' else -1
    assert actual['pivots'][0]['x']*sign>0
    assert actual['pivots'][0]['angle']*sign>0
    assert len(actual['handles'])==1 and actual['handles'][0]*sign<0
    assert actual['materials']==[selected(page)['front_variant_id']]

def shot(page,name):
    out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/door-families'));out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/(name+'.png')),full_page=True)
    encoded=base64.b64encode(page.screenshot(type='jpeg',quality=65)).decode()
    print('MF_DOOR_IMAGE_BEGIN '+name,flush=True)
    for i in range(0,len(encoded),3000):print('MF_DOOR_IMAGE '+encoded[i:i+3000],flush=True)
    print('MF_DOOR_IMAGE_END '+name,flush=True)

def test_four_families_switch_geometry_materials_history_save_reload_export(page,api,settings,admin_user):
    publish(api,master([[a,'ЛДСП EGGER 18мм '+a,'кв.м',0,2800,2070,18,a.split()[1],'','M1','false',''] for a in ['W1000 ST9','U999 ST7']]))
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','catalog')
    assert page.locator('#module-catalogue .mf3d-module strong').all_text_contents()==CATALOGUE_LABELS
    for right,left in DOOR_PAIRS.items():
        expect(page.locator(f'#module-catalogue [data-bazis="{right}"]')).to_have_count(0)
    page.locator('#module-search').fill('ВМД1-600. отк P. (Сушка).fr3d')
    expect(page.locator('#module-catalogue .mf3d-module:visible')).to_have_count(1)
    expect(page.locator('#module-catalogue .mf3d-module:visible strong')).to_have_text('Верхний с сушкой · 1 дверь')
    page.locator('#module-search').fill('')
    shot(page,'catalogue-12')
    kept=[]
    for index,(right,left) in enumerate(DOOR_PAIRS.items()):
        add_production_variant(page,left);panel(page,'right')
        expect(page.locator('[data-door-side="left"]')).to_have_attribute('aria-pressed','true')
        page.locator('#width').fill('500');page.locator('#width').press('Tab')
        page.locator('#body-height').fill('800');page.locator('#body-height').press('Tab')
        page.locator('#studio-item-name').fill('Шкаф у окна '+str(index));page.locator('#studio-item-name').press('Tab')
        choose_material(page,'body','W1000 ST9');choose_material(page,'front','U999 ST7')
        if page.locator('#shelf-position').is_visible():
            page.locator('#shelf-position').fill('390');page.locator('#shelf-position').press('Tab')
        page.locator('#toggle-doors').click()
        before=selected(page);undo=page.evaluate('MF_PLANNER.history.undoStack.length')
        assert before['width']==500 and before['body_height']==800
        page.locator('[data-door-side="right"]').click()
        after=selected(page);source=page.evaluate('(id)=>MF_PLANNER.bridge.catalogue.bazisModules.find(m=>m.id===id)',right)
        assert after['bazis_id']==right and after['bazis_file']==source['source_file'] and after['bazis_sha256']==source['source_sha256']
        excluded={'bazis_id','bazis_file','bazis_sha256','bazis_resize'}
        assert {k:v for k,v in before.items() if k not in excluded}=={k:v for k,v in after.items() if k not in excluded}
        side_geometry(page,'right')
        assert page.evaluate('MF_PLANNER.history.undoStack.length')==undo+1
        page.locator('[data-door-side="right"]').click()
        assert page.evaluate('MF_PLANNER.history.undoStack.length')==undo+1
        close_panels(page);page.locator('#planner-undo').click();assert selected(page)==before
        page.locator('#planner-redo').click();assert selected(page)==after
        panel(page,'right');page.locator('[data-door-side="left"]').click();assert selected(page)==before
        side_geometry(page,'left')
        left_export=export_payload(page)['items'][-1];assert left_export['bazis_id']==left and left_export['source_sha256']==before['bazis_sha256']
        panel(page,'right');page.locator('[data-door-side="right"]').click();assert selected(page)==after
        page.locator('#width').fill('601');page.locator('#width').press('Tab');assert selected(page)['width']==500
        kept.append(after)
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid)
    assert saved.status_code==200,saved.text
    assert [x['bazis_id'] for x in saved.json()['scene']['items']]==list(DOOR_PAIRS)
    native=export_payload(page)
    for expected,actual in zip(kept,native['items']):
        assert actual['bazis_id']==expected['bazis_id'] and actual['source_file']==expected['bazis_file'] and actual['source_sha256']==expected['bazis_sha256']
        assert actual['target']['width']==500
        assert all(p['material']['variant_id']==expected['front_variant_id'] for p in actual['construction']['parts'] if p['role']=='front')
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    page.wait_for_function('()=>MF_PLANNER.adapter.items.length===4')
    assert export_payload(page)['items']==native['items']
    # Existing saved P donors reopen on their own side; changing selection does not migrate them.
    for expected in kept:
        page.evaluate('(id)=>MF_PLANNER.adapter.select(id)',expected['item_id']);panel(page,'right')
        expect(page.locator('[data-door-side="right"]')).to_have_attribute('aria-pressed','true')
        assert selected(page)['bazis_id']==expected['bazis_id']
    page.evaluate('document.querySelector(".mf3d-right").scrollTop=0;MF_PLANNER.scene.fit("selected")')
    shot(page,'opening-desktop')
    close_panels(page);page.set_viewport_size({'width':390,'height':844});panel(page,'right')
    page.locator('[data-door-side="left"]').click()
    expect(page.locator('[data-door-side="left"]')).to_have_attribute('aria-pressed','true')
    page.locator('[data-door-side="right"]').click()
    expect(page.locator('[data-door-side="right"]')).to_have_attribute('aria-pressed','true')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.evaluate('document.querySelector(".mf3d-right").scrollTop=0')
    shot(page,'opening-mobile')

def test_selector_only_for_paired_current_donors(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    for bid in ['bazis.3079d0656398','bazis.9e77f4333545','bazis.b4420a0b4bbc']:
        add_production_variant(page,bid);panel(page,'right')
        expect(page.locator('#door-opening-controls')).to_be_hidden()
    add_production_variant(page,'bazis.0211e4f77fc4');panel(page,'right')
    expect(page.locator('#door-opening-controls')).to_be_visible()
    # An older project's donor hash remains untouched and offers no unsafe conversion.
    page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected;p.adapter.replace({...it,bazis_sha256:'legacy-source-version'});}''')
    expect(page.locator('#door-opening-controls')).to_be_hidden()
    assert selected(page)['bazis_sha256']=='legacy-source-version'
