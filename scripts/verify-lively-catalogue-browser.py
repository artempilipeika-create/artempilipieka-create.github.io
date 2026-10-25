"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8088'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8088,log_level='error'),daemon=True).start()
for _ in range(40):
 try:urllib.request.urlopen(base+'/constructor');break
 except OSError:time.sleep(.1)
errors=[];blocked=[];saved_responses=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('MF_TEST_BROWSER'),args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1700,'height':1100});page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:saved_responses.append(r) if '/api/v2/3d-projects' in r.url and r.request.method in ('POST','PATCH') else None)
 def gate(route):
  req=route.request
  if '/api/v2/' not in req.url:
   if req.method=='GET' and req.url.startswith(base+'/'):route.continue_();return
   blocked.append(req.url);route.abort();return
  path=req.url.split('/api/v2/')[1].split('?')[0]
  if path=='auth/me':data={'user_id':'synthetic-open-tall'}
  elif path=='3d-sales-capabilities':data={'automatic_render':False,'max_pages':5}
  elif path=='3d-projects' and req.method=='POST':data={**json.loads(req.post_data),'project_id':'synthetic-open-tall','version':1}
  elif path=='3d-projects/synthetic-open-tall' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-open-tall','version':2}
  elif path=='catalogue/materials' or path=='3d-projects':data={'items':[]}
  elif path=='3d-projects/undefined' and req.method=='PATCH':data={**json.loads(req.post_data),'project_id':'synthetic-open-tall','version':1}
  elif path=='catalogue/releases':data={'active_release':None}
  elif path.startswith('catalogue/materials/'):data={'variant_id':path.split('/')[-1],'name':'Проверочный материал','thickness':18}
  else:blocked.append(req.method+' '+path);route.abort();return
  route.fulfill(status=200,content_type='application/json',body=json.dumps(data))
 page.route('**/*',gate);page.goto(base+'/constructor');expect(page.locator('body')).to_have_attribute('data-planner-ready','true',timeout=40000)


 out=Path(os.environ.get('MF_TEST_OUTPUT','/tmp/catalogue-artwork-qa'));out.mkdir(parents=True,exist_ok=True)
 page.set_viewport_size({'width':1900,'height':1100})
 page.evaluate("""async()=>{const p=MF_PLANNER;await p.bridge.loadSnapshot({name:'Живой каталог',scene:{schema_version:2,room:{width:5000,depth:4000,height:3000,setup_complete:true,features:[]},items:[],plinths:[],selected_item_id:null,view_mode:'3d'},selectedId:null},null);p.roomSetup.projectChanged();p.history.reset();}""")
 page.locator('#studio-toggle-library').click()
 for category,count in [('base',8),('wall',2),('tall',4)]:
  page.locator('[data-module-filter='+category+']').click()
  assert page.locator('#module-catalogue .mf3d-module:visible').count()==count
  assert not page.locator('#kitchen-finishes-menu').is_visible()
  assert not page.locator('#countertop-card').is_visible()
  card=page.locator('#module-catalogue .mf3d-module:visible').first
  card.scroll_into_view_if_needed()
  assert card.bounding_box()['width']>=300
  assert card.locator('img').bounding_box()['height']>=240
  page.screenshot(path=str(out/('catalogue-'+category+'.png')))
 page.locator('[data-module-filter=base]').click()
 page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
 initial=page.evaluate('JSON.stringify(MF_PLANNER.adapter.state)')
 page.locator('[data-module-filter=finishes]').click()
 assert page.locator('#kitchen-finishes-menu').is_visible()
 assert not page.locator('#module-catalogue').is_visible()
 assert page.locator('#studio-catalog-count').inner_text()=='3 раздела'
 for tab,card in [('countertop','countertop-card'),('wall','wall-finish-card'),('plinth','plinth-card')]:
  b=page.locator('[data-finish-tab='+tab+']');b.click()
  expect(b).to_have_attribute('aria-selected','true')
  assert page.locator('#kitchen-finishes-menu>[role=tabpanel]:visible').count()==1
  expect(page.locator('#'+card)).to_be_visible()
  page.locator('#kitchen-finishes-menu').screenshot(path=str(out/('finishes-'+tab+'.png')))
 assert page.evaluate('JSON.stringify(MF_PLANNER.adapter.state)')==initial
 page.locator('[data-finish-tab=countertop]').click()
 page.locator('[data-joint=euro]').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.countertopJoint')=='euro'
 page.locator('[data-finish-tab=wall]').click();page.locator('[data-finish=skinali]').click()
 assert page.evaluate('MF_PLANNER.adapter.state.wallPanels[0].thickness')==6
 page.locator('[data-finish-tab=plinth]').click();page.get_by_label('Цоколь по расстановке',exact=True).check()
 assert page.evaluate('MF_PLANNER.adapter.state.plinths[0].automatic')
 page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.state.plinths.length')==0
 page.locator('[data-module-filter=base]').click()
 if not page.get_by_role('button',name='Фартук и настенная подсветка',exact=True).is_visible():page.locator('#studio-toggle-inspector').click()
 page.get_by_role('button',name='Фартук и настенная подсветка',exact=True).click()
 assert page.locator('#wall-finish-card').is_visible()
 expect(page.locator('[data-finish-tab=wall]')).to_have_attribute('aria-selected','true')
 page.locator('[data-module-filter=tall]').click()
 assert not page.locator('#kitchen-finishes-menu').is_visible()
 assert page.locator('#module-search').is_enabled()
 page.evaluate('MF_PLANNER.workspace.closePanels()');page.set_viewport_size({'width':390,'height':844});page.locator('#planner-mobile-catalog').click()
 card=page.locator('#module-catalogue .mf3d-module:visible').first;card.scroll_into_view_if_needed()
 assert card.bounding_box()['width']>=280 and card.locator('img').bounding_box()['height']>=260
 page.screenshot(path=str(out/'catalogue-mobile.png'))
 page.locator('[data-module-filter=finishes]').click();page.locator('[data-finish-tab=countertop]').click()
 assert page.locator('.finish-menu-tabs').evaluate('(e)=>e.scrollWidth<=e.clientWidth')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(out/'finishes-mobile.png'))
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'large_cards':14,'finishes_menu':3,'navigation_preserves_state':True,'joint_and_panel_and_plinth':True,'undo':True,'mobile_width':390,'errors':errors}))
 browser.close()
