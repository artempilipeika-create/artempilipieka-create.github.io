"""Exercise the manager's questionnaire with an isolated browser project and local or published assets."""
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4
import argparse
import os
import sys

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tests.webgl.synthetic_projects import SyntheticProjects

ORIGIN = 'https://martin-forest-v2-staging-production.up.railway.app'


def exercise(live=False):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2.cabinet_ui import router
    service=FastAPI()
    service.include_router(router())
    files=TestClient(service)
    projects=SyntheticProjects()
    pid=str(uuid4())
    projects.projects[pid]={'project_id':pid,'name':'QA · ниши шкафа','version':1,
        'scene':{'schema_version':2,'room':{'width':5000,'height':2700,'depth':3600,'setup_complete':True},'items':[]}}
    account={'user_id':str(uuid4()),'account_status':'active','roles':['manager'],'email_verified':True,'capabilities':{'draft_create':True}}
    errors=[]
    def request(route):
        req=route.request
        path=urlparse(req.url).path
        if not req.url.startswith(ORIGIN+'/'):
            route.abort();return
        if projects.route(route,path):return
        if path=='/api/v2/auth/me' and req.method=='GET':route.fulfill(json=account);return
        if path=='/api/v2/3d-assistant/status' and req.method=='GET':route.fulfill(json={'available':False,'remaining':0});return
        if path.startswith('/api/v2/catalogue/materials/') and req.method=='GET':
            key=path.rsplit('/',1)[1]
            route.fulfill(json={'variant_id':key,'name':'QA материал','thickness':3 if key=='fb7b270e-66ad-5411-affc-5717b1adf0d6' else 18,'kind':'material'});return
        if path.startswith('/api/') or req.method!='GET':
            errors.append('Unexpected API '+req.method+' '+path);route.abort();return
        if live:
            route.continue_();return
        response=files.get(path)
        route.fulfill(status=response.status_code,headers=dict(response.headers),body=response.content)

    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('MF_QA_CHROME') or None,
            args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            context=browser.new_context(viewport={'width':1440,'height':1000})
            context.route('**/*',request)
            page=context.new_page()
            page.set_default_timeout(7000)
            page.on('pageerror',lambda exc:errors.append(str(exc)))
            page.goto(ORIGIN+'/constructor',wait_until='domcontentloaded')
            page.locator('#planner-assistant').wait_for(state='attached',timeout=45000)
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
            page.locator('#planner-assistant').click()
            form=page.locator('#planner-assistant-dialog')
            def button(label):return form.get_by_role('button',name=label,exact=True)
            def step(n):form.locator('.assistant-steps button').nth(n-1).click()
            def choose(section,level,attr):
                form.locator(f'.wardrobe-figure [data-section="{section}"][{attr}="{level}"]').click()
            step(2);button('Две секции').click()
            choose(0,0,'data-niche')
            form.get_by_label('Чистая ширина секции 1, мм',exact=True).fill('360')
            choose(1,0,'data-niche')
            assert form.get_by_label('Чистая ширина секции 2, мм',exact=True).input_value()=='386'
            step(4);form.get_by_label('Исполнение фасада',exact=True).select_option('pair')
            step(3)
            choose(1,0,'data-shelf-index')
            form.get_by_label('От пола до низа полки, мм',exact=True).fill('650')
            choose(0,0,'data-niche');button('Добавить шуфляды').click()
            gap=form.get_by_label('Зазор между фасадами, мм',exact=True)
            gap.fill('30')
            source=form.locator('[data-bank-result]').inner_text()
            form.get_by_text('Скопировать в другую секцию',exact=True).click()
            button('Скопировать шуфляды').click()
            assert form.get_by_label('Количество шуфляд',exact=True).input_value()=='3'
            assert form.locator('[data-bank-result]').inner_text()!=source
            assert gap.input_value()=='30'
            gap.fill('20');gap.press('Enter')
            choose(0,0,'data-niche');assert gap.input_value()=='30'
            button('Разные').click()
            bottom=form.get_by_label('Высота фасада 1 снизу, мм',exact=True)
            bottom.fill('125');bottom.press('Enter')
            expect(form.locator('[data-bank-result]')).to_contain_text('по остатку')
            step(5);button('Проверить по размерам').click();button('Добавить в проект').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()')
            assert projects.writes>0
            page.evaluate('id=>MF_PLANNER.bridge.open(id)',pid)
            page.locator('#planner-assistant').click()
            form.get_by_label('Действие со шкафом').select_option('update')
            step(3);choose(0,0,'data-niche')
            assert gap.input_value()=='30' and bottom.input_value()=='125'
            gap.fill('25');gap.press('Enter');step(5)
            button('Проверить по размерам').click();button('Применить изменения').click()
            page.evaluate('()=>MF_PLANNER.bridge.save()')
            groups=projects.projects[pid]['scene']['items']
            spec=groups[0]['assistant_carcass']['spec']
            assert [b['gap'] for b in spec['drawerBanks']]==[25,20]
            assert spec['front']['autoHinges'] is True
            assert not errors,errors
            print('PASS published assets' if live else 'PASS checkout assets','· pick, size, copy, edit, save, reopen ·',len(groups),'panels')
        except Exception:
            if 'form' in locals() and form.is_visible():
                print(form.inner_text()[-2500:],flush=True)
            print('Browser errors',errors,flush=True)
            raise
        finally:browser.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--live',action='store_true')
    exercise(parser.parse_args().live)
