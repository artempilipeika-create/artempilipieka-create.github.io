"""Chromium + real ASGI/Postgres, isolated synthetic data. No staging/prod writes.
Browser requests are transported to TestClient; responses, cookies and RBAC are real.
"""
from pathlib import Path
from uuid import uuid4
import os,json
import pytest
from playwright.sync_api import sync_playwright,expect
from fastapi.testclient import TestClient
from cryptography.fernet import Fernet
from backend.v2.app import create_app
from backend.v2.security import WebPolicy,COOKIE
from backend.v2.db import transaction
from tests.stage03.test_api import settings,api,admin_user,publish,post,login,PASSWORD
from tests.stage04.test_api import configure,item,order
from tests.stage05.test_api import client_order

OUT=Path(os.environ.get('MF_TEST_EVIDENCE_DIR','qa-output/stage07'))

@pytest.fixture
def page(settings):
    OUT.mkdir(parents=True,exist_ok=True)
    policy=WebPolicy('https://testserver',Fernet.generate_key(),network_auth_per_hour=100000,network_emails_per_hour=100000)
    with TestClient(create_app(settings,policy),base_url=policy.origin) as transport, sync_playwright() as p:
        browser=p.chromium.launch(headless=True)
        context=browser.new_context(viewport={'width':1440,'height':1000})
        errors=[]
        def request(route):
            req=route.request
            if not req.url.startswith(policy.origin+'/'):
                route.abort();return
            transport.cookies.clear()
            response=transport.request(req.method,req.url,headers=req.headers,content=req.post_data_buffer)
            route.fulfill(status=response.status_code,headers=dict(response.headers),body=response.content)
        context.route('**/*',request)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        yield page
        assert not errors,errors
        context.close();browser.close()

def screenshot(page,name):page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
def no_overflow(page):assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
def login_ui(page,email):
    page.goto('https://testserver/login');page.get_by_label('Email',exact=True).fill(email)
    page.get_by_label('Пароль',exact=True).fill(PASSWORD);page.get_by_role('button',name='Войти',exact=True).click()
    expect(page.locator('#auth')).to_be_hidden()

@pytest.mark.parametrize('width',[360,768,1440])
def test_public_responsive_keyboard(page,width):
    page.set_viewport_size({'width':width,'height':1000})
    for path,name in [('/','home'),('/about/','about'),('/services/','services'),('/services/raspil/','raspil'),('/services/kromka/','kromka'),('/order/','preparation'),('/how-it-works/','process'),('/contacts/','contacts'),('/3d/','3d'),('/login','login'),('/register','register')]:
        page.goto('https://testserver'+path);no_overflow(page)
        expect(page.locator('h1')).to_be_visible()
        assert page.locator('img').evaluate_all('(xs)=>xs.every(x=>x.complete && x.naturalWidth>0)')
        screenshot(page,f'{name}-{width}')
    page.goto('https://testserver/');page.keyboard.press('Tab');expect(page.locator('.mf-skip')).to_be_focused();page.keyboard.press('Enter')
    if width==360:
        page.locator('.mf-menu summary').click();expect(page.locator('.mf-menu')).to_have_attribute('open','');page.keyboard.press('Escape');assert not page.locator('.mf-menu').get_attribute('open')

