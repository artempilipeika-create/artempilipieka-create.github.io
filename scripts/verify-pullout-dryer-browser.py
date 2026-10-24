"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8086'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8086,log_level='error'),daemon=True).start()
for _ in range(40):
 try:urllib.request.urlopen(base+'/constructor');break
 except OSError:time.sleep(.1)
errors=[];blocked=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1700,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)))
 def gate(route):
  req=route.request
  if '/api/v2/' not in req.url:
   if req.method=='GET' and req.url.startswith(base+'/'):route.continue_();return
   blocked.append(req.url);route.abort();return
  path=req.url.split('/api/v2/')[1].split('?')[0]
  if path=='auth/me':data={'user_id':'synthetic-dryer'}
  elif path=='3d-sales-capabilities':data={'automatic_render':False,'max_pages':5}
  elif path=='catalogue/materials' or path=='3d-projects':data={'items':[]}
  elif path=='3d-projects/undefined' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-dryer','version':1}
  elif path=='catalogue/releases':data={'active_release':None}
  elif path.startswith('catalogue/materials/'):data={'variant_id':path.split('/')[-1],'name':'Проверочный материал','thickness':18}
  else:blocked.append(req.method+' '+path);route.abort();return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 page.route('**/*',gate);page.goto(base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=40000)
 # Establish a synthetic scene; all subsequent edits use actual controls.
 page.evaluate('''()=>{const p=MF_PLANNER,c=MF_FURNITURE_CORE,d=MF_PULLOUT_DRYERS;
 const dryer={...p.adapter.createDraft({bazis:d.family.default_id}),item_id:'dryer',x:-900,z:0};
 const tall={...p.adapter.createDraft({bazis:c.APPLIANCE_TALL_FAMILY.default_id}),item_id:'tall',x:900,z:0};
 const upper={...p.adapter.createDraft({bazis:'bazis.877ba2f68d92'}),item_id:'upper',x:0,z:0,height:720,elevation_mm:1458};
 p.bridge.restore({name:'Проверка сушки',scene:{schema_version:2,room:{width:5000,depth:4000,height:3000,setup_complete:true,features:[]},items:[dryer,tall,upper],selected_item_id:'dryer',view_mode:'3d'},selectedId:'dryer'});p.roomSetup.projectChanged();p.history.reset();p.scene.fit('kitchen');}''')
 page.locator('#studio-toggle-inspector').click()
 expect(page.locator('#pullout-dryer-controls')).to_be_visible();expect(page.locator('#drawer-options-controls')).to_be_hidden()
 assert page.locator('#pullout-dryer-controls [data-dryer-option="width"] option').all_text_contents()==['600 мм','700 мм','800 мм']
 page.locator('[data-dryer-option="dryer_brand"]').select_option('flat_line');page.locator('[data-dryer-option="width"]').select_option('900')
 expect(page.locator('[data-dryer-option="dryer_brand"] option[value="norwing"]')).to_have_attribute('disabled','')
 page.locator('[data-dryer-option="system"]').select_option('aq');page.locator('[data-dryer-option="execution"]').select_option('gola')
 expect(page.locator('#pullout-dryer-note')).to_contain_text('95551')
 assert page.evaluate('MF_PLANNER.adapter.selected.width')==900
 page.screenshot(path='/tmp/dryer-ui.png')
 page.evaluate("MF_PLANNER.adapter.select('tall');MF_PLANNER.bridge.refresh()")
 expect(page.locator('#depth')).to_be_enabled();page.locator('#depth').fill('650');page.locator('#depth').press('Tab')
 assert page.evaluate('MF_PLANNER.adapter.selected.depth')==650
 page.locator('#tall-align-top').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.height')==2500
 # Undo alignment is available through the actual interaction history.
 page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.selected.height')==2000
 page.screenshot(path='/tmp/tall-ui.png')
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'dryer_width':900,'kit':'95551','tall_depth':650,'aligned_height':2500,'undo':True,'errors':errors}))
 browser.close()
