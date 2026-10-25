"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8087'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8087,log_level='error'),daemon=True).start()
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
 page.evaluate("""async()=>{const p=MF_PLANNER;await p.bridge.loadSnapshot({name:'Каталог Martin Forest',scene:{schema_version:2,room:{width:5000,depth:4000,height:3000,setup_complete:true,features:[]},items:[],plinths:[],selected_item_id:null,view_mode:'3d'},selectedId:null},null);p.roomSetup.projectChanged();p.history.reset();}""")
 page.locator('#studio-toggle-library').click()
 cards=page.locator('#module-catalogue .mf3d-module[data-bazis]')
 assert cards.count()==14 and page.locator('#module-catalogue [data-card-artwork=tripo]').count()==14
 for card in cards.all():
  card.scroll_into_view_if_needed()
  picture=card.locator('img.studio-preview-tripo');expect(picture).to_be_visible()
  page.wait_for_function('(url)=>[...document.images].some(i=>i.src===url&&i.complete&&i.naturalWidth>0)',arg=base+picture.get_attribute('src'))
  card.screenshot(path=str(out/(picture.get_attribute('src').split('/')[-1]+'.png')))
  assert card.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
 # Selecting the actual card still inserts the BAZIS module, with no poster geometry.
 page.locator('[data-bazis="bazis.0211e4f77fc4"]').click()
 assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')=='bazis.0211e4f77fc4'
 assert page.evaluate('MF_PLANNER.adapter.selected.width')==600
 page.locator('#countertop-card').scroll_into_view_if_needed()
 for value in ['euro','standard','euro']:
  b=page.locator('#countertop-card [data-joint='+value+']');b.click()
  expect(b).to_have_attribute('aria-pressed','true')
  expect(b).to_have_css('border-top-color','rgb(22, 119, 255)')
  assert page.evaluate('MF_PLANNER.adapter.selected.countertopJoint')==value
 page.locator('#countertop-card').screenshot(path=str(out/'countertops.png'))
 for kind,thickness in [('skinali',6),('ldsp',18),('tile',10)]:
  b=page.locator('#wall-finish-card [data-finish='+kind+']');b.click()
  expect(b).to_have_attribute('aria-pressed','true')
  assert page.locator('.wall-finish-types [aria-pressed=true]').count()==1
  assert page.evaluate('MF_PLANNER.adapter.state.wallPanels[0].kind')==kind
  assert page.evaluate('MF_PLANNER.adapter.state.wallPanels[0].thickness')==thickness
 page.locator('#planner-undo').click();assert page.evaluate('MF_PLANNER.adapter.state.wallPanels[0].kind')=='ldsp'
 page.locator('#planner-redo').click();assert page.evaluate('MF_PLANNER.adapter.state.wallPanels[0].kind')=='tile'
 page.locator('#wall-finish-card [data-finish=skinali]').click()
 assert page.locator('.countertop-choices .surface-card-photo').count()==2
 assert page.locator('.wall-finish-types .surface-card-photo').count()==3
 assert page.locator('#plinth-card .surface-hero').count()==1
 for selector in ['.countertop-choices .surface-card-photo','.wall-finish-types .surface-card-photo','#plinth-card .surface-hero']:
  for picture in page.locator(selector).all():
   picture.scroll_into_view_if_needed()
   page.wait_for_function('(url)=>[...document.images].some(i=>i.src===url&&i.complete&&i.naturalWidth>0)',arg=base+picture.get_attribute('src'))
 page.locator('.wall-finish-types').screenshot(path=str(out/'backsplash-types.png'))
 page.evaluate("MF_PLANNER.workspace.closePanels()")
 page.set_viewport_size({'width':390,'height':844});page.locator('#planner-mobile-catalog').click()
 for selector in ['.countertop-choices','.wall-finish-types']:
  box=page.locator(selector);box.scroll_into_view_if_needed();box.screenshot(path=str(out/(selector[1:]+'-mobile.png')))
  assert box.evaluate('(e)=>e.scrollWidth<=e.clientWidth+1')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'catalogue_cards':14,'surface_images':6,'native_insertion':True,'joint_selection':True,'three_finishes':True,'undo_redo':True,'mobile_width':390,'errors':errors}))
 browser.close()
