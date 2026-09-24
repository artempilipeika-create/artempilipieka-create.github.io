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
    second=materials.locator('option').filter(has_text='621 PE').first.get_attribute('value')
    materials.select_option(second)
    expect(page.locator('.material-cell small').first).to_contain_text('2440 × 1220')
    page.get_by_label('Текстура 1',exact=True).select_option('width')
    edge=page.get_by_label('L1 деталь 1',exact=True).locator('option').filter(has_text='E-22').first.get_attribute('value')
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
    page.get_by_label('L1 деталь 3',exact=True).select_option('')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    page.reload();expect(page.get_by_label('Длина 2',exact=True)).to_have_value('777')
    expect(page.get_by_label('Материал 1',exact=True)).to_have_value(second)
    expect(page.get_by_label('Текстура 1',exact=True)).to_have_value('width')
    expect(page.get_by_label('L1 деталь 2',exact=True)).to_have_value(edge)
    expect(page.get_by_label('W2 деталь 2',exact=True)).to_have_value(edge)
    expect(page.get_by_label('L1 деталь 3',exact=True)).to_have_value('')
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
    expect(page.get_by_label('Длина — колонка Excel',exact=True)).to_have_value('A')
    assert page.locator('[name^=mapping_]').evaluate_all('(xs)=>xs.every(x=>x.value!=="L")')
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
    expect(page.get_by_label('Длина — колонка Excel',exact=True)).to_have_value('A')


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
    page.get_by_role('button',name='Выйти',exact=True).click()
    expect(page.locator('#auth')).to_be_visible()
    login_ui(page,admin_user['email']);page.goto('https://testserver/editor?order='+o['order_id'])
    expect(page.get_by_label('Длина 1',exact=True)).to_have_value('')
    expect(page.get_by_role('link',name='manager-source.xls',exact=True)).to_be_visible()


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
    material=page.get_by_label('Материал в строке 2',exact=True)
    # Each earlier fixture publishes a separate namespace. Confirm an exact candidate
    # when several otherwise equal synthetic catalogue cards are available.
    variant=material.locator('option').filter(has_text='621 PO').first.get_attribute('value')
    material.select_option(variant)
    edge=page.get_by_label('L1 в строке 2',exact=True).locator('option').filter(has_text='E-22').first.get_attribute('value')
    page.get_by_label('L1 в строке 2',exact=True).select_option(edge)
    page.get_by_label('W2 в строке 2',exact=True).select_option(edge)
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


def test_group_auto_preserves_manual_edge_and_none_after_material_change_reload(page,api,settings,admin_user):
    _,_,_,email=client_order(api,settings,admin_user,mode='self_prepared')
    login_ui(page,email);page.goto('https://testserver/editor')
    page.get_by_label('Название заказа',exact=True).fill('SYNTHETIC grouped AUTO')
    page.get_by_role('button',name='Заполнить деталировку',exact=True).click()
    picker=page.get_by_label('Материал 1',exact=True)
    first=picker.locator('option').filter(has_text='621 PO').first.get_attribute('value')
    picker.select_option(first)
    page.get_by_label('Длина 1',exact=True).fill('600');page.get_by_label('Ширина 1',exact=True).fill('400')
    page.get_by_label('Текстура материала 1',exact=True).select_option('none')
    page.get_by_role('button',name='+ Деталь в этот материал',exact=True).click()
    page.get_by_label('Длина 2',exact=True).fill('500');page.get_by_label('Ширина 2',exact=True).fill('300')
    expect(page.locator('#manual-rows .material-group')).to_have_count(1)
    expect(page.locator('#manual-rows .material-cell select')).to_have_count(1)
    default=page.get_by_label('Кромка AUTO материала 1',exact=True)
    edge=default.locator('option').filter(has_text='E-22').first.get_attribute('value')
    default.select_option(edge)
    page.get_by_label('L1 деталь 2',exact=True).select_option('')
    page.get_by_label('W1 деталь 1',exact=True).select_option(edge)
    page.get_by_role('button',name='AUTO 4 стороны',exact=True).click()
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    expect(page.get_by_label('L1 деталь 2',exact=True)).to_have_value('')
    expect(page.get_by_label('W1 деталь 1',exact=True)).to_have_value(edge)
    second=picker.locator('option').filter(has_text='621 PE').first.get_attribute('value')
    picker.select_option(second)
    expect(page.get_by_label('W1 деталь 1',exact=True)).to_have_value(edge)
    expect(page.get_by_label('L1 деталь 2',exact=True)).to_have_value('')
    default.select_option(edge)
    page.get_by_role('button',name='Сохранить',exact=True).click()
    expect(page.locator('#message')).to_contain_text('сохранена')
    page.reload()
    expect(page.get_by_label('Материал 1',exact=True)).to_have_value(second)
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    expect(page.get_by_label('L1 деталь 2',exact=True)).to_have_value('')
    expect(page.get_by_label('W1 деталь 1',exact=True)).to_have_value(edge)
    no_overflow(page);screenshot(page,'grouped-auto-manual-protected')