@pytest.mark.parametrize('width',[360,768,1440])
def test_client_editor_actual_api(page,api,settings,admin_user,width):
    o,_,_,email=client_order(api,settings,admin_user,mode='manager_assisted')
    login(api,admin_user['email']);release=api.get('/api/v2/catalogue/releases').json()['active_release'];m=item(api,release);configure(api,o,release,m)
    page.set_viewport_size({'width':width,'height':1000});login_ui(page,email)
    expect(page.get_by_role('heading',name='Мои заказы',exact=True)).to_be_visible();screenshot(page,f'cabinet-{width}')
    page.goto('https://testserver/editor?order='+o['order_id']);page.get_by_role('button',name='Добавить деталь',exact=True).click()
    page.get_by_label('Длина, мм',exact=True).fill('600');page.get_by_label('Ширина, мм',exact=True).fill('400');page.get_by_label('Количество, шт.',exact=True).fill('0')
    page.get_by_role('button',name='Сохранить строку',exact=True).click();expect(page.locator('#message')).to_contain_text('больше нуля');expect(page.get_by_label('Количество, шт.',exact=True)).to_have_value('0')
    page.get_by_label('Количество, шт.',exact=True).fill('3');page.get_by_label('Поиск материала: артикул, структура',exact=True).fill('621 PO')
    page.locator('#row-panel').get_by_role('button',name='Найти',exact=True).first.click()
    page.locator('#row-panel .result-list button').first.click();page.get_by_label('Направление текстуры',exact=True).select_option('none')
    page.get_by_role('button',name='Сохранить строку',exact=True).click();expect(page.locator('#manual-rows')).to_contain_text('600 × 400')
    no_overflow(page);screenshot(page,f'editor-{width}')
    page.get_by_role('button',name='Сохранить новую редакцию',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Подтвердить',exact=True).click()
    expect(page.locator('#message')).to_contain_text('сохранена')
    page.get_by_role('button',name='Предварительный расчёт',exact=True).click();expect(page.locator('#message')).to_contain_text('Предварительный расчёт создан')
    page.goto('https://testserver/account#'+o['order_id']);expect(page.get_by_role('heading',name='Документы',exact=True)).to_be_visible()
    assert not page.locator('main').inner_text().find('lease_token')>=0
    no_overflow(page);screenshot(page,f'order-{width}')
    page.goto('https://testserver/admin.html');expect(page.get_by_role('heading',name='Доступ ограничен',exact=True)).to_be_visible()
    assert page.locator('text=Сотрудники').count()==0


def test_staff_admin_and_error_states(page,api,settings,admin_user):
    login_ui(page,admin_user['email']);expect(page.get_by_role('heading',name='Рабочий кабинет',exact=True)).to_be_visible()
    page.get_by_role('button',name='Сотрудники',exact=True).click();expect(page.get_by_role('heading',name='Сотрудники',exact=True)).to_be_visible();screenshot(page,'staff-admin-1440')
    page.get_by_role('button',name='Журнал действий',exact=True).click();expect(page.get_by_role('heading',name='Журнал действий',exact=True)).to_be_visible()
    page.get_by_role('button',name='Выйти',exact=True).click();expect(page.locator('#auth')).to_be_visible()
    page.get_by_label('Email',exact=True).fill('missing@example.invalid');page.get_by_label('Пароль',exact=True).fill('wrong-password-123')
    page.get_by_role('button',name='Войти',exact=True).click();expect(page.locator('#message')).to_contain_text('Не удалось войти');expect(page.locator('#account')).to_be_hidden();screenshot(page,'login-error-1440')


def test_zoom_200_and_form_labels(page):
    page.set_viewport_size({'width':720,'height':500})
    page.goto('https://testserver/login')
    # 1440 CSS pixels at 200% browser zoom has a 720 CSS-pixel layout viewport.
    no_overflow(page);assert page.locator('input').evaluate_all('(xs)=>xs.every(x=>x.labels.length>0)')
    screenshot(page,'login-zoom-equivalent-200')


@pytest.fixture(autouse=True)
def presentation_enabled(monkeypatch):
    monkeypatch.setenv("MF_PRESENTATION_UI","enabled")

def test_manager_import_keeps_zero_and_source(page,api,settings,admin_user):
    from tests.stage03.support import xlsx
    o,_,_,email=client_order(api,settings,admin_user,mode='manager_assisted')
    login_ui(page,email);page.goto('https://testserver/editor?order='+o['order_id'])
    page.get_by_role('button',name='Импорт Excel',exact=True).click()
    data=xlsx({'Лист1':[['Длина','Ширина','Количество','Артикул','Материал','L1','L2','W1','W2','Текстура','Вращение'],[600,400,0,'621 PO','Board','0','0','0','0','none','false']]})
    page.get_by_label('Файл XLSX',exact=True).set_input_files({'name':'synthetic-stage07.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data})
    page.get_by_role('button',name='Проверить файл',exact=True).click()
    expect(page.get_by_role('heading',name='Предпросмотр — строки не потеряны',exact=True)).to_be_visible()
    page.get_by_role('button',name='Добавить позиции в черновик',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Подтвердить',exact=True).click()
    expect(page.get_by_role('heading',name='Позиции из Excel',exact=True)).to_be_visible();expect(page.locator('main')).to_contain_text('qty: must_be_positive')
    screenshot(page,'excel-zero-preserved')
    with transaction(settings) as c:
        assert c.execute('SELECT snapshot FROM mf_order_draft_rows WHERE order_id=%s',(o['order_id'],)).fetchone()['snapshot']['values']['qty']==0
        assert c.execute("SELECT count(*) n FROM mf_files WHERE order_id=%s AND kind='source'",(o['order_id'],)).fetchone()['n']==1


def test_assigned_manager_queue_no_admin(page,api,settings,admin_user):
    from tests.stage05.test_api import staff
    o=order(api)
    _,email=staff(settings,'manager',o['order_id'],['orders.read'],assigned=True)
    login_ui(page,email);expect(page.get_by_role('heading',name='Рабочий кабинет',exact=True)).to_be_visible()
    expect(page.locator('#staff-content')).to_contain_text(o['business_name'])
    assert page.get_by_role('button',name='Сотрудники',exact=True).count()==0
    screenshot(page,'manager-1440')
