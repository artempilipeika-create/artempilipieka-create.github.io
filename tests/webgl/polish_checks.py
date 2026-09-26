"""Height persistence and native export regression against real ASGI/Postgres."""
import json
from pathlib import Path
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner
from tests.webgl.navigation import panel,close_panels

def edit(page,key,value):
    panel(page,'right');page.locator('#'+key).fill(str(value));page.locator('#'+key).press('Tab')

def state(page):
    return page.evaluate('''()=>({item:MF_PLANNER.adapter.selected,
      heights:MF_FURNITURE_CORE.heights(MF_PLANNER.adapter.selected),
      fronts:MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group.children.filter(x=>x.userData.facade).map(x=>x.userData.facade)})''')

@pytest.mark.parametrize('width',[1440,390])
def test_separate_heights_save_close_reopen_no_mobile_jump(page,api,settings,admin_user,width):
    page.set_viewport_size({'width':width,'height':900});open_planner(page,api)
    panel(page,'left','catalog');page.locator('[data-template="base.two_door"]').click()
    assert state(page)['heights']==dict(body_height=720,base_height=100,module_height=820,worktop_thickness=38,overall_height_with_worktop=858)
    edit(page,'base-height',120);edit(page,'body-height',750);edit(page,'worktop-thickness',40)
    before=state(page);assert before['item']['height']==870
    assert before['heights']['overall_height_with_worktop']==910
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    assert api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]['body_height']==750
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('870')
    after=state(page)
    for key in ['height','body_height','base_height','worktop_thickness','x','z','rotation']:assert after['item'][key]==before['item'][key]
    assert after['fronts']==before['fronts']
    panel(page,'right');close_panels(page);panel(page,'right');assert state(page)==after
    assert page.evaluate("MF_PLANNER.scene.dressing.children.flatMap(g=>g.children.filter(x=>x.userData.role==='counter')).length")==1
    edit(page,'worktop-thickness',50);assert state(page)['item']['height']==870
    page.locator('#planner-undo').click();assert state(page)['item']['worktop_thickness']==40
    page.locator('#planner-redo').click();assert state(page)['item']['worktop_thickness']==50

def export(page):
    close_panels(page)
    with page.expect_download() as download:page.locator('#export-bazis').click()
    return json.loads(Path(download.value.path()).read_text())['items']

def test_native_export_unchanged_when_worktop_changes_and_project_reopens(page,api,settings,admin_user):
    open_planner(page,api);panel(page,'left','catalog');page.locator('[data-bazis="bazis.3079d0656398"]').click()
    before=export(page);assert before[0]['target']==dict(width=600,height=720,depth=560)
    edit(page,'worktop-thickness',38);assert export(page)==before
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('720');assert export(page)==before
    assert state(page)['heights']['worktop_thickness']==38

def test_legacy_project_retains_module_height_on_read_and_save(page,api,settings,admin_user):
    open_planner(page,api)
    legacy={'item_id':'legacy-polish','name':'Legacy','module_type':'base_cabinet','template_id':'base.two_door','width':800,'height':720,'depth':560,'x':0,'z':0,'rotation':0,'base':'plinth','layout':'doors','drawers':0,'handles':'handles'}
    response=api.post('/api/v2/3d-projects',json={'name':'Legacy heights','scene':{'schema_version':2,'items':[legacy]}})
    assert response.status_code==201
    page.reload();expect(page.locator('body')).to_have_attribute('data-planner-ready','true');panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('720');assert state(page)['heights']['overall_height_with_worktop']==752
    assert state(page)['fronts'][0]['h']==637
    close_panels(page);page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    saved=api.get('/api/v2/3d-projects/'+response.json()['project_id']).json()['scene']['items'][0]
    assert saved['height']==720 and saved['worktop_thickness'] is None
