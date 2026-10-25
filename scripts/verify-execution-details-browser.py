"""Local synthetic UI test; all API calls are mocked, with no order submission."""
import json,os,sys,threading,time,urllib.request
from pathlib import Path
from fastapi import FastAPI
from playwright.sync_api import sync_playwright,expect
import uvicorn
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from backend.v2.cabinet_ui import router
app=FastAPI();app.include_router(router());base='http://127.0.0.1:8090'
threading.Thread(target=lambda:uvicorn.run(app,host='127.0.0.1',port=8090,log_level='error'),daemon=True).start()
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


 out=Path(os.environ.get('MF_TEST_OUTPUT','/tmp/execution-cards-qa'));out.mkdir(parents=True,exist_ok=True)
 page.set_viewport_size({'width':1680,'height':1100})
 page.evaluate("""async()=>{const p=MF_PLANNER;await p.bridge.loadSnapshot({name:'Исполнения модулей',scene:{schema_version:2,room:{width:6000,depth:5000,height:3000,setup_complete:true,features:[]},items:[],plinths:[],selected_item_id:null,view_mode:'3d'},selectedId:null},null);p.roomSetup.projectChanged();p.history.reset();}""")
 families=[('base','bazis.0211e4f77fc4'),('base-double','bazis.3079d0656398'),('drawer','bazis.39f282e08f0c'),('oven','bazis.9e77f4333545'),('corner','bazis.a310afbf587f'),('cargo','bazis.0ac4e1b6b2d3'),('dryer','bazis.85c150c30ea5'),('dishwasher','bazis.300138dc82b5'),('upper','bazis.858266606bc5'),('upper-double','bazis.6c187245284a')]
 more=page.evaluate("""()=>Object.entries(MF_CATALOGUE_ARTWORK).filter(([id,v])=>['open-tall-none','tall-vitrine','tall-storage','tall-appliance'].includes(v.file)).map(([id,v])=>[v.file,id])""");families+=more
 report=[]
 def load_module(id):
  page.evaluate("""id=>{const p=MF_PLANNER,it=p.adapter.createDraft({bazis:id});it.x=1000;it.z=1000;p.adapter.state.items=[it];p.adapter.select(it.item_id);p.bridge.refresh();p.history.reset();p.workspace.panel('right',true);}""",id)
  expect(page.locator('#module-execution-preview')).to_be_visible()
  page.locator('#module-execution-preview').scroll_into_view_if_needed()
  expect(page.locator('#module-execution-preview canvas')).to_have_attribute('data-preview-ready','true',timeout=30000)
 def ready_cards(root):
  for c in page.locator(root+' .execution-choice:visible:enabled canvas').all():
   if c.is_visible():c.scroll_into_view_if_needed();expect(c).to_have_attribute('data-preview-ready','true',timeout=30000)
  for img in page.locator(root+' .execution-photo:visible').all():
   img.scroll_into_view_if_needed();page.wait_for_function('(src)=>[...document.images].some(i=>i.src===src&&i.complete&&i.naturalWidth>=250)',arg=img.get_attribute('src') if img.get_attribute('src').startswith('http') else base+img.get_attribute('src'))
 def shot(root,name):
  ready_cards(root)
  for index,group in enumerate(page.locator(root+' .execution-grid:visible').all()):
   group.scroll_into_view_if_needed();group.screenshot(path=str(out/(name+'-group-'+str(index)+'.png')))
 load_module('bazis.0ac4e1b6b2d3');shot('#cargo-controls','cargo-options')
 load_module('bazis.85c150c30ea5');shot('#pullout-dryer-controls','dryer-options')
 load_module('bazis.39f282e08f0c');shot('#drawer-options-controls','drawer-options')
 page.locator('[data-drawer-option=system][data-drawer-value=slimbox]').click();page.locator('[data-drawer-option=layout][data-drawer-value=inner]').click()
 shot('#drawer-options-controls','drawer-inner-options')
 page.locator('[data-execution-view=inside]').click();page.locator('#module-execution-preview').scroll_into_view_if_needed();expect(page.locator('#module-execution-preview canvas')).to_have_attribute('data-preview-ready','true',timeout=30000);page.locator('#module-execution-preview').screenshot(path=str(out/'drawer-inner-hero.png'))
 load_module('bazis.858266606bc5');shot('#upper-options-controls','upper-options')
 load_module('bazis.a310afbf587f');shot('#corner-options-controls','corner-options')
 for family in ['open-tall-none','tall-vitrine','tall-storage','tall-appliance']:
  id=dict(families)[family];load_module(id)
  if family=='open-tall-none':page.locator('[data-open-tall-option=light_system][data-open-tall-value="aq-4x8"]').click();root='#open-tall-controls'
  elif family=='tall-vitrine':root='#vitrine-options-controls'
  else:root='#tall-options-controls'
  shot(root,family+'-options')
 # Resize updates preview caption and its pixels while retaining the selected variant.
 load_module('bazis.0211e4f77fc4');original=page.evaluate('MF_PLANNER.adapter.selected.bazis_id');page.locator('#width').fill('500');page.locator('#width').dispatch_event('change')
 page.locator('#module-execution-preview').scroll_into_view_if_needed();expect(page.locator('.execution-caption')).to_contain_text('500 ×')
 assert page.evaluate('MF_PLANNER.adapter.selected.bazis_id')==original
 expect(page.locator('#module-execution-preview canvas')).to_have_attribute('data-preview-ready','true',timeout=30000)
 page.locator('#planner-undo').click();expect(page.locator('.execution-caption')).to_contain_text('600 ×')
 # Geometry preview and source/state remain intact after save and restore.
 state=page.evaluate('MF_PLANNER.adapter.snapshot()');page.locator('#save-project').click() if page.locator('#save-project').count() else page.get_by_role('button',name='Сохранить',exact=True).click()
 page.wait_for_timeout(300)
 assert saved_responses
 page.evaluate('snapshot=>MF_PLANNER.adapter.restore(snapshot)',state)
 page.wait_for_function('MF_PLANNER.adapter.selected.width===600')
 page.set_viewport_size({'width':390,'height':844});page.evaluate("MF_PLANNER.workspace.panel('right',true)");shot('#base-options-controls','base-mobile-options')
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # Non-production modules retain their original handles selector.
 page.evaluate("""()=>{const p=MF_PLANNER,it=p.adapter.createDraft({module:'base_cabinet'});p.adapter.state.items=[it];p.adapter.select(it.item_id);p.bridge.refresh();}""")
 expect(page.locator('#module-execution-preview')).to_be_hidden()
 page.get_by_text('Компоновка и основание',exact=True).click()
 expect(page.locator('#handles')).to_be_visible()
 assert page.locator('#handles').get_attribute('aria-hidden') is None
 assert not errors and not blocked,dict(errors=errors,blocked=blocked)
 print(json.dumps({'ok':True,'detail_images':True,'resize_preview':True,'save_restore':True,'mobile':390,'errors':errors}))
 browser.close()
