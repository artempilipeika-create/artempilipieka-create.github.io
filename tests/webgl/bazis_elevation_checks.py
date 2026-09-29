"""BAZIS native export must preserve scene vertical placement."""
import json
from pathlib import Path
from playwright.sync_api import expect
from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels

def open_planner(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_FURNITURE_CORE')

def export_payload(page):
    close_panels(page)
    with page.expect_download() as d:
        page.locator('#export-bazis').click()
    return json.loads(Path(d.value.path()).read_text())

def test_lower_and_upper_keep_scene_elevation_in_bazis_export(page,api,settings,admin_user):
    open_planner(page,admin_user)
    panel(page,'left','catalog')
    page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
    page.locator('[data-bazis="bazis.2175c60e84a6"]').click()
    expected=page.evaluate("""()=>MF_PLANNER.adapter.items.map(it=>({
      id:it.bazis_id,
      elevation:MF_FURNITURE_CORE.elevation(it,MF_PLANNER.adapter.room)
    }))""")
    assert expected==[
      {'id':'bazis.0211e4f77fc4','elevation':0},
      {'id':'bazis.2175c60e84a6','elevation':1480},
    ]
    native=export_payload(page)
    assert [(x['bazis_id'],x['position']['y']) for x in native['items']]==[
      ('bazis.0211e4f77fc4',0),
      ('bazis.2175c60e84a6',1480),
    ]
