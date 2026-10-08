"""Room survey is a real user prerequisite; saved projects retain exact measurements."""
import pytest
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels
from tests.webgl.tall_checks import screenshot
from tests.webgl.drawer_modules_checks import export_payload
from backend.v2.three_d_room import Room

def dimensions(page,w=4600,d=3400,h=2800):
    for k,v in [('width',w),('depth',d),('height',h)]:page.locator('#room-setup-'+k).fill(str(v))
    page.locator('#room-setup-next').click()

def feature(page,kind,wall,offset,elevation,width,height,projection=0,label=''):
    page.locator('#room-feature-add').click()
    page.locator('#room-feature-kind').select_option(kind);page.locator('#room-feature-wall').select_option(wall)
    for k,v in dict(offset=offset,elevation=elevation,width=width,height=height,projection=projection,label=label).items():page.locator('#room-feature-'+k).fill(str(v))
    page.locator('#room-feature-save').click()

def test_room_measured_flow_visuals_history_and_persistence(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    expect(page.locator('#room-setup')).to_be_visible();expect(page.locator('#room-setup-width')).to_have_value('')
    page.locator('#room-setup-next').click();expect(page.locator('#room-setup-error')).to_contain_text('Длина')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    dimensions(page);page.locator('#room-setup-apply').click();expect(page.locator('#room-setup-error')).to_contain_text('Укажите, есть ли')
    page.locator('#room-survey-present').click();page.locator('#room-setup-apply').click();expect(page.locator('#room-setup-error')).to_contain_text('хотя бы один')
    feature(page,'window','a',700,900,1400,1300,180,'Окно над столешницей')
    feature(page,'door','c',400,0,900,2100)
    feature(page,'socket','a',2400,1100,150,80,20,'Розетки фартука')
    feature(page,'water','d',700,500,120,180,60)
    feature(page,'meter','b',500,1500,250,350,130,'Газовый счётчик')
    expect(page.locator('#room-feature-list article')).to_have_count(5)
    page.locator('#room-survey-none').click();expect(page.locator('#room-setup-error')).to_contain_text('Сначала удалите')
    screenshot(page,'room-survey-desktop')
    page.locator('#room-setup-apply').click();expect(page.locator('#room-setup')).not_to_be_visible()
    expect(page.locator('body')).to_have_attribute('data-room-ready','true')
    original=page.evaluate('MF_PLANNER.adapter.room');assert len(original['features'])==5 and original['width']==4600
    assert page.evaluate('MF_PLANNER.scene.roomFeatures.length')==5
    close_panels(page);page.locator('#mode-2d').click();screenshot(page,'room-measured-plan')
    page.locator('#mode-3d').click();screenshot(page,'room-measured-3d')
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.0211e4f77fc4"]').click();close_panels(page)
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid).json();assert saved['scene']['room']==original
    assert export_payload(page)['room']==original
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.locator('#room-setup-projects').click();page.locator('#projects .mf3d-project').first.click();page.wait_for_function('MF_PLANNER.adapter.items.length===1')
    expect(page.locator('#room-setup')).not_to_be_visible();assert page.evaluate('MF_PLANNER.adapter.room')==original
    close_panels(page);page.locator('#planner-fit-room').click();dimensions(page,w=4600,d=3400,h=2900)
    page.locator('#room-feature-list article').nth(2).get_by_text('Изменить',exact=True).click()
    page.locator('#room-feature-offset').fill('4500');page.locator('#room-feature-save').click();expect(page.locator('#room-setup-error')).to_contain_text('выходит за длину')
    page.locator('#room-feature-offset').fill('2500');page.locator('#room-feature-save').click()
    page.locator('#room-setup-apply').click();assert page.evaluate('MF_PLANNER.adapter.room.height')==2900
    page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.room')==original
    page.locator('#planner-redo').click();assert page.evaluate('MF_PLANNER.adapter.room.features[2].offset')==2500
    page.set_viewport_size({'width':390,'height':844});page.locator('#planner-fit-room').click();dimensions(page,w=4600,d=3400,h=2900)
    expect(page.locator('#room-setup')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    feature(page,'sewer','d',900,100,100,100,50)
    page.locator('#room-setup').evaluate('e=>e.scrollTop=0');screenshot(page,'room-survey-mobile')
    page.locator('#room-setup-apply').click();assert len(page.evaluate('MF_PLANNER.adapter.room.features'))==6

def test_empty_survey_gate_cancel_new_project_and_legacy(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.locator('#room-setup-close').click()
    assert page.evaluate("MF_PLANNER.interaction.add({bazis:'bazis.0211e4f77fc4'})") is False
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0;expect(page.locator('#room-setup')).to_be_visible()
    dimensions(page,3600,2800,2600);page.locator('#room-survey-none').click();page.locator('#room-setup-apply').click()
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.0211e4f77fc4"]').click();close_panels(page)
    payload=page.evaluate('MF_PLANNER.bridge.payload()');payload['room']={'width':3600,'depth':2800,'height':2600}
    response=api.post('/api/v2/3d-projects',json={'name':'Старый проект без замера','scene':payload});assert response.status_code==201,response.text
    legacy=response.json()['project_id']
    page.evaluate('(id)=>MF_PLANNER.bridge.open(id)',legacy);expect(page.locator('#room-setup')).not_to_be_visible()
    assert page.evaluate('MF_PLANNER.adapter.room.setup_complete') is None
    assert page.evaluate('MF_PLANNER.adapter.items.length')==1
    page.locator('#planner-fit-room').click();expect(page.locator('#room-setup-width')).to_have_value('3600')
    page.locator('#room-setup-close').click();page.locator('#new-project').click();expect(page.locator('#room-setup')).to_be_visible()
    expect(page.locator('#room-setup-width')).to_have_value('');assert page.evaluate('MF_PLANNER.adapter.items.length')==0

def test_room_api_rejects_inconsistent_survey_and_outside_features():
    f=dict(id='w',kind='window',wall='a',offset=500,elevation=900,width=1400,height=1300,projection=150)
    room=dict(width=4200,depth=3200,height=2700,setup_complete=True,survey='present',features=[f])
    assert Room(**room).features[0].width==1400
    for patch in [dict(survey=None),dict(survey='none'),dict(features=[]),dict(features=[f,f]),dict(features=[{**f,'offset':3000}]),dict(features=[{**f,'height':2000}]),dict(features=[{**f,'kind':'door'}])]:
        with pytest.raises(ValueError):Room(**{**room,**patch})
    assert Room(width=4200).setup_complete is None
