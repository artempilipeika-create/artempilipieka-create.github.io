"""Browser acceptance with synthetic, intercepted API writes only."""
import argparse,copy,json,os,sys
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from playwright.sync_api import sync_playwright,expect
from backend.v2.cabinet_ui import router
from backend.v2.three_d_api import Create,Update

parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,required=True);args=parser.parse_args();args.out.mkdir(parents=True,exist_ok=True)
app=FastAPI();app.include_router(router());client=TestClient(app)
base='https://project-safety.test';projects={};versions={};receipts={};errors=[];writes=[];offline=False;drop_reply=False
now=lambda:datetime.now(timezone.utc).isoformat()
def gate(route):
    global drop_reply
    req=route.request;path=urlsplit(req.url).path;method=req.method
    def reply(data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data))
    if not req.url.startswith(base+'/'):errors.append('External request: '+req.url);route.abort();return
    if path.startswith('/api/v2/3d-projects'):
        if method!='GET' and offline:route.abort();return
        parts=path.removeprefix('/api/v2/3d-projects').strip('/').split('/');pid=parts[0]
        data=json.loads(req.post_data) if req.post_data else {};rid=data.get('request_id');key=(path,method,rid)
        if rid and key in receipts:reply(receipts[key]);return
        if path=='/api/v2/3d-projects' and method=='GET':reply({'items':list(projects.values())});return
        if path=='/api/v2/3d-projects' and method=='POST':
            data=Create.model_validate(data).model_dump(mode='json');pid=str(uuid4());result={**data,'project_id':pid,'version':1,'created_at':now(),'updated_at':now()};projects[pid]=copy.deepcopy(result)
        elif pid in projects and len(parts)==1 and method=='GET':reply(projects[pid]);return
        elif pid in projects and len(parts)==1 and method=='PATCH':
            data=Update.model_validate(data).model_dump(mode='json')
            if projects[pid]['version']!=data['version']:reply({'detail':{'code':'PROJECT_3D_VERSION_CONFLICT'}},409);return
            result={**projects[pid],**data,'version':data['version']+1,'updated_at':now()};projects[pid]=copy.deepcopy(result)
        elif pid in projects and parts[1:]==['duplicate'] and method=='POST':
            new_id=str(uuid4());result={**copy.deepcopy(projects[pid]),'project_id':new_id,'version':1,'name':projects[pid]['name']+' — копия','created_at':now(),'updated_at':now()};projects[new_id]=copy.deepcopy(result)
        elif pid in projects and parts[1:]==['versions'] and method=='GET':reply({'items':list(reversed(versions.get(pid,[])))});return
        elif pid in projects and len(parts)>1 and parts[1]=='versions' and method=='POST':
            current=projects[pid]
            if current['version']!=data['version']:reply({'detail':{'code':'PROJECT_3D_VERSION_CONFLICT'}},409);return
            if len(parts)==2:
                result={**copy.deepcopy(current),'version_id':str(uuid4()),'project_version':current['version'],'kind':'named','label':data['label'],'created_at':now()};versions.setdefault(pid,[]).append(result)
            elif len(parts)==4 and parts[3]=='restore':
                target=next(v for v in versions[pid] if v['version_id']==parts[2]);versions[pid].append({**copy.deepcopy(current),'version_id':str(uuid4()),'project_version':current['version'],'kind':'before_restore','label':'Перед восстановлением','created_at':now()})
                result={**current,'name':target['name'],'scene':copy.deepcopy(target['scene']),'version':current['version']+1,'updated_at':now()};projects[pid]=copy.deepcopy(result)
            else:raise AssertionError(path)
        else:errors.append(method+' '+path);reply({},404);return
        writes.append({'method':method,'path':path,'request_id':rid});receipts[key]=copy.deepcopy(result)
        if drop_reply:drop_reply=False;route.abort();return
        reply(result,201 if method=='POST' else 200);return
    if path.startswith('/api/v2/'):
        if method!='GET':errors.append('Forbidden write: '+path);route.abort();return
        reply({'user_id':'safety-qa'} if path=='/api/v2/auth/me' else {'items':[]} if path=='/api/v2/catalogue/materials' else {'active_release':None} if path=='/api/v2/catalogue/releases' else {});return
    if path=='/ui/favicon.svg':route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg"/>');return
    response=client.get(path)
    if response.status_code!=200:errors.append(str(response.status_code)+' '+path)
    route.fulfill(status=response.status_code,headers=dict(response.headers),body=response.content)

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1500,'height':1000});context.route('**/*',gate)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    def ready():expect(page.locator('#check-project')).to_be_attached(timeout=30000)
    def saved():expect(page.locator('#studio-save-state')).to_have_text('Сохранено',timeout=12000)
    def name(value):page.locator('#project-name').fill(value)
    def menu(selector):page.locator('.studio-menu summary').click();page.locator(selector).click()
    try:
        page.goto(base+'/constructor');ready();page.locator('#room-setup-close').click()
        page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.createDraft({bazis:MF_FURNITURE_CORE.VITRINE_VARIANTS[0].id});it.item_id='qa-vitrine';it.glass_shelf_count=3;
          p.bridge.restore({name:'Проект проверки',scene:{schema_version:2,room:{width:4200,depth:3600,height:3000,setup_complete:true,survey:'none',features:[]},items:[it],selected_item_id:it.item_id,view_mode:'3d'}});}''')
        saved();assert len(projects)==1;pid=next(iter(projects));assert projects[pid]['scene']['items'][0]['glass_shelf_count']==3
        page.locator('#check-project').click();expect(page.locator('[data-code="material"]')).to_have_count(1);expect(page.locator('[data-code="native-adjustment"]')).to_have_count(1)
        page.screenshot(path=str(args.out/'project-checks.png'));page.locator('[data-code="material"] strong').click();assert page.evaluate('MF_PLANNER.adapter.selected.item_id')=='qa-vitrine'
        menu('#project-versions');page.get_by_role('button',name='Первоначальный',exact=True).click();page.locator('#project-version-save').click();expect(page.locator('.mf-version-row')).to_have_count(1)
        page.locator('#project-versions-dialog .mf-project-dialog-head button').click();name('После правок клиента');saved()
        menu('#project-versions');page.locator('.mf-version-row button').click();expect(page.locator('.mf-version-row')).to_have_count(2);expect(page.locator('#project-name')).to_have_value('Проект проверки')
        page.screenshot(path=str(args.out/'project-versions.png'));page.locator('#project-versions-dialog .mf-project-dialog-head button').click()
        # Server success followed by a lost response, then further offline edits.
        drop_reply=True;name('Ответ потерян');page.wait_for_timeout(1900);offline=True;name('Локальные правки');page.wait_for_timeout(100)
        assert page.evaluate('MF_PROJECT_SAFETY.drafts().length')>=1
        page.reload();ready();expect(page.locator('#project-drafts-dialog')).to_be_visible();page.screenshot(path=str(args.out/'project-recovery.png'))
        offline=False;page.locator('#project-drafts-dialog .mf-version-row').first.get_by_role('button',name='Восстановить',exact=True).click();saved()
        expect(page.locator('#project-name')).to_have_value('Локальные правки');assert len(projects)==1 and projects[pid]['name']=='Локальные правки'
        # A second tab saves a newer revision. The first must preserve its draft.
        other=context.new_page();other.on('pageerror',lambda e:errors.append(str(e)));other.goto(base+'/constructor');expect(other.locator('#check-project')).to_be_attached(timeout=30000);expect(other.locator('#project-name')).to_have_value('Локальные правки')
        other.locator('#project-name').fill('Из другой вкладки');expect(other.locator('#studio-save-state')).to_have_text('Сохранено',timeout=12000)
        name('Мои правки');expect(page.locator('#studio-save-state')).to_have_text('Конфликт версий',timeout=12000);assert projects[pid]['name']=='Из другой вкладки'
        page.screenshot(path=str(args.out/'project-conflict.png'));page.get_by_role('button',name='Сохранить копией',exact=True).click();saved();assert len(projects)==2
        assert projects[pid]['name']=='Из другой вкладки';other.close()
        # A restore that succeeded but lost its reply must not eat later edits.
        menu('#project-versions');page.get_by_role('button',name='Первоначальный',exact=True).click();page.locator('#project-version-save').click();expect(page.locator('#project-versions-dialog .mf-version-row')).to_have_count(1)
        page.locator('#project-versions-dialog .mf-project-dialog-head button').click();name('Перед запросом восстановления');saved()
        menu('#project-versions');drop_reply=True;page.locator('#project-versions-dialog .mf-version-row button').click()
        expect(page.locator('#project-save-warning')).to_be_visible();page.locator('#project-versions-dialog .mf-project-dialog-head button').click();name('Правки после сбоя восстановления')
        page.evaluate('MF_PROJECT_SAFETY.flush()');saved()
        assert any(d['snapshot']['name']=='Правки после сбоя восстановления' for d in page.evaluate('MF_PROJECT_SAFETY.drafts()'))
        page.evaluate('MF_PLANNER.bridge.duplicateProject()');saved();assert len(projects)==3
        page.set_viewport_size({'width':390,'height':844});page.locator('#check-project').click();page.screenshot(path=str(args.out/'project-checks-mobile.png'))
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#project-checks-dialog .mf-project-dialog-head button').click()
        assert not errors,errors
        (args.out/'report.json').write_text(json.dumps({'passed':True,'projects':len(projects),'writes':len(writes),'checks':['autosave','named version','restore + backup','lost reply recovery','two-tab conflict','save copy','restore lost reply preserves subsequent edits','warning selection','project duplication','mobile'],'errors':errors},ensure_ascii=False,indent=2))
        print((args.out/'report.json').read_text())
    except Exception:
        print({'errors':errors,'status':page.locator('#status').text_content(),'safety':page.evaluate('()=>({paused:MF_PROJECT_SAFETY.paused,pending:MF_PLANNER.history.pending,operation:MF_PROJECT_SAFETY.engine.operation,error:MF_PROJECT_SAFETY.engine.error?.message,dirty:MF_PROJECT_SAFETY.engine.dirty,name:MF_PROJECT_SAFETY.engine.snapshot.name,keys:Object.keys(localStorage)})')});page.screenshot(path=str(args.out/'failure.png'));raise
    finally:browser.close()
