"""Real browser upload and client projection over isolated ASGI/Postgres."""
import pytest
from playwright.sync_api import expect
from tests.stage07.browser_checks import page, presentation_enabled, login_ui, screenshot, no_overflow
from tests.stage84.test_attachments import settings, api, admin_user, scene, PDF, OBLX


@pytest.mark.parametrize('width',[360,1440])
def test_manual_files_staff_then_owner(page,scene,width):
    page.set_viewport_size({'width':width,'height':1000})
    login_ui(page,scene['manager']['email'])
    page.get_by_role('button',name='Файлы заказа',exact=True).click()
    expect(page.get_by_role('heading',name='Файлы заказа',exact=True)).to_be_visible()
    page.get_by_label('Файл до 10 МБ',exact=True).set_input_files({'name':'drawing.pdf','mimeType':'application/pdf','buffer':PDF})
    expect(page.get_by_label('Кому доступен',exact=True)).to_have_value('staff_internal')
    page.get_by_label('Кому доступен',exact=True).select_option('client_visible')
    page.get_by_label('Комментарий для сотрудников (клиенту не показывается)',exact=True).fill('SYNTHETIC STAFF ONLY')
    page.get_by_role('button',name='Добавить файл',exact=True).click()
    expect(page.locator('.order-files table')).to_contain_text('drawing.pdf')
    expect(page.locator('.order-files table')).to_contain_text('SYNTHETIC STAFF ONLY')
    page.get_by_label('Файл до 10 МБ',exact=True).set_input_files({'name':'ready.oblx','mimeType':'application/xml','buffer':OBLX})
    expect(page.get_by_label('Кому доступен',exact=True)).to_have_value('production_internal')
    page.get_by_role('button',name='Добавить файл',exact=True).click()
    expect(page.locator('.order-files table')).to_contain_text('ready.oblx')
    no_overflow(page);screenshot(page,f'manual-files-staff-{width}')
    page.get_by_role('button',name='Выйти',exact=True).click()
    expect(page.locator('#auth')).to_be_visible()
    login_ui(page,scene['owner']['email'])
    page.goto('https://testserver/account#'+scene['oid'])
    expect(page.locator('.order-files table')).to_contain_text('drawing.pdf')
    expect(page.locator('.order-files')).not_to_contain_text('ready.oblx')
    expect(page.locator('.order-files')).not_to_contain_text('SYNTHETIC STAFF ONLY')
    expect(page.locator('.order-files')).not_to_contain_text('Комментарий сотрудника')
    expect(page.get_by_role('button',name='Добавить файл',exact=True)).to_have_count(0)
    expect(page.get_by_role('link',name='Скачать drawing.pdf',exact=True)).to_be_visible()
    no_overflow(page);screenshot(page,f'manual-files-owner-{width}')
