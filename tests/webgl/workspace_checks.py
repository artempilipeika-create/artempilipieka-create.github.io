"""Full-viewport layout contracts on the real isolated ASGI/Postgres application."""
import pytest
from playwright.sync_api import expect
from tests.webgl.browser_checks import page,api,settings,admin_user,open_planner,seed,point,screenshot
from tests.webgl.navigation import panel,close_panels

CAMERA='''()=>{const s=MF_PLANNER.scene;return [...s.camera.position.toArray(),...s.controls.target.toArray(),s.camera.zoom];}'''
IDENTITY='''()=>({renderer:MF_PLANNER.scene.renderer?.uuid,canvas:document.getElementById('scene').id,groups:[...MF_PLANNER.scene.entries.values()].map(e=>[e.group.uuid,e.group.children.filter(m=>m.isMesh).map(m=>m.geometry.uuid)])})'''

def test_workspace_default_full_width_and_single_toolbar(page,api,settings,admin_user):
    page.set_viewport_size({'width':1920,'height':1080});open_planner(page,api);seed(page,13)
    expect(page.locator('.mf3d-left')).to_be_hidden();expect(page.locator('.mf3d-right')).to_be_hidden()
    box=page.locator('#scene').bounding_box();header=page.locator('.mf3d-top').bounding_box()
    assert box['width']==1920 and box['height']>=1000 and box['y']==header['height']
    assert page.locator('#planner-tools').evaluate('(e)=>getComputedStyle(e).display')=='contents'
    assert page.locator('#planner-undo').bounding_box()['y']>=page.locator('.mf3d-stagebar').bounding_box()['y']
    screenshot(page,'workspace-desktop-closed')

@pytest.mark.parametrize('width,height',[(1920,1080),(1440,900),(1024,768)])
def test_workspace_drawers_preserve_camera_geometry_and_data(page,api,settings,admin_user,width,height):
    page.set_viewport_size({'width':width,'height':height});open_planner(page,api);seed(page,13)
    page.wait_for_timeout(250);before=page.evaluate(CAMERA);identity=page.evaluate(IDENTITY);data=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())');box=page.locator('#scene').bounding_box()
    panel(page,'left');panel(page,'right');page.wait_for_timeout(150)
    assert page.locator('.mf3d-left').is_visible()==(width>=1700)
    assert page.locator('.mf3d-right').is_visible()
    assert page.locator('#scene').bounding_box()==box
    assert page.evaluate(CAMERA)==pytest.approx(before,abs=1e-8)
    assert page.evaluate(IDENTITY)==identity
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==data
    close_panels(page);assert page.locator('#scene').bounding_box()==box

def test_workspace_manual_inspector_close_is_respected(page,api,settings,admin_user):
    open_planner(page,api);page.evaluate("MF_PLANNER.interaction.add({template:'base.drawers_3'})")
    hit=point(page);page.mouse.click(hit['x'],hit['y']);expect(page.locator('.mf3d-right')).to_be_visible()
    page.locator('#workspace-close-right').click()
    for _ in range(3):page.mouse.click(hit['x'],hit['y'])
    expect(page.locator('.mf3d-right')).to_be_hidden()
    panel(page,'right');expect(page.locator('.mf3d-right')).to_be_visible()

def test_workspace_cutlist_overlay_and_escape(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13);box=page.locator('#scene').bounding_box()
    page.locator('.mf3d-cutlist summary').click();expect(page.locator('#cutlist')).to_be_visible()
    assert page.locator('#scene').bounding_box()==box
    page.keyboard.press('Escape');assert page.locator('.mf3d-cutlist').get_attribute('open') is None
    panel(page,'left');page.keyboard.press('Escape');expect(page.locator('.mf3d-left')).to_be_hidden()

