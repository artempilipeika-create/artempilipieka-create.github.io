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

def export_payload(page):
    close_panels(page)
    with page.expect_download() as download:page.locator('#export-bazis').click()
    return json.loads(Path(download.value.path()).read_text())

def export(page):
    return export_payload(page)['items']

def test_native_export_unchanged_when_worktop_changes_and_project_reopens(page,api,settings,admin_user):
    open_planner(page,api);panel(page,'left','catalog');page.locator('[data-bazis="bazis.3079d0656398"]').click()
    before=export(page);assert before[0]['target']==dict(width=600,height=720,depth=510)
    assert before[0]['source_default']==dict(width=600,height=720,depth=510)
    assert before[0]['construction']['base_height']==100 and before[0]['construction']['worktop_thickness']==38
    edit(page,'worktop-thickness',50)
    after=export(page);assert after[0]['target']==before[0]['target']
    assert after[0]['construction']['worktop_thickness']==50
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    expect(page.locator('#height')).to_have_value('820');assert export(page)[0]['target']==before[0]['target']
    assert state(page)['heights']==dict(body_height=720,base_height=100,module_height=820,worktop_thickness=50,overall_height_with_worktop=870)

def test_d1_d2_pilot_back_shelf_doors_save_and_native_export(page,api,settings,admin_user):
    open_planner(page,api);panel(page,'left','catalog');page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
    item=page.evaluate('({...MF_PLANNER.adapter.selected})')
    assert item['height']==820 and item['body_height']==720 and item['base_height']==100 and item['depth']==510
    assert item['shelves'][0]['offset_mm']==360
    panel(page,'right');expect(page.locator('#production-controls')).to_be_visible()
    expect(page.locator('#production-back-summary')).to_contain_text('3 мм')
    meshes=page.evaluate('''()=>{const g=MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group,out={};g.traverse(o=>{const r=o.userData?.role;if(['back','shelf','front','door-pivot'].includes(r)){(out[r]??=[]).push({env:o.geometry?.userData?.envelopeMM||null,y:o.position.y,hinge:o.userData?.hingeSide||null,rot:o.rotation?.y||0});}});return out;}''')
    assert meshes['back'][0]['env']==[596,716,3]
    assert meshes['shelf'][0]['env']==[564,18,509]
    assert round(meshes['shelf'][0]['y']*1000)==460
    assert meshes['front'][0]['env']==[597,717,18]
    page.locator('#shelf-position').fill('400');page.locator('#shelf-position').press('Tab')
    assert page.evaluate('MF_PLANNER.adapter.selected.shelves[0].offset_mm')==400
    page.locator('#toggle-doors').click()
    assert page.evaluate('MF_PLANNER.adapter.selected.doors_open') is True
    assert page.evaluate('''()=>{const g=MF_PLANNER.scene.entries.get(MF_PLANNER.adapter.selected.item_id).group;return g.children.find(x=>x.userData.role==='door-pivot').rotation.y<0}''')
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId')
    saved=api.get('/api/v2/3d-projects/'+pid).json()['scene']['items'][0]
    assert saved['shelves'][0]['offset_mm']==400 and saved['body_height']==720 and saved['base_height']==100
    payload=export_payload(page);native=payload['items'][0]
    assert payload['production_schema']==1
    assert native['target']==dict(width=600,height=720,depth=510)
    assert native['construction']['back']['type']=='overlay_nails'
    assert native['construction']['shelves'][0]['offset_mm']==400
    assert native['construction']['doors']==[dict(side='left',hinge_count=2,open_angle=105)]
    assert native['source_sha256']=='7d029606fafc89c7a7f060106a3f2d30a8c4224a304a904bbfeffe3675645d64'

    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    panel(page,'left','projects');page.locator('#projects .mf3d-project').first.click()
    assert page.evaluate('MF_PLANNER.adapter.selected.shelves[0].offset_mm')==400
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.3079d0656398"]').click()
    d2=page.evaluate('''()=>{const p=MF_PLANNER,g=p.scene.entries.get(p.adapter.selected.item_id).group,fronts=[],pivots=[];g.traverse(o=>{if(o.userData?.role==='front')fronts.push(o.geometry.userData.envelopeMM);if(o.userData?.role==='door-pivot')pivots.push(o.userData.hingeSide);});return {fronts,pivots,item:{...p.adapter.selected}};}''')
    assert d2['fronts']==[[297,717,18],[297,717,18]]
    assert d2['pivots']==['left','right'] and d2['item']['depth']==510 and d2['item']['height']==820

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
