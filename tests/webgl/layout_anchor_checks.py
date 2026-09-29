"""Left-to-right insertion and local-left anchored width resize in the real planner."""
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels

def open_planner(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_PLANNER.interaction&&window.MF_FURNITURE_CORE')

def items(page):
    return page.evaluate("""()=>MF_PLANNER.adapter.items.map(x=>({id:x.item_id,bazis:x.bazis_id,x:x.x,z:x.z,width:x.width,rotation:x.rotation}))""")

def test_click_add_starts_left_and_width_grows_only_right(page,api,settings,admin_user):
    open_planner(page,admin_user)
    panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
    first=items(page)[0]
    assert first['width']==600 and first['rotation']==0
    assert first['x']-first['width']/2==-2100

    panel(page,'right')
    page.locator('#width').fill('800');page.locator('#width').press('Tab')
    page.wait_for_function('()=>MF_PLANNER.adapter.selected.width===800')
    resized=items(page)[0]
    assert resized['x']==-1700
    assert resized['x']-resized['width']/2==-2100
    assert resized['x']+resized['width']/2==-1300

    panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.3079d0656398"]').click()
    row=items(page)
    assert len(row)==2
    second=row[1]
    assert second['x']==-1000 and second['width']==600
    assert second['x']-second['width']/2==resized['x']+resized['width']/2

    # Upper cabinets form their own left-to-right row and can start over the lower row.
    page.locator('[data-bazis="bazis.2175c60e84a6"]').click()
    upper=items(page)[2]
    assert upper['x']-upper['width']/2==-2100