def test_workspace_fullscreen_editing_is_real_and_distinct_from_client(page,api,settings,admin_user):
    page.set_viewport_size({'width':1920,'height':1080});open_planner(page,api);seed(page,13)
    before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
    page.locator('#planner-fullscreen').click();expect(page.locator('#planner-fullscreen')).to_have_attribute('aria-pressed','true')
    assert page.evaluate('document.fullscreenElement.id')=='planner-workspace'
    assert not page.evaluate('document.body.classList.contains("planner-client")')
    for selector in ['#to-order','#studio-toggle-library','#studio-toggle-inspector','#planner-front']:expect(page.locator(selector)).to_be_visible()
    panel(page,'left');close_panels(page);page.keyboard.press('Escape')
    expect(page.locator('#planner-fullscreen')).to_have_attribute('aria-pressed','false')
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    page.locator('#planner-client').click();expect(page.locator('#to-order')).to_be_visible();expect(page.locator('#planner-undo')).to_be_hidden()
    assert page.evaluate('document.fullscreenElement') is None
    page.locator('#planner-client').click();expect(page.locator('#planner-undo')).to_be_visible()

def test_workspace_fullscreen_rejection_does_not_lose_project(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13);before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
    page.evaluate("()=>{document.getElementById('planner-workspace').requestFullscreen=()=>Promise.reject(new Error('Denied for test'));}")
    page.locator('#planner-fullscreen').click();expect(page.locator('#status')).to_contain_text('не разрешил')
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before

@pytest.mark.parametrize('side,nav',[('left','catalog'),('right','inspector')])
def test_workspace_mobile_sheets_swipe_and_canvas_preservation(page,api,settings,admin_user,side,nav):
    page.set_viewport_size({'width':390,'height':844});open_planner(page,api);seed(page,13);box=page.locator('#scene').bounding_box()
    page.locator('#planner-mobile-'+nav).click();drawer=page.locator('.mf3d-left' if side=='left' else '.mf3d-right')
    expect(drawer).to_be_visible();b=drawer.bounding_box();assert .55*844<=b['height']<=.75*844
    assert page.locator('#scene').bounding_box()==box
    handle=drawer.locator('.workspace-drawer-head');h=handle.bounding_box();x=h['x']+h['width']/2;y=h['y']+10
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+90,steps=8);page.mouse.up()
    expect(drawer).to_be_hidden();assert page.locator('#scene').bounding_box()==box

def test_workspace_drawer_closes_during_drag_without_cancelling_ghost(page,api,settings,admin_user):
    open_planner(page,api);page.evaluate("MF_PLANNER.interaction.add({template:'base.drawers_3'})");page.locator('#mode-2d').click()
    hit=point(page);panel(page,'left');before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())');camera=page.evaluate(CAMERA)
    page.mouse.move(hit['x'],hit['y']);page.mouse.down();page.mouse.move(hit['x']+35,hit['y']+20,steps=5)
    assert page.evaluate('Boolean(MF_PLANNER.scene.preview)')
    # A separate UI close event while pointer capture is held; no production state override.
    page.locator('#workspace-close-left').dispatch_event('click');page.wait_for_timeout(100)
    assert page.evaluate('Boolean(MF_PLANNER.scene.preview)')
    assert page.evaluate(CAMERA)==pytest.approx(camera,abs=1e-8)
    page.keyboard.press('Escape');page.mouse.up()
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    assert page.evaluate('MF_PLANNER.scene.controls.enabled') is True

def test_workspace_resize_keeps_zoom_then_raycaster_drag_works(page,api,settings,admin_user):
    open_planner(page,api);page.evaluate("MF_PLANNER.interaction.add({template:'base.drawers_3'})");page.locator('#mode-2d').click();page.locator('#studio-zoom-out').click()
    before=page.evaluate(CAMERA);page.set_viewport_size({'width':1280,'height':820});page.wait_for_timeout(150)
    assert page.evaluate(CAMERA)==pytest.approx(before,abs=1e-8)
    hit=point(page);assert page.evaluate('(h)=>MF_PLANNER.scene.pick(h.x,h.y)!==null',hit)
    page.mouse.move(hit['x'],hit['y']);page.mouse.down();page.mouse.move(hit['x']+40,hit['y']+10,steps=5)
    assert page.evaluate('Boolean(MF_PLANNER.scene.preview)');page.keyboard.press('Escape');page.mouse.up()
