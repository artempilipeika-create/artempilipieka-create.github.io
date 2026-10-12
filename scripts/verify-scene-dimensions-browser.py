"""Actual WebGL/UI acceptance; every API read/write is intercepted synthetic data."""
import copy,json,os,sys
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
from backend.v2.project_validation import project_validation_issues
out=Path('/tmp/mf-dimension-chains-qa');out.mkdir(exist_ok=True)
app=FastAPI();app.include_router(router());client=TestClient(app)
base='https://dimensions.test';projects={};errors=[];writes=[];expected_rejection=False
def gate(route):
    req=route.request;path=urlsplit(req.url).path
    def reply(data,status=200):route.fulfill(status=status,content_type='application/json',body=json.dumps(data))
    if not req.url.startswith(base+'/'):errors.append('External request '+req.url);route.abort();return
    if path.startswith('/api/v2/'):
        if path=='/api/v2/3d-projects' and req.method=='GET':reply({'items':list(projects.values())});return
        if path.startswith('/api/v2/3d-projects'):
            pid=path.rsplit('/',1)[-1]
            if req.method=='GET':reply(projects.get(pid,{}));return
            if req.method not in ('POST','PATCH'):errors.append(req.method+' '+path);route.abort();return
            body=json.loads(req.post_data)
            # Use the real server contract; a permissive fake previously hid
            # save failures even while browser acceptance reported success.
            try:(Create if req.method=='POST' else Update).model_validate(body)
            except Exception as error:
                if not expected_rejection:errors.append(str(error))
                reply({'detail':{'code':'VALIDATION_ERROR','issues':project_validation_issues(error.errors())}},422);return
            pid=str(uuid4()) if req.method=='POST' else pid
            now=datetime.now(timezone.utc).isoformat();result={**body,'project_id':pid,'version':projects.get(pid,{}).get('version',0)+1,'created_at':now,'updated_at':now}
            projects[pid]=copy.deepcopy(result);writes.append(body);reply(result);return
        if req.method!='GET':errors.append('Forbidden write '+path);route.abort();return
        reply({'user_id':'dimension-qa'} if path.endswith('auth/me') else {'items':[]} if path.endswith('catalogue/materials') else {'active_release':None} if path.endswith('catalogue/releases') else {});return
    if path=='/ui/favicon.svg':route.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg"/>');return
    response=client.get(path)
    if response.status_code!=200:errors.append(str(response.status_code)+' '+path)
    route.fulfill(status=response.status_code,headers=dict(response.headers),body=response.content)

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1500,'height':1000});context.route('**/*',gate)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    def dim(axis='width',id='lower-2'):return page.locator(f'button.dimension-label[data-item-id="{id}"][data-axis="{axis}"]')
    def edit(axis,value):
        dim(axis).click();page.locator('#dimension-editor-value').fill(str(value));page.locator('#dimension-editor button[type=submit]').click()
    def selected():return page.evaluate('MF_PLANNER.adapter.selected')
    def saved():expect(page.locator('#studio-save-state')).to_have_text('Сохранено',timeout=12000)
    def fixture(rotation=0):
        page.evaluate('''rotation=>{
          const p=MF_PLANNER,c=MF_FURNITURE_CORE,room={width:6000,depth:5000,height:2800,setup_complete:true,survey:'none',features:[]};
          const items=[0,1,2].map(i=>Object.assign(p.adapter.createDraft({bazis:'bazis.3079d0656398'}),{item_id:'lower-'+i,name:'Нижний шкаф '+(i+1),...c.rotateXZ(-600+i*600,-900,rotation),rotation}));
          const wall=Object.entries(c.PRODUCTION_MODELS).find(([id,m])=>m.tier==='wall')[0];
          items.push(Object.assign(p.adapter.createDraft({bazis:wall}),{item_id:'upper',name:'Верхний шкаф',...c.rotateXZ(-600,-980,rotation),rotation}));
          p.bridge.restore({name:'Размеры на модели',scene:{schema_version:2,room,items,selected_item_id:'lower-2',view_mode:'3d'},selectedId:'lower-2'});
          p.roomSetup.projectChanged();p.history.reset();p.workspace.closePanels();p.setView('3d');p.scene.fit('kitchen');
        }''',rotation)
        expect(dim()).to_be_visible();expect(page.locator('.dimension-run.dimension-label')).to_have_text('1800')
    try:
        page.goto(base+'/constructor');expect(page.locator('#check-project')).to_be_attached(timeout=30000)
        expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl');page.locator('#room-setup-close').click()
        fixture();saved();page.screenshot(path=str(out/'desktop.png'))
        # A rejected browser draft remains recoverable, points to the module,
        # and can synchronize once its invalid coordinate is corrected.
        expected_rejection=True
        page.evaluate('()=>{MF_PLANNER.adapter.selected.x+=0.25;MF_PLANNER.bridge.refresh();}')
        expect(page.locator('#project-save-warning')).to_contain_text('Модуль 3 · Положение X',timeout=12000)
        expect(page.get_by_role('button',name='Сохранить копией',exact=True)).to_be_hidden()
        page.get_by_role('button',name='Проверить параметры',exact=True).click()
        expect(page.locator('[data-code=server-validation]')).to_contain_text('Положение X')
        page.locator('#project-checks-dialog').get_by_role('button',name='Закрыть',exact=True).click()
        page.evaluate('()=>{MF_PLANNER.adapter.selected.x-=0.25;MF_PLANNER.bridge.refresh();}')
        saved();expect(page.locator('#project-save-warning')).to_be_hidden();expected_rejection=False
        fixture();saved()
        assert page.locator('button.dimension-label[data-axis=width]:visible').count()==4
        expect(dim('height')).to_have_text('858');expect(page.locator('.dimension-summary')).to_contain_text('Корпус 720 + Ножки 100 + Столешница 38 = 858 мм')
        before=selected();edit('width',800);expect(page.locator('#dimension-editor')).not_to_be_visible()
        assert selected()['width']==800 and selected()['x']==before['x']+100
        expect(page.locator('.dimension-run.dimension-label')).to_have_text('2000')
        assert page.evaluate('MF_PLANNER.history.undoStack.length')==1
        page.locator('#planner-undo').click();assert selected()['width']==600
        page.locator('#planner-redo').click();assert selected()['width']==800
        edit('height',900);assert selected()['height']==862 and selected()['body_height']==762
        expect(dim('height')).to_have_text('900');saved()
        assert list(projects.values())[-1]['scene']['items'][2]['height']==862
        expect(page.locator('button.dimension-label[data-axis=depth]')).to_have_count(0);assert selected()['depth']==510
        previous=page.evaluate('MF_PLANNER.bridge.payload()');count=page.evaluate('MF_PLANNER.history.undoStack.length')
        edit('width',20000);expect(page.locator('#dimension-editor-error')).to_be_visible()
        assert page.evaluate('MF_PLANNER.bridge.payload()')==previous and page.evaluate('MF_PLANNER.history.undoStack.length')==count
        page.locator('#dimension-editor-value').press('Escape');expect(page.locator('#dimension-editor')).not_to_be_visible()
        dim().click();page.locator('#dimension-editor-value').fill('700');page.locator('#dimension-editor-value').press('Escape');assert page.evaluate('MF_PLANNER.bridge.payload()')==previous
        # Input overlap rejection keeps both original cabinets and history intact.
        fixture();dim('width','lower-1').click();page.locator('#dimension-editor-value').fill('800');page.locator('#dimension-editor button[type=submit]').click()
        expect(page.locator('#dimension-editor-error')).to_be_visible();assert page.evaluate('MF_PLANNER.adapter.items.slice(0,3).map(it=>it.width)')==[600,600,600]
        page.locator('#dimension-editor-value').press('Escape')
        for rotation in [90,180,270,0]:fixture(rotation)
        page.locator('#planner-front').click();expect(dim('height')).to_be_visible();expect(dim('width','upper')).to_be_visible();page.screenshot(path=str(out/'front.png'))
        page.locator('#mode-2d').click();expect(dim('height')).to_be_hidden();page.screenshot(path=str(out/'top.png'))
        # Real pointer drag previews show measured gaps without writing before drop.
        pos=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected;return p.scene.projectPoint({x:it.x,y:it.height,z:it.z});}''')
        before=page.evaluate('MF_PLANNER.bridge.payload()')
        page.mouse.move(pos['x'],pos['y']);page.mouse.down();page.mouse.move(pos['x']+80,pos['y']+45,steps=6)
        expect(page.locator('.dimension-label.dimension-gap').first).to_be_visible();assert page.evaluate('MF_PLANNER.bridge.payload()')==before
        page.screenshot(path=str(out/'drag.png'));page.keyboard.press('Escape');page.mouse.up();assert page.evaluate('MF_PLANNER.bridge.payload()')==before
        page.locator('#planner-dimensions').click();expect(page.locator('#scene-dimensions')).to_be_hidden()
        page.locator('#planner-dimensions').click();expect(page.locator('#scene-dimensions')).to_be_visible()
        page.locator('#planner-client').click();expect(page.locator('#scene-dimensions')).to_be_hidden()
        page.locator('#planner-client').click();expect(page.locator('#scene-dimensions')).to_be_visible()
        page.wait_for_timeout(200)
        # Reference-style corner kitchen: each wall and tier has its own chain.
        page.evaluate('''()=>{
          const p=MF_PLANNER,c=MF_FURNITURE_CORE,create=()=>p.adapter.createDraft({bazis:'bazis.3079d0656398'});
          const id=c.CORNER_VARIANTS.find(v=>v.side==='right'&&v.purpose==='sink'&&v.door_count===1).id;
          const corner=Object.assign(p.adapter.createDraft({bazis:id}),{x:500,z:-900});
          const run=[0,1,2].map(i=>Object.assign(create(),{x:corner.x-corner.width/2-300-i*600,z:-900}));
          const a=c.cornerReturnPlacement(corner,create()),b={...create(),x:a.x,z:a.z+600,rotation:a.rotation};
          const wall=Object.entries(c.PRODUCTION_MODELS).find(([id,m])=>m.tier==='wall')[0];
          const uppers=run.map(it=>Object.assign(p.adapter.createDraft({bazis:wall}),{x:it.x,z:-980}));
          const items=[...run,corner,a,b,...uppers];
          p.bridge.restore({name:'Угловая кухня — размерные цепочки',scene:{schema_version:2,room:{width:6000,depth:5000,height:2800,setup_complete:true,survey:'none',features:[]},items,selected_item_id:a.item_id,view_mode:'3d'},selectedId:a.item_id});
          p.workspace.closePanels();p.setView('3d');p.scene.fit('kitchen');
        }''')
        expect(page.locator('.dimension-run.dimension-label')).to_have_count(3);expect(page.locator('button.dimension-label[data-axis=depth]')).to_have_count(0)
        assert '1828' in page.locator('.dimension-run.dimension-label').all_text_contents()
        page.locator('#mode-3d').click();page.locator('#reset-view').click();assert page.evaluate('MF_PLANNER.scene.mode')=='3d'
        expect(page.locator('.dimension-run.dimension-label:visible')).to_have_count(3);page.screenshot(path=str(out/'corner-kitchen.png'))
        fixture();page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200);page.evaluate('MF_PLANNER.workspace.closePanels()');page.locator('#reset-view').click()
        expect(dim()).to_be_visible();expect(page.locator('.dimension-run.dimension-label')).to_be_visible();page.screenshot(path=str(out/'mobile.png'));dim().click();page.screenshot(path=str(out/'mobile-editor.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.locator('#dimension-editor-value').fill('700');page.locator('#dimension-editor button[type=submit]').click();assert selected()['width']==700
        # Rendering mode failure removes overlays and an open editor cleanly.
        dim().click();page.evaluate('MF_PLANNER.fallback()');expect(page.locator('#dimension-editor')).not_to_be_visible();expect(page.locator('#scene-dimensions')).to_be_hidden()
        assert not errors,errors
        (out/'report.json').write_text(json.dumps({'passed':True,'checks':['widths + total','all four rotations','click edit width/height; no depth on scene','overall/base/top accounting','left anchor','one-step undo/redo','invalid and collision rollback','Escape cancel','autosave payload','top/front views','live drag clearances','dimensions toggle','client view','mobile edit','fallback cleanup'],'writes':len(writes),'errors':errors},ensure_ascii=False,indent=2))
        print((out/'report.json').read_text())
    except Exception:
        print({'errors':errors,'status':page.locator('#status').text_content()});page.screenshot(path=str(out/'failure.png'));raise
    finally:browser.close()
