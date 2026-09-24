"""Chromium + real ASGI/Postgres, isolated synthetic data. No staging/prod writes.
Browser requests are transported to TestClient; responses, cookies and RBAC are real.
"""
from pathlib import Path
from uuid import uuid4
import os,json,base64
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

def screenshot(page,name):
    page.screenshot(path=str(OUT/(name+'.png')),full_page=True)
    if name in {'home-360','home-1440','editor-360','editor-1440','about-1440','services-1440','preparation-1440','3d-1440'}:
        data=page.screenshot(type='jpeg',quality=40,full_page=False)
        encoded=base64.b64encode(data).decode()
        print('MF_UI_SCREENSHOT_BEGIN '+name,flush=True)
        for n in range(0,len(encoded),3000): print('MF_UI_IMAGE '+encoded[n:n+3000],flush=True)
        print('MF_UI_SCREENSHOT_END '+name,flush=True)
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
        if path=='/':
            assert page.locator('body').evaluate('(x)=>getComputedStyle(x).backgroundColor')=='rgb(246, 243, 235)'
            assert page.locator('.mf-wrap').first.evaluate('(x)=>x.getBoundingClientRect().width')<=1240
        assert page.locator('img').evaluate_all('(xs)=>xs.every(x=>x.complete && x.naturalWidth>0)')
        screenshot(page,f'{name}-{width}')
    page.goto('https://testserver/');page.keyboard.press('Tab');expect(page.locator('.mf-skip')).to_be_focused();page.keyboard.press('Enter')
    if width==360:
        page.locator('.mf-menu summary').click();expect(page.locator('.mf-menu')).to_have_attribute('open','');page.keyboard.press('Escape');assert not page.locator('.mf-menu').get_attribute('open')

@pytest.mark.parametrize('width',[360,768,1440])
def test_client_editor_actual_api(page,api,settings,admin_user,width):
    o,r,c,email=client_order(api,settings,admin_user,mode='self_prepared')
    page.set_viewport_size({'width':width,'height':1000});login_ui(page,email)
    page.goto('https://testserver/editor?order='+o['order_id'])
    expect(page.get_by_label('Длина 1',exact=True)).to_have_value('600')
    page.get_by_label('Поиск материала 1',exact=True).fill('621 PE')
    materials=page.get_by_label('Материал 1',exact=True)
    second=materials.locator('option').filter(has_text='621 PE').get_attribute('value')
    materials.select_option(second)
    expect(page.locator('.material-cell small').first).to_contain_text('2440 × 1220')
    page.get_by_label('Текстура 1',exact=True).select_option('width')
    edge=page.get_by_label('L1 деталь 1',exact=True).locator('option').filter(has_text='E-22').get_attribute('value')
    page.get_by_label('L1 деталь 1',exact=True).select_option(edge)
    page.get_by_label('W2 деталь 1',exact=True).select_option(edge)
    page.get_by_label('Количество 1',exact=True).fill('0')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('больше нуля')
    page.get_by_label('Количество 1',exact=True).fill('3')
    for i in range(2,6):
        page.get_by_role('button',name='+ Добавить деталь',exact=True).click()
        row=page.locator('[data-detail-id]').nth(i-1)
        row.get_by_role('button',name='Материал ↑',exact=True).click()
        row.get_by_role('button',name='Кромка ↑',exact=True).click()
        page.get_by_label('Длина '+str(i),exact=True).fill(str(600+i))
        page.get_by_label('Ширина '+str(i),exact=True).fill('400')
        page.get_by_label('Текстура '+str(i),exact=True).select_option('none')
        page.get_by_label('Название '+str(i),exact=True).fill('Полка '+str(i))
    page.locator('[data-detail-id]').last.get_by_role('button',name='Дублировать',exact=True).click()
    expect(page.locator('[data-detail-id]')).to_have_count(6)
    page.locator('[data-detail-id]').last.get_by_role('button',name='Удалить',exact=True).click()
    expect(page.locator('[data-detail-id]')).to_have_count(5)
    page.get_by_label('Длина 2',exact=True).fill('777')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    page.reload();expect(page.get_by_label('Длина 2',exact=True)).to_have_value('777')
    expect(page.get_by_label('Материал 1',exact=True)).to_have_value(second)
    expect(page.get_by_label('Текстура 1',exact=True)).to_have_value('width')
    expect(page.get_by_label('L1 деталь 2',exact=True)).to_have_value(edge)
    expect(page.get_by_label('W2 деталь 2',exact=True)).to_have_value(edge)
    expect(page.locator('[data-detail-id]')).to_have_count(5);no_overflow(page);screenshot(page,f'editor-{width}')
    page.get_by_role('button',name='Предварительный расчёт',exact=True).click();expect(page.locator('#message')).to_contain_text('Предварительный расчёт создан')
    expect(page.get_by_role('link',name='Посмотреть PDF',exact=True)).to_be_visible()
    expect(page.get_by_role('link',name='Скачать PDF',exact=True)).to_be_visible()
    expect(page.get_by_role('button',name='Отправить заявку',exact=True)).to_be_visible()
    no_overflow(page);screenshot(page,f'order-{width}')
    with transaction(settings) as c:
        row=c.execute('SELECT * FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()
        assert row['workflow_status']=='draft'
        details=c.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(row['active_revision_id'],)).fetchone()['content']['details']
        assert len(details)==5 and details[1]['length']=='777'
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