@pytest.mark.parametrize('width',[360,1440])
def test_legacy_block_excel_group_preview_auto_and_saved_template(page,api,settings,admin_user,width):
    from tests.stage03.support import xlsx
    o,_,_,email=client_order(api,settings,admin_user,mode='self_prepared')
    page.set_viewport_size({'width':width,'height':1000})
    login_ui(page,email);page.goto('https://testserver/editor?order='+o['order_id'])
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    data=xlsx({'Детали':[['SYNTHETIC block layout'],['ДСП 621 PO 18мм',None,None,'Кол-во','в','н','л','п','Текстура','Наименование'],
        [None,600,400,2,1,0,0,1,'нет','Полка блока'],[None,500,300,1,1,0,0,0,'нет','Боковина'],
        [None,'ДСП 621 PE 18мм'],[None,450,250,3,1,0,0,0,'нет','Второй материал']]})
    file={'name':'synthetic-blocks.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data}
    page.get_by_label('Файл Excel',exact=True).set_input_files(file)
    expect(page.get_by_label('Длина — колонка Excel',exact=True)).to_have_value('B')
    expect(page.get_by_label('Ширина — колонка Excel',exact=True)).to_have_value('C')
    expect(page.locator('#import-preview')).to_contain_text('Материалов: 2 · Позиций: 3')
    expect(page.locator('#import-preview .import-material-group')).to_have_count(2)
    for row,article in [(3,'621 PO'),(6,'621 PE')]:
        material=page.get_by_label('Материал в строке '+str(row),exact=True)
        material.select_option(material.locator('option').filter(has_text=article).first.get_attribute('value'))
    for group in [1,2]:
        edge=page.locator('#import-preview').get_by_label('Кромка AUTO материала '+str(group),exact=True)
        edge.select_option(edge.locator('option').filter(has_text='E-22').first.get_attribute('value'))
    expect(page.get_by_label('L1 в строке 3',exact=True)).to_have_value('__auto__')
    expect(page.get_by_label('L2 в строке 3',exact=True)).to_have_value('')
    no_overflow(page);screenshot(page,'excel-block-preview-'+str(width))
    page.get_by_role('button',name='Импортировать деталировку',exact=True).click()
    expect(page.get_by_label('Название 2',exact=True)).to_have_value('Полка блока')
    expect(page.get_by_label('Название 4',exact=True)).to_have_value('Второй материал')
    expect(page.get_by_label('L1 деталь 2',exact=True)).to_have_value('__auto__')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    page.reload();expect(page.get_by_label('Название 4',exact=True)).to_have_value('Второй материал')
    expect(page.get_by_label('Количество 2',exact=True)).to_have_value('2')
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    page.get_by_label('Файл Excel',exact=True).set_input_files(file)
    expect(page.get_by_label('Сохранённый шаблон',exact=True)).not_to_have_value('')
    expect(page.locator('#import-preview')).to_contain_text('Материалов: 2 · Позиций: 3')


def searchable_catalogue_order(api):
    from tests.stage03.support import master
    _,release=publish(api,master([
        ['QA621 PO','Дуб синтетический','кв.м',10,2800,2070,18,'PO','','M1','false',''],
        ['621 PE','Другой декор','кв.м',10,2440,1220,18,'PE','','M1','false',''],
        ['AUTO-22-1','Кромка синтетическая','м',1,0,22,1,'Для QA621 РО / 777 PE','','M2','false',''],
        ['AUTO-22-04','Кромка тонкая','м',1,0,22,.4,'QA621 PO','','M2','false',''],
        ['100858','Кромка v9 без артикула материала в описании','м',1,0,22,.8,'Нейтральная кромка','','M2','false',''],
        ['WRONG-POX','Не подходит','м',1,0,22,1,'QA621 POX','','M2','false','']]),namespace='test.visible.autopick')
    email=uuid4().hex+'@example.invalid'
    post(api,'/auth/register',{'email':email,'password':PASSWORD},status=201)
    o=order(api,'self_prepared')
    edges=api.get('/api/v2/catalogue/edges',params={'release':release}).json()['items']
    return o,email,{e['article']:e['edge_id'] for e in edges}


def test_v9_pair_restores_auto_edge_for_621_pe_manual_and_excel(page,api,settings,admin_user):
    from tests.stage03.support import xlsx
    o,email,edges=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/editor?order='+o['order_id'])
    search=page.get_by_label('Поиск материала 1',exact=True);search.fill('621 PE')
    page.locator('.material-suggestions button').first.click()
    expect(page.get_by_label('Кромка AUTO материала 1',exact=True)).to_have_value(edges['100858'])
    page.get_by_label('Оклеить L1 деталь 1',exact=True).check()
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')

    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    data=xlsx({'Детали':[['Наименование','Артикул','Материал','Длина','Ширина','Количество','L1','L2','W1','W2'],['V9 Excel','621 PE','Другой декор',600,400,1,1,0,0,0]]})
    page.get_by_label('Файл Excel',exact=True).set_input_files({'name':'v9-621-pe.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data})
    preview=page.locator('#import-preview')
    expect(preview).to_contain_text('✓ Материал найден автоматически')
    expect(preview.get_by_label('Кромка AUTO материала 1',exact=True)).to_have_value(edges['100858'])
    expect(page.get_by_label('L1 в строке 2',exact=True)).to_have_value('__auto__')


def test_group_edge_choice_bulk_updates_marked_sides_and_keeps_manual_exception(page,api,settings,admin_user):
    o,email,edges=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/editor?order='+o['order_id'])
    search=page.get_by_label('Поиск материала 1',exact=True);search.fill('дуб синтетический')
    page.locator('.material-suggestions button').click()
    page.get_by_label('Длина 1',exact=True).fill('600');page.get_by_label('Ширина 1',exact=True).fill('400')
    page.get_by_role('button',name='+ Деталь в этот материал',exact=True).click()
    page.get_by_label('Длина 2',exact=True).fill('500');page.get_by_label('Ширина 2',exact=True).fill('300')
    page.get_by_label('Оклеить L1 деталь 1',exact=True).check()
    page.get_by_label('Оклеить W2 деталь 2',exact=True).check()
    default=page.get_by_label('Кромка AUTO материала 1',exact=True)
    default.select_option(edges['AUTO-22-04'])
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    expect(page.get_by_label('W2 деталь 2',exact=True)).to_have_value('__auto__')
    page.get_by_label('W1 деталь 1',exact=True).select_option(edges['AUTO-22-1'])
    default.select_option(edges['100858'])
    expect(page.get_by_label('W1 деталь 1',exact=True)).to_have_value(edges['AUTO-22-1'])
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    expect(page.get_by_label('W2 деталь 2',exact=True)).to_have_value('__auto__')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    current=api.get('/api/v2/orders/'+o['order_id']).json()
    details=api.get('/api/v2/orders/'+o['order_id']+'/revisions/'+current['active_revision_id']).json()['details']
    assert details[0]['edges']['L1']['edge']['edge_id']==edges['100858']
    assert details[1]['edges']['W2']['edge']['edge_id']==edges['100858']
    assert details[0]['edges']['W1']['edge']['edge_id']==edges['AUTO-22-1']


def test_excel_glue_pair_becomes_one_36mm_detail_with_different_backing(page,api,settings,admin_user):
    from tests.stage03.support import xlsx
    o,email,_=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/editor?order='+o['order_id'])
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    data=xlsx({'Детали':[['Позиция','Наименование','Артикул','Длина','Ширина','Количество','L1','L2','W1','W2'],
        [7,'Гот.дет тол 36 мм','QA621 PO',600,400,1,1,0,0,0],
        [7,'Полка (Копия)','621 PE',600,400,1,0,0,0,0]]})
    page.get_by_label('Файл Excel',exact=True).set_input_files({'name':'glue-36.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data})
    expect(page.locator('#import-preview .import-material-group')).to_have_count(2)
    page.get_by_role('button',name='Импортировать деталировку',exact=True).click()
    expect(page.locator('#manual-rows tr[data-detail-id]')).to_have_count(1)
    expect(page.get_by_label('Готовая толщина 1',exact=True)).to_have_value('glued_18_18')
    expect(page.locator('#manual-rows .route-cell small')).to_contain_text('621 PE')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    current=api.get('/api/v2/orders/'+o['order_id']).json()
    details=api.get('/api/v2/orders/'+o['order_id']+'/revisions/'+current['active_revision_id']).json()['details']
    assert len(details)==1 and details[0]['route']=='glued_18_18'
    assert details[0]['material']['article']=='QA621 PO'
    assert details[0]['glue_backing']['material']['article']=='621 PE'


def test_3d_workspace_save_copy_2d_and_transfer_to_order(page,api,settings,admin_user):
    o,email,_=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/constructor.html')
    expect(page.locator('#project-name')).to_be_visible()
    page.locator('#project-name').fill('Комод из 3D')
    page.locator('#width').fill('1200');page.locator('#height').fill('900');page.locator('#depth').fill('500')
    page.get_by_role('button',name='2D',exact=True).click();expect(page.locator('#scene-help')).to_contain_text('2D')
    page.get_by_role('button',name='3D',exact=True).click()
    page.locator('#body-search').fill('QA621 PO')
    page.locator('#body-results button').first.click()
    page.locator('#front-search').fill('621 PE')
    page.locator('#front-results button').first.click()
    page.get_by_role('button',name='Сохранить',exact=True).click()
    expect(page.locator('#status')).to_contain_text('сохранён')
    expect(page.locator('#projects .mf3d-project')).to_have_count(1)
    page.get_by_role('button',name='Создать копию',exact=True).click()
    expect(page.locator('#projects .mf3d-project')).to_have_count(2)
    expect(page.locator('#project-name')).to_have_value('Комод из 3D — копия')
    page.get_by_role('button',name='Перенести в заказ',exact=True).click()
    page.wait_for_url('**/editor?order=*')
    expect(page.get_by_label('Длина 1',exact=True)).to_have_value('820')
    expect(page.locator('#manual-rows tr[data-detail-id]')).to_have_count(5)
    screenshot(page,'3d-transfer-to-order')


def fill_own_material(page):
    dialog=page.get_by_role('dialog',name='Свой материал',exact=True)
    for label,value in [('Артикул / свой код','MY-BOARD'),('Название своего материала','Мой дуб'),('Производитель (необязательно)','Мастерская'),
                        ('Толщина своего материала, мм','18'),('Длина своего листа, мм','2800'),('Ширина своего листа, мм','2070'),('Листов клиента, шт.','3')]:
        dialog.get_by_label(label,exact=True).fill(value)
    dialog.get_by_label('Подтверждаю: это материал клиента',exact=True).check()
    dialog.get_by_role('button',name='Использовать свой материал',exact=True).click()
    expect(dialog).not_to_be_attached()


@pytest.mark.parametrize('width',[360,1440])
def test_visible_autocomplete_auto_edges_and_own_material_save_reload(page,api,settings,admin_user,width):
    o,email,edges=searchable_catalogue_order(api)
    page.set_viewport_size({'width':width,'height':1000});login_ui(page,email)
    page.goto('https://testserver/editor?order='+o['order_id'])
    search=page.get_by_label('Поиск материала 1',exact=True);search.fill('дуб синтетический')
    expect(page.locator('.material-suggestions button')).to_have_count(1)
    expect(page.locator('.material-suggestions')).to_contain_text('2800 × 2070')
    no_overflow(page);screenshot(page,'material-live-search-'+str(width))
    if width==1440: search.press('ArrowDown');page.keyboard.press('Enter')
    else: page.locator('.material-suggestions button').click()
    expect(page.get_by_label('Кромка AUTO материала 1',exact=True)).to_have_value(edges['AUTO-22-1'])
    expect(page.locator('.edge-suggestions')).not_to_contain_text('WRONG-POX')
    page.get_by_label('Длина 1',exact=True).fill('600');page.get_by_label('Ширина 1',exact=True).fill('400')
    page.get_by_label('Оклеить L1 деталь 1',exact=True).check()
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    page.get_by_label('W1 деталь 1',exact=True).select_option(edges['AUTO-22-1'])
    page.get_by_label('L2 деталь 1',exact=True).select_option('')
    page.locator('.edge-suggestions button').filter(has_text='AUTO-22-04').click()
    expect(page.get_by_label('Кромка AUTO материала 1',exact=True)).to_have_value(edges['AUTO-22-04'])
    expect(page.get_by_label('W1 деталь 1',exact=True)).to_have_value(edges['AUTO-22-1'])
    expect(page.get_by_label('L2 деталь 1',exact=True)).to_have_value('')
    page.get_by_role('button',name='+ Добавить материал',exact=True).click()
    page.get_by_role('button',name='+ Свой материал',exact=True).last.click();fill_own_material(page)
    page.get_by_label('Длина 2',exact=True).fill('500');page.get_by_label('Ширина 2',exact=True).fill('300')
    page.get_by_label('Подбор кромки 2',exact=True).fill('AUTO-22-1')
    page.locator('.material-group').last.locator('.edge-suggestions button').click()
    page.get_by_label('Оклеить W2 деталь 2',exact=True).check()
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    page.reload()
    expect(page.get_by_label('Кромка AUTO материала 1',exact=True)).to_have_value(edges['AUTO-22-04'])
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    expect(page.get_by_label('W1 деталь 1',exact=True)).to_have_value(edges['AUTO-22-1'])
    expect(page.get_by_label('L2 деталь 1',exact=True)).to_have_value('')
    expect(page.locator('.material-group').last.locator('.material-cell small')).to_contain_text('MY-BOARD')
    expect(page.get_by_label('W2 деталь 2',exact=True)).to_have_value('__auto__')
    no_overflow(page);screenshot(page,'auto-edge-own-material-'+str(width))
    page.get_by_role('button',name='Изменить свой материал',exact=True).click()
    expect(page.get_by_label('Листов клиента, шт.',exact=True)).to_have_value('3')
    expect(page.get_by_label('Производитель (необязательно)',exact=True)).to_have_value('Мастерская')
    page.get_by_role('button',name='Отмена',exact=True).click()
    current=api.get('/api/v2/orders/'+o['order_id']).json()
    details=api.get('/api/v2/orders/'+o['order_id']+'/revisions/'+current['active_revision_id']).json()['details']
    assert details[0]['edges']['L1']['edge']['edge_id']==edges['AUTO-22-04']
    assert details[1]['material']['article']=='MY-BOARD' and details[1]['provided_sheets']==3


def test_excel_auto_edge_and_create_own_material_before_import(page,api,settings,admin_user):
    from tests.stage03.support import xlsx
    o,email,edges=searchable_catalogue_order(api);login_ui(page,email)
    page.goto('https://testserver/editor?order='+o['order_id'])
    page.get_by_role('button',name='Загрузить Excel',exact=True).click()
    data=xlsx({'Детали':[['Наименование','Артикул','Длина','Ширина','Количество','L1','L2','W1','W2'],
                       ['Полка','QA621 PO',600,400,2,1,0,0,1],['Своя деталь','UNKNOWN',500,300,1,0,0,0,0]]})
    page.get_by_label('Файл Excel',exact=True).set_input_files({'name':'synthetic-auto-own.xlsx','mimeType':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','buffer':data})
    preview=page.locator('#import-preview')
    expect(preview.locator('.import-material-group')).to_have_count(2)
    expect(preview.get_by_label('Кромка AUTO материала 1',exact=True)).to_have_value(edges['AUTO-22-1'])
    expect(page.get_by_label('L1 в строке 2',exact=True)).to_have_value('__auto__')
    preview.get_by_role('button',name='+ Свой материал',exact=True).last.click();fill_own_material(page)
    expect(preview).to_contain_text('Свой материал клиента: Мой дуб')
    screenshot(page,'excel-auto-own-material')
    page.get_by_role('button',name='Импортировать деталировку',exact=True).click()
    expect(page.get_by_label('Название 2',exact=True)).to_have_value('Своя деталь')
    expect(page.get_by_label('L1 деталь 1',exact=True)).to_have_value('__auto__')
    page.get_by_role('button',name='Сохранить',exact=True).click();expect(page.locator('#message')).to_contain_text('сохранена')
    page.reload()
    expect(page.locator('.material-group').last.locator('.material-cell small')).to_contain_text('Мой дуб')
    page.get_by_role('button',name='Изменить свой материал',exact=True).click()
    expect(page.get_by_label('Артикул / свой код',exact=True)).to_have_value('MY-BOARD')
    expect(page.get_by_label('Листов клиента, шт.',exact=True)).to_have_value('3')
    page.get_by_role('button',name='Отмена',exact=True).click()
