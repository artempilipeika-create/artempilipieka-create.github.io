"""Visual geometry and unchanged interaction on the real ASGI/test Postgres."""
from playwright.sync_api import expect
from tests.webgl.navigation import panel,close_panels
from tests.webgl.browser_checks import page,settings,api,admin_user,open_planner,seed

def test_visual_panels_and_handles_have_real_meshes_and_fixed_facade_dimensions(page,api,settings,admin_user):
    open_planner(page,api)
    panel(page,'left','catalog')
    page.locator('[data-template="base.two_door"]').click()
    data=page.evaluate('''()=>{const p=MF_PLANNER,g=p.scene.entries.get(p.adapter.selected.item_id).group;return{fronts:g.children.filter(m=>m.userData.role==='front').map(m=>m.userData.facade),handles:g.children.filter(m=>m.userData.role==='handle').map(m=>m.position.x),boards:g.children.filter(m=>m.userData.role==='body').length};}''')
    assert len(data['fronts'])==2 and all(x['w']==397 for x in data['fronts'])
    assert data['boards']==4 and data['handles'][0]<0<data['handles'][1]
    assert all(abs(abs(x)-.0515)<1e-6 for x in data['handles'])

def test_visual_continuous_plinth_has_no_overlapping_individual_aprons(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13)
    data=page.evaluate('''()=>{const p=MF_PLANNER;return {merged:p.scene.dressing.userData.mergedPlinthIds.length,individual:[...p.scene.entries.values()].filter(e=>p.adapter.items.find(i=>i.item_id===e.group.userData.itemId).module_type==='base_cabinet').flatMap(e=>e.group.children.filter(m=>m.userData.role==='plinth')).filter(m=>m.visible).length,counters:p.scene.dressing.children.flatMap(g=>g.children.filter(m=>m.userData.role==='counter')).length};}''')
    assert data=={'merged':6,'individual':0,'counters':1}

def test_visual_thumbnail_uses_same_mesh_without_a_second_webgl_context(page,api,settings,admin_user):
    open_planner(page,api)
    panel(page,'left','catalog')
    expect(page.locator('#module-catalogue canvas[data-model-preview="mesh-v2"]').first).to_be_visible(timeout=15000)
    assert page.locator('.mf3d-canvas-wrap canvas').count()==1
    assert page.evaluate('MF_PLANNER.adapter.items.length')==0

def test_visual_client_mode_keeps_camera_and_order_but_hides_technical_panels(page,api,settings,admin_user):
    open_planner(page,api);seed(page,13)
    panel(page,'left')
    before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())');page.locator('#planner-client').click()
    expect(page.locator('.mf3d-left')).to_be_hidden();expect(page.locator('.mf3d-right')).to_be_hidden()
    expect(page.locator('#to-order')).to_be_visible();expect(page.locator('#planner-front')).to_be_visible()
    expect(page.locator('.mf3d-overlay')).to_be_hidden()
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    page.locator('#planner-client').click();expect(page.locator('.mf3d-left')).to_be_visible()

def test_visual_geometry_cache_survives_rebuild_and_context_loss(page,api,settings,admin_user):
    open_planner(page,api);seed(page,30)
    assert page.evaluate('MF_PLANNER.scene.renderer.shadowMap.autoUpdate') is False
    before=page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')
    page.evaluate('MF_PLANNER.scene.renderer.forceContextLoss()');expect(page.locator('body')).to_have_attribute('data-planner-renderer','fallback')
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
    page.locator('#planner-retry').click();expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl',timeout=20000)
    assert page.evaluate('JSON.stringify(MF_PLANNER.bridge.payload())')==before
