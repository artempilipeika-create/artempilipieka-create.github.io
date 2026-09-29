"""Production-rule browser acceptance: drawer guides, dryer widths, height-driven shelves."""
import json
from pathlib import Path
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels

def open_verified_planner(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_FURNITURE_CORE&&MF_PLANNER.scene.entries')

def state(page):
    return page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.selected,t=p.adapter.template(it),g=p.scene.entries.get(it.item_id).group,roles={};
      g.traverse(m=>{if(m.isMesh){const r=m.userData.role||'none';roles[r]=(roles[r]||0)+1;}});
      return {item:{bazis_id:it.bazis_id,width:it.width,height:it.height,depth:it.depth,shelves:it.shelves},
        shelves:MF_FURNITURE_CORE.productionShelves(it,t.production),
        hardware:MF_FURNITURE_CORE.productionHardware(it,t.production),
        roles};}""")

def export_payload(page):
    close_panels(page)
    with page.expect_download() as download:
        page.locator('#export-bazis').click()
    return json.loads(Path(download.value.path()).read_text())

def test_native_production_rules(page,api,settings,admin_user):
    open_verified_planner(page,admin_user)
    panel(page,'left','catalog')
    expect(page.locator('#module-catalogue [data-bazis]')).to_have_count(11)

    # Dryer: exact-width hardware, strict 100 mm width step, no shelf <=850, one upper shelf >850.
    page.locator('[data-bazis="bazis.60f79b573cd1"]').click()
    s=state(page)
    assert s['item']=={'bazis_id':'bazis.60f79b573cd1','width':600,'height':720,'depth':317,'shelves':[]}
    assert s['shelves']==[]
    dryer=next(x for x in s['hardware']['items'] if x['key']=='dish-dryer')
    assert dryer['width_mm']==600 and '600 MOUNT' in dryer['name']
    assert 'shelf-support-marcopol' not in [x['key'] for x in s['hardware']['items']]

    panel(page,'right')
    page.locator('#width').fill('700');page.locator('#width').press('Tab')
    s=state(page)
    assert s['item']['width']==700
    dryer=next(x for x in s['hardware']['items'] if x['key']=='dish-dryer')
    assert dryer['width_mm']==700 and '700 MOUNT' in dryer['name']

    page.locator('#width').fill('750');page.locator('#width').press('Tab')
    expect(page.locator('#status')).to_contain_text('Для сушки ширина модуля должна изменяться шагом 100 мм')
    assert state(page)['item']['width']==700

    page.locator('#height').fill('900');page.locator('#height').press('Tab')
    s=state(page)
    assert s['item']['height']==900
    assert len(s['shelves'])==1 and s['shelves'][0]['offset_mm']==600
    assert s['roles']['shelf']==1
    support=next(x for x in s['hardware']['items'] if x['key']=='shelf-support-marcopol')
    assert support['quantity']==4

    native=export_payload(page)['items'][0]
    assert native['source_file']=='ВМД1-600. отк P. (Сушка).fr3d'
    assert native['target']=={'width':700,'height':900,'depth':317}
    dryer=next(x for x in native['construction']['hardware']['items'] if x['key']=='dish-dryer')
    assert dryer['width_mm']==700 and '700 MOUNT' in dryer['name']
    assert len(native['construction']['shelves'])==1
    assert native['construction']['shelves'][0]['offset_mm']==600

    # Regular upper cabinet: one shelf by default; two shelves above 850.
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.2175c60e84a6"]').click()
    assert len(state(page)['shelves'])==1
    panel(page,'right')
    page.locator('#height').fill('900');page.locator('#height').press('Tab')
    s=state(page)
    assert [x['offset_mm'] for x in s['shelves']]==[300,600]
    assert s['roles']['shelf']==2
    support=next(x for x in s['hardware']['items'] if x['key']=='shelf-support-marcopol')
    assert support['quantity']==8

    # Drawer module: changing depth delegates slide size to the native FR3D parameter table.
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.39f282e08f0c"]').click()
    s=state(page)
    assert s['item']['depth']==510 and s['hardware']['slide_length_mm']==500
    panel(page,'right')
    page.locator('#depth').fill('450');page.locator('#depth').press('Tab')
    s=state(page)
    assert s['item']['depth']==450
    assert s['hardware']['slide_length_mm']==400
    assert s['hardware']['slide_selection']=='native_auto_by_depth'
    assert s['hardware']['slide_rule']['control_points']['250']==[[250,0],[300,1],[1000,0]]
    assert s['hardware']['slide_rule']['control_points']['600']==[[600,0],[1000,1]]
    native=export_payload(page)['items'][0]
    assert native['target']['depth']==450
    assert native['construction']['hardware']['slide_length_mm']==400
    assert native['construction']['hardware']['slide_selection']=='native_auto_by_depth'
    assert native['construction']['hardware']['slide_rule']['mode']=='native_fr3d_parameter_table'
