"""Dimensions-only setup, real API persistence and legacy measured-object retention."""
import pytest,os
from pathlib import Path
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels
from tests.webgl.drawer_modules_checks import export_payload
from backend.v2.three_d_room import Room

def screenshot(page,name):
    out=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/room'));out.mkdir(parents=True,exist_ok=True)
    (out/(name+'.jpg')).write_bytes(page.screenshot(type='jpeg',quality=75,timeout=60000))

def dimensions(page,w=4600,d=3400,h=2800):
    for k,v in [('width',w),('depth',d),('height',h)]:page.locator('#room-setup-'+k).fill(str(v))

def test_room_dimensions_flow_history_persistence_and_mobile(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    expect(page.locator('#room-setup')).to_be_visible();expect(page.locator('#room-setup-width')).to_have_value('')
    assert page.locator('#room-setup-next,#room-features-step,#room-feature-add').count()==0
    page.locator('#room-setup-apply').click();expect(page.locator('#room-setup-error')).to_contain_text('Длина')
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0
    dimensions(page);screenshot(page,'room-dimensions-desktop')
    page.locator('#room-setup-apply').click();expect(page.locator('#room-setup')).not_to_be_visible()
    expect(page.locator('body')).to_have_attribute('data-room-ready','true')
    original=page.evaluate('MF_PLANNER.adapter.room');assert original['width']==4600 and original['features']==[] and original['survey'] is None
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.0211e4f77fc4"]').click();close_panels(page)
    page.locator('#save-project').click();expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')
    pid=page.evaluate('MF_PLANNER.adapter.projectId');saved=api.get('/api/v2/3d-projects/'+pid).json();assert saved['scene']['room']==original
    assert export_payload(page)['room']==original
    page.goto('https://testserver/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.locator('#room-setup-projects').click();page.locator('#projects .mf3d-project').first.click();page.wait_for_function('MF_PLANNER.adapter.items.length===1')
    expect(page.locator('#room-setup')).not_to_be_visible();assert page.evaluate('MF_PLANNER.adapter.room')==original
    close_panels(page);page.locator('#planner-fit-room').click();dimensions(page,h=2900)
    page.locator('#room-setup-apply').click();assert page.evaluate('MF_PLANNER.adapter.room.height')==2900
    page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.room')==original
    page.locator('#planner-redo').click();assert page.evaluate('MF_PLANNER.adapter.room.height')==2900
    page.set_viewport_size({'width':390,'height':844});page.locator('#planner-fit-room').click();dimensions(page,h=2950)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    screenshot(page,'room-dimensions-mobile');page.locator('#room-setup-apply').click();assert page.evaluate('MF_PLANNER.adapter.room.height')==2950

def test_room_gate_legacy_features_cancel_and_new_project(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.locator('#room-setup-close').click()
    assert page.evaluate("MF_PLANNER.interaction.add({bazis:'bazis.0211e4f77fc4'})") is False
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0;expect(page.locator('#room-setup')).to_be_visible()
    dimensions(page,3600,2800,2600);page.locator('#room-setup-apply').click()
    panel(page,'left','catalog');page.locator('[data-bazis="bazis.0211e4f77fc4"]').click();close_panels(page)
    payload=page.evaluate('MF_PLANNER.bridge.payload()');payload['room']={'width':3600,'depth':2800,'height':2600}
    response=api.post('/api/v2/3d-projects',json={'name':'Старый проект без замера','scene':payload});assert response.status_code==201,response.text
    page.evaluate('(id)=>MF_PLANNER.bridge.open(id)',response.json()['project_id']);expect(page.locator('#room-setup')).not_to_be_visible()
    assert page.evaluate('MF_PLANNER.adapter.room.setup_complete') is None
    # Open an existing saved survey; editing dimensions must not erase its data.
    f=dict(id='socket-existing',kind='socket',wall='a',offset=1200,elevation=1100,width=150,height=80,projection=20,label='Розетка',notes='Старый замер')
    payload['room'].update(setup_complete=True,survey='present',features=[f])
    response=api.post('/api/v2/3d-projects',json={'name':'Сохранённый замер','scene':payload});assert response.status_code==201,response.text
    page.evaluate('(id)=>MF_PLANNER.bridge.open(id)',response.json()['project_id']);page.wait_for_function("MF_PLANNER.adapter.room.features.length===1")
    page.locator('#planner-fit-room').click();dimensions(page,3700,2800,2600);page.locator('#room-setup-apply').click()
    assert page.evaluate('MF_PLANNER.adapter.room.features')==[f]
    assert export_payload(page)['room']['features']==[f]
    page.locator('#planner-fit-room').click();dimensions(page,3900,2800,2600);page.locator('#room-setup-close').click()
    assert page.evaluate('MF_PLANNER.adapter.room.width')==3700
    page.locator('#new-project').click();expect(page.locator('#room-setup')).to_be_visible()
    expect(page.locator('#room-setup-width')).to_have_value('');assert page.evaluate('MF_PLANNER.adapter.items.length')==0

def test_room_api_accepts_dimensions_without_asserting_a_survey():
    assert Room(width=4200,depth=3200,height=2700,setup_complete=True).survey is None
    f=dict(id='w',kind='window',wall='a',offset=500,elevation=900,width=1400,height=1300,projection=150)
    room=dict(width=4200,depth=3200,height=2700,setup_complete=True,survey='present',features=[f])
    assert Room(**room).features[0].width==1400
    for patch in [dict(survey='none'),dict(features=[]),dict(features=[f,f]),dict(features=[{**f,'offset':3000}]),dict(features=[{**f,'height':2000}]),dict(features=[{**f,'kind':'door'}])]:
        with pytest.raises(ValueError):Room(**{**room,**patch})
    assert Room(width=4200).setup_complete is None
