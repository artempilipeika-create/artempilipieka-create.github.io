"""Read-only browser acceptance with synthetic API responses and real image assets."""
import json, os, sys, threading, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from fastapi import FastAPI
from backend.v2.cabinet_ui import router
from backend.v2.material_visuals import user_textures
from backend.v2.catalogue_model import safe_item
import uvicorn

base='http://127.0.0.1:8082'
app=FastAPI();app.include_router(router())
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8082,log_level='error'),daemon=True).start()
for _ in range(40):
    try:urllib.request.urlopen(base+'/constructor');break
    except OSError:time.sleep(.1)
records=user_textures()['variants']
materials=[safe_item({'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}},'synthetic') for uid,r in records.items() if r['article'] in ('LNEDS18D.302.W04','LNEDS18D.310.W04')]
if len(materials)<2:
    uid,r=next((uid,r) for uid,r in records.items() if r['texture_url']!=materials[0]['visual']['texture_url'])
    materials.append(safe_item({'kind':'material','variant_id':uid,**{k:r[k] for k in ('article','material_id','name','thickness','length','width')}},'synthetic'))
errors=[];blocked=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':1600,'height':1000})
    def gate(route):
        req=route.request
        if '/api/v2/' in req.url:
            if req.method!='GET':blocked.append(req.method+' '+req.url);route.abort();return
            path=req.url.split('/api/v2/',1)[1].split('?',1)[0]
            data={'user_id':'texture-qa'} if path=='auth/me' else {'items':materials} if path=='catalogue/materials' else {'items':[]} if path=='3d-projects' else {'active_release':None} if path=='catalogue/releases' else {}
            route.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
        if req.method=='GET' and req.url.startswith(base+'/'):route.continue_();return
        blocked.append(req.method+' '+req.url);route.abort()
    context.route('**/*',gate)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base+'/constructor',wait_until='domcontentloaded')
    expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
    expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
    page.evaluate('''()=>{
      const p=MF_PLANNER,c=MF_FURNITURE_CORE,room={width:6200,depth:4200,height:2700,setup_complete:true,features:[]};
      const items=[0,1,2].map(i=>Object.assign(p.adapter.createDraft({bazis:'bazis.3079d0656398'}),{name:'Шкаф '+i,x:-1400+i*600,z:-1300,production_note:'Сохранить заметку'}));
      const wall=Object.entries(c.PRODUCTION_MODELS).find(([id,m])=>m.tier==='wall')[0];
      const upper=Object.assign(p.adapter.createDraft({bazis:wall}),{x:-1400,z:-1400,name:'Верх'});items.push(upper);
      p.bridge.restore({name:'Проверка управления',scene:{schema_version:2,room,items,selected_item_id:items[0].item_id,view_mode:'3d'},selectedId:items[0].item_id});
      p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');
    }''')
    page.locator('#studio-toggle-inspector').click()
    page.locator('#move-neighbours').check()
    page.locator('#width').fill('800');page.locator('#width').press('Tab')
    assert page.evaluate('MF_PLANNER.adapter.items.slice(0,3).map(x=>x.x)')==[-1300,-600,0]
    page.locator('#planner-undo').click()
    assert page.evaluate('MF_PLANNER.adapter.items.slice(0,3).map(x=>x.x)')==[-1400,-800,-200]
    page.locator('#planner-redo').click()
    page.locator('#material-scope').select_option('lower')
    page.locator('#body-search').fill('D.302')
    expect(page.locator('#body-results .material-result').first).to_be_visible()
    expect(page.locator('#body-results img').first).to_have_js_property('naturalWidth',803)
    assert 'масштаб ориентировочный' in page.locator('#body-results .material-result').first.inner_text()
    page.locator('#body-results .material-result').first.click()
    assert page.evaluate('MF_PLANNER.adapter.items.slice(0,3).every(x=>x.body_variant_id)')
    page.locator('#module-replacement summary').click()
    page.locator('#replacement-module').select_option('bazis.5f5697e39e27')
    page.locator('#replacement-apply').click()
    assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')=='bazis.5f5697e39e27'
    assert page.evaluate('MF_PLANNER.adapter.selected.width')==800
    assert page.evaluate('MF_PLANNER.adapter.selected.production_note')=='Сохранить заметку'
    assert page.evaluate('MF_PLANNER.adapter.selected.name')=='Шкаф 0'
    page.locator('#planner-undo').click()
    assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')=='bazis.3079d0656398'
    page.locator('#planner-redo').click()
    before=page.evaluate('MF_PLANNER.bridge.payload()')
    result=page.evaluate('''()=>{const p=MF_PLANNER;const count=p.history.undoStack.length;const ok=p.interaction.nudge(10000,0);return {count,before:count,after:p.history.undoStack.length};}''')
    assert result['before']==result['after']
    assert page.evaluate('MF_PLANNER.bridge.payload()')==before
    page.evaluate("MF_PLANNER.workspace.closePanels();MF_PLANNER.setView('top');MF_PLANNER.scene.setLayer('base');MF_PLANNER.scene.fit('kitchen')")
    page.wait_for_timeout(150)
    before=page.evaluate('MF_PLANNER.bridge.payload()')
    hit=page.evaluate('''()=>{const p=MF_PLANNER,it=p.adapter.selected;const pos=p.scene.projectPoint({x:it.x,y:it.height,z:it.z});return {...pos,id:p.scene.pick(pos.x,pos.y)?.id,expected:it.item_id};}''')
    assert hit['id']==hit['expected'],hit
    page.mouse.move(hit['x'],hit['y']);page.mouse.down();page.mouse.move(hit['x']+65,hit['y']+28,steps=6);page.mouse.up()
    after=page.evaluate('MF_PLANNER.bridge.payload()')
    shifts=[(after['items'][i]['x']-before['items'][i]['x'],after['items'][i]['z']-before['items'][i]['z']) for i in range(3)]
    assert shifts[0]!=(0,0) and shifts[0]==shifts[1]==shifts[2],shifts
    assert after['items'][3]==before['items'][3]
    page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.bridge.payload()')==before
    page.locator('#planner-redo').click();assert page.evaluate('MF_PLANNER.bridge.payload()')==after
    from backend.v2.three_d_api import Scene
    Scene.model_validate(after)
    page.evaluate('''scene=>{const p=MF_PLANNER;p.bridge.restore({name:'Saved',scene,selectedId:scene.selected_item_id});p.history.reset();}''',after)
    assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')=='bazis.5f5697e39e27'
    out=Path('/tmp/mf-mobility-qa');out.mkdir(exist_ok=True)
    with page.expect_download() as download:page.evaluate('MF_PLANNER.bridge.exportBazis()')
    download.value.save_as(out/'project.mf-bazis.json')
    exported=json.loads((out/'project.mf-bazis.json').read_text())
    assert exported['items'][0]['name']=='Шкаф 0'
    assert exported['items'][0]['source_sha256']==after['items'][0]['bazis_sha256']
    page.evaluate("MF_PLANNER.scene.setLayer('all');MF_PLANNER.setView('3d');MF_PLANNER.workspace.panel('right',true)")
    page.screenshot(path=str(out/'desktop.png'))
    page.set_viewport_size({'width':390,'height':844});page.locator('#module-replacement').scroll_into_view_if_needed()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(out/'mobile.png'))
    assert not errors and not blocked,{'errors':errors,'blocked':blocked}
    print(json.dumps({'ok':True,'checks':['resize with neighbours','atomic rejection','replace and preserve','one-step undo/redo','group drag','upper remains fixed','scene schema roundtrip','native source export','material thumbnails','mobile layout'],'group_shift':shifts[0],'errors':errors,'blocked':blocked},ensure_ascii=False))
    browser.close()
