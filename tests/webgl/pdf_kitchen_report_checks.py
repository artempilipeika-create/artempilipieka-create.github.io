"""PDF report acceptance: kitchen hero image, module list, hardware then materials."""
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader
from playwright.sync_api import expect

from tests.stage07.browser_checks import page,settings,api,admin_user,login_ui
from tests.webgl.navigation import panel,close_panels

def open_planner(page,admin_user):
    login_ui(page,admin_user['email'])
    page.goto('https://testserver/constructor')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true')
    page.wait_for_function('()=>window.MF_PLANNER&&window.MF_PLANNER.scene&&window.MF_FURNITURE_CORE')

def page_has_image(pdf_page):
    resources=pdf_page.get('/Resources')
    if not resources:return False
    xobjects=resources.get('/XObject')
    if not xobjects:return False
    xobjects=xobjects.get_object()
    return any(obj.get_object().get('/Subtype')=='/Image' for obj in xobjects.values())

def test_pdf_uses_actual_kitchen_canvas_and_hardware_before_materials(page,api,settings,admin_user):
    open_planner(page,admin_user)
    panel(page,'left','catalog')
    for bazis in ['bazis.0211e4f77fc4','bazis.39f282e08f0c','bazis.2175c60e84a6']:
        page.locator(f'[data-bazis="{bazis}"]').click()
    close_panels(page)
    page.locator('#save-project').click()
    expect(page.locator('#studio-save-state')).to_have_text('Проект сохранён')

    page.locator('.studio-menu > summary').click()
    expect(page.locator('#download-spec')).to_be_visible()
    with page.expect_download() as download:
        page.locator('#download-spec').click()
    raw=Path(download.value.path()).read_bytes()
    reader=PdfReader(BytesIO(raw))
    assert len(reader.pages)==5
    assert page_has_image(reader.pages[0])

    cover=reader.pages[0].extract_text() or ''
    for value in ['Martin Forest · 3D-проект','Модулей: 3','Д1 L','Нижний 2 ящика · с доводчиком','ВМД1 P']:
        assert value in cover

    for index in [1,2,3]:
        assert page_has_image(reader.pages[index])
        assert 'Вид модуля' in (reader.pages[index].extract_text() or '')

    first_module=reader.pages[1].extract_text() or ''
    assert 'Фурнитура' in first_module and 'Материалы' in first_module
    assert first_module.index('Фурнитура')<first_module.index('Материалы')<first_module.index('Вид модуля')
    assert 'Корпус' in first_module and 'Фасад' in first_module