def test_excel_mapping_template_and_bad_rows(page,api,settings,admin_user):
    from tests.stage03.support import xlsx
    o,_,_,email=client_order(api,settings,admin_user,mode='self_prepared')
    login_ui(page,email);page.goto('https://testserver/editor?order='+o['order_id'])
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    data=xlsx({'Лист1':[['Длина','Ширина','Количество','Артикул','Материал','L1','L2','W1','W2','Текстура','Вращение','Лишний столбец'],[600,400,0,'621 PO','Board','0','0','0','0','none','false','ignore'],['',400,'ошибка','UNKNOWN','Неизвестный','0','0','0','0','none','false','ignore']]})
    file={'name':'synthetic-entry.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data}
    page.get_by_label('Файл Excel',exact=True).set_input_files(file)
    expect(page.get_by_label('Колонка A',exact=True)).to_have_value('length')
    expect(page.get_by_label('Колонка L',exact=True)).to_have_value('')
    page.get_by_role('button',name='Проверить деталировку',exact=True).click()
    expect(page.get_by_role('heading',name='Проверьте деталировку перед импортом',exact=True)).to_be_visible()
    expect(page.locator('#import-preview')).to_contain_text('должно быть больше нуля')
    expect(page.locator('#import-preview')).to_contain_text('UNKNOWN')
    screenshot(page,'excel-preview-errors')
    page.get_by_role('button',name='Импортировать деталировку',exact=True).click()
    expect(page.get_by_label('Количество 2',exact=True)).to_have_value('0')
    expect(page.locator('main')).to_contain_text('ошибка')
    with transaction(settings) as c:
        rows=c.execute('SELECT snapshot FROM mf_order_draft_rows WHERE order_id=%s',(o['order_id'],)).fetchall()
        assert len(rows)==2 and any(r['snapshot']['values']['qty']==0 for r in rows)
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    page.get_by_label('Файл Excel',exact=True).set_input_files(file)
    expect(page.get_by_label('Сохранённый шаблон',exact=True)).not_to_have_value('')
    expect(page.get_by_label('Колонка A',exact=True)).to_have_value('length')


def test_manager_file_only_flow(page,api,settings,admin_user):
    o,_,_,email=client_order(api,settings,admin_user,mode='manager_assisted')
    login_ui(page,email);page.goto('https://testserver/editor?order='+o['order_id'])
    expect(page.get_by_role('button',name='Загрузить Excel',exact=True)).to_have_count(0)
    data=base64.b64decode(Path('tests/stage84/fixtures/plain.xls.b64').read_text())
    page.get_by_label('Прикрепить Excel',exact=True).set_input_files({'name':'manager-source.xls','mimeType':'application/vnd.ms-excel','buffer':data})
    page.get_by_role('button',name='Передать менеджеру',exact=True).click()
    expect(page.locator('#message')).to_contain_text('переданы менеджеру')
    expect(page.get_by_role('link',name='manager-source.xls',exact=True)).to_be_visible()
    screenshot(page,'manager-source-submitted')
    with transaction(settings) as c:
        assert c.execute('SELECT workflow_status FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()['workflow_status']=='submitted'
        assert c.execute('SELECT count(*) n FROM mf_import_batches WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0
        assert c.execute('SELECT count(*) n FROM mf_production_jobs WHERE order_id=%s',(o['order_id'],)).fetchone()['n']==0


def test_excel_valid_edges_calculation_pdf_and_template_reuse(page,api,settings,admin_user):
    from tests.stage03.support import xlsx
    from io import BytesIO
    from pypdf import PdfReader
    o,_,_,email=client_order(api,settings,admin_user,mode='self_prepared')
    login_ui(page,email);page.goto('https://testserver/editor?order='+o['order_id'])
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    data=xlsx({'Детали':[['Название','Материал','Длина','Ширина','Количество','L1','L2','W1','W2','Текстура','Примечание'],['Полка Excel','621 PO',650,350,2,'E-22','0','0','E-22','нет','Из файла']]})
    file={'name':'valid-entry.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data}
    page.get_by_label('Файл Excel',exact=True).set_input_files(file)
    page.get_by_role('button',name='Проверить деталировку',exact=True).click()
    expect(page.get_by_label('Материал в строке 2',exact=True)).not_to_have_value('')
    expect(page.get_by_label('L1 в строке 2',exact=True)).not_to_have_value('?')
    page.get_by_role('button',name='Импортировать деталировку',exact=True).click()
    expect(page.get_by_label('Название 2',exact=True)).to_have_value('Полка Excel')
    expect(page.get_by_label('Текстура 2',exact=True)).to_have_value('none')
    page.get_by_role('button',name='Предварительный расчёт',exact=True).click()
    expect(page.get_by_role('link',name='Скачать PDF',exact=True)).to_be_visible()
    expect(page.locator('main')).to_contain_text('Полка Excel')
    expect(page.locator('main')).to_contain_text('E-22')
    pdf_url=page.get_by_role('link',name='Скачать PDF',exact=True).get_attribute('href')
    response=api.get(pdf_url);assert response.status_code==200
    text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(response.content)).pages)
    assert all(v in text for v in ['Полка Excel','650','350','E-22','Из файла'])
    with transaction(settings) as c:
        current=c.execute('SELECT * FROM mf_orders WHERE order_id=%s',(o['order_id'],)).fetchone()
        assert current['workflow_status']=='draft'
        details=c.execute('SELECT content FROM mf_order_revisions WHERE revision_id=%s',(current['active_revision_id'],)).fetchone()['content']['details']
        assert len(details)==2 and details[1]['edges']['L1']['edge']['article']=='E-22'
        count=c.execute('SELECT count(*) n FROM mf_import_template_revisions').fetchone()['n']
    page.get_by_role('button',name='К деталировке',exact=True).click()
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    page.get_by_label('Файл Excel',exact=True).set_input_files(file)
    expect(page.get_by_label('Сохранённый шаблон',exact=True)).not_to_have_value('')
    page.get_by_role('button',name='Проверить деталировку',exact=True).click()
    expect(page.get_by_role('heading',name='Проверьте деталировку перед импортом',exact=True)).to_be_visible()
    with transaction(settings) as c:
        assert c.execute('SELECT count(*) n FROM mf_import_template_revisions').fetchone()['n']==count
