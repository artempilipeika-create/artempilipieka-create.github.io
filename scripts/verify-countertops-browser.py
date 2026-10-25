"""Synthetic browser acceptance: all application API calls intercepted; no account/database writes."""
import json,sys,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8080'
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('MF_TEST_OUTPUT','/tmp/countertop-qa'));OUT.mkdir(parents=True,exist_ok=True)
errors=[];console=[];blocked=[];failed_resources=[]
if BASE.startswith('http://127.0.0.1'):
 import threading,time,urllib.request
 sys.path.insert(0,str(ROOT))
 from fastapi import FastAPI
 from backend.v2.cabinet_ui import router
 import uvicorn
 app=FastAPI();app.include_router(router())
 threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8080,log_level='error'),daemon=True).start()
 for attempt in range(40):
  try:urllib.request.urlopen(BASE+'/constructor');break
  except OSError:time.sleep(.1)

with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':1900,'height':1000},device_scale_factor=1)
 def gate(route):
  req=route.request
  if '/api/v2/' in req.url:
   path=req.url.split('/api/v2/',1)[1].split('?',1)[0]
   if path=='3d-projects' and req.method=='POST':
    route.fulfill(status=200,content_type='application/json',body=json.dumps({**json.loads(req.post_data),'project_id':'countertop-qa','version':1}));return
   if path=='3d-projects/countertop-qa' and req.method=='PATCH':
    route.fulfill(status=200,content_type='application/json',body=json.dumps({**json.loads(req.post_data),'project_id':'countertop-qa','version':2}));return
   if req.method!='GET':blocked.append(req.method+' '+path);route.abort();return
   data={'user_id':'countertop-qa'} if path=='auth/me' else {'items':[]} if path in ('3d-projects','catalogue/materials') else {'active_release':None} if path=='catalogue/releases' else {}
   if path.startswith('catalogue/materials/'):data={'variant_id':path.split('/')[-1],'name':'Проверочный материал','thickness':18}
   route.fulfill(status=200,content_type='application/json',body=json.dumps(data));return
  if req.method=='GET' and req.url.startswith(BASE+'/'):route.continue_();return
  if req.url.startswith('blob:'):route.continue_();return
  blocked.append(req.method+' '+req.url);route.abort()
 context.route('**/*',gate)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:console.append(e.text) if e.type=='error' else None)
 page.on('response',lambda r:failed_resources.append(r.url) if r.status>=400 else None)
 page.goto(BASE+'/constructor',wait_until='domcontentloaded')
 expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=30000)
 expect(page.locator('body')).to_have_attribute('data-planner-renderer','webgl')
 page.evaluate('''()=>{
  const p=MF_PLANNER,c=MF_FURNITURE_CORE,room={width:6200,depth:4200,height:2700,setup_complete:true,features:[]};
  const corner=c.CORNER_VARIANTS.find(v=>v.side==='left'&&v.purpose==='sink'&&v.door_count===1);
  const a=p.adapter.createDraft({bazis:corner.id});Object.assign(a,{x:-1000,z:-1400});
  p.bridge.restore({name:'Проверка столешниц',scene:{schema_version:2,room,items:[a],selected_item_id:a.item_id,view_mode:'3d',countertopSettings:{joint:'standard'}},selectedId:a.item_id});
  p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');
  window.countertopGroups=()=>MF_COUNTERTOPS.assemblies(c.kitchenRuns(p.adapter.items,p.adapter.room));
 }''')
 assert page.evaluate('countertopGroups()[0].shape')=='straight'
 page.locator('#studio-toggle-library').click()
 page.locator('#studio-toggle-inspector').click()
 page.locator('#tab-catalog').click()
 assert page.locator('#countertop-card').is_visible()
 assert page.locator('#countertop-enabled').is_checked()
 # Add the actual corner return and adjoining modules using the production placement helper.
 page.evaluate('''()=>{
  const p=MF_PLANNER,c=MF_FURNITURE_CORE,a=p.adapter.items[0];
  const b=c.cornerReturnPlacement(a,p.adapter.createDraft({bazis:'bazis.0211e4f77fc4'}));
  const d=p.adapter.createDraft({bazis:'bazis.3079d0656398'});Object.assign(d,{x:a.x+a.width/2+d.width/2,z:a.z});
  p.adapter.insert(b);p.adapter.insert(d);p.history.reset();p.scene.fit('kitchen');
 }''')
 assert page.evaluate('countertopGroups()[0].shape')=='left'
 page.locator('#countertop-card [data-joint=euro]').click()
 expect(page.locator('#countertop-card [data-joint=euro]')).to_have_attribute('aria-pressed','true')
 assert page.evaluate('MF_PLANNER.adapter.items.every(it=>it.countertopJoint==="euro")')
 assert page.evaluate('countertopGroups()[0].euro_joint_count')==1
 assert page.evaluate('MF_PLANNER.adapter.createDraft({bazis:"bazis.0211e4f77fc4"}).countertopJoint')=='euro'
 page.locator('#countertop-enabled').uncheck()
 assert page.evaluate('MF_PLANNER.adapter.selected.countertopEnabled') is False
 assert page.evaluate('MF_FURNITURE_CORE.heights(MF_PLANNER.adapter.selected).overall_height_with_worktop===MF_PLANNER.adapter.selected.height')
 saved=page.evaluate('MF_PLANNER.bridge.payload()');(OUT/'saved-scene.json').write_text(json.dumps(saved,ensure_ascii=False))
 page.locator('#planner-undo').click();expect(page.locator('#countertop-enabled')).to_be_checked()
 page.locator('#planner-redo').click();expect(page.locator('#countertop-enabled')).not_to_be_checked()
 page.evaluate('''scene=>{const p=MF_PLANNER;p.bridge.restore({name:'Восстановленный проект',scene,selectedId:scene.selected_item_id});p.history.reset()}''',saved)
 expect(page.locator('#countertop-enabled')).not_to_be_checked()
 expect(page.locator('#countertop-card [data-joint=euro]')).to_have_attribute('aria-pressed','true')
 page.locator('#countertop-enabled').check()
 with page.expect_download() as download:
  page.evaluate('MF_PLANNER.bridge.exportBazis()')
 file=OUT/'countertops.mf-bazis.json';download.value.save_as(file)
 exported=json.loads(file.read_text());assert len(exported['items'])==4
 assert exported['items'][-1]['source_file']=='Столешница _Еврозапил_Лево.38мм.fr3d'
 assert exported['kitchen_production']['native_countertops_included']==1
 assert exported['items'][-1]['position']['y']==page.evaluate('MF_PLANNER.adapter.items[0].height')
 page.locator('#mode-2d').click();page.locator('#reset-view').click();page.screenshot(path=str(OUT/'countertop-top.png'))
 page.locator('#mode-3d').click();page.screenshot(path=str(OUT/'countertop-desktop.png'))
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('MF_PLANNER.workspace.closePanels()')
 page.set_viewport_size({'width':390,'height':844});page.locator('#planner-mobile-catalog').click()
 expect(page.locator('#countertop-card')).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(OUT/'countertop-mobile.png'))
 assert not errors and not console and not blocked,dict(errors=errors,console=console,blocked=blocked,failed_resources=failed_resources)
 print(json.dumps({'ok':True,'url':BASE,'renderer':'webgl','checks':['automatic straight and left turn','ordinary/euro selection','new cabinets inherit choice','per-module off/on','undo/redo','saved payload and restore','native BAZIS JSON','desktop/mobile layout'],'errors':errors,'blocked_requests':blocked}))
 browser.close()
